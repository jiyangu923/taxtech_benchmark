import { describe, expect, it } from 'vitest';

import { moneyFromDecimal, moneyToDecimal } from './money';
import {
  buildFilingWorkpaper,
  type DeterministicTaxDetermination,
  type FilingSourceTransaction,
  type TaxRuleReference,
} from './workpaper';

const ORG = 'org-a';
const RULE: TaxRuleReference = {
  ruleId: 'us-ca-saas-2026',
  version: '2026.1',
  sourceUrl: 'https://www.cdtfa.ca.gov/',
  effectiveFrom: '2026-01-01',
  lastVerified: '2026-08-30',
};

function transaction(id: string, transactionType: FilingSourceTransaction['transactionType']): FilingSourceTransaction {
  return { id, organizationId: ORG, transactionType };
}

function determination(
  id: string,
  transactionId: string,
  taxAmount: string,
  overrides: Partial<DeterministicTaxDetermination> = {},
): DeterministicTaxDetermination {
  return {
    id,
    organizationId: ORG,
    transactionId,
    jurisdiction: 'US-CA',
    taxType: 'sales_tax',
    taxAmount: moneyFromDecimal('USD', taxAmount),
    ruleReferences: [RULE],
    ...overrides,
  };
}

function build(
  transactions: FilingSourceTransaction[],
  determinations: DeterministicTaxDetermination[],
) {
  return buildFilingWorkpaper({
    organizationId: ORG,
    jurisdiction: 'US-CA',
    taxType: 'sales_tax',
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    currency: 'USD',
    transactions,
    determinations,
  });
}

describe('buildFilingWorkpaper', () => {
  it('aggregates output and input tax and requires approval', () => {
    const workpaper = build(
      [transaction('sale-1', 'sale'), transaction('purchase-1', 'purchase')],
      [determination('det-sale', 'sale-1', '72.50'), determination('det-purchase', 'purchase-1', '12.00')],
    );

    expect(moneyToDecimal(workpaper.outputTax)).toBe('72.50');
    expect(moneyToDecimal(workpaper.inputTax)).toBe('12.00');
    expect(moneyToDecimal(workpaper.netTaxPayable)).toBe('60.50');
    expect(workpaper.status).toBe('draft');
    expect(workpaper.requiresApproval).toBe(true);
  });

  it('supports multiple tax components for one transaction without duplicating its source ID', () => {
    const workpaper = build(
      [transaction('sale-1', 'sale')],
      [determination('det-state', 'sale-1', '50.00'), determination('det-local', 'sale-1', '22.50')],
    );

    expect(moneyToDecimal(workpaper.outputTax)).toBe('72.50');
    expect(workpaper.lines[0].sourceTransactionIds).toEqual(['sale-1']);
    expect(workpaper.lines[0].determinationIds).toEqual(['det-state', 'det-local']);
  });

  it('keeps negative refund tax in output tax', () => {
    const workpaper = build(
      [transaction('sale-1', 'sale'), transaction('refund-1', 'refund')],
      [determination('det-sale', 'sale-1', '72.50'), determination('det-refund', 'refund-1', '-7.25')],
    );

    expect(moneyToDecimal(workpaper.outputTax)).toBe('65.25');
  });

  it('rejects a positive refund determination', () => {
    expect(() =>
      build(
        [transaction('refund-1', 'refund')],
        [determination('det-refund', 'refund-1', '7.25')],
      ),
    ).toThrow(/must not have positive tax/);
  });

  it('rejects determinations without source transactions', () => {
    expect(() =>
      build([transaction('sale-1', 'sale')], [determination('orphan', 'missing', '10.00')]),
    ).toThrow(/no source transaction/);
  });

  it('rejects source transactions without deterministic determinations', () => {
    expect(() => build([transaction('sale-1', 'sale')], [])).toThrow(/no deterministic tax determination/);
  });

  it('rejects duplicate determination IDs before they can double-count tax', () => {
    expect(() =>
      build(
        [transaction('sale-1', 'sale')],
        [determination('duplicate', 'sale-1', '10.00'), determination('duplicate', 'sale-1', '10.00')],
      ),
    ).toThrow(/Duplicate determination ID/);
  });

  it('rejects determinations without rule provenance', () => {
    expect(() =>
      build(
        [transaction('sale-1', 'sale')],
        [determination('det-sale', 'sale-1', '10.00', { ruleReferences: [] })],
      ),
    ).toThrow(/no rule provenance/);
  });

  it('rejects mixed jurisdictions', () => {
    expect(() =>
      build(
        [transaction('sale-1', 'sale')],
        [determination('det-sale', 'sale-1', '10.00', { jurisdiction: 'US-NY' })],
      ),
    ).toThrow(/outside the requested jurisdiction/);
  });
});
