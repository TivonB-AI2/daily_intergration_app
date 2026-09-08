import { createServerFn } from "@tanstack/react-start";

export type ErrorLogInput = {
  message: string;
  severity?: "info" | "warning" | "error" | "critical";
  source?: string | null;
  stackTrace?: string | null;
};

export const listErrorLogs = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { errorLogs } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db.select().from(errorLogs).orderBy(desc(errorLogs.createdAt));
  },
);

export type ErrorLogPageFilters = {
  severity?: "info" | "warning" | "error" | "critical" | "all";
  status?: "all" | "unresolved" | "resolved";
  page: number;
  perPage: number;
};

/** Server-side paginated + filtered read — used by the Error Log page's
 * table so large logs don't require fetching every row on every load. */
export const listErrorLogsPaged = createServerFn({ method: "GET" })
  .inputValidator((input: ErrorLogPageFilters) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { errorLogs } = await import("@/server/db/schema");
    const { and, desc, eq, sql } = await import("drizzle-orm");
    const db = await getDb();

    const conditions = [];
    if (data.severity && data.severity !== "all") {
      conditions.push(eq(errorLogs.severity, data.severity));
    }
    if (data.status === "unresolved") {
      conditions.push(eq(errorLogs.resolved, false));
    } else if (data.status === "resolved") {
      conditions.push(eq(errorLogs.resolved, true));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const perPage = Math.max(1, Math.min(100, data.perPage));
    const page = Math.max(1, data.page);

    const [rows, [{ count }]] = await Promise.all([
      db
        .select()
        .from(errorLogs)
        .where(where)
        .orderBy(desc(errorLogs.createdAt))
        .limit(perPage)
        .offset((page - 1) * perPage),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(errorLogs)
        .where(where),
    ]);

    return { rows, total: count };
  });

/** Summary counts across the whole table, independent of the current
 * page/filter — powers the top summary cards without fetching every row. */
export const getErrorLogSummary = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { errorLogs } = await import("@/server/db/schema");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        unresolved: sql<number>`count(*) filter (where resolved = false)::int`,
        resolved: sql<number>`count(*) filter (where resolved = true)::int`,
        critical: sql<number>`count(*) filter (where severity = 'critical' and resolved = false)::int`,
      })
      .from(errorLogs);
    return row;
  },
);

export const createErrorLog = createServerFn({ method: "POST" })
  .inputValidator((input: ErrorLogInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { errorLogs } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(errorLogs)
      .values({
        message: data.message,
        severity: data.severity ?? "error",
        source: data.source ?? null,
        stackTrace: data.stackTrace ?? null,
      })
      .returning();
    return row;
  });

export const resolveErrorLog = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { errorLogs } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .update(errorLogs)
      .set({ resolved: true })
      .where(eq(errorLogs.id, id))
      .returning();
    return row;
  });

export const deleteErrorLog = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { errorLogs } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(errorLogs).where(eq(errorLogs.id, id));
  });

export const clearResolvedErrorLogs = createServerFn({
  method: "POST",
}).handler(async () => {
  const { requireAppAccess } = await import("@/server/protectedServerFn");
  await requireAppAccess();
  const { getDb } = await import("@/lib/db");
  const { errorLogs } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  await db.delete(errorLogs).where(eq(errorLogs.resolved, true));
});
