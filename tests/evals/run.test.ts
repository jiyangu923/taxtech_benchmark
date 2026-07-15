import { describe, it, expect } from 'vitest';
// NOTE: importing evals/run.ts must be side-effect-free (the isMain guard) —
// this import itself is the regression test for that: if the guard breaks, this
// suite would attempt live API calls and fail loudly on missing env.
import { buildEvalParams } from '../../evals/run';
import { RESPONSE_SCHEMA, SYSTEM_INSTRUCTION } from '../../services/taxi';
import { LOOKUP_RATE_TOOL, DEFAULT_MODEL } from '../../api/claude';

describe('buildEvalParams (production fidelity)', () => {
  const p = buildEvalParams('What is the VAT rate in Germany?');

  it('uses the production model, tool, and response schema — not copies', () => {
    expect(p.model).toBe(DEFAULT_MODEL);
    expect(p.tools).toEqual([LOOKUP_RATE_TOOL]);        // same object, not a re-description
    expect(p.tools[0]).toBe(LOOKUP_RATE_TOOL);
    expect(p.output_config.format.schema).toBe(RESPONSE_SCHEMA);
  });

  it('uses the production system instruction (incl. guideline 9: tool for rates)', () => {
    const sys = p.system[0].text as string;
    expect(sys).toContain(SYSTEM_INSTRUCTION);
    expect(sys).toContain('lookup_rate');
  });

  it('carries the question in the final (only) user message, buildUserMessage-shaped', () => {
    expect(p.messages).toHaveLength(1);
    expect(p.messages[0].role).toBe('user');
    expect(p.messages[0].content).toContain('User Question: What is the VAT rate in Germany?');
  });

  it('PRIVACY: the synthetic submission carries no identity fields', () => {
    expect(p.messages[0].content).not.toMatch(/companyName|userName/);
  });

  it('PUBLIC-ARTIFACT invariant: the eval system prompt embeds an EMPTY dataset', () => {
    // The repo is public and evals-results.json is uploaded as a downloadable
    // artifact. It stays member-data-free ONLY while the eval request carries no
    // real submissions — this pins that invariant against a future "improve
    // fidelity by using real data" change.
    expect(p.system[0].text).toContain('"benchmarkData":[]');
  });

  it('importing the runner module fired no live calls (isMain guard held)', () => {
    // If the guard were broken, main() would already have run at import time and
    // called process.exit / printed NOT CONFIGURED. Reaching this assertion at
    // all — with buildEvalParams importable — is the check.
    expect(typeof buildEvalParams).toBe('function');
  });
});
