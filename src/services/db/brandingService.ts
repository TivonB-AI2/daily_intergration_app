import { createServerFn } from "@tanstack/react-start";

export type ActiveLogo = {
  assetId: number;
  name: string;
  fileKey: string;
  contentType: string | null;
} | null;

/** Returns the Brand & Asset Library asset currently set as the app's active
 * logo (used e.g. in the sidebar header), or null if none is set. */
export const getActiveLogo = createServerFn({ method: "GET" }).handler(
  async (): Promise<ActiveLogo> => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { appBranding, brandAssets, storageFiles } = await import(
      "@/server/db/schema"
    );
    const { eq } = await import("drizzle-orm");
    const db = await getDb();

    const [row] = await db
      .select({
        assetId: brandAssets.id,
        name: brandAssets.name,
        fileKey: storageFiles.key,
        contentType: storageFiles.contentType,
      })
      .from(appBranding)
      .innerJoin(brandAssets, eq(appBranding.activeLogoAssetId, brandAssets.id))
      .innerJoin(storageFiles, eq(brandAssets.storageFileId, storageFiles.id))
      .where(eq(appBranding.id, 1))
      .limit(1);

    return row ?? null;
  },
);

/** Marks a Brand & Asset Library asset as the app's active logo. */
export const setActiveLogo = createServerFn({ method: "POST" })
  .inputValidator((assetId: number) => assetId)
  .handler(async ({ data: assetId }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { appBranding } = await import("@/server/db/schema");
    const db = await getDb();

    await db
      .insert(appBranding)
      .values({ id: 1, activeLogoAssetId: assetId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appBranding.id,
        set: { activeLogoAssetId: assetId, updatedAt: new Date() },
      });
  });

/** Clears the app's active logo, reverting to the default icon. */
export const clearActiveLogo = createServerFn({ method: "POST" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { appBranding } = await import("@/server/db/schema");
    const db = await getDb();

    await db
      .insert(appBranding)
      .values({ id: 1, activeLogoAssetId: null, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appBranding.id,
        set: { activeLogoAssetId: null, updatedAt: new Date() },
      });
  },
);
