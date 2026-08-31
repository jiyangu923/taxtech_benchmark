import { moneyFromDecimal, type GeneralLedgerEntry, type Money } from '@taxbrains/tax-domain';

import { parseCsv, type CsvRecord } from './csv';
import { parseIsoDateOrTimestamp } from './dates';

export interface GeneralLedgerColumnMapping {
  readonly reference: string;
  readonly postedAt: string;
  readonly accountCode?: string;
  readonly currency: string;
  readonly taxAmount: string;
}

export const STANDARD_GL_COLUMNS: GeneralLedgerColumnMapping = {
  reference: 'reference',
  postedAt: 'posted_at',
  accountCode: 'account_code',
  currency: 'currency',
  taxAmount: 'tax_amount',
};

export interface NormalizedGeneralLedgerEntry extends GeneralLedgerEntry {
  readonly sourceRowNumber: number;
  readonly postedAt: string;
  readonly accountCode?: string;
  readonly recordedTaxAmount: Money;
  readonly raw: CsvRecord;
}

export interface GeneralLedgerImportError {
  readonly rowNumber: number;
  readonly message: string;
}

export interface GeneralLedgerImportResult {
  readonly accepted: readonly NormalizedGeneralLedgerEntry[];
  readonly errors: readonly GeneralLedgerImportError[];
}

export interface NormalizeGeneralLedgerCsvOptions {
  readonly organizationId: string;
  readonly amountScale?: number;
  readonly columns?: GeneralLedgerColumnMapping;
}

function requireValue(record: CsvRecord, column: string): string {
  const value = record[column]?.trim();
  if (!value) throw new Error(`Required column ${column} is empty`);
  return value;
}

function assertMappedHeaders(headers: readonly string[], columns: GeneralLedgerColumnMapping): void {
  const available = new Set(headers);
  const required = [columns.reference, columns.postedAt, columns.currency, columns.taxAmount];
  const missing = required.find((column) => !available.has(column));
  if (missing) throw new Error(`Missing mapped GL column: ${missing}`);
}

export function normalizeGeneralLedgerCsv(
  csv: string,
  options: NormalizeGeneralLedgerCsvOptions,
): GeneralLedgerImportResult {
  if (!options.organizationId) throw new Error('organizationId is required');

  const parsed = parseCsv(csv);
  const columns = options.columns ?? STANDARD_GL_COLUMNS;
  assertMappedHeaders(parsed.headers, columns);
  const scale = options.amountScale ?? 2;
  const accepted: NormalizedGeneralLedgerEntry[] = [];
  const errors: GeneralLedgerImportError[] = [];

  parsed.records.forEach((record, index) => {
    const rowNumber = index + 2;
    try {
      const reference = requireValue(record, columns.reference);
      const currency = requireValue(record, columns.currency).toUpperCase();
      const recordedTaxAmount = moneyFromDecimal(
        currency,
        requireValue(record, columns.taxAmount),
        scale,
      );
      accepted.push({
        id: `gl-import-row-${rowNumber}`,
        organizationId: options.organizationId,
        sourceRowNumber: rowNumber,
        reference,
        postedAt: parseIsoDateOrTimestamp(requireValue(record, columns.postedAt), 'posted_at'),
        accountCode: columns.accountCode ? record[columns.accountCode]?.trim() || undefined : undefined,
        taxAmount: recordedTaxAmount,
        recordedTaxAmount,
        raw: record,
      });
    } catch (error) {
      errors.push({
        rowNumber,
        message: error instanceof Error ? error.message : 'Invalid general-ledger row',
      });
    }
  });

  return { accepted, errors };
}
