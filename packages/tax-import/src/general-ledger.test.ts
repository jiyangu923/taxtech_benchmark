import { describe, expect, it } from 'vitest';

import { moneyToDecimal } from '@taxbrains/tax-domain';

import { normalizeGeneralLedgerCsv } from './general-ledger';

const HEADER = 'reference,posted_at,account_code,currency,tax_amount';

describe('normalizeGeneralLedgerCsv', () => {
  it('normalizes an exact GL tax posting', () => {
    const result = normalizeGeneralLedgerCsv(
      `${HEADER}\nINV-1,2026-07-31,2200,usd,72.50`,
      { organizationId: 'org-a' },
    );

    expect(result.errors).toEqual([]);
    expect(result.accepted[0].reference).toBe('INV-1');
    expect(result.accepted[0].organizationId).toBe('org-a');
    expect(moneyToDecimal(result.accepted[0].taxAmount)).toBe('72.50');
  });

  it('preserves valid rows while returning invalid-row errors', () => {
    const result = normalizeGeneralLedgerCsv(
      `${HEADER}\nINV-1,2026-07-31,2200,USD,72.50\nINV-2,not-a-date,2200,USD,10.00`,
      { organizationId: 'org-a' },
    );

    expect(result.accepted).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].rowNumber).toBe(3);
  });

  it('rejects fractional minor units rather than rounding silently', () => {
    const result = normalizeGeneralLedgerCsv(
      `${HEADER}\nINV-1,2026-07-31,2200,USD,72.505`,
      { organizationId: 'org-a' },
    );
    expect(result.accepted).toEqual([]);
    expect(result.errors[0].message).toMatch(/explicit rounding/);
  });

  it('fails the file when a mapped header is missing', () => {
    expect(() =>
      normalizeGeneralLedgerCsv('reference,currency\nINV-1,USD', { organizationId: 'org-a' }),
    ).toThrow(/Missing mapped GL column/);
  });
});
