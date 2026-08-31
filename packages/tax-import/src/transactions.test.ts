import { describe, expect, it } from 'vitest';

import { moneyToDecimal } from '@taxbrains/tax-domain';

import { normalizeTransactionCsv } from './transactions';

const HEADER = [
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

function normalize(row: string) {
  return normalizeTransactionCsv(`${HEADER}\n${row}`, {
    organizationId: 'org-a',
    sourceSystem: 'billing-export',
  });
}

describe('normalizeTransactionCsv', () => {
  it('normalizes a valid row into exact-money domain data', () => {
    const result = normalize('txn-1,INV-1,sale,2026-07-15,us,us,US-CA,usd,1000.00,72.50,false');

    expect(result.errors).toEqual([]);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].organizationId).toBe('org-a');
    expect(result.accepted[0].buyerCountry).toBe('US');
    expect(result.accepted[0].netAmount.minorUnits).toBe(100000n);
    expect(moneyToDecimal(result.accepted[0].recordedTaxAmount)).toBe('72.50');
  });

  it('accepts common boolean values for exemption', () => {
    const result = normalize('txn-1,INV-1,sale,2026-07-15,US,US,US-CA,USD,1000,0,yes');
    expect(result.accepted[0].isExempt).toBe(true);
  });

  it('returns a structured row error without accepting invalid money', () => {
    const result = normalize('txn-1,INV-1,sale,2026-07-15,US,US,US-CA,USD,1000,7.255,false');

    expect(result.accepted).toEqual([]);
    expect(result.errors[0].rowNumber).toBe(2);
    expect(result.errors[0].message).toMatch(/explicit rounding/);
  });

  it('rejects an impossible calendar date', () => {
    const result = normalize('txn-1,INV-1,sale,2026-02-30,US,US,US-CA,USD,1000,72.50,false');
    expect(result.accepted).toEqual([]);
    expect(result.errors[0].message).toMatch(/ISO date or timezone-qualified timestamp/);
  });

  it('rejects ambiguous local timestamps without a timezone', () => {
    const result = normalize('txn-1,INV-1,sale,2026-07-15T12:00:00,US,US,US-CA,USD,1000,72.50,false');
    expect(result.accepted).toEqual([]);
    expect(result.errors[0].message).toMatch(/timezone-qualified/);
  });

  it('keeps valid rows when another row is invalid', () => {
    const csv = `${HEADER}\n` +
      'txn-1,INV-1,sale,2026-07-15,US,US,US-CA,USD,1000,72.50,false\n' +
      'txn-2,INV-2,unknown,2026-07-15,US,US,US-CA,USD,1000,72.50,false';
    const result = normalizeTransactionCsv(csv, {
      organizationId: 'org-a',
      sourceSystem: 'billing-export',
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/sale, purchase, or refund/);
  });

  it('fails the file when a required mapped header is absent', () => {
    expect(() =>
      normalizeTransactionCsv('external_id,currency\ntxn-1,USD', {
        organizationId: 'org-a',
        sourceSystem: 'billing-export',
      }),
    ).toThrow(/Missing mapped CSV column/);
  });
});
