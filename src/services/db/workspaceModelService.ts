import { createServerFn } from "@tanstack/react-start";

export const listWorkspaceModels = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { workspaceModels } = await import("@/server/db/schema");
    const { asc } = await import("drizzle-orm");
    const db = await getDb();
    return db.select().from(workspaceModels).orderBy(asc(workspaceModels.name));
  },
);
