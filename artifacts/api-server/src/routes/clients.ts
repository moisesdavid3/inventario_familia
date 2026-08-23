import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { clientsTable, getDb } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireCompany } from "../middlewares/requireCompany";

const router: IRouter = Router();
router.use("/clients", requireAuth, requireCompany);

function clientResponse(client: typeof clientsTable.$inferSelect) {
  return {
    id: client.id,
    name: client.name,
    phone: client.phone,
    address: client.address,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

router.get("/clients", async (req, res): Promise<void> => {
  const clients = await getDb().select().from(clientsTable)
    .orderBy(desc(clientsTable.createdAt));
  res.json(clients.map(clientResponse));
});

router.post("/clients", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "Escribe el nombre del cliente." });
    return;
  }
  const [client] = await getDb().insert(clientsTable).values({
    companyId: req.companyId!,
    userId: req.userId!,
    name,
    phone: typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null,
    address: typeof body.address === "string" && body.address.trim() ? body.address.trim() : null,
  }).returning();
  res.status(201).json(clientResponse(client));
});

router.put("/clients/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "Escribe el nombre del cliente." });
    return;
  }
  const [existing] = await getDb().select().from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "No encontramos ese cliente." });
    return;
  }
  const [updated] = await getDb().update(clientsTable).set({
    name,
    phone: typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null,
    address: typeof body.address === "string" && body.address.trim() ? body.address.trim() : null,
    updatedAt: new Date(),
  }).where(eq(clientsTable.id, id)).returning();
  res.json(clientResponse(updated));
});

router.delete("/clients/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  const [existing] = await getDb().select().from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "No encontramos ese cliente." });
    return;
  }
  await getDb().delete(clientsTable).where(eq(clientsTable.id, id));
  res.sendStatus(204);
});

export default router;
