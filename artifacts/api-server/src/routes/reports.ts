import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import {
  GetInventoryReportQueryParams,
  GetInventoryReportResponse,
  GetSalesReportQueryParams,
  GetSalesReportResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { dateRangeForPeriod, ensureSeeded, productResponse, salesReportData } from "../lib/inventory-service";

const router: IRouter = Router();
router.use("/reports", requireAuth);

router.get("/reports/inventory", async (req, res): Promise<void> => {
  const userId = req.userId!;
  await ensureSeeded(userId);
  const filter = typeof req.query.filter === "string" ? req.query.filter : "all";
  const parsed = GetInventoryReportQueryParams.safeParse({ filter });
  if (!parsed.success) {
    res.status(400).json({ error: "El filtro no es válido." });
    return;
  }
  const rows = await db.select().from(productsTable).where(eq(productsTable.userId, userId));
  const products = rows.filter((product) => {
    if (parsed.data.filter === "low") return product.stock <= product.minimumStock;
    if (parsed.data.filter === "empty") return product.stock === 0;
    return true;
  });
  const response = {
    products: products.map(productResponse),
    totalCostValue: products.reduce((sum, product) => sum + product.cost * product.stock, 0),
    totalSaleValue: products.reduce((sum, product) => sum + product.salePrice * product.stock, 0),
    potentialProfit: products.reduce((sum, product) => sum + (product.salePrice - product.cost) * product.stock, 0),
  };
  res.json(GetInventoryReportResponse.parse(response));
});

router.get("/reports/sales", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const period = typeof req.query.period === "string" ? req.query.period : "all";
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
  const parsed = GetSalesReportQueryParams.safeParse({ period, from, to });
  if (!parsed.success || (from && Number.isNaN(from.valueOf())) || (to && Number.isNaN(to.valueOf()))) {
    res.status(400).json({ error: "El período no es válido." });
    return;
  }
  const range = dateRangeForPeriod(parsed.data.period, from, to);
  res.json(GetSalesReportResponse.parse(await salesReportData(userId, req.userEmail, range)));
});

export default router;