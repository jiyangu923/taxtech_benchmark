import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

/**
 * Single endpoint for the Claude API integration. Supports two modes:
 *   - { stream: false }  → returns { text, json?, usage } as JSON
 *   - { stream: true  }  → returns Server-Sent Events with `delta` text
 *                          events followed by a single `done` event carrying
 *                          the final text + usage stats
 *
 * Structured outputs: pass `outputFormat` (a JSON Schema object — every
 * object must include `additionalProperties: false`). The model's response
 * is constrained to that schema and we parse it before returning.
 *
 * Prompt caching: pass `system` as an array of text blocks; the last block
 * with `cache_control: { type: 'ephemeral' }` will be cached. The minimum
 * cacheable prefix for Haiku 4.5 is 4096 tokens — shorter prefixes silently
 * won't cache (no error, `cache_creation_input_tokens` will be 0).
 */

const DEFAULT_MODEL = 'claude-haiku-4-5';
const DEFAULT_MAX_TOKENS = 4000;
// Ceiling on client-requested max_tokens. The meter records cost AFTER a call
// completes (soft cap), so a single oversized request could otherwise overshoot
// the daily limit by a wide margin in one shot.
const MAX_TOKENS_CEILING = 8000;

// Deterministic-tool loop (harness L2). Hard cap on model→tool→model round trips
// so a misbehaving loop can't run away against the 60s function budget / the
// user's spend cap. One lookup is the norm; 5 is generous headroom.
const MAX_TOOL_ITERATIONS = 5;

// Intake replies are one short question + a small extraction JSON — a much
// tighter budget than analysis answers. Applied server-side; client maxTokens
// is ignored in intake mode.
const INTAKE_MAX_TOKENS = 1024;
// Abuse bounds on intake conversations: turns beyond this are a runaway or a
// scripted abuse loop, not a 5-7 question interview.
const INTAKE_MAX_MESSAGES = 40;
const INTAKE_MAX_CONTENT_CHARS = 2000;

// ─── Per-user AI rate limiting ──────────────────────────────────────────────
// Claude Haiku 4.5 pricing, USD per 1M tokens. Cached input is ~90% cheaper;
// cache writes are 1.25x base input. https://platform.claude.com (pricing)
const PRICE_PER_MTOK = { input: 1.0, output: 5.0, cacheRead: 0.10, cacheWrite: 1.25 };
const DAILY_LIMIT_USD = 5;            // per non-admin user, per rolling window
const WINDOW_MS = 24 * 60 * 60 * 1000;

interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

interface ClaudeRequestBody {
  system?: string | SystemBlock[];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  outputFormat?: Record<string, unknown>;
  maxTokens?: number;          // clamped server-side to MAX_TOKENS_CEILING
  model?: string;              // accepted in the body but IGNORED — see buildParams
  stream?: boolean;
  tools?: string[];            // NAMES only (e.g. ['lookup_rate']) — server owns
                               // the specs; unknown names dropped. See resolveTools.
  mode?: string;               // 'intake' = AI-led survey interview (docs/AI_INTAKE_PIVOT.md).
                               // Bypasses ONLY the cohort gate; auth + meter still apply,
                               // and the server supplies its own prompt/schema — client
                               // system/tools/outputFormat are IGNORED in this mode.
}

interface UsageOut {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

/**
 * Clamp client-supplied max_tokens to (0, MAX_TOKENS_CEILING]; anything
 * missing/invalid falls back to the default.
 */
function resolveMaxTokens(requested: unknown): number {
  const n = typeof requested === 'number' && Number.isFinite(requested) ? Math.floor(requested) : 0;
  if (n <= 0) return DEFAULT_MAX_TOKENS;
  return Math.min(n, MAX_TOKENS_CEILING);
}

function buildParams(body: ClaudeRequestBody): Record<string, any> {
  const params: Record<string, any> = {
    // The model is SERVER-CHOSEN, always. body.model is deliberately ignored:
    // the meter prices Haiku only, so honoring a client-requested model would
    // let any authed user burn Sonnet/Opus tokens against Haiku-priced quota.
    // When multi-model routing lands (harness plan L3), the routing decision
    // stays server-side — never a client passthrough.
    model: DEFAULT_MODEL,
    max_tokens: resolveMaxTokens(body.maxTokens),
    messages: body.messages,
  };
  if (body.system) params.system = body.system;
  if (body.outputFormat) {
    params.output_config = { format: { type: 'json_schema', schema: body.outputFormat } };
  }
  return params;
}

function pickUsage(u: any): UsageOut {
  return {
    input_tokens: u?.input_tokens ?? 0,
    output_tokens: u?.output_tokens ?? 0,
    cache_creation_input_tokens: u?.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: u?.cache_read_input_tokens ?? 0,
  };
}

type Meter = (u: UsageOut) => Promise<void>;

// Pure: USD cost of one call from its token usage.
function computeCostUsd(u: UsageOut): number {
  return (
    (u.input_tokens / 1e6) * PRICE_PER_MTOK.input +
    (u.output_tokens / 1e6) * PRICE_PER_MTOK.output +
    (u.cache_read_input_tokens / 1e6) * PRICE_PER_MTOK.cacheRead +
    (u.cache_creation_input_tokens / 1e6) * PRICE_PER_MTOK.cacheWrite
  );
}

interface UsageRow {
  window_started_at: string;
  cost_usd: number | string;
  input_tokens?: number;
  output_tokens?: number;
}
interface WindowState { windowStartMs: number; used: number; inTok: number; outTok: number; }

// Pure: resolve the active rolling window from the stored row + current time.
// A window >= 24h old is expired → start fresh (used resets to 0).
function resolveWindow(row: UsageRow | null, nowMs: number): WindowState {
  if (!row) return { windowStartMs: nowMs, used: 0, inTok: 0, outTok: 0 };
  const startMs = new Date(row.window_started_at).getTime();
  if (Number.isNaN(startMs) || nowMs - startMs >= WINDOW_MS) {
    return { windowStartMs: nowMs, used: 0, inTok: 0, outTok: 0 };
  }
  return {
    windowStartMs: startMs,
    used: Number(row.cost_usd) || 0,
    inTok: row.input_tokens || 0,
    outTok: row.output_tokens || 0,
  };
}

// Cohort gate decision, server side. Mirrors services/cohort.ts hasCohortAccess:
// admins always; everyone else needs an approved, current submission — EXCEPT
// intake mode (docs/AI_INTAKE_PIVOT.md), which exists precisely for users with
// no submission yet. Intake is safe to exempt because the server owns its
// prompt/schema end-to-end (see buildIntakeParams) and the meter still applies.
// Pure so it's unit-testable without a live Supabase.
function canUseAi(isAdmin: boolean, hasApprovedCurrentSubmission: boolean, isIntake = false): boolean {
  return isAdmin || isIntake || hasApprovedCurrentSubmission;
}

function bearerToken(req: VercelRequest): string | null {
  const auth = (req.headers['authorization'] as string | undefined) || '';
  const m = /^Bearer\s+(.+)$/.exec(auth);
  return m ? m[1] : null;
}

// Best-effort: add this call's cost to the user's window. A failure here must
// not break the response (the user already got their answer), so we swallow +
// log; slight under-counting on a DB hiccup is acceptable for a soft cap.
async function recordUsage(admin: any, userId: string, state: WindowState, usage: UsageOut): Promise<void> {
  try {
    await admin.from('ai_usage').upsert({
      user_id: userId,
      window_started_at: new Date(state.windowStartMs).toISOString(),
      cost_usd: state.used + computeCostUsd(usage),
      input_tokens: state.inTok + usage.input_tokens,
      output_tokens: state.outTok + usage.output_tokens,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (e: any) {
    console.warn('ai_usage record failed:', e?.message);
  }
}

// ── Answer persistence (harness L5: audit trail + eval mine) ────────────────

/**
 * The final user message is `buildUserMessage` output: submission JSON followed
 * by a "User Question: ..." marker. Store just the human question — the
 * submission is already the user's own data elsewhere, and raw storage would
 * bloat every row by ~2KB. Falls back to the full content when the marker is
 * absent (non-Taxi callers). Pure; exported for tests.
 */
function extractQuestion(lastUserContent: string): string {
  const marker = 'User Question: ';
  const idx = lastUserContent.lastIndexOf(marker);
  const q = idx >= 0 ? lastUserContent.slice(idx + marker.length) : lastUserContent;
  return q.trim().slice(0, 4000);
}

type Persist = (text: string, usage: UsageOut) => Promise<string | null>;

// Best-effort like recordUsage: the user already has their answer — a logging
// failure must never break the response. The [harness] tag keeps these
// greppable in Vercel logs so silent-failure streaks are visible.
async function insertAnswer(
  admin: any, userId: string, question: string, answer: Record<string, unknown>, usage: UsageOut
): Promise<string | null> {
  try {
    const { data, error } = await admin.from('ai_answers').insert({
      userId, question, answer, model: DEFAULT_MODEL, usage,
    }).select('id').single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  } catch (e: any) {
    console.warn('[harness] ai_answers persist failed:', e?.message);
    return null;
  }
}

async function persistAnswer(
  admin: any, userId: string, body: ClaudeRequestBody, text: string, usage: UsageOut
): Promise<string | null> {
  const lastUser = [...body.messages].reverse().find(m => m.role === 'user');
  let answer: Record<string, unknown>;
  try {
    answer = body.outputFormat ? JSON.parse(text) : { text };
  } catch {
    answer = { text };
  }
  return insertAnswer(admin, userId, extractQuestion(lastUser?.content ?? ''), answer, usage);
}

/**
 * Intake persistence NEVER stores the raw user turn (privacy: a user may
 * volunteer identity details mid-interview; the model is told not to extract
 * them, and the audit trail must not record them either — the raw turn would).
 * Stored: a fixed marker as the question + the parsed {reply, extracted,
 * complete} as the answer (always the object form — better eval mining, and
 * not dependent on client fields intake ignores).
 */
async function persistIntakeAnswer(
  admin: any, userId: string, text: string, usage: UsageOut
): Promise<string | null> {
  let answer: Record<string, unknown>;
  try {
    answer = JSON.parse(text);
  } catch {
    answer = { text };
  }
  return insertAnswer(admin, userId, '[intake turn]', answer, usage);
}

// ── Deterministic tools (harness L2: law-as-code, never model memory) ────────
//
// Taxi must NEVER state a tax rate from the model's memory. When a request opts
// in (body.tools includes 'lookup_rate') we run a non-streaming tool loop: the
// model calls lookup_rate, we answer it from the verified public.tax_rules
// table, and the model composes its final answer from that data. Every rule the
// tool returned comes back as `rulesApplied` — the ⚖️ evidence chip.
//
// Server owns the tool specs. The client sends only NAMES, never a tool
// definition — the same lockdown posture as the server-chosen model (buildParams
// ignores body.model). Unknown names are dropped, not passed through.

const LOOKUP_RATE_TOOL = {
  name: 'lookup_rate',
  description:
    'Look up the official indirect-tax rate for a jurisdiction from the verified ' +
    'law-as-code table. ALWAYS call this for any specific VAT / GST / HST / PST rate — ' +
    'never state a rate from memory. Coverage: the 27 EU member states plus the UK, ' +
    'Switzerland, and Norway (VAT); and all 13 Canadian provinces/territories ' +
    '(GST/PST/HST). Pass an ISO code ("DE", "GB") or country name ("Germany"); for ' +
    'Canadian provinces pass the province name ("Quebec") or the "CA-XX" code ("CA-QC"). ' +
    'If the tool reports a jurisdiction is not covered, tell the user it is not covered ' +
    'yet — do NOT fall back to a remembered rate.',
  input_schema: {
    type: 'object',
    properties: {
      jurisdiction: {
        type: 'string',
        description: 'ISO code, "CA-XX" code, or country/province name.',
      },
    },
    required: ['jurisdiction'],
    additionalProperties: false,
  },
} as const;

// The only tool for now. Adding more (check_threshold, estimate_penalty, …) =
// a spec here + a branch in runToolLoop; the client whitelist grows by name.
const TOOL_SPECS: Record<string, typeof LOOKUP_RATE_TOOL> = { lookup_rate: LOOKUP_RATE_TOOL };

// Turn client-sent tool NAMES into server-owned specs; drop unknown/duplicate.
function resolveTools(names: unknown): Array<typeof LOOKUP_RATE_TOOL> {
  if (!Array.isArray(names)) return [];
  const out: Array<typeof LOOKUP_RATE_TOOL> = [];
  const seen = new Set<string>();
  for (const n of names) {
    if (typeof n === 'string' && TOOL_SPECS[n] && !seen.has(n)) {
      seen.add(n);
      out.push(TOOL_SPECS[n]);
    }
  }
  return out;
}

// A few common aliases → canonical jurisdiction code. Kept tiny on purpose: the
// tax_rules seed stays the source of truth for rates AND names, so this map must
// not grow into a parallel jurisdiction list that can drift from the DB.
const JURISDICTION_ALIASES: Record<string, string> = {
  UK: 'GB', 'U.K.': 'GB', 'GREAT BRITAIN': 'GB', BRITAIN: 'GB', ENGLAND: 'GB',
  HOLLAND: 'NL', CZECHIA: 'CZ',
};

// Pure: clean a model/user-supplied jurisdiction string. null = unusable.
function normalizeJurisdiction(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s || s.length > 60) return null;
  return s;
}

// Pure: the two lookup keys — an (aliased) uppercase code, and the raw string for
// a case-insensitive exact name match.
function resolveLookupKeys(cleaned: string): { code: string; name: string } {
  const upper = cleaned.toUpperCase();
  return { code: JURISDICTION_ALIASES[upper] ?? upper, name: cleaned };
}

interface TaxRuleRow {
  jurisdiction: string;
  jurisdiction_name: string;
  tax_type: string;
  standard_rate: number | string;
  reduced_rates: unknown;
  components: { gst?: number; pst?: number; hst?: number } | null;
  source_url: string | null;
  last_verified: string | null;
  effective_from: string;
  effective_to: string | null;
}

// Pure: from candidate rows, pick the currently-effective one — prefer rows with
// no effective_to (still in effect), then the newest effective_from. null if none.
function pickCurrentRule(rows: TaxRuleRow[]): TaxRuleRow | null {
  if (!rows?.length) return null;
  const current = rows.filter(r => r.effective_to == null);
  const pool = current.length ? current : rows;
  return [...pool].sort((a, b) => (b.effective_from || '').localeCompare(a.effective_from || ''))[0];
}

interface RuleCitation {
  jurisdiction: string;
  jurisdiction_name: string;
  tax_type: string;
  standard_rate: number;
  source_url: string | null;
  last_verified: string | null;
}

interface RateResult {
  found: boolean;
  jurisdiction?: string;
  jurisdiction_name?: string;
  tax_type?: string;
  standard_rate?: number;
  reduced_rates?: number[];
  components?: { gst?: number; pst?: number; hst?: number } | null;
  source_url?: string | null;
  last_verified?: string | null;
  message?: string;
}

// Pure: shape a DB row (or a miss) into the tool_result payload the model reads.
// A miss carries an explicit no-data instruction (harness honesty rule: never let
// the model paper over a coverage gap with a remembered number).
function formatRateResult(row: TaxRuleRow | null, requested: string): RateResult {
  if (!row) {
    return {
      found: false,
      message: `No verified rate on file for "${requested}". This jurisdiction is not yet in the law-as-code table — tell the user it is not covered yet. Do NOT estimate or recall a rate.`,
    };
  }
  let reducedRaw: unknown = row.reduced_rates;
  if (typeof reducedRaw === 'string') { try { reducedRaw = JSON.parse(reducedRaw); } catch { reducedRaw = []; } }
  const reduced_rates = Array.isArray(reducedRaw)
    ? reducedRaw.filter((n): n is number => typeof n === 'number')
    : [];
  return {
    found: true,
    jurisdiction: row.jurisdiction,
    jurisdiction_name: row.jurisdiction_name,
    tax_type: row.tax_type,
    standard_rate: Number(row.standard_rate),
    reduced_rates,
    components: row.components ?? null,
    source_url: row.source_url ?? null,
    last_verified: row.last_verified ?? null,
  };
}

// Impure: run one lookup_rate call against tax_rules. Try exact code, then a
// case-insensitive exact name match. A DB error returns a no-data result — the
// answer degrades to "unavailable", never to a fabricated rate.
async function executeLookupRate(admin: any, input: any): Promise<RateResult> {
  const j = normalizeJurisdiction(input?.jurisdiction);
  if (!j) return { found: false, message: 'No jurisdiction was provided. Ask the user which country or province they mean.' };
  const { code, name } = resolveLookupKeys(j);
  try {
    const byCode = await admin.from('tax_rules').select('*').eq('jurisdiction', code);
    if (byCode.error) throw new Error(byCode.error.message);
    let rows = (byCode.data as TaxRuleRow[]) || [];
    if (!rows.length) {
      const byName = await admin.from('tax_rules').select('*').ilike('jurisdiction_name', name);
      if (byName.error) throw new Error(byName.error.message);
      rows = (byName.data as TaxRuleRow[]) || [];
    }
    return formatRateResult(pickCurrentRule(rows), j);
  } catch (e: any) {
    console.warn('[harness] lookup_rate failed:', e?.message);
    return { found: false, message: `The rate service is temporarily unavailable for "${j}". Tell the user to try again shortly; do NOT estimate a rate.` };
  }
}

const ZERO_USAGE: UsageOut = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
function addUsage(a: UsageOut, b: any): UsageOut {
  return {
    input_tokens: a.input_tokens + (b?.input_tokens ?? 0),
    output_tokens: a.output_tokens + (b?.output_tokens ?? 0),
    cache_creation_input_tokens: a.cache_creation_input_tokens + (b?.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens: a.cache_read_input_tokens + (b?.cache_read_input_tokens ?? 0),
  };
}

// Non-streaming tool loop. The model may call lookup_rate up to
// MAX_TOOL_ITERATIONS times; we answer each call from tax_rules, then it composes
// the final (optionally schema-constrained) answer. Usage is summed across every
// turn and metered once; the answer is persisted once. Returns rulesApplied — the
// verified rows behind the answer — for the ⚖️ evidence chip.
async function runToolLoop(
  client: Anthropic, admin: any, body: ClaudeRequestBody, res: VercelResponse,
  meter?: Meter, persist?: Persist,
) {
  const base = buildParams(body);
  base.tools = resolveTools(body.tools);
  const loopMessages: any[] = [...body.messages];
  const rulesApplied: RuleCitation[] = [];
  let usage: UsageOut = { ...ZERO_USAGE };
  let finalText = '';
  let answered = false; // model reached a terminal (non-tool_use) turn

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const resp: any = await client.messages.create({ ...base, messages: loopMessages } as any);
    usage = addUsage(usage, resp.usage);
    if (resp.stop_reason !== 'tool_use') {
      finalText = (resp.content.find((b: any) => b.type === 'text') as { text?: string } | undefined)?.text ?? '';
      answered = true; // a terminal turn (even empty) is the model's final say — don't retry
      break;
    }
    // Echo the assistant turn (with its tool_use blocks) back verbatim, then
    // answer each tool_use with a matching tool_result keyed by tool_use_id.
    loopMessages.push({ role: 'assistant', content: resp.content });
    const toolResults: any[] = [];
    for (const block of resp.content) {
      if (block.type !== 'tool_use') continue;
      if (block.name === 'lookup_rate') {
        const result = await executeLookupRate(admin, block.input);
        if (result.found) {
          rulesApplied.push({
            jurisdiction: result.jurisdiction!, jurisdiction_name: result.jurisdiction_name!,
            tax_type: result.tax_type!, standard_rate: result.standard_rate!,
            source_url: result.source_url ?? null, last_verified: result.last_verified ?? null,
          });
        }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      } else {
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ error: 'unknown tool' }), is_error: true });
      }
    }
    loopMessages.push({ role: 'user', content: toolResults });
  }

  // Iteration cap hit while still calling tools: force one final answer with no
  // tools so the user always gets a response (the schema constraint, if any, stays).
  // Gated on `answered`, not `!finalText`: a terminal turn that returned empty text
  // is the model's final say — retrying it would just burn another call.
  if (!answered) {
    const noTools: Record<string, any> = { ...base };
    delete noTools.tools;
    const resp: any = await client.messages.create({ ...noTools, messages: loopMessages } as any);
    usage = addUsage(usage, resp.usage);
    finalText = (resp.content.find((b: any) => b.type === 'text') as { text?: string } | undefined)?.text ?? '';
  }

  if (meter) await meter(usage);
  const answerId = persist ? await persist(finalText, usage) : null;

  if (body.outputFormat) {
    try {
      return res.status(200).json({ text: finalText, json: JSON.parse(finalText), usage, answerId, rulesApplied });
    } catch {
      return res.status(502).json({ error: 'Model returned invalid JSON', text: finalText, usage, rulesApplied });
    }
  }
  return res.status(200).json({ text: finalText, usage, answerId, rulesApplied });
}

// ── AI-led intake (docs/AI_INTAKE_PIVOT.md: "the survey becomes the backend") ─
//
// mode:'intake' turns Taxi into the survey: it interviews a brand-new user,
// interprets their answers, and returns enum-constrained survey fields the
// client accumulates into a submissions record. Server-owned END TO END: the
// prompt and extraction schema live here (client system/tools/outputFormat are
// ignored), so bypassing the cohort gate for this mode cannot be repurposed as
// a free general-purpose Claude proxy. Enum values are inlined (the no-imports-
// outside-/api rule) — tests/api/claude.test.ts asserts parity with constants.ts.

const INTAKE_ENUMS = {
  companyProfile: ['public', 'private_pe', 'pre_ipo', 'multinational', 'domestic'],
  respondentRole: ['tax_professionals', 'tax_technology'],
  revenueRange: ['under_10m', '10m_100m', '100m_500m', '500m_5b', 'over_5b', 'over_100b'],
  taxCalculationAutomationRange: ['99_plus', '90_99', '70_90', '40_70', 'under_40'],
  genAIAdoptionStage: ['exploration', 'poc', 'production', 'enterprise_wide'],
  taxTechFTEsRange: ['zero', '1_5', '6_15', '16_30', '31_100', 'over_100'],
} as const;

const INTAKE_SYSTEM = `You are **Taxi**, the AI benchmark analyst for Taxable AI. A new member just joined and you're getting to know their tax organization so you can benchmark them against peers. This replaces a survey form — you ARE the survey now.

INTERVIEW RULES:
- Ask ONE question at a time, conversationally. Acknowledge each answer briefly before the next question.
- REQUIRED (must have all four before you're done): company profile (public / PE-backed / pre-IPO / multinational / domestic — multiple OK), their role (tax professional vs tax technology), annual revenue range, and how many tax jurisdictions they operate in.
- NICE TO HAVE (weave in naturally, skip freely if the user seems rushed): tax-calculation automation level, whether they've adopted AI (and what stage), tax-technology team size (FTEs).
- Map answers onto the allowed field values yourself ("we're about 200 million" → revenueRange 100m_500m; "eight countries" → jurisdictionsCovered 8). Only set a field when the user actually answered it; never guess. If an answer is ambiguous, ask a short clarifying question.
- Users may correct earlier answers at any time — re-extract the corrected value.
- Extra benchmark-relevant facts that don't fit a field (tools they use, team structure, pain points) go in otherFacts as short plain statements.
- PRIVACY: never ask for the user's name, email, or company name. If they volunteer identifying details, do NOT record them anywhere (not even otherFacts) and do NOT repeat them back in your replies — acknowledge without the name and move on.
- Set complete=true only when all four REQUIRED fields have been captured across the conversation. Then close with one sentence: their benchmark profile is being created and their first peer comparison is seconds away.
- Stay on the interview. If asked something else, answer in one sentence and steer back. Keep every reply under 80 words.`;

// Structured-output schema for every intake turn. All extraction fields are
// nullable — null means "not answered this turn"; the client accumulates
// non-null values across turns. additionalProperties:false everywhere (API req).
const INTAKE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Your next conversational message to the user (acknowledgement + next question, or the closing line).' },
    extracted: {
      type: 'object',
      description: 'Survey fields answered IN THIS CONVERSATION so far. null = not yet answered. Re-state previously extracted values (with any corrections) every turn.',
      properties: {
        // Nullable enums use anyOf — the live API rejects `enum` combined with
        // a union type (400: "Enum value 'x' does not match declared type
        // ['string','null']"), caught by the intake live test. Plain unions
        // WITHOUT enum (integer/boolean below) are fine (production-proven by
        // taxi.ts chart: ['object','null']).
        companyProfile: { anyOf: [{ type: 'array', items: { type: 'string', enum: [...INTAKE_ENUMS.companyProfile] } }, { type: 'null' }] },
        respondentRole: { anyOf: [{ type: 'string', enum: [...INTAKE_ENUMS.respondentRole] }, { type: 'null' }] },
        revenueRange: { anyOf: [{ type: 'string', enum: [...INTAKE_ENUMS.revenueRange] }, { type: 'null' }] },
        jurisdictionsCovered: { type: ['integer', 'null'] },
        taxCalculationAutomationRange: { anyOf: [{ type: 'string', enum: [...INTAKE_ENUMS.taxCalculationAutomationRange] }, { type: 'null' }] },
        aiAdopted: { type: ['boolean', 'null'] },
        genAIAdoptionStage: { anyOf: [{ type: 'string', enum: [...INTAKE_ENUMS.genAIAdoptionStage] }, { type: 'null' }] },
        taxTechFTEsRange: { anyOf: [{ type: 'string', enum: [...INTAKE_ENUMS.taxTechFTEsRange] }, { type: 'null' }] },
        otherFacts: { type: 'array', items: { type: 'string' }, description: 'Benchmark-relevant facts with no fixed field. Empty array if none. Never identity details.' },
      },
      required: ['companyProfile', 'respondentRole', 'revenueRange', 'jurisdictionsCovered', 'taxCalculationAutomationRange', 'aiAdopted', 'genAIAdoptionStage', 'taxTechFTEsRange', 'otherFacts'],
      additionalProperties: false,
    },
    complete: { type: 'boolean', description: 'true only when all four required fields have been captured.' },
  },
  required: ['reply', 'extracted', 'complete'],
  additionalProperties: false,
} as const;

/**
 * Intake accepts ONLY plain conversation turns from the client. Strips any
 * extra keys / non-string content (no content-block smuggling), enforces
 * role alternation is left to the API, and bounds turn count + length.
 * Returns null when the conversation is out of bounds (reject, don't truncate
 * silently — a 40-turn "interview" is abuse, not UX).
 */
function sanitizeIntakeMessages(messages: unknown): Array<{ role: 'user' | 'assistant'; content: string }> | null {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > INTAKE_MAX_MESSAGES) return null;
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of messages) {
    const role = (m as any)?.role;
    const content = (m as any)?.content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
    if (!content.trim() || content.length > INTAKE_MAX_CONTENT_CHARS) return null;
    out.push({ role, content });
  }
  // First and last turn must be the user's: assistant-first is not a valid
  // conversation shape, and assistant-last would be a prefill vector (the API
  // rejects prefill with structured outputs anyway — this turns that 400/500
  // into a clean client 400 and removes the vector structurally).
  if (out[0].role !== 'user' || out[out.length - 1].role !== 'user') return null;
  return out;
}

/** Server-owned request params for an intake turn. Client system/tools/
 *  outputFormat/maxTokens are all ignored — only the sanitized turns pass. */
function buildIntakeParams(messages: Array<{ role: 'user' | 'assistant'; content: string }>): Record<string, any> {
  return {
    model: DEFAULT_MODEL,
    max_tokens: INTAKE_MAX_TOKENS,
    system: INTAKE_SYSTEM,
    messages,
    output_config: { format: { type: 'json_schema', schema: INTAKE_SCHEMA } },
  };
}

// One intake turn: sanitize → server-owned request → structured JSON back.
// Same meter/persist contract as runNonStreaming (intake turns are audit-
// trailed in ai_answers like every other answer).
async function runIntake(client: Anthropic, body: ClaudeRequestBody, res: VercelResponse, meter?: Meter, persist?: Persist) {
  const msgs = sanitizeIntakeMessages(body.messages);
  if (!msgs) {
    return res.status(400).json({ error: 'Invalid intake conversation (bad shape, empty turn, or over limits).' });
  }
  const response = await client.messages.create(buildIntakeParams(msgs) as any);
  const textBlock = response.content.find((b: any) => b.type === 'text') as { text: string } | undefined;
  const text = textBlock?.text ?? '';
  const usage = pickUsage(response.usage);
  if (meter) await meter(usage);
  const answerId = persist ? await persist(text, usage) : null;
  if ((response as any).stop_reason === 'max_tokens') {
    // Truncated mid-JSON — distinct error so the client can retry cleanly
    // instead of surfacing a generic parse failure.
    return res.status(502).json({ error: 'Intake reply was truncated — please try again.', usage });
  }
  try {
    return res.status(200).json({ text, json: JSON.parse(text), usage, answerId });
  } catch {
    return res.status(502).json({ error: 'Model returned invalid JSON', text, usage });
  }
}

async function runNonStreaming(client: Anthropic, body: ClaudeRequestBody, res: VercelResponse, meter?: Meter, persist?: Persist) {
  const response = await client.messages.create(buildParams(body) as any);
  const textBlock = response.content.find((b: any) => b.type === 'text') as { text: string } | undefined;
  const text = textBlock?.text ?? '';
  const usage = pickUsage(response.usage);
  if (meter) await meter(usage);
  const answerId = persist ? await persist(text, usage) : null;
  if (body.outputFormat) {
    try {
      return res.status(200).json({ text, json: JSON.parse(text), usage, answerId });
    } catch (e: any) {
      // Structured-output schema should guarantee valid JSON, but if the
      // model returned malformed JSON anyway, surface the raw text so the
      // caller can decide what to do (instead of an opaque 500).
      return res.status(502).json({ error: 'Model returned invalid JSON', text, usage });
    }
  }
  return res.status(200).json({ text, usage, answerId });
}

async function runStreaming(client: Anthropic, body: ClaudeRequestBody, res: VercelResponse, meter?: Meter, persist?: Persist) {
  // Server-Sent Events. Keep-alive headers so middleboxes don't buffer/close.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const write = (event: { type: string; [k: string]: unknown }) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const stream = client.messages.stream(buildParams(body) as any);
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && (event as any).delta?.type === 'text_delta') {
        write({ type: 'delta', text: (event as any).delta.text });
      }
    }
    const final = await stream.finalMessage();
    const textBlock = final.content.find((b: any) => b.type === 'text') as { text: string } | undefined;
    const text = textBlock?.text ?? '';
    const usage = pickUsage(final.usage);
    if (meter) await meter(usage);
    const answerId = persist ? await persist(text, usage) : null;
    write({ type: 'done', text, usage, answerId });
    res.end();
  } catch (e: any) {
    write({ type: 'error', message: e?.message || 'stream failed' });
    res.end();
  }
}

async function runHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as ClaudeRequestBody;
  if (!body?.messages?.length) {
    return res.status(400).json({ error: 'messages required' });
  }

  // ── Per-user auth + rolling daily spend limit ──
  // This endpoint was previously open to anyone; auth here both identifies the
  // user for metering AND closes that hole.
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return res.status(500).json({ error: 'Auth backend not configured' });
  }
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Sign in to use the AI assistant.' });

  const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Your session expired — sign in again.' });
  }
  const userId = userData.user.id;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const [profileRes, usageRes, subRes] = await Promise.all([
    admin.from('profiles').select('role').eq('id', userId).maybeSingle(),
    admin.from('ai_usage')
      .select('window_started_at, cost_usd, input_tokens, output_tokens')
      .eq('user_id', userId).maybeSingle(),
    // Cohort gate (mirrors services/cohort.ts): Taxi is for approved members
    // only. The client already hides the composer, but this endpoint must
    // enforce it too — otherwise any signed-in user who skipped the survey can
    // call the AI directly. Uses the admin client so RLS never hides the row.
    admin.from('submissions').select('id')
      .eq('userId', userId).eq('is_current', true).eq('status', 'approved').limit(1),
  ]);
  const isAdmin = (profileRes.data as any)?.role === 'admin';

  // Admins bypass the gate (same as the client). Non-admins need an approved,
  // current submission — pending/waitlist/rejected/no-submission are all denied.
  // EXCEPT intake mode: it exists for users with no submission yet, and is safe
  // to exempt because the server owns its prompt/schema (runIntake) and the
  // meter below still applies in full. canUseAi is the SINGLE decision point —
  // the intake exemption lives there, not in a parallel branch. See
  // docs/AI_INTAKE_PIVOT.md.
  const isIntake = body.mode === 'intake';
  if (!isAdmin) {
    if (subRes.error && !isIntake) {
      // Fail closed, but don't mislead an approved user into "go do the survey"
      // on a transient DB hiccup — that's a backend problem, not a gate denial.
      // (Intake doesn't need the lookup, so a DB hiccup must not block it.)
      console.warn('[gate] submission lookup failed:', subRes.error.message);
      return res.status(503).json({ error: 'Could not verify your access right now — try again in a moment.' });
    }
    const hasApproved = !subRes.error && Array.isArray(subRes.data) && subRes.data.length > 0;
    if (!canUseAi(isAdmin, hasApproved, isIntake)) {
      return res.status(403).json({
        error: 'Set up your benchmark profile first — chat with Taxi for two minutes and the AI analyst unlocks instantly.',
      });
    }
  }

  let meter: Meter | undefined;
  if (!isAdmin) {
    const state = resolveWindow((usageRes.data as UsageRow) ?? null, Date.now());
    if (state.used >= DAILY_LIMIT_USD) {
      const resetsAtMs = state.windowStartMs + WINDOW_MS;
      const hours = Math.max(1, Math.ceil((resetsAtMs - Date.now()) / 3_600_000));
      return res.status(429).json({
        error: `You've reached your daily AI limit ($${DAILY_LIMIT_USD} of usage). It resets in about ${hours} hour${hours === 1 ? '' : 's'}.`,
        resetsAt: new Date(resetsAtMs).toISOString(),
      });
    }
    meter = (u) => recordUsage(admin, userId, state, u);
  }

  const client = new Anthropic({ apiKey });
  // Persist every answer (admins included — the audit trail is universal).
  // Best-effort: a failed insert logs [harness] and never blocks the answer.
  const persist: Persist = (text, usage) => persistAnswer(admin, userId, body, text, usage);
  // Intake first: it ignores tools/stream entirely (server-owned request), and
  // uses the privacy-safe persist (never stores raw user turns — a volunteered
  // name must not reach the audit trail).
  if (isIntake) {
    const intakePersist: Persist = (text, usage) => persistIntakeAnswer(admin, userId, text, usage);
    return runIntake(client, body, res, meter, intakePersist);
  }
  // Tools force the non-streaming loop (it needs the full messages array between
  // turns); a caller that opts into tools accepts JSON, not SSE. body.stream is
  // ignored in that case.
  if (resolveTools(body.tools).length) {
    return runToolLoop(client, admin, body, res, meter, persist);
  }
  if (body.stream) {
    return runStreaming(client, body, res, meter, persist);
  }
  return runNonStreaming(client, body, res, meter, persist);
}

// 60s — generous for Haiku, leaves room for long structured-output traces.
export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await runHandler(req, res);
  } catch (e: any) {
    return res.status(500).json({
      error: 'claude handler crashed',
      message: e?.message || 'unknown',
    });
  }
}

// Exported for tests — pure helpers, no env/network dependencies.
export { buildParams, pickUsage, computeCostUsd, resolveWindow, resolveMaxTokens, extractQuestion, canUseAi, DEFAULT_MODEL, DEFAULT_MAX_TOKENS, MAX_TOKENS_CEILING, DAILY_LIMIT_USD, WINDOW_MS, PRICE_PER_MTOK };
// Deterministic-tool helpers (harness L2). executeLookupRate takes an injected
// admin client, so it's testable with a fake; the rest are pure.
export { resolveTools, normalizeJurisdiction, resolveLookupKeys, pickCurrentRule, formatRateResult, executeLookupRate, addUsage, LOOKUP_RATE_TOOL, MAX_TOOL_ITERATIONS };
// AI-led intake (docs/AI_INTAKE_PIVOT.md). Pure except persistIntakeAnswer
// (injected admin, testable with a fake); INTAKE_ENUMS parity with constants.ts
// OPTS_* is asserted in tests.
export { sanitizeIntakeMessages, buildIntakeParams, persistIntakeAnswer, INTAKE_ENUMS, INTAKE_SCHEMA, INTAKE_SYSTEM, INTAKE_MAX_TOKENS, INTAKE_MAX_MESSAGES, INTAKE_MAX_CONTENT_CHARS };
export type { ClaudeRequestBody, UsageOut, SystemBlock, TaxRuleRow, RateResult };
