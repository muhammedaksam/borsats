export type OutputFormat = "table" | "json" | "csv";

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    if (isNaN(value)) return "NaN";
    return Number.isInteger(value)
      ? String(value)
      : value.toFixed(4).replace(/\.?0+$/, "");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatJSON(data: unknown): string {
  return JSON.stringify(
    data,
    (_key, val) => (val instanceof Date ? val.toISOString() : val),
    2,
  );
}

export function formatCSV(
  rows: Record<string, unknown>[],
  columns?: string[],
): string {
  if (!rows || rows.length === 0) return "";
  const cols =
    columns && columns.length > 0
      ? columns
      : Array.from(
          rows.reduce((set, row) => {
            Object.keys(row).forEach((k) => set.add(k));
            return set;
          }, new Set<string>()),
        );
  const header = cols.map(escapeCsvCell).join(",");
  const lines = rows.map((row) =>
    cols.map((c) => escapeCsvCell(stringifyCell(row[c]))).join(","),
  );
  return [header, ...lines].join("\n");
}

export function formatTable(
  rows: Record<string, unknown>[],
  columns?: string[],
): string {
  if (!rows || rows.length === 0) return "No data found.";
  const cols =
    columns && columns.length > 0
      ? columns
      : Array.from(
          rows.reduce((set, row) => {
            Object.keys(row).forEach((k) => set.add(k));
            return set;
          }, new Set<string>()),
        );

  const matrix = rows.map((row) => cols.map((c) => stringifyCell(row[c])));
  const widths = cols.map((col, idx) =>
    Math.max(col.length, ...matrix.map((r) => r[idx].length)),
  );

  const pad = (text: string, width: number) => text.padEnd(width, " ");
  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  const header = cols.map((c, i) => pad(c, widths[i])).join(" | ");
  const body = matrix
    .map((row) => row.map((cell, i) => pad(cell, widths[i])).join(" | "))
    .join("\n");

  return `${header}\n${sep}\n${body}`;
}

export function formatOutput(
  data: unknown,
  format: OutputFormat = "table",
  columns?: string[],
): string {
  if (format === "json") {
    return formatJSON(data);
  }

  let rows: Record<string, unknown>[];
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return format === "csv" ? "" : "No data found.";
    }
    if (typeof data[0] === "object" && data[0] !== null) {
      rows = data as Record<string, unknown>[];
    } else {
      rows = data.map((v) => ({ value: v }));
    }
  } else if (data && typeof data === "object") {
    rows = Object.entries(data as Record<string, unknown>).map(([k, v]) => ({
      field: k,
      value: v,
    }));
  } else {
    return stringifyCell(data);
  }

  if (format === "csv") {
    return formatCSV(rows, columns);
  }
  return formatTable(rows, columns);
}
