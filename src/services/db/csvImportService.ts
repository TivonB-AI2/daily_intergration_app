import { createServerFn } from "@tanstack/react-start";

/** Column names (case-insensitive) that identify a CSV as an Inventory
 * import: `name`, `sku`, and `category` are required on the Inventory
 * table, so a CSV missing any of them can't be matched into it. */
const INVENTORY_REQUIRED_HEADERS = ["name", "sku", "category"];

export type CsvPreview = {
  headers: string[];
  rowCount: number;
  sampleRows: Record<string, string>[];
  detectedTarget: "inventory" | "generic";
};

/** Downloads a previously-uploaded CSV from storage and returns a quick
 * preview: headers, row count, a few sample rows, and which table it would
 * be imported into. */
export const previewCsvImport = createServerFn({ method: "POST" })
  .inputValidator((key: string) => key)
  .handler(async ({ data: key }): Promise<CsvPreview> => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { downloadFile } = await import("@/server/s3/client");
    const { parseCsv } = await import("@/lib/csvImport");

    const bytes = await downloadFile(key);
    if (!bytes) throw new Error("CSV file not found in storage");
    const text = new TextDecoder("utf-8").decode(bytes);
    const rows = parseCsv(text);
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const lowerHeaders = headers.map((h) => h.toLowerCase());
    const detectedTarget = INVENTORY_REQUIRED_HEADERS.every((h) =>
      lowerHeaders.includes(h),
    )
      ? "inventory"
      : "generic";

    return {
      headers,
      rowCount: rows.length,
      sampleRows: rows.slice(0, 5),
      detectedTarget,
    };
  });

/** Downloads and fully parses a previously-uploaded CSV (all rows, not just
 * the sample), so the client can run AI category suggestions on rows
 * missing a category before committing the import. */
export const getAllCsvRows = createServerFn({ method: "POST" })
  .inputValidator((key: string) => key)
  .handler(async ({ data: key }): Promise<Record<string, string>[]> => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { downloadFile } = await import("@/server/s3/client");
    const { parseCsv } = await import("@/lib/csvImport");

    const bytes = await downloadFile(key);
    if (!bytes) throw new Error("CSV file not found in storage");
    const text = new TextDecoder("utf-8").decode(bytes);
    return parseCsv(text);
  });

export type ImportCsvInput = {
  key: string;
  fileName: string;
  targetTable: "inventory" | "generic";
  /** When provided (e.g. after AI-suggested categories were merged in on
   * the client), these rows are imported directly instead of re-reading
   * and re-parsing the CSV from storage. */
  rows?: Record<string, string>[];
};

export type ImportCsvResult = {
  batchId: number;
  totalRows: number;
  insertedRows: number;
  updatedRows: number;
  skippedRows: number;
};

/** Imports every row of a previously-uploaded CSV either into the Inventory
 * table (matched/updated by SKU, inserted otherwise) or, for CSVs that don't
 * match the Inventory shape, into a generic per-batch row store so any CSV
 * can be captured and browsed without needing a schema change per upload. */
export const importCsv = createServerFn({ method: "POST" })
  .inputValidator((input: ImportCsvInput) => input)
  .handler(async ({ data }): Promise<ImportCsvResult> => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { downloadFile } = await import("@/server/s3/client");
    const { parseCsv, csvValueToNullableString, csvValueToNullableInt } =
      await import("@/lib/csvImport");
    const { getDb } = await import("@/lib/db");
    const schema = await import("@/server/db/schema");
    const { eq, inArray } = await import("drizzle-orm");
    const db = await getDb();

    let rows = data.rows;
    if (!rows) {
      const bytes = await downloadFile(data.key);
      if (!bytes) throw new Error("CSV file not found in storage");
      const text = new TextDecoder("utf-8").decode(bytes);
      rows = parseCsv(text);
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    if (data.targetTable === "inventory") {
      const skus = [
        ...new Set(
          rows
            .map((row) => row.sku?.trim())
            .filter((sku): sku is string => !!sku),
        ),
      ];
      const existing =
        skus.length > 0
          ? await db
              .select()
              .from(schema.inventoryItems)
              .where(inArray(schema.inventoryItems.sku, skus))
          : [];
      const bySku = new Map(existing.map((r) => [r.sku, r]));
      for (const row of rows) {
        const name = row.name?.trim();
        const sku = row.sku?.trim();
        const category = row.category?.trim();
        if (!name || !sku || !category) {
          skipped++;
          continue;
        }
        const match = bySku.get(sku);
        const quantity = csvValueToNullableInt(row.quantity) ?? 0;
        const values = {
          name,
          description: csvValueToNullableString(row.description),
          sku,
          category,
          quantity,
          status:
            (row.status as "active" | "inactive" | "discontinued") || "active",
          price: csvValueToNullableString(row.price),
        };
        if (match) {
          await db
            .update(schema.inventoryItems)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(schema.inventoryItems.id, match.id));
          updated++;
        } else {
          const [created] = await db
            .insert(schema.inventoryItems)
            .values(values)
            .returning();
          bySku.set(sku, created);
          inserted++;
        }
      }
    } else {
      if (rows.length === 0) {
        skipped = 0;
      } else {
        skipped = 0;
        inserted = rows.length;
      }
    }

    const [batch] = await db
      .insert(schema.csvImportBatches)
      .values({
        fileName: data.fileName,
        storageKey: data.key,
        targetTable: data.targetTable,
        totalRows: rows.length,
        insertedRows: inserted,
        updatedRows: updated,
        skippedRows: skipped,
        status: "completed",
      })
      .returning();

    if (data.targetTable === "generic" && rows.length > 0) {
      await db.insert(schema.csvImportRows).values(
        rows.map((row, idx) => ({
          batchId: batch.id,
          rowIndex: idx,
          data: JSON.stringify(row),
        })),
      );
    }

    return {
      batchId: batch.id,
      totalRows: rows.length,
      insertedRows: inserted,
      updatedRows: updated,
      skippedRows: skipped,
    };
  });

export const listCsvImportBatches = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { csvImportBatches } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db
      .select()
      .from(csvImportBatches)
      .orderBy(desc(csvImportBatches.createdAt));
  },
);

export const getCsvImportBatchRows = createServerFn({ method: "GET" })
  .inputValidator((batchId: number) => batchId)
  .handler(async ({ data: batchId }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { csvImportRows } = await import("@/server/db/schema");
    const { eq, asc } = await import("drizzle-orm");
    const db = await getDb();
    const rows = await db
      .select()
      .from(csvImportRows)
      .where(eq(csvImportRows.batchId, batchId))
      .orderBy(asc(csvImportRows.rowIndex));
    return rows.map((r) => ({
      id: r.id,
      rowIndex: r.rowIndex,
      data: JSON.parse(r.data) as Record<string, string>,
    }));
  });

export const deleteCsvImportBatch = createServerFn({ method: "POST" })
  .inputValidator((batchId: number) => batchId)
  .handler(async ({ data: batchId }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { csvImportBatches } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(csvImportBatches).where(eq(csvImportBatches.id, batchId));
  });
