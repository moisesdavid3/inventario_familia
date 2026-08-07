import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  appSettingsTable,
  db,
  inventoryMovementsTable,
  inventoryUserSettingsTable,
  productsTable,
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

export async function listProductsFor(userId: string, userEmail?: string) {
  if (isOwner(userEmail)) {
    const tereId = await resolveUserIdByEmail(TERE_EMAIL);
    if (tereId) {
      return db.select().from(productsTable).where(inArray(productsTable.userId, [userId, tereId]));
    }
  }
  return db.select().from(productsTable).where(eq(productsTable.userId, userId));
}

export async function getDeudaMoises(): Promise<number> {
  const [row] = await db.select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, DEBT_SETTING_KEY));
  return row?.value ?? 0;
}

export async function setDeudaMoises(value: number, updatedBy: string): Promise<void> {
  await db.insert(appSettingsTable)
    .values({ key: DEBT_SETTING_KEY, value, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value, updatedBy, updatedAt: new Date() },
    });
}

export function productResponse(product: typeof productsTable.$inferSelect) {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand ?? undefined,
    content: product.content ?? undefined,
    cost: product.cost,
    salePrice: product.salePrice,
    stock: product.stock,
    minimumStock: product.minimumStock,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export async function deleteProduct(productId: number, requesterId: string, requesterEmail?: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [product] = await tx.select({ id: productsTable.id, userId: productsTable.userId }).from(productsTable)
      .where(eq(productsTable.id, productId));
    if (!product) return false;
    if (!isOwner(requesterEmail) && product.userId !== requesterId) return false;
    await tx.delete(inventoryMovementsTable).where(and(
      eq(inventoryMovementsTable.userId, product.userId),
      eq(inventoryMovementsTable.productId, productId),
    ));
    await tx.delete(productsTable).where(eq(productsTable.id, productId));
    const [remaining] = await tx
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.userId, product.userId))
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

export async function ensureSeeded(userId: string): Promise<void> {
  const existing = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.userId, userId))
    .limit(1);
  if (existing.length > 0) return;
  const [settings] = await db
    .select()
    .from(inventoryUserSettingsTable)
    .where(eq(inventoryUserSettingsTable.userId, userId))
    .limit(1);
  if (settings?.demoProductsCleared) return;

  await db.transaction(async (tx) => {
    const rows = await tx
      .insert(productsTable)
      .values([
        { userId, name: "Granola artesanal", cost: 12000, salePrice: 22000, stock: 18, minimumStock: 5, isDemo: true },
        { userId, name: "Mantequilla de maní", cost: 15000, salePrice: 28000, stock: 12, minimumStock: 5, isDemo: true },
        { userId, name: "Mix de semillas", cost: 8000, salePrice: 16000, stock: 25, minimumStock: 5, isDemo: true },
      ])
      .returning();
    await tx.insert(inventoryMovementsTable).values(
      rows.map((product) => ({
        userId,
        productId: product.id,
        type: "entrada",
        quantity: product.stock,
        stockBefore: 0,
        stockAfter: product.stock,
        note: "Inventario inicial",
      })),
    );
    await tx
      .insert(inventoryUserSettingsTable)
      .values({ userId, demoProductsCleared: true, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: inventoryUserSettingsTable.userId,
        set: { demoProductsCleared: true, updatedAt: new Date() },
      });
  });
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

export function saleWhere(userId: string, range: DateRange) {
  const conditions = [eq(salesTable.userId, userId)];
  if (range.from) conditions.push(gte(salesTable.createdAt, range.from));
  if (range.to) conditions.push(lte(salesTable.createdAt, range.to));
  return and(...conditions);
}

export async function saleResponse(sale: typeof salesTable.$inferSelect) {
  const items = await db
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

export async function dashboardData(userId: string, userEmail?: string) {
  await ensureSeeded(userId);
  const products = await listProductsFor(userId, userEmail);
  const todayRange = dateRangeForPeriod("today");
  const todaySales = await db.select().from(salesTable).where(saleWhere(userId, todayRange));
  return {
    productCount: products.length,
    totalUnits: products.reduce((sum, product) => sum + product.stock, 0),
    inventoryCostValue: products.reduce((sum, product) => sum + product.cost * product.stock, 0),
    inventorySaleValue: products.reduce((sum, product) => sum + product.salePrice * product.stock, 0),
    potentialProfit: products.reduce((sum, product) => sum + (product.salePrice - product.cost) * product.stock, 0),
    todaySalesCount: todaySales.length,
    todaySalesTotal: todaySales.reduce((sum, sale) => sum + sale.total, 0),
    deudaMoisesDavid: await getDeudaMoises(),
    canEditDeudaMoises: userEmail === DEBT_OWNER_EMAIL,
    lowStockProducts: products
      .filter((product) => product.stock <= product.minimumStock)
      .map((product) => ({ id: product.id, name: product.name, stock: product.stock, minimumStock: product.minimumStock })),
  };
}

export async function salesReportData(userId: string, userEmail: string | undefined, range: DateRange) {
  await ensureSeeded(userId);
  const sales = await db.select().from(salesTable).where(saleWhere(userId, range)).orderBy(sql`${salesTable.createdAt} desc`);
  const completeSales = await Promise.all(sales.map(saleResponse));
  const counts = new Map<string, number>();
  completeSales.forEach((sale) => sale.items.forEach((item) => counts.set(item.productName, (counts.get(item.productName) ?? 0) + item.quantity)));
  const bestSellingProduct = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const products = await listProductsFor(userId, userEmail);
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