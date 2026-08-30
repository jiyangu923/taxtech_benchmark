import { describe, expect, it } from 'vitest';

import { parseThresholds, stringifyExact, toCliReport } from './compliance-preflight';

describe('compliance preflight CLI helpers', () => {
  it('parses exact per-currency review thresholds', () => {
    const thresholds = parseThresholds('USD=100000.00,eur=50000.00');
    expect(thresholds.USD.minorUnits).toBe(10000000n);
    expect(thresholds.EUR.minorUnits).toBe(5000000n);
  });

  it('serializes exact bigint values without numeric coercion', () => {
    expect(stringifyExact({ minorUnits: 7250n })).toContain('"7250"');
  });

  it('rejects malformed thresholds', () => {
    expect(() => parseThresholds('USD')).toThrow(/CURRENCY=AMOUNT/);
  });

  it('never writes raw imported rows into the console report', () => {
    const report = toCliReport({
      status: 'needs_input_fix',
      transactionImport: {
        accepted: [{ raw: { secret_customer_field: 'do-not-log' } } as never],
        errors: [],
      },
      generalLedgerImport: { accepted: [], errors: [] },
      blockers: ['test blocker'],
    });
    expect(stringifyExact(report)).not.toContain('do-not-log');
    expect(stringifyExact(report)).toContain('"acceptedTransactions": 1');
  });
});
