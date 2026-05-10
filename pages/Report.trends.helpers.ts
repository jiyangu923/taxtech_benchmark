import { Submission } from '../types';
import { compositeAuto, mapTechFTE, mapBizFTE } from './Report.helpers';

/**
 * Time-series helpers for the /report Trends tab.
 *
 * Each submission represents a snapshot of a user's tax-tech state at the
 * moment they submitted. PR #67 made createSubmission soft-archive instead
 * of overwrite, so when a user resubmits we get a NEW row with a fresh
 * `submittedAt` timestamp — over time, multiple snapshots per user
 * accumulate, and we can plot how the industry shifts.
 *
 * Bucketing: by calendar quarter (e.g. "2026-Q2"). Quarterly is the right
 * granularity for a benchmark that reminds users to refresh quarterly —
 * monthly buckets would be too noisy with sparse early data, annual too
 * coarse to spot meaningful shifts.
 *
 * Filtering: trends include ALL approved submissions across history (both
 * `is_current=true` and archived rows). Each archived row is a real past
 * data point; excluding them would throw away the historical signal.
 */

export interface QuarterPoint {
  /** ISO-ish quarter label, e.g. "2026-Q2". Sort lexicographically for chrono order. */
  quarter: string;
  /** Number of submissions made in this quarter (counts each snapshot, not unique users). */
  count: number;
  /** Same as count but only unique-user count for this quarter. */
  uniqueUsers: number;
}

export interface AutomationTrendPoint extends QuarterPoint {
  /** Average composite automation index (0-100) of submissions in this quarter. NaN if count = 0. */
  avgAutomationIndex: number;
}

export interface AiAdoptionPoint extends QuarterPoint {
  /** Percentage (0-100) of in-quarter submissions where aiAdopted = true. */
  aiAdoptedPercent: number;
}

export interface FteCompositionPoint extends QuarterPoint {
  /** Average tax-tech FTE count across in-quarter submissions. */
  avgTaxTechFte: number;
  /** Average tax-business FTE count across in-quarter submissions. */
  avgTaxBusinessFte: number;
}

/**
 * Format a Date as an ISO-style quarter label like "2026-Q2".
 * Uses calendar quarters (Q1 = Jan-Mar, Q2 = Apr-Jun, etc.)
 */
export function quarterLabel(d: Date): string {
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

/** Approved + has a parseable submittedAt. */
function approved(subs: Submission[]): Submission[] {
  return subs.filter(s => {
    if (s.status !== 'approved') return false;
    if (!s.submittedAt) return false;
    const t = Date.parse(s.submittedAt);
    return Number.isFinite(t);
  });
}

/**
 * Bucket submissions by their submittedAt quarter.
 * Returns a Map of quarter → submissions, with quarters in chronological order.
 */
export function bucketByQuarter(submissions: Submission[]): Map<string, Submission[]> {
  const map = new Map<string, Submission[]>();
  for (const s of approved(submissions)) {
    const q = quarterLabel(new Date(s.submittedAt));
    const arr = map.get(q) || [];
    arr.push(s);
    map.set(q, arr);
  }
  // Re-create in sorted order so consumers see quarters left-to-right chronologically.
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function uniqueUserCount(subs: Submission[]): number {
  return new Set(subs.map(s => s.userId)).size;
}

/** Volume trend: number of submissions per quarter. */
export function submissionVolumeTrend(submissions: Submission[]): QuarterPoint[] {
  const buckets = bucketByQuarter(submissions);
  return [...buckets.entries()].map(([quarter, subs]) => ({
    quarter,
    count: subs.length,
    uniqueUsers: uniqueUserCount(subs),
  }));
}

/** Average composite automation index per quarter. */
export function automationIndexTrend(submissions: Submission[]): AutomationTrendPoint[] {
  const buckets = bucketByQuarter(submissions);
  return [...buckets.entries()].map(([quarter, subs]) => {
    const scores = subs.map(compositeAuto).filter(n => Number.isFinite(n));
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : NaN;
    return {
      quarter,
      count: subs.length,
      uniqueUsers: uniqueUserCount(subs),
      avgAutomationIndex: avg,
    };
  });
}

/** % of in-quarter submissions where aiAdopted is true. */
export function aiAdoptionTrend(submissions: Submission[]): AiAdoptionPoint[] {
  const buckets = bucketByQuarter(submissions);
  return [...buckets.entries()].map(([quarter, subs]) => {
    const adopted = subs.filter(s => s.aiAdopted === true).length;
    const pct = subs.length ? (adopted / subs.length) * 100 : 0;
    return {
      quarter,
      count: subs.length,
      uniqueUsers: uniqueUserCount(subs),
      aiAdoptedPercent: pct,
    };
  });
}

/** Average FTE counts per quarter (tax tech vs tax business). */
export function fteCompositionTrend(submissions: Submission[]): FteCompositionPoint[] {
  const buckets = bucketByQuarter(submissions);
  return [...buckets.entries()].map(([quarter, subs]) => {
    const tech = subs.map(s => mapTechFTE(s.taxTechFTEsRange)).filter(n => Number.isFinite(n));
    const biz  = subs.map(s => mapBizFTE(s.taxBusinessFTEsRange)).filter(n => Number.isFinite(n));
    const avgTech = tech.length ? tech.reduce((a, b) => a + b, 0) / tech.length : 0;
    const avgBiz  = biz.length  ? biz.reduce((a, b) => a + b, 0) / biz.length  : 0;
    return {
      quarter,
      count: subs.length,
      uniqueUsers: uniqueUserCount(subs),
      avgTaxTechFte: avgTech,
      avgTaxBusinessFte: avgBiz,
    };
  });
}

/**
 * Returns true when there's enough data to render a meaningful trend:
 * at least 2 distinct quarters with at least 1 submission each.
 * Used by the UI to decide between rendering charts vs an empty state.
 */
export function hasTrendData(submissions: Submission[]): boolean {
  return bucketByQuarter(submissions).size >= 2;
}
