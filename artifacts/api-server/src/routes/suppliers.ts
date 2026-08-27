import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { getDb, suppliersTable } from "@workspace/db";
import { CreateSupplierBody, CreateSupplierResponse, ListSuppliersResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireCompany } from "../middlewares/requireCompany";

const router: IRouter = Router();
router.use("/suppliers", requireAuth, requireCompany);

router.get("/suppliers", async (req, res): Promise<void> => {
  const rows = await getDb()
    .select()
    .from(suppliersTable)
    .where(eq(suppliersTable.companyId, req.companyId!))
    .orderBy(asc(suppliersTable.name));
  res.json(ListSuppliersResponse.parse(rows));
});

router.post("/suppliers", async (req, res): Promise<void> => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Escribe el nombre del proveedor." });
    return;
  }
  const name = parsed.data.name.trim();
  const [existing] = await getDb()
    .select({ id: suppliersTable.id })
    .from(suppliersTable)
    .where(and(eq(suppliersTable.companyId, req.companyId!), eq(suppliersTable.name, name)));
  if (existing) {
    res.status(400).json({ error: "Ese proveedor ya existe." });
    return;
  }
  const [created] = await getDb()
    .insert(suppliersTable)
    .values({ companyId: req.companyId!, name })
    .returning();
  res.status(201).json(CreateSupplierResponse.parse(created));
});

router.patch("/suppliers/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Escribe el nombre del proveedor." });
    return;
  }
  const name = parsed.data.name.trim();
  const [existing] = await getDb()
    .select({ id: suppliersTable.id })
    .from(suppliersTable)
    .where(and(eq(suppliersTable.companyId, req.companyId!), eq(suppliersTable.name, name)));
  if (existing && existing.id !== id) {
    res.status(400).json({ error: "Ese proveedor ya existe." });
    return;
  }
  const [updated] = await getDb()
    .update(suppliersTable)
    .set({ name })
    .where(and(eq(suppliersTable.id, id), eq(suppliersTable.companyId, req.companyId!)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Proveedor no encontrado." });
    return;
  }
  res.json(CreateSupplierResponse.parse(updated));
});

router.delete("/suppliers/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [deleted] = await getDb()
    .delete(suppliersTable)
    .where(and(eq(suppliersTable.id, id), eq(suppliersTable.companyId, req.companyId!)))
    .returning({ id: suppliersTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Proveedor no encontrado." });
    return;
  }
  res.status(204).end();
});

export default router;
