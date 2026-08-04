import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, inventoryMovementsTable, inventoryUserSettingsTable, productsTable } from "@workspace/db";
import {
  AddInventoryBody,
  AddInventoryParams,
  AddInventoryResponse,
  CreateProductBody,
  CreateProductResponse,
  ListProductsResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { ensureSeeded, productResponse } from "../lib/inventory-service";

const router: IRouter = Router();
router.use("/products", requireAuth);

router.get("/products", async (req, res): Promise<void> => {
  const userId = req.userId!;
  await ensureSeeded(userId);
  const rows = await db.select().from(productsTable).where(eq(productsTable.userId, userId));
  res.json(ListProductsResponse.parse(rows.map(productResponse)));
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Revisa los datos del producto e inténtalo nuevamente." });
    return;
  }
  const userId = req.userId!;
  const [product] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(productsTable).values({
      userId,
      name: parsed.data.name.trim(),
      cost: parsed.data.cost,
      salePrice: parsed.data.salePrice,
      stock: parsed.data.initialStock,
      minimumStock: parsed.data.minimumStock ?? 5,
    }).returning();
    await tx.insert(inventoryMovementsTable).values({
      userId,
      productId: created.id,
      type: "entrada",
      quantity: created.stock,
      stockBefore: 0,
      stockAfter: created.stock,
      note: "Inventario inicial",
    });
    return [created];
  });
  res.status(201).json(CreateProductResponse.parse(productResponse(product)));
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Revisa los datos e inténtalo nuevamente." });
    return;
  }
  const [product] = await db.update(productsTable)
    .set({ ...parsed.data, name: parsed.data.name?.trim(), updatedAt: new Date() })
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.userId, req.userId!)))
    .returning();
  if (!product) {
    res.status(404).json({ error: "No encontramos ese producto." });
    return;
  }
  res.json(UpdateProductResponse.parse(productResponse(product)));
});

router.post("/products/:id/inventory", async (req, res): Promise<void> => {
  const params = AddInventoryParams.safeParse(req.params);
  const parsed = AddInventoryBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Indica una cantidad válida para agregar." });
    return;
  }
  const userId = req.userId!;
  const result = await db.transaction(async (tx) => {
    const [product] = await tx.select().from(productsTable)
      .where(and(eq(productsTable.id, params.data.id), eq(productsTable.userId, userId)));
    if (!product) return null;
    const [updated] = await tx.update(productsTable)
      .set({ stock: product.stock + parsed.data.quantity, updatedAt: new Date() })
      .where(eq(productsTable.id, product.id))
      .returning();
    await tx.insert(inventoryMovementsTable).values({
      userId,
      productId: product.id,
      type: "entrada",
      quantity: parsed.data.quantity,
      stockBefore: product.stock,
      stockAfter: updated.stock,
      note: parsed.data.note?.trim() || null,
    });
    return updated;
  });
  if (!result) {
    res.status(404).json({ error: "No encontramos ese producto." });
    return;
  }
  res.json(AddInventoryResponse.parse(productResponse(result)));
});

router.delete("/products/demo", async (req, res): Promise<void> => {
  const userId = req.userId!;
  await db.transaction(async (tx) => {
    const demoProducts = await tx.select({ id: productsTable.id })
      .from(productsTable)
      .where(and(eq(productsTable.userId, userId), eq(productsTable.isDemo, true)));
    if (demoProducts.length > 0) {
      const ids = demoProducts.map(({ id }) => id);
      for (const id of ids) {
        await tx.delete(inventoryMovementsTable).where(and(
          eq(inventoryMovementsTable.userId, userId),
          eq(inventoryMovementsTable.productId, id),
        ));
        await tx.delete(productsTable).where(and(
          eq(productsTable.userId, userId),
          eq(productsTable.id, id),
        ));
      }
    }
    await tx
      .insert(inventoryUserSettingsTable)
      .values({ userId, demoProductsCleared: true, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: inventoryUserSettingsTable.userId,
        set: { demoProductsCleared: true, updatedAt: new Date() },
      });
  });
  res.sendStatus(204);
});

router.get("/dashboard", requireAuth, async (req, res): Promise<void> => {
  const { dashboardData } = await import("../lib/inventory-service");
  res.json(dashboardData(req.userId!));
});

export default router;