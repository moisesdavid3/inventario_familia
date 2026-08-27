import { Router, type IRouter } from "express";
import { and, asc, eq, ne } from "drizzle-orm";
import { getDb, suppliersTable, productsTable } from "@workspace/db";
import {
  CreateSupplierBody,
  CreateSupplierResponse,
  ListSuppliersResponse,
  UpdateSupplierBody,
  UpdateSupplierResponse,
  DeleteSupplierBody,
  DeleteSupplierResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireCompany } from "../middlewares/requireCompany";

const router: IRouter = Router();
router.use("/suppliers", requireAuth, requireCompany);

function normalize(name: string): string {
  return name.trim();
}

router.get("/suppliers", async (req, res): Promise<void> => {
  const companyId = req.companyId!;
  const db = getDb();
  const [tableRows, productRows] = await Promise.all([
    db
      .select({ id: suppliersTable.id, name: suppliersTable.name })
      .from(suppliersTable)
      .where(eq(suppliersTable.companyId, companyId))
      .orderBy(asc(suppliersTable.name)),
    db
      .selectDistinct({ name: productsTable.supplier })
      .from(productsTable)
      .where(and(eq(productsTable.companyId, companyId), ne(productsTable.supplier, ""))),
  ]);
  const productMap = new Map<string, number | null>();
  for (const r of productRows) {
    const name = r.name ? normalize(r.name) : "";
    if (name) productMap.set(name, null);
  }
  for (const r of tableRows) {
    const name = normalize(r.name);
    if (name) productMap.set(name, r.id);
  }
  const result = [...productMap.entries()]
    .map(([name, id]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(ListSuppliersResponse.parse(result));
});

router.post("/suppliers", async (req, res): Promise<void> => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Escribe el nombre del proveedor." });
    return;
  }
  const name = normalize(parsed.data.name);
  const db = getDb();
  const [existing] = await db
    .select({ id: suppliersTable.id })
    .from(suppliersTable)
    .where(and(eq(suppliersTable.companyId, req.companyId!), eq(suppliersTable.name, name)));
  if (existing) {
    res.status(400).json({ error: "Ese proveedor ya existe." });
    return;
  }
  const [created] = await db
    .insert(suppliersTable)
    .values({ companyId: req.companyId!, name })
    .returning();
  res.status(201).json(CreateSupplierResponse.parse({ id: created.id, name: created.name }));
});

router.patch("/suppliers", async (req, res): Promise<void> => {
  const parsed = UpdateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Escribe el nombre del proveedor y su nuevo nombre." });
    return;
  }
  const oldName = normalize(parsed.data.name);
  const newName = normalize(parsed.data.newName);
  const companyId = req.companyId!;
  const db = getDb();

  const [conflict] = await db
    .select({ id: suppliersTable.id })
    .from(suppliersTable)
    .where(and(eq(suppliersTable.companyId, companyId), eq(suppliersTable.name, newName), ne(suppliersTable.name, oldName)));
  if (conflict) {
    res.status(400).json({ error: "Ya existe un proveedor con ese nombre." });
    return;
  }

  const [sourceSup] = await db
    .select({ id: suppliersTable.id })
    .from(suppliersTable)
    .where(and(eq(suppliersTable.companyId, companyId), eq(suppliersTable.name, oldName)));
  if (sourceSup) {
    await db
      .update(suppliersTable)
      .set({ name: newName })
      .where(and(eq(suppliersTable.id, sourceSup.id), eq(suppliersTable.companyId, companyId)));
  }

  await db
    .update(productsTable)
    .set({ supplier: newName })
    .where(and(eq(productsTable.companyId, companyId), eq(productsTable.supplier, oldName)));

  const [row] = await db
    .select({ id: suppliersTable.id })
    .from(suppliersTable)
    .where(and(eq(suppliersTable.companyId, companyId), eq(suppliersTable.name, newName)));
  res.json(UpdateSupplierResponse.parse({ id: row?.id ?? null, name: newName }));
});

router.delete("/suppliers", async (req, res): Promise<void> => {
  const parsed = DeleteSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Indica el proveedor a borrar." });
    return;
  }
  const name = normalize(parsed.data.name);
  const companyId = req.companyId!;
  const db = getDb();

  const [sourceSup] = await db
    .select({ id: suppliersTable.id })
    .from(suppliersTable)
    .where(and(eq(suppliersTable.companyId, companyId), eq(suppliersTable.name, name)));
  if (sourceSup) {
    await db
      .delete(suppliersTable)
      .where(and(eq(suppliersTable.id, sourceSup.id), eq(suppliersTable.companyId, companyId)));
  }

  const updated = await db
    .update(productsTable)
    .set({ supplier: "" })
    .where(and(eq(productsTable.companyId, companyId), eq(productsTable.supplier, name)))
    .returning({ id: productsTable.id });

  res.json(DeleteSupplierResponse.parse({ updatedProducts: updated.length }));
});

export default router;
