// Output formatters. Pure string in / string out — trivially testable.

export { toCSV, toJSON, toNDJSON, valuesToText, download };

function csvCell(value) {
  const s = value == null ? "" : String(value);
  // Quote if the cell contains a comma, quote, or newline; double inner quotes.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCSV(records, columns) {
  const cols = columns && columns.length
    ? columns
    : Array.from(new Set(records.flatMap((r) => Object.keys(r))));
  const head = cols.map(csvCell).join(",");
  const body = records.map((r) => cols.map((c) => csvCell(r[c])).join(",")).join("\r\n");
  return records.length ? `${head}\r\n${body}` : head;
}

function toJSON(records) {
  return JSON.stringify(records, null, 2);
}

function toNDJSON(records) {
  return records.map((r) => JSON.stringify(r)).join("\n");
}

// Simple-mode values → one per line (or a custom joiner).
function valuesToText(values, joiner = "\n") {
  return (values || []).join(joiner);
}

// Browser-only: trigger a file download. No-op guard so importing in Node is safe.
function download(filename, text, mime = "text/plain;charset=utf-8") {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
