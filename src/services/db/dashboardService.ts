import { createServerFn } from "@tanstack/react-start";

/**
 * Combines every query the Dashboard home page needs into a single server
 * round-trip (previously 5 separate `createServerFn` calls fired in
 * parallel from the client — same number of DB queries, but 5 separate
 * HTTP requests). `includeStorage` is passed by the client based on
 * `useCapabilities().s3Enabled` so we skip that query entirely when
 * storage isn't configured.
 */
export const getDashboardSummary = createServerFn({ method: "GET" })
  .inputValidator((input: { includeStorage: boolean }) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { todos, errorLogs, auditLogs, storageFiles, workflowRuns } =
      await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();

    const [todoRows, errorRows, auditRows, workflowRunRows, storageRows] =
      await Promise.all([
        db.select().from(todos).orderBy(desc(todos.createdAt)),
        db.select().from(errorLogs).orderBy(desc(errorLogs.createdAt)),
        db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(8),
        db
          .select()
          .from(workflowRuns)
          .orderBy(desc(workflowRuns.createdAt))
          .limit(6),
        data.includeStorage
          ? db.select().from(storageFiles)
          : Promise.resolve([]),
      ]);

    return {
      todos: todoRows,
      errorLogs: errorRows,
      auditLogs: auditRows,
      workflowRuns: workflowRunRows,
      storageFiles: storageRows,
    };
  });
