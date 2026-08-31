import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import App from './App';

function renderRoute(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
}

describe('TaxBrains unified product surface', () => {
  it('positions compliance close as the first workflow', () => {
    renderRoute('/');

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Close indirect tax with an evidence trail.',
    );
    expect(screen.getByText('From exports to review-ready workpapers')).toBeTruthy();
    expect(screen.getByText(/People approve the result/)).toBeTruthy();
  });

  it('explains the staged automation product', () => {
    renderRoute('/automation');

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Automate the monthly tax close first.',
    );
    expect(screen.getByRole('heading', { name: 'Audit and notice response' })).toBeTruthy();
  });

  it('documents the controlled compliance workflow', () => {
    renderRoute('/automation/compliance');

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Turn source exports into a reviewable close.',
    );
    expect(screen.getByText('Six stages, one evidence chain')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Discuss a compliance pilot' }).getAttribute('href'),
    ).toContain('mailto:hello@taxbrains.ai');
  });

  it('keeps taxbenchmark as a separate community layer', () => {
    renderRoute('/benchmark');

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Know where tax operations stand',
    );
    expect(screen.getByRole('link', { name: 'Visit taxbenchmark.ai' }).getAttribute('href')).toBe(
      'https://taxbenchmark.ai',
    );
  });

  it('renders an explicit not-found route', () => {
    renderRoute('/not-a-real-page');

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'This page is not part of the close.',
    );
  });
});
