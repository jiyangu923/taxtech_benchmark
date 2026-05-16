import { describe, it, expect } from 'vitest';
import {
  escapeHtml, fmtExpiresAt, renderInviteHtml, renderInviteText,
} from '../../../api/admin/send-community-invite';

describe('send-community-invite · escapeHtml', () => {
  it('escapes the six danger characters', () => {
    expect(escapeHtml('<script>alert("x")</script>'))
      .toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('escapes apostrophes and ampersands', () => {
    expect(escapeHtml("Tom & Jerry's")).toBe('Tom &amp; Jerry&#39;s');
  });

  it('passes plain text through unchanged', () => {
    expect(escapeHtml('Hello world')).toBe('Hello world');
  });
});

describe('send-community-invite · fmtExpiresAt', () => {
  it('formats a valid ISO timestamp as a long UTC date', () => {
    const formatted = fmtExpiresAt('2026-05-23T18:00:00.000Z');
    expect(formatted).toBe('May 23, 2026');
  });

  it('returns the raw input on parse failure', () => {
    expect(fmtExpiresAt('not a date')).toBe('not a date');
  });
});

const SAMPLE = {
  memberName: 'Ada Lovelace',
  confirmUrl: 'https://taxbenchmark.ai/#/confirm-member?token=abc',
  declineUrl: 'https://taxbenchmark.ai/#/confirm-member?token=abc&decline=1',
  siteUrl: 'https://taxbenchmark.ai',
  expiresAt: '2026-05-23T18:00:00.000Z',
};

describe('send-community-invite · renderInviteHtml', () => {
  it('includes the recipient name (escaped)', () => {
    const out = renderInviteHtml({ ...SAMPLE, memberName: 'Tom <Jerry>' });
    expect(out).toContain('Tom &lt;Jerry&gt;');
    expect(out).not.toContain('Tom <Jerry>');
  });

  it('embeds both confirm and decline URLs', () => {
    const out = renderInviteHtml(SAMPLE);
    expect(out).toContain(SAMPLE.confirmUrl);
    expect(out).toContain(SAMPLE.declineUrl);
  });

  it('shows the formatted expiry date', () => {
    const out = renderInviteHtml(SAMPLE);
    expect(out).toContain('May 23, 2026');
  });
});

describe('send-community-invite · renderInviteText', () => {
  it('is plain text with both URLs and the expiry', () => {
    const out = renderInviteText(SAMPLE);
    expect(out).toContain(SAMPLE.confirmUrl);
    expect(out).toContain(SAMPLE.declineUrl);
    expect(out).toContain('May 23, 2026');
    expect(out).toContain('Hi Ada Lovelace');
    // No HTML in the text fallback.
    expect(out).not.toContain('<');
  });
});
