import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Survey from './Survey';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/api', () => ({
  api: {
    createSubmission: vi.fn(),
    // Default: no existing submission so the form starts blank in most tests.
    // Tests that need an existing submission can override per-test.
    getMySubmission: vi.fn().mockResolvedValue(null),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.stubGlobal('scrollTo', vi.fn());

// ─── Helpers ──────────────────────────────────────────────────────────────────

const { api } = await import('../services/api');

const renderSurvey = () => {
  const user = userEvent.setup();
  // Fresh QueryClient per render so tests don't share cache state.
  // retry: false makes mutation/query failures surface immediately instead of
  // waiting for retries to play out under fake or sped-up time.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Survey />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return user;
};

/**
 * Navigate from section 1 to the given target section using fast fireEvent
 * (not userEvent) to keep test execution time short.
 * Fills the minimum required fields along the way.
 */
function goToSection(target: number) {
  for (let current = 1; current < target; current++) {
    if (current === 1) {
      // Section 1: select at least one company profile (required)
      fireEvent.click(screen.getByText('Public company'));
      // Section 1: respondentRole is required
      fireEvent.click(screen.getByText('Tax Technology'));
    }
    if (current === 2) {
      // Section 2: Revenue Range is required — it is the second <select>
      const selects = screen.getAllByRole('combobox');
      fireEvent.change(selects[1], { target: { value: '100m_500m' } });
      // Section 2: jurisdictionsCovered is required (min 1)
      const numberInputs = screen.getAllByRole('spinbutton');
      fireEvent.change(numberInputs[0], { target: { value: '5' } });
    }
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

// ─── Section 1 rendering ──────────────────────────────────────────────────────

describe('Section 1 — Benchmarking Context', () => {
  it('renders the section title and intro banner', () => {
    renderSurvey();
    expect(screen.getByText('Benchmarking Context')).toBeTruthy();
    expect(screen.getByText(/Takes ~10 minutes/)).toBeTruthy();
  });

  it('renders Company Profile options as checkboxes (multi-select buttons)', () => {
    renderSurvey();
    expect(screen.getByText('Public company')).toBeTruthy();
    expect(screen.getByText('Multinational')).toBeTruthy();
    expect(screen.getByText('Private / PE-backed')).toBeTruthy();
  });

  it('shows "Select all that apply" hint for Company Profile', () => {
    renderSurvey();
    expect(screen.getAllByText('Select all that apply').length).toBeGreaterThan(0);
  });

  it('allows selecting multiple company profile options', () => {
    renderSurvey();
    fireEvent.click(screen.getByText('Public company'));
    fireEvent.click(screen.getByText('Multinational'));
    fireEvent.click(screen.getByText('Tax Technology'));
    // Both selected + role selected — Continue should advance to section 2
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(screen.getByText('Organizational Profile')).toBeTruthy();
  });

  it('deselects an option when clicked a second time', () => {
    renderSurvey();
    fireEvent.click(screen.getByText('Public company')); // select
    fireEvent.click(screen.getByText('Public company')); // deselect
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(screen.getByText(/Please select at least one company profile/)).toBeTruthy();
  });

  it('blocks Next and shows error when Company Profile is empty', () => {
    renderSurvey();
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(screen.getByText(/Please select at least one company profile/)).toBeTruthy();
    expect(screen.getByText('Benchmarking Context')).toBeTruthy();
  });

  it('marks Company Profile as required with an asterisk', () => {
    renderSurvey();
    // The required marker is a <span aria-label="required">
    const requiredMarkers = document.querySelectorAll('[aria-label="required"]');
    expect(requiredMarkers.length).toBeGreaterThan(0);
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────────

describe('Navigation', () => {
  it('Back button is disabled on section 1', () => {
    renderSurvey();
    // Use exact name to avoid matching "Private / PE-backed" checkbox button
    const backBtn = screen.getByRole('button', { name: /^Back$/i }) as HTMLButtonElement;
    expect(backBtn.disabled).toBe(true);
  });

  it('advances to section 2 after completing section 1', () => {
    renderSurvey();
    goToSection(2);
    expect(screen.getByText('Organizational Profile')).toBeTruthy();
  });

  it('goes back to section 1 from section 2', () => {
    renderSurvey();
    goToSection(2);
    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }));
    expect(screen.getByText('Benchmarking Context')).toBeTruthy();
  });

  it('calls window.scrollTo(0,0) when advancing sections', () => {
    renderSurvey();
    goToSection(2); // includes one Continue click
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('calls window.scrollTo(0,0) when going back', () => {
    renderSurvey();
    goToSection(2);
    vi.clearAllMocks();
    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }));
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('shows "Submit" on the last section instead of "Continue"', () => {
    renderSurvey();
    goToSection(9);
    expect(screen.getByRole('button', { name: /^Submit$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Continue$/i })).toBeNull();
  });

  it('progress bar advances with each section', () => {
    renderSurvey();
    expect(screen.getByText('Step 1 of 9')).toBeTruthy();
    goToSection(2);
    expect(screen.getByText('Step 2 of 9')).toBeTruthy();
  });
});

// ─── Section 2 validation ─────────────────────────────────────────────────────

describe('Section 2 — Revenue Range required', () => {
  it('blocks Next and shows error when revenue range is not selected', () => {
    renderSurvey();
    goToSection(2);
    // Don't select revenue range — just click Continue
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(screen.getByText(/Please select a revenue range/)).toBeTruthy();
  });

  it('marks Revenue Range as required with an asterisk', () => {
    renderSurvey();
    goToSection(2);
    const allRequiredMarkers = document.querySelectorAll('[aria-label="required"]');
    expect(allRequiredMarkers.length).toBeGreaterThan(0);
  });
});

// ─── Section 5 percentage validation ─────────────────────────────────────────

describe('Section 5 — Percentage validation', () => {
  it('blocks Next when tech skill percentages do not sum to 100', () => {
    renderSurvey();
    goToSection(5);
    const [frontend] = screen.getAllByRole('spinbutton');
    fireEvent.change(frontend, { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(screen.getByText(/must sum to exactly 100%/i)).toBeTruthy();
  });

  it('allows Next when all percentages are zero (optional fields)', () => {
    renderSurvey();
    goToSection(5);
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(screen.getByText('Process Maturity & Automation')).toBeTruthy();
  });

  it('allows Next when tech skill percentages sum exactly to 100', () => {
    renderSurvey();
    goToSection(5);
    const inputs = screen.getAllByRole('spinbutton');
    // Assign 20% to each of the 5 tech skill fields
    for (let i = 0; i < 5; i++) {
      fireEvent.change(inputs[i], { target: { value: '20' } });
    }
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(screen.getByText('Process Maturity & Automation')).toBeTruthy();
  });

  it('renders the Other % input for both tech and business groups', () => {
    renderSurvey();
    goToSection(5);
    const otherLabels = screen.getAllByText('Other %');
    expect(otherLabels).toHaveLength(2);
  });
});

// ─── localStorage autosave & restore ─────────────────────────────────────────

describe('localStorage autosave and restore', () => {
  it('saves progress to localStorage on interaction', () => {
    renderSurvey();
    fireEvent.click(screen.getByText('Public company'));
    const saved = JSON.parse(localStorage.getItem('taxtech_survey_draft') || '{}');
    expect(saved.companyProfile).toContain('public');
  });

  it('restores saved progress from localStorage on mount', () => {
    // Pre-populate with valid companyProfile + respondentRole
    localStorage.setItem('taxtech_survey_draft', JSON.stringify({
      companyProfile: ['public', 'multinational'],
      respondentRole: 'tax_professionals',
    }));
    renderSurvey();
    // The stored state has required fields set, so Continue should pass section 1
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(screen.getByText('Organizational Profile')).toBeTruthy();
  });

  it('clears the localStorage draft after successful submission', async () => {
    vi.mocked(api.createSubmission).mockResolvedValueOnce({ id: 's1' } as any);

    const user = renderSurvey();
    // Use fireEvent to navigate to section 9 quickly
    goToSection(9);

    // Confirm draft exists before submit
    expect(localStorage.getItem('taxtech_survey_draft')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: /^Submit$/i }));

    await waitFor(() => {
      expect(localStorage.getItem('taxtech_survey_draft')).toBeNull();
    });
  });
});

// ─── Form submission ──────────────────────────────────────────────────────────

describe('Form submission', () => {
  it('calls api.createSubmission with arrays for companyProfile and participationGoal', async () => {
    vi.mocked(api.createSubmission).mockResolvedValueOnce({ id: 's1' } as any);
    const user = renderSurvey();

    // Navigate to section 9 (goToSection selects 'Public company' in section 1)
    goToSection(9);
    await user.click(screen.getByRole('button', { name: /^Submit$/i }));

    await waitFor(() => expect(api.createSubmission).toHaveBeenCalled());
    const payload = vi.mocked(api.createSubmission).mock.calls[0][0] as any;

    // Core regression test: these must be arrays, never plain strings
    expect(Array.isArray(payload.companyProfile)).toBe(true);
    expect(Array.isArray(payload.participationGoal)).toBe(true);
    expect(payload.companyProfile).toContain('public');
  });

  it('shows the in-app success screen after a successful submission', async () => {
    vi.mocked(api.createSubmission).mockResolvedValueOnce({ id: 's1' } as any);
    const user = renderSurvey();
    goToSection(9);
    await user.click(screen.getByRole('button', { name: /^Submit$/i }));
    await waitFor(() => expect(screen.getByText('Survey Submitted')).toBeTruthy());
  });

  it('shows an error message when submission fails', async () => {
    vi.mocked(api.createSubmission).mockRejectedValueOnce(new Error('Network error'));
    const user = renderSurvey();
    goToSection(9);
    await user.click(screen.getByRole('button', { name: /^Submit$/i }));
    await waitFor(() => expect(screen.getByText(/Network error/i)).toBeTruthy());
  });

  it('stays on the survey form when submission fails (does not show success screen)', async () => {
    vi.mocked(api.createSubmission).mockRejectedValueOnce(new Error('DB error'));
    const user = renderSurvey();
    goToSection(9);
    await user.click(screen.getByRole('button', { name: /^Submit$/i }));
    await waitFor(() => expect(screen.getByText(/DB error/i)).toBeTruthy());
    // The success screen must NOT appear
    expect(screen.queryByText('Survey Submitted')).toBeNull();
    // The form is still rendered
    expect(screen.getByRole('button', { name: /^Submit$/i })).toBeTruthy();
  });
});

// ─── Prefill race protection ──────────────────────────────────────────────────
//
// When the user revisits /survey, the form prefills from their existing
// submission. With React Query (PR #57), the cache fetch is async — could
// take 200ms+ on slow networks. If the user starts typing immediately on
// page load, we must NOT clobber their input when the prefill resolves.
// The userEditedRef guard inside Survey.tsx handles this; these tests pin
// down the contract.

describe('Prefill race protection', () => {
  it('prefills from existing submission when user has not typed yet', async () => {
    const existing = {
      id: 'sub-1',
      userId: 'u-1',
      userName: 'Alice',
      status: 'approved',
      submittedAt: '2026-04-01T00:00:00Z',
      companyName: 'Acme Corp',
      companyProfile: ['public'],
      participationGoal: [],
      respondentRole: 'tax_technology',
      ownedTaxFunctions: [],
      organizationScope: '',
      revenueRange: '',
      aiAdopted: false,
    };
    vi.mocked(api.getMySubmission).mockResolvedValueOnce(existing as any);

    renderSurvey();

    // Wait for the async prefill to resolve and update the input.
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/leave blank to stay fully anonymous/i) as HTMLInputElement;
      expect(input.value).toBe('Acme Corp');
    });
  });

  it('does NOT clobber user input if they typed before prefill resolved', async () => {
    // Simulate a slow server: getMySubmission resolves only when we choose to.
    let resolveExisting: (sub: any) => void = () => {};
    vi.mocked(api.getMySubmission).mockImplementationOnce(
      () => new Promise(r => { resolveExisting = r; })
    );

    renderSurvey();

    // User types BEFORE the server responds.
    const input = screen.getByPlaceholderText(/leave blank to stay fully anonymous/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'My Co' } });
    expect(input.value).toBe('My Co');

    // NOW the server response arrives with different data.
    await act(async () => {
      resolveExisting({
        id: 'sub-1', userId: 'u-1', userName: 'Alice',
        status: 'approved', submittedAt: '2026-04-01T00:00:00Z',
        companyName: 'Acme Corp (server)',
        companyProfile: [], participationGoal: [], respondentRole: '',
        ownedTaxFunctions: [], organizationScope: '', revenueRange: '',
        aiAdopted: false,
      });
      // Yield so promise then-callbacks + effects run.
      await Promise.resolve();
    });

    // The user's typed value MUST survive — the prefill should have detected
    // the user-edited state and skipped the overwrite.
    expect(input.value).toBe('My Co');
  });

  it('does not prefill when localStorage already has a draft', async () => {
    // Pre-existing draft from a prior session.
    localStorage.setItem('taxtech_survey_draft', JSON.stringify({
      ...{ companyProfile: [], participationGoal: [], respondentRole: '',
           ownedTaxFunctions: [], organizationScope: '', revenueRange: '',
           aiAdopted: false },
      companyName: 'Draft Co',
    }));

    vi.mocked(api.getMySubmission).mockResolvedValueOnce({
      id: 'sub-1', userId: 'u-1', userName: 'Alice',
      status: 'approved', submittedAt: '2026-04-01T00:00:00Z',
      companyName: 'Server Co',
      companyProfile: [], participationGoal: [], respondentRole: '',
      ownedTaxFunctions: [], organizationScope: '', revenueRange: '',
      aiAdopted: false,
    } as any);

    renderSurvey();

    // Draft wins — never overwritten by the server fetch.
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/leave blank to stay fully anonymous/i) as HTMLInputElement;
      expect(input.value).toBe('Draft Co');
    });
  });
});
