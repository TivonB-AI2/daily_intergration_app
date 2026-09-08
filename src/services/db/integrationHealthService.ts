import { createServerFn } from "@tanstack/react-start";

export type HealthCheckInput = {
  connectorId: string;
  connectorName: string;
  connectorProvider?: string;
  status: "success" | "failure";
  message?: string;
  durationMs: number;
};

/** Records one manual "Test Connection" result for a connector — the
 * platform has no health/uptime endpoint for connectors, so this table is
 * the only source of history. */
export const recordHealthCheck = createServerFn({ method: "POST" })
  .inputValidator((input: HealthCheckInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { integrationHealthChecks } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(integrationHealthChecks)
      .values({
        connectorId: data.connectorId,
        connectorName: data.connectorName,
        connectorProvider: data.connectorProvider ?? null,
        status: data.status,
        message: data.message ?? null,
        durationMs: data.durationMs,
      })
      .returning();
    return row;
  });

/** Lists recent health checks, newest first, capped so the page stays
 * bounded as history grows. */
export const listHealthChecks = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { integrationHealthChecks } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db
      .select()
      .from(integrationHealthChecks)
      .orderBy(desc(integrationHealthChecks.createdAt))
      .limit(200);
  },
);

/** Clears all recorded health check history. */
export const clearHealthChecks = createServerFn({ method: "POST" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { integrationHealthChecks } = await import("@/server/db/schema");
    const db = await getDb();
    await db.delete(integrationHealthChecks);
  },
);
