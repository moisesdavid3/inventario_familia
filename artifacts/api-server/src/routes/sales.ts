import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { companiesTable, getDb, inventoryMovementsTable, productsTable, saleItemsTable, salesTable } from "@workspace/db";
import {
  CreateSaleBody,
  CreateSaleResponse,
  GetSaleParams,
  GetSaleResponse,
  ListSalesQueryParams,
  ListSalesResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireCompany } from "../middlewares/requireCompany";
import { dateRangeForPeriod, ensureSeeded, saleResponse, saleWhere } from "../lib/inventory-service";

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
  res.json(ListSalesResponse.parse(await Promise.all(rows.map(saleResponse))));
});

router.post("/sales", async (req, res): Promise<void> => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Agrega al menos un producto a la venta." });
    return;
  }
  const userId = req.userId!;
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
    const [sale] = await tx.insert(salesTable).values({
      companyId: req.companyId!,
      userId,
      total,
      totalItems,
      estimatedProfit,
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
        note: `Venta #${sale.id}`,
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
        note: `Venta #${sale.id} anulada`,
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

export default router;
