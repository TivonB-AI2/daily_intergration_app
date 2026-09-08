/**
 * Minimal CSV parser matching the format written by `rowsToCsv` (see
 * `@/lib/csvExport`): comma-separated, double-quote-wrapped fields when a
 * value contains a comma/quote/newline, doubled quotes for an escaped quote.
 * Returns an array of row objects keyed by the header row.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // swallow, \n handles the line break
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];

  const header = rows[0];
  return rows.slice(1).map((cols) => {
    const obj: Record<string, string> = {};
    header.forEach((key, idx) => {
      obj[key] = cols[idx] ?? "";
    });
    return obj;
  });
}

export function csvValueToNullableString(v: string | undefined): string | null {
  if (v === undefined || v === "") return null;
  return v;
}

export function csvValueToNullableInt(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export function csvValueToDate(v: string | undefined): Date {
  const d = v ? new Date(v) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function csvValueToNullableDate(v: string | undefined): Date | null {
  if (v === undefined || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
