import { describe, expect, it } from 'vitest';

import { moneyFromDecimal, moneyToDecimal } from './money';
import {
  reconcileTransactionsToGl,
  type GeneralLedgerEntry,
  type TaxTransaction,
} from './reconciliation';

const ORG = 'org-a';

function transaction(
  id: string,
  reference: string,
  tax: string,
  organizationId = ORG,
): TaxTransaction {
  return {
    id,
    organizationId,
    sourceSystem: 'billing',
    invoiceNumber: reference,
    taxAmount: moneyFromDecimal('USD', tax),
  };
}

function glEntry(
  id: string,
  reference: string,
  tax: string,
  organizationId = ORG,
): GeneralLedgerEntry {
  return {
    id,
    organizationId,
    reference,
    taxAmount: moneyFromDecimal('USD', tax),
  };
}

describe('exact money', () => {
  it('parses and formats amounts without floating-point coercion', () => {
    expect(moneyFromDecimal('USD', '10.20').minorUnits).toBe(1020n);
    expect(moneyToDecimal(moneyFromDecimal('USD', '-0.05'))).toBe('-0.05');
  });

  it('requires explicit rounding when source precision exceeds the scale', () => {
    expect(() => moneyFromDecimal('USD', '1.005')).toThrow(/explicit rounding/);
  });
});

describe('reconcileTransactionsToGl', () => {
  it('matches equal transaction and GL tax', () => {
    const result = reconcileTransactionsToGl(
      ORG,
      [transaction('txn-1', 'INV-1', '72.50')],
      [glEntry('gl-1', 'INV-1', '72.50')],
    );

    expect(result.items[0].status).toBe('matched');
    expect(result.summary.isClean).toBe(true);
    expect(moneyToDecimal(result.summary.totalAbsoluteVariance)).toBe('0.00');
  });

  it('reports an exact variance', () => {
    const result = reconcileTransactionsToGl(
      ORG,
      [transaction('txn-1', 'INV-1', '72.50')],
      [glEntry('gl-1', 'INV-1', '70.00')],
    );

    expect(result.items[0].status).toBe('variance');
    expect(moneyToDecimal(result.items[0].variance)).toBe('2.50');
    expect(moneyToDecimal(result.summary.totalAbsoluteVariance)).toBe('2.50');
  });

  it('reports records missing from either side', () => {
    const result = reconcileTransactionsToGl(
      ORG,
      [transaction('txn-1', 'INV-MISSING-GL', '10.00')],
      [glEntry('gl-1', 'INV-MISSING-TAX', '3.00')],
    );

    expect(result.summary.missingInGl).toBe(1);
    expect(result.summary.missingInTax).toBe(1);
    expect(moneyToDecimal(result.summary.totalAbsoluteVariance)).toBe('13.00');
  });

  it('aggregates split GL postings under the same reference', () => {
    const result = reconcileTransactionsToGl(
      ORG,
      [transaction('txn-1', 'INV-1', '12.00')],
      [glEntry('gl-1', 'INV-1', '5.00'), glEntry('gl-2', 'INV-1', '7.00')],
    );

    expect(result.items[0].status).toBe('matched');
    expect(result.items[0].glEntryIds).toEqual(['gl-1', 'gl-2']);
  });

  it('aggregates split transaction rows under the same invoice reference', () => {
    const result = reconcileTransactionsToGl(
      ORG,
      [
        transaction('txn-line-1', 'INV-1', '5.00'),
        transaction('txn-line-2', 'INV-1', '7.00'),
      ],
      [glEntry('gl-1', 'INV-1', '12.00')],
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].status).toBe('matched');
    expect(result.items[0].transactionId).toBeUndefined();
    expect(result.items[0].transactionIds).toEqual(['txn-line-1', 'txn-line-2']);
  });

  it('rejects cross-organization inputs', () => {
    expect(() =>
      reconcileTransactionsToGl(
        ORG,
        [transaction('txn-1', 'INV-1', '10.00')],
        [glEntry('gl-1', 'INV-1', '10.00', 'org-b')],
      ),
    ).toThrow(/Cross-organization reconciliation is forbidden/);
  });

  it('rejects mixed currencies', () => {
    const eurEntry: GeneralLedgerEntry = {
      id: 'gl-eur',
      organizationId: ORG,
      reference: 'INV-1',
      taxAmount: moneyFromDecimal('EUR', '10.00'),
    };

    expect(() =>
      reconcileTransactionsToGl(ORG, [transaction('txn-1', 'INV-1', '10.00')], [eurEntry]),
    ).toThrow(/Money unit mismatch/);
  });
});
