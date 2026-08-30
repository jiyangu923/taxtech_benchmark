import { describe, expect, it } from 'vitest';

import {
  addMoney,
  moneyFromDecimal,
  moneyToDecimal,
  subtractMoney,
} from './money';

describe('Money invariants', () => {
  it('supports zero-decimal and three-decimal currencies explicitly', () => {
    expect(moneyToDecimal(moneyFromDecimal('JPY', '1500', 0))).toBe('1500');
    expect(moneyToDecimal(moneyFromDecimal('KWD', '1.234', 3))).toBe('1.234');
  });

  it('preserves very large amounts without IEEE-754 precision loss', () => {
    const amount = moneyFromDecimal('USD', '999999999999999999.99');
    expect(amount.minorUnits).toBe(99999999999999999999n);
    expect(moneyToDecimal(amount)).toBe('999999999999999999.99');
  });

  it('adds and subtracts exact units', () => {
    const left = moneyFromDecimal('USD', '0.10');
    const right = moneyFromDecimal('USD', '0.20');
    expect(moneyToDecimal(addMoney(left, right))).toBe('0.30');
    expect(moneyToDecimal(subtractMoney(left, right))).toBe('-0.10');
  });

  it('rejects currency or scale mixing', () => {
    expect(() =>
      addMoney(moneyFromDecimal('USD', '1.00'), moneyFromDecimal('EUR', '1.00')),
    ).toThrow(/Money unit mismatch/);
    expect(() =>
      addMoney(moneyFromDecimal('USD', '1.00'), moneyFromDecimal('USD', '1.000', 3)),
    ).toThrow(/Money unit mismatch/);
  });

  it('rejects ambiguous formatting and invalid units', () => {
    expect(() => moneyFromDecimal('usd', '1.00')).toThrow(/uppercase/);
    expect(() => moneyFromDecimal('USD', '1e3')).toThrow(/Invalid decimal/);
    expect(() => moneyFromDecimal('USD', '+1.00')).toThrow(/Invalid decimal/);
    expect(() => moneyFromDecimal('USD', '1.00', 10)).toThrow(/scale/);
  });
});
