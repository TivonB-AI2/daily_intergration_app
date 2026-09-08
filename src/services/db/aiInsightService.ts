import { createServerFn } from "@tanstack/react-start";

export type AiInsightInput = {
  connectorId: string;
  connectorName: string;
  summary: string;
};

export const listAiInsights = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { aiInsights } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db.select().from(aiInsights).orderBy(desc(aiInsights.createdAt));
  },
);

export const createAiInsight = createServerFn({ method: "POST" })
  .inputValidator((input: AiInsightInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { aiInsights, auditLogs } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(aiInsights)
      .values({
        connectorId: data.connectorId,
        connectorName: data.connectorName,
        summary: data.summary,
      })
      .returning();
    await db.insert(auditLogs).values({
      action: "Generated AI insight",
      resource: data.connectorName,
      page: "/insights",
      category: "insights",
    });
    return row;
  });

export const deleteAiInsight = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { aiInsights } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(aiInsights).where(eq(aiInsights.id, id));
  });
