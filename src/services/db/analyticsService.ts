import { createServerFn } from "@tanstack/react-start";

export type AnalyticsRange = "7d" | "30d" | "90d";

export type AnalyticsSummary = {
  totals: {
    todos: number;
    todosDone: number;
    errors: number;
    errorsUnresolved: number;
    auditEvents: number;
    inventoryItems: number;
    inventoryUnits: number;
    files: number;
    storageBytes: number;
  };
  activity: { date: string; audits: number; errors: number; todos: number }[];
  todosByStatus: { name: string; value: number }[];
  todosByPriority: { name: string; value: number }[];
  errorsBySeverity: { name: string; value: number }[];
  inventoryByCategory: { name: string; items: number; units: number }[];
  filesByFolder: { name: string; files: number; bytes: number }[];
};

function rangeToDays(range: AnalyticsRange): number {
  if (range === "7d") return 7;
  if (range === "90d") return 90;
  return 30;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type AnalyticsComparison = {
  rangeLabel: string;
  current: { audits: number; errors: number; todosCreated: number };
  previous: { audits: number; errors: number; todosCreated: number };
};

/** Compares the selected range (e.g. this week) against the equal-length
 * period immediately before it (e.g. last week). */
export const getAnalyticsComparison = createServerFn({ method: "GET" })
  .inputValidator((range: AnalyticsRange) => range)
  .handler(async ({ data: range }): Promise<AnalyticsComparison> => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { todos, errorLogs, auditLogs } = await import("@/server/db/schema");
    const { gte, lt, and } = await import("drizzle-orm");
    const db = await getDb();

    const days = rangeToDays(range);
    const currentStart = new Date();
    currentStart.setUTCHours(0, 0, 0, 0);
    currentStart.setUTCDate(currentStart.getUTCDate() - (days - 1));
    const previousStart = new Date(currentStart);
    previousStart.setUTCDate(previousStart.getUTCDate() - days);

    const countInWindow = async (
      table: typeof auditLogs | typeof errorLogs | typeof todos,
      start: Date,
      end: Date,
    ) => {
      const rows = await db
        .select()
        .from(table)
        .where(and(gte(table.createdAt, start), lt(table.createdAt, end)));
      return rows.length;
    };

    const [
      currentAudits,
      currentErrors,
      currentTodos,
      previousAudits,
      previousErrors,
      previousTodos,
    ] = await Promise.all([
      countInWindow(auditLogs, currentStart, new Date()),
      countInWindow(errorLogs, currentStart, new Date()),
      countInWindow(todos, currentStart, new Date()),
      countInWindow(auditLogs, previousStart, currentStart),
      countInWindow(errorLogs, previousStart, currentStart),
      countInWindow(todos, previousStart, currentStart),
    ]);

    return {
      rangeLabel:
        days === 7
          ? "this week vs last week"
          : `last ${days} days vs previous ${days} days`,
      current: {
        audits: currentAudits,
        errors: currentErrors,
        todosCreated: currentTodos,
      },
      previous: {
        audits: previousAudits,
        errors: previousErrors,
        todosCreated: previousTodos,
      },
    };
  });

export const getAnalyticsSummary = createServerFn({ method: "GET" })
  .inputValidator((range: AnalyticsRange) => range)
  .handler(async ({ data: range }): Promise<AnalyticsSummary> => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { todos, errorLogs, auditLogs, inventoryItems, storageFiles } =
      await import("@/server/db/schema");
    const { gte } = await import("drizzle-orm");
    const db = await getDb();

    const days = rangeToDays(range);
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));

    // Safety cap on each table scan — these are small internal logs today,
    // but this keeps a single dashboard load bounded even if one grows large.
    const ROW_SCAN_LIMIT = 5000;
    const { desc } = await import("drizzle-orm");

    const [todoRows, errorRows, auditRows, invRows, fileRows] =
      await Promise.all([
        db
          .select()
          .from(todos)
          .orderBy(desc(todos.createdAt))
          .limit(ROW_SCAN_LIMIT),
        db
          .select()
          .from(errorLogs)
          .orderBy(desc(errorLogs.createdAt))
          .limit(ROW_SCAN_LIMIT),
        db.select().from(auditLogs).where(gte(auditLogs.createdAt, since)),
        db
          .select()
          .from(inventoryItems)
          .orderBy(desc(inventoryItems.createdAt))
          .limit(ROW_SCAN_LIMIT),
        db
          .select()
          .from(storageFiles)
          .orderBy(desc(storageFiles.createdAt))
          .limit(ROW_SCAN_LIMIT),
      ]);

    // Build a continuous day bucket series so charts never have gaps.
    const buckets = new Map<
      string,
      { date: string; audits: number; errors: number; todos: number }
    >();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      buckets.set(dayKey(d), {
        date: dayKey(d),
        audits: 0,
        errors: 0,
        todos: 0,
      });
    }

    for (const r of auditRows) {
      const b = buckets.get(dayKey(new Date(r.createdAt)));
      if (b) b.audits += 1;
    }
    for (const r of errorRows) {
      const b = buckets.get(dayKey(new Date(r.createdAt)));
      if (b) b.errors += 1;
    }
    for (const r of todoRows) {
      const b = buckets.get(dayKey(new Date(r.createdAt)));
      if (b) b.todos += 1;
    }

    const countBy = <T>(rows: T[], pick: (row: T) => string) => {
      const m = new Map<string, number>();
      for (const row of rows) {
        const k = pick(row);
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()].map(([name, value]) => ({ name, value }));
    };

    const invByCategory = new Map<string, { items: number; units: number }>();
    for (const row of invRows) {
      const cur = invByCategory.get(row.category) ?? { items: 0, units: 0 };
      cur.items += 1;
      cur.units += row.quantity;
      invByCategory.set(row.category, cur);
    }

    const filesByFolder = new Map<string, { files: number; bytes: number }>();
    for (const row of fileRows) {
      const cur = filesByFolder.get(row.folder) ?? { files: 0, bytes: 0 };
      cur.files += 1;
      cur.bytes += row.size;
      filesByFolder.set(row.folder, cur);
    }

    return {
      totals: {
        todos: todoRows.length,
        todosDone: todoRows.filter((t) => t.status === "done").length,
        errors: errorRows.length,
        errorsUnresolved: errorRows.filter((e) => !e.resolved).length,
        auditEvents: auditRows.length,
        inventoryItems: invRows.length,
        inventoryUnits: invRows.reduce((sum, r) => sum + r.quantity, 0),
        files: fileRows.length,
        storageBytes: fileRows.reduce((sum, r) => sum + r.size, 0),
      },
      activity: [...buckets.values()],
      todosByStatus: countBy(todoRows, (r) => r.status),
      todosByPriority: countBy(todoRows, (r) => r.priority),
      errorsBySeverity: countBy(errorRows, (r) => r.severity),
      inventoryByCategory: [...invByCategory.entries()].map(([name, v]) => ({
        name,
        items: v.items,
        units: v.units,
      })),
      filesByFolder: [...filesByFolder.entries()].map(([name, v]) => ({
        name,
        files: v.files,
        bytes: v.bytes,
      })),
    };
  });
