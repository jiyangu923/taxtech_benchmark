import { Submission } from '../types';
import * as C from '../constants';

/**
 * Loaded annual cost per FTE used for composite cost calculations.
 * (US$, fully-loaded — salary + benefits + overhead.)
 */
export const FTE_LOADED_RATE = 150_000;

/**
 * Maps the tax-tech FTE bucket key to a representative midpoint.
 * Buckets come from OPTS_FTE_TECH in constants.ts.
 */
export function mapTechFTE(val?: string): number {
  const m: Record<string, number> = {
    zero: 0,
    '1_5': 3,
    '6_15': 10,
    '16_30': 23,
    '31_100': 65,
    over_100: 130,
  };
  return val ? m[val] ?? 0 : 0;
}

/**
 * Maps the tax-business FTE bucket key to a representative midpoint.
 * Buckets come from OPTS_FTE_BUSINESS in constants.ts.
 */
export function mapBizFTE(val?: string): number {
  const m: Record<string, number> = {
    under_10: 5,
    '10_25': 17,
    '26_50': 38,
    '51_150': 100,
    over_150: 200,
  };
  return val ? m[val] ?? 0 : 0;
}

/**
 * Maps the annual tax-tech budget bucket key to a midpoint USD amount.
 * "prefer_not_to_answer" is treated as 0 (excluded from cost composites).
 */
export function mapBudget(val?: string): number {
  const m: Record<string, number> = {
    under_500k: 250_000,
    '500k_1m': 750_000,
    '1m_3m': 2_000_000,
    '3m_10m': 6_500_000,
    '10m_25m': 17_500_000,
    over_25m: 35_000_000,
    prefer_not_to_answer: 0,
  };
  return val ? m[val] ?? 0 : 0;
}

/** Maps an automation range key (shared with mapAuto in Report.tsx). */
function mapAutoLocal(val?: string): number {
  const m: Record<string, number> = {
    '99_plus': 99.5,
    '90_99': 95,
    '70_90': 80,
    '40_70': 55,
    under_40: 20,
  };
  return val ? m[val] ?? 0 : 0;
}

/**
 * Composite automation index = average across all 7 automation dimensions.
 * Dimensions with no answer are excluded from the average.
 */
export function compositeAuto(s: Submission): number {
  const fields: (string | undefined)[] = [
    s.taxCalculationAutomationRange,
    s.taxPaymentAutomationRange,
    s.withholdingTaxAutomationRange,
    s.complianceAutomationCoverageRange,
    s.vatSalesTaxAutomationRange,
    s.eInvoicingAutomationRange,
    s.customsDutiesAutomationRange,
  ];
  const vals = fields.filter(v => v != null).map(mapAutoLocal);
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/**
 * Composite annual cost (USD) = (all FTE counts × loaded rate) + budget midpoint.
 * Includes both insourced and outsourced FTE counts so headcount-light shops
 * with heavy outsourcing aren't undercounted.
 */
export function compositeCost(s: Submission): number {
  const fteCount =
    mapTechFTE(s.taxTechFTEsRange) +
    mapBizFTE(s.taxBusinessFTEsRange) +
    mapTechFTE(s.taxTechOutsourcedResourcesFTEsRange) +
    mapBizFTE(s.taxBusinessOutsourcingFTEsRange);
  return fteCount * FTE_LOADED_RATE + mapBudget(s.annualTaxTechBudgetRange);
}

/**
 * Cost per automation point ($K). Lower = more value per dollar.
 * Submissions with 0 automation are floored to 1 to avoid Infinity.
 */
export function costPerAutoPoint(s: Submission): number {
  const auto = Math.max(compositeAuto(s), 1);
  return Math.round(compositeCost(s) / auto / 1_000);
}

/** Median utility (handles even/odd lengths). */
export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Builds a 7-dimension automation comparison: yours vs peer median.
 * Used by the Automation radar.
 */
export function automationRadar(mySub: Submission | null, peerSubs: Submission[]) {
  const dims = [
    { key: 'taxCalculationAutomationRange',     label: 'Calculation' },
    { key: 'taxPaymentAutomationRange',         label: 'Payment' },
    { key: 'withholdingTaxAutomationRange',     label: 'Withholding' },
    { key: 'complianceAutomationCoverageRange', label: 'Compliance' },
    { key: 'vatSalesTaxAutomationRange',        label: 'VAT/Sales' },
    { key: 'eInvoicingAutomationRange',         label: 'e-Invoicing' },
    { key: 'customsDutiesAutomationRange',      label: 'Customs' },
  ] as const;

  return dims.map(d => ({
    dimension: d.label,
    you:  mySub ? mapAutoLocal(mySub[d.key] as string | undefined) : 0,
    peer: median(peerSubs.map(p => mapAutoLocal(p[d.key] as string | undefined))),
  }));
}

/**
 * Builds the Automation vs Cost scatter dataset.
 * Returns the points + the median cost & median automation lines that
 * divide the chart into four quadrants.
 */
export function automationVsCost(mySub: Submission | null, peerSubs: Submission[]) {
  const points = peerSubs.map((s, i) => ({
    cost: compositeCost(s),
    auto: compositeAuto(s),
    label: s.id === mySub?.id ? 'You' : `Peer ${i + 1}`,
    isYou: s.id === mySub?.id,
  })).filter(p => p.cost > 0); // exclude no-budget rows so they don't sit on the y-axis

  return {
    points,
    medianCost: median(points.map(p => p.cost)),
    medianAuto: median(points.map(p => p.auto)),
  };
}

/**
 * Cost-per-automation-point ranking — sorted ascending (best value first).
 * Returns the top 12 + you (if you didn't make the top 12).
 */
export function costPerAutoRanking(mySub: Submission | null, peerSubs: Submission[]) {
  const all = peerSubs
    .filter(s => compositeCost(s) > 0 && compositeAuto(s) > 0)
    .map((s, i) => ({
      label: s.id === mySub?.id ? 'You' : `Peer ${i + 1}`,
      isYou: s.id === mySub?.id,
      value: costPerAutoPoint(s),
    }))
    .sort((a, b) => a.value - b.value);

  const top = all.slice(0, 12);
  const youInTop = top.some(p => p.isYou);
  const youRow = !youInTop ? all.find(p => p.isYou) : undefined;
  return youRow ? [...top, youRow] : top;
}

/**
 * Resource mix by revenue band: avg insourced tech FTE, avg insourced biz FTE,
 * avg outsourced (tech + biz) per band. Bands with 0 submissions are dropped.
 */
export function resourceMixByRevenue(subs: Submission[]) {
  return C.OPTS_REVENUE.map(band => {
    const inBand = subs.filter(s => s.revenueRange === band.value);
    if (inBand.length === 0) return null;

    const avg = (fn: (s: Submission) => number) =>
      Math.round(inBand.reduce((a, s) => a + fn(s), 0) / inBand.length);

    return {
      band: band.label.replace(' – ', '–'),
      tech: avg(s => mapTechFTE(s.taxTechFTEsRange)),
      biz:  avg(s => mapBizFTE(s.taxBusinessFTEsRange)),
      outsourced:
        avg(s => mapTechFTE(s.taxTechOutsourcedResourcesFTEsRange)) +
        avg(s => mapBizFTE(s.taxBusinessOutsourcingFTEsRange)),
      n: inBand.length,
    };
  }).filter(b => b !== null) as Array<{ band: string; tech: number; biz: number; outsourced: number; n: number }>;
}

/**
 * AI adoption funnel: Not Adopted → Exploration → PoC → Production → Enterprise-Wide.
 */
export function aiAdoptionFunnel(subs: Submission[]) {
  const total = subs.length;
  if (total === 0) return [];

  const notAdopted = subs.filter(s => !s.aiAdopted).length;
  const adopted = subs.filter(s => s.aiAdopted);

  const stageCount = (key: string) =>
    adopted.filter(s => s.genAIAdoptionStage === key).length;

  return [
    { stage: 'Not Adopted',     count: notAdopted,                  pct: Math.round((notAdopted / total) * 100) },
    { stage: 'Exploration',     count: stageCount('exploration'),   pct: Math.round((stageCount('exploration')   / total) * 100) },
    { stage: 'PoC',             count: stageCount('poc'),           pct: Math.round((stageCount('poc')           / total) * 100) },
    { stage: 'Production',      count: stageCount('production'),    pct: Math.round((stageCount('production')    / total) * 100) },
    { stage: 'Enterprise-Wide', count: stageCount('enterprise_wide'), pct: Math.round((stageCount('enterprise_wide') / total) * 100) },
  ];
}

/**
 * Architecture mix grouped by revenue band — stacked-bar dataset.
 * Each row is a revenue band; columns are architecture types with counts.
 */
export function architectureByRevenue(subs: Submission[]) {
  const archLabel = (val?: string) =>
    val ? (C.OPTS_TAX_DATA_ARCH.find(o => o.value === val)?.label || val) : 'Unspecified';

  // Discover the architectures that actually appear so stack keys are stable.
  const archKeys = Array.from(new Set(subs.map(s => archLabel(s.taxDataArchitecture))));

  return C.OPTS_REVENUE.map(band => {
    const inBand = subs.filter(s => s.revenueRange === band.value);
    if (inBand.length === 0) return null;
    const row: Record<string, string | number> = { band: band.label.replace(' – ', '–') };
    archKeys.forEach(key => {
      row[key] = inBand.filter(s => archLabel(s.taxDataArchitecture) === key).length;
    });
    return row;
  }).filter(r => r !== null) as Array<Record<string, string | number>>;
}

/** Cost in $M for axis labels. */
export function fmtCostM(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}
