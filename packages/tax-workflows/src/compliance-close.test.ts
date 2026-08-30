import { describe, expect, it } from 'vitest';

import { moneyFromDecimal, moneyToDecimal } from '@taxbrains/tax-domain';

import { runComplianceClosePreflight } from './compliance-close';

const TRANSACTION_HEADER = [
  'external_id',
  'invoice_number',
  'transaction_type',
  'transaction_at',
  'seller_country',
  'buyer_country',
  'buyer_jurisdiction',
  'currency',
  'net_amount',
  'recorded_tax_amount',
  'is_exempt',
].join(',');
const GL_HEADER = 'reference,posted_at,account_code,currency,tax_amount';

function run(transactionRows: string, glRows: string) {
  return runComplianceClosePreflight({
    organizationId: 'org-a',
    transactionCsv: `${TRANSACTION_HEADER}\n${transactionRows}`,
    generalLedgerCsv: `${GL_HEADER}\n${glRows}`,
    transactionImport: { sourceSystem: 'billing' },
    largeAmountThresholds: {
      USD: moneyFromDecimal('USD', '100000.00'),
      EUR: moneyFromDecimal('EUR', '100000.00'),
    },
  });
}

describe('runComplianceClosePreflight', () => {
  it('produces a clean recorded-tax review for matching exports', () => {
    const result = run(
      'txn-1,INV-1,sale,2026-07-15,US,US,US-CA,USD,1000.00,72.50,false',
      'INV-1,2026-07-31,2200,USD,72.50',
    );

    expect(result.status).toBe('review_ready');
    if (result.status !== 'review_ready') throw new Error('expected review_ready');
    expect(result.currencyReviews).toHaveLength(1);
    expect(result.currencyReviews[0].anomalies).toEqual([]);
    expect(result.currencyReviews[0].reconciliation.summary.isClean).toBe(true);
    expect(result.nextGate).toBe('deterministic_taxability_and_rule_selection');
  });

  it('surfaces recorded-tax anomalies and reconciliation variances', () => {
    const result = run(
      'txn-1,INV-1,sale,2026-07-15,US,US,US-CA,USD,1000.00,0.00,false',
      'INV-1,2026-07-31,2200,USD,72.50',
    );

    if (result.status !== 'review_ready') throw new Error('expected review_ready');
    expect(result.currencyReviews[0].anomalies.map((item) => item.type)).toContain('missing_tax');
    expect(result.currencyReviews[0].reconciliation.summary.variances).toBe(1);
    expect(moneyToDecimal(result.currencyReviews[0].reconciliation.summary.totalAbsoluteVariance)).toBe('72.50');
  });

  it('blocks all calculations when any import row is invalid', () => {
    const result = run(
      'txn-1,INV-1,unknown,2026-07-15,US,US,US-CA,USD,1000.00,72.50,false',
      'INV-1,2026-07-31,2200,USD,72.50',
    );

    expect(result.status).toBe('needs_input_fix');
    if (result.status !== 'needs_input_fix') throw new Error('expected needs_input_fix');
    expect(result.blockers).toContain('1 transaction row(s) require correction');
  });

  it('separates reviews by currency', () => {
    const result = run(
      'txn-us,INV-US,sale,2026-07-15,US,US,US-CA,USD,1000.00,72.50,false\n' +
        'txn-eu,INV-EU,sale,2026-07-15,DE,DE,DE,EUR,1000.00,190.00,false',
      'INV-US,2026-07-31,2200,USD,72.50\nINV-EU,2026-07-31,2200,EUR,190.00',
    );

    if (result.status !== 'review_ready') throw new Error('expected review_ready');
    expect(result.currencyReviews.map((review) => review.currency)).toEqual(['EUR', 'USD']);
    expect(result.currencyReviews.every((review) => review.reconciliation.summary.isClean)).toBe(true);
  });

  it('rejects a workflow configuration without a threshold for every currency', () => {
    expect(() =>
      runComplianceClosePreflight({
        organizationId: 'org-a',
        transactionCsv: `${TRANSACTION_HEADER}\n` +
          'txn-eu,INV-EU,sale,2026-07-15,DE,DE,DE,EUR,1000.00,190.00,false',
        generalLedgerCsv: `${GL_HEADER}\nINV-EU,2026-07-31,2200,EUR,190.00`,
        transactionImport: { sourceSystem: 'billing' },
        largeAmountThresholds: {},
      }),
    ).toThrow(/Missing large-amount threshold for EUR/);
  });
});
