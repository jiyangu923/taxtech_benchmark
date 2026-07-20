import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EMPTY_EXTRACTED, INTAKE_OPENER, INTAKE_GREETING,
  toWireTurns, mergeExtracted, requiredComplete, missingRequired,
  labelFor, capturedChips, buildIntakeSubmission, runIntakeTurn,
  type IntakeExtracted,
} from './intake';

const acc = (o: Partial<IntakeExtracted> = {}): IntakeExtracted => ({ ...EMPTY_EXTRACTED, ...o });

const FULL_REQUIRED = acc({
  companyProfile: ['public', 'multinational'],
  respondentRole: 'tax_technology',
  revenueRange: '100m_500m',
  jurisdictionsCovered: 8,
});

describe('toWireTurns (server sanitizer contract)', () => {
  it('prepends the synthetic opener (user) + greeting (assistant)', () => {
    const wire = toWireTurns([{ role: 'user', content: 'we are public' }]);
    expect(wire[0]).toEqual({ role: 'user', content: INTAKE_OPENER });
    expect(wire[1]).toEqual({ role: 'assistant', content: INTAKE_GREETING });
    expect(wire[2]).toEqual({ role: 'user', content: 'we are public' });
  });

  it('always starts AND ends with a user turn when display ends with the user', () => {
    const wire = toWireTurns([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ]);
    expect(wire[0].role).toBe('user');
    expect(wire[wire.length - 1].role).toBe('user');
  });

  it('bounds the wire so the server sanitizer can never reject it (40-turn cap)', () => {
    // 50 display turns (user/assistant alternating, ending user) → recent slice
    // only; total wire stays comfortably under the server's 40-message limit.
    const display = Array.from({ length: 50 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `turn ${i}`,
    }));
    const wire = toWireTurns(display);
    expect(wire.length).toBeLessThanOrEqual(32);
    expect(wire[0].content).toBe(INTAKE_OPENER);
    expect(wire[wire.length - 1]).toEqual(display[display.length - 1]); // newest turn survives
  });

  it('truncates over-long turn content instead of letting the server 400', () => {
    // e.g. a verbose assistant reply echoed back — server caps at 2000 chars.
    const wire = toWireTurns([
      { role: 'assistant', content: 'y'.repeat(3000) },
      { role: 'user', content: 'x'.repeat(2500) },
    ]);
    expect(wire[wire.length - 1].content.length).toBe(2000);
    expect(wire[wire.length - 2].content.length).toBe(2000);
  });
});

describe('mergeExtracted', () => {
  it('non-null incoming fields overwrite; nulls preserve previous values', () => {
    const prev = acc({ revenueRange: '100m_500m', respondentRole: 'tax_technology' });
    const merged = mergeExtracted(prev, { revenueRange: 'over_5b', respondentRole: null, jurisdictionsCovered: 8 });
    expect(merged.revenueRange).toBe('over_5b');            // correction wins
    expect(merged.respondentRole).toBe('tax_technology');   // null preserves
    expect(merged.jurisdictionsCovered).toBe(8);
  });

  it('unions otherFacts with dedupe (restatements do not multiply)', () => {
    const prev = acc({ otherFacts: ['Uses Alteryx'] });
    const merged = mergeExtracted(prev, { otherFacts: ['Uses Alteryx', 'Team in Poland', '  '] } as any);
    expect(merged.otherFacts).toEqual(['Uses Alteryx', 'Team in Poland']);
  });

  it('tolerates null/undefined extraction (bad turn) without losing state', () => {
    expect(mergeExtracted(FULL_REQUIRED, null)).toEqual(FULL_REQUIRED);
    expect(mergeExtracted(FULL_REQUIRED, undefined)).toEqual(FULL_REQUIRED);
  });

  it('aiAdopted false is a real answer, not a null (falsy but valid)', () => {
    const merged = mergeExtracted(acc(), { aiAdopted: false });
    expect(merged.aiAdopted).toBe(false);
  });

  it('an empty companyProfile array never wipes a captured profile', () => {
    const prev = acc({ companyProfile: ['public', 'multinational'] });
    const merged = mergeExtracted(prev, { companyProfile: [] });
    expect(merged.companyProfile).toEqual(['public', 'multinational']);
  });
});

describe('requiredComplete / missingRequired (the old form contract: 4 fields)', () => {
  it('complete only with companyProfile+role+revenue+jurisdictions', () => {
    expect(requiredComplete(FULL_REQUIRED)).toBe(true);
    expect(requiredComplete(acc())).toBe(false);
    expect(requiredComplete({ ...FULL_REQUIRED, companyProfile: [] })).toBe(false);
    expect(requiredComplete({ ...FULL_REQUIRED, jurisdictionsCovered: 0 })).toBe(false);
    expect(requiredComplete({ ...FULL_REQUIRED, jurisdictionsCovered: null })).toBe(false);
  });

  it('missingRequired names exactly the gaps', () => {
    expect(missingRequired(FULL_REQUIRED)).toEqual([]);
    expect(missingRequired(acc({ revenueRange: '100m_500m' })))
      .toEqual(['Company profile', 'Your role', 'Jurisdictions']);
  });
});

describe('labelFor / capturedChips', () => {
  it('resolves enum values to human labels from constants', () => {
    expect(labelFor('respondentRole', 'tax_technology').toLowerCase()).toContain('tech');
    expect(labelFor('revenueRange', 'nonexistent_code')).toBe('nonexistent_code'); // drift visible, not invisible
  });

  it('chips reflect captured fields, required first, singular/plural jurisdictions', () => {
    const chips = capturedChips({ ...FULL_REQUIRED, jurisdictionsCovered: 1, aiAdopted: true, genAIAdoptionStage: 'poc' });
    const fields = chips.map(c => c.field);
    expect(fields.slice(0, 4)).toEqual(['companyProfile', 'respondentRole', 'revenueRange', 'jurisdictionsCovered']);
    expect(chips.find(c => c.field === 'jurisdictionsCovered')!.text).toBe('1 jurisdiction');
    expect(chips.find(c => c.field === 'aiAdopted')!.text).toContain('adopted');
  });

  it('renders zero chips for an empty accumulator', () => {
    expect(capturedChips(acc())).toEqual([]);
  });
});

describe('buildIntakeSubmission', () => {
  it('mirrors the old form defaults + captured values', () => {
    const p = buildIntakeSubmission(FULL_REQUIRED);
    expect(p.companyProfile).toEqual(['public', 'multinational']);
    expect(p.respondentRole).toBe('tax_technology');
    expect(p.revenueRange).toBe('100m_500m');
    expect(p.jurisdictionsCovered).toBe(8);
    // Form-parity defaults ride along:
    expect(p.participationGoal).toEqual([]);
    expect(p.aiAdopted).toBe(false);
    expect(p.taxTechSkillMixFrontendPercent).toBe(0);
  });

  it('includes optional fields only when captured; tags otherFacts into additionalNotes', () => {
    const p = buildIntakeSubmission({ ...FULL_REQUIRED, taxCalculationAutomationRange: '70_90', otherFacts: ['Uses Alteryx', 'Team in Poland'] });
    expect(p.taxCalculationAutomationRange).toBe('70_90');
    expect(p.additionalNotes).toBe('[AI intake] Uses Alteryx | Team in Poland');
    expect(buildIntakeSubmission(FULL_REQUIRED).additionalNotes).toBeUndefined();
  });

  it('PRIVACY: payload never carries identity fields', () => {
    const p = buildIntakeSubmission({ ...FULL_REQUIRED, otherFacts: ['great team'] }) as Record<string, unknown>;
    expect('companyName' in p).toBe(false);
    expect('userName' in p).toBe(false);
    expect('userId' in p).toBe(false);
  });
});

describe('runIntakeTurn (wire contract)', () => {
  const mockFetch = vi.fn();
  beforeEach(() => { mockFetch.mockReset(); vi.stubGlobal('fetch', mockFetch); });
  afterEach(() => { vi.restoreAllMocks(); });

  const serverTurn = (extracted: Partial<IntakeExtracted>, complete = false, reply = 'Got it — next question?') => ({
    ok: true, status: 200,
    json: async () => ({
      text: 'raw', json: { reply, extracted: { ...EMPTY_EXTRACTED, ...extracted }, complete },
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      answerId: 'a1',
    }),
  });

  it("posts mode:'intake' with ONLY wire turns — no system/outputFormat/tools", async () => {
    mockFetch.mockResolvedValueOnce(serverTurn({}));
    await runIntakeTurn([{ role: 'user', content: 'hello' }], acc());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.mode).toBe('intake');
    expect(body.messages[0].content).toBe(INTAKE_OPENER);
    expect(body.system).toBeUndefined();
    expect(body.outputFormat).toBeUndefined();
    expect(body.tools).toBeUndefined();
  });

  it('merges extraction into the accumulator across turns', async () => {
    mockFetch.mockResolvedValueOnce(serverTurn({ revenueRange: '100m_500m' }));
    const r = await runIntakeTurn([{ role: 'user', content: 'about 200m' }], acc({ respondentRole: 'tax_technology' }));
    expect(r.acc.revenueRange).toBe('100m_500m');
    expect(r.acc.respondentRole).toBe('tax_technology');
  });

  it("model's complete=true is NOT enough — required fields must actually be present", async () => {
    mockFetch.mockResolvedValueOnce(serverTurn({ revenueRange: '100m_500m' }, true));
    const r = await runIntakeTurn([{ role: 'user', content: 'done?' }], acc());
    expect(r.complete).toBe(false); // model said complete, but 3 required fields missing
  });

  it('complete when the model agrees AND all required fields are captured', async () => {
    mockFetch.mockResolvedValueOnce(serverTurn({ jurisdictionsCovered: 8 }, true));
    const r = await runIntakeTurn(
      [{ role: 'user', content: '8 countries' }],
      acc({ companyProfile: ['public'], respondentRole: 'tax_technology', revenueRange: '100m_500m' }),
    );
    expect(r.complete).toBe(true);
  });

  it('surfaces server errors (429 daily limit) as throws with the message', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: 'Daily limit reached.' }) });
    await expect(runIntakeTurn([{ role: 'user', content: 'hi' }], acc())).rejects.toThrow('Daily limit reached.');
  });
});
