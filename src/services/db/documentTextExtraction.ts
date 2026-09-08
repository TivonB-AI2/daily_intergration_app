/**
 * Best-effort, dependency-free text extraction for uploaded documents.
 *
 * This app has no PDF/DOCX parsing library installed (and none can be
 * added), so this hand-rolls just enough of the PDF and ZIP/OOXML formats
 * to pull raw text out, using only Node's built-in `zlib` (both formats
 * commonly use DEFLATE compression, which `zlib` already supports without
 * a third-party package).
 *
 * Known limitations (real, not hypothetical — documented so a failure here
 * reads as an honest "couldn't extract this" rather than silently
 * returning garbage):
 * - PDF: works well for PDFs with standard/simple text encoding. PDFs with
 *   subsetted/custom font encodings (common in PDFs exported from design
 *   tools), scanned/image-only pages, or encrypted content will yield
 *   little or no usable text — there's no CMap/ToUnicode decoding here,
 *   which a real PDF library would do.
 * - DOCX/ODT: reads the document's main XML part directly, so text content
 *   comes through reliably, but all formatting/images/tables-as-tables are
 *   discarded (returned as plain paragraphs).
 * - Legacy `.doc` (pre-2007 binary OLE format) is intentionally NOT
 *   supported — it isn't a ZIP or plain text and would require a much
 *   larger binary-format parser.
 */

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&");
}

// ---------------------------------------------------------------------------
// Minimal ZIP reader (DOCX and ODT are both ZIP archives of XML parts)
// ---------------------------------------------------------------------------

type ZipEntry = {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
};

function findEndOfCentralDirectory(buf: Buffer): number {
  const signature = 0x06054b50;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === signature) return i;
  }
  throw new Error(
    "Not a valid ZIP-based file (no end-of-central-directory record found)",
  );
}

function readCentralDirectory(buf: Buffer, eocdOffset: number): ZipEntry[] {
  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  let offset = buf.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;
    const compressionMethod = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const fileNameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const fileName = buf
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf-8");
    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntryData(
  buf: Buffer,
  entry: ZipEntry,
  zlib: typeof import("node:zlib"),
): Buffer {
  const lh = entry.localHeaderOffset;
  if (buf.readUInt32LE(lh) !== 0x04034b50) {
    throw new Error("Corrupt ZIP local file header");
  }
  const nameLength = buf.readUInt16LE(lh + 26);
  const extraLength = buf.readUInt16LE(lh + 28);
  const dataStart = lh + 30 + nameLength + extraLength;
  const data = buf.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.compressionMethod === 0) return Buffer.from(data);
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(data);
  throw new Error(
    `Unsupported ZIP compression method (${entry.compressionMethod})`,
  );
}

function readZipTextEntry(
  bytes: Uint8Array,
  entryName: string,
  zlib: typeof import("node:zlib"),
): string {
  const buf = Buffer.from(bytes);
  const eocd = findEndOfCentralDirectory(buf);
  const entries = readCentralDirectory(buf, eocd);
  const entry = entries.find((e) => e.fileName === entryName);
  if (!entry) {
    throw new Error(
      `"${entryName}" not found inside the archive — is this really a valid file of this type?`,
    );
  }
  return readZipEntryData(buf, entry, zlib).toString("utf-8");
}

export function extractDocxText(
  bytes: Uint8Array,
  zlib: typeof import("node:zlib"),
): string {
  const xml = readZipTextEntry(bytes, "word/document.xml", zlib);
  const paragraphs = xml
    .split(/<\/w:p>/)
    .map((p) => {
      const runs = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(
        (m) => m[1],
      );
      const tabs = p.includes("<w:tab") ? "\t" : "";
      return runs.join("") + tabs;
    })
    .filter((p) => p.trim().length > 0);
  return decodeXmlEntities(paragraphs.join("\n"));
}

export function extractOdtText(
  bytes: Uint8Array,
  zlib: typeof import("node:zlib"),
): string {
  const xml = readZipTextEntry(bytes, "content.xml", zlib);
  const paragraphs = xml
    .split(/<\/text:p>/)
    .map((p) => p.replace(/<[^>]+>/g, ""))
    .filter((p) => p.trim().length > 0);
  return decodeXmlEntities(paragraphs.join("\n"));
}

// ---------------------------------------------------------------------------
// Minimal PDF text extraction
// ---------------------------------------------------------------------------

function unescapePdfString(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

/** Converts a run of 4-hex-digit groups (each one UTF-16BE code unit, the
 * format `/ToUnicode` CMap destination values use) into a JS string. */
function hexToUtf16String(hex: string): string {
  const clean =
    hex.length % 4 === 0
      ? hex
      : hex.padStart(Math.ceil(hex.length / 4) * 4, "0");
  let out = "";
  for (let i = 0; i < clean.length; i += 4) {
    out += String.fromCharCode(Number.parseInt(clean.slice(i, i + 4), 16));
  }
  return out;
}

/** Parses a `/ToUnicode` CMap stream's `beginbfchar`/`beginbfrange` blocks
 * into a CID -> Unicode-string map, merging into `map`. This is what lets
 * hex-string text operands (`<...> Tj`) — the near-universal encoding for
 * PDFs with embedded/subset fonts, e.g. anything exported from Word, Google
 * Docs, or a browser's "Print to PDF" — decode into real characters instead
 * of raw glyph-index numbers. Only recognized as a CMap by its own content
 * (`beginbfchar`/`beginbfrange` markers), not by resolving `/ToUnicode N 0
 * R` object cross-references, since that would require a much larger
 * indirect-object resolver. */
function parseToUnicodeCMap(text: string, map: Map<number, string>): void {
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g,
    )) {
      map.set(Number.parseInt(pair[1], 16), hexToUtf16String(pair[2]));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1];
    for (const entry of body.matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([^\]]*)\]/g,
    )) {
      const start = Number.parseInt(entry[1], 16);
      const destinations = [...entry[3].matchAll(/<([0-9a-fA-F]+)>/g)];
      destinations.forEach((d, i) => {
        map.set(start + i, hexToUtf16String(d[1]));
      });
    }
    for (const entry of body.matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g,
    )) {
      const start = Number.parseInt(entry[1], 16);
      const end = Number.parseInt(entry[2], 16);
      const destStart = Number.parseInt(entry[3], 16);
      // Cap the expansion — a corrupt/huge range shouldn't hang extraction.
      const last = Math.min(end, start + 20_000);
      for (let code = start; code <= last; code++) {
        map.set(
          code,
          hexToUtf16String(
            (destStart + (code - start)).toString(16).padStart(4, "0"),
          ),
        );
      }
    }
  }
}

/** Decodes a single PDF string operand (the raw text between the
 * delimiters, delimiters included) — either a literal `(...)` string or a
 * hex `<...>` string. Hex strings are decoded 2 bytes (4 hex digits) at a
 * time via the document's `/ToUnicode` CID map when one was found;
 * otherwise each byte is treated as a raw Latin-1/WinAnsi character code
 * as a best-effort fallback (correct for many simple non-CID PDFs, wrong
 * for CID-encoded ones with no CMap — an inherent limitation without a
 * real font/encoding engine). */
function decodePdfStringOperand(
  operand: string,
  cidMap: Map<number, string> | null,
): string {
  if (operand.startsWith("(")) {
    return unescapePdfString(operand.slice(1, -1));
  }
  const hex = operand.slice(1, -1).replace(/\s+/g, "");
  if (hex.length === 0) return "";
  if (cidMap && cidMap.size > 0 && hex.length % 4 === 0) {
    let out = "";
    let mappedAny = false;
    for (let i = 0; i < hex.length; i += 4) {
      const mapped = cidMap.get(Number.parseInt(hex.slice(i, i + 4), 16));
      if (mapped != null) {
        out += mapped;
        mappedAny = true;
      }
    }
    if (mappedAny) return out;
  }
  let out = "";
  for (let i = 0; i + 2 <= hex.length; i += 2) {
    out += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

const PDF_STRING_OPERAND = /\((?:[^()\\]|\\.)*\)|<[0-9a-fA-F\s]*>/;

/** Pulls the text shown by `Tj`/`TJ` operators out of one decoded PDF
 * content stream, decoding both literal `(...)` and hex `<...>` string
 * operands. */
function extractTextFromContentStream(
  stream: string,
  cidMap: Map<number, string> | null,
): string {
  const pieces: string[] = [];
  const tjRegex = new RegExp(`(${PDF_STRING_OPERAND.source})\\s*Tj`, "g");
  for (const m of stream.matchAll(tjRegex)) {
    pieces.push(decodePdfStringOperand(m[1], cidMap));
  }
  const tjArrayRegex = /\[([^[\]]*)\]\s*TJ/g;
  const operandRegex = new RegExp(PDF_STRING_OPERAND.source, "g");
  for (const arrayMatch of stream.matchAll(tjArrayRegex)) {
    const strings = [...arrayMatch[1].matchAll(operandRegex)].map((m) =>
      decodePdfStringOperand(m[0], cidMap),
    );
    pieces.push(strings.join(""));
  }
  return pieces.join("\n");
}

type PdfStream = { dict: string; decoded: Buffer };

/** Finds every `<< ... >> stream ... endstream` block in the raw PDF bytes
 * and inflates the `/FlateDecode`-compressed ones (or takes uncompressed
 * ones as-is) — used for both content streams and `/ToUnicode` CMap
 * streams, since both are just PDF streams. */
function collectPdfStreams(
  buf: Buffer,
  zlib: typeof import("node:zlib"),
): PdfStream[] {
  const latin1 = buf.toString("latin1");
  const streamRegex = /<<([^>]*)>>\s*stream\r?\n/g;
  const streams: PdfStream[] = [];
  let match: RegExpExecArray | null = streamRegex.exec(latin1);
  while (match !== null) {
    const dict = match[1];
    const dataStart = match.index + match[0].length;
    const endIdx = latin1.indexOf("endstream", dataStart);
    if (endIdx === -1) break;
    // Trim the trailing EOL that precedes "endstream".
    let rawEnd = endIdx;
    if (latin1[rawEnd - 1] === "\n") rawEnd--;
    if (latin1[rawEnd - 1] === "\r") rawEnd--;
    const rawBytes = buf.subarray(dataStart, rawEnd);

    let decoded: Buffer | null = null;
    if (dict.includes("/FlateDecode")) {
      try {
        decoded = zlib.inflateSync(rawBytes);
      } catch {
        decoded = null; // corrupt/partial stream — skip it, not fatal
      }
    } else if (!dict.includes("/Filter")) {
      decoded = Buffer.from(rawBytes);
    }
    if (decoded) streams.push({ dict, decoded });
    streamRegex.lastIndex = endIdx + "endstream".length;
    match = streamRegex.exec(latin1);
  }
  return streams;
}

export function extractPdfText(
  bytes: Uint8Array,
  zlib: typeof import("node:zlib"),
): string {
  const buf = Buffer.from(bytes);
  const streams = collectPdfStreams(buf, zlib);

  // Pass 1: build a CID -> Unicode map from every embedded /ToUnicode CMap
  // (there may be one per font) before extracting any text, since a CMap
  // can appear anywhere relative to the content streams that need it.
  const cidMap = new Map<number, string>();
  for (const s of streams) {
    const text = s.decoded.toString("latin1");
    if (text.includes("beginbfchar") || text.includes("beginbfrange")) {
      parseToUnicodeCMap(text, cidMap);
    }
  }

  // Pass 2: extract text from streams that look like content streams
  // (contain a text-showing operator) using the now-complete map.
  const textChunks: string[] = [];
  for (const s of streams) {
    const text = s.decoded.toString("latin1");
    if (/\bT[Jj]\b/.test(text)) {
      const extracted = extractTextFromContentStream(
        text,
        cidMap.size > 0 ? cidMap : null,
      );
      if (extracted.trim()) textChunks.push(extracted);
    }
  }
  return textChunks.join("\n\n");
}

export type ExtractableFormat = "text" | "pdf" | "docx" | "odt";

/** Maps a file extension to which extraction path applies. Extensions not
 * listed here aren't offered in the upload picker at all (see
 * `ACCEPTED_FILE_EXTENSIONS` in `documentPipelineService.ts`). */
export function formatForExtension(ext: string): ExtractableFormat | null {
  switch (ext.toLowerCase()) {
    case ".txt":
    case ".md":
    case ".csv":
    case ".json":
    case ".rtf":
      return "text";
    case ".pdf":
      return "pdf";
    case ".docx":
      return "docx";
    case ".odt":
      return "odt";
    default:
      return null;
  }
}

const MIN_USABLE_EXTRACTED_CHARS = 20;

/** Extracts raw text from an uploaded file's bytes based on its extension,
 * throwing a clear, specific error (rather than returning garbled binary
 * as if it were real text) when extraction isn't possible for this
 * particular file. Dynamically imports `node:zlib` itself (rather than
 * requiring callers to pass it in) so callers can stay simple. */
export async function extractRawText(
  bytes: Uint8Array,
  fileName: string,
): Promise<string> {
  const ext = `.${fileName.split(".").pop()?.toLowerCase() ?? ""}`;
  const format = formatForExtension(ext);
  let text: string;
  switch (format) {
    case "pdf": {
      const zlib = await import("node:zlib");
      text = extractPdfText(bytes, zlib);
      break;
    }
    case "docx": {
      const zlib = await import("node:zlib");
      text = extractDocxText(bytes, zlib);
      break;
    }
    case "odt": {
      const zlib = await import("node:zlib");
      text = extractOdtText(bytes, zlib);
      break;
    }
    case "text":
    default:
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      break;
  }
  if (format !== "text" && text.trim().length < MIN_USABLE_EXTRACTED_CHARS) {
    throw new Error(
      `Couldn't extract readable text from this ${ext.slice(1).toUpperCase()} file. It may be scanned/image-based, encrypted, or use a font/format this app's lightweight built-in parser doesn't support (there's no full PDF/Office parsing library installed). Try re-saving it as a plain .txt file instead.`,
    );
  }
  return text;
}
