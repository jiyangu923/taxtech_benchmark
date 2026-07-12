import type { SectionDef } from '../types';

/**
 * Role-based survey branching.
 *
 * The survey adapts to the respondent's role (picked in Section 1, required):
 *
 *   - tax_professionals → 5 steps (~3-4 min). Sections 3 (governance),
 *     5 (skill grids), 7 (data ecosystem) and 8 (tech architecture) are
 *     skipped; Section 4 shows only the FTE selects (no tech budget).
 *   - tax_technology → all 9 sections; Section 5 shows only the tech
 *     skill-mix grid.
 *
 * Design constraints (checked against Report.helpers/Report.tsx when this
 * was introduced):
 *   - Sections 1, 2, 6, 9 are kept for EVERYONE — peer grouping + the
 *     automation composites that power the benchmark charts.
 *   - Both roles keep all four FTE selects: taxBusinessFTEsRange feeds the
 *     cost composites, and ranges are coarse enough for either role to
 *     estimate. annualTaxTechBudgetRange is tech-only (budget owners).
 *   - The Business Specialization percent grid and the Section 9
 *     productRegulationEnablementCycle radio were removed for everyone:
 *     no chart consumes them, and they were the highest-friction /
 *     duplicate items. DB columns stay for historical rows.
 *
 * Until a role is chosen (blank/unknown), the full section list is shown —
 * Section 1 is always first and role is required there, so in practice the
 * branch resolves before it matters.
 */

export const ROLE_SECTIONS: Record<string, number[]> = {
  tax_professionals: [1, 2, 4, 6, 9],
  tax_technology: [1, 2, 3, 4, 5, 6, 7, 8, 9],
};

const ALL_SECTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function visibleSectionIds(role: string | undefined | null): number[] {
  if (!role) return ALL_SECTIONS;
  return ROLE_SECTIONS[role] ?? ALL_SECTIONS;
}

export function visibleSections(all: SectionDef[], role: string | undefined | null): SectionDef[] {
  const ids = visibleSectionIds(role);
  return all.filter(s => ids.includes(s.id));
}

/** Tech budget question (Section 4) — budget owners (tax technology) only. */
export function showsTechBudget(role: string | undefined | null): boolean {
  return role !== 'tax_professionals';
}

/**
 * Clamp the current step index when the visible-section list shrinks (the
 * user went back to Section 1 and switched role while deeper in the flow).
 */
export function clampStepIndex(stepIndex: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  return Math.min(Math.max(0, stepIndex), stepCount - 1);
}
