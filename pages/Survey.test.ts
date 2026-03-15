import { describe, it, expect } from 'vitest';
import { normalizeArrayField } from './Survey';

// ─── normalizeArrayField ──────────────────────────────────────────────────────
//
// companyProfile and participationGoal are text[] in the database, but the
// radio-button controls in the Survey form call handleChange with a plain
// string.  normalizeArrayField ensures the value is always an array before it
// reaches the Supabase insert.
//
// Regression: without this normalization Supabase rejected the insert with a
// type error (string vs text[]), causing every survey submission to silently
// fail with "Failed to submit survey."

describe('normalizeArrayField', () => {
  it('returns an empty array for undefined', () => {
    expect(normalizeArrayField(undefined)).toEqual([]);
  });

  it('returns an empty array for null', () => {
    expect(normalizeArrayField(null)).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    expect(normalizeArrayField('')).toEqual([]);
  });

  it('wraps a plain string in a single-element array', () => {
    // This is the exact regression case: a radio button sets companyProfile to
    // "public" but the DB column is text[].
    expect(normalizeArrayField('public')).toEqual(['public']);
  });

  it('wraps any non-empty string value', () => {
    expect(normalizeArrayField('benchmark')).toEqual(['benchmark']);
    expect(normalizeArrayField('private_pe')).toEqual(['private_pe']);
  });

  it('passes through an already-correct single-element array unchanged', () => {
    expect(normalizeArrayField(['public'])).toEqual(['public']);
  });

  it('passes through a multi-element array unchanged', () => {
    expect(normalizeArrayField(['public', 'multinational'])).toEqual(['public', 'multinational']);
  });

  it('passes through an empty array unchanged', () => {
    expect(normalizeArrayField([])).toEqual([]);
  });
});
