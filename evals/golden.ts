import type { GoldenCase } from './graders';

/**
 * The seed golden set (AI harness L4). Curated, version-controlled cases the
 * live runner (evals/run.ts) grades real model answers against; the pass rate
 * per bucket is the number we publish (planned /trust page).
 *
 * Buckets:
 *   - rate_lookup: a covered jurisdiction — the answer must state the verified
 *     rate AND cite it (⚖️). `standard_rate` values below are copied from the
 *     tax_rules seed (supabase/add_tax_rules_table.sql) and must stay in sync;
 *     the live runner reads the DB, so a drift here surfaces as a failing case.
 *   - not_covered: a jurisdiction deliberately outside Phase-0 coverage (US
 *     sales tax + APAC are Phase 1) — the answer must NOT fabricate a rate.
 *   - non_rate: a benchmark question with no rate — the tool must not fire.
 *
 * This is a SEED (~18 cases). It grows from real member reports via the CP1
 * report → eval promotion path (docs/AI_HARNESS_PLAN.md); target 100→500.
 */
export const GOLDEN: GoldenCase[] = [
  // ── rate_lookup (EU VAT) ────────────────────────────────────────────────────
  { id: 'rl-de', bucket: 'rate_lookup', question: 'What is the standard VAT rate in Germany?', expected: { jurisdiction: 'DE', standard_rate: 19.0 } },
  { id: 'rl-fr', bucket: 'rate_lookup', question: 'What VAT rate applies in France?', expected: { jurisdiction: 'FR', standard_rate: 20.0 } },
  { id: 'rl-gb', bucket: 'rate_lookup', question: 'What is the UK VAT rate?', expected: { jurisdiction: 'GB', standard_rate: 20.0 } },
  { id: 'rl-fi', bucket: 'rate_lookup', question: 'What is the standard VAT rate in Finland?', expected: { jurisdiction: 'FI', standard_rate: 25.5 }, note: 'non-integer, recently raised' },
  { id: 'rl-hu', bucket: 'rate_lookup', question: 'What is the VAT rate in Hungary?', expected: { jurisdiction: 'HU', standard_rate: 27.0 }, note: 'EU maximum' },
  { id: 'rl-lu', bucket: 'rate_lookup', question: 'What is the VAT rate in Luxembourg?', expected: { jurisdiction: 'LU', standard_rate: 17.0 }, note: 'EU minimum' },
  { id: 'rl-ch', bucket: 'rate_lookup', question: 'What is the standard VAT rate in Switzerland?', expected: { jurisdiction: 'CH', standard_rate: 8.1 }, note: 'non-EU, low rate' },
  // ── rate_lookup (Canada GST/HST/PST) ────────────────────────────────────────
  { id: 'rl-ca-qc', bucket: 'rate_lookup', question: 'What is the combined sales tax rate in Quebec?', expected: { jurisdiction: 'CA-QC', standard_rate: 14.975 }, note: 'GST+QST, three decimals' },
  { id: 'rl-ca-on', bucket: 'rate_lookup', question: 'What is the HST rate in Ontario?', expected: { jurisdiction: 'CA-ON', standard_rate: 13.0 } },
  { id: 'rl-ca-bc', bucket: 'rate_lookup', question: 'What is the total sales tax rate in British Columbia?', expected: { jurisdiction: 'CA-BC', standard_rate: 12.0 }, note: 'GST+PST' },

  // ── not_covered (must NOT fabricate a rate) ─────────────────────────────────
  { id: 'nc-us', bucket: 'not_covered', question: 'What is the VAT rate in the United States?', expected: { label: 'United States' }, note: 'false premise — no US federal VAT; sales tax is Phase 1' },
  { id: 'nc-jp', bucket: 'not_covered', question: 'What is the consumption tax rate in Japan?', expected: { label: 'Japan' }, note: 'APAC, Phase 1' },
  { id: 'nc-in', bucket: 'not_covered', question: 'What is the GST rate in India?', expected: { label: 'India' }, note: 'APAC, Phase 1' },
  { id: 'nc-au', bucket: 'not_covered', question: 'What is the GST rate in Australia?', expected: { label: 'Australia' }, note: 'APAC, Phase 1' },
  { id: 'nc-br', bucket: 'not_covered', question: 'What is the VAT rate in Brazil?', expected: { label: 'Brazil' }, note: 'LATAM, not covered' },

  // ── non_rate (tool must not fire) ───────────────────────────────────────────
  { id: 'nr-ftes', bucket: 'non_rate', question: 'How do I compare to my cohort on tax-technology FTEs?' },
  { id: 'nr-ai', bucket: 'non_rate', question: 'What is my AI adoption stage versus my peers?' },
  { id: 'nr-budget', bucket: 'non_rate', question: 'Is my annual tax-tech budget above or below the benchmark median?' },
];
