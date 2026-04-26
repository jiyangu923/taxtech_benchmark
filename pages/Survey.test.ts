import { describe, it, expect } from 'vitest';
import { normalizeArrayField, submissionToForm, isEmptyDraft } from './Survey';
import { Submission } from '../types';

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

// ─── submissionToForm ─────────────────────────────────────────────────────────
//
// When the Survey page re-opens for a returning user, it prefills the form
// from their existing submission. submissionToForm strips the server-only
// fields so the leftover shape is safe to spread into the form state.

describe('submissionToForm', () => {
  const fullSub: Submission = {
    id: 'sub-1',
    userId: 'u-1',
    userName: 'Alice',
    status: 'approved',
    submittedAt: '2026-04-01T00:00:00Z',
    companyProfile: ['public'],
    participationGoal: ['benchmark'],
    respondentRole: 'tax_technology',
    ownedTaxFunctions: ['compliance'],
    organizationScope: 'global',
    revenueRange: '500m_5b',
    aiAdopted: true,
    industry: 'tech',
    annualTaxTechBudgetRange: '1m_3m',
  };

  it('removes id, userId, userName, status, submittedAt', () => {
    const form = submissionToForm(fullSub);
    expect(form).not.toHaveProperty('id');
    expect(form).not.toHaveProperty('userId');
    expect(form).not.toHaveProperty('userName');
    expect(form).not.toHaveProperty('status');
    expect(form).not.toHaveProperty('submittedAt');
  });

  it('preserves all answer fields verbatim', () => {
    const form = submissionToForm(fullSub);
    expect(form.companyProfile).toEqual(['public']);
    expect(form.respondentRole).toBe('tax_technology');
    expect(form.revenueRange).toBe('500m_5b');
    expect(form.aiAdopted).toBe(true);
    expect(form.annualTaxTechBudgetRange).toBe('1m_3m');
  });

  it('does not mutate the input submission', () => {
    const sub = { ...fullSub };
    submissionToForm(sub);
    expect(sub).toEqual(fullSub);
  });
});

// ─── isEmptyDraft ─────────────────────────────────────────────────────────────
//
// Regression: the autosave effect writes JSON.stringify(formData) on every
// formData change, including the very first render with an empty INITIAL_FORM.
// A naive truthy check on the localStorage string treated the just-written
// empty stub as a "real draft" and skipped the server prefill, so returning
// users always saw a blank form even though their previous answers existed
// in the database.

describe('isEmptyDraft', () => {
  it('returns true when raw is null', () => {
    expect(isEmptyDraft(null)).toBe(true);
  });

  it('returns true when raw is an empty string', () => {
    expect(isEmptyDraft('')).toBe(true);
  });

  it('returns true when raw is unparseable JSON', () => {
    expect(isEmptyDraft('{not json')).toBe(true);
  });

  it('returns true for the JSON-stringified INITIAL_FORM (the autosave-on-mount stub)', () => {
    // The exact value the autosave effect writes on first render with no user input.
    const emptyStub = JSON.stringify({
      companyProfile: [],
      participationGoal: [],
      respondentRole: '',
      ownedTaxFunctions: [],
      organizationScope: '',
      revenueRange: '',
      taxTechDecisionOwner: '',
      buildVsBuyExperience: [],
      annualTaxTechBudgetRange: '',
      vatSalesTaxAutomationRange: '',
      eInvoicingAutomationRange: '',
      customsDutiesAutomationRange: '',
      aiAdopted: false,
      taxTechSkillMixFrontendPercent: 0,
      taxTechSkillMixBackendPercent: 0,
      taxTechSkillMixDataEngineeringPercent: 0,
      taxTechSkillMixDevOpsPercent: 0,
      taxTechSkillMixOtherPercent: 0,
      planningSpecialistsPercent: 0,
      complianceSpecialistsPercent: 0,
      auditSpecialistsPercent: 0,
      provisionSpecialistsPercent: 0,
      otherSpecialistsPercent: 0,
    });
    expect(isEmptyDraft(emptyStub)).toBe(true);
  });

  it('returns false when raw contains any user-entered field', () => {
    expect(isEmptyDraft(JSON.stringify({ companyProfile: ['public'] }))).toBe(false);
  });

  it('returns false when raw contains a non-default scalar', () => {
    expect(isEmptyDraft(JSON.stringify({ revenueRange: '500m_5b' }))).toBe(false);
  });
});
