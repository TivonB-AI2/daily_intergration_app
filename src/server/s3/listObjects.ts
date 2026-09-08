import "@tanstack/react-start/server-only";

import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

/**
 * Lists every object actually present in this app's S3 storage prefix,
 * across every folder (uploads/, exports/, assets/, and any other prefix
 * written directly by app or agent code, e.g. exports/backups/).
 *
 * The shared `@/server/s3/client` helper (base-owned, read-only) only
 * exposes upload/download/delete/presign for a *known* key — there's no
 * "list objects" call there. This is a small app-owned sibling that builds
 * its own S3Client from the same `S3_*` env vars (see `@/server/s3/client`
 * for the full credential-refresh contract) purely to call
 * `ListObjectsV2Command`. Kept intentionally simple (no proactive
 * credential refresh) since listing is a light, occasional read.
 */

export type BucketObject = {
  key: string;
  size: number;
  lastModified: Date | null;
};

function readConfig() {
  return {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    bucket: process.env.S3_BUCKET,
    prefix: process.env.S3_PREFIX,
  };
}

async function listOnce(): Promise<BucketObject[]> {
  const cfg = readConfig();
  if (!cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket) {
    throw new Error("S3 is not configured");
  }

  const client = new S3Client({
    region: cfg.region ?? "us-east-1",
    endpoint: cfg.endpoint,
    forcePathStyle: Boolean(cfg.endpoint),
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      sessionToken: cfg.sessionToken,
    },
  });

  const prefix = (cfg.prefix ?? "").replace(/\/+$/, "");
  const objects: BucketObject[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucket,
        Prefix: prefix ? `${prefix}/` : undefined,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue;
      const relativeKey = prefix ? obj.Key.slice(prefix.length + 1) : obj.Key;
      if (!relativeKey || relativeKey.endsWith("/")) continue; // skip folder placeholders
      objects.push({
        key: relativeKey,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified ?? null,
      });
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

/** Lists every object in the app's storage, retrying once after a credential refresh on failure. */
export async function listAllBucketObjects(): Promise<BucketObject[]> {
  try {
    return await listOnce();
  } catch (err) {
    const { refreshS3Credentials } = await import("@/server/s3/client");
    const refreshed = await refreshS3Credentials();
    if (!refreshed) throw err;
    return listOnce();
  }
}
