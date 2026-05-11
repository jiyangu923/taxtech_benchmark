import { describe, it, expect } from 'vitest';
import {
  filterBroadcastRecipients,
  isBroadcastRecipient,
  fmtWeekOf,
  renderEmailShell,
  plainTextFallback,
  markdownToHtml,
  RecipientProfile,
} from '../../../api/admin/send-release-letter';

const profile = (overrides: Partial<RecipientProfile> = {}): RecipientProfile => ({
  id: 'u',
  name: 'User',
  email: 'u@x.com',
  role: 'user',
  email_reminders_enabled: true,
  ...overrides,
});

describe('isBroadcastRecipient', () => {
  it('accepts a normal opted-in user', () => {
    expect(isBroadcastRecipient(profile())).toBe(true);
  });

  it('accepts users with email_reminders_enabled=null (default opt-in)', () => {
    expect(isBroadcastRecipient(profile({ email_reminders_enabled: null }))).toBe(true);
  });

  it('rejects users with email_reminders_enabled=false', () => {
    expect(isBroadcastRecipient(profile({ email_reminders_enabled: false }))).toBe(false);
  });

  it('rejects admins regardless of opt-in flag', () => {
    expect(isBroadcastRecipient(profile({ role: 'admin' }))).toBe(false);
    expect(isBroadcastRecipient(profile({ role: 'admin', email_reminders_enabled: true }))).toBe(false);
  });

  it('rejects rows with missing or malformed email', () => {
    expect(isBroadcastRecipient(profile({ email: '' }))).toBe(false);
    expect(isBroadcastRecipient(profile({ email: 'not-an-email' }))).toBe(false);
  });
});

describe('filterBroadcastRecipients', () => {
  it('keeps only opted-in non-admin users', () => {
    const profiles: RecipientProfile[] = [
      profile({ id: 'a', email: 'a@x.com' }),
      profile({ id: 'b', email: 'b@x.com', role: 'admin' }),
      profile({ id: 'c', email: 'c@x.com', email_reminders_enabled: false }),
      profile({ id: 'd', email: 'd@x.com', email_reminders_enabled: null }),
    ];
    const out = filterBroadcastRecipients(profiles).map(p => p.id);
    expect(out).toEqual(['a', 'd']);
  });

  it('returns empty array for empty input', () => {
    expect(filterBroadcastRecipients([])).toEqual([]);
  });

  it('returns empty array when every user is filtered out', () => {
    const profiles: RecipientProfile[] = [
      profile({ id: 'a', role: 'admin' }),
      profile({ id: 'b', email_reminders_enabled: false }),
    ];
    expect(filterBroadcastRecipients(profiles)).toEqual([]);
  });
});

describe('fmtWeekOf', () => {
  it('formats YYYY-MM-DD as "Week of Month D, YYYY"', () => {
    expect(fmtWeekOf('2026-05-04')).toBe('Week of May 4, 2026');
  });

  it('handles single-digit days without zero padding', () => {
    expect(fmtWeekOf('2026-01-01')).toBe('Week of January 1, 2026');
  });

  it('returns the raw string for malformed input', () => {
    expect(fmtWeekOf('not-a-date')).toBe('not-a-date');
  });
});

describe('renderEmailShell', () => {
  it('includes title, formatted week_of, and body html', () => {
    const out = renderEmailShell({
      title: 'Shipped this week',
      weekOf: '2026-05-04',
      bodyHtml: '<p>hi</p>',
      siteUrl: 'https://taxbenchmark.ai',
    });
    expect(out).toContain('Shipped this week');
    expect(out).toContain('Week of May 4, 2026');
    expect(out).toContain('<p>hi</p>');
  });

  it('escapes a malicious title (no raw <script>)', () => {
    const out = renderEmailShell({
      title: '<script>alert(1)</script>',
      weekOf: '2026-05-04',
      bodyHtml: '',
      siteUrl: 'https://taxbenchmark.ai',
    });
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('includes the test banner ONLY when testBanner is set', () => {
    const broadcast = renderEmailShell({
      title: 't', weekOf: '2026-05-04', bodyHtml: '', siteUrl: 'https://x',
    });
    const test = renderEmailShell({
      title: 't', weekOf: '2026-05-04', bodyHtml: '', siteUrl: 'https://x', testBanner: true,
    });
    expect(broadcast).not.toContain('Test send');
    expect(test).toContain('Test send');
  });

  it('includes an unsubscribe link to /#/profile', () => {
    const out = renderEmailShell({
      title: 't', weekOf: '2026-05-04', bodyHtml: '', siteUrl: 'https://taxbenchmark.ai',
    });
    expect(out).toContain('https://taxbenchmark.ai/#/profile');
  });
});

describe('plainTextFallback', () => {
  it('strips markdown marks for the text/* part', () => {
    const md = '# Heading\n\nSome **bold** and *italic* and `code` text.\n\n- one\n- two';
    const out = plainTextFallback('Title', '2026-05-04', md, 'https://x');
    expect(out).not.toContain('**');
    expect(out).not.toContain('`');
    expect(out).toContain('Some bold and italic and code text.');
  });

  it('replaces image markdown with [image]', () => {
    const out = plainTextFallback('t', '2026-05-04', '![cap](https://x.test/a.png)', 'https://x');
    expect(out).toContain('[image]');
    expect(out).not.toContain('https://x.test/a.png');
  });

  it('keeps link text and URL together', () => {
    const out = plainTextFallback('t', '2026-05-04', 'see [docs](https://example.com)', 'https://x');
    expect(out).toContain('docs (https://example.com)');
  });

  it('always includes the manage-preferences URL', () => {
    const out = plainTextFallback('t', '2026-05-04', 'body', 'https://taxbenchmark.ai');
    expect(out).toContain('https://taxbenchmark.ai/#/profile');
  });
});

describe('inlined markdownToHtml (parity check)', () => {
  // We duplicate the renderer in the serverless file; this guards against
  // accidental drift from services/markdown.ts on a basic-features sanity check.
  it('renders a heading + bold + list combo', () => {
    const out = markdownToHtml('# Title\n\nIntro **bold**.\n\n- one\n- two');
    expect(out).toContain('<h1');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<ul');
    expect(out.match(/<li/g)).toHaveLength(2);
  });

  it('escapes HTML in markdown source', () => {
    expect(markdownToHtml('<img onerror=alert(1)>')).not.toContain('<img onerror');
  });
});
