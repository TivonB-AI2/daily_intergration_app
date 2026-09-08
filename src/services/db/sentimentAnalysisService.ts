import { createServerFn } from "@tanstack/react-start";

export const listSentimentAnalyses = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { sentimentAnalyses } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db
      .select()
      .from(sentimentAnalyses)
      .orderBy(desc(sentimentAnalyses.createdAt))
      .limit(100);
  },
);

export type CreateSentimentAnalysisInput = {
  inputText: string;
  provider: string;
  sentiment: "positive" | "negative" | "neutral" | null;
  sentimentScore: number | null;
  tones: string[];
  keyPhrases: string[];
  rawResponse: string;
};

export const createSentimentAnalysis = createServerFn({ method: "POST" })
  .inputValidator((input: CreateSentimentAnalysisInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { sentimentAnalyses } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db.insert(sentimentAnalyses).values(data).returning();
    return row;
  });

export const deleteSentimentAnalysis = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { sentimentAnalyses } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(sentimentAnalyses).where(eq(sentimentAnalyses.id, id));
  });
