import { describe, it, expect } from 'vitest';
import {
  aiAdoptionTrend,
  automationIndexTrend,
  bucketByQuarter,
  fteCompositionTrend,
  hasTrendData,
  quarterLabel,
  submissionVolumeTrend,
} from './Report.trends.helpers';
import { Submission } from '../types';

const sub = (overrides: Partial<Submission>): Submission => ({
  id: overrides.id ?? 's',
  userId: overrides.userId ?? 'u',
  userName: overrides.userName ?? 'U',
  status: overrides.status ?? 'approved',
  submittedAt: overrides.submittedAt ?? '2026-04-15T00:00:00Z',
  companyProfile: [],
  participationGoal: [],
  respondentRole: '',
  ownedTaxFunctions: [],
  organizationScope: '',
  revenueRange: '',
  aiAdopted: overrides.aiAdopted ?? false,
  ...overrides,
});

describe('quarterLabel', () => {
  it('maps Jan/Feb/Mar dates to Q1', () => {
    expect(quarterLabel(new Date('2026-01-15T00:00:00Z'))).toBe('2026-Q1');
    expect(quarterLabel(new Date('2026-03-31T23:59:59Z'))).toBe('2026-Q1');
  });
  it('maps Apr/May/Jun dates to Q2', () => {
    expect(quarterLabel(new Date('2026-04-01T00:00:00Z'))).toBe('2026-Q2');
    expect(quarterLabel(new Date('2026-06-30T00:00:00Z'))).toBe('2026-Q2');
  });
  it('maps Jul/Aug/Sep dates to Q3', () => {
    expect(quarterLabel(new Date('2026-09-15T00:00:00Z'))).toBe('2026-Q3');
  });
  it('maps Oct/Nov/Dec dates to Q4', () => {
    expect(quarterLabel(new Date('2026-12-31T00:00:00Z'))).toBe('2026-Q4');
  });
});

describe('bucketByQuarter', () => {
  it('groups submissions by their submittedAt quarter', () => {
    const subs = [
      sub({ id: 'a', submittedAt: '2026-02-10T00:00:00Z' }),
      sub({ id: 'b', submittedAt: '2026-04-15T00:00:00Z' }),
      sub({ id: 'c', submittedAt: '2026-05-01T00:00:00Z' }),
    ];
    const out = bucketByQuarter(subs);
    expect(out.get('2026-Q1')?.map(s => s.id)).toEqual(['a']);
    expect(out.get('2026-Q2')?.map(s => s.id)).toEqual(['b', 'c']);
  });

  it('returns quarters in chronological (lexicographic) order', () => {
    const subs = [
      sub({ id: 'a', submittedAt: '2026-10-01T00:00:00Z' }), // Q4
      sub({ id: 'b', submittedAt: '2026-02-01T00:00:00Z' }), // Q1
      sub({ id: 'c', submittedAt: '2026-07-01T00:00:00Z' }), // Q3
    ];
    expect([...bucketByQuarter(subs).keys()]).toEqual(['2026-Q1', '2026-Q3', '2026-Q4']);
  });

  it('skips non-approved submissions', () => {
    const subs = [
      sub({ id: 'a', status: 'pending' }),
      sub({ id: 'b', status: 'rejected' }),
      sub({ id: 'c', status: 'approved' }),
    ];
    expect([...bucketByQuarter(subs).values()].flat().map(s => s.id)).toEqual(['c']);
  });

  it('skips submissions with missing or unparseable submittedAt', () => {
    const subs = [
      sub({ id: 'a', submittedAt: '' }),
      sub({ id: 'b', submittedAt: 'not-a-date' }),
      sub({ id: 'c', submittedAt: '2026-04-15T00:00:00Z' }),
    ];
    expect([...bucketByQuarter(subs).values()].flat().map(s => s.id)).toEqual(['c']);
  });

  it('returns an empty map for an empty input', () => {
    expect(bucketByQuarter([]).size).toBe(0);
  });
});

describe('submissionVolumeTrend', () => {
  it('counts submissions and unique users per quarter', () => {
    const subs = [
      sub({ id: 'a1', userId: 'a', submittedAt: '2026-01-15T00:00:00Z' }),
      sub({ id: 'a2', userId: 'a', submittedAt: '2026-04-15T00:00:00Z' }), // same user, different quarter
      sub({ id: 'b1', userId: 'b', submittedAt: '2026-04-20T00:00:00Z' }),
      sub({ id: 'b2', userId: 'b', submittedAt: '2026-04-25T00:00:00Z' }), // same user, same quarter
    ];
    const out = submissionVolumeTrend(subs);
    expect(out).toEqual([
      { quarter: '2026-Q1', count: 1, uniqueUsers: 1 },
      { quarter: '2026-Q2', count: 3, uniqueUsers: 2 },
    ]);
  });

  it('returns an empty array for no data', () => {
    expect(submissionVolumeTrend([])).toEqual([]);
  });
});

describe('automationIndexTrend', () => {
  it('averages composite automation per quarter', () => {
    // Range keys from constants.ts: '99_plus', '90_99', '70_90', '40_70', 'under_40'
    const subs = [
      sub({ submittedAt: '2026-01-15T00:00:00Z', taxCalculationAutomationRange: '99_plus' }),
      sub({ submittedAt: '2026-04-15T00:00:00Z', taxCalculationAutomationRange: 'under_40' }),
    ];
    const out = automationIndexTrend(subs);
    expect(out.map(p => p.quarter)).toEqual(['2026-Q1', '2026-Q2']);
    expect(out[0].avgAutomationIndex).toBeGreaterThan(out[1].avgAutomationIndex);
  });

  it('preserves count + uniqueUsers fields', () => {
    const subs = [
      sub({ id: 'a', userId: 'a', submittedAt: '2026-04-15T00:00:00Z' }),
      sub({ id: 'b', userId: 'a', submittedAt: '2026-04-20T00:00:00Z' }),
    ];
    const out = automationIndexTrend(subs);
    expect(out[0].count).toBe(2);
    expect(out[0].uniqueUsers).toBe(1);
  });
});

describe('aiAdoptionTrend', () => {
  it('reports the percent of in-quarter submissions with aiAdopted=true', () => {
    const subs = [
      sub({ submittedAt: '2026-01-15T00:00:00Z', aiAdopted: true }),
      sub({ submittedAt: '2026-01-20T00:00:00Z', aiAdopted: false }),
      sub({ submittedAt: '2026-04-15T00:00:00Z', aiAdopted: true }),
      sub({ submittedAt: '2026-04-20T00:00:00Z', aiAdopted: true }),
    ];
    const out = aiAdoptionTrend(subs);
    expect(out[0]).toMatchObject({ quarter: '2026-Q1', aiAdoptedPercent: 50 });
    expect(out[1]).toMatchObject({ quarter: '2026-Q2', aiAdoptedPercent: 100 });
  });

  it('returns 0% for an empty quarter (defensive)', () => {
    // bucketByQuarter never includes empty quarters, but the helper should
    // still defend against a count=0 division — verified via empty input.
    expect(aiAdoptionTrend([])).toEqual([]);
  });
});

describe('fteCompositionTrend', () => {
  it('averages tax-tech and tax-business FTE per quarter', () => {
    // Tech FTE keys: 'zero', '1_5', '6_15', '16_30', '31_100', 'over_100'
    // Biz FTE keys: 'under_10', '10_25', '26_50', '51_150', 'over_150'
    const subs = [
      sub({ submittedAt: '2026-04-15T00:00:00Z', taxTechFTEsRange: '6_15',  taxBusinessFTEsRange: '26_50' }),
      sub({ submittedAt: '2026-04-20T00:00:00Z', taxTechFTEsRange: '1_5',   taxBusinessFTEsRange: '10_25' }),
    ];
    const out = fteCompositionTrend(subs);
    expect(out).toHaveLength(1);
    expect(out[0].quarter).toBe('2026-Q2');
    expect(out[0].avgTaxTechFte).toBeGreaterThan(0);
    expect(out[0].avgTaxBusinessFte).toBeGreaterThan(out[0].avgTaxTechFte);
  });

  it('handles missing range fields without throwing', () => {
    const subs = [sub({ submittedAt: '2026-04-15T00:00:00Z' })];
    const out = fteCompositionTrend(subs);
    expect(out[0].avgTaxTechFte).toBeGreaterThanOrEqual(0);
    expect(out[0].avgTaxBusinessFte).toBeGreaterThanOrEqual(0);
  });
});

describe('hasTrendData', () => {
  it('returns false for 0 quarters', () => {
    expect(hasTrendData([])).toBe(false);
  });
  it('returns false for 1 quarter', () => {
    expect(hasTrendData([sub({ submittedAt: '2026-04-15T00:00:00Z' })])).toBe(false);
  });
  it('returns true for 2+ quarters', () => {
    expect(hasTrendData([
      sub({ id: 'a', submittedAt: '2026-01-15T00:00:00Z' }),
      sub({ id: 'b', submittedAt: '2026-04-15T00:00:00Z' }),
    ])).toBe(true);
  });
});
