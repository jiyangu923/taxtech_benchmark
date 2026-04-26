import { describe, it, expect } from 'vitest';
import {
  FTE_LOADED_RATE,
  mapTechFTE, mapBizFTE, mapBudget,
  compositeAuto, compositeCost, costPerAutoPoint,
  median,
  automationRadar, automationVsCost, costPerAutoRanking,
  resourceMixByRevenue, aiAdoptionFunnel, architectureByRevenue,
  fmtCostM,
} from './Report.helpers';
import { Submission } from '../types';

const baseSub = (overrides: Partial<Submission> = {}): Submission => ({
  id: 'x',
  userId: 'u',
  userName: 'Test',
  status: 'approved',
  submittedAt: '2026-01-01',
  companyProfile: [],
  participationGoal: [],
  respondentRole: '',
  ownedTaxFunctions: [],
  organizationScope: '',
  revenueRange: '',
  aiAdopted: false,
  ...overrides,
});

// ─── range maps ──────────────────────────────────────────────────────────────

describe('mapTechFTE', () => {
  it('maps each tech FTE bucket to a midpoint', () => {
    expect(mapTechFTE('zero')).toBe(0);
    expect(mapTechFTE('1_5')).toBe(3);
    expect(mapTechFTE('over_100')).toBe(130);
  });
  it('returns 0 for unknown / undefined', () => {
    expect(mapTechFTE(undefined)).toBe(0);
    expect(mapTechFTE('mystery')).toBe(0);
  });
});

describe('mapBizFTE', () => {
  it('maps each biz FTE bucket to a midpoint', () => {
    expect(mapBizFTE('under_10')).toBe(5);
    expect(mapBizFTE('over_150')).toBe(200);
  });
});

describe('mapBudget', () => {
  it('maps each budget bucket to a USD midpoint', () => {
    expect(mapBudget('under_500k')).toBe(250_000);
    expect(mapBudget('over_25m')).toBe(35_000_000);
  });
  it('treats prefer_not_to_answer as 0 to exclude from cost composites', () => {
    expect(mapBudget('prefer_not_to_answer')).toBe(0);
  });
});

// ─── composites ──────────────────────────────────────────────────────────────

describe('compositeAuto', () => {
  it('averages all 7 automation dimensions when present', () => {
    const s = baseSub({
      taxCalculationAutomationRange: '99_plus',  // 99.5
      taxPaymentAutomationRange:     '90_99',    // 95
      withholdingTaxAutomationRange: '70_90',    // 80
      complianceAutomationCoverageRange: '40_70', // 55
      vatSalesTaxAutomationRange:    'under_40', // 20
      eInvoicingAutomationRange:     '70_90',    // 80
      customsDutiesAutomationRange:  '40_70',    // 55
    });
    // (99.5+95+80+55+20+80+55) / 7 = 69.21 → rounds to 69
    expect(compositeAuto(s)).toBe(69);
  });

  it('returns 0 when no automation dimensions are filled in', () => {
    expect(compositeAuto(baseSub())).toBe(0);
  });

  it('only averages over the dimensions that are present', () => {
    const s = baseSub({
      taxCalculationAutomationRange: '99_plus', // 99.5
      taxPaymentAutomationRange:     '90_99',   // 95
    });
    // Only 2 dims present → (99.5 + 95) / 2 = 97.25 → 97
    expect(compositeAuto(s)).toBe(97);
  });
});

describe('compositeCost', () => {
  it('sums all FTE counts × rate plus the budget midpoint', () => {
    const s = baseSub({
      taxTechFTEsRange: '6_15',                          // 10
      taxBusinessFTEsRange: '10_25',                     // 17
      taxTechOutsourcedResourcesFTEsRange: '1_5',        // 3
      taxBusinessOutsourcingFTEsRange: 'under_10',       // 5
      annualTaxTechBudgetRange: '1m_3m',                 // 2_000_000
    });
    // (10 + 17 + 3 + 5) × 150_000 + 2_000_000 = 5_250_000 + 2_000_000 = 7_250_000
    expect(compositeCost(s)).toBe(7_250_000);
  });

  it('returns 0 for an empty submission', () => {
    expect(compositeCost(baseSub())).toBe(0);
  });

  it('uses the documented loaded rate', () => {
    expect(FTE_LOADED_RATE).toBe(150_000);
  });
});

describe('costPerAutoPoint', () => {
  it('returns cost ÷ automation in $K', () => {
    const s = baseSub({
      taxTechFTEsRange: '6_15',                       // 10 FTE → 1.5M
      taxCalculationAutomationRange: '99_plus',       // 99.5 auto
      taxPaymentAutomationRange:     '99_plus',       // 99.5 auto
    });
    // cost = 1_500_000, auto ≈ 99.5 → 1500/99.5 ≈ $15K
    expect(costPerAutoPoint(s)).toBe(15);
  });

  it('floors auto at 1 to avoid Infinity for zero-automation rows', () => {
    const s = baseSub({ taxTechFTEsRange: '6_15' }); // 1.5M cost, 0 auto
    expect(costPerAutoPoint(s)).toBe(1500); // 1_500_000 / 1 / 1000
  });
});

// ─── median ─────────────────────────────────────────────────────────────────

describe('median', () => {
  it('returns the middle value for odd-length arrays', () => {
    expect(median([1, 2, 3])).toBe(2);
  });
  it('returns the average of the two middle values for even-length arrays', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('returns 0 for an empty array', () => {
    expect(median([])).toBe(0);
  });
  it('does not mutate the input array', () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});

// ─── automationRadar ────────────────────────────────────────────────────────

describe('automationRadar', () => {
  it('returns 7 dimensions with you + peer median', () => {
    const me = baseSub({ taxCalculationAutomationRange: '99_plus' });
    const peers = [
      baseSub({ taxCalculationAutomationRange: 'under_40' }), // 20
      baseSub({ taxCalculationAutomationRange: '70_90' }),    // 80
      baseSub({ taxCalculationAutomationRange: '40_70' }),    // 55
    ];
    const radar = automationRadar(me, peers);
    expect(radar).toHaveLength(7);

    const calc = radar.find(d => d.dimension === 'Calculation')!;
    expect(calc.you).toBe(99.5);
    expect(calc.peer).toBe(55); // median of [20, 80, 55] = 55
  });

  it('handles a null mySub by returning 0 for "you"', () => {
    const radar = automationRadar(null, [baseSub({ taxCalculationAutomationRange: '99_plus' })]);
    expect(radar.find(d => d.dimension === 'Calculation')?.you).toBe(0);
  });
});

// ─── automationVsCost ───────────────────────────────────────────────────────

describe('automationVsCost', () => {
  it('returns one point per peer with cost > 0 plus the medians', () => {
    const peers = [
      baseSub({ id: 'a', taxTechFTEsRange: '6_15',  taxCalculationAutomationRange: '99_plus' }),
      baseSub({ id: 'b', taxTechFTEsRange: '16_30', taxCalculationAutomationRange: '40_70' }),
      baseSub({ id: 'c' }), // 0 cost — filtered out
    ];
    const result = automationVsCost(null, peers);
    expect(result.points).toHaveLength(2);
    expect(result.medianCost).toBeGreaterThan(0);
    expect(result.medianAuto).toBeGreaterThan(0);
  });

  it('marks the user as isYou=true and labels them "You"', () => {
    const me = baseSub({ id: 'me', taxTechFTEsRange: '6_15', taxCalculationAutomationRange: '99_plus' });
    const result = automationVsCost(me, [me, baseSub({ id: 'p', taxTechFTEsRange: '6_15' })]);
    const youPoint = result.points.find(p => p.isYou);
    expect(youPoint?.label).toBe('You');
  });
});

// ─── costPerAutoRanking ─────────────────────────────────────────────────────

describe('costPerAutoRanking', () => {
  it('sorts ascending and caps at 12 + you', () => {
    const peers = Array.from({ length: 20 }, (_, i) =>
      baseSub({
        id: `p${i}`,
        taxTechFTEsRange: '6_15',
        taxCalculationAutomationRange: i % 2 ? '99_plus' : '40_70',
      })
    );
    const ranking = costPerAutoRanking(null, peers);
    expect(ranking.length).toBeLessThanOrEqual(13);
    // Verify sorted ascending
    for (let i = 1; i < ranking.length; i++) {
      expect(ranking[i].value).toBeGreaterThanOrEqual(ranking[i - 1].value);
    }
  });

  it('appends the user even if they did not make the top 12', () => {
    const me = baseSub({ id: 'me', taxTechFTEsRange: 'over_100', taxCalculationAutomationRange: 'under_40' }); // expensive + low auto
    const peers = [
      me,
      ...Array.from({ length: 12 }, (_, i) =>
        baseSub({ id: `p${i}`, taxTechFTEsRange: '1_5', taxCalculationAutomationRange: '99_plus' })
      ),
    ];
    const ranking = costPerAutoRanking(me, peers);
    expect(ranking.some(r => r.isYou)).toBe(true);
    expect(ranking[ranking.length - 1].isYou).toBe(true); // appended at end
  });
});

// ─── resourceMixByRevenue ───────────────────────────────────────────────────

describe('resourceMixByRevenue', () => {
  it('drops bands with zero submissions', () => {
    const subs = [baseSub({ revenueRange: 'over_5b', taxTechFTEsRange: '6_15' })];
    const mix = resourceMixByRevenue(subs);
    expect(mix).toHaveLength(1);
    expect(mix[0].n).toBe(1);
    expect(mix[0].tech).toBe(10);
  });
});

// ─── aiAdoptionFunnel ───────────────────────────────────────────────────────

describe('aiAdoptionFunnel', () => {
  it('returns 5 stages summing to ≤100% (rounding) of total', () => {
    const subs = [
      baseSub({ aiAdopted: false }),
      baseSub({ aiAdopted: true, genAIAdoptionStage: 'exploration' }),
      baseSub({ aiAdopted: true, genAIAdoptionStage: 'poc' }),
      baseSub({ aiAdopted: true, genAIAdoptionStage: 'production' }),
    ];
    const funnel = aiAdoptionFunnel(subs);
    expect(funnel).toHaveLength(5);
    expect(funnel.find(f => f.stage === 'Not Adopted')?.count).toBe(1);
    expect(funnel.find(f => f.stage === 'Production')?.count).toBe(1);
  });

  it('returns an empty array when no submissions exist', () => {
    expect(aiAdoptionFunnel([])).toEqual([]);
  });
});

// ─── architectureByRevenue ──────────────────────────────────────────────────

describe('architectureByRevenue', () => {
  it('produces one row per non-empty band with arch counts', () => {
    const subs = [
      baseSub({ revenueRange: 'over_5b', taxDataArchitecture: 'data_lake' }),
      baseSub({ revenueRange: 'over_5b', taxDataArchitecture: 'data_lake' }),
      baseSub({ revenueRange: 'over_5b', taxDataArchitecture: 'erp_only' }),
    ];
    const rows = architectureByRevenue(subs);
    expect(rows).toHaveLength(1);
    expect(rows[0].band).toContain('Over $5B');
  });
});

// ─── formatting ─────────────────────────────────────────────────────────────

describe('fmtCostM', () => {
  it('formats millions with M', () => {
    expect(fmtCostM(2_500_000)).toBe('$2.5M');
  });
  it('formats thousands with K', () => {
    expect(fmtCostM(450_000)).toBe('$450K');
  });
  it('formats raw amounts under 1k', () => {
    expect(fmtCostM(750)).toBe('$750');
  });
});
