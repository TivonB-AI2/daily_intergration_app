import { createServerFn } from "@tanstack/react-start";

export const listSavedPrompts = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { savedPrompts } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db.select().from(savedPrompts).orderBy(desc(savedPrompts.updatedAt));
  },
);

export type SavedPromptInput = {
  title: string;
  body: string;
  category: string | null;
  tags: string[];
};

export const createSavedPrompt = createServerFn({ method: "POST" })
  .inputValidator((input: SavedPromptInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { savedPrompts } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db.insert(savedPrompts).values(data).returning();
    return row;
  });

export const updateSavedPrompt = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number } & SavedPromptInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { savedPrompts } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const { id, ...rest } = data;
    const [row] = await db
      .update(savedPrompts)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(savedPrompts.id, id))
      .returning();
    return row;
  });

export const deleteSavedPrompt = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { savedPrompts } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(savedPrompts).where(eq(savedPrompts.id, id));
  });
