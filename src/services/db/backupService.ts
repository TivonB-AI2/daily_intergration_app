import { createServerFn } from "@tanstack/react-start";

/** Tables included in a full-database backup, keyed by name for the snapshot JSON. */
const BACKUP_TABLE_NAMES = [
  "todos",
  "errorLogs",
  "auditLogs",
  "changelogEntries",
  "chatConversations",
  "chatMessages",
  "storageFiles",
  "inventoryItems",
  "contentCalendarItems",
  "customThemes",
  "activeThemes",
  "apiKeys",
  "workflowRegistry",
  "workflowRuns",
  "savedQueries",
  "workspaceModels",
  "aiInsights",
] as const;

export type BackupTableName = (typeof BACKUP_TABLE_NAMES)[number];

export const listBackups = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { dbBackups } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db.select().from(dbBackups).orderBy(desc(dbBackups.createdAt));
  },
);

export const createBackup = createServerFn({ method: "POST" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const schema = await import("@/server/db/schema");
    const { uploadFile } = await import("@/server/s3/client");
    const db = await getDb();

    const snapshot: Record<string, unknown[]> = {};
    let rowCount = 0;
    const tableEntries = BACKUP_TABLE_NAMES.map((name) => ({
      name,
      // biome-ignore lint/suspicious/noExplicitAny: dynamic table lookup by name
      table: (schema as any)[name],
    })).filter((entry) => entry.table);
    const results = await Promise.all(
      tableEntries.map((entry) => db.select().from(entry.table)),
    );
    tableEntries.forEach((entry, i) => {
      snapshot[entry.name] = results[i];
      rowCount += results[i].length;
    });

    const payload = JSON.stringify(
      { createdAt: new Date().toISOString(), tables: snapshot },
      null,
      2,
    );
    const key = `exports/backups/${Date.now()}-backup.json`;
    await uploadFile(key, payload, { contentType: "application/json" });

    const { dbBackups } = schema;
    const [row] = await db
      .insert(dbBackups)
      .values({
        key,
        tableCount: BACKUP_TABLE_NAMES.length,
        rowCount,
        sizeBytes: new TextEncoder().encode(payload).length,
        status: "completed",
      })
      .returning();
    return row;
  },
);

export type RestoreMode = "merge" | "replace";

export const restoreBackup = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number; mode?: RestoreMode }) => input)
  .handler(async ({ data: { id, mode = "merge" } }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const schema = await import("@/server/db/schema");
    const { downloadFile } = await import("@/server/s3/client");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();

    const { dbBackups } = schema;
    const [backup] = await db
      .select()
      .from(dbBackups)
      .where(eq(dbBackups.id, id));
    if (!backup) throw new Error("Backup not found");

    const bytes = await downloadFile(backup.key);
    if (!bytes) throw new Error("Backup file not found in storage");

    const parsed: { tables: Record<string, Record<string, unknown>[]> } =
      JSON.parse(new TextDecoder().decode(bytes));

    // "replace" wipes every backed-up table before restoring, so the
    // snapshot becomes the new full state instead of merging on top of
    // whatever's already there (which is what previously made restoring an
    // old backup risk creating duplicates). Every foreign key between
    // backed-up tables uses "set null"/"cascade" (see schema.ts), so the
    // tables can be cleared in any order without hitting a constraint
    // violation — Postgres itself handles the cascade/null-out.
    if (mode === "replace") {
      for (const name of BACKUP_TABLE_NAMES) {
        // biome-ignore lint/suspicious/noExplicitAny: dynamic table lookup by name
        const table = (schema as any)[name];
        if (!table) continue;
        await db.delete(table);
      }
    }

    let restoredRows = 0;
    for (const name of BACKUP_TABLE_NAMES) {
      const rows = parsed.tables[name];
      if (!rows || rows.length === 0) continue;
      // biome-ignore lint/suspicious/noExplicitAny: dynamic table lookup by name
      const table = (schema as any)[name];
      if (!table) continue;

      // Strip the identity `id` column so restored rows get fresh ids and
      // don't collide with anything already present; foreign keys between
      // backed-up tables are best-effort and may not remap perfectly.
      const values = rows.map((r) => {
        const { id: _omit, ...rest } = r;
        return rest;
      });
      await db.insert(table).values(values);
      restoredRows += values.length;
    }

    return { restoredRows, mode };
  });
