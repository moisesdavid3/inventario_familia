import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const suppliersTable = pgTable("inventory_suppliers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().default(1),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}).enableRLS();

export type Supplier = typeof suppliersTable.$inferSelect;
