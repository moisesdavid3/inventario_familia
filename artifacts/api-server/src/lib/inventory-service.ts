import { and, eq, gte, lte, sql } from "drizzle-orm";
import {
  appSettingsTable,
  getDb,
  inventoryMovementsTable,
  inventoryUserSettingsTable,
  productsTable,
  purchaseItemsTable,
  purchasesTable,
  saleItemsTable,
  salesTable,
} from "@workspace/db";

export type DateRange = { from?: Date; to?: Date };

export const OWNER_EMAIL = "moisesdavid3@gmail.com";
export const DEBT_OWNER_EMAIL = OWNER_EMAIL;
export const TERE_EMAIL = "teregaloza@gmail.com";
const DEBT_SETTING_KEY = "deuda_moises_david";

export function isOwner(userEmail?: string): boolean {
  return userEmail === OWNER_EMAIL;
}

const userIdByEmailCache = new Map<string, string>();

export async function resolveUserIdByEmail(email: string): Promise<string | undefined> {
  const cached = userIdByEmailCache.get(email);
  if (cached) return cached;
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return undefined;
  try {
    const res = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { users?: { id: string; email?: string }[] };
    const found = data.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    const id = found?.id;
    if (id) userIdByEmailCache.set(email, id);
    return id;
  } catch {
    return undefined;
  }
}

export async function listAllProducts(companyId: number) {
  return getDb().select().from(productsTable)
    .where(eq(productsTable.companyId, companyId));
}

export async function getDeudaMoises(companyId: number): Promise<number> {
  const [row] = await getDb().select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(and(
      eq(appSettingsTable.companyId, companyId),
      eq(appSettingsTable.key, DEBT_SETTING_KEY),
    ));
  return row?.value ?? 0;
}

export async function setDeudaMoises(companyId: number, value: number, updatedBy: string): Promise<void> {
  await getDb().insert(appSettingsTable)
    .values({ companyId, key: DEBT_SETTING_KEY, value, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [appSettingsTable.companyId, appSettingsTable.key],
      set: { value, updatedBy, updatedAt: new Date() },
    });
}

export function productResponse(product: typeof productsTable.$inferSelect) {
  return {
    id: product.id,
    name: product.name,
    supplier: product.supplier ?? undefined,
    category: product.category ?? undefined,
    content: product.content ?? undefined,
    description: product.description ?? undefined,
    cost: product.cost,
    salePrice: product.salePrice,
    stock: product.stock,
    minimumStock: product.minimumStock,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export async function deleteProduct(productId: number, companyId: number): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const [product] = await tx.select({ id: productsTable.id, userId: productsTable.userId }).from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.companyId, companyId)));
    if (!product) return false;
    await tx.delete(inventoryMovementsTable).where(and(
      eq(inventoryMovementsTable.companyId, companyId),
      eq(inventoryMovementsTable.productId, productId),
    ));
    await tx.delete(productsTable).where(and(
      eq(productsTable.id, productId),
      eq(productsTable.companyId, companyId),
    ));
    const [remaining] = await tx
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(and(
        eq(productsTable.userId, product.userId),
        eq(productsTable.companyId, companyId),
      ))
      .limit(1);
    if (!remaining) {
      await tx
        .insert(inventoryUserSettingsTable)
        .values({ userId: product.userId, demoProductsCleared: true, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: inventoryUserSettingsTable.userId,
          set: { demoProductsCleared: true, updatedAt: new Date() },
        });
    }
    return true;
  });
}

export async function ensureSeeded(_userId: string): Promise<void> {
  return;
}

export function dateRangeForPeriod(period: string, from?: Date, to?: Date): DateRange {
  const now = new Date();
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  if (from || to) return { from, to };
  if (period === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (period === "last7") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { from: startOfDay(start), to: endOfDay(now) };
  }
  if (period === "thisMonth") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
  }
  if (period === "previousMonth") {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
    };
  }
  return {};
}

export function saleWhere(companyId: number, range: DateRange) {
  const conditions = [eq(salesTable.companyId, companyId)];
  if (range.from) conditions.push(gte(salesTable.createdAt, range.from));
  if (range.to) conditions.push(lte(salesTable.createdAt, range.to));
  return and(...conditions);
}

export function purchaseWhere(companyId: number, range: DateRange) {
  const conditions = [eq(purchasesTable.companyId, companyId)];
  if (range.from) conditions.push(gte(purchasesTable.purchaseDate, range.from));
  if (range.to) conditions.push(lte(purchasesTable.purchaseDate, range.to));
  return and(...conditions);
}

export async function purchaseResponse(purchase: typeof purchasesTable.$inferSelect) {
  const items = await getDb()
    .select()
    .from(purchaseItemsTable)
    .where(eq(purchaseItemsTable.purchaseId, purchase.id));
  return {
    id: purchase.id,
    date: purchase.purchaseDate,
    supplier: purchase.supplier ?? null,
    invoiceNumber: purchase.invoiceNumber ?? null,
    total: purchase.total,
    totalItems: purchase.totalItems,
    items: items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitCost: item.unitCost,
      subtotal: item.subtotal,
    })),
  };
}

export async function saleResponse(sale: typeof salesTable.$inferSelect) {
  const items = await getDb()
    .select()
    .from(saleItemsTable)
    .where(eq(saleItemsTable.saleId, sale.id));
  return {
    id: sale.id,
    date: sale.createdAt,
    total: sale.total,
    totalItems: sale.totalItems,
    estimatedProfit: sale.estimatedProfit,
    items: items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
      subtotal: item.subtotal,
    })),
  };
}

export async function dashboardData(userId: string, companyId: number, userEmail?: string) {
  await ensureSeeded(userId);
  const products = await listAllProducts(companyId);
  const todayRange = dateRangeForPeriod("today");
  const todaySales = await getDb().select().from(salesTable).where(saleWhere(companyId, todayRange));
  return {
    productCount: products.length,
    totalUnits: products.reduce((sum, product) => sum + product.stock, 0),
    inventoryCostValue: products.reduce((sum, product) => sum + product.cost * product.stock, 0),
    inventorySaleValue: products.reduce((sum, product) => sum + product.salePrice * product.stock, 0),
    potentialProfit: products.reduce((sum, product) => sum + (product.salePrice - product.cost) * product.stock, 0),
    todaySalesCount: todaySales.length,
    todaySalesTotal: todaySales.reduce((sum, sale) => sum + sale.total, 0),
    deudaMoisesDavid: await getDeudaMoises(companyId),
    canEditDeudaMoises: userEmail === DEBT_OWNER_EMAIL,
    lowStockProducts: products
      .filter((product) => product.stock <= product.minimumStock)
      .map((product) => ({ id: product.id, name: product.name, stock: product.stock, minimumStock: product.minimumStock })),
  };
}

export async function salesReportData(userId: string, companyId: number, userEmail: string | undefined, range: DateRange) {
  await ensureSeeded(userId);
  const sales = await getDb().select().from(salesTable).where(saleWhere(companyId, range)).orderBy(sql`${salesTable.createdAt} desc`);
  const completeSales = await Promise.all(sales.map(saleResponse));
  const counts = new Map<string, number>();
  completeSales.forEach((sale) => sale.items.forEach((item) => counts.set(item.productName, (counts.get(item.productName) ?? 0) + item.quantity)));
  const bestSellingProduct = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const products = await listAllProducts(companyId);
  return {
    sales: completeSales,
    totalSold: completeSales.reduce((sum, sale) => sum + sale.total, 0),
    saleCount: completeSales.length,
    itemCount: completeSales.reduce((sum, sale) => sum + sale.totalItems, 0),
    estimatedProfit: completeSales.reduce((sum, sale) => sum + sale.estimatedProfit, 0),
    bestSellingProduct,
    lowStockProducts: products
      .filter((product) => product.stock <= product.minimumStock)
      .map((product) => ({ id: product.id, name: product.name, stock: product.stock, minimumStock: product.minimumStock })),
  };
}
