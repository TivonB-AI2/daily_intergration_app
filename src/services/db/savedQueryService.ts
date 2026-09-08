import { createServerFn } from "@tanstack/react-start";

export type SavedQueryInput = {
  name: string;
  connectorId: string;
  connectorName: string;
  query: string;
};

export const listSavedQueries = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { savedQueries } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db.select().from(savedQueries).orderBy(desc(savedQueries.createdAt));
  },
);

export const createSavedQuery = createServerFn({ method: "POST" })
  .inputValidator((input: SavedQueryInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { savedQueries, auditLogs } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db.insert(savedQueries).values(data).returning();
    await db.insert(auditLogs).values({
      action: "Saved query",
      resource: data.name,
      page: "/system",
      category: "query",
    });
    return row;
  });

export const deleteSavedQuery = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { savedQueries, auditLogs } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .delete(savedQueries)
      .where(eq(savedQueries.id, id))
      .returning();
    await db.insert(auditLogs).values({
      action: "Deleted saved query",
      resource: row?.name,
      page: "/system",
      category: "query",
    });
  });
