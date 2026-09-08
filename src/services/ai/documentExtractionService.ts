import { createServerFn } from "@tanstack/react-start";

/**
 * Extracts plain text from an uploaded file's bytes, reusing the same
 * hand-rolled PDF/DOCX/ODT extractor the Document Intelligence Pipeline
 * uses (see `documentTextExtraction.ts`). Runs server-side because the
 * extractor depends on Node's built-in `zlib`, which isn't available in
 * the browser.
 */
export const extractUploadedDocumentText = createServerFn({ method: "POST" })
  .inputValidator((input: { fileName: string; base64: string }) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { extractRawText } = await import(
      "@/services/db/documentTextExtraction"
    );
    const bytes = Buffer.from(data.base64, "base64");
    const text = await extractRawText(new Uint8Array(bytes), data.fileName);
    return { text };
  });
