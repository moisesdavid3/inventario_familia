import { boolean, integer, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  nit: text("nit"),
  address: text("address"),
  phone: text("phone"),
  allowNegativeStock: boolean("allow_negative_stock").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}).enableRLS();

export const companyMembersTable = pgTable(
  "company_members",
  {
    companyId: integer("company_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.userId] })],
).enableRLS();

export type Company = typeof companiesTable.$inferSelect;
export type CompanyMember = typeof companyMembersTable.$inferSelect;
