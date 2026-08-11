import { and, eq } from "drizzle-orm";
import { companyMembersTable, getDb } from "@workspace/db";
import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      companyId?: number;
    }
  }
}

export async function requireCompany(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers["x-company-id"];
  const companyId = typeof header === "string" ? Number(header) : NaN;

  if (!header || !Number.isInteger(companyId) || companyId <= 0) {
    res.status(400).json({ error: "Selecciona una empresa para continuar." });
    return;
  }
  if (!req.userId) {
    res.status(401).json({ error: "Necesitas iniciar sesión para continuar." });
    return;
  }

  const [membership] = await getDb()
    .select({ userId: companyMembersTable.userId })
    .from(companyMembersTable)
    .where(and(
      eq(companyMembersTable.companyId, companyId),
      eq(companyMembersTable.userId, req.userId),
    ));

  if (!membership) {
    res.status(403).json({ error: "No tienes acceso a esa empresa." });
    return;
  }

  req.companyId = companyId;
  next();
}
