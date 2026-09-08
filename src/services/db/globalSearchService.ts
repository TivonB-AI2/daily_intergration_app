import { createServerFn } from "@tanstack/react-start";

export type GlobalSearchResult = {
  type: "todo" | "changelog" | "inventory" | "error" | "storage";
  id: string;
  title: string;
  subtitle: string;
  url: string;
};

const RESULTS_PER_TYPE = 5;

/** Searches core app data (To-Dos, Changelog, Inventory, Error Log,
 * Storage files) by a plain-text query — powers the global search
 * palette's "Data" results section, separate from page navigation. */
export const searchAppData = createServerFn({ method: "GET" })
  .inputValidator((query: string) => query)
  .handler(async ({ data: query }): Promise<GlobalSearchResult[]> => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { todos, changelogEntries, inventoryItems, errorLogs, storageFiles } =
      await import("@/server/db/schema");
    const { desc, ilike, or, sql } = await import("drizzle-orm");
    const db = await getDb();

    const q = `%${trimmed}%`;

    const [todoRows, changelogRows, inventoryRows, errorRows, storageRows] =
      await Promise.all([
        db
          .select()
          .from(todos)
          .where(or(ilike(todos.title, q), ilike(todos.description, q)))
          .orderBy(desc(todos.createdAt))
          .limit(RESULTS_PER_TYPE),
        db
          .select()
          .from(changelogEntries)
          .where(
            or(
              ilike(changelogEntries.title, q),
              ilike(changelogEntries.description, q),
            ),
          )
          .orderBy(desc(changelogEntries.createdAt))
          .limit(RESULTS_PER_TYPE),
        db
          .select()
          .from(inventoryItems)
          .where(
            or(
              ilike(inventoryItems.name, q),
              ilike(inventoryItems.sku, q),
              ilike(inventoryItems.category, q),
            ),
          )
          .orderBy(desc(inventoryItems.createdAt))
          .limit(RESULTS_PER_TYPE),
        db
          .select()
          .from(errorLogs)
          .where(or(ilike(errorLogs.message, q), ilike(errorLogs.source, q)))
          .orderBy(desc(errorLogs.createdAt))
          .limit(RESULTS_PER_TYPE),
        db
          .select()
          .from(storageFiles)
          .where(
            or(
              ilike(storageFiles.fileName, q),
              sql`${storageFiles.tags}::text ILIKE ${q}`,
            ),
          )
          .orderBy(desc(storageFiles.createdAt))
          .limit(RESULTS_PER_TYPE),
      ]);

    const results: GlobalSearchResult[] = [];
    for (const t of todoRows) {
      results.push({
        type: "todo",
        id: `todo-${t.id}`,
        title: t.title,
        subtitle: `To-Do · ${t.status}`,
        url: "/todo",
      });
    }
    for (const c of changelogRows) {
      results.push({
        type: "changelog",
        id: `changelog-${c.id}`,
        title: c.title,
        subtitle: `Changelog · ${c.version}`,
        url: "/changelog",
      });
    }
    for (const i of inventoryRows) {
      results.push({
        type: "inventory",
        id: `inventory-${i.id}`,
        title: i.name,
        subtitle: `Inventory · ${i.sku}`,
        url: "/inventory",
      });
    }
    for (const e of errorRows) {
      results.push({
        type: "error",
        id: `error-${e.id}`,
        title: e.message,
        subtitle: `Error Log · ${e.severity}`,
        url: "/system",
      });
    }
    for (const f of storageRows) {
      results.push({
        type: "storage",
        id: `storage-${f.id}`,
        title: f.fileName,
        subtitle: `Storage · ${f.folder}`,
        url: "/storage",
      });
    }
    return results;
  });
