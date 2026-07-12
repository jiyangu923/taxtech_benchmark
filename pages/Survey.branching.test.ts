import { describe, it, expect } from 'vitest';
import { visibleSectionIds, visibleSections, showsTechBudget, clampStepIndex } from './Survey.branching';
import { SECTIONS } from '../constants';

describe('visibleSectionIds', () => {
  it('gives tax professionals the 5-step short path (1, 2, 4, 6, 9)', () => {
    expect(visibleSectionIds('tax_professionals')).toEqual([1, 2, 4, 6, 9]);
  });

  it('gives tax technology all 9 sections', () => {
    expect(visibleSectionIds('tax_technology')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('shows everything when no role is chosen yet (undefined / empty)', () => {
    expect(visibleSectionIds(undefined)).toHaveLength(9);
    expect(visibleSectionIds('')).toHaveLength(9);
    expect(visibleSectionIds(null)).toHaveLength(9);
  });

  it('falls back to all sections for an unknown role value', () => {
    expect(visibleSectionIds('mystery_role')).toHaveLength(9);
  });

  it('always keeps the core benchmark sections (1, 2, 6, 9) for every role', () => {
    for (const role of ['tax_professionals', 'tax_technology']) {
      const ids = visibleSectionIds(role);
      for (const core of [1, 2, 6, 9]) expect(ids).toContain(core);
    }
  });

  it('section 1 (where role is picked) is always the first step', () => {
    expect(visibleSectionIds('tax_professionals')[0]).toBe(1);
    expect(visibleSectionIds('tax_technology')[0]).toBe(1);
  });
});

describe('visibleSections', () => {
  it('filters the real SECTIONS array preserving order and metadata', () => {
    const secs = visibleSections(SECTIONS, 'tax_professionals');
    expect(secs.map(s => s.id)).toEqual([1, 2, 4, 6, 9]);
    expect(secs[2].title).toBe('Resource Benchmarking');
  });
});

describe('showsTechBudget', () => {
  it('hides the tax-tech budget question from tax professionals', () => {
    expect(showsTechBudget('tax_professionals')).toBe(false);
  });
  it('shows it to tax technology (and pre-role state)', () => {
    expect(showsTechBudget('tax_technology')).toBe(true);
    expect(showsTechBudget(undefined)).toBe(true);
  });
});

describe('clampStepIndex', () => {
  it('keeps an in-range index', () => {
    expect(clampStepIndex(3, 9)).toBe(3);
  });
  it('clamps when the list shrinks (role switched mid-survey)', () => {
    // e.g. user was on step 8 of the 9-step tech path, goes back to step 1
    // and switches to tax_professionals (5 steps).
    expect(clampStepIndex(8, 5)).toBe(4);
  });
  it('never goes below zero', () => {
    expect(clampStepIndex(-2, 5)).toBe(0);
    expect(clampStepIndex(0, 0)).toBe(0);
  });
});
