import { createServerFn } from "@tanstack/react-start";

export type StorageFolder = "uploads" | "exports" | "assets";

/** Common file extension -> MIME type, used to guess a preview-friendly type
 * for objects found directly in storage that were never uploaded through
 * `uploadStorageFile` (so have no `contentType` on record). */
const EXTENSION_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  log: "text/plain",
  xml: "application/xml",
  html: "text/html",
};

export function guessContentType(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext ? (EXTENSION_MIME[ext] ?? null) : null;
}

/** A file found in storage, whether or not it has a matching `storage_files`
 * database row (e.g. backups, or anything else written directly to S3). */
export type StorageEntry = {
  id: number | null;
  key: string;
  fileName: string;
  folder: string;
  contentType: string | null;
  size: number;
  tags: string[] | null;
  extractedText: string | null;
  createdAt: Date;
  tracked: boolean;
};

/**
 * Lists every file actually present in this app's storage — every folder,
 * not just the ones the app itself uploaded through `uploadStorageFile`
 * (e.g. database backups written straight to `exports/backups/`, or assets
 * the agent placed directly in `assets/`). Merges the live S3 listing with
 * the `storage_files` table so already-tracked files keep their tags/notes.
 */
export const listAllStorageObjects = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();

    const { getDb } = await import("@/lib/db");
    const { storageFiles } = await import("@/server/db/schema");
    const db = await getDb();
    const tracked = await db.select().from(storageFiles);
    const trackedByKey = new Map(tracked.map((row) => [row.key, row]));

    const { listAllBucketObjects } = await import("@/server/s3/listObjects");
    const objects = await listAllBucketObjects();

    const entries: StorageEntry[] = objects.map((obj) => {
      const dbRow = trackedByKey.get(obj.key);
      if (dbRow) {
        return {
          id: dbRow.id,
          key: dbRow.key,
          fileName: dbRow.fileName,
          folder: dbRow.folder,
          contentType: dbRow.contentType,
          size: dbRow.size,
          tags: dbRow.tags,
          extractedText: dbRow.extractedText,
          createdAt: dbRow.createdAt,
          tracked: true,
        };
      }
      const fileName = obj.key.split("/").pop() || obj.key;
      return {
        id: null,
        key: obj.key,
        fileName,
        folder: obj.key.includes("/") ? obj.key.split("/")[0] : "(root)",
        contentType: guessContentType(fileName),
        size: obj.size,
        tags: null,
        extractedText: null,
        createdAt: obj.lastModified ?? new Date(),
        tracked: false,
      };
    });

    // A DB row whose S3 object wasn't found in the listing (e.g. listing lag
    // right after upload) should still show up rather than disappear.
    const foundKeys = new Set(objects.map((o) => o.key));
    for (const row of tracked) {
      if (!foundKeys.has(row.key)) {
        entries.push({
          id: row.id,
          key: row.key,
          fileName: row.fileName,
          folder: row.folder,
          contentType: row.contentType,
          size: row.size,
          tags: row.tags,
          extractedText: row.extractedText,
          createdAt: row.createdAt,
          tracked: true,
        });
      }
    }

    entries.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return entries;
  },
);

/** Deletes a storage object that has no matching `storage_files` row. */
export const deleteUntrackedStorageObject = createServerFn({ method: "POST" })
  .inputValidator((key: string) => key)
  .handler(async ({ data: key }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { deleteFile } = await import("@/server/s3/client");
    await deleteFile(key);
  });

/** Looks up an existing tracked file with the same name in the same
 * folder — used before upload to ask the user whether to replace it
 * instead of silently creating a same-named duplicate. */
export const findExistingStorageFile = createServerFn({ method: "GET" })
  .inputValidator((input: { fileName: string; folder: StorageFolder }) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { storageFiles } = await import("@/server/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .select()
      .from(storageFiles)
      .where(
        and(
          eq(storageFiles.fileName, data.fileName),
          eq(storageFiles.folder, data.folder),
        ),
      )
      .limit(1);
    return row ?? null;
  });

export const uploadStorageFile = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const file = data.get("file") as File;
    const folder = (data.get("folder") as StorageFolder) || "uploads";
    // When set, this upload replaces an existing tracked file: the old S3
    // object + row are removed once the new one is safely written.
    const replaceIdRaw = data.get("replaceId");
    const replaceId =
      typeof replaceIdRaw === "string" && replaceIdRaw
        ? Number(replaceIdRaw)
        : null;
    // Browsers don't always report a file's `type` (empty string is common
    // for e.g. drag-and-drop from some OSes, or less common extensions) —
    // fall back to guessing from the extension so the file still gets a
    // real content type on record, instead of one that makes the preview
    // dialog treat a genuine PDF/image/etc. as an unrecognized file.
    const contentType = file.type || guessContentType(file.name);
    const { uploadFile, deleteFile } = await import("@/server/s3/client");
    const key = `${folder}/${Date.now()}-${file.name}`;
    await uploadFile(key, file, { contentType: contentType ?? undefined });

    const { getDb } = await import("@/lib/db");
    const { storageFiles } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();

    if (replaceId !== null) {
      const [existing] = await db
        .select()
        .from(storageFiles)
        .where(eq(storageFiles.id, replaceId));
      if (existing) {
        await deleteFile(existing.key);
        await db.delete(storageFiles).where(eq(storageFiles.id, replaceId));
      }
    }

    const [row] = await db
      .insert(storageFiles)
      .values({
        key,
        fileName: file.name,
        folder,
        contentType,
        size: file.size,
      })
      .returning();
    return row;
  });

export type DuplicateStorageGroup = {
  fileName: string;
  folder: string;
  files: {
    id: number | null;
    key: string;
    size: number;
    createdAt: Date;
    tracked: boolean;
  }[];
};

/** Groups files that share the same name within the same folder — surfaces
 * accidental duplicate uploads for review/cleanup on the Storage page. */
export const findDuplicateStorageFiles = createServerFn({
  method: "GET",
}).handler(async (): Promise<DuplicateStorageGroup[]> => {
  const { requireAppAccess } = await import("@/server/protectedServerFn");
  await requireAppAccess();
  const entries = await listAllStorageObjects();

  const groups = new Map<string, DuplicateStorageGroup>();
  for (const entry of entries) {
    const groupKey = `${entry.folder}::${entry.fileName}`;
    const group = groups.get(groupKey);
    const item = {
      id: entry.id,
      key: entry.key,
      size: entry.size,
      createdAt: entry.createdAt,
      tracked: entry.tracked,
    };
    if (group) {
      group.files.push(item);
    } else {
      groups.set(groupKey, {
        fileName: entry.fileName,
        folder: entry.folder,
        files: [item],
      });
    }
  }

  return Array.from(groups.values())
    .filter((g) => g.files.length > 1)
    .map((g) => ({
      ...g,
      files: g.files.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }));
});

export const getStorageFileUrl = createServerFn({ method: "POST" })
  .inputValidator((key: string) => key)
  .handler(async ({ data: key }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getPresignedUrl } = await import("@/server/s3/client");
    return { url: await getPresignedUrl(key, { expiresIn: 3600 }) };
  });

const MAX_PREVIEW_TEXT_BYTES = 200_000;

/**
 * Reads a file's bytes directly from S3 on the server and returns them as
 * text, for previewing text-like files. Browsers can't reliably `fetch()` a
 * presigned S3 URL client-side (the bucket has no CORS policy, so a
 * cross-origin fetch is blocked) — reading it server-side avoids that
 * entirely, since <img>/<video>/<iframe> tags don't need CORS but fetch does.
 */
export const getStorageFileText = createServerFn({ method: "POST" })
  .inputValidator((key: string) => key)
  .handler(async ({ data: key }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { downloadFile } = await import("@/server/s3/client");
    const bytes = await downloadFile(key);
    if (!bytes) throw new Error("File not found in storage");
    const text = new TextDecoder("utf-8", { fatal: false }).decode(
      bytes.slice(0, MAX_PREVIEW_TEXT_BYTES),
    );
    return { text, truncated: bytes.length > MAX_PREVIEW_TEXT_BYTES };
  });

export const deleteStorageFile = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number; key: string }) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { deleteFile } = await import("@/server/s3/client");
    await deleteFile(data.key);

    const { getDb } = await import("@/lib/db");
    const { storageFiles } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(storageFiles).where(eq(storageFiles.id, data.id));
  });

export const updateStorageFileMeta = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { id: number; tags?: string[]; extractedText?: string | null }) =>
      input,
  )
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { storageFiles } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .update(storageFiles)
      .set({
        ...(data.tags !== undefined ? { tags: data.tags } : {}),
        ...(data.extractedText !== undefined
          ? { extractedText: data.extractedText }
          : {}),
      })
      .where(eq(storageFiles.id, data.id))
      .returning();
    return row;
  });
