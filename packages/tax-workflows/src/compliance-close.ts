import {
  detectTransactionAnomalies,
  reconcileTransactionsToGl,
  type Money,
  type ReconciliationResult,
  type TaxAnomaly,
} from '@taxbrains/tax-domain';
import {
  normalizeGeneralLedgerCsv,
  normalizeTransactionCsv,
  type GeneralLedgerImportResult,
  type NormalizeGeneralLedgerCsvOptions,
  type NormalizeTransactionCsvOptions,
  type TransactionImportResult,
} from '@taxbrains/tax-import';

export interface ComplianceClosePreflightInput {
  readonly organizationId: string;
  readonly transactionCsv: string;
  readonly generalLedgerCsv: string;
  readonly transactionImport: Omit<NormalizeTransactionCsvOptions, 'organizationId'>;
  readonly generalLedgerImport?: Omit<NormalizeGeneralLedgerCsvOptions, 'organizationId'>;
  readonly largeAmountThresholds: Readonly<Record<string, Money>>;
}

export interface CurrencyReview {
  readonly currency: string;
  readonly anomalies: readonly TaxAnomaly[];
  readonly reconciliation: ReconciliationResult;
}

export type ComplianceClosePreflightResult =
  | {
      readonly status: 'needs_input_fix';
      readonly transactionImport: TransactionImportResult;
      readonly generalLedgerImport: GeneralLedgerImportResult;
      readonly blockers: readonly string[];
    }
  | {
      readonly status: 'review_ready';
      readonly transactionImport: TransactionImportResult;
      readonly generalLedgerImport: GeneralLedgerImportResult;
      readonly currencyReviews: readonly CurrencyReview[];
      readonly nextGate: 'deterministic_taxability_and_rule_selection';
    };

function groupByCurrency<T extends { taxAmount: Money }>(rows: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.taxAmount.currency) ?? [];
    group.push(row);
    groups.set(row.taxAmount.currency, group);
  }
  return groups;
}

export function runComplianceClosePreflight(
  input: ComplianceClosePreflightInput,
): ComplianceClosePreflightResult {
  const transactionImport = normalizeTransactionCsv(input.transactionCsv, {
    ...input.transactionImport,
    organizationId: input.organizationId,
  });
  const generalLedgerImport = normalizeGeneralLedgerCsv(input.generalLedgerCsv, {
    ...input.generalLedgerImport,
    organizationId: input.organizationId,
  });

  const blockers: string[] = [];
  if (transactionImport.errors.length > 0) {
    blockers.push(`${transactionImport.errors.length} transaction row(s) require correction`);
  }
  if (generalLedgerImport.errors.length > 0) {
    blockers.push(`${generalLedgerImport.errors.length} GL row(s) require correction`);
  }
  if (transactionImport.accepted.length === 0 && generalLedgerImport.accepted.length === 0) {
    blockers.push('At least one accepted transaction or GL entry is required');
  }
  if (blockers.length > 0) {
    return { status: 'needs_input_fix', transactionImport, generalLedgerImport, blockers };
  }

  const transactionGroups = groupByCurrency(transactionImport.accepted);
  const glGroups = groupByCurrency(generalLedgerImport.accepted);
  const currencies = new Set([...transactionGroups.keys(), ...glGroups.keys()]);
  const currencyReviews: CurrencyReview[] = [];

  for (const currency of [...currencies].sort()) {
    const transactions = transactionGroups.get(currency) ?? [];
    const glEntries = glGroups.get(currency) ?? [];
    const threshold = input.largeAmountThresholds[currency];
    if (!threshold) throw new Error(`Missing large-amount threshold for ${currency}`);
    if (threshold.currency !== currency) {
      throw new Error(`Large-amount threshold key ${currency} does not match ${threshold.currency}`);
    }

    currencyReviews.push({
      currency,
      anomalies: detectTransactionAnomalies(input.organizationId, transactions, {
        largeAmountThreshold: threshold,
      }),
      reconciliation: reconcileTransactionsToGl(input.organizationId, transactions, glEntries),
    });
  }

  return {
    status: 'review_ready',
    transactionImport,
    generalLedgerImport,
    currencyReviews,
    nextGate: 'deterministic_taxability_and_rule_selection',
  };
}
