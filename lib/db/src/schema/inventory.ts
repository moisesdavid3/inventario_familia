import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const productsTable = pgTable("inventory_products", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  brand: text("brand"),
  content: text("content"),
  cost: integer("cost").notNull(),
  salePrice: integer("sale_price").notNull(),
  stock: integer("stock").notNull().default(0),
  minimumStock: integer("minimum_stock").notNull().default(5),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const inventoryMovementsTable = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  productId: integer("product_id").notNull(),
  type: text("type").notNull(),
  quantity: integer("quantity").notNull(),
  stockBefore: integer("stock_before").notNull(),
  stockAfter: integer("stock_after").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryUserSettingsTable = pgTable("inventory_user_settings", {
  userId: text("user_id").primaryKey(),
  demoProductsCleared: boolean("demo_products_cleared").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appSettingsTable = pgTable("inventory_app_settings", {
  key: text("key").primaryKey(),
  value: integer("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;