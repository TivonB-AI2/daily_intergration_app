import { createServerFn } from "@tanstack/react-start";

export type GalleryImageMetaRow = {
  storageKey: string;
  caption: string | null;
  sortOrder: number;
};

/** Returns caption + sort order for every theme-gallery image that has been
 * captioned or reordered. Images with no row here simply have no caption
 * and fall back to their default (filename) ordering. */
export const listGalleryImageMeta = createServerFn({ method: "GET" }).handler(
  async (): Promise<GalleryImageMetaRow[]> => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { galleryImageMeta } = await import("@/server/db/schema");
    const db = await getDb();
    return db.select().from(galleryImageMeta);
  },
);

export const setGalleryImageCaption = createServerFn({ method: "POST" })
  .inputValidator((input: { storageKey: string; caption: string }) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { galleryImageMeta } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();

    const [existing] = await db
      .select()
      .from(galleryImageMeta)
      .where(eq(galleryImageMeta.storageKey, data.storageKey));

    if (existing) {
      const [row] = await db
        .update(galleryImageMeta)
        .set({ caption: data.caption || null, updatedAt: new Date() })
        .where(eq(galleryImageMeta.storageKey, data.storageKey))
        .returning();
      return row;
    }
    const [row] = await db
      .insert(galleryImageMeta)
      .values({ storageKey: data.storageKey, caption: data.caption || null })
      .returning();
    return row;
  });

/** Persists a new display order for the gallery: `orderedKeys` is the full
 * list of image keys in their desired order (index becomes `sortOrder`). */
export const reorderGalleryImages = createServerFn({ method: "POST" })
  .inputValidator((orderedKeys: string[]) => orderedKeys)
  .handler(async ({ data: orderedKeys }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { galleryImageMeta } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();

    const existing = await db.select().from(galleryImageMeta);
    const existingByKey = new Map(existing.map((r) => [r.storageKey, r]));

    for (let i = 0; i < orderedKeys.length; i++) {
      const key = orderedKeys[i];
      const row = existingByKey.get(key);
      if (row) {
        if (row.sortOrder !== i) {
          await db
            .update(galleryImageMeta)
            .set({ sortOrder: i, updatedAt: new Date() })
            .where(eq(galleryImageMeta.storageKey, key));
        }
      } else {
        await db.insert(galleryImageMeta).values({
          storageKey: key,
          sortOrder: i,
        });
      }
    }
  });
