import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { companiesTable, companyMembersTable, getDb } from "@workspace/db";
import { ListCompaniesResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
router.use("/companies", requireAuth);

router.get("/companies", async (req, res): Promise<void> => {
  const rows = await getDb()
    .select({ id: companiesTable.id, name: companiesTable.name, slug: companiesTable.slug })
    .from(companyMembersTable)
    .innerJoin(companiesTable, eq(companiesTable.id, companyMembersTable.companyId))
    .where(eq(companyMembersTable.userId, req.userId!))
    .orderBy(asc(companiesTable.id));
  res.json(ListCompaniesResponse.parse(rows));
});

export default router;
