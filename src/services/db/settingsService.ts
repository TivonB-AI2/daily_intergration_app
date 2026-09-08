import { createServerFn } from "@tanstack/react-start";

export type AppPreferencesInput = {
  displayName?: string;
  timezone?: string;
  language?: string;
  compactDensity?: boolean;
  sidebarCollapsed?: boolean;
};

export type DataRetentionInput = {
  errorLogRetentionDays?: number | null;
  auditLogRetentionDays?: number | null;
  chatHistoryRetentionDays?: number | null;
};

// ---- App Preferences ----

export const getAppPreferences = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { appPreferences } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .select()
      .from(appPreferences)
      .where(eq(appPreferences.id, 1));
    return row ?? null;
  },
);

export const saveAppPreferences = createServerFn({ method: "POST" })
  .inputValidator((input: AppPreferencesInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { appPreferences, auditLogs } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(appPreferences)
      .values({ id: 1, ...data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appPreferences.id,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    await db.insert(auditLogs).values({
      action: "Updated app preferences",
      category: "settings",
    });
    return row;
  });

// ---- Data Retention ----

export const getDataRetentionSettings = createServerFn({
  method: "GET",
}).handler(async () => {
  const { requireAppAccess } = await import("@/server/protectedServerFn");
  await requireAppAccess();
  const { getDb } = await import("@/lib/db");
  const { dataRetentionSettings } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  const [row] = await db
    .select()
    .from(dataRetentionSettings)
    .where(eq(dataRetentionSettings.id, 1));
  return row ?? null;
});

export const saveDataRetentionSettings = createServerFn({ method: "POST" })
  .inputValidator((input: DataRetentionInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { dataRetentionSettings, auditLogs } = await import(
      "@/server/db/schema"
    );
    const db = await getDb();
    const [row] = await db
      .insert(dataRetentionSettings)
      .values({ id: 1, ...data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: dataRetentionSettings.id,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    await db.insert(auditLogs).values({
      action: "Updated data retention settings",
      category: "settings",
    });
    return row;
  });

/** Deletes rows older than each configured retention window. A `null`
 * retention value for a given table means "keep forever" — that table is
 * skipped entirely. Chat history retention deletes whole conversations
 * (and their messages cascade) older than the cutoff, not individual
 * messages, so a conversation is never left with orphaned/partial history. */
export const runDataRetentionCleanup = createServerFn({
  method: "POST",
}).handler(async () => {
  const { requireAppAccess } = await import("@/server/protectedServerFn");
  await requireAppAccess();
  const { getDb } = await import("@/lib/db");
  const { dataRetentionSettings, errorLogs, auditLogs, chatConversations } =
    await import("@/server/db/schema");
  const { eq, lt } = await import("drizzle-orm");
  const db = await getDb();

  const [settings] = await db
    .select()
    .from(dataRetentionSettings)
    .where(eq(dataRetentionSettings.id, 1));

  const cutoffFor = (days: number | null | undefined) => {
    if (!days || days <= 0) return null;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  };

  let deletedCount = 0;

  const errorCutoff = cutoffFor(settings?.errorLogRetentionDays);
  if (errorCutoff) {
    const deleted = await db
      .delete(errorLogs)
      .where(lt(errorLogs.createdAt, errorCutoff))
      .returning({ id: errorLogs.id });
    deletedCount += deleted.length;
  }

  const auditCutoff = cutoffFor(settings?.auditLogRetentionDays);
  if (auditCutoff) {
    const deleted = await db
      .delete(auditLogs)
      .where(lt(auditLogs.createdAt, auditCutoff))
      .returning({ id: auditLogs.id });
    deletedCount += deleted.length;
  }

  const chatCutoff = cutoffFor(settings?.chatHistoryRetentionDays);
  if (chatCutoff) {
    const deleted = await db
      .delete(chatConversations)
      .where(lt(chatConversations.createdAt, chatCutoff))
      .returning({ id: chatConversations.id });
    deletedCount += deleted.length;
  }

  await db
    .insert(dataRetentionSettings)
    .values({
      id: 1,
      lastCleanupAt: new Date(),
      lastCleanupDeletedCount: deletedCount,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: dataRetentionSettings.id,
      set: {
        lastCleanupAt: new Date(),
        lastCleanupDeletedCount: deletedCount,
        updatedAt: new Date(),
      },
    });

  await db.insert(auditLogs).values({
    action: "Ran data retention cleanup",
    resource: `${deletedCount} rows deleted`,
    category: "settings",
  });

  return { deletedCount };
});

// ---- Workspace Info ----

export const getWorkspaceInfo = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { todos, errorLogs, auditLogs, storageFiles, chatConversations } =
      await import("@/server/db/schema");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();

    const [
      [todoCount],
      [errorCount],
      [auditCount],
      [storageCount],
      [chatCount],
      [storageSize],
      folderBreakdown,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(todos),
      db.select({ count: sql<number>`count(*)::int` }).from(errorLogs),
      db.select({ count: sql<number>`count(*)::int` }).from(auditLogs),
      db.select({ count: sql<number>`count(*)::int` }).from(storageFiles),
      db.select({ count: sql<number>`count(*)::int` }).from(chatConversations),
      db
        .select({
          total: sql<number>`coalesce(sum(${storageFiles.size}), 0)::bigint`,
        })
        .from(storageFiles),
      db
        .select({
          folder: storageFiles.folder,
          count: sql<number>`count(*)::int`,
        })
        .from(storageFiles)
        .groupBy(storageFiles.folder),
    ]);

    return {
      todoCount: todoCount?.count ?? 0,
      errorCount: errorCount?.count ?? 0,
      auditCount: auditCount?.count ?? 0,
      storageFileCount: storageCount?.count ?? 0,
      chatConversationCount: chatCount?.count ?? 0,
      storageBytes: Number(storageSize?.total ?? 0),
      folderBreakdown: {
        uploads:
          folderBreakdown.find((f) => f.folder === "uploads")?.count ?? 0,
        exports:
          folderBreakdown.find((f) => f.folder === "exports")?.count ?? 0,
        assets: folderBreakdown.find((f) => f.folder === "assets")?.count ?? 0,
      },
    };
  },
);

// ---- System Status ----

export const getSystemStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();

    const databaseEnabled = Boolean(process.env.DATABASE_URL);
    const s3Enabled = Boolean(
      (process.env.S3_ENDPOINT || process.env.S3_REGION) &&
        process.env.S3_BUCKET &&
        process.env.S3_ACCESS_KEY &&
        process.env.S3_SECRET_KEY &&
        process.env.S3_PREFIX,
    );

    let lastBackup = null;
    if (databaseEnabled) {
      const { getDb } = await import("@/lib/db");
      const { dbBackups } = await import("@/server/db/schema");
      const { desc } = await import("drizzle-orm");
      const db = await getDb();
      const [row] = await db
        .select()
        .from(dbBackups)
        .orderBy(desc(dbBackups.createdAt))
        .limit(1);
      lastBackup = row ?? null;
    }

    return {
      databaseEnabled,
      s3Enabled,
      lastBackup,
    };
  },
);
