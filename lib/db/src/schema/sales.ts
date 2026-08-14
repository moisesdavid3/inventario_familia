import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const salesTable = pgTable("inventory_sales", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().default(1),
  userId: text("user_id").notNull(),
  saleNumber: integer("sale_number").notNull(),
  total: integer("total").notNull(),
  totalItems: integer("total_items").notNull(),
  estimatedProfit: integer("estimated_profit").notNull(),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  clientName: text("client_name"),
  clientPhone: text("client_phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("inventory_sales_company_created_idx").on(t.companyId, t.createdAt),
]).enableRLS();

export const creditPaymentsTable = pgTable("inventory_credit_payments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().default(1),
  saleId: integer("sale_id").notNull(),
  userId: text("user_id").notNull(),
  amount: integer("amount").notNull(),
  paymentMethod: text("payment_method"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("inventory_credit_payments_sale_id_idx").on(t.saleId),
]).enableRLS();

export const saleItemsTable = pgTable("inventory_sale_items", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id").notNull(),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  unitCost: integer("unit_cost").notNull(),
  subtotal: integer("subtotal").notNull(),
}, (t) => [
  index("inventory_sale_items_sale_id_idx").on(t.saleId),
]).enableRLS();

export const insertSaleSchema = createInsertSchema(salesTable).omit({
  id: true,
  createdAt: true,
});
export const insertCreditPaymentSchema = createInsertSchema(creditPaymentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type InsertCreditPayment = z.infer<typeof insertCreditPaymentSchema>;
export type Sale = typeof salesTable.$inferSelect;
export type SaleItem = typeof saleItemsTable.$inferSelect;
export type CreditPayment = typeof creditPaymentsTable.$inferSelect;