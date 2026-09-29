// Minimal RFC 4180 CSV reader/writer: handles quoted fields, escaped quotes (""),
// commas and line breaks inside quotes, CRLF line endings, and a UTF-8 BOM.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  text = text.replace(/^﻿/, "");

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (inQuotes) throw new Error("CSV has an unclosed quoted field.");

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// Returns { columns, rows } where each row is an object keyed by lower-cased header names.
export function readCsv(text) {
  const [header = [], ...rows] = parseCsv(text ?? "");
  const columns = header.map((h) => h.trim().toLowerCase());
  return {
    columns,
    rows: rows.map((cells) =>
      Object.fromEntries(columns.map((key, i) => [key, (cells[i] ?? "").replace(/\r\n/g, "\n").trim()]))
    ),
  };
}

function escapeField(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns, rows) {
  return [columns, ...rows.map((row) => columns.map((column) => row[column]))]
    .map((cells) => cells.map(escapeField).join(","))
    .join("\n") + "\n";
}
