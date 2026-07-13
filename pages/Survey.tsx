import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { Submission, Option } from '../types';
import { useMySubmission, useCreateSubmission } from '../services/queries';
import { visibleSections, clampStepIndex, showsTechBudget } from './Survey.branching';
import * as C from '../constants';
import SURVEY_TOOLTIPS from '../surveyTooltips';
import ParticipantCounter from './ParticipantCounter';
import { isWaitlisted } from '../services/cohort';

const DRAFT_KEY = 'taxtech_survey_draft';

/**
 * Normalizes a field that is text[] in the database but may arrive as a plain
 * string when populated by a radio-button (single-select) control.
 * Exported for unit testing.
 */
export function normalizeArrayField(value: string | string[] | undefined | null): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

const INITIAL_FORM: Partial<Submission> = {
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
 * Strips server-only fields (id, userId, etc.) from a Submission so the
 * remaining shape can seed the form state cleanly.
 * Exported for unit testing.
 */
export function submissionToForm(sub: Submission): Partial<Submission> {
  const { id: _id, userId: _u, userName: _n, status: _s, submittedAt: _t, ...rest } = sub;
  return rest;
}

/**
 * Returns true when the localStorage draft is null, unparseable, or
 * shape-equivalent to INITIAL_FORM. Used to distinguish a real in-progress
 * edit from the empty stub the autosave effect writes on first mount.
 * Exported for unit testing.
 */
export function isEmptyDraft(raw: string | null): boolean {
  if (!raw) return true;
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed) === JSON.stringify(INITIAL_FORM);
  } catch {
    return true;
  }
}

const Survey: React.FC = () => {
  const navigate = useNavigate();
  // 0-based index into the role-filtered step list (NOT a section id — the
  // visible sections depend on respondentRole, see Survey.branching.ts).
  const [stepIndex, setStepIndex] = useState(0);

  // Capture the localStorage draft ONCE at mount time, before any effect
  // runs. The autosave effect below writes JSON.stringify(formData) on every
  // formData change — including the very first render with an empty
  // INITIAL_FORM — so reading localStorage inside an effect would race with
  // that write and always look like "there's a draft." Capturing it via a
  // lazy useState initializer guarantees the value reflects what was on disk
  // before this component mounted.
  const [initialDraftRaw] = useState<string | null>(() => {
    try { return localStorage.getItem(DRAFT_KEY); } catch { return null; }
  });

  // Restore draft from localStorage on first render. localStorage takes
  // precedence over the server submission since it represents the user's
  // most recent in-progress edit. If the captured draft is empty/equivalent
  // to INITIAL_FORM, the prefill effect below will overwrite it from the
  // server.
  const [formData, setFormData] = useState<Partial<Submission>>(() => {
    if (initialDraftRaw) {
      try { return { ...INITIAL_FORM, ...JSON.parse(initialDraftRaw) }; }
      catch { return INITIAL_FORM; }
    }
    return INITIAL_FORM;
  });

  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [waitlisted, setWaitlisted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Prefill from cache if present. The cache is shared with /report and
  // other pages, so re-opening the survey is instant after the first fetch.
  const { data: existingSub } = useMySubmission();
  const createSubmissionMutation = useCreateSubmission();

  const existingSubmittedAt = existingSub?.submittedAt ?? null;
  const existingStatus = existingSub?.status ?? null;

  // Race protection: if the user starts typing BEFORE the cached existingSub
  // arrives, we must NOT clobber their input when prefill resolves. This ref
  // flips to true on the very first user mutation (handleChange or
  // toggleArrayValue) and is checked by the prefill effect below. A ref
  // (not state) so reading it doesn't trigger re-renders or stale closures.
  const userEditedRef = useRef(false);

  // When the existing submission arrives AND the captured draft snapshot
  // is empty AND the user hasn't started typing, prefill from the server.
  // Track whether prefill ran via state so the effect doesn't re-fire on
  // every existingSub identity change (also blocks clobber from later
  // refetches via window-focus revalidation).
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (prefilled) return;
    if (!existingSub) return;
    // The user started typing before the server responded — keep their input,
    // don't prefill. Mark prefilled so we don't keep re-evaluating.
    if (userEditedRef.current) {
      setPrefilled(true);
      return;
    }
    if (isEmptyDraft(initialDraftRaw)) {
      setFormData({ ...INITIAL_FORM, ...submissionToForm(existingSub) });
    }
    setPrefilled(true);
  }, [existingSub, initialDraftRaw, prefilled]);

  // Autosave draft on every change
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
  }, [formData]);

  const handleChange = (field: keyof Submission, value: any) => {
    userEditedRef.current = true;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleArrayValue = (field: keyof Submission, value: string) => {
    userEditedRef.current = true;
    setFormData(prev => {
      const current = (prev[field] as string[]) || [];
      const next = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...prev, [field]: next };
    });
  };

  // Role-filtered step list. Tax Professionals get the 5-step short path;
  // Tax Technology (or no role yet) gets all 9 sections. `activeSection`
  // keeps its old meaning (the section ID being rendered) so the per-section
  // render blocks below are unchanged.
  const steps = useMemo(
    () => visibleSections(C.SECTIONS, formData.respondentRole),
    [formData.respondentRole],
  );
  const stepIdx = clampStepIndex(stepIndex, steps.length);
  const activeSection = steps[stepIdx].id;
  const isLastStep = stepIdx === steps.length - 1;

  const progress = Math.round(((stepIdx + 1) / steps.length) * 100);

  const getGroupSum = (fields: (keyof Submission)[]): number =>
    fields.reduce((acc, f) => acc + ((formData[f] as number) || 0), 0);

  const validatePercentages = (section: number): string | null => {
    if (section !== 5) return null;

    // Only the tech skill-mix grid is rendered (the business-specialization
    // grid was removed from the survey) — validate just what the user can see.
    const techSum = getGroupSum([
      'taxTechSkillMixFrontendPercent', 'taxTechSkillMixBackendPercent',
      'taxTechSkillMixDataEngineeringPercent', 'taxTechSkillMixDevOpsPercent',
      'taxTechSkillMixOtherPercent',
    ]);

    if (techSum > 0 && Math.abs(techSum - 100) > 0.1)
      return `Tax Technology Skill Mix must sum to exactly 100%. Current: ${techSum}%`;
    return null;
  };

  const handleNext = () => {
    setError(null);
    if (activeSection === 1 && !(formData.companyProfile as string[])?.length) {
      setError('Please select at least one company profile.');
      return;
    }
    if (activeSection === 1 && !formData.respondentRole) {
      setError('Please select your role.');
      return;
    }
    if (activeSection === 2 && !formData.revenueRange) {
      setError('Please select a revenue range.');
      return;
    }
    if (activeSection === 2 && (!formData.jurisdictionsCovered || formData.jurisdictionsCovered < 1)) {
      setError('Please enter the number of jurisdictions (minimum 1).');
      return;
    }

    const pctError = validatePercentages(activeSection);
    if (pctError) { setError(pctError); return; }

    if (isLastStep) {
      // Confirm before overwriting an existing submission so the user
      // doesn't accidentally clobber their previous record.
      if (existingSubmittedAt) {
        const dateStr = new Date(existingSubmittedAt).toLocaleDateString();
        const ok = window.confirm(
          `This will replace your previous submission from ${dateStr}. Continue?`
        );
        if (!ok) return;
      }
      handleSubmit();
    } else {
      setStepIndex(i => clampStepIndex(i + 1, steps.length));
      window.scrollTo(0, 0);
    }
  };

  const handleBack = () => {
    if (stepIdx > 0) {
      setStepIndex(i => clampStepIndex(i - 1, steps.length));
      window.scrollTo(0, 0);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...formData,
        companyProfile: normalizeArrayField(formData.companyProfile as any),
        participationGoal: normalizeArrayField(formData.participationGoal as any),
      };
      const created = await createSubmissionMutation.mutateAsync(payload as any);
      localStorage.removeItem(DRAFT_KEY);
      // The DB trigger routes to 'waitlist' if the founding cohort is already
      // full — surface that instead of sending them to a locked Taxi.
      const wasWaitlisted = isWaitlisted(created as any);
      setWaitlisted(wasWaitlisted);
      setSubmitted(true);
      // AI-first flow: the reward for contributing is meeting your analyst,
      // not a charts page. Taxi's cache already has the fresh submission via
      // the mutation's invalidation, so the gate is open by the time we land.
      // Waitlisted users stay on the confirmation (nothing to unlock yet).
      if (!wasWaitlisted) setTimeout(() => navigate('/taxi'), 2000);
    } catch (e: any) {
      setError(e?.message || 'Failed to submit survey.');
      setIsSubmitting(false);
      // Scroll to top so the user sees the error banner instead of staring
      // at an unchanged Submit button.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // ── Sub-components ──────────────────────────────────────────────────────────

  const Tooltip = ({ field }: { field: string }) => {
    const text = SURVEY_TOOLTIPS[field];
    if (!text) return null;
    return (
      <span className="relative group inline-flex ml-1.5 align-middle">
        <Info className="h-3.5 w-3.5 text-gray-300 hover:text-indigo-500 cursor-help transition-colors" />
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs font-medium leading-relaxed rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </span>
      </span>
    );
  };

  const SumIndicator = ({ fields, label }: { fields: (keyof Submission)[], label: string }) => {
    const total = getGroupSum(fields);
    const isExact = Math.abs(total - 100) < 0.1;
    const isOver = total > 100.1;
    return (
      <div className="bg-gray-50 rounded-2xl p-4 mb-4 border border-gray-100">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{label} Validation</span>
          <span className={`text-sm font-black ${isExact ? 'text-green-600' : isOver ? 'text-red-600' : 'text-orange-500'}`}>
            {total}% / 100%
          </span>
        </div>
        <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${isExact ? 'bg-green-500' : isOver ? 'bg-red-500' : 'bg-orange-400'}`}
            style={{ width: `${Math.min(total, 100)}%` }}
          />
        </div>
      </div>
    );
  };

  const renderPercentInput = (label: string, field: keyof Submission) => (
    <div className="mb-4" key={field}>
      <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">{label}<Tooltip field={field} /></label>
      <input
        type="number"
        min={0}
        max={100}
        className="w-full rounded-xl border-gray-200 p-3 border font-bold text-sm focus:ring-primary focus:border-primary outline-none"
        value={(formData[field] as number) || ''}
        onChange={(e) => handleChange(field, Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
      />
    </div>
  );

  const renderInput = (label: string, field: keyof Submission, type: 'text' | 'number' = 'text') => (
    <div className="mb-4" key={field}>
      <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">{label}<Tooltip field={field} /></label>
      <input
        type={type}
        className="w-full rounded-xl border-gray-200 p-3 border font-bold text-sm focus:ring-primary focus:border-primary outline-none"
        value={(formData[field] as any) || ''}
        onChange={(e) => handleChange(field, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
      />
    </div>
  );

  const renderTextArea = (label: string, field: keyof Submission, placeholder = '') => (
    <div className="mb-4" key={field}>
      <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">{label}<Tooltip field={field} /></label>
      <textarea
        rows={3}
        placeholder={placeholder}
        className="w-full rounded-xl border-gray-200 p-3 border font-medium text-sm focus:ring-primary focus:border-primary outline-none resize-y"
        value={(formData[field] as any) || ''}
        onChange={(e) => handleChange(field, e.target.value)}
      />
    </div>
  );

  const renderSelect = (label: string, field: keyof Submission, options: Option[], required = false) => (
    <div className="mb-4" key={field}>
      <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">
        {label}{required && <span className="text-red-500 ml-1" aria-label="required">*</span>}<Tooltip field={field} />
      </label>
      <select
        className="w-full rounded-xl border-gray-200 p-3 border font-bold text-sm bg-white cursor-pointer outline-none"
        value={(formData[field] as string) || ''}
        onChange={(e) => handleChange(field, e.target.value)}
      >
        <option value="">Select Option...</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  const renderRadio = (label: string, field: keyof Submission, options: Option[], required = false) => (
    <div className="mb-6" key={field}>
      <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-4">
        {label}{required && <span className="text-red-500 ml-1" aria-label="required">*</span>}<Tooltip field={field} />
      </label>
      <div className="space-y-3">
        {options.map(o => (
          <button
            key={o.value}
            onClick={() => handleChange(field, o.value)}
            className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-3 ${formData[field] === o.value ? 'bg-indigo-50 border-primary text-primary' : 'bg-white border-gray-200 text-gray-600'}`}
          >
            <div className={`h-4 w-4 rounded-full border-2 flex-shrink-0 ${formData[field] === o.value ? 'border-primary bg-primary' : 'border-gray-300'}`} />
            <span className="text-sm font-bold">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderCheckbox = (label: string, field: keyof Submission, options: Option[], required = false) => {
    const selected = (formData[field] as string[]) || [];
    return (
      <div className="mb-6" key={field}>
        <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">
          {label}{required && <span className="text-red-500 ml-1" aria-label="required">*</span>}<Tooltip field={field} />
        </label>
        <p className="text-[11px] text-gray-400 mb-4">Select all that apply</p>
        <div className="space-y-3">
          {options.map(o => {
            const checked = selected.includes(o.value);
            return (
              <button
                key={o.value}
                onClick={() => toggleArrayValue(field, o.value)}
                className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-3 ${checked ? 'bg-indigo-50 border-primary text-primary' : 'bg-white border-gray-200 text-gray-600'}`}
              >
                <div className={`h-4 w-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${checked ? 'border-primary bg-primary' : 'border-gray-300'}`}>
                  {checked && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm font-bold">{o.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Success screen ──────────────────────────────────────────────────────────

  if (submitted && waitlisted) {
    return (
      <div className="max-w-3xl mx-auto py-24 px-4 flex flex-col items-center text-center">
        <div className="bg-amber-acc/10 border border-amber-acc/30 rounded-3xl p-12 shadow-xl">
          <CheckCircle2 className="h-16 w-16 text-amber-acc-2 mx-auto mb-6" />
          <h2 className="font-display text-2xl font-semibold text-gray-900">You're on the waitlist</h2>
          <p className="text-gray-500 mt-2 max-w-md">
            Thanks for contributing — the founding pilot cohort is full right
            now, so your submission is saved on the waitlist. We'll email you the
            moment a spot opens and your benchmarks + Taxi unlock. You can update
            your answers anytime in the meantime.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-3xl mx-auto py-24 px-4 flex flex-col items-center text-center">
        <div className="bg-green-50 border border-green-100 rounded-3xl p-12 shadow-xl">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-6" />
          <h2 className="font-display text-2xl font-semibold text-gray-900">Survey Submitted</h2>
          <p className="text-gray-500 mt-2 max-w-sm">
            Your responses are in — taking you to Taxi, your AI benchmark
            analyst. Ask it anything; you can refine your answers anytime.
          </p>
        </div>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  const currentSection = steps[stepIdx];

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 bg-gray-50 min-h-screen">

      {/* Founding-cohort scarcity banner + intro — shown on step 1 only */}
      {activeSection === 1 && (
        <div className="mb-8 space-y-4">
          <ParticipantCounter variant="banner" />
          <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-sm text-indigo-700 leading-relaxed">
            <p>
              <span className="font-black">Submit your best estimates on this first pass.</span>{' '}
              You can come back any time to refine your answers — every submission is editable
              after it lands, so each return visit makes your numbers more precise.
            </p>
            <p className="mt-2 text-indigo-600/80">
              Takes ~10 minutes. You'll need approximate FTE headcount, filing volumes, and
              automation levels. Your in-progress draft auto-saves so you can pause mid-survey.
            </p>
          </div>
        </div>
      )}

      <div className="mb-10 text-center">
        <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-semibold text-gray-900 tracking-tight">Benchmark Survey</h1>
        <p className="text-gray-500 text-sm mt-1">Step {stepIdx + 1} of {steps.length}</p>
        <div className="mt-6 w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
          <div className="bg-primary h-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {existingSubmittedAt && (
        <div className="mb-6 px-4 py-3 bg-amber-acc/10 border border-amber-acc/30 rounded-xl flex items-center gap-3 text-sm">
          <Info className="h-4 w-4 text-amber-acc-2 flex-shrink-0" />
          <span className="text-gray-700">
            Editing your submission from <strong>{new Date(existingSubmittedAt).toLocaleDateString()}</strong>
            {existingStatus && <> — current status: <strong className="capitalize">{existingStatus}</strong></>}
            . Submitting again replaces it with an updated entry that stays <strong>approved</strong> — your benchmark and Taxi refresh instantly.
          </span>
        </div>
      )}

      {error && (
        <div role="alert" aria-live="assertive" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 font-bold text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-xl border border-gray-100 min-h-[400px]">
        <h2 className="font-display text-2xl font-semibold text-gray-900 mb-2">{currentSection.title}</h2>
        <p className="text-gray-400 text-sm mb-8 pb-6 border-b border-gray-50">{currentSection.description}</p>

        {activeSection === 1 && (
          <div className="space-y-6">
            <div className="mb-4">
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">
                Company Name <span className="font-medium normal-case tracking-normal text-gray-400 lowercase ml-1">(optional)</span>
              </label>
              <input
                type="text"
                maxLength={120}
                placeholder="e.g. Acme Corp — leave blank to stay fully anonymous"
                className="w-full rounded-xl border-gray-200 p-3 border font-bold text-sm focus:ring-primary focus:border-primary outline-none"
                value={formData.companyName || ''}
                onChange={(e) => handleChange('companyName', e.target.value)}
              />
              <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                Used internally for admin tracking and to give you a friendlier experience. Never shown in peer comparisons or public analytics.
              </p>
            </div>
            {renderCheckbox("Company Profile", "companyProfile", C.OPTS_COMPANY_PROFILE, true)}
            {renderRadio("Your Role", "respondentRole", C.OPTS_RESPONDENT_ROLE, true)}
          </div>
        )}

        {activeSection === 2 && (
          <div className="space-y-6">
            {renderSelect("Industry", "industry", C.OPTS_INDUSTRY)}
            {renderSelect("Revenue Range", "revenueRange", C.OPTS_REVENUE, true)}
            <div className="mb-4">
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">
                Number of Countries/Jurisdictions You Operate In<span className="text-red-500 ml-1" aria-label="required">*</span><Tooltip field="jurisdictionsCovered" />
              </label>
              <input
                type="number"
                min={1}
                required
                className="w-full rounded-xl border-gray-200 p-3 border font-bold text-sm focus:ring-primary focus:border-primary outline-none"
                value={formData.jurisdictionsCovered || ''}
                onChange={(e) => handleChange('jurisdictionsCovered', Math.max(1, parseInt(e.target.value) || 0))}
              />
            </div>
          </div>
        )}

        {/* Sections 3 (governance) and 7 (data ecosystem) were removed in the
            2026-06 "minimum contribution" trim — no chart/filter consumed
            their fields. Section ids stay stable; those questions are
            candidates for progressive collection via future refresh prompts. */}

        {activeSection === 4 && (
          <div className="space-y-8">
            <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100">
              <h3 className="text-xs font-black text-indigo-900 uppercase tracking-widest mb-4">Technology Resources</h3>
              {renderSelect("Internal Tech FTEs", "taxTechFTEsRange", C.OPTS_FTE_TECH)}
              {renderSelect("External Tech Support", "taxTechOutsourcedResourcesFTEsRange", C.OPTS_FTE_TECH)}
            </div>
            {showsTechBudget(formData.respondentRole) &&
              renderRadio("Total Annual Budget for Tax Technology (licenses + internal + external)", "annualTaxTechBudgetRange", C.OPTS_BUDGET_RANGE)}
            <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-4">Business Resources</h3>
              {renderSelect("Internal Business FTEs", "taxBusinessFTEsRange", C.OPTS_FTE_BUSINESS)}
              {renderSelect("Business BPO Support", "taxBusinessOutsourcingFTEsRange", C.OPTS_FTE_BUSINESS)}
            </div>
          </div>
        )}

        {activeSection === 5 && (
          <div className="space-y-8">
            {/* The Business Specialization grid was removed (2026-06: fed no
                analytics and was the survey's highest-friction question).
                Section 5 is tech-only in the role-branched flow. */}
            <div>
              <SumIndicator
                label="Tech Skill Mix"
                fields={['taxTechSkillMixFrontendPercent', 'taxTechSkillMixBackendPercent', 'taxTechSkillMixDataEngineeringPercent', 'taxTechSkillMixDevOpsPercent', 'taxTechSkillMixOtherPercent']}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {renderPercentInput("Frontend %", "taxTechSkillMixFrontendPercent")}
                {renderPercentInput("Backend %", "taxTechSkillMixBackendPercent")}
                {renderPercentInput("Data Engineering %", "taxTechSkillMixDataEngineeringPercent")}
                {renderPercentInput("DevOps %", "taxTechSkillMixDevOpsPercent")}
                {renderPercentInput("Other %", "taxTechSkillMixOtherPercent")}
              </div>
            </div>
          </div>
        )}

        {activeSection === 6 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderSelect("Calculation Auto", "taxCalculationAutomationRange", C.OPTS_AUTOMATION)}
            {renderSelect("Payment Auto", "taxPaymentAutomationRange", C.OPTS_AUTOMATION)}
            {renderSelect("VAT / Sales Tax Compliance Automation", "vatSalesTaxAutomationRange", C.OPTS_AUTOMATION)}
            {renderSelect("E-Invoicing & Digital Reporting Automation", "eInvoicingAutomationRange", C.OPTS_AUTOMATION)}
            {renderSelect("Withholding Tax Automation", "withholdingTaxAutomationRange", C.OPTS_AUTOMATION)}
            {renderSelect("Customs & Duties Automation", "customsDutiesAutomationRange", C.OPTS_AUTOMATION)}
            {renderSelect("Compliance Automation Coverage", "complianceAutomationCoverageRange", C.OPTS_AUTOMATION)}
          </div>
        )}

        {activeSection === 8 && (
          <div className="space-y-6">
            {/* Data Architecture moved here from the removed Section 7 — it's
                the one data-ecosystem field the Report charts consume. */}
            {renderRadio("Data Architecture", "taxDataArchitecture", C.OPTS_TAX_DATA_ARCH)}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderSelect("Arch Pattern", "architecturePattern", C.OPTS_ARCH_PATTERN)}
              {renderSelect("Data Flow", "dataFlow", C.OPTS_DATA_FLOW)}
              {renderSelect("Cloud", "cloudProvider", C.OPTS_CLOUD)}
              {renderSelect("Dev Stack", "primaryProgrammingLanguages", C.OPTS_LANGUAGES)}
            </div>
          </div>
        )}

        {activeSection === 9 && (
          <div className="space-y-6">
            {/* The regulatory radios and financial-close numbers were removed
                in the 2026-06 trims — no analytics consumed them, and the
                close-cycle questions were the hardest to answer accurately. */}
            <div className="bg-green-50/50 p-6 rounded-2xl border border-green-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-green-900">GenAI Integration<Tooltip field="aiAdopted" /></p>
                <p className="text-xs text-green-700">Have you deployed LLM tools?</p>
              </div>
              <button
                onClick={() => handleChange('aiAdopted', !formData.aiAdopted)}
                className={`w-14 h-8 rounded-full p-1 transition-all ${formData.aiAdopted ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <div className={`w-6 h-6 bg-white rounded-full transition-all ${formData.aiAdopted ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
            {formData.aiAdopted && renderSelect("Maturity Phase", "genAIAdoptionStage", C.OPTS_GENAI_STAGE)}
            {formData.aiAdopted && renderTextArea("AI Use Cases", "aiUseCases", "e.g. tax research, document extraction, anomaly detection (comma-separated)")}
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-col-reverse sm:flex-row justify-between gap-3">
        <button
          onClick={handleBack}
          disabled={stepIdx === 0}
          className="w-full sm:w-auto px-6 py-3 bg-white border rounded-xl font-bold flex items-center gap-2 hover:bg-gray-50 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <button
          onClick={handleNext}
          disabled={isSubmitting}
          className="w-full sm:w-auto px-10 py-3 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-900 shadow-xl shadow-primary/20 active:scale-[0.98] transition-transform disabled:opacity-70 disabled:cursor-wait disabled:hover:bg-primary"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {existingSubmittedAt ? 'Updating…' : 'Submitting…'}
            </>
          ) : (
            <>
              {isLastStep
                ? (existingSubmittedAt ? 'Update Submission' : 'Submit')
                : 'Continue'}
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default Survey;
