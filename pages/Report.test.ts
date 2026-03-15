import { describe, it, expect } from 'vitest';
import { mapAuto, calculateIndustryStats } from './Report';
import { Submission } from '../types';

// ─── mapAuto ─────────────────────────────────────────────────────────────────

describe('mapAuto', () => {
  it('maps each known automation key to the correct representative value', () => {
    expect(mapAuto('99_plus')).toBe(99.5);
    expect(mapAuto('90_99')).toBe(95);
    expect(mapAuto('70_90')).toBe(80);
    expect(mapAuto('40_70')).toBe(55);
    expect(mapAuto('under_40')).toBe(20);
  });

  it('returns 0 for undefined', () => {
    expect(mapAuto(undefined)).toBe(0);
  });

  it('returns 0 for an unknown key', () => {
    expect(mapAuto('not_a_real_key')).toBe(0);
  });
});

// ─── calculateIndustryStats ───────────────────────────────────────────────────

const baseSub = (overrides: Partial<Submission> = {}): Submission => ({
  id: 'x',
  userId: 'u',
  userName: 'Test',
  status: 'approved',
  submittedAt: '2024-01-01',
  companyProfile: [],
  participationGoal: [],
  respondentRole: '',
  ownedTaxFunctions: [],
  organizationScope: '',
  revenueRange: '',
  aiAdopted: false,
  ...overrides,
});

describe('calculateIndustryStats', () => {
  it('returns null when given an empty array', () => {
    expect(calculateIndustryStats([])).toBeNull();
  });

  it('returns null when all submissions are rejected', () => {
    const subs = [baseSub({ status: 'rejected' }), baseSub({ status: 'rejected' })];
    expect(calculateIndustryStats(subs)).toBeNull();
  });

  it('excludes rejected submissions from the averages', () => {
    const subs = [
      baseSub({ taxCalculationAutomationRange: '99_plus', status: 'approved' }),  // 99.5
      baseSub({ taxCalculationAutomationRange: 'under_40', status: 'rejected' }), // excluded
    ];
    const stats = calculateIndustryStats(subs)!;
    expect(stats.averages.calculation).toBe(Math.round(99.5));
  });

  it('calculates correct averages across multiple approved submissions', () => {
    const subs = [
      baseSub({ taxCalculationAutomationRange: '99_plus' }), // 99.5
      baseSub({ taxCalculationAutomationRange: '40_70' }),   // 55
    ];
    const stats = calculateIndustryStats(subs)!;
    expect(stats.averages.calculation).toBe(Math.round((99.5 + 55) / 2)); // 77
  });

  it('calculates AI adoption rate as a percentage', () => {
    const subs = [
      baseSub({ aiAdopted: true }),
      baseSub({ aiAdopted: true }),
      baseSub({ aiAdopted: false }),
      baseSub({ aiAdopted: false }),
    ];
    const stats = calculateIndustryStats(subs)!;
    expect(stats.averages.aiRate).toBe(50);
  });

  it('returns 0% AI adoption when no submissions have AI adopted', () => {
    const subs = [baseSub({ aiAdopted: false }), baseSub({ aiAdopted: false })];
    const stats = calculateIndustryStats(subs)!;
    expect(stats.averages.aiRate).toBe(0);
  });

  it('returns 100% AI adoption when all submissions have AI adopted', () => {
    const subs = [baseSub({ aiAdopted: true }), baseSub({ aiAdopted: true })];
    const stats = calculateIndustryStats(subs)!;
    expect(stats.averages.aiRate).toBe(100);
  });

  it('builds archData with correct labels and counts', () => {
    const subs = [
      baseSub({ taxDataArchitecture: 'data_lake' }),
      baseSub({ taxDataArchitecture: 'data_lake' }),
      baseSub({ taxDataArchitecture: 'erp_only' }),
    ];
    const stats = calculateIndustryStats(subs)!;
    const lakeEntry = stats.archData.find((d: any) => d.name.includes('Lake') || d.name === 'Centralized Tax Data Lake');
    const erpEntry  = stats.archData.find((d: any) => d.name.includes('ERP'));
    expect(lakeEntry?.value).toBe(2);
    expect(erpEntry?.value).toBe(1);
  });

  it('uses the raw key as the arch label when it is not in OPTS_TAX_DATA_ARCH', () => {
    const subs = [baseSub({ taxDataArchitecture: 'unknown_arch_key' })];
    const stats = calculateIndustryStats(subs)!;
    expect(stats.archData[0].name).toBe('unknown_arch_key');
  });

  it('omits entries from archData for submissions with no taxDataArchitecture', () => {
    const subs = [baseSub({ taxDataArchitecture: undefined })];
    const stats = calculateIndustryStats(subs)!;
    expect(stats.archData).toHaveLength(0);
  });
});
