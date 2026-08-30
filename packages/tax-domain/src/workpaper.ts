import { addMoney, assertSameMoneyUnit, subtractMoney, zeroMoney, type Money } from './money';

export type FilingTransactionType = 'sale' | 'purchase' | 'refund';

export interface FilingSourceTransaction {
  readonly id: string;
  readonly organizationId: string;
  readonly transactionType: FilingTransactionType;
}

export interface TaxRuleReference {
  readonly ruleId: string;
  readonly version: string;
  readonly sourceUrl: string;
  readonly effectiveFrom: string;
  readonly lastVerified: string;
}

export interface DeterministicTaxDetermination {
  readonly id: string;
  readonly organizationId: string;
  readonly transactionId: string;
  readonly jurisdiction: string;
  readonly taxType: string;
  readonly taxAmount: Money;
  readonly ruleReferences: readonly TaxRuleReference[];
}

export interface FilingWorkpaperLine {
  readonly code: 'output_tax' | 'input_tax';
  readonly description: string;
  readonly amount: Money;
  readonly sourceTransactionIds: readonly string[];
  readonly determinationIds: readonly string[];
}

export interface FilingWorkpaper {
  readonly organizationId: string;
  readonly jurisdiction: string;
  readonly taxType: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: 'draft';
  readonly requiresApproval: true;
  readonly lines: readonly FilingWorkpaperLine[];
  readonly outputTax: Money;
  readonly inputTax: Money;
  readonly netTaxPayable: Money;
  readonly ruleReferences: readonly TaxRuleReference[];
}

export interface FilingWorkpaperInput {
  readonly organizationId: string;
  readonly jurisdiction: string;
  readonly taxType: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly currency: string;
  readonly amountScale?: number;
  readonly transactions: readonly FilingSourceTransaction[];
  readonly determinations: readonly DeterministicTaxDetermination[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function sameRuleReference(left: TaxRuleReference, right: TaxRuleReference): boolean {
  return left.ruleId === right.ruleId &&
    left.version === right.version &&
    left.sourceUrl === right.sourceUrl &&
    left.effectiveFrom === right.effectiveFrom &&
    left.lastVerified === right.lastVerified;
}

export function buildFilingWorkpaper(input: FilingWorkpaperInput): FilingWorkpaper {
  if (!input.organizationId) throw new Error('organizationId is required');
  if (!input.jurisdiction) throw new Error('jurisdiction is required');
  if (!input.taxType) throw new Error('taxType is required');
  if (!ISO_DATE.test(input.periodStart) || !ISO_DATE.test(input.periodEnd)) {
    throw new Error('Filing period dates must use YYYY-MM-DD');
  }
  if (input.periodEnd < input.periodStart) throw new Error('periodEnd must not precede periodStart');

  const scale = input.amountScale ?? 2;
  const zero = zeroMoney(input.currency, scale);
  if (input.transactions.length === 0) throw new Error('At least one source transaction is required');
  const transactions = new Map<string, FilingSourceTransaction>();
  for (const transaction of input.transactions) {
    if (transaction.organizationId !== input.organizationId) {
      throw new Error('Cross-organization workpaper inputs are forbidden');
    }
    if (transactions.has(transaction.id)) throw new Error(`Duplicate transaction ID: ${transaction.id}`);
    transactions.set(transaction.id, transaction);
  }

  let outputTax = zero;
  let inputTax = zero;
  const outputTransactionIds = new Set<string>();
  const inputTransactionIds = new Set<string>();
  const outputDeterminationIds: string[] = [];
  const inputDeterminationIds: string[] = [];
  const rules = new Map<string, TaxRuleReference>();
  const determinationIds = new Set<string>();
  const determinedTransactionIds = new Set<string>();

  for (const determination of input.determinations) {
    if (determinationIds.has(determination.id)) {
      throw new Error(`Duplicate determination ID: ${determination.id}`);
    }
    determinationIds.add(determination.id);
    if (determination.organizationId !== input.organizationId) {
      throw new Error('Cross-organization workpaper inputs are forbidden');
    }
    if (determination.jurisdiction !== input.jurisdiction || determination.taxType !== input.taxType) {
      throw new Error(`Determination ${determination.id} is outside the requested jurisdiction or tax type`);
    }
    assertSameMoneyUnit(zero, determination.taxAmount);

    const transaction = transactions.get(determination.transactionId);
    if (!transaction) {
      throw new Error(`Determination ${determination.id} has no source transaction in this workpaper`);
    }
    determinedTransactionIds.add(transaction.id);
    if (determination.ruleReferences.length === 0) {
      throw new Error(`Determination ${determination.id} has no rule provenance`);
    }
    for (const rule of determination.ruleReferences) {
      const key = `${rule.ruleId}:${rule.version}`;
      const existing = rules.get(key);
      if (existing && !sameRuleReference(existing, rule)) {
        throw new Error(`Conflicting provenance for rule ${key}`);
      }
      rules.set(key, rule);
    }

    if (transaction.transactionType === 'purchase') {
      if (determination.taxAmount.minorUnits < 0n) {
        throw new Error(`Purchase determination ${determination.id} must not have negative tax`);
      }
      inputTax = addMoney(inputTax, determination.taxAmount);
      inputTransactionIds.add(transaction.id);
      inputDeterminationIds.push(determination.id);
    } else {
      if (transaction.transactionType === 'sale' && determination.taxAmount.minorUnits < 0n) {
        throw new Error(`Sale determination ${determination.id} must not have negative tax`);
      }
      if (transaction.transactionType === 'refund' && determination.taxAmount.minorUnits > 0n) {
        throw new Error(`Refund determination ${determination.id} must not have positive tax`);
      }
      outputTax = addMoney(outputTax, determination.taxAmount);
      outputTransactionIds.add(transaction.id);
      outputDeterminationIds.push(determination.id);
    }
  }

  const undetermined = [...transactions.keys()].find((id) => !determinedTransactionIds.has(id));
  if (undetermined) {
    throw new Error(`Source transaction ${undetermined} has no deterministic tax determination`);
  }

  return {
    organizationId: input.organizationId,
    jurisdiction: input.jurisdiction,
    taxType: input.taxType,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    status: 'draft',
    requiresApproval: true,
    lines: [
      {
        code: 'output_tax',
        description: 'Output tax on sales and refunds',
        amount: outputTax,
        sourceTransactionIds: [...outputTransactionIds],
        determinationIds: outputDeterminationIds,
      },
      {
        code: 'input_tax',
        description: 'Input tax on purchases',
        amount: inputTax,
        sourceTransactionIds: [...inputTransactionIds],
        determinationIds: inputDeterminationIds,
      },
    ],
    outputTax,
    inputTax,
    netTaxPayable: subtractMoney(outputTax, inputTax),
    ruleReferences: [...rules.values()],
  };
}
