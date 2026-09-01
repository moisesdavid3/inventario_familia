import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { creditPaymentsTable, clientsTable, getDb, manualCreditsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireCompany } from "../middlewares/requireCompany";
import { resolveClient } from "../lib/inventory-service";

const router: IRouter = Router();
router.use(requireAuth, requireCompany);

function manualCreditResponse(credit: typeof manualCreditsTable.$inferSelect, paid: number) {
  return {
    id: credit.id,
    clientName: credit.clientName,
    clientPhone: credit.clientPhone,
    clientId: credit.clientId ?? null,
    clientCode: credit.clientCode ?? null,
    total: credit.total,
    paid,
    notes: credit.notes,
    createdAt: credit.createdAt,
    companyId: credit.companyId,
  };
}

function creditPaymentResponse(payment: typeof creditPaymentsTable.$inferSelect) {
  return {
    id: payment.id,
    saleId: payment.saleId,
    manualCreditId: payment.manualCreditId,
    amount: payment.amount,
    paymentMethod: payment.paymentMethod,
    note: payment.note,
    date: payment.createdAt,
  };
}

router.get("/manual-credits", async (req, res): Promise<void> => {
  const scope = typeof req.query.scope === "string" ? req.query.scope : "company";
  const where = scope === "all" ? undefined : eq(manualCreditsTable.companyId, req.companyId!);
  const credits = await getDb().select().from(manualCreditsTable)
    .where(where)
    .orderBy(desc(manualCreditsTable.createdAt));

  if (credits.length === 0) {
    res.json([]);
    return;
  }

  const creditIds = credits.map((c) => c.id);
  const paymentRows = await getDb()
    .select({ manualCreditId: creditPaymentsTable.manualCreditId, total: sql<number>`coalesce(sum(${creditPaymentsTable.amount}), 0)` })
    .from(creditPaymentsTable)
    .where(inArray(creditPaymentsTable.manualCreditId, creditIds))
    .groupBy(creditPaymentsTable.manualCreditId);
  const paidByCredit = new Map(paymentRows.map((r) => [r.manualCreditId, Number(r.total)]));

  res.json(credits.map((c) => manualCreditResponse(c, paidByCredit.get(c.id) ?? 0)));
});

router.post("/manual-credits", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const total = Number(body.total);
  if (!Number.isFinite(total) || total < 1) {
    res.status(400).json({ error: "El monto total debe ser mayor a 0." });
    return;
  }
  const clientName = typeof body.clientName === "string" && body.clientName.trim() ? body.clientName.trim() : null;
  const clientPhone = typeof body.clientPhone === "string" && body.clientPhone.trim() ? body.clientPhone.trim() : null;
  let clientId = typeof body.clientId === "number" ? body.clientId : null;
  let clientCode: string | null = null;
  if (clientName) {
    const client = clientId
      ? (await getDb().select().from(clientsTable).where(eq(clientsTable.id, clientId)))[0] ?? null
      : await resolveClient(req.companyId!, clientName, req.userId!, clientPhone);
    clientId = client?.id ?? clientId;
    clientCode = client?.code ?? null;
  }
  const [credit] = await getDb().insert(manualCreditsTable).values({
    companyId: req.companyId!,
    userId: req.userId!,
    clientName,
    clientPhone,
    clientId,
    clientCode,
    total: Math.round(total),
    notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
    createdAt: typeof body.date === "string" && body.date ? new Date(body.date) : undefined,
  }).returning();
  res.status(201).json(manualCreditResponse(credit, 0));
});

router.delete("/manual-credits/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  const [credit] = await getDb().select().from(manualCreditsTable)
    .where(and(eq(manualCreditsTable.id, id), eq(manualCreditsTable.companyId, req.companyId!)));
  if (!credit) {
    res.status(404).json({ error: "No encontramos ese crédito." });
    return;
  }
  await getDb().delete(creditPaymentsTable).where(eq(creditPaymentsTable.manualCreditId, id));
  await getDb().delete(manualCreditsTable).where(eq(manualCreditsTable.id, id));
  res.sendStatus(204);
});

router.post("/manual-credits/:id/credit-payment", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 1) {
    res.status(400).json({ error: "Escribe un monto válido." });
    return;
  }
  const [credit] = await getDb().select().from(manualCreditsTable)
    .where(and(eq(manualCreditsTable.id, id), eq(manualCreditsTable.companyId, req.companyId!)));
  if (!credit) {
    res.status(404).json({ error: "No encontramos ese crédito." });
    return;
  }
  const [payment] = await getDb().insert(creditPaymentsTable).values({
    companyId: req.companyId!,
    manualCreditId: id,
    userId: req.userId!,
    amount: Math.round(amount),
    paymentMethod: typeof body.paymentMethod === "string" && body.paymentMethod.trim() ? body.paymentMethod.trim() : null,
    note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
    createdAt: typeof body.date === "string" && body.date ? new Date(body.date) : undefined,
  }).returning();
  res.status(201).json(creditPaymentResponse(payment));
});

router.delete("/credit-payments/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  const [payment] = await getDb().select().from(creditPaymentsTable)
    .where(and(eq(creditPaymentsTable.id, id), eq(creditPaymentsTable.companyId, req.companyId!)));
  if (!payment) {
    res.status(404).json({ error: "No encontramos ese abono." });
    return;
  }
  await getDb().delete(creditPaymentsTable).where(eq(creditPaymentsTable.id, id));
  res.sendStatus(204);
});

router.get("/credit-payments/last", async (req, res): Promise<void> => {
  const bySale = await getDb()
    .selectDistinctOn([creditPaymentsTable.saleId], {
      saleId: creditPaymentsTable.saleId,
      date: creditPaymentsTable.createdAt,
    })
    .from(creditPaymentsTable)
    .where(and(eq(creditPaymentsTable.companyId, req.companyId!), isNotNull(creditPaymentsTable.saleId)))
    .orderBy(creditPaymentsTable.saleId, desc(creditPaymentsTable.createdAt));

  const byManual = await getDb()
    .selectDistinctOn([creditPaymentsTable.manualCreditId], {
      manualCreditId: creditPaymentsTable.manualCreditId,
      date: creditPaymentsTable.createdAt,
    })
    .from(creditPaymentsTable)
    .where(and(eq(creditPaymentsTable.companyId, req.companyId!), isNotNull(creditPaymentsTable.manualCreditId)))
    .orderBy(creditPaymentsTable.manualCreditId, desc(creditPaymentsTable.createdAt));

  const rows: { saleId: number | null; manualCreditId: number | null; date: string }[] = [];
  for (const p of bySale) rows.push({ saleId: p.saleId, manualCreditId: null, date: p.date.toISOString() });
  for (const p of byManual) rows.push({ saleId: null, manualCreditId: p.manualCreditId, date: p.date.toISOString() });
  res.json(rows);
});

router.get("/manual-credits/:id/credit-payments", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  const payments = await getDb().select().from(creditPaymentsTable)
    .where(and(eq(creditPaymentsTable.manualCreditId, id), eq(creditPaymentsTable.companyId, req.companyId!)))
    .orderBy(desc(creditPaymentsTable.createdAt));
  res.json(payments.map(creditPaymentResponse));
});

export default router;
