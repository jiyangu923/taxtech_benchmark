import {
  assertIsoDate,
  assertValidTaxRuleReference,
  moneyFromMinorUnits,
  type Money,
  type TaxRuleReference,
} from '@taxbrains/tax-domain';

export interface RationalTaxRate {
  readonly numerator: bigint;
  readonly denominator: bigint;
  readonly percent: string;
}

export type RoundingMode = 'toward_zero' | 'half_up' | 'half_even';

export interface EffectiveTaxRule {
  readonly ruleId: string;
  readonly version: string;
  readonly jurisdiction: string;
  readonly taxType: string;
  readonly rate: RationalTaxRate;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly sourceUrl: string;
  readonly lastVerified: string;
}

export interface AppliedTaxRule {
  readonly taxAmount: Money;
  readonly ruleReference: TaxRuleReference;
}

const PERCENT_PATTERN = /^(\d{1,3})(?:\.(\d{1,9}))?$/;
export function taxRateFromPercent(percent: string): RationalTaxRate {
  if (typeof percent !== 'string') throw new Error(`Invalid tax-rate percentage: ${String(percent)}`);
  const match = PERCENT_PATTERN.exec(percent);
  if (!match) throw new Error(`Invalid tax-rate percentage: ${percent}`);

  const [, whole, fraction = ''] = match;
  const decimalPlaces = BigInt(fraction.length);
  const numerator = BigInt(`${whole}${fraction}`);
  const denominator = 100n * (10n ** decimalPlaces);
  if (numerator > denominator) throw new Error('Tax-rate percentage must not exceed 100%');

  return Object.freeze({ numerator, denominator, percent });
}

function roundRatio(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator <= 0n) throw new Error('Rate denominator must be positive');
  if (!['toward_zero', 'half_up', 'half_even'].includes(mode)) {
    throw new Error(`Unsupported rounding mode: ${String(mode)}`);
  }
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const remainder = magnitude % denominator;

  let increment = false;
  if (mode === 'half_up') {
    increment = remainder * 2n >= denominator;
  } else if (mode === 'half_even') {
    const doubled = remainder * 2n;
    increment = doubled > denominator || (doubled === denominator && quotient % 2n === 1n);
  }

  const rounded = quotient + (increment ? 1n : 0n);
  return negative ? -rounded : rounded;
}

export function applyTaxRate(amount: Money, rate: RationalTaxRate, rounding: RoundingMode): Money {
  if (typeof rate.numerator !== 'bigint' || typeof rate.denominator !== 'bigint') {
    throw new Error('Tax-rate numerator and denominator must be bigint values');
  }
  if (rate.numerator < 0n || rate.numerator > rate.denominator) {
    throw new Error('Tax rate must be between 0% and 100%');
  }
  if (typeof rate.percent !== 'string') throw new Error('Tax-rate percent label must be a string');
  const percentRate = taxRateFromPercent(rate.percent);
  if (percentRate.numerator * rate.denominator !== rate.numerator * percentRate.denominator) {
    throw new Error('Tax-rate percent label must match its exact numerator and denominator');
  }
  const minorUnits = roundRatio(amount.minorUnits * rate.numerator, rate.denominator, rounding);
  return moneyFromMinorUnits(amount.currency, minorUnits, amount.scale);
}

export function isRuleEffective(rule: EffectiveTaxRule, asOf: string): boolean {
  assertIsoDate(asOf, 'asOf');
  assertIsoDate(rule.effectiveFrom, 'effectiveFrom');
  if (rule.effectiveTo) assertIsoDate(rule.effectiveTo, 'effectiveTo');
  if (rule.effectiveTo && rule.effectiveTo < rule.effectiveFrom) {
    throw new Error('effectiveTo must not precede effectiveFrom');
  }
  return asOf >= rule.effectiveFrom && (!rule.effectiveTo || asOf <= rule.effectiveTo);
}

export function applyEffectiveTaxRule(
  amount: Money,
  rule: EffectiveTaxRule,
  asOf: string,
  rounding: RoundingMode,
): AppliedTaxRule {
  if (!rule.ruleId.trim()) throw new Error('Rule ruleId is required');
  if (!rule.version.trim()) throw new Error('Rule version is required');
  if (!rule.jurisdiction.trim()) throw new Error('Rule jurisdiction is required');
  if (!rule.taxType.trim()) throw new Error('Rule taxType is required');
  if (!isRuleEffective(rule, asOf)) {
    throw new Error(`Rule ${rule.ruleId}@${rule.version} is not effective on ${asOf}`);
  }

  const ruleReference: TaxRuleReference = {
    ruleId: rule.ruleId,
    version: rule.version,
    sourceUrl: rule.sourceUrl,
    effectiveFrom: rule.effectiveFrom,
    lastVerified: rule.lastVerified,
  };
  assertValidTaxRuleReference(ruleReference, `Rule ${rule.ruleId}@${rule.version}`);

  return {
    taxAmount: applyTaxRate(amount, rule.rate, rounding),
    ruleReference,
  };
}
