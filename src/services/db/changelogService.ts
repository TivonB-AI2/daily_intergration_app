import { createServerFn } from "@tanstack/react-start";

export type ChangelogInput = {
  version: string;
  type?: "feature" | "fix" | "improvement" | "breaking" | "security";
  title: string;
  description?: string | null;
  releaseDate?: string | null;
};

/** Parses a "1.10.2"-style version into comparable number segments. Falls
 * back to all-zeros for anything that doesn't look like a dotted version, so
 * malformed entries sort last rather than throwing. */
function parseVersion(version: string): number[] {
  const parts = version.split(".").map((p) => Number.parseInt(p, 10));
  return parts.every((p) => Number.isFinite(p)) ? parts : [0, 0, 0];
}

function compareVersionsDesc(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export const listChangelogEntries = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { changelogEntries } = await import("@/server/db/schema");
    const db = await getDb();
    const rows = await db.select().from(changelogEntries);
    // Sort by semantic version (newest first) rather than raw insertion
    // order/releaseDate — entries added later can document an earlier
    // version number (e.g. backfilled history), so version is the only
    // reliable ordering key. Same-version entries keep their releaseDate
    // (newest first) as a tiebreaker.
    return rows.sort((a, b) => {
      const byVersion = compareVersionsDesc(a.version, b.version);
      if (byVersion !== 0) return byVersion;
      return (
        new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
      );
    });
  },
);

export const createChangelogEntry = createServerFn({ method: "POST" })
  .inputValidator((input: ChangelogInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { changelogEntries } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(changelogEntries)
      .values({
        version: data.version,
        type: data.type ?? "feature",
        title: data.title,
        description: data.description ?? null,
        releaseDate: data.releaseDate ? new Date(data.releaseDate) : new Date(),
      })
      .returning();
    return row;
  });

export const deleteChangelogEntry = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { changelogEntries } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(changelogEntries).where(eq(changelogEntries.id, id));
  });
