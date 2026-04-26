import { Submission } from '../types';

/**
 * Escapes a single cell value for RFC 4180 CSV.
 * - null/undefined  → ""
 * - arrays          → comma-joined (then escaped if it contains delimiters)
 * - objects         → JSON.stringify
 * - strings with "  → doubled inside double-quotes
 * - strings with , or newlines → wrapped in double-quotes
 */
export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str: string;
  if (Array.isArray(value)) {
    str = value.map(v => (v == null ? '' : String(v))).join(', ');
  } else if (typeof value === 'object') {
    str = JSON.stringify(value);
  } else {
    str = String(value);
  }
  // RFC 4180: wrap in quotes if the cell contains a comma, quote, or newline.
  // Inside a quoted cell, a literal " is escaped by doubling it.
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializes an array of submissions to a CSV string with a header row built
 * from the union of all keys (so submissions with sparse fields don't lose
 * columns). Returns a string ready to be written to a Blob and downloaded.
 *
 * The first column is always `id` so each row is identifiable; remaining
 * columns appear in the order keys are first encountered across the input.
 */
export function submissionsToCsv(rows: Submission[]): string {
  if (rows.length === 0) return '';

  const headerSet = new Set<string>();
  rows.forEach(r => Object.keys(r).forEach(k => headerSet.add(k)));

  // Stable, friendly column order: id first, then everything else in
  // first-encounter order.
  const headers = ['id', ...Array.from(headerSet).filter(h => h !== 'id')];

  const headerLine = headers.join(',');
  const dataLines = rows.map(r =>
    headers.map(h => escapeCell((r as any)[h])).join(',')
  );

  // RFC 4180 specifies CRLF line endings; Excel/Sheets/Numbers all accept it.
  return [headerLine, ...dataLines].join('\r\n');
}

/**
 * Triggers a browser download of the given CSV string. Returns the filename
 * for caller-side messaging.
 */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
