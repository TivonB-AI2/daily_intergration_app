import { createServerFn } from "@tanstack/react-start";

/**
 * Downloads an image's raw bytes from S3 server-side and returns them as a
 * data URL. The bucket has no CORS policy, so a browser can't safely
 * `fetch()`/canvas-sample a presigned S3 URL directly (tainted canvas) —
 * routing through a same-origin data URL sidesteps that entirely, since a
 * data URI has no cross-origin restrictions for canvas pixel reads.
 */
export const getImageAsDataUrl = createServerFn({ method: "POST" })
  .inputValidator((input: { key: string; contentType: string }) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { downloadFile } = await import("@/server/s3/client");
    const bytes = await downloadFile(data.key);
    if (!bytes) throw new Error("File not found in storage.");
    const base64 = Buffer.from(bytes).toString("base64");
    return { dataUrl: `data:${data.contentType};base64,${base64}` };
  });
