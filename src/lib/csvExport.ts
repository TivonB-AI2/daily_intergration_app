/** Escapes a single CSV field, quoting it if it contains commas, quotes, or newlines. */
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts an array of flat objects into a CSV string. `columns` controls
 * column order/labels; if omitted, the keys of the first row are used as-is.
 * Pure string logic — safe to use on both the server and the client.
 */
export function rowsToCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns?: { key: keyof T; label: string }[],
): string {
  const cols =
    columns ??
    Object.keys(rows[0] ?? {}).map((k) => ({ key: k as keyof T, label: k }));
  const header = cols.map((c) => escapeCsvField(c.label)).join(",");
  const lines = rows.map((row) =>
    cols.map((c) => escapeCsvField(row[c.key])).join(","),
  );
  return [header, ...lines].join("\n");
}

/**
 * Converts an array of flat objects into a CSV string and triggers a browser
 * download. `columns` controls column order/labels; if omitted, the keys of
 * the first row are used as-is.
 */
export function downloadCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns?: { key: keyof T; label: string }[],
) {
  if (typeof window === "undefined") return;
  const csv = rowsToCsv(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
