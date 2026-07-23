import { Submission } from '../types';
import * as C from '../constants';
import { askIntake } from './claude';

/**
 * AI-led intake (docs/AI_INTAKE_PIVOT.md): Taxi interviews a new member and
 * fills their survey record. This module is the client brain — the wire turn
 * shaping, the extraction accumulator, the completion check, and the final
 * Submission payload. The interview prompt + extraction schema live SERVER-side
 * (api/claude.ts mode:'intake'); the client only ever sends conversation turns.
 */

export interface IntakeExtracted {
  companyProfile: string[] | null;
  respondentRole: string | null;
  revenueRange: string | null;
  jurisdictionsCovered: number | null;
  taxCalculationAutomationRange: string | null;
  aiAdopted: boolean | null;
  genAIAdoptionStage: string | null;
  taxTechFTEsRange: string | null;
  otherFacts: string[];
}

export interface IntakeTurnResult {
  reply: string;
  extracted: IntakeExtracted;
  complete: boolean;
}

export interface IntakeTurn {
  role: 'user' | 'assistant';
  content: string;
}

export const EMPTY_EXTRACTED: IntakeExtracted = {
  companyProfile: null,
  respondentRole: null,
  revenueRange: null,
  jurisdictionsCovered: null,
  taxCalculationAutomationRange: null,
  aiAdopted: null,
  genAIAdoptionStage: null,
  taxTechFTEsRange: null,
  otherFacts: [],
};

/**
 * The UI shows a hardcoded greeting (instant render, no API round trip). The
 * server's sanitizer requires the wire conversation to START with a user turn,
 * so the wire prepends a synthetic opener and the greeting rides as the first
 * assistant turn. Both constants are part of the wire contract — the live-test
 * script replays the same shape.
 */
export const INTAKE_OPENER = "Hi — I'm ready to set up my benchmark profile.";
export const INTAKE_GREETING =
  "Hey, I'm Taxi — your benchmark analyst. Instead of a survey form, we'll just talk: " +
  'a few quick questions, then I benchmark you against your peers right away. ' +
  'Everything is anonymous — no names, no company names.\n\n' +
  'First up: what kind of company are you? Public, PE-backed, pre-IPO, a multinational, ' +
  'domestic-only — whatever combination fits.';

// Client-side copies of the server sanitizer's bounds (api/claude.ts
// INTAKE_MAX_MESSAGES / INTAKE_MAX_CONTENT_CHARS). The server REJECTS rather
// than truncates, and a rejected conversation stored in the draft would be
// permanently stuck — so the client trims BEFORE the wire, guaranteeing every
// request it builds is acceptable. `acc` carries all extraction state, so old
// turns are only conversational color; dropping them loses nothing.
const WIRE_MAX_CONTENT_CHARS = 2000;
const WIRE_MAX_DISPLAY_TURNS = 30; // + opener + greeting = 32 wire turns, well under the server's 40

/** Display turns → wire turns (opener + greeting + recent visible conversation),
 *  bounded so the server sanitizer can never reject a client-built request. */
export function toWireTurns(displayTurns: IntakeTurn[]): IntakeTurn[] {
  const recent = displayTurns.slice(-WIRE_MAX_DISPLAY_TURNS);
  return [
    { role: 'user', content: INTAKE_OPENER },
    { role: 'assistant', content: INTAKE_GREETING },
    ...recent.map(t => (t.content.length > WIRE_MAX_CONTENT_CHARS
      ? { ...t, content: t.content.slice(0, WIRE_MAX_CONTENT_CHARS) }
      : t)),
  ];
}

/**
 * Merge one turn's extraction into the running accumulator. Non-null incoming
 * fields win (the model re-states corrected values); otherFacts unions with
 * dedupe so restatements don't multiply.
 */
export function mergeExtracted(prev: IntakeExtracted, next: Partial<IntakeExtracted> | null | undefined): IntakeExtracted {
  if (!next) return prev;
  const merged: IntakeExtracted = { ...prev };
  for (const key of ['companyProfile', 'respondentRole', 'revenueRange', 'jurisdictionsCovered', 'taxCalculationAutomationRange', 'aiAdopted', 'genAIAdoptionStage', 'taxTechFTEsRange'] as const) {
    const v = next[key];
    if (v === null || v === undefined) continue;
    // An empty companyProfile array is "nothing extracted this turn", not a
    // correction to zero — never let it wipe a captured profile.
    if (key === 'companyProfile' && Array.isArray(v) && v.length === 0) continue;
    (merged as any)[key] = v;
  }
  if (Array.isArray(next.otherFacts) && next.otherFacts.length) {
    merged.otherFacts = [...new Set([...prev.otherFacts, ...next.otherFacts.filter(f => typeof f === 'string' && f.trim())])];
  }
  return merged;
}

/** The same four fields the old form required before allowing submit. */
export function requiredComplete(acc: IntakeExtracted): boolean {
  return Boolean(
    acc.companyProfile?.length &&
    acc.respondentRole &&
    acc.revenueRange &&
    typeof acc.jurisdictionsCovered === 'number' && acc.jurisdictionsCovered >= 1
  );
}

const REQUIRED_LABELS: Array<[keyof IntakeExtracted, string]> = [
  ['companyProfile', 'Company profile'],
  ['respondentRole', 'Your role'],
  ['revenueRange', 'Revenue range'],
  ['jurisdictionsCovered', 'Jurisdictions'],
];

/** Labels of still-missing required fields — drives the progress line. */
export function missingRequired(acc: IntakeExtracted): string[] {
  return REQUIRED_LABELS
    .filter(([key]) => {
      const v = acc[key];
      if (key === 'companyProfile') return !(Array.isArray(v) && v.length);
      if (key === 'jurisdictionsCovered') return !(typeof v === 'number' && v >= 1);
      return !v;
    })
    .map(([, label]) => label);
}

// Enum value → human label, for the captured-field chips. Falls back to the
// raw value so an unknown code (schema drift) is visible, not invisible.
const LABEL_SOURCES: Record<string, Array<{ value: string; label: string }>> = {
  companyProfile: C.OPTS_COMPANY_PROFILE,
  respondentRole: C.OPTS_RESPONDENT_ROLE,
  revenueRange: C.OPTS_REVENUE,
  taxCalculationAutomationRange: C.OPTS_AUTOMATION,
  genAIAdoptionStage: C.OPTS_GENAI_STAGE,
  taxTechFTEsRange: C.OPTS_FTE_TECH,
};

export function labelFor(field: string, value: string): string {
  return LABEL_SOURCES[field]?.find(o => o.value === value)?.label ?? value;
}

/** Chip list for the captured-so-far strip. Order: required first. */
export function capturedChips(acc: IntakeExtracted): Array<{ field: string; text: string }> {
  const chips: Array<{ field: string; text: string }> = [];
  if (acc.companyProfile?.length) chips.push({ field: 'companyProfile', text: acc.companyProfile.map(v => labelFor('companyProfile', v)).join(' · ') });
  if (acc.respondentRole) chips.push({ field: 'respondentRole', text: labelFor('respondentRole', acc.respondentRole) });
  if (acc.revenueRange) chips.push({ field: 'revenueRange', text: labelFor('revenueRange', acc.revenueRange) });
  if (typeof acc.jurisdictionsCovered === 'number' && acc.jurisdictionsCovered >= 1) chips.push({ field: 'jurisdictionsCovered', text: `${acc.jurisdictionsCovered} jurisdiction${acc.jurisdictionsCovered === 1 ? '' : 's'}` });
  if (acc.taxCalculationAutomationRange) chips.push({ field: 'taxCalculationAutomationRange', text: `Automation: ${labelFor('taxCalculationAutomationRange', acc.taxCalculationAutomationRange)}` });
  if (acc.aiAdopted !== null) chips.push({ field: 'aiAdopted', text: acc.aiAdopted ? `AI: adopted${acc.genAIAdoptionStage ? ` (${labelFor('genAIAdoptionStage', acc.genAIAdoptionStage)})` : ''}` : 'AI: not yet' });
  if (acc.taxTechFTEsRange) chips.push({ field: 'taxTechFTEsRange', text: `Tech FTEs: ${labelFor('taxTechFTEsRange', acc.taxTechFTEsRange)}` });
  return chips;
}

// Mirrors the retired form's INITIAL_FORM (pages/Survey.tsx, deleted in the
// funnel-switch PR) so intake-created records keep the exact shape historical
// form-created records have.
const INTAKE_FORM_DEFAULTS: Partial<Submission> = {
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
};

/**
 * The accumulated interview → a createSubmission payload. Identity fields are
 * structurally absent (the schema never captures them; userName is stamped
 * server-side from the profile; companyName simply no longer exists as an
 * input — anonymity by default). otherFacts land in additionalNotes, tagged so
 * they're distinguishable from human-typed notes later.
 */
export function buildIntakeSubmission(acc: IntakeExtracted): Partial<Submission> {
  const payload: Partial<Submission> = {
    ...INTAKE_FORM_DEFAULTS,
    companyProfile: acc.companyProfile ?? [],
    respondentRole: (acc.respondentRole ?? '') as Submission['respondentRole'],
    revenueRange: acc.revenueRange ?? '',
    jurisdictionsCovered: acc.jurisdictionsCovered ?? undefined,
    aiAdopted: acc.aiAdopted ?? false,
  };
  if (acc.taxCalculationAutomationRange) payload.taxCalculationAutomationRange = acc.taxCalculationAutomationRange;
  if (acc.genAIAdoptionStage) payload.genAIAdoptionStage = acc.genAIAdoptionStage;
  if (acc.taxTechFTEsRange) payload.taxTechFTEsRange = acc.taxTechFTEsRange;
  if (acc.otherFacts.length) {
    payload.additionalNotes = `[AI intake] ${acc.otherFacts.join(' | ')}`;
  }
  return payload;
}

/**
 * One interview round trip: send the visible conversation (wire-shaped), get
 * the reply, merge the extraction. Throws on transport errors — the caller
 * renders the error as a bubble and lets the user retry.
 */
export async function runIntakeTurn(
  displayTurns: IntakeTurn[],
  acc: IntakeExtracted,
): Promise<{ reply: string; acc: IntakeExtracted; complete: boolean }> {
  const { json } = await askIntake<IntakeTurnResult>(toWireTurns(displayTurns));
  const nextAcc = mergeExtracted(acc, json.extracted);
  // complete is the model's judgment; requiredComplete is ours. BOTH must hold
  // before we create the record — the model can't force a submit with missing
  // fields, and a model that forgets to flip complete can't strand a finished
  // interview (the UI offers the finish action on requiredComplete alone).
  return { reply: json.reply, acc: nextAcc, complete: json.complete && requiredComplete(nextAcc) };
}
