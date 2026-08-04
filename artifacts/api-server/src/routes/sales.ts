import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db, inventoryMovementsTable, productsTable, saleItemsTable, salesTable } from "@workspace/db";
import {
  CreateSaleBody,
  CreateSaleResponse,
  GetSaleParams,
  GetSaleResponse,
  ListSalesQueryParams,
  ListSalesResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { dateRangeForPeriod, ensureSeeded, saleResponse, saleWhere } from "../lib/inventory-service";

const router: IRouter = Router();
router.use("/sales", requireAuth);

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
  const rows = await db.select().from(salesTable)
    .where(saleWhere(userId, range))
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
  const requested = new Map<number, number>();
  for (const item of parsed.data.items) {
    requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity);
  }

  const result = await db.transaction(async (tx) => {
    const products = [];
    for (const [productId, quantity] of requested.entries()) {
      const [product] = await tx.select().from(productsTable)
        .where(and(eq(productsTable.id, productId), eq(productsTable.userId, userId)));
      if (!product) return { error: "No encontramos uno de los productos." as const };
      if (product.stock < quantity) {
        return { error: `Solo hay ${product.stock} unidades disponibles de ${product.name}.` as const, conflict: true as const };
      }
      products.push({ product, quantity });
    }

    const items = products.map(({ product, quantity }) => ({
      productId: product.id,
      productName: product.name,
      quantity,
      unitPrice: product.salePrice,
      unitCost: product.cost,
      subtotal: product.salePrice * quantity,
    }));
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const estimatedProfit = items.reduce((sum, item) => sum + (item.unitPrice - item.unitCost) * item.quantity, 0);
    const [sale] = await tx.insert(salesTable).values({
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
  const [sale] = await db.select().from(salesTable)
    .where(and(eq(salesTable.id, params.data.id), eq(salesTable.userId, req.userId!)));
  if (!sale) {
    res.status(404).json({ error: "No encontramos esa venta." });
    return;
  }
  res.json(GetSaleResponse.parse(await saleResponse(sale)));
});

export default router;