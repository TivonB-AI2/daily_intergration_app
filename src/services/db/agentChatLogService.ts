import { createServerFn } from "@tanstack/react-start";

export type CreateAgentChatLogInput = {
  sessionId: string;
  userQuery: string;
  responseSummary: string;
};

/** Newest first. */
export const listAgentChatLogs = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { agentChatLogs } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db
      .select()
      .from(agentChatLogs)
      .orderBy(desc(agentChatLogs.createdAt));
  },
);

export const createAgentChatLog = createServerFn({ method: "POST" })
  .inputValidator((input: CreateAgentChatLogInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { agentChatLogs } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db.insert(agentChatLogs).values(data).returning();
    return row;
  });

export const deleteAgentChatLog = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { agentChatLogs } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(agentChatLogs).where(eq(agentChatLogs.id, id));
  });
