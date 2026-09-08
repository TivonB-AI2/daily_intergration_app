import { createServerFn } from "@tanstack/react-start";

export type RegistrySyncStatus = {
  registryName: string;
  lastSyncedAt: Date;
  entryCount: number;
};

/**
 * Reads when the Workflows/Models snapshots (`workflow_registry` /
 * `workspace_models`) were last re-synced against the live platform. There
 * is no runtime API for this app to list either one itself — only the
 * `aisquared` MCP tools can — so these are manual snapshots kept current by
 * re-running `seed-workflows.ts`/`seed-models.ts` (ask in chat to refresh
 * them). This just surfaces *when* that last happened so staleness is
 * visible instead of silent.
 */
export const listRegistrySyncStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { registrySyncLog } = await import("@/server/db/schema");
    const db = await getDb();
    return db.select().from(registrySyncLog);
  },
);
