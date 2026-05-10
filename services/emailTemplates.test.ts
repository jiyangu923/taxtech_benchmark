import { describe, it, expect } from 'vitest';
import { renderReminderEmail } from './emailTemplates';

const baseInput = { name: 'Jane Doe', siteUrl: 'https://taxbenchmark.ai' };

describe('renderReminderEmail — incomplete', () => {
  const out = renderReminderEmail('incomplete', baseInput);

  it('subject includes first name and clear action', () => {
    expect(out.subject).toContain('Jane');
    expect(out.subject.toLowerCase()).toContain('benchmark');
  });

  it('text and html greet by first name', () => {
    expect(out.text).toContain('Hi Jane,');
    expect(out.html).toContain('Jane');
  });

  it('CTA points at /#/survey', () => {
    expect(out.text).toContain('https://taxbenchmark.ai/#/survey');
    expect(out.html).toContain('href="https://taxbenchmark.ai/#/survey"');
  });

  it('includes an unsubscribe path to /#/profile', () => {
    expect(out.text).toContain('/#/profile');
    expect(out.html).toContain('/#/profile');
  });

  it('html starts with a doctype and contains inline styles', () => {
    expect(out.html.toLowerCase()).toMatch(/^\s*<!doctype html>/);
    expect(out.html).toContain('style=');
    expect(out.html).not.toMatch(/<style>/i);
  });
});

describe('renderReminderEmail — stale', () => {
  it('mentions the days-since count when lastSubmittedAt is provided', () => {
    const fortyDaysAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
    const out = renderReminderEmail('stale', { ...baseInput, lastSubmittedAt: fortyDaysAgo });
    // Match a phrase like "95 days ago" or close — accept any 9x
    expect(out.text).toMatch(/9\d days ago/);
  });

  it('uses a generic phrase when lastSubmittedAt is missing', () => {
    const out = renderReminderEmail('stale', { ...baseInput, lastSubmittedAt: null });
    expect(out.text).toContain('quarter');
  });

  it('still points at /#/survey to refresh', () => {
    const out = renderReminderEmail('stale', baseInput);
    expect(out.text).toContain('/#/survey');
  });
});

describe('renderReminderEmail — outdated', () => {
  it('mentions new questions / pre-fill', () => {
    const out = renderReminderEmail('outdated', baseInput);
    expect(out.text.toLowerCase()).toContain('new questions');
    expect(out.text.toLowerCase()).toContain('pre-filled');
  });

  it('subject communicates a survey update', () => {
    const out = renderReminderEmail('outdated', baseInput);
    expect(out.subject.toLowerCase()).toContain('updated');
  });
});

describe('first-name fallback', () => {
  it('falls back to "there" when name is empty', () => {
    const out = renderReminderEmail('incomplete', { ...baseInput, name: '' });
    expect(out.text).toContain('Hi there,');
  });

  it('uses only the first token of multi-word names', () => {
    const out = renderReminderEmail('incomplete', { ...baseInput, name: 'José María del Carmen' });
    expect(out.text).toContain('Hi José,');
  });
});

describe('siteUrl handling', () => {
  it('joins paths without double slashes', () => {
    const out = renderReminderEmail('incomplete', { name: 'X', siteUrl: 'https://taxbenchmark.ai' });
    expect(out.text).not.toContain('//#/');
    expect(out.text).toContain('https://taxbenchmark.ai/#/survey');
  });
});
