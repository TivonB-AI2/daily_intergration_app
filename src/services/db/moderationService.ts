import { createServerFn } from "@tanstack/react-start";

export const listModerationChecks = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { moderationChecks } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db
      .select()
      .from(moderationChecks)
      .orderBy(desc(moderationChecks.createdAt))
      .limit(100);
  },
);

export type CreateModerationCheckInput = {
  sourceLabel: string;
  inputText: string;
  provider: string;
  flagged: boolean;
  categories: string[];
  rawResponse: string;
};

export const createModerationCheck = createServerFn({ method: "POST" })
  .inputValidator((input: CreateModerationCheckInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { moderationChecks } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db.insert(moderationChecks).values(data).returning();
    return row;
  });

export const deleteModerationCheck = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { moderationChecks } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(moderationChecks).where(eq(moderationChecks.id, id));
  });
