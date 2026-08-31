import { describe, expect, it } from 'vitest';

import { detectTransactionAnomalies, type AnomalyTransaction } from './anomalies';
import { moneyFromDecimal } from './money';

const ORG = 'org-a';
const LARGE = moneyFromDecimal('USD', '100000.00');

function transaction(overrides: Partial<AnomalyTransaction> = {}): AnomalyTransaction {
  return {
    id: 'txn-1',
    organizationId: ORG,
    sourceSystem: 'billing',
    externalId: 'external-1',
    buyerCountry: 'US',
    isExempt: false,
    netAmount: moneyFromDecimal('USD', '1000.00'),
    taxAmount: moneyFromDecimal('USD', '72.50'),
    ...overrides,
  };
}

describe('detectTransactionAnomalies', () => {
  it('flags missing tax unless the transaction is exempt', () => {
    const missing = transaction({ taxAmount: moneyFromDecimal('USD', '0.00') });
    const exempt = transaction({
      id: 'txn-exempt',
      externalId: 'external-exempt',
      isExempt: true,
      taxAmount: moneyFromDecimal('USD', '0.00'),
    });

    const anomalies = detectTransactionAnomalies(ORG, [missing, exempt], {
      largeAmountThreshold: LARGE,
    });
    expect(anomalies.filter((item) => item.type === 'missing_tax')).toHaveLength(1);
    expect(anomalies.find((item) => item.type === 'missing_tax')?.transactionId).toBe('txn-1');
  });

  it('flags large transactions and missing jurisdictions', () => {
    const anomalies = detectTransactionAnomalies(
      ORG,
      [
        transaction({
          buyerCountry: undefined,
          buyerJurisdiction: undefined,
          netAmount: moneyFromDecimal('USD', '100000.01'),
        }),
      ],
      { largeAmountThreshold: LARGE },
    );

    expect(anomalies.map((item) => item.type)).toEqual(['large_amount', 'missing_jurisdiction']);
  });

  it('flags large refunds by absolute magnitude', () => {
    const anomalies = detectTransactionAnomalies(
      ORG,
      [transaction({ netAmount: moneyFromDecimal('USD', '-100000.01') })],
      { largeAmountThreshold: LARGE },
    );

    expect(anomalies.map((item) => item.type)).toContain('large_amount');
  });

  it('rejects a negative large-amount threshold', () => {
    expect(() =>
      detectTransactionAnomalies(ORG, [transaction()], {
        largeAmountThreshold: moneyFromDecimal('USD', '-1.00'),
      }),
    ).toThrow(/must not be negative/);
  });

  it('links duplicate source records to the first transaction', () => {
    const anomalies = detectTransactionAnomalies(
      ORG,
      [transaction(), transaction({ id: 'txn-2' })],
      { largeAmountThreshold: LARGE },
    );

    const duplicate = anomalies.find((item) => item.type === 'duplicate_transaction');
    expect(duplicate?.transactionId).toBe('txn-2');
    expect(duplicate?.relatedTransactionId).toBe('txn-1');
  });

  it('rejects cross-organization records', () => {
    expect(() =>
      detectTransactionAnomalies(ORG, [transaction({ organizationId: 'org-b' })], {
        largeAmountThreshold: LARGE,
      }),
    ).toThrow(/Cross-organization anomaly detection is forbidden/);
  });

  it('rejects mixed money units', () => {
    expect(() =>
      detectTransactionAnomalies(
        ORG,
        [transaction({ taxAmount: moneyFromDecimal('EUR', '72.50') })],
        { largeAmountThreshold: LARGE },
      ),
    ).toThrow(/Money unit mismatch/);
  });
});
