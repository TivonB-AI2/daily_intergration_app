import { createServerFn } from "@tanstack/react-start";

/**
 * Reads image/GIF assets directly out of the S3 "themes/" folder (curated
 * background art, not app-managed uploads — there are no `storage_files` DB
 * rows for these). Used by the Gallery page (browse) and the Theme
 * Generator (auto-generated animated theme cards + the image/GIF picker).
 */

export type ThemeGalleryFile = {
  key: string; // relative key, e.g. "themes/neon.gif"
  fileName: string;
  contentType: string;
  size: number;
};

function guessContentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "gif":
      return "image/gif";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

export const listThemeGalleryFiles = createServerFn({ method: "GET" }).handler(
  async (): Promise<ThemeGalleryFile[]> => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { S3Client, ListObjectsV2Command } = await import(
      "@aws-sdk/client-s3"
    );

    const client = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: Boolean(process.env.S3_ENDPOINT),
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY as string,
        secretAccessKey: process.env.S3_SECRET_KEY as string,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      },
    });

    const prefixNormalized = `${(process.env.S3_PREFIX ?? "").replace(/\/+$/, "")}/`;
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: process.env.S3_BUCKET,
        Prefix: `${prefixNormalized}themes/`,
      }),
    );

    return (res.Contents ?? [])
      .filter((o) => o.Key && !o.Key.endsWith("/") && !o.Key.endsWith(".keep"))
      .map((o) => {
        const fullKey = o.Key as string;
        const key = fullKey.startsWith(prefixNormalized)
          ? fullKey.slice(prefixNormalized.length)
          : fullKey;
        const fileName = key.split("/").pop() ?? key;
        return {
          key,
          fileName,
          contentType: guessContentType(fileName),
          size: o.Size ?? 0,
        };
      })
      .filter((f) => f.contentType.startsWith("image/"));
  },
);

export const getThemeGalleryFileUrl = createServerFn({ method: "POST" })
  .inputValidator((key: string) => key)
  .handler(async ({ data: key }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getPresignedUrl } = await import("@/server/s3/client");
    return { url: await getPresignedUrl(key, { expiresIn: 3600 }) };
  });
