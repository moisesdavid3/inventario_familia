import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { getDb, productsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/store/products", async (req, res): Promise<void> => {
  const companyParam = (req.query.company as string) || "prema";
  const companyId = Number(companyParam);
  const rows = await getDb()
    .select({
      id: productsTable.id,
      name: productsTable.name,
      category: productsTable.category,
      content: productsTable.content,
      description: productsTable.description,
      imageUrl: productsTable.imageUrl,
      salePrice: productsTable.salePrice,
      stock: productsTable.stock,
    })
    .from(productsTable)
    .where(companyId ? eq(productsTable.companyId, companyId) : undefined);
  res.json(rows);
});

export default router;
