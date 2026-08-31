import {
  moneyFromDecimal,
  type AnomalyTransaction,
  type FilingSourceTransaction,
  type Money,
} from '@taxbrains/tax-domain';

import { parseCsv, type CsvRecord } from './csv';
import { parseIsoDateOrTimestamp } from './dates';

export interface TransactionColumnMapping {
  readonly externalId: string;
  readonly invoiceNumber?: string;
  readonly transactionType: string;
  readonly transactionAt: string;
  readonly sellerCountry?: string;
  readonly buyerCountry?: string;
  readonly buyerJurisdiction?: string;
  readonly currency: string;
  readonly netAmount: string;
  readonly recordedTaxAmount: string;
  readonly isExempt?: string;
}

export const STANDARD_TRANSACTION_COLUMNS: TransactionColumnMapping = {
  externalId: 'external_id',
  invoiceNumber: 'invoice_number',
  transactionType: 'transaction_type',
  transactionAt: 'transaction_at',
  sellerCountry: 'seller_country',
  buyerCountry: 'buyer_country',
  buyerJurisdiction: 'buyer_jurisdiction',
  currency: 'currency',
  netAmount: 'net_amount',
  recordedTaxAmount: 'recorded_tax_amount',
  isExempt: 'is_exempt',
};

export interface NormalizedTransaction
  extends AnomalyTransaction,
    FilingSourceTransaction {
  readonly sourceRowNumber: number;
  readonly invoiceNumber?: string;
  readonly transactionAt: string;
  readonly sellerCountry?: string;
  readonly recordedTaxAmount: Money;
  readonly raw: CsvRecord;
}

export interface TransactionImportError {
  readonly rowNumber: number;
  readonly code: 'missing_column' | 'invalid_value';
  readonly field: string;
  readonly message: string;
}

export interface TransactionImportResult {
  readonly accepted: readonly NormalizedTransaction[];
  readonly errors: readonly TransactionImportError[];
}

export interface NormalizeTransactionCsvOptions {
  readonly organizationId: string;
  readonly sourceSystem: string;
  readonly amountScale?: number;
  readonly columns?: TransactionColumnMapping;
}

function requireValue(record: CsvRecord, column: string): string {
  const value = record[column]?.trim();
  if (!value) throw new Error(`Required column ${column} is empty`);
  return value;
}

function optionalValue(record: CsvRecord, column?: string): string | undefined {
  if (!column) return undefined;
  return record[column]?.trim() || undefined;
}

function parseCountry(value: string | undefined, field: string): string | undefined {
  if (!value) return undefined;
  const country = value.toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new Error(`${field} must be a two-letter country code`);
  return country;
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  throw new Error('is_exempt must be true/false, yes/no, or 1/0');
}

function parseTransactionType(value: string): FilingSourceTransaction['transactionType'] {
  const normalized = value.toLowerCase();
  if (normalized === 'sale' || normalized === 'purchase' || normalized === 'refund') return normalized;
  throw new Error('transaction_type must be sale, purchase, or refund');
}

function assertMappedHeaders(headers: readonly string[], columns: TransactionColumnMapping): void {
  const available = new Set(headers);
  const required: Array<[string, string]> = [
    ['externalId', columns.externalId],
    ['transactionType', columns.transactionType],
    ['transactionAt', columns.transactionAt],
    ['currency', columns.currency],
    ['netAmount', columns.netAmount],
    ['recordedTaxAmount', columns.recordedTaxAmount],
  ];
  const missing = required.find(([, column]) => !available.has(column));
  if (missing) throw new Error(`Missing mapped CSV column for ${missing[0]}: ${missing[1]}`);
}

export function normalizeTransactionCsv(
  csv: string,
  options: NormalizeTransactionCsvOptions,
): TransactionImportResult {
  if (!options.organizationId) throw new Error('organizationId is required');
  if (!options.sourceSystem.trim()) throw new Error('sourceSystem is required');

  const parsed = parseCsv(csv);
  const columns = options.columns ?? STANDARD_TRANSACTION_COLUMNS;
  assertMappedHeaders(parsed.headers, columns);
  const scale = options.amountScale ?? 2;
  const accepted: NormalizedTransaction[] = [];
  const errors: TransactionImportError[] = [];

  parsed.records.forEach((record, index) => {
    const rowNumber = index + 2;
    try {
      const externalId = requireValue(record, columns.externalId);
      const currency = requireValue(record, columns.currency).toUpperCase();
      const netAmount = moneyFromDecimal(currency, requireValue(record, columns.netAmount), scale);
      const recordedTaxAmount = moneyFromDecimal(
        currency,
        requireValue(record, columns.recordedTaxAmount),
        scale,
      );

      accepted.push({
        id: `import-row-${rowNumber}`,
        organizationId: options.organizationId,
        sourceSystem: options.sourceSystem,
        sourceRowNumber: rowNumber,
        externalId,
        invoiceNumber: optionalValue(record, columns.invoiceNumber),
        transactionType: parseTransactionType(requireValue(record, columns.transactionType)),
        transactionAt: parseIsoDateOrTimestamp(
          requireValue(record, columns.transactionAt),
          'transaction_at',
        ),
        sellerCountry: parseCountry(optionalValue(record, columns.sellerCountry), 'seller_country'),
        buyerCountry: parseCountry(optionalValue(record, columns.buyerCountry), 'buyer_country'),
        buyerJurisdiction: optionalValue(record, columns.buyerJurisdiction),
        isExempt: parseBoolean(optionalValue(record, columns.isExempt)),
        netAmount,
        taxAmount: recordedTaxAmount,
        recordedTaxAmount,
        raw: record,
      });
    } catch (error) {
      errors.push({
        rowNumber,
        code: 'invalid_value',
        field: 'row',
        message: error instanceof Error ? error.message : 'Invalid transaction row',
      });
    }
  });

  return { accepted, errors };
}
