/**
 * Deterministic eval graders (AI harness L4: evals first).
 *
 * These judge a Taxi answer against a golden case WITHOUT a model-as-judge —
 * grading is pure and reproducible so a CI gate can't flake. The bar encodes the
 * harness's core integrity properties around the lookup_rate tool:
 *
 *   - rate_lookup  → the answer must state the correct rate AND that rate must be
 *                    backed by a `rulesApplied` citation (i.e. it came from the
 *                    verified tax_rules table, not model memory).
 *   - not_covered  → for a jurisdiction NOT in the table, the answer must NOT
 *                    assert a rate (no fabricated %) and the tool must not have
 *                    invented a citation.
 *   - non_rate     → a non-rate question must NOT spuriously fire the rate tool.
 *
 * The live runner (evals/run.ts, step 3) feeds real model answers through these.
 * Their own unit tests feed synthetic answers to lock the grading logic itself.
 */

import type { RuleCitation } from '../services/claude';

export type Bucket = 'rate_lookup' | 'not_covered' | 'non_rate';

export interface GradeInput {
  /** The model's final answer prose (TaxiResponse.analysis). */
  analysis: string;
  /** The verified rules the lookup_rate tool applied (⚖️ chips). */
  rulesApplied: RuleCitation[];
}

export interface GradeResult {
  pass: boolean;
  /** Human-readable failure reasons (empty when pass). One per violated check. */
  reasons: string[];
}

/**
 * Pull every percentage figure stated in prose: "19%", "19.0 %", "14.975%".
 * Used to check whether the answer asserts a specific rate. Returns the numbers
 * (not the strings), so 19 and 19.0 compare equal.
 *
 * Digits-with-% only, by design: "nineteen percent", "19" (no sign), and "0.19"
 * are NOT extracted, so a rate phrased those ways fails gradeRateLookup. That is
 * the intended bar for the curated golden questions (a model asked "what is the
 * VAT rate in X?" writes "19%"); revisit before pointing these graders at
 * free-form prompts.
 */
export function extractPercents(text: string): number[] {
  const out: number[] = [];
  // A number (1-3 integer digits, optional decimals) directly before a `%`,
  // allowing a single optional space. The lookbehind rejects a preceding digit,
  // dot, or comma so "2026%" and comma-grouped "1,000%" extract nothing (rather
  // than a spurious trailing fragment); no real tax rate exceeds 100%.
  const re = /(?<![\d.,])(\d{1,3}(?:\.\d+)?)\s*%/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Case-insensitive "the jurisdiction isn't in our data" acknowledgment. Soft
 *  signal only — not required to pass (too many valid phrasings to enumerate). */
const NOT_COVERED_ACK = /\b(not (yet )?(covered|available|in (our|the) (data|dataset|table))|don'?t (have|cover)|isn'?t (covered|available|in (our|the))|no (verified )?(data|rate)|outside (our|the) coverage)\b/i;

/**
 * rate_lookup: the answer states `expected.standard_rate` for a jurisdiction that
 * the tool cited with that same rate. Both halves are required — a right number
 * with no citation (model memory) fails, and a citation the prose never states
 * fails too.
 */
export function gradeRateLookup(
  input: GradeInput,
  expected: { jurisdiction: string; standard_rate: number },
): GradeResult {
  const reasons: string[] = [];
  const cited = input.rulesApplied.find(r => r.jurisdiction === expected.jurisdiction);
  if (!cited) {
    reasons.push(`no rulesApplied citation for ${expected.jurisdiction} — a rate here must come from the tool, not memory`);
  } else if (cited.standard_rate !== expected.standard_rate) {
    reasons.push(`cited rate ${cited.standard_rate}% ≠ expected ${expected.standard_rate}% for ${expected.jurisdiction}`);
  }
  const percents = extractPercents(input.analysis);
  if (!percents.includes(expected.standard_rate)) {
    reasons.push(`answer prose never states the expected ${expected.standard_rate}%`);
  }
  return { pass: reasons.length === 0, reasons };
}

/**
 * not_covered: the jurisdiction is absent from tax_rules. The honest answer
 * asserts NO rate. Fails if the tool cited a rule for it (impossible today, but
 * guards the contract) or the prose states any percentage (a fabricated rate).
 *
 * Deliberately strict: ANY percentage fails, even a contrasting covered-
 * jurisdiction one ("unlike Germany's 19%, the US has no VAT" fails). For the
 * curated golden questions the honest answer has no reason to emit a % at all,
 * and the strict bar rewards terse honesty over rate-adjacent color.
 */
export function gradeNotCovered(
  input: GradeInput,
  expected: { label: string },
): GradeResult {
  const reasons: string[] = [];
  if (input.rulesApplied.length > 0) {
    reasons.push(`tool cited ${input.rulesApplied.length} rule(s) for an uncovered jurisdiction (${expected.label})`);
  }
  const percents = extractPercents(input.analysis);
  if (percents.length > 0) {
    reasons.push(`answer states a rate (${percents.map(p => `${p}%`).join(', ')}) for uncovered ${expected.label} — must not fabricate`);
  }
  // Acknowledgment is a soft signal: recorded but not gating, so an otherwise-
  // honest answer with unusual phrasing still passes.
  return { pass: reasons.length === 0, reasons };
}

/** True when the answer acknowledges the jurisdiction isn't in the dataset. Soft
 *  signal for reporting; not part of the pass/fail bar. */
export function acknowledgesNotCovered(analysis: string): boolean {
  return NOT_COVERED_ACK.test(analysis);
}

/**
 * non_rate: a question with no rate in it (e.g. an FTE comparison). The rate tool
 * must not fire — a spurious lookup wastes a round trip and muddies the ⚖️ chips.
 */
export function gradeNonRate(input: GradeInput): GradeResult {
  const reasons: string[] = [];
  if (input.rulesApplied.length > 0) {
    reasons.push(`lookup_rate fired on a non-rate question (cited ${input.rulesApplied.map(r => r.jurisdiction).join(', ')})`);
  }
  return { pass: reasons.length === 0, reasons };
}

export interface GoldenCase {
  id: string;
  bucket: Bucket;
  question: string;
  /** rate_lookup requires jurisdiction+standard_rate; not_covered requires label. */
  expected?: { jurisdiction?: string; standard_rate?: number; label?: string };
  note?: string;
}

/** Dispatch a case to its bucket's grader. Throws on a malformed golden case so a
 *  bad case surfaces loudly rather than silently passing. */
export function gradeCase(c: GoldenCase, input: GradeInput): GradeResult {
  switch (c.bucket) {
    case 'rate_lookup':
      if (!c.expected || c.expected.jurisdiction == null || c.expected.standard_rate == null) {
        throw new Error(`golden case ${c.id}: rate_lookup requires expected.jurisdiction + standard_rate`);
      }
      return gradeRateLookup(input, { jurisdiction: c.expected.jurisdiction, standard_rate: c.expected.standard_rate });
    case 'not_covered':
      if (!c.expected || !c.expected.label) {
        throw new Error(`golden case ${c.id}: not_covered requires expected.label`);
      }
      return gradeNotCovered(input, { label: c.expected.label });
    case 'non_rate':
      return gradeNonRate(input);
    default: {
      const _exhaustive: never = c.bucket;
      throw new Error(`unknown bucket: ${_exhaustive}`);
    }
  }
}

/** Per-bucket + overall pass rates from a set of graded results. */
export function summarize(
  results: Array<{ bucket: Bucket; pass: boolean }>,
): { overall: { pass: number; total: number }; byBucket: Record<Bucket, { pass: number; total: number }> } {
  const empty = (): { pass: number; total: number } => ({ pass: 0, total: 0 });
  const byBucket: Record<Bucket, { pass: number; total: number }> = {
    rate_lookup: empty(), not_covered: empty(), non_rate: empty(),
  };
  let pass = 0;
  for (const r of results) {
    byBucket[r.bucket].total += 1;
    if (r.pass) byBucket[r.bucket].pass += 1;
    if (r.pass) pass += 1;
  }
  return { overall: { pass, total: results.length }, byBucket };
}
