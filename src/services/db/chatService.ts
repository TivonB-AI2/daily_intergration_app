import { createServerFn } from "@tanstack/react-start";

export const listConversations = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { chatConversations } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db
      .select()
      .from(chatConversations)
      .orderBy(desc(chatConversations.updatedAt));
  },
);

export const createConversation = createServerFn({ method: "POST" })
  .inputValidator((input: { title?: string; connectorId?: number }) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { chatConversations } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(chatConversations)
      .values({
        title: data.title ?? "New Chat",
        connectorId: data.connectorId ?? null,
      })
      .returning();
    return row;
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { chatConversations } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(chatConversations).where(eq(chatConversations.id, id));
  });

export const listMessages = createServerFn({ method: "GET" })
  .inputValidator((conversationId: number) => conversationId)
  .handler(async ({ data: conversationId }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { chatMessages } = await import("@/server/db/schema");
    const { eq, asc } = await import("drizzle-orm");
    const db = await getDb();
    return db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(asc(chatMessages.createdAt));
  });

export const addMessage = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      conversationId: number;
      role: "user" | "assistant";
      content: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { chatMessages, chatConversations } = await import(
      "@/server/db/schema"
    );
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .insert(chatMessages)
      .values({
        conversationId: data.conversationId,
        role: data.role,
        content: data.content,
      })
      .returning();
    await db
      .update(chatConversations)
      .set({ updatedAt: new Date() })
      .where(eq(chatConversations.id, data.conversationId));
    return row;
  });

export const renameConversation = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number; title: string }) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { chatConversations } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .update(chatConversations)
      .set({ title: data.title })
      .where(eq(chatConversations.id, data.id))
      .returning();
    return row;
  });
