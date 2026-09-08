import { createServerFn } from "@tanstack/react-start";

export type SavedReportInput = {
  name: string;
  type: "explorer" | "insight";
  provider: string;
  question?: string;
  connectorId?: string;
  connectorName?: string;
  tables?: string[];
};

export const listSavedReports = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { savedReports } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db.select().from(savedReports).orderBy(desc(savedReports.createdAt));
  },
);

export const createSavedReport = createServerFn({ method: "POST" })
  .inputValidator((input: SavedReportInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { savedReports } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(savedReports)
      .values({
        name: data.name,
        type: data.type,
        provider: data.provider,
        question: data.question ?? null,
        connectorId: data.connectorId ?? null,
        connectorName: data.connectorName ?? null,
        tables: data.tables ?? null,
      })
      .returning();
    return row;
  });

export const deleteSavedReport = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { savedReports } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(savedReports).where(eq(savedReports.id, id));
  });

export const updateSavedReportRun = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number; resultSummary: string }) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { savedReports } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .update(savedReports)
      .set({ lastRunAt: new Date(), lastResultSummary: data.resultSummary })
      .where(eq(savedReports.id, data.id))
      .returning();
    return row;
  });
