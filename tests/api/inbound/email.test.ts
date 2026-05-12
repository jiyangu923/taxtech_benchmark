import { describe, it, expect } from 'vitest';
import {
  parseInbound,
  buildForwardPayload,
  escapeHtml,
} from '../../../api/inbound/email';

// ─── parseInbound ─────────────────────────────────────────────────────────────

describe('parseInbound — wrapped vs unwrapped', () => {
  it('parses Resend webhook with `data` wrapper', () => {
    const body = {
      type: 'email.received',
      data: {
        from: { email: 'alice@example.com', name: 'Alice' },
        subject: 'Hi there',
        text: 'Hello world',
        html: '<p>Hello world</p>',
      },
    };
    const parsed = parseInbound(body);
    expect(parsed).not.toBeNull();
    expect(parsed!.from).toBe('alice@example.com');
    expect(parsed!.fromDisplay).toBe('Alice');
    expect(parsed!.subject).toBe('Hi there');
    expect(parsed!.text).toBe('Hello world');
  });

  it('parses unwrapped payload (no `data` field)', () => {
    const body = {
      from: { email: 'bob@example.com', name: 'Bob' },
      subject: 'Hey',
      text: 'Plain text',
    };
    const parsed = parseInbound(body);
    expect(parsed!.from).toBe('bob@example.com');
    expect(parsed!.fromDisplay).toBe('Bob');
  });
});

describe('parseInbound — `from` string variants', () => {
  it('parses "Name <email>" string form', () => {
    const parsed = parseInbound({
      data: { from: '"Carol Smith" <carol@example.com>', subject: 'x' },
    });
    expect(parsed!.from).toBe('carol@example.com');
    expect(parsed!.fromDisplay).toBe('Carol Smith');
  });

  it('parses bare email string', () => {
    const parsed = parseInbound({
      data: { from: 'dave@example.com', subject: 'x' },
    });
    expect(parsed!.from).toBe('dave@example.com');
    expect(parsed!.fromDisplay).toBe('dave@example.com'); // fallback to email when no name
  });

  it('parses "Name <email>" without quotes', () => {
    const parsed = parseInbound({
      data: { from: 'Eve <eve@example.com>', subject: 'x' },
    });
    expect(parsed!.from).toBe('eve@example.com');
    expect(parsed!.fromDisplay).toBe('Eve');
  });
});

describe('parseInbound — fallbacks and rejections', () => {
  it('falls back to envelope.from when no top-level from', () => {
    const parsed = parseInbound({
      data: { envelope: { from: 'frank@example.com' }, subject: 'x' },
    });
    expect(parsed!.from).toBe('frank@example.com');
  });

  it('returns null when from is missing entirely', () => {
    expect(parseInbound({ data: { subject: 'no sender' } })).toBeNull();
  });

  it('returns null when from has no @', () => {
    expect(parseInbound({ data: { from: 'not-an-email', subject: 'x' } })).toBeNull();
  });

  it('returns null on empty payload', () => {
    expect(parseInbound({})).toBeNull();
    expect(parseInbound(null)).toBeNull();
  });

  it('falls back subject to "(no subject)"', () => {
    const parsed = parseInbound({ data: { from: 'g@x.com' } });
    expect(parsed!.subject).toBe('(no subject)');
  });

  it('handles body_plain / body_html legacy field names', () => {
    const parsed = parseInbound({
      data: { from: 'h@x.com', subject: 'x', body_plain: 'plain', body_html: '<p>html</p>' },
    });
    expect(parsed!.text).toBe('plain');
    expect(parsed!.html).toBe('<p>html</p>');
  });
});

// ─── buildForwardPayload ──────────────────────────────────────────────────────

const FORWARDER = {
  fromAddress: 'Taxbenchmark Contact <forwarder@taxbenchmark.ai>',
  forwardTo: 'admin@x.com',
};

const SAMPLE = {
  from: 'alice@example.com',
  fromDisplay: 'Alice',
  subject: 'Question about benchmarks',
  text: 'How do I get started?',
  html: '<p>How do I get started?</p>',
};

describe('buildForwardPayload — subject prefix', () => {
  it('prefixes subject with [hello@]', () => {
    const out = buildForwardPayload(SAMPLE, FORWARDER);
    expect(out.subject).toBe('[hello@] Question about benchmarks');
  });

  it('does not double-prefix if already prefixed', () => {
    const already = { ...SAMPLE, subject: '[hello@] Already prefixed' };
    const out = buildForwardPayload(already, FORWARDER);
    expect(out.subject).toBe('[hello@] Already prefixed');
  });
});

describe('buildForwardPayload — reply routing', () => {
  it('sets reply_to to the original sender', () => {
    const out = buildForwardPayload(SAMPLE, FORWARDER);
    expect(out.reply_to).toBe('alice@example.com');
  });

  it('sets from to the configured forwarder address', () => {
    const out = buildForwardPayload(SAMPLE, FORWARDER);
    expect(out.from).toBe('Taxbenchmark Contact <forwarder@taxbenchmark.ai>');
  });

  it('sets to to the admin inbox', () => {
    const out = buildForwardPayload(SAMPLE, FORWARDER);
    expect(out.to).toBe('admin@x.com');
  });
});

describe('buildForwardPayload — banner and body', () => {
  it('includes a banner with sender info', () => {
    const out = buildForwardPayload(SAMPLE, FORWARDER);
    expect(out.html).toContain('Forwarded from:');
    expect(out.html).toContain('Alice');
    expect(out.html).toContain('alice@example.com');
  });

  it('includes the original html body after the banner', () => {
    const out = buildForwardPayload(SAMPLE, FORWARDER);
    expect(out.html).toContain('<p>How do I get started?</p>');
    expect(out.html.indexOf('Forwarded from:')).toBeLessThan(out.html.indexOf('<p>How do I get'));
  });

  it('falls back to <pre>-wrapped text when no html body', () => {
    const noHtml = { ...SAMPLE, html: '' };
    const out = buildForwardPayload(noHtml, FORWARDER);
    expect(out.html).toContain('<pre');
    expect(out.html).toContain('How do I get started?');
  });

  it('escapes HTML in sender name and subject (XSS guard)', () => {
    const malicious = {
      ...SAMPLE,
      fromDisplay: '<script>alert(1)</script>',
      subject: '<img onerror=alert(1)>',
    };
    const out = buildForwardPayload(malicious, FORWARDER);
    expect(out.html).not.toContain('<script>');
    expect(out.html).not.toContain('<img onerror=');
    expect(out.html).toContain('&lt;script&gt;');
  });
});

describe('buildForwardPayload — plain text fallback', () => {
  it('includes Forwarded from line in text body', () => {
    const out = buildForwardPayload(SAMPLE, FORWARDER);
    expect(out.text).toContain('Forwarded from: Alice <alice@example.com>');
  });

  it('includes the original text content', () => {
    const out = buildForwardPayload(SAMPLE, FORWARDER);
    expect(out.text).toContain('How do I get started?');
  });
});

// ─── escapeHtml ───────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes <, >, &, "', () => {
    expect(escapeHtml('<b>"hi" & bye</b>')).toBe('&lt;b&gt;&quot;hi&quot; &amp; bye&lt;/b&gt;');
  });

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });
});
