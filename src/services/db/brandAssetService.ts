import { createServerFn } from "@tanstack/react-start";

export type BrandAssetCategory =
  | "logo"
  | "icon"
  | "color_palette"
  | "font"
  | "template"
  | "other";

export type BrandAssetWithFile = {
  id: number;
  name: string;
  category: BrandAssetCategory;
  version: string | null;
  tags: string[] | null;
  notes: string | null;
  storageFileId: number;
  createdAt: Date;
  updatedAt: Date;
  fileKey: string;
  fileName: string;
  contentType: string | null;
  size: number;
};

export const listBrandAssets = createServerFn({ method: "GET" }).handler(
  async (): Promise<BrandAssetWithFile[]> => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { brandAssets, storageFiles } = await import("@/server/db/schema");
    const { desc, eq } = await import("drizzle-orm");
    const db = await getDb();
    const rows = await db
      .select({
        id: brandAssets.id,
        name: brandAssets.name,
        category: brandAssets.category,
        version: brandAssets.version,
        tags: brandAssets.tags,
        notes: brandAssets.notes,
        storageFileId: brandAssets.storageFileId,
        createdAt: brandAssets.createdAt,
        updatedAt: brandAssets.updatedAt,
        fileKey: storageFiles.key,
        fileName: storageFiles.fileName,
        contentType: storageFiles.contentType,
        size: storageFiles.size,
      })
      .from(brandAssets)
      .innerJoin(storageFiles, eq(brandAssets.storageFileId, storageFiles.id))
      .orderBy(desc(brandAssets.createdAt));
    return rows as BrandAssetWithFile[];
  },
);

export type CreateBrandAssetInput = {
  formData: FormData;
};

/** Uploads the attached file to storage (`assets/` folder) and creates the
 * brand asset record in one step, mirroring the upload pattern used by the
 * Document Pipeline and Import Wizard pages. */
export const createBrandAsset = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();

    const file = data.get("file") as File;
    const name = String(data.get("name") ?? "").trim();
    const category = String(
      data.get("category") ?? "other",
    ) as BrandAssetCategory;
    const version = (data.get("version") as string) || null;
    const notes = (data.get("notes") as string) || null;
    const tagsRaw = (data.get("tags") as string) || "";
    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (!file) throw new Error("A file is required");
    if (!name) throw new Error("A name is required");

    const { guessContentType } = await import("@/services/db/storageService");
    const contentType = file.type || guessContentType(file.name);
    const { uploadFile } = await import("@/server/s3/client");
    const key = `assets/${Date.now()}-${file.name}`;
    await uploadFile(key, file, { contentType: contentType ?? undefined });

    const { getDb } = await import("@/lib/db");
    const { storageFiles, brandAssets } = await import("@/server/db/schema");
    const db = await getDb();

    const [fileRow] = await db
      .insert(storageFiles)
      .values({
        key,
        fileName: file.name,
        folder: "assets",
        contentType,
        size: file.size,
      })
      .returning();

    const [assetRow] = await db
      .insert(brandAssets)
      .values({
        name,
        category,
        version,
        notes,
        tags: tags.length > 0 ? tags : null,
        storageFileId: fileRow.id,
      })
      .returning();

    return assetRow;
  });

export type UpdateBrandAssetInput = {
  id: number;
  name?: string;
  category?: BrandAssetCategory;
  version?: string | null;
  notes?: string | null;
  tags?: string[] | null;
};

export const updateBrandAsset = createServerFn({ method: "POST" })
  .inputValidator((input: UpdateBrandAssetInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { brandAssets } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const { id, ...rest } = data;
    const [row] = await db
      .update(brandAssets)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(brandAssets.id, id))
      .returning();
    return row;
  });

/** Deletes the brand asset record and its underlying storage file/object. */
export const deleteBrandAsset = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number; storageFileId: number }) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { brandAssets, storageFiles } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();

    // Deleting the brand_assets row first avoids a dangling FK error even
    // though the FK is ON DELETE CASCADE — this also lets us stay explicit
    // about the two things being removed together.
    await db.delete(brandAssets).where(eq(brandAssets.id, data.id));
    const [fileRow] = await db
      .select()
      .from(storageFiles)
      .where(eq(storageFiles.id, data.storageFileId));
    if (fileRow) {
      const { deleteFile } = await import("@/server/s3/client");
      await deleteFile(fileRow.key);
      await db.delete(storageFiles).where(eq(storageFiles.id, fileRow.id));
    }
  });
