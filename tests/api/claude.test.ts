import { describe, it, expect } from 'vitest';
import { computeCostUsd, resolveWindow, buildParams, resolveMaxTokens, extractQuestion, canUseAi, DAILY_LIMIT_USD, WINDOW_MS, DEFAULT_MODEL, DEFAULT_MAX_TOKENS, MAX_TOKENS_CEILING,
  resolveTools, normalizeJurisdiction, resolveLookupKeys, pickCurrentRule, formatRateResult, executeLookupRate, addUsage, LOOKUP_RATE_TOOL, MAX_TOOL_ITERATIONS,
  sanitizeIntakeMessages, buildIntakeParams, persistIntakeAnswer, INTAKE_ENUMS, INTAKE_SCHEMA, INTAKE_SYSTEM, INTAKE_MAX_TOKENS, INTAKE_MAX_MESSAGES, INTAKE_MAX_CONTENT_CHARS,
  type TaxRuleRow } from '../../api/claude';
import { OPTS_COMPANY_PROFILE, OPTS_RESPONDENT_ROLE, OPTS_REVENUE, OPTS_AUTOMATION, OPTS_GENAI_STAGE, OPTS_FTE_TECH } from '../../constants';

const usage = (o: Partial<{ input: number; output: number; cacheRead: number; cacheWrite: number }>) => ({
  input_tokens: o.input ?? 0,
  output_tokens: o.output ?? 0,
  cache_read_input_tokens: o.cacheRead ?? 0,
  cache_creation_input_tokens: o.cacheWrite ?? 0,
});

describe('computeCostUsd (Haiku 4.5 pricing)', () => {
  it('charges $1/M input and $5/M output', () => {
    expect(computeCostUsd(usage({ input: 1_000_000 }))).toBeCloseTo(1.0, 6);
    expect(computeCostUsd(usage({ output: 1_000_000 }))).toBeCloseTo(5.0, 6);
  });

  it('charges discounted cache reads ($0.10/M) and cache writes ($1.25/M)', () => {
    expect(computeCostUsd(usage({ cacheRead: 1_000_000 }))).toBeCloseTo(0.10, 6);
    expect(computeCostUsd(usage({ cacheWrite: 1_000_000 }))).toBeCloseTo(1.25, 6);
  });

  it('sums all components', () => {
    expect(computeCostUsd(usage({ input: 200_000, output: 100_000, cacheRead: 1_000_000 })))
      .toBeCloseTo(0.2 + 0.5 + 0.10, 6);
  });

  it('is zero for empty usage', () => {
    expect(computeCostUsd(usage({}))).toBe(0);
  });
});

describe('resolveWindow (rolling 24h)', () => {
  const now = 1_700_000_000_000;

  it('starts a fresh window when there is no row', () => {
    const s = resolveWindow(null, now);
    expect(s.used).toBe(0);
    expect(s.windowStartMs).toBe(now);
  });

  it('keeps the existing window when it is < 24h old', () => {
    const start = new Date(now - 60 * 60 * 1000).toISOString(); // 1h ago
    const s = resolveWindow({ window_started_at: start, cost_usd: 2.5, input_tokens: 10, output_tokens: 20 }, now);
    expect(s.used).toBe(2.5);
    expect(s.windowStartMs).toBe(now - 60 * 60 * 1000);
    expect(s.inTok).toBe(10);
    expect(s.outTok).toBe(20);
  });

  it('resets when the window is >= 24h old', () => {
    const start = new Date(now - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
    const s = resolveWindow({ window_started_at: start, cost_usd: 4.9 }, now);
    expect(s.used).toBe(0);
    expect(s.windowStartMs).toBe(now);
  });

  it('parses numeric-string cost_usd (Postgres numeric returns a string)', () => {
    const start = new Date(now - 1000).toISOString();
    const s = resolveWindow({ window_started_at: start, cost_usd: '3.25' }, now);
    expect(s.used).toBe(3.25);
  });
});

describe('limit constants', () => {
  it('caps at $5 per rolling 24h', () => {
    expect(DAILY_LIMIT_USD).toBe(5);
    expect(WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('buildParams hardening (cost-abuse holes)', () => {
  const msgs = [{ role: 'user' as const, content: 'q' }];

  it('SECURITY: ignores a client-supplied model — the meter prices Haiku only', () => {
    const params = buildParams({ messages: msgs, model: 'claude-opus-4-8' });
    expect(params.model).toBe(DEFAULT_MODEL);
  });

  it('clamps client maxTokens to the ceiling', () => {
    expect(buildParams({ messages: msgs, maxTokens: 64000 }).max_tokens).toBe(MAX_TOKENS_CEILING);
  });

  it('honors reasonable maxTokens below the ceiling', () => {
    expect(buildParams({ messages: msgs, maxTokens: 2000 }).max_tokens).toBe(2000);
  });

  it('resolveMaxTokens falls back to the default on missing/invalid input', () => {
    expect(resolveMaxTokens(undefined)).toBe(DEFAULT_MAX_TOKENS);
    expect(resolveMaxTokens(0)).toBe(DEFAULT_MAX_TOKENS);
    expect(resolveMaxTokens(-100)).toBe(DEFAULT_MAX_TOKENS);
    expect(resolveMaxTokens(NaN)).toBe(DEFAULT_MAX_TOKENS);
    expect(resolveMaxTokens('9999' as any)).toBe(DEFAULT_MAX_TOKENS);
    expect(resolveMaxTokens(4000.7)).toBe(4000);
  });
});

describe('canUseAi (server-side cohort gate)', () => {
  it('always allows admins, submission or not', () => {
    expect(canUseAi(true, false)).toBe(true);
    expect(canUseAi(true, true)).toBe(true);
  });
  it('allows a non-admin only with an approved current submission', () => {
    expect(canUseAi(false, true)).toBe(true);
    expect(canUseAi(false, false)).toBe(false); // no survey / pending / waitlist / rejected
  });
});

describe('extractQuestion (ai_answers persistence)', () => {
  it('pulls just the human question from a buildUserMessage-shaped payload', () => {
    const content = 'Here is the user\'s own submission:\n{"revenue":"over_5b"}\n\nUser Question: How do I compare on FTEs?';
    expect(extractQuestion(content)).toBe('How do I compare on FTEs?');
  });

  it('uses the LAST marker if the question itself contains the phrase', () => {
    const content = 'submission json\n\nUser Question: What does "User Question: " mean?';
    // lastIndexOf: everything after the final occurrence.
    expect(extractQuestion(content)).toBe('" mean?');
  });

  it('falls back to the full content when no marker exists', () => {
    expect(extractQuestion('plain prompt with no marker')).toBe('plain prompt with no marker');
  });

  it('trims and caps at 4000 chars', () => {
    expect(extractQuestion('User Question:   padded   ')).toBe('padded');
    expect(extractQuestion('User Question: ' + 'x'.repeat(5000)).length).toBe(4000);
  });
});

// ── Deterministic tools: lookup_rate (harness L2) ────────────────────────────

describe('resolveTools (server-owned whitelist)', () => {
  it('maps a known name to the real spec', () => {
    const tools = resolveTools(['lookup_rate']);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toBe(LOOKUP_RATE_TOOL);
    expect(tools[0].name).toBe('lookup_rate');
  });

  it('drops unknown names (no client passthrough of arbitrary tool defs)', () => {
    expect(resolveTools(['lookup_rate', 'rm_rf', 'exec'])).toHaveLength(1);
    expect(resolveTools(['definitely_not_a_tool'])).toEqual([]);
  });

  it('dedupes repeated names', () => {
    expect(resolveTools(['lookup_rate', 'lookup_rate'])).toHaveLength(1);
  });

  it('ignores non-arrays and non-strings', () => {
    expect(resolveTools(undefined)).toEqual([]);
    expect(resolveTools('lookup_rate')).toEqual([]);
    expect(resolveTools([{ name: 'lookup_rate' }, 42, null])).toEqual([]);
  });

  it('the tool spec is strict-shaped for the API', () => {
    expect(LOOKUP_RATE_TOOL.input_schema.additionalProperties).toBe(false);
    expect(LOOKUP_RATE_TOOL.input_schema.required).toEqual(['jurisdiction']);
    expect(MAX_TOOL_ITERATIONS).toBe(5);
  });
});

describe('normalizeJurisdiction', () => {
  it('trims and collapses internal whitespace', () => {
    expect(normalizeJurisdiction('  Germany ')).toBe('Germany');
    expect(normalizeJurisdiction('Czech   Republic')).toBe('Czech Republic');
  });

  it('rejects empty, non-string, and over-long input', () => {
    expect(normalizeJurisdiction('   ')).toBeNull();
    expect(normalizeJurisdiction('')).toBeNull();
    expect(normalizeJurisdiction(42)).toBeNull();
    expect(normalizeJurisdiction(null)).toBeNull();
    expect(normalizeJurisdiction('x'.repeat(61))).toBeNull();
  });
});

describe('resolveLookupKeys', () => {
  it('uppercases the code and preserves the name for case-insensitive match', () => {
    expect(resolveLookupKeys('de')).toEqual({ code: 'DE', name: 'de' });
    expect(resolveLookupKeys('Germany')).toEqual({ code: 'GERMANY', name: 'Germany' });
    expect(resolveLookupKeys('CA-QC')).toEqual({ code: 'CA-QC', name: 'CA-QC' });
  });

  it('maps common aliases to the canonical code', () => {
    expect(resolveLookupKeys('UK').code).toBe('GB');
    expect(resolveLookupKeys('Great Britain').code).toBe('GB');
    expect(resolveLookupKeys('Holland').code).toBe('NL');
    expect(resolveLookupKeys('Czechia').code).toBe('CZ');
  });
});

const rule = (o: Partial<TaxRuleRow>): TaxRuleRow => ({
  jurisdiction: 'DE', jurisdiction_name: 'Germany', tax_type: 'VAT',
  standard_rate: 19.0, reduced_rates: [7.0], components: null,
  source_url: 'https://example.test', last_verified: '2026-05-30',
  effective_from: '2026-01-01', effective_to: null, ...o,
});

describe('pickCurrentRule', () => {
  it('returns null for no rows', () => {
    expect(pickCurrentRule([])).toBeNull();
  });

  it('prefers a still-in-effect row (effective_to null) over an expired one', () => {
    const expired = rule({ effective_from: '2027-01-01', effective_to: '2027-06-30', standard_rate: 20 });
    const current = rule({ effective_from: '2026-01-01', effective_to: null, standard_rate: 19 });
    expect(pickCurrentRule([expired, current])?.standard_rate).toBe(19);
  });

  it('among in-effect rows, picks the newest effective_from', () => {
    const older = rule({ effective_from: '2025-01-01', standard_rate: 18 });
    const newer = rule({ effective_from: '2026-01-01', standard_rate: 19 });
    expect(pickCurrentRule([older, newer])?.standard_rate).toBe(19);
  });

  it('falls back to newest expired row when none are in effect', () => {
    const a = rule({ effective_from: '2024-01-01', effective_to: '2024-12-31', standard_rate: 17 });
    const b = rule({ effective_from: '2025-01-01', effective_to: '2025-12-31', standard_rate: 18 });
    expect(pickCurrentRule([a, b])?.standard_rate).toBe(18);
  });
});

describe('formatRateResult', () => {
  it('shapes a found VAT row', () => {
    const r = formatRateResult(rule({}), 'Germany');
    expect(r).toMatchObject({
      found: true, jurisdiction: 'DE', jurisdiction_name: 'Germany',
      tax_type: 'VAT', standard_rate: 19, reduced_rates: [7.0], components: null,
      source_url: 'https://example.test', last_verified: '2026-05-30',
    });
  });

  it('passes through Canada components and coerces a string rate', () => {
    const r = formatRateResult(rule({
      jurisdiction: 'CA-QC', jurisdiction_name: 'Quebec', tax_type: 'GST_HST',
      standard_rate: '14.975', reduced_rates: [], components: { gst: 5.0, pst: 9.975, hst: 0.0 },
    }), 'Quebec');
    expect(r.standard_rate).toBe(14.975);
    expect(r.components).toEqual({ gst: 5.0, pst: 9.975, hst: 0.0 });
    expect(r.reduced_rates).toEqual([]);
  });

  it('parses stringified reduced_rates and filters non-numbers', () => {
    expect(formatRateResult(rule({ reduced_rates: '[5.0, 9.0]' }), 'X').reduced_rates).toEqual([5.0, 9.0]);
    expect(formatRateResult(rule({ reduced_rates: ['bad', 7.0, null] as unknown }), 'X').reduced_rates).toEqual([7.0]);
    expect(formatRateResult(rule({ reduced_rates: 'not json' }), 'X').reduced_rates).toEqual([]);
  });

  it('a miss returns found:false with a no-estimate instruction', () => {
    const r = formatRateResult(null, 'Narnia');
    expect(r.found).toBe(false);
    expect(r.message).toContain('Narnia');
    expect(r.message).toMatch(/not covered|not yet/i);
    expect(r.message).toMatch(/do not|don't/i);
  });
});

// Minimal fake of the supabase query builder: from().select().eq()/.ilike().
// eq resolves the code-match rows; ilike resolves the name-match rows.
function fakeAdmin(byCode: any[], byName: any[], opts: { eqError?: string } = {}) {
  return {
    from() {
      return {
        select() {
          return {
            eq: async () => (opts.eqError ? { data: null, error: { message: opts.eqError } } : { data: byCode, error: null }),
            ilike: async () => ({ data: byName, error: null }),
          };
        },
      };
    },
  };
}

describe('executeLookupRate (injected admin)', () => {
  const de = rule({});
  const qc = rule({ jurisdiction: 'CA-QC', jurisdiction_name: 'Quebec', tax_type: 'GST_HST', standard_rate: 14.975, reduced_rates: [], components: { gst: 5, pst: 9.975, hst: 0 } });

  it('matches by exact code first', async () => {
    const r = await executeLookupRate(fakeAdmin([de], []), { jurisdiction: 'DE' });
    expect(r.found).toBe(true);
    expect(r.jurisdiction).toBe('DE');
  });

  it('falls back to a case-insensitive name match', async () => {
    const r = await executeLookupRate(fakeAdmin([], [de]), { jurisdiction: 'Germany' });
    expect(r.found).toBe(true);
    expect(r.standard_rate).toBe(19);
  });

  it('resolves the "CA-QC" code path', async () => {
    const r = await executeLookupRate(fakeAdmin([qc], []), { jurisdiction: 'CA-QC' });
    expect(r.tax_type).toBe('GST_HST');
    expect(r.components).toEqual({ gst: 5, pst: 9.975, hst: 0 });
  });

  it('returns found:false for an uncovered jurisdiction (no fabrication)', async () => {
    const r = await executeLookupRate(fakeAdmin([], []), { jurisdiction: 'Atlantis' });
    expect(r.found).toBe(false);
    expect(r.message).toContain('Atlantis');
  });

  it('rejects missing/blank jurisdiction without a DB call', async () => {
    const r = await executeLookupRate(fakeAdmin([de], []), { jurisdiction: '   ' });
    expect(r.found).toBe(false);
  });

  it('degrades to "unavailable" (never a rate) on a DB error', async () => {
    const r = await executeLookupRate(fakeAdmin([], [], { eqError: 'connection reset' }), { jurisdiction: 'DE' });
    expect(r.found).toBe(false);
    expect(r.message).toMatch(/unavailable/i);
  });
});

// ── AI-led intake mode (docs/AI_INTAKE_PIVOT.md) ─────────────────────────────

describe('INTAKE_ENUMS parity with constants.ts (drift guard)', () => {
  // The serverless function can't import client constants (no-imports-outside-
  // /api rule), so the enum values are inlined — THIS test is what keeps them
  // honest. If it fails, someone changed an option list on one side only.
  const values = (opts: Array<{ value: string }>) => opts.map(o => o.value);

  it('every inlined enum matches its OPTS_* source exactly', () => {
    expect([...INTAKE_ENUMS.companyProfile]).toEqual(values(OPTS_COMPANY_PROFILE));
    expect([...INTAKE_ENUMS.respondentRole]).toEqual(values(OPTS_RESPONDENT_ROLE));
    expect([...INTAKE_ENUMS.revenueRange]).toEqual(values(OPTS_REVENUE));
    expect([...INTAKE_ENUMS.taxCalculationAutomationRange]).toEqual(values(OPTS_AUTOMATION));
    expect([...INTAKE_ENUMS.genAIAdoptionStage]).toEqual(values(OPTS_GENAI_STAGE));
    expect([...INTAKE_ENUMS.taxTechFTEsRange]).toEqual(values(OPTS_FTE_TECH));
  });
});

describe('canUseAi with intake mode', () => {
  it('intake bypasses the cohort gate for non-admins without a submission', () => {
    expect(canUseAi(false, false, true)).toBe(true);
  });
  it('non-intake behavior is unchanged (2-arg calls keep working)', () => {
    expect(canUseAi(false, false)).toBe(false);
    expect(canUseAi(false, true)).toBe(true);
    expect(canUseAi(true, false)).toBe(true);
  });
});

describe('buildIntakeParams (server-owned lockdown)', () => {
  const msgs = [{ role: 'user' as const, content: 'hi' }];
  const p = buildIntakeParams(msgs);

  it('model, budget, system, and schema are all server-chosen', () => {
    expect(p.model).toBe(DEFAULT_MODEL);
    expect(p.max_tokens).toBe(INTAKE_MAX_TOKENS);
    expect(p.system).toBe(INTAKE_SYSTEM);
    expect(p.output_config.format.schema).toBe(INTAKE_SCHEMA);
  });

  it('never includes tools (no tool loop in intake)', () => {
    expect(p.tools).toBeUndefined();
  });

  it('passes only the provided turns as messages', () => {
    expect(p.messages).toBe(msgs);
  });
});

describe('sanitizeIntakeMessages (abuse bounds)', () => {
  const turn = (role: string, content: unknown) => ({ role, content });

  it('passes a normal conversation and strips extra keys', () => {
    const out = sanitizeIntakeMessages([
      { role: 'user', content: 'hello', evil: 'x' } as any,
      { role: 'assistant', content: 'hi — what kind of company?' },
      { role: 'user', content: 'a public multinational' },
    ]);
    expect(out).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi — what kind of company?' },
      { role: 'user', content: 'a public multinational' },
    ]);
  });

  it('rejects non-arrays, empty conversations, and over-long ones', () => {
    expect(sanitizeIntakeMessages(undefined)).toBeNull();
    expect(sanitizeIntakeMessages([])).toBeNull();
    expect(sanitizeIntakeMessages(Array.from({ length: INTAKE_MAX_MESSAGES + 1 }, () => turn('user', 'x')))).toBeNull();
  });

  it('rejects content-block smuggling and bad roles', () => {
    expect(sanitizeIntakeMessages([turn('user', [{ type: 'image' }])])).toBeNull();
    expect(sanitizeIntakeMessages([turn('system', 'sneaky')])).toBeNull();
    expect(sanitizeIntakeMessages([turn('user', 42)])).toBeNull();
  });

  it('rejects blank and over-long turns; accepts exact boundaries', () => {
    expect(sanitizeIntakeMessages([turn('user', '   ')])).toBeNull();
    expect(sanitizeIntakeMessages([turn('user', 'x'.repeat(INTAKE_MAX_CONTENT_CHARS + 1))])).toBeNull();
    expect(sanitizeIntakeMessages([turn('user', 'x'.repeat(INTAKE_MAX_CONTENT_CHARS))])).not.toBeNull();
  });

  it('requires the conversation to start AND end with a user turn (anti-prefill)', () => {
    expect(sanitizeIntakeMessages([turn('assistant', 'hi, tell me about your company')])).toBeNull();
    expect(sanitizeIntakeMessages([turn('user', 'hello'), turn('assistant', 'prefill{')])).toBeNull();
    expect(sanitizeIntakeMessages([
      turn('user', 'hello'), turn('assistant', 'what kind of company?'), turn('user', 'public'),
    ])).not.toBeNull();
  });
});

describe('persistIntakeAnswer (privacy-safe audit trail)', () => {
  const captured: any[] = [];
  const fakeAdmin = {
    from: () => ({
      insert: (row: any) => {
        captured.push(row);
        return { select: () => ({ single: async () => ({ data: { id: 'ans-42' }, error: null }) }) };
      },
    }),
  };
  const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

  it('PRIVACY: stores a fixed marker, never the raw user turn', async () => {
    captured.length = 0;
    const id = await persistIntakeAnswer(fakeAdmin, 'u1', '{"reply":"Got it — revenue?","extracted":{},"complete":false}', usage);
    expect(id).toBe('ans-42');
    expect(captured[0].question).toBe('[intake turn]');
    // A volunteered name in a turn can never appear: the turn is not an input here.
    expect(JSON.stringify(captured[0])).not.toContain('Coca-Cola');
  });

  it('stores the parsed object (not a string blob) for eval mining', async () => {
    captured.length = 0;
    await persistIntakeAnswer(fakeAdmin, 'u1', '{"reply":"hi","extracted":{},"complete":false}', usage);
    expect(captured[0].answer).toEqual({ reply: 'hi', extracted: {}, complete: false });
  });

  it('falls back to {text} on malformed JSON and never throws', async () => {
    captured.length = 0;
    const id = await persistIntakeAnswer(fakeAdmin, 'u1', 'not json', usage);
    expect(id).toBe('ans-42');
    expect(captured[0].answer).toEqual({ text: 'not json' });
  });
});

describe('INTAKE_SCHEMA + INTAKE_SYSTEM contracts', () => {
  // Walks properties, items, AND anyOf branches.
  const walk = (node: any, fn: (n: any) => void) => {
    if (!node || typeof node !== 'object') return;
    fn(node);
    if (node.properties) Object.values(node.properties).forEach((c: any) => walk(c, fn));
    if (node.items) walk(node.items, fn);
    if (Array.isArray(node.anyOf)) node.anyOf.forEach((c: any) => walk(c, fn));
  };

  it('every object level has additionalProperties:false (structured-outputs req)', () => {
    walk(INTAKE_SCHEMA, node => {
      const t = node.type;
      if (t === 'object' || (Array.isArray(t) && t.includes('object'))) {
        expect(node.additionalProperties).toBe(false);
      }
    });
  });

  it('LIVE-400 regression: never enum combined with a union type (use anyOf)', () => {
    // The API rejects {type:['string','null'], enum:[...]} — caught live by the
    // intake drive test ("Enum value 'tax_professionals' does not match
    // declared type"). Nullable enums must be anyOf[{type,enum},{type:null}].
    walk(INTAKE_SCHEMA, node => {
      if (node.enum) expect(Array.isArray(node.type)).toBe(false);
    });
  });

  it('every nullable enum field still constrains its values (anyOf branch carries the enum)', () => {
    const extracted = (INTAKE_SCHEMA as any).properties.extracted.properties;
    for (const field of ['respondentRole', 'revenueRange', 'taxCalculationAutomationRange', 'genAIAdoptionStage', 'taxTechFTEsRange']) {
      const branches = extracted[field].anyOf;
      expect(branches.some((b: any) => Array.isArray(b.enum) && b.enum.length > 0)).toBe(true);
      expect(branches.some((b: any) => b.type === 'null')).toBe(true);
    }
    const cp = extracted.companyProfile.anyOf;
    expect(cp.some((b: any) => b.items?.enum?.length > 0)).toBe(true);
  });

  it('requires reply/extracted/complete, and extracted covers all interview fields', () => {
    expect((INTAKE_SCHEMA as any).required).toEqual(['reply', 'extracted', 'complete']);
    const fields = Object.keys((INTAKE_SCHEMA as any).properties.extracted.properties);
    expect(fields).toEqual(expect.arrayContaining([
      'companyProfile', 'respondentRole', 'revenueRange', 'jurisdictionsCovered',
      'taxCalculationAutomationRange', 'aiAdopted', 'genAIAdoptionStage', 'taxTechFTEsRange', 'otherFacts',
    ]));
  });

  it('PRIVACY: no identity fields in the schema; the prompt forbids collecting them', () => {
    const extracted = (INTAKE_SCHEMA as any).properties.extracted.properties;
    expect(extracted.companyName).toBeUndefined();
    expect(extracted.userName).toBeUndefined();
    expect(INTAKE_SYSTEM).toMatch(/never ask for the user's name, email, or company name/i);
    expect(INTAKE_SYSTEM).toMatch(/do NOT record them/);
  });

  it('the prompt states the four required fields and one-question-at-a-time', () => {
    expect(INTAKE_SYSTEM).toContain('ONE question at a time');
    expect(INTAKE_SYSTEM).toMatch(/company profile/i);
    expect(INTAKE_SYSTEM).toMatch(/revenue/i);
    expect(INTAKE_SYSTEM).toMatch(/jurisdictions/i);
  });
});

describe('addUsage', () => {
  it('sums token counts across loop turns', () => {
    const a = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 2, cache_read_input_tokens: 1 };
    const b = { input_tokens: 3, output_tokens: 7, cache_creation_input_tokens: 0, cache_read_input_tokens: 4 };
    expect(addUsage(a, b)).toEqual({ input_tokens: 13, output_tokens: 12, cache_creation_input_tokens: 2, cache_read_input_tokens: 5 });
  });

  it('tolerates a missing/partial usage object', () => {
    const a = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 1, cache_read_input_tokens: 1 };
    expect(addUsage(a, undefined)).toEqual(a);
    expect(addUsage(a, { input_tokens: 2 }).input_tokens).toBe(3);
  });
});
