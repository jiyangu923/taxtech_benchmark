import { describe, it, expect } from 'vitest';
import {
  SECTIONS,
  OPTS_COMPANY_PROFILE,
  OPTS_PARTICIPATION_GOAL,
  OPTS_RESPONDENT_ROLE,
  OPTS_TAX_FUNCTIONS,
  OPTS_ORG_SCOPE,
  OPTS_OUTSOURCING_EXTENT,
  OPTS_TECH_APPROACH,
  OPTS_INDUSTRY,
  OPTS_TAX_TECH_ORG_LOCATION,
  OPTS_CENTRALIZATION,
  OPTS_REVENUE,
  OPTS_FTE_TECH,
  OPTS_FTE_BUSINESS,
  OPTS_DATA_HOSTING,
  OPTS_TAX_DATA_ARCH,
  OPTS_AUTOMATION,
  OPTS_REGULATORY_RESPONSE,
  OPTS_DATA_CONFIDENCE,
  OPTS_FILINGS,
  OPTS_ARCH_PATTERN,
  OPTS_DATA_FLOW,
  OPTS_LANGUAGES,
  OPTS_CLOUD,
  OPTS_CICD,
  OPTS_GENAI_STAGE,
} from './constants';

// ─── SECTIONS ────────────────────────────────────────────────────────────────

describe('SECTIONS', () => {
  it('has exactly 9 sections', () => {
    expect(SECTIONS).toHaveLength(9);
  });

  it('has sequential IDs starting from 1', () => {
    SECTIONS.forEach((section, index) => {
      expect(section.id).toBe(index + 1);
    });
  });

  it('every section has a non-empty title and description', () => {
    SECTIONS.forEach(section => {
      expect(section.title.trim().length).toBeGreaterThan(0);
      expect(section.description.trim().length).toBeGreaterThan(0);
    });
  });

  it('section IDs are unique', () => {
    const ids = SECTIONS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── OPTION ARRAYS ───────────────────────────────────────────────────────────

const ALL_OPTION_ARRAYS = [
  { name: 'OPTS_COMPANY_PROFILE',       opts: OPTS_COMPANY_PROFILE },
  { name: 'OPTS_PARTICIPATION_GOAL',    opts: OPTS_PARTICIPATION_GOAL },
  { name: 'OPTS_RESPONDENT_ROLE',       opts: OPTS_RESPONDENT_ROLE },
  { name: 'OPTS_TAX_FUNCTIONS',         opts: OPTS_TAX_FUNCTIONS },
  { name: 'OPTS_ORG_SCOPE',             opts: OPTS_ORG_SCOPE },
  { name: 'OPTS_OUTSOURCING_EXTENT',    opts: OPTS_OUTSOURCING_EXTENT },
  { name: 'OPTS_TECH_APPROACH',         opts: OPTS_TECH_APPROACH },
  { name: 'OPTS_INDUSTRY',              opts: OPTS_INDUSTRY },
  { name: 'OPTS_TAX_TECH_ORG_LOCATION', opts: OPTS_TAX_TECH_ORG_LOCATION },
  { name: 'OPTS_CENTRALIZATION',        opts: OPTS_CENTRALIZATION },
  { name: 'OPTS_REVENUE',               opts: OPTS_REVENUE },
  { name: 'OPTS_FTE_TECH',              opts: OPTS_FTE_TECH },
  { name: 'OPTS_FTE_BUSINESS',          opts: OPTS_FTE_BUSINESS },
  { name: 'OPTS_DATA_HOSTING',          opts: OPTS_DATA_HOSTING },
  { name: 'OPTS_TAX_DATA_ARCH',         opts: OPTS_TAX_DATA_ARCH },
  { name: 'OPTS_AUTOMATION',            opts: OPTS_AUTOMATION },
  { name: 'OPTS_REGULATORY_RESPONSE',   opts: OPTS_REGULATORY_RESPONSE },
  { name: 'OPTS_DATA_CONFIDENCE',       opts: OPTS_DATA_CONFIDENCE },
  { name: 'OPTS_FILINGS',               opts: OPTS_FILINGS },
  { name: 'OPTS_ARCH_PATTERN',          opts: OPTS_ARCH_PATTERN },
  { name: 'OPTS_DATA_FLOW',             opts: OPTS_DATA_FLOW },
  { name: 'OPTS_LANGUAGES',             opts: OPTS_LANGUAGES },
  { name: 'OPTS_CLOUD',                 opts: OPTS_CLOUD },
  { name: 'OPTS_CICD',                  opts: OPTS_CICD },
  { name: 'OPTS_GENAI_STAGE',           opts: OPTS_GENAI_STAGE },
];

describe('option arrays – structural integrity', () => {
  it.each(ALL_OPTION_ARRAYS)('$name is non-empty', ({ opts }) => {
    expect(opts.length).toBeGreaterThan(0);
  });

  it.each(ALL_OPTION_ARRAYS)('$name has unique values', ({ opts }) => {
    const values = opts.map(o => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it.each(ALL_OPTION_ARRAYS)('$name has no blank value or label strings', ({ opts }) => {
    opts.forEach(o => {
      expect(o.value.trim()).not.toBe('');
      expect(o.label.trim()).not.toBe('');
    });
  });
});

// ─── Domain-specific invariants ───────────────────────────────────────────────

describe('OPTS_RESPONDENT_ROLE', () => {
  it('contains exactly tax_professionals and tax_technology', () => {
    const values = OPTS_RESPONDENT_ROLE.map(o => o.value);
    expect(values).toContain('tax_professionals');
    expect(values).toContain('tax_technology');
    expect(values).toHaveLength(2);
  });
});

describe('OPTS_REVENUE', () => {
  it('has 5 revenue bands', () => {
    expect(OPTS_REVENUE).toHaveLength(5);
  });

  it('covers both smallest and largest bands', () => {
    const values = OPTS_REVENUE.map(o => o.value);
    expect(values).toContain('under_100m');
    expect(values).toContain('over_50b');
  });
});

describe('OPTS_AUTOMATION', () => {
  it('has 5 percentage tiers', () => {
    expect(OPTS_AUTOMATION).toHaveLength(5);
  });

  it('includes a high-automation tier (99%+)', () => {
    const values = OPTS_AUTOMATION.map(o => o.value);
    expect(values).toContain('99_plus');
  });
});

describe('OPTS_TAX_FUNCTIONS', () => {
  it('includes an "other" catch-all option', () => {
    const values = OPTS_TAX_FUNCTIONS.map(o => o.value);
    expect(values).toContain('other');
  });

  it('includes a fully-outsourced option', () => {
    const values = OPTS_TAX_FUNCTIONS.map(o => o.value);
    expect(values).toContain('none');
  });
});
