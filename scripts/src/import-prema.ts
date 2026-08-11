import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { getDb, productsTable } from "@workspace/db";

const PREMA_COMPANY_ID = 2;
const TERE_USER_ID = "4fe43397-f22e-465a-965c-240c5aee7ca6";
const DEFAULT_MINIMUM_STOCK = 5;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function parsePrice(raw: string): number {
  const cleaned = raw.replace(/[^0-9.,]/g, "");
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\.(?=\d{3}(?:\.\d{3})*$)/g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value) : 0;
}

async function main() {
  const db = getDb();
  const dryRun = process.argv.includes("--dry-run");
  const csvPath = process.argv.slice(2).filter((arg) => !arg.startsWith("--"))[0] ?? resolve("attached_assets/productos_prema.csv");
  const text = readFileSync(csvPath, "utf8");
  const rows = parseCsv(text);
  const header = rows[0].map((cell) => cell.trim());
  const indexOf = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iName = indexOf("Producto");
  const iCategory = indexOf("Categoría");
  const iPrice = indexOf("Precio (COP)");
  const iContent = indexOf("Contenido");
  const iDescription = indexOf("Descripción");

  if (iName === -1 || iPrice === -1) {
    throw new Error(`El CSV no tiene las columnas esperadas (Producto, Precio). Header: ${header.join(", ")}`);
  }

  const existing = await db
    .select({ name: productsTable.name, content: productsTable.content })
    .from(productsTable)
    .where(eq(productsTable.companyId, PREMA_COMPANY_ID));
  const existingKeys = new Set(existing.map((p) => `${p.name}|${p.content ?? ""}`.toLowerCase().trim()));

  const seen = new Set<string>();
  const toInsert: (typeof productsTable.$inferInsert)[] = [];
  const skipped: string[] = [];

  for (const row of rows.slice(1)) {
    const name = (row[iName] ?? "").trim();
    if (!name) continue;
    const content = iContent >= 0 ? (row[iContent] ?? "").trim() : undefined;
    const category = iCategory >= 0 ? (row[iCategory] ?? "").trim() : undefined;
    const description = iDescription >= 0 ? (row[iDescription] ?? "").trim() : undefined;
    const salePrice = iPrice >= 0 ? parsePrice(row[iPrice]) : 0;
    const key = `${name}|${content ?? ""}`.toLowerCase().trim();

    if (existingKeys.has(key)) {
      skipped.push(`${name} (ya existe)`);
      continue;
    }
    if (seen.has(key)) {
      skipped.push(`${name} (duplicado en el CSV)`);
      continue;
    }
    seen.add(key);
    toInsert.push({
      companyId: PREMA_COMPANY_ID,
      userId: TERE_USER_ID,
      name,
      category: category || null,
      content: content || null,
      description: description || null,
      cost: 0,
      salePrice,
      stock: 0,
      minimumStock: DEFAULT_MINIMUM_STOCK,
      isDemo: false,
    });
  }

  if (toInsert.length === 0) {
    console.log("Nada que importar. Todos los productos ya existen o el CSV está vacío.");
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] Se importarían ${toInsert.length} productos a Prema (empresa ${PREMA_COMPANY_ID}):`);
    for (const product of toInsert.slice(0, 20)) {
      console.log(`  ${product.name} | ${product.category ?? "sin categoría"} | ${product.content ?? ""} | $${product.salePrice}`);
    }
    if (toInsert.length > 20) console.log(`  ... y ${toInsert.length - 20} más`);
    console.log(`Omitidos ${skipped.length} (${skipped.slice(0, 5).join("; ")}...)`);
    return;
  }

  const inserted = await db
    .insert(productsTable)
    .values(toInsert)
    .returning({ id: productsTable.id, name: productsTable.name });
  await db.execute(sql`SELECT setval('inventory_products_id_seq', GREATEST((SELECT MAX(id) FROM inventory_products), 1))`);

  console.log(`Importados ${inserted.length} productos a Prema (empresa ${PREMA_COMPANY_ID}):`);
  for (const product of inserted) console.log(`  #${product.id} ${product.name}`);
  console.log(`Omitidos ${skipped.length}:`);
  for (const reason of skipped.slice(0, 30)) console.log(`  - ${reason}`);
  if (skipped.length > 30) console.log(`  ... y ${skipped.length - 30} más`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(() => process.exit(0));
