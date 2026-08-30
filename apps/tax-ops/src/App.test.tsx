import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('TaxBrains tax operations landing surface', () => {
  it('positions compliance close as the first workflow', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Close indirect tax with an evidence trail.',
    );
    expect(screen.getByText('From exports to review-ready workpapers')).toBeTruthy();
    expect(screen.getByText(/People approve the result/)).toBeTruthy();
  });

  it('keeps taxbenchmark as the community and acquisition layer', () => {
    render(<App />);

    const communityLinks = screen.getAllByRole('link').filter(
      (link) => link.getAttribute('href') === 'https://taxbenchmark.ai',
    );
    expect(communityLinks.length).toBeGreaterThanOrEqual(2);
  });
});
