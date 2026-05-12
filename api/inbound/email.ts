import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─── Inbound email forwarder ──────────────────────────────────────────────────
//
// Receives a webhook from Resend Inbound when an email arrives at e.g.
// hello@taxbenchmark.ai, parses the payload, and forwards it to a single
// admin inbox (jiyangu923@gmail.com or wherever INBOUND_FORWARD_TO points)
// via Resend Send. `Reply-To` is set to the original sender so the admin
// can hit Reply in Gmail and have it route back to the real person.
//
// Why this exists: the footer Contact mailto on the site points at
// hello@taxbenchmark.ai for brand consistency, but Resend doesn't auto-route
// incoming mail to inboxes — it routes to webhooks. This function is the
// webhook handler that turns "inbound webhook" into "email in my Gmail."
//
// Setup (one-time, after this PR merges):
//   1. Resend dashboard → Domains → taxbenchmark.ai → Inbound → enable
//   2. Add the MX DNS records Resend gives you to your domain registrar
//   3. Configure inbound route: hello@taxbenchmark.ai → webhook URL
//      https://taxbenchmark.ai/api/inbound/email?key=<INBOUND_WEBHOOK_SECRET>
//   4. Vercel env vars (Production + Preview):
//      - INBOUND_FORWARD_TO=jiyangu923@gmail.com          (where to forward)
//      - INBOUND_FROM_ADDRESS=Taxbenchmark Contact <forwarder@taxbenchmark.ai>
//      - INBOUND_WEBHOOK_SECRET=<random string also in the URL ?key=…>
//
// The function always returns 200 (even on errors) to prevent Resend's
// webhook retry storm — failures are visible in Vercel function logs.

interface InboundPayload {
  from: string;          // bare email, e.g. "alice@example.com"
  fromDisplay: string;   // display name if available, else the email itself
  subject: string;
  text: string;
  html: string;
}

/**
 * Defensive parser for Resend's inbound webhook payload. Resend wraps the
 * actual email data inside a `data` field per their webhook convention,
 * but we accept the unwrapped shape too for forward-compat.
 *
 * The `from` field in Resend's payload can be either:
 *   - a string  ("Alice <alice@example.com>")
 *   - an object ({ email: "alice@example.com", name: "Alice" })
 * We handle both.
 */
function parseInbound(body: any): InboundPayload | null {
  const data = body?.data ?? body ?? {};

  // Resolve `from` defensively across the shapes Resend has used.
  let from = '';
  let fromDisplay = '';
  const rawFrom = data.from;
  if (typeof rawFrom === 'string') {
    // "Alice <alice@example.com>" or just "alice@example.com"
    const m = /^(.*?)\s*<([^>]+)>\s*$/.exec(rawFrom);
    if (m) {
      fromDisplay = m[1].replace(/^"|"$/g, '').trim();
      from = m[2].trim();
    } else {
      from = rawFrom.trim();
    }
  } else if (rawFrom && typeof rawFrom === 'object') {
    from = String(rawFrom.email ?? '').trim();
    fromDisplay = String(rawFrom.name ?? '').trim();
  }

  // Fallback: envelope.from is the SMTP-level sender, sometimes the only
  // field present on minimal webhooks.
  if (!from && data.envelope?.from) {
    from = String(data.envelope.from).trim();
  }

  if (!from || !from.includes('@')) return null;
  if (!fromDisplay) fromDisplay = from;

  const subject = String(data.subject ?? '(no subject)');
  const text = String(data.text ?? data.body_plain ?? '');
  const html = String(data.html ?? data.body_html ?? '');

  return { from, fromDisplay, subject, text, html };
}

interface ForwardPayload {
  from: string;
  to: string;
  reply_to: string;
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Wraps the inbound email in a small "Forwarded from …" banner and sets
 * Reply-To to the original sender so the admin can reply directly without
 * having to remember the source address.
 */
function buildForwardPayload(parsed: InboundPayload, opts: {
  fromAddress: string;
  forwardTo: string;
}): ForwardPayload {
  const subject = parsed.subject.startsWith('[hello@] ')
    ? parsed.subject
    : `[hello@] ${parsed.subject}`;

  const bannerHtml = `<div style="border:1px solid #e5e7eb;background:#f9fafb;padding:12px 16px;margin:0 0 20px;border-radius:8px;font-family:-apple-system,Segoe UI,sans-serif;font-size:13px;color:#374151;line-height:1.5;">
    <div><strong>Forwarded from:</strong> ${escapeHtml(parsed.fromDisplay)} &lt;${escapeHtml(parsed.from)}&gt;</div>
    <div><strong>Original subject:</strong> ${escapeHtml(parsed.subject)}</div>
    <div style="color:#6b7280;margin-top:4px;font-style:italic;">Reply to this email — your response goes back to ${escapeHtml(parsed.from)}.</div>
  </div>`;

  const bodyHtml = parsed.html
    || `<pre style="font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;color:#1f2937;">${escapeHtml(parsed.text)}</pre>`;

  const html = bannerHtml + bodyHtml;
  const text = [
    `Forwarded from: ${parsed.fromDisplay} <${parsed.from}>`,
    `Original subject: ${parsed.subject}`,
    `Reply to this email to respond to ${parsed.from}.`,
    '',
    parsed.text,
  ].join('\n');

  return {
    from: opts.fromAddress,
    to: opts.forwardTo,
    reply_to: parsed.from,
    subject,
    text,
    html,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function runHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Shared-secret check via ?key=… query param OR x-webhook-secret header.
  // We set this when configuring the Resend Inbound webhook URL. Without
  // it, anyone who guesses the URL could trigger emails from our domain.
  const expectedSecret = process.env.INBOUND_WEBHOOK_SECRET;
  if (expectedSecret) {
    const got = (req.query?.key as string | undefined)
      || (req.headers['x-webhook-secret'] as string | undefined);
    if (got !== expectedSecret) {
      console.warn('Inbound forwarder: rejected request with bad/missing secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  const forwardTo = process.env.INBOUND_FORWARD_TO;
  const fromAddress = process.env.INBOUND_FROM_ADDRESS;

  if (!resendKey || !forwardTo || !fromAddress) {
    console.error('Inbound forwarder: missing env vars (RESEND_API_KEY, INBOUND_FORWARD_TO, INBOUND_FROM_ADDRESS)');
    // 200 prevents Resend from retrying. The error is in logs.
    return res.status(200).json({ skipped: 'env-not-configured' });
  }

  let body: any;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    console.error('Inbound forwarder: malformed JSON body');
    return res.status(200).json({ skipped: 'malformed-json' });
  }

  const parsed = parseInbound(body);
  if (!parsed) {
    console.error('Inbound forwarder: payload missing from/subject', JSON.stringify(body).slice(0, 500));
    return res.status(200).json({ skipped: 'malformed-payload' });
  }

  const forwardPayload = buildForwardPayload(parsed, { fromAddress, forwardTo });

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(forwardPayload),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.error('Inbound forwarder: send failed', resp.status, detail.slice(0, 200));
      return res.status(200).json({ error: 'forward-failed', status: resp.status });
    }
  } catch (e: any) {
    console.error('Inbound forwarder: fetch to Resend failed', e?.message || e);
    return res.status(200).json({ error: 'fetch-error' });
  }

  return res.status(200).json({ ok: true, from: parsed.from, subject: parsed.subject });
}

/**
 * Top-level wrapper — always returns 200 so a crash doesn't trigger Resend's
 * webhook retry storm. The error surfaces in Vercel function logs.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await runHandler(req, res);
  } catch (e: any) {
    console.error('Inbound forwarder: crashed', e?.message || e);
    return res.status(200).json({ error: e?.message || 'unknown' });
  }
}

// Exported for tests — pure logic with no env/network/db dependencies.
export { parseInbound, buildForwardPayload, escapeHtml };
export type { InboundPayload, ForwardPayload };
