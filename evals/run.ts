/**
 * Live eval runner (AI harness L4, step 3 of the eval pillar).
 *
 * Feeds each GOLDEN case through the REAL model + REAL tax_rules table, then
 * grades the answer with the deterministic graders. The per-bucket pass rate it
 * prints is the number the planned /trust page publishes.
 *
 * Production fidelity by reuse, not re-description: the request is assembled
 * from the same exports the live path uses — SYSTEM_INSTRUCTION/RESPONSE_SCHEMA/
 * buildSystem/buildUserMessage (services/taxi.ts) and LOOKUP_RATE_TOOL/
 * executeLookupRate/MAX_TOOL_ITERATIONS/DEFAULT_MODEL (api/claude.ts). The only
 * deliberate divergences from production: an empty benchmark dataset + a
 * synthetic submission (rate questions don't need cohort data; keeps each run
 * cheap), and no metering/persistence (evals aren't user traffic).
 *
 * Run:   npm run evals:live        (needs ANTHROPIC_API_KEY, SUPABASE_URL or
 *        VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in the environment)
 * CI:    .github/workflows/evals-live.yml (nightly + manual, secret-gated;
 *        deliberately NOT the PR gate — model cost isn't paid per PR)
 *
 * Exit codes: 0 pass, 1 below gate, 2 not configured (missing env).
 */

import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { GOLDEN } from './golden';
import { gradeCase, summarize, acknowledgesNotCovered, type Bucket, type GoldenCase, type GradeResult } from './graders';
import { buildSystem, buildUserMessage, RESPONSE_SCHEMA } from '../services/taxi';
import { LOOKUP_RATE_TOOL, executeLookupRate, MAX_TOOL_ITERATIONS, DEFAULT_MODEL, DEFAULT_MAX_TOKENS } from '../api/claude';
import type { RuleCitation } from '../services/claude';
import type { Submission } from '../types';

// Minimal synthetic submission — enough for buildUserMessage; identity fields
// absent by construction (and would be stripped by sanitize anyway).
const EVAL_SUBMISSION = {
  companyProfile: ['inhouse_tax'], participationGoal: ['benchmark'],
  respondentRole: 'tax_technology', ownedTaxFunctions: ['compliance'],
  organizationScope: 'global', revenueRange: '100m_1b', status: 'approved',
  submittedAt: '2026-01-01T00:00:00Z', aiAdopted: true,
} as unknown as Submission;

/** Pure: the exact request params a golden case sends. Exported for tests. */
export function buildEvalParams(question: string): Record<string, any> {
  return {
    model: DEFAULT_MODEL,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: buildSystem([], []),
    messages: [{ role: 'user' as const, content: buildUserMessage(question, EVAL_SUBMISSION) }],
    output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
    tools: [LOOKUP_RATE_TOOL],
  };
}

interface CaseOutcome {
  id: string;
  bucket: Bucket;
  pass: boolean;
  reasons: string[];
  acknowledged?: boolean;         // not_covered soft signal (reported, not gated)
  rulesApplied: RuleCitation[];
  analysis: string;
  error?: string;                 // transport/parse failure (counted as fail)
}

/** Mirrors api/claude.ts runToolLoop (which is response-coupled, hence the thin
 *  re-implementation): model may call lookup_rate up to MAX_TOOL_ITERATIONS
 *  times; each call is answered from tax_rules; found rows become citations. */
async function runCase(client: Anthropic, admin: any, c: GoldenCase): Promise<CaseOutcome> {
  const params = buildEvalParams(c.question);
  const messages: any[] = [...params.messages];
  const rulesApplied: RuleCitation[] = [];
  let finalText = '';
  let answered = false;

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const resp: any = await client.messages.create({ ...params, messages } as any);
      if (resp.stop_reason !== 'tool_use') {
        finalText = (resp.content.find((b: any) => b.type === 'text') as { text?: string } | undefined)?.text ?? '';
        answered = true;
        break;
      }
      messages.push({ role: 'assistant', content: resp.content });
      const toolResults: any[] = [];
      for (const block of resp.content) {
        if (block.type !== 'tool_use') continue;
        const result = await executeLookupRate(admin, block.input);
        if (result.found) {
          rulesApplied.push({
            jurisdiction: result.jurisdiction!, jurisdiction_name: result.jurisdiction_name!,
            tax_type: result.tax_type!, standard_rate: result.standard_rate!,
            source_url: result.source_url ?? null, last_verified: result.last_verified ?? null,
          });
        }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: toolResults });
    }
    if (!answered) {
      const noTools: Record<string, any> = { ...params };
      delete noTools.tools;
      const resp: any = await client.messages.create({ ...noTools, messages } as any);
      finalText = (resp.content.find((b: any) => b.type === 'text') as { text?: string } | undefined)?.text ?? '';
    }
    const analysis = String((JSON.parse(finalText) as { analysis?: unknown }).analysis ?? '');
    const grade: GradeResult = gradeCase(c, { analysis, rulesApplied });
    return {
      id: c.id, bucket: c.bucket, pass: grade.pass, reasons: grade.reasons,
      acknowledged: c.bucket === 'not_covered' ? acknowledgesNotCovered(analysis) : undefined,
      rulesApplied, analysis,
    };
  } catch (e: any) {
    return {
      id: c.id, bucket: c.bucket, pass: false,
      reasons: [`runner error: ${e?.message || 'unknown'}`],
      rulesApplied, analysis: finalText, error: e?.message || 'unknown',
    };
  }
}

async function main(): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !supabaseUrl || !serviceKey) {
    const missing = [
      !apiKey && 'ANTHROPIC_API_KEY',
      !supabaseUrl && 'SUPABASE_URL (or VITE_SUPABASE_URL)',
      !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(Boolean).join(', ');
    console.error(`NOT CONFIGURED — missing env: ${missing}. Set them (GitHub secrets in CI, shell env locally) and re-run.`);
    return 2;
  }

  const client = new Anthropic({ apiKey });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Preflight: an empty tax_rules means every rate_lookup fails for a boring
  // reason. Surface that as configuration, not model failure.
  const probe = await admin.from('tax_rules').select('jurisdiction').limit(1);
  if (probe.error) {
    console.error(`NOT CONFIGURED — tax_rules unreadable: ${probe.error.message}`);
    return 2;
  }
  if (!probe.data?.length) {
    console.error('NOT CONFIGURED — tax_rules is empty. Run supabase/add_tax_rules_table.sql first.');
    return 2;
  }

  console.log(`Running ${GOLDEN.length} golden cases against ${DEFAULT_MODEL} (sequential)…\n`);
  const outcomes: CaseOutcome[] = [];
  for (const c of GOLDEN) {
    const o = await runCase(client, admin, c);   // sequential: rate-limit friendly, ~1-2 min total
    outcomes.push(o);
    const ack = o.acknowledged === undefined ? '' : o.acknowledged ? ' (ack)' : ' (no-ack)';
    console.log(`  ${o.pass ? 'PASS' : 'FAIL'}  ${o.id.padEnd(10)} [${o.bucket}]${ack}${o.pass ? '' : ` — ${o.reasons.join('; ')}`}`);
  }

  const s = summarize(outcomes.map(o => ({ bucket: o.bucket, pass: o.pass })));
  const pct = (x: { pass: number; total: number }) => x.total ? `${x.pass}/${x.total} (${Math.round((x.pass / x.total) * 100)}%)` : 'n/a';
  console.log(`\n── Pass rates ──────────────────────────────`);
  console.log(`  rate_lookup : ${pct(s.byBucket.rate_lookup)}`);
  console.log(`  not_covered : ${pct(s.byBucket.not_covered)}`);
  console.log(`  non_rate    : ${pct(s.byBucket.non_rate)}`);
  console.log(`  OVERALL     : ${pct(s.overall)}`);

  // Machine-readable results — the CI workflow uploads this as an artifact; it
  // becomes the /trust page's data source later. Timestamp comes from the env
  // (CI) or the clock at report time; not part of grading.
  const report = { model: DEFAULT_MODEL, ranAt: new Date().toISOString(), summary: s, outcomes };
  writeFileSync('evals-results.json', JSON.stringify(report, null, 2));
  console.log('\nWrote evals-results.json');

  // Gate: overall pass rate. Default 0.8 until a baseline exists; tighten (and
  // add per-bucket floors) once a few nightly runs establish variance — TODOS.
  const minOverall = Number(process.env.EVAL_MIN_OVERALL || '0.8');
  const rate = s.overall.total ? s.overall.pass / s.overall.total : 0;
  if (rate < minOverall) {
    console.error(`\nGATE FAILED: overall ${rate.toFixed(2)} < ${minOverall}`);
    return 1;
  }
  console.log(`\nGATE PASSED: overall ${rate.toFixed(2)} >= ${minOverall}`);
  return 0;
}

// Only execute when run as a script (tsx evals/run.ts) — importing this module
// (tests import buildEvalParams) must never fire live API calls.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then(code => process.exit(code)).catch(e => {
    console.error('runner crashed:', e?.message || e);
    process.exit(1);
  });
}
