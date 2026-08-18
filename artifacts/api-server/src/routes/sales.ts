import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { companiesTable, creditPaymentsTable, getDb, inventoryMovementsTable, productsTable, saleItemsTable, salesTable } from "@workspace/db";
import {
  CreateCreditPaymentBody,
  CreateCreditPaymentParams,
  CreateCreditPaymentResponse,
  CreateSaleBody,
  CreateSaleResponse,
  GetSaleParams,
  GetSaleResponse,
  ListCreditPaymentsParams,
  ListCreditPaymentsResponse,
  ListSalesQueryParams,
  ListSalesResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireCompany } from "../middlewares/requireCompany";
import { dateRangeForPeriod, ensureSeeded, saleResponse, saleWhere, startOfDayBogota, toSaleResponse } from "../lib/inventory-service";

const router: IRouter = Router();
router.use("/sales", requireAuth, requireCompany);

function queryDates(query: Record<string, unknown>) {
  const period = typeof query.period === "string" ? query.period : "all";
  const from = typeof query.from === "string" ? new Date(query.from) : undefined;
  const to = typeof query.to === "string" ? new Date(query.to) : undefined;
  return { period, from, to };
}

router.get("/sales", async (req, res): Promise<void> => {
  const userId = req.userId!;
  await ensureSeeded(userId);
  const { period, from, to } = queryDates(req.query as Record<string, unknown>);
  const range = dateRangeForPeriod(period, from, to);
  const rows = await getDb().select().from(salesTable)
    .where(saleWhere(req.companyId!, range))
    .orderBy(desc(salesTable.createdAt));
  const saleIds = rows.map((s) => s.id);
  const allItems = saleIds.length
    ? await getDb().select().from(saleItemsTable).where(inArray(saleItemsTable.saleId, saleIds))
    : [];
  const itemsBySale = new Map<number, typeof allItems>();
  for (const item of allItems) {
    const list = itemsBySale.get(item.saleId) ?? [];
    list.push(item);
    itemsBySale.set(item.saleId, list);
  }
  const creditSaleIds = rows.filter((s) => s.paymentMethod === "Crédito").map((s) => s.id);
  const creditRows = creditSaleIds.length
    ? await getDb().select({ saleId: creditPaymentsTable.saleId, total: sql<number>`coalesce(sum(${creditPaymentsTable.amount}), 0)` }).from(creditPaymentsTable).where(inArray(creditPaymentsTable.saleId, creditSaleIds)).groupBy(creditPaymentsTable.saleId)
    : [];
  const creditBySale = new Map(creditRows.map((r) => [r.saleId, Number(r.total)]));
  res.json(ListSalesResponse.parse(rows.map((sale) => toSaleResponse(sale, itemsBySale.get(sale.id) ?? [], sale.paymentMethod === "Crédito" ? creditBySale.get(sale.id) ?? 0 : 0))));
});

router.post("/sales", async (req, res): Promise<void> => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Agrega al menos un producto a la venta." });
    return;
  }
  const userId = req.userId!;
  const saleDate = parsed.data.date ?? new Date();
  if (saleDate.getTime() > Date.now() + 60_000) {
    res.status(400).json({ error: "La fecha de la venta no puede ser futura." });
    return;
  }
  const requested = new Map<number, { quantity: number; unitPrice?: number }>();
  for (const item of parsed.data.items) {
    const existing = requested.get(item.productId);
    requested.set(item.productId, {
      quantity: (existing?.quantity ?? 0) + item.quantity,
      unitPrice: item.unitPrice ?? existing?.unitPrice,
    });
  }

  const [company] = await getDb().select().from(companiesTable).where(eq(companiesTable.id, req.companyId!));
  const allowNegative = !!company?.allowNegativeStock;

  const result = await getDb().transaction(async (tx) => {
    const products = [];
    for (const [productId, lineReq] of requested.entries()) {
      const [product] = await tx.select().from(productsTable)
        .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, req.companyId!)));
      if (!product) return { error: "No encontramos uno de los productos." as const };
      if (!allowNegative && product.stock < lineReq.quantity) {
        return { error: `Solo hay ${product.stock} unidades disponibles de ${product.name}.` as const, conflict: true as const };
      }
      products.push({ product, quantity: lineReq.quantity, unitPrice: lineReq.unitPrice });
    }

    const items = products.map(({ product, quantity, unitPrice }) => {
      const price = unitPrice ?? product.salePrice;
      return {
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice: price,
        unitCost: product.cost,
        subtotal: price * quantity,
      };
    });
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const estimatedProfit = items.reduce((sum, item) => sum + (item.unitPrice - item.unitCost) * item.quantity, 0);
    const dayStart = startOfDayBogota(saleDate);
    const [row] = await tx.select({ count: sql<number>`count(*)` }).from(salesTable)
      .where(and(eq(salesTable.companyId, req.companyId!), gte(salesTable.createdAt, dayStart)));
    const [sale] = await tx.insert(salesTable).values({
      companyId: req.companyId!,
      userId,
      saleNumber: Number(row?.count ?? 0) + 1,
      createdAt: saleDate,
      total,
      totalItems,
      estimatedProfit,
      paymentMethod: parsed.data.paymentMethod?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
      clientName: parsed.data.clientName?.trim() || null,
      clientPhone: parsed.data.clientPhone?.trim() || null,
    }).returning();
    await tx.insert(saleItemsTable).values(items.map((item) => ({ saleId: sale.id, ...item })));
    for (const { product, quantity } of products) {
      const nextStock = product.stock - quantity;
      await tx.update(productsTable).set({ stock: nextStock, updatedAt: new Date() }).where(eq(productsTable.id, product.id));
      await tx.insert(inventoryMovementsTable).values({
        companyId: req.companyId!,
        userId,
        productId: product.id,
        type: "venta",
        quantity: -quantity,
        stockBefore: product.stock,
        stockAfter: nextStock,
        note: `Venta #${sale.saleNumber}`,
      });
    }
    return { sale };
  });

  if ("error" in result) {
    res.status("conflict" in result && result.conflict ? 409 : 400).json({ error: result.error });
    return;
  }
  res.status(201).json(CreateSaleResponse.parse(await saleResponse(result.sale)));
});

router.get("/sales/:id", async (req, res): Promise<void> => {
  const params = GetSaleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "No encontramos esa venta." });
    return;
  }
  const [sale] = await getDb().select().from(salesTable)
    .where(and(eq(salesTable.id, params.data.id), eq(salesTable.companyId, req.companyId!)));
  if (!sale) {
    res.status(404).json({ error: "No encontramos esa venta." });
    return;
  }
  res.json(GetSaleResponse.parse(await saleResponse(sale)));
});

router.delete("/sales/:id", async (req, res): Promise<void> => {
  const params = GetSaleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "No encontramos esa venta." });
    return;
  }
  const deleted = await getDb().transaction(async (tx) => {
    const [sale] = await tx.select().from(salesTable)
      .where(and(eq(salesTable.id, params.data.id), eq(salesTable.companyId, req.companyId!)));
    if (!sale) return false;
    const items = await tx.select().from(saleItemsTable).where(eq(saleItemsTable.saleId, sale.id));
    for (const item of items) {
      const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, item.productId));
      if (!product) continue;
      const stockAfter = product.stock + item.quantity;
      await tx.update(productsTable)
        .set({ stock: stockAfter, updatedAt: new Date() })
        .where(eq(productsTable.id, product.id));
      await tx.insert(inventoryMovementsTable).values({
        companyId: req.companyId!,
        userId: product.userId,
        productId: product.id,
        type: "venta_anulada",
        quantity: item.quantity,
        stockBefore: product.stock,
        stockAfter,
        note: `Venta #${sale.saleNumber} anulada`,
      });
    }
    await tx.delete(saleItemsTable).where(eq(saleItemsTable.saleId, sale.id));
    await tx.delete(salesTable).where(eq(salesTable.id, sale.id));
    return true;
  });
  if (!deleted) {
    res.status(404).json({ error: "No encontramos esa venta." });
    return;
  }
  res.sendStatus(204);
});

function creditPaymentResponse(payment: typeof creditPaymentsTable.$inferSelect) {
  return {
    id: payment.id,
    saleId: payment.saleId,
    amount: payment.amount,
    paymentMethod: payment.paymentMethod,
    note: payment.note,
    date: payment.createdAt,
  };
}

router.post("/sales/:id/credit-payment", async (req, res): Promise<void> => {
  const params = CreateCreditPaymentParams.safeParse(req.params);
  const parsed = CreateCreditPaymentBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Datos inválidos para el abono." });
    return;
  }
  const [sale] = await getDb().select().from(salesTable)
    .where(and(eq(salesTable.id, params.data.id), eq(salesTable.companyId, req.companyId!)));
  if (!sale) {
    res.status(404).json({ error: "No encontramos esa venta." });
    return;
  }
  const [payment] = await getDb().insert(creditPaymentsTable).values({
    companyId: req.companyId!,
    saleId: sale.id,
    userId: req.userId!,
    amount: parsed.data.amount,
    paymentMethod: parsed.data.paymentMethod?.trim() || null,
    note: parsed.data.note?.trim() || null,
  }).returning();
  res.status(201).json(CreateCreditPaymentResponse.parse(creditPaymentResponse(payment)));
});

router.get("/sales/:id/credit-payments", async (req, res): Promise<void> => {
  const params = ListCreditPaymentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "ID de venta inválido." });
    return;
  }
  const payments = await getDb().select().from(creditPaymentsTable)
    .where(and(eq(creditPaymentsTable.saleId, params.data.id), eq(creditPaymentsTable.companyId, req.companyId!)))
    .orderBy(desc(creditPaymentsTable.createdAt));
  res.json(ListCreditPaymentsResponse.parse(payments.map(creditPaymentResponse)));
});

export default router;
