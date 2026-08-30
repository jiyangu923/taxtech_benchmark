export interface Money {
  readonly currency: string;
  readonly minorUnits: bigint;
  readonly scale: number;
}

const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function assertScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > 9) {
    throw new Error(`Money scale must be an integer from 0 to 9; received ${scale}`);
  }
}

function assertCurrency(currency: string): void {
  if (!CURRENCY_PATTERN.test(currency)) {
    throw new Error(`Currency must be a three-letter uppercase code; received ${currency}`);
  }
}

export function moneyFromDecimal(currency: string, value: string, scale = 2): Money {
  assertCurrency(currency);
  assertScale(scale);

  const match = DECIMAL_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid decimal amount: ${value}`);

  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > scale) {
    throw new Error(`Amount ${value} has more than ${scale} decimal places; explicit rounding is required`);
  }

  const digits = `${whole}${fraction.padEnd(scale, '0')}`.replace(/^0+(?=\d)/, '');
  const magnitude = BigInt(digits || '0');
  return Object.freeze({
    currency,
    minorUnits: sign === '-' ? -magnitude : magnitude,
    scale,
  });
}

export function moneyFromMinorUnits(currency: string, minorUnits: bigint, scale = 2): Money {
  assertCurrency(currency);
  assertScale(scale);
  return Object.freeze({ currency, minorUnits, scale });
}

export function moneyToDecimal(value: Money): string {
  assertCurrency(value.currency);
  assertScale(value.scale);

  const negative = value.minorUnits < 0n;
  const magnitude = (negative ? -value.minorUnits : value.minorUnits).toString();
  if (value.scale === 0) return `${negative ? '-' : ''}${magnitude}`;

  const padded = magnitude.padStart(value.scale + 1, '0');
  const split = padded.length - value.scale;
  return `${negative ? '-' : ''}${padded.slice(0, split)}.${padded.slice(split)}`;
}

export function assertSameMoneyUnit(left: Money, right: Money): void {
  if (left.currency !== right.currency || left.scale !== right.scale) {
    throw new Error(
      `Money unit mismatch: ${left.currency}/${left.scale} versus ${right.currency}/${right.scale}`,
    );
  }
}

export function addMoney(left: Money, right: Money): Money {
  assertSameMoneyUnit(left, right);
  return moneyFromMinorUnits(left.currency, left.minorUnits + right.minorUnits, left.scale);
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameMoneyUnit(left, right);
  return moneyFromMinorUnits(left.currency, left.minorUnits - right.minorUnits, left.scale);
}

export function absoluteMoney(value: Money): Money {
  return moneyFromMinorUnits(
    value.currency,
    value.minorUnits < 0n ? -value.minorUnits : value.minorUnits,
    value.scale,
  );
}

export function zeroMoney(currency: string, scale = 2): Money {
  return moneyFromMinorUnits(currency, 0n, scale);
}
