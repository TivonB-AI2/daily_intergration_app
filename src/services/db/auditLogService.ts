import { createServerFn } from "@tanstack/react-start";

export type AuditLogInput = {
  status?: "success" | "failure";
  action: string;
  resource?: string | null;
  page?: string | null;
  category?: string;
};

export const listAuditLogs = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { auditLogs } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt));
  },
);

export type AuditLogPageFilters = {
  category?: string | "all";
  status?: "all" | "success" | "failure";
  search?: string;
  page: number;
  perPage: number;
};

/** Server-side paginated + filtered read — used by the Audit Log page's
 * table so large logs don't require fetching every row on every load. */
export const listAuditLogsPaged = createServerFn({ method: "GET" })
  .inputValidator((input: AuditLogPageFilters) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { auditLogs } = await import("@/server/db/schema");
    const { and, desc, eq, ilike, or, sql } = await import("drizzle-orm");
    const db = await getDb();

    const conditions = [];
    if (data.category && data.category !== "all") {
      conditions.push(eq(auditLogs.category, data.category));
    }
    if (data.status && data.status !== "all") {
      conditions.push(eq(auditLogs.status, data.status));
    }
    if (data.search?.trim()) {
      const q = `%${data.search.trim()}%`;
      conditions.push(
        or(
          ilike(auditLogs.action, q),
          ilike(auditLogs.resource, q),
          ilike(auditLogs.page, q),
        ),
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const perPage = Math.max(1, Math.min(100, data.perPage));
    const page = Math.max(1, data.page);

    const [rows, [{ count }]] = await Promise.all([
      db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(perPage)
        .offset((page - 1) * perPage),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(where),
    ]);

    return { rows, total: count };
  });

/** All rows matching the current filters (no pagination) — used only for
 * CSV export, which needs the full filtered set, not one page. */
export const listAuditLogsFiltered = createServerFn({ method: "GET" })
  .inputValidator(
    (input: Pick<AuditLogPageFilters, "category" | "status" | "search">) =>
      input,
  )
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { auditLogs } = await import("@/server/db/schema");
    const { and, desc, eq, ilike, or } = await import("drizzle-orm");
    const db = await getDb();

    const conditions = [];
    if (data.category && data.category !== "all") {
      conditions.push(eq(auditLogs.category, data.category));
    }
    if (data.status && data.status !== "all") {
      conditions.push(eq(auditLogs.status, data.status));
    }
    if (data.search?.trim()) {
      const q = `%${data.search.trim()}%`;
      conditions.push(
        or(
          ilike(auditLogs.action, q),
          ilike(auditLogs.resource, q),
          ilike(auditLogs.page, q),
        ),
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt));
  });

/** Summary counts + distinct categories across the whole table,
 * independent of the current page/filter. */
export const getAuditLogSummary = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { auditLogs } = await import("@/server/db/schema");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    const [[counts], categoryRows] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)::int`,
          success: sql<number>`count(*) filter (where status = 'success')::int`,
          failure: sql<number>`count(*) filter (where status = 'failure')::int`,
        })
        .from(auditLogs),
      db
        .select({ category: auditLogs.category })
        .from(auditLogs)
        .groupBy(auditLogs.category),
    ]);
    return {
      ...counts,
      categories: categoryRows.map((r) => r.category).sort(),
    };
  },
);

export const createAuditLog = createServerFn({ method: "POST" })
  .inputValidator((input: AuditLogInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { auditLogs } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(auditLogs)
      .values({
        status: data.status ?? "success",
        action: data.action,
        resource: data.resource ?? null,
        page: data.page ?? null,
        category: data.category ?? "general",
      })
      .returning();
    return row;
  });

export const clearAuditLogs = createServerFn({ method: "POST" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { auditLogs } = await import("@/server/db/schema");
    const db = await getDb();
    await db.delete(auditLogs);
  },
);
