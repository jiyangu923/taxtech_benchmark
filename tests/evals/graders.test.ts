import { describe, it, expect } from 'vitest';
import {
  extractPercents, gradeRateLookup, gradeNotCovered, gradeNonRate, gradeCase,
  acknowledgesNotCovered, summarize,
  type GradeInput, type GoldenCase,
} from '../../evals/graders';
import { GOLDEN } from '../../evals/golden';
import type { RuleCitation } from '../../services/claude';

const cite = (o: Partial<RuleCitation> & { jurisdiction: string; standard_rate: number }): RuleCitation => ({
  jurisdiction_name: o.jurisdiction, tax_type: 'VAT',
  source_url: 'https://x', last_verified: '2026-05-30', ...o,
});
const input = (analysis: string, rulesApplied: RuleCitation[] = []): GradeInput => ({ analysis, rulesApplied });

describe('extractPercents', () => {
  it('pulls integer, decimal, and spaced percentages', () => {
    expect(extractPercents('The rate is 19%.')).toEqual([19]);
    expect(extractPercents('Finland is 25.5% and Quebec 14.975 %.')).toEqual([25.5, 14.975]);
    expect(extractPercents('Standard 20% with a reduced 5.5%')).toEqual([20, 5.5]);
  });

  it('returns [] when no percentage is present', () => {
    expect(extractPercents('The United States has no federal VAT.')).toEqual([]);
    expect(extractPercents('You are in the top quartile of your cohort.')).toEqual([]);
  });

  it('does not misread a bare number without a percent sign', () => {
    expect(extractPercents('19 countries use it')).toEqual([]);
  });

  it('rejects comma-grouped and year-prefixed tokens instead of extracting fragments', () => {
    // Review finding: "1,000%" used to extract a spurious 0 (the "000" tail).
    expect(extractPercents('an absurd 1,000% claim')).toEqual([]);
    expect(extractPercents('in 2026% terms')).toEqual([]);
  });

  it('by design, does NOT extract word/bare/fraction phrasings (documented bar)', () => {
    expect(extractPercents('nineteen percent')).toEqual([]);
    expect(extractPercents('a rate of 0.19')).toEqual([]);
  });
});

describe('gradeRateLookup', () => {
  const exp = { jurisdiction: 'DE', standard_rate: 19.0 };

  it('passes when the rate is both cited and stated in prose', () => {
    const r = gradeRateLookup(input('Germany applies a standard VAT of 19%.', [cite({ jurisdiction: 'DE', standard_rate: 19.0 })]), exp);
    expect(r.pass).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('fails when the rate is stated but NOT cited (model memory, no tool)', () => {
    const r = gradeRateLookup(input('Germany applies a standard VAT of 19%.', []), exp);
    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/no rulesApplied citation/i);
  });

  it('fails when the cited rate disagrees with expected', () => {
    const r = gradeRateLookup(input('Germany VAT is 20%.', [cite({ jurisdiction: 'DE', standard_rate: 20.0 })]), exp);
    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/≠ expected 19%/);
  });

  it('fails when the prose never states the cited rate', () => {
    const r = gradeRateLookup(input('Germany has a standard VAT rate.', [cite({ jurisdiction: 'DE', standard_rate: 19.0 })]), exp);
    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/never states the expected 19%/);
  });

  it('matches 19 and 19.0 as equal', () => {
    expect(gradeRateLookup(input('It is 19.0%.', [cite({ jurisdiction: 'DE', standard_rate: 19.0 })]), exp).pass).toBe(true);
  });
});

describe('gradeNotCovered', () => {
  const exp = { label: 'United States' };

  it('passes when no rate is stated and nothing was cited', () => {
    const r = gradeNotCovered(input('The United States has no federal VAT; sales tax varies by state and is not in our dataset.'), exp);
    expect(r.pass).toBe(true);
  });

  it('fails when the answer fabricates a rate', () => {
    const r = gradeNotCovered(input('The US VAT rate is about 10%.'), exp);
    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/must not fabricate/i);
  });

  it('fails if the tool somehow cited a rule for an uncovered jurisdiction', () => {
    const r = gradeNotCovered(input('Not covered.', [cite({ jurisdiction: 'US', standard_rate: 10 })]), exp);
    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/cited .* rule/i);
  });

  it('deliberately fails a contrast-% answer (documented strictness)', () => {
    const r = gradeNotCovered(input("Unlike Germany's 19%, the US has no federal VAT."), exp);
    expect(r.pass).toBe(false);
  });

  it('acknowledgesNotCovered detects common phrasings (soft signal, not gating)', () => {
    expect(acknowledgesNotCovered('That jurisdiction is not covered yet.')).toBe(true);
    expect(acknowledgesNotCovered("We don't have verified data for that.")).toBe(true);
    expect(acknowledgesNotCovered('Here is a great analysis.')).toBe(false);
  });
});

describe('gradeNonRate', () => {
  it('passes when the rate tool did not fire', () => {
    expect(gradeNonRate(input('You are in the top quartile for FTEs.')).pass).toBe(true);
  });

  it('allows unrelated percentages in the answer (only the tool matters)', () => {
    // "75th percentile" / "20% above" are fine on a non-rate answer — the check
    // is purely that lookup_rate did not fire.
    expect(gradeNonRate(input('Your automation is 20% above the median.')).pass).toBe(true);
  });

  it('fails when lookup_rate fired spuriously', () => {
    const r = gradeNonRate(input('...', [cite({ jurisdiction: 'DE', standard_rate: 19 })]));
    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/fired on a non-rate/i);
  });
});

describe('gradeCase dispatch', () => {
  it('routes each bucket to its grader', () => {
    expect(gradeCase({ id: 'a', bucket: 'rate_lookup', question: 'q', expected: { jurisdiction: 'DE', standard_rate: 19 } },
      input('19%', [cite({ jurisdiction: 'DE', standard_rate: 19 })])).pass).toBe(true);
    expect(gradeCase({ id: 'b', bucket: 'not_covered', question: 'q', expected: { label: 'US' } },
      input('no data')).pass).toBe(true);
    expect(gradeCase({ id: 'c', bucket: 'non_rate', question: 'q' }, input('fine')).pass).toBe(true);
  });

  it('throws on a malformed case (missing expected for its bucket)', () => {
    expect(() => gradeCase({ id: 'x', bucket: 'rate_lookup', question: 'q' } as GoldenCase, input('19%'))).toThrow(/rate_lookup requires/);
    expect(() => gradeCase({ id: 'y', bucket: 'not_covered', question: 'q' } as GoldenCase, input('x'))).toThrow(/not_covered requires/);
  });
});

describe('summarize', () => {
  it('computes overall and per-bucket pass rates', () => {
    const s = summarize([
      { bucket: 'rate_lookup', pass: true },
      { bucket: 'rate_lookup', pass: false },
      { bucket: 'not_covered', pass: true },
      { bucket: 'non_rate', pass: true },
    ]);
    expect(s.overall).toEqual({ pass: 3, total: 4 });
    expect(s.byBucket.rate_lookup).toEqual({ pass: 1, total: 2 });
    expect(s.byBucket.not_covered).toEqual({ pass: 1, total: 1 });
    expect(s.byBucket.non_rate).toEqual({ pass: 1, total: 1 });
  });
});

describe('GOLDEN set integrity', () => {
  it('has unique ids', () => {
    const ids = GOLDEN.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every case is well-formed for its bucket', () => {
    for (const c of GOLDEN) {
      expect(c.question.trim().length).toBeGreaterThan(0);
      if (c.bucket === 'rate_lookup') {
        expect(typeof c.expected?.jurisdiction).toBe('string');
        expect(typeof c.expected?.standard_rate).toBe('number');
      } else if (c.bucket === 'not_covered') {
        expect(typeof c.expected?.label).toBe('string');
      }
    }
  });

  it('rate_lookup jurisdictions look like covered EU/Canada codes; not_covered are outside', () => {
    const covered = /^(AT|BE|BG|CY|CZ|DE|DK|EE|ES|FI|FR|GR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|GB|CH|NO|CA-[A-Z]{2})$/;
    for (const c of GOLDEN.filter(c => c.bucket === 'rate_lookup')) {
      expect(c.expected!.jurisdiction!).toMatch(covered);
    }
  });

  it('covers all three buckets with a few cases each', () => {
    const s = summarize(GOLDEN.map(c => ({ bucket: c.bucket, pass: true })));
    expect(s.byBucket.rate_lookup.total).toBeGreaterThanOrEqual(3);
    expect(s.byBucket.not_covered.total).toBeGreaterThanOrEqual(3);
    expect(s.byBucket.non_rate.total).toBeGreaterThanOrEqual(2);
  });
});
