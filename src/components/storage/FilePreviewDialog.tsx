import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CodeBlockCode } from "@/components/ui/code-block";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, FileWarning, Info, WrapText } from "lucide-react";
import { parseCsv } from "@/lib/csvImport";

/** Maps a file extension to a Shiki grammar name for syntax-highlighted text
 * preview — falls back to plain "text" (no highlighting, just monospace)
 * for anything not in this map, which Shiki also renders fine. */
const EXTENSION_LANGUAGE: Record<string, string> = {
  json: "json",
  xml: "xml",
  html: "html",
  md: "markdown",
  csv: "text",
  log: "text",
  txt: "text",
};

function languageForFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return (ext && EXTENSION_LANGUAGE[ext]) || "text";
}

function isCsvFile(contentType: string | null, fileName: string): boolean {
  if (contentType === "text/csv") return true;
  return /\.csv$/i.test(fileName);
}

/** Caps how many parsed CSV rows are actually rendered as table rows — a
 * large file's preview text is already capped upstream by `getText`
 * (server-side truncation), but this adds a second, cheap safety net so a
 * pathologically wide/long truncated chunk can't still render thousands of
 * DOM rows. */
const CSV_PREVIEW_ROW_LIMIT = 200;

export type PreviewFile = {
  key: string;
  fileName: string;
  contentType: string | null;
};

const TEXT_LIKE_TYPES = [
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "text/html",
  "text/xml",
  "application/xml",
  "text/x-log",
];

function isTextLike(contentType: string | null, fileName: string) {
  if (contentType && TEXT_LIKE_TYPES.includes(contentType)) return true;
  if (contentType?.startsWith("text/")) return true;
  return /\.(txt|md|csv|json|log|xml|html)$/i.test(fileName);
}

const GENERIC_CONTENT_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
]);

/** A stored `contentType` of "" (browsers don't always report a file's type)
 * or a generic binary type isn't useful for deciding how to preview a file —
 * fall back to guessing from the extension in that case, purely for the
 * preview dialog's own rendering choice (doesn't change what's on record). */
function effectiveContentType(
  contentType: string | null,
  fileName: string,
): string | null {
  if (contentType && !GENERIC_CONTENT_TYPES.has(contentType))
    return contentType;
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext ? (EXTENSION_MIME_FALLBACK[ext] ?? contentType) : contentType;
}

const EXTENSION_MIME_FALLBACK: Record<string, string> = {
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

/**
 * Preview dialog for a file already stored in Storage. Fetches a fresh
 * presigned URL via `getUrl` and renders an inline preview based on the
 * file's content type: image, PDF, audio/video, or plain text. Falls back to
 * a "no preview available" message with a download link for anything else.
 */
export function FilePreviewDialog({
  open,
  onOpenChange,
  file,
  getUrl,
  getText,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: PreviewFile | null;
  getUrl: (key: string) => Promise<{ url: string }>;
  getText: (key: string) => Promise<{ text: string; truncated: boolean }>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textTruncated, setTextTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [wrapCsvText, setWrapCsvText] = useState(false);

  useEffect(() => {
    if (!open || !file) {
      setUrl(null);
      setTextContent(null);
      setTextTruncated(false);
      setError(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    setTextContent(null);
    setTextTruncated(false);
    (async () => {
      try {
        const { url: presignedUrl } = await getUrl(file.key);
        if (cancelled) return;
        setUrl(presignedUrl);
        if (
          isTextLike(
            effectiveContentType(file.contentType, file.fileName),
            file.fileName,
          )
        ) {
          // Read the text server-side (a browser `fetch()` against the
          // presigned S3 URL would be blocked — the bucket has no CORS
          // policy for cross-origin `fetch`, only for direct resource loads
          // like <img>/<video>/<iframe>).
          const { text, truncated } = await getText(file.key);
          if (!cancelled) {
            setTextContent(text);
            setTextTruncated(truncated);
          }
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, file, getUrl, getText]);

  const resolvedContentType = file
    ? effectiveContentType(file.contentType, file.fileName)
    : null;
  const isImage = resolvedContentType?.startsWith("image/");
  const isPdf = resolvedContentType === "application/pdf";
  const isVideo = resolvedContentType?.startsWith("video/");
  const isAudio = resolvedContentType?.startsWith("audio/");
  const isText = file ? isTextLike(resolvedContentType, file.fileName) : false;
  const isCsv = file ? isCsvFile(resolvedContentType, file.fileName) : false;
  const canPreview = isImage || isPdf || isVideo || isAudio || isText;

  const csvRows = isCsv && textContent !== null ? parseCsv(textContent) : null;
  const csvColumns =
    csvRows && csvRows.length > 0 ? Object.keys(csvRows[0]) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={isText ? "sm:max-w-4xl" : "sm:max-w-3xl"}>
        <DialogHeader>
          <DialogTitle>{file?.fileName ?? "Preview"}</DialogTitle>
          <DialogDescription>
            {file?.contentType || "Unknown type"}
          </DialogDescription>
        </DialogHeader>

        {isText && textTruncated && (
          <Alert>
            <Info />
            <AlertDescription>
              This file is large — only the first portion is shown below. Use
              "Open / Download" to see the full file.
            </AlertDescription>
          </Alert>
        )}

        {isCsv && csvRows && csvRows.length > 0 && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWrapCsvText((w) => !w)}
            >
              <WrapText />
              {wrapCsvText ? "Wrap text: on" : "Wrap text: off"}
            </Button>
          </div>
        )}

        <div
          className={
            isText
              ? "max-h-[75vh] overflow-auto rounded-md border"
              : "max-h-[70vh] overflow-auto rounded-md border bg-muted/30"
          }
        >
          {loading ? (
            <Skeleton className="h-80 w-full" />
          ) : error || (isText ? textContent === null : !url) ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <FileWarning className="size-8" />
              <p className="text-sm">Couldn't load a preview for this file.</p>
            </div>
          ) : !canPreview ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <FileWarning className="size-8" />
              <p className="text-sm">
                No inline preview available for this file type.
              </p>
              <p className="text-xs">
                Use "Open / Download" below to view it in your device's own app.
              </p>
            </div>
          ) : isImage ? (
            <img
              src={url ?? undefined}
              alt={file?.fileName}
              className="mx-auto max-h-[70vh] w-auto object-contain"
              onError={() => setError(true)}
            />
          ) : isPdf ? (
            <iframe
              title={file?.fileName}
              src={url ?? undefined}
              className="h-[70vh] w-full"
              onError={() => setError(true)}
            />
          ) : isVideo ? (
            // biome-ignore lint/a11y/useMediaCaption: previewing an arbitrary uploaded file, captions aren't available
            <video
              src={url ?? undefined}
              controls
              className="mx-auto max-h-[70vh] w-full"
              onError={() => setError(true)}
            />
          ) : isAudio ? (
            // biome-ignore lint/a11y/useMediaCaption: previewing an arbitrary uploaded file, captions aren't available
            <audio
              src={url ?? undefined}
              controls
              className="w-full p-4"
              onError={() => setError(true)}
            />
          ) : isCsv && csvRows && csvRows.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {csvColumns.map((col) => (
                      <TableHead
                        key={col}
                        className={
                          wrapCsvText
                            ? "whitespace-normal break-words align-top"
                            : "whitespace-nowrap"
                        }
                      >
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvRows.slice(0, CSV_PREVIEW_ROW_LIMIT).map((row, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static preview snapshot, rows never reorder
                    <TableRow key={i}>
                      {csvColumns.map((col) => (
                        <TableCell
                          key={col}
                          className={
                            wrapCsvText
                              ? "whitespace-normal break-words align-top text-sm"
                              : "whitespace-nowrap text-sm"
                          }
                        >
                          {row[col]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {csvRows.length > CSV_PREVIEW_ROW_LIMIT && (
                <p className="p-3 text-xs text-muted-foreground">
                  Showing the first {CSV_PREVIEW_ROW_LIMIT} of {csvRows.length}{" "}
                  rows in this preview chunk.
                </p>
              )}
            </div>
          ) : (
            <CodeBlockCode
              code={textContent ?? ""}
              language={file ? languageForFileName(file.fileName) : "text"}
              theme="css-variables"
              className="text-sm leading-relaxed [&>pre]:whitespace-pre-wrap [&>pre]:break-words [&>pre]:px-4 [&>pre]:py-4"
            />
          )}
        </div>

        <DialogFooter>
          {url && (
            <Button
              variant="outline"
              render={<a href={url} target="_blank" rel="noreferrer" />}
            >
              <Download />
              Open / Download
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
