import { describe, expect, it } from 'vitest';

import { moneyFromDecimal, moneyToDecimal } from '@taxbrains/tax-domain';

import {
  applyEffectiveTaxRule,
  applyTaxRate,
  isRuleEffective,
  taxRateFromPercent,
  type EffectiveTaxRule,
} from './rates';

const RULE: EffectiveTaxRule = {
  ruleId: 'test-us-ca',
  version: '2026.1',
  jurisdiction: 'US-CA',
  taxType: 'sales_tax',
  rate: taxRateFromPercent('7.25'),
  effectiveFrom: '2026-01-01',
  sourceUrl: 'https://www.cdtfa.ca.gov/',
  lastVerified: '2026-08-30',
};

describe('tax rates', () => {
  it('parses a percentage as an exact rational number', () => {
    expect(taxRateFromPercent('7.25')).toEqual({
      numerator: 725n,
      denominator: 10000n,
      percent: '7.25',
    });
    expect(taxRateFromPercent('9.975').numerator).toBe(9975n);
  });

  it('rejects malformed or out-of-range percentages', () => {
    expect(() => taxRateFromPercent('-1')).toThrow(/Invalid/);
    expect(() => taxRateFromPercent('100.01')).toThrow(/must not exceed 100/);
  });

  it('calculates tax without floating point', () => {
    const tax = applyTaxRate(moneyFromDecimal('USD', '1000.00'), taxRateFromPercent('7.25'), 'half_up');
    expect(moneyToDecimal(tax)).toBe('72.50');
  });

  it('requires an explicit rounding policy for fractional minor units', () => {
    const amount = moneyFromDecimal('CAD', '100.00');
    const rate = taxRateFromPercent('9.975');
    expect(moneyToDecimal(applyTaxRate(amount, rate, 'toward_zero'))).toBe('9.97');
    expect(moneyToDecimal(applyTaxRate(amount, rate, 'half_up'))).toBe('9.98');
  });

  it('implements half-even ties deterministically', () => {
    const rate = taxRateFromPercent('5');
    expect(moneyToDecimal(applyTaxRate(moneyFromDecimal('USD', '0.10'), rate, 'half_even'))).toBe('0.00');
    expect(moneyToDecimal(applyTaxRate(moneyFromDecimal('USD', '0.30'), rate, 'half_even'))).toBe('0.02');
  });

  it('rejects hand-constructed invalid rates and rounding modes at runtime', () => {
    const amount = moneyFromDecimal('USD', '100.00');
    expect(() =>
      applyTaxRate(amount, { numerator: 101n, denominator: 100n, percent: '101' }, 'half_up'),
    ).toThrow(/between 0% and 100%/);
    expect(() =>
      applyTaxRate(amount, taxRateFromPercent('5'), 'invented' as never),
    ).toThrow(/Unsupported rounding mode/);
    expect(() =>
      applyTaxRate(amount, { numerator: 5n, denominator: 100n, percent: '99' }, 'half_up'),
    ).toThrow(/percent label must match/);
  });

  it('rounds negative refund amounts symmetrically', () => {
    const tax = applyTaxRate(moneyFromDecimal('USD', '-0.10'), taxRateFromPercent('5'), 'half_up');
    expect(moneyToDecimal(tax)).toBe('-0.01');
  });
});

describe('effective tax rules', () => {
  it('honors inclusive effective dates', () => {
    const historical: EffectiveTaxRule = { ...RULE, effectiveTo: '2026-06-30' };
    expect(isRuleEffective(historical, '2026-01-01')).toBe(true);
    expect(isRuleEffective(historical, '2026-06-30')).toBe(true);
    expect(isRuleEffective(historical, '2026-07-01')).toBe(false);
  });

  it('rejects impossible or reversed effective dates', () => {
    expect(() => isRuleEffective(RULE, '2026-02-30')).toThrow(/valid YYYY-MM-DD/);
    expect(() =>
      isRuleEffective({ ...RULE, effectiveTo: '2025-12-31' }, '2026-01-01'),
    ).toThrow(/must not precede/);
  });

  it('returns a sourced rule reference with the applied amount', () => {
    const applied = applyEffectiveTaxRule(
      moneyFromDecimal('USD', '1000.00'),
      RULE,
      '2026-07-15',
      'half_up',
    );
    expect(moneyToDecimal(applied.taxAmount)).toBe('72.50');
    expect(applied.ruleReference).toEqual({
      ruleId: 'test-us-ca',
      version: '2026.1',
      sourceUrl: 'https://www.cdtfa.ca.gov/',
      effectiveFrom: '2026-01-01',
      lastVerified: '2026-08-30',
    });
  });

  it('rejects rules outside their effective window or without an HTTPS source', () => {
    expect(() =>
      applyEffectiveTaxRule(moneyFromDecimal('USD', '10.00'), RULE, '2025-12-31', 'half_up'),
    ).toThrow(/not effective/);
    expect(() =>
      applyEffectiveTaxRule(
        moneyFromDecimal('USD', '10.00'),
        { ...RULE, sourceUrl: 'http://example.com' },
        '2026-07-15',
        'half_up',
      ),
    ).toThrow(/must use HTTPS/);
  });

  it('rejects rules without stable identity fields', () => {
    expect(() =>
      applyEffectiveTaxRule(
        moneyFromDecimal('USD', '10.00'),
        { ...RULE, ruleId: '' },
        '2026-07-15',
        'half_up',
      ),
    ).toThrow(/ruleId is required/);
  });
});
