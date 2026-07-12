import type { SectionDef } from '../types';

/**
 * Role-based survey branching.
 *
 * The survey adapts to the respondent's role (picked in Section 1, required):
 *
 *   - tax_professionals → 5 steps (~2.5-3 min): Context, Org, Team size,
 *     Automation, AI. Section 4 shows only the FTE selects (no tech budget).
 *   - tax_technology → 7 steps (~5 min): adds the tech skill-mix grid (5)
 *     and Technical Architecture (8, which now includes Data Architecture).
 *
 * Every question must earn its place by powering something the user sees
 * (chart / filter / public stat) — "minimum contribution to first insight."
 * Verified field-by-field against Report.tsx / Report.helpers.ts (2026-06):
 *   - Sections 1, 2, 6, 9 are kept for EVERYONE — peer grouping + the
 *     automation composites + AI maturity that power the benchmark charts.
 *   - Both roles keep all four FTE selects: taxBusinessFTEsRange feeds the
 *     cost composites, and ranges are coarse enough for either role to
 *     estimate. annualTaxTechBudgetRange is tech-only (budget owners).
 *   - Cut entirely (consumed by NO chart/filter/stat): participationGoal,
 *     organizationScope, all of Section 3 (governance ×5),
 *     regulatoryChangeResponseTime, Section 7 except taxDataArchitecture
 *     (which moved into Section 8), both financial-close numbers, the
 *     Business Specialization grid, and the Section 9 duplicate regulatory
 *     radio. DB columns stay for historical rows, and the cut questions are
 *     candidates for progressive/periodic collection later (the AI-product
 *     flywheel: refresh prompts collect one question at a time in context).
 *
 * Until a role is chosen (blank/unknown), the longest real path (tech) is
 * shown — Section 1 is always first and role is required there, so in
 * practice the branch resolves before anything else renders.
 */

export const ROLE_SECTIONS: Record<string, number[]> = {
  tax_professionals: [1, 2, 4, 6, 9],
  tax_technology: [1, 2, 4, 5, 6, 8, 9],
};

// Pre-role fallback: the longest real path, so the step counter never
// advertises steps that no role actually has.
const FALLBACK_SECTIONS = ROLE_SECTIONS.tax_technology;

export function visibleSectionIds(role: string | undefined | null): number[] {
  if (!role) return FALLBACK_SECTIONS;
  return ROLE_SECTIONS[role] ?? FALLBACK_SECTIONS;
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
