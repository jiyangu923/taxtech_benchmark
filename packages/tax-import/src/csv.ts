export type CsvRecord = Readonly<Record<string, string>>;

export interface ParsedCsv {
  readonly headers: readonly string[];
  readonly records: readonly CsvRecord[];
}

function finishRow(rows: string[][], row: string[], field: string, includeEmpty: boolean): void {
  row.push(field);
  if (includeEmpty || row.some((cell) => cell.length > 0)) rows.push(row);
}

/** RFC 4180-style parser supporting quoted delimiters, CRLF, and escaped quotes. */
export function parseCsv(input: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let justClosedQuote = false;
  let rowTouched = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          justClosedQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (justClosedQuote && char !== ',' && char !== '\r' && char !== '\n') {
      throw new Error(`Unexpected character after closing quote at offset ${index}`);
    }
    justClosedQuote = false;

    if (char === '"') {
      if (field.length > 0) throw new Error(`Unexpected quote at offset ${index}`);
      inQuotes = true;
      rowTouched = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
      rowTouched = true;
    } else if (char === '\r' || char === '\n') {
      finishRow(rows, row, field, rowTouched);
      row = [];
      field = '';
      rowTouched = false;
      if (char === '\r' && input[index + 1] === '\n') index += 1;
    } else {
      field += char;
      rowTouched = true;
    }
  }

  if (inQuotes) throw new Error('CSV ended inside a quoted field');
  if (field.length > 0 || row.length > 0 || rowTouched) finishRow(rows, row, field, rowTouched);
  if (rows.length === 0) throw new Error('CSV has no header row');

  const headers = rows[0].map((header, index) => {
    const cleaned = (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim();
    if (!cleaned) throw new Error(`CSV header ${index + 1} is empty`);
    return cleaned;
  });
  const uniqueHeaders = new Set(headers);
  if (uniqueHeaders.size !== headers.length) throw new Error('CSV headers must be unique');

  const records = rows.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length) {
      throw new Error(
        `CSV row ${rowIndex + 2} has ${cells.length} fields; expected ${headers.length}`,
      );
    }
    return Object.freeze(
      Object.fromEntries(headers.map((header, columnIndex) => [header, cells[columnIndex]])),
    );
  });

  return { headers, records };
}
