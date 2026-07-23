import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock ONLY the network round trip; everything else (merge, completion,
// payload) runs real. This suite exists because the adversarial review found
// the original error path lost the user's typed answer — the exact regression
// these tests pin.
vi.mock('../services/intake', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/intake')>();
  return { ...actual, runIntakeTurn: vi.fn() };
});

import { runIntakeTurn, EMPTY_EXTRACTED, INTAKE_GREETING } from '../services/intake';
import { IntakeExperience } from './Taxi';

const mockedRun = vi.mocked(runIntakeTurn);

// jsdom has no scrollIntoView; the component calls it on every turn change.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('IntakeExperience (error-path regressions)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockedRun.mockReset();
  });

  it('renders the greeting with an empty transcript', () => {
    render(<IntakeExperience userId="u1" onDone={vi.fn()} />);
    expect(screen.getByText(new RegExp('what kind of company', 'i'))).toBeTruthy();
    expect(INTAKE_GREETING).toContain('anonymous');
  });

  it('P1 regression: a failed turn keeps the typed answer visible and Retry works', async () => {
    const user = userEvent.setup();
    mockedRun.mockRejectedValueOnce(new Error('Daily limit reached.'));
    render(<IntakeExperience userId="u1" onDone={vi.fn()} />);

    await user.type(screen.getByLabelText('Your answer'), 'we are a public multinational');
    await user.click(screen.getByLabelText('Send'));

    // The answer must STAY in the transcript despite the failure…
    expect(await screen.findByText('we are a public multinational')).toBeTruthy();
    // …the server's message surfaces…
    expect(screen.getByRole('alert').textContent).toContain('Daily limit reached.');
    // …and Retry is live: it reruns the SAME turns and renders the reply.
    mockedRun.mockResolvedValueOnce({
      reply: 'Got it — and your role?', acc: { ...EMPTY_EXTRACTED, companyProfile: ['public', 'multinational'] }, complete: false,
    });
    await user.click(screen.getByText('Retry'));
    expect(await screen.findByText('Got it — and your role?')).toBeTruthy();
    expect(mockedRun).toHaveBeenCalledTimes(2);
    expect(mockedRun.mock.calls[1][0]).toEqual(mockedRun.mock.calls[0][0]); // same turns rerun
  });

  it('a reloaded draft ending on an unsent user turn offers Retry (no error state survives reloads)', () => {
    localStorage.setItem('taxtech_intake_draft_v1:u1', JSON.stringify({
      turns: [{ role: 'user', content: 'about 200 million' }],
      acc: EMPTY_EXTRACTED,
    }));
    render(<IntakeExperience userId="u1" onDone={vi.fn()} />);
    expect(screen.getByText('about 200 million')).toBeTruthy();
    expect(screen.getByText(new RegExp("wasn't sent", 'i'))).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('drafts are per-user: another account never inherits the transcript', () => {
    localStorage.setItem('taxtech_intake_draft_v1:u1', JSON.stringify({
      turns: [{ role: 'user', content: 'user ones private answer' }],
      acc: EMPTY_EXTRACTED,
    }));
    render(<IntakeExperience userId="u2" onDone={vi.fn()} />);
    expect(screen.queryByText('user ones private answer')).toBeNull();
  });

  it('refresh mode: seeded chips, refresh greeting, Save label, cancellable', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const seed = {
      ...EMPTY_EXTRACTED,
      companyProfile: ['public'], respondentRole: 'tax_technology',
      revenueRange: '500m_5b', jurisdictionsCovered: 12,
    };
    render(<IntakeExperience userId="u3" refresh seed={seed} prevSubmission={null} onCancel={onCancel} onDone={vi.fn()} />);
    // Refresh greeting, not the fresh-intake one:
    expect(screen.getByText(new RegExp("Welcome back", 'i'))).toBeTruthy();
    // Seeded record renders as chips and the save button is immediately available:
    expect(screen.getByTestId('intake-chips').textContent).toContain('12 jurisdictions');
    expect(screen.getByText('Save my updates')).toBeTruthy();
    // Cancellable (the gated intake has no X; refresh must):
    await user.click(screen.getByLabelText('Cancel update'));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
