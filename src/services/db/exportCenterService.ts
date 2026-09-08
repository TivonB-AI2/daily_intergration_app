import { createServerFn } from "@tanstack/react-start";

/** Tables offered for export from the Export Center page. Deliberately
 * excludes `apiKeys` (holds a real secret in `keyValue`) and other
 * internal/detail tables (theme snapshots, pipeline stage detail rows,
 * CSV import row staging) that aren't useful as a standalone export. Each
 * entry's `dateColumn` is the `createdAt`-equivalent column used for the
 * optional date-range filter. */
export type ExportTableKey =
  | "todos"
  | "errorLogs"
  | "auditLogs"
  | "changelogEntries"
  | "inventoryItems"
  | "chatConversations"
  | "contentCalendarItems"
  | "workflowRuns"
  | "savedQueries"
  | "aiInsights"
  | "workspaceModels"
  | "csvImportBatches"
  | "documentJobs";

export const EXPORT_TABLES: {
  key: ExportTableKey;
  label: string;
  description: string;
}[] = [
  { key: "todos", label: "To-Do", description: "Every task and its status." },
  {
    key: "errorLogs",
    label: "Error Log",
    description: "Every recorded error/warning event.",
  },
  {
    key: "auditLogs",
    label: "Audit Log",
    description: "Every recorded audit event.",
  },
  {
    key: "changelogEntries",
    label: "Changelog",
    description: "Every recorded release entry.",
  },
  {
    key: "inventoryItems",
    label: "Inventory",
    description: "Every inventory item and stock level.",
  },
  {
    key: "chatConversations",
    label: "AI Chat Conversations",
    description: "Every saved chat conversation (not individual messages).",
  },
  {
    key: "contentCalendarItems",
    label: "Content Calendar",
    description: "Every scheduled content item.",
  },
  {
    key: "workflowRuns",
    label: "Workflow Runs",
    description: "Every logged workflow run.",
  },
  {
    key: "savedQueries",
    label: "Saved Queries",
    description: "Every saved SQL query.",
  },
  {
    key: "aiInsights",
    label: "AI Insights",
    description: "Every generated insight.",
  },
  {
    key: "workspaceModels",
    label: "Workspace Models",
    description: "Every registered AI/ML model.",
  },
  {
    key: "csvImportBatches",
    label: "CSV Import Batches",
    description: "Every CSV import run and its summary.",
  },
  {
    key: "documentJobs",
    label: "Document Pipeline Jobs",
    description: "Every document pipeline job and its status.",
  },
];

export type RunExportInput = {
  table: ExportTableKey;
  from?: string | null;
  to?: string | null;
};

export const runExport = createServerFn({ method: "POST" })
  .inputValidator((input: RunExportInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const schema = await import("@/server/db/schema");
    const { and, gte, lte, desc } = await import("drizzle-orm");
    const { rowsToCsv } = await import("@/lib/csvExport");
    const { uploadFile } = await import("@/server/s3/client");
    const db = await getDb();

    const meta = EXPORT_TABLES.find((t) => t.key === data.table);
    if (!meta) throw new Error(`Unknown export table: ${data.table}`);

    // biome-ignore lint/suspicious/noExplicitAny: dynamic table lookup by name
    const table = (schema as any)[data.table];
    if (!table) throw new Error(`Unknown export table: ${data.table}`);

    // Every table in EXPORT_TABLES has a `createdAt` column, used both for
    // the optional date-range filter and to order the export newest-first.
    const dateCol = table.createdAt;
    const from = data.from ? new Date(data.from) : null;
    const to = data.to ? new Date(data.to) : null;
    const conditions = [];
    if (from) conditions.push(gte(dateCol, from));
    if (to) conditions.push(lte(dateCol, to));

    const rows = await db
      .select()
      .from(table)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(dateCol));

    const csv = rowsToCsv(rows as Record<string, unknown>[]);
    const fileName = `${meta.key}-${Date.now()}.csv`;
    const key = `exports/center/${fileName}`;
    await uploadFile(key, csv, { contentType: "text/csv" });

    const [storageFile] = await db
      .insert(schema.storageFiles)
      .values({
        key,
        fileName,
        folder: "exports",
        contentType: "text/csv",
        size: Buffer.byteLength(csv, "utf-8"),
      })
      .returning();

    const [exportRow] = await db
      .insert(schema.dataExports)
      .values({
        tableKey: meta.key,
        tableLabel: meta.label,
        storageFileId: storageFile.id,
        rowCount: rows.length,
        fromDate: from,
        toDate: to,
      })
      .returning();

    return { ...exportRow, storageFile };
  });

export const listExportHistory = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { dataExports, storageFiles } = await import("@/server/db/schema");
    const { desc, eq } = await import("drizzle-orm");
    const db = await getDb();
    const rows = await db
      .select({
        id: dataExports.id,
        tableKey: dataExports.tableKey,
        tableLabel: dataExports.tableLabel,
        rowCount: dataExports.rowCount,
        fromDate: dataExports.fromDate,
        toDate: dataExports.toDate,
        createdAt: dataExports.createdAt,
        storageFileId: dataExports.storageFileId,
        fileName: storageFiles.fileName,
        key: storageFiles.key,
        size: storageFiles.size,
      })
      .from(dataExports)
      .innerJoin(storageFiles, eq(dataExports.storageFileId, storageFiles.id))
      .orderBy(desc(dataExports.createdAt));
    return rows;
  },
);

export const deleteExport = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number; key: string }) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { deleteFile } = await import("@/server/s3/client");
    await deleteFile(data.key);
    const { getDb } = await import("@/lib/db");
    const { dataExports } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(dataExports).where(eq(dataExports.id, data.id));
  });

export const getExportDownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((key: string) => key)
  .handler(async ({ data: key }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getPresignedUrl } = await import("@/server/s3/client");
    return { url: await getPresignedUrl(key, { expiresIn: 3600 }) };
  });
