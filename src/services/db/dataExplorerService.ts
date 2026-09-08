import { createServerFn } from "@tanstack/react-start";

/** Tables the Natural-Language Data Explorer is allowed to query, and a
 * short column description used to build the AI prompt's schema context.
 * Keep this list in sync with `schema.ts` — anything not listed here can
 * never be selected, even if the AI hallucinates a query against it (see
 * `validateReadOnlySql`), so secrets-adjacent tables like `api_keys` and
 * `webhooks` are intentionally excluded. */
export const EXPLORABLE_TABLES: { name: string; columns: string }[] = [
  {
    name: "todos",
    columns:
      "id, title, description, solution, status (pending/in_progress/done), priority (low/medium/high), due_date, completed_at, parent_id, changelog_entry_id, created_at, updated_at",
  },
  {
    name: "inventory_items",
    columns:
      "id, name, description, sku, category, quantity, price, status (active/inactive/discontinued), created_at, updated_at",
  },
  {
    name: "audit_logs",
    columns: "id, status, action, resource, page, category, created_at",
  },
  {
    name: "error_logs",
    columns: "id, message, severity, source, resolved, created_at",
  },
  {
    name: "changelog_entries",
    columns:
      "id, version, type (feature/fix/improvement/breaking/security), title, description, release_date, created_at",
  },
  {
    name: "storage_files",
    columns: "id, key, file_name, folder, content_type, size, tags, created_at",
  },
  {
    name: "csv_import_batches",
    columns:
      "id, file_name, target_table (inventory/generic), total_rows, inserted_rows, updated_rows, skipped_rows, status, created_at",
  },
];

const ALLOWED_TABLE_NAMES = new Set(EXPLORABLE_TABLES.map((t) => t.name));

/** Builds the compact schema description sent to the AI model so it can
 * translate a plain-English question into SQL against these tables. */
export function buildSchemaContext(): string {
  return EXPLORABLE_TABLES.map((t) => `${t.name}(${t.columns})`).join("\n");
}

class UnsafeQueryError extends Error {}

/** Rejects anything that isn't a single, simple read-only SELECT against an
 * allow-listed table. Not a full SQL parser — a deliberately conservative
 * gate, since the input originates from an AI model's guess, not the user
 * directly. */
function validateReadOnlySql(rawSql: string): string {
  const trimmed = rawSql.trim().replace(/;\s*$/, "");
  if (!trimmed) throw new UnsafeQueryError("No query was generated.");
  if (!/^select\b/i.test(trimmed)) {
    throw new UnsafeQueryError("Only SELECT queries are allowed.");
  }
  if (/;/.test(trimmed)) {
    throw new UnsafeQueryError("Multiple statements are not allowed.");
  }
  const forbidden =
    /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|call|copy)\b/i;
  if (forbidden.test(trimmed)) {
    throw new UnsafeQueryError("Query contains a disallowed keyword.");
  }
  const tableRefs = [
    ...trimmed.matchAll(/\b(?:from|join)\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi),
  ].map((m) => m[1].toLowerCase());
  if (tableRefs.length === 0) {
    throw new UnsafeQueryError("Couldn't determine which table to query.");
  }
  for (const table of tableRefs) {
    if (!ALLOWED_TABLE_NAMES.has(table)) {
      throw new UnsafeQueryError(
        `Table "${table}" isn't available to the Data Explorer.`,
      );
    }
  }
  return trimmed;
}

/** Rows returned to the browser in one Data Explorer query, regardless of
 * what the AI-generated SQL asked for — keeps a single query bounded even
 * if the model omits (or writes a very large) LIMIT itself. */
const MAX_RESULT_ROWS = 500;

/** Appends a `LIMIT` to a validated SELECT if it doesn't already have one,
 * so every query is bounded server-side rather than trusting the AI's
 * generated SQL to include a reasonable cap. */
function enforceRowLimit(safeSql: string): string {
  if (/\blimit\s+\d+/i.test(safeSql)) return safeSql;
  return `${safeSql} LIMIT ${MAX_RESULT_ROWS}`;
}

type CellValue = string | number | boolean | null;

export type ExplorerQueryResult = {
  sql: string;
  columns: string[];
  rows: Record<string, CellValue>[];
};

function toCellValue(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Runs an AI-generated SQL query after validating it's a safe, read-only
 * SELECT against an allow-listed table. */
export const runNaturalLanguageQuery = createServerFn({ method: "POST" })
  .inputValidator((sqlText: string) => sqlText)
  .handler(async ({ data: sqlText }): Promise<ExplorerQueryResult> => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const safeSql = enforceRowLimit(validateReadOnlySql(sqlText));

    const { getDb } = await import("@/lib/db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    const result = await db.execute(sql.raw(safeSql));
    const rawRows = (
      Array.isArray(result) ? result : (result.rows ?? [])
    ) as Record<string, unknown>[];
    const columns = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
    const rows: Record<string, CellValue>[] = rawRows.map((row) => {
      const cleaned: Record<string, CellValue> = {};
      for (const key of columns) cleaned[key] = toCellValue(row[key]);
      return cleaned;
    });

    return { sql: safeSql, columns, rows };
  });
