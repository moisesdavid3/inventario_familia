import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const stockoutsTable = pgTable("inventory_stockouts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().default(1),
  userId: text("user_id").notNull(),
  stockoutDate: timestamp("stockout_date", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const stockoutItemsTable = pgTable("inventory_stockout_items", {
  id: serial("id").primaryKey(),
  stockoutId: integer("stockout_id").notNull(),
  productId: integer("product_id").notNull(),
  productCode: text("product_code"),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitCost: integer("unit_cost").notNull(),
  reason: text("reason"),
  note: text("note"),
}).enableRLS();

export const insertStockoutSchema = createInsertSchema(stockoutsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertStockout = z.infer<typeof insertStockoutSchema>;
export type Stockout = typeof stockoutsTable.$inferSelect;
export type StockoutItem = typeof stockoutItemsTable.$inferSelect;