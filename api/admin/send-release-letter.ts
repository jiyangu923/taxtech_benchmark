import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ─── Markdown renderer (inlined) ──────────────────────────────────────────────
//
// Duplicated from `services/markdown.ts` rather than imported. Vercel's
// serverless bundler with `"type": "module"` in package.json fails to resolve
// relative TS imports outside `/api/` at runtime — the function 500s with
// FUNCTION_INVOCATION_FAILED before it ever runs. This is the same lesson as
// `api/cron/send-reminders.ts` (which inlines its email templates) — keep
// every dependency inside `/api/` (or as an npm package).
//
// If you change behavior here, mirror the change in `services/markdown.ts`
// (used for the admin in-browser preview) so test-send and the editor preview
// stay visually consistent.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(s: string): string {
  let out = escapeHtml(s);
  // Images first (because the syntax overlaps with links): ![alt](url)
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, url) =>
    `<img src="${url}" alt="${alt}" style="max-width:100%;height:auto;border-radius:8px;margin:8px 0;" />`
  );
  // Links: [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, url) =>
    `<a href="${url}" style="color:#1e3a8a;text-decoration:underline;">${text}</a>`
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/`([^`]+)`/g, '<code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.9em;">$1</code>');
  return out;
}

function markdownToHtml(md: string): string {
  if (!md || !md.trim()) return '';
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^---+\s*$/.test(line)) {
      out.push('<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0;" />');
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const sizes = ['', '24px', '20px', '17px'];
      out.push(`<h${level} style="font-size:${sizes[level]};font-weight:600;color:#111827;margin:24px 0 12px;">${renderInline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote style="margin:16px 0;padding:8px 16px;border-left:3px solid #c7d2fe;color:#4b5563;font-style:italic;">${renderInline(buf.join(' '))}</blockquote>`);
      continue;
    }
    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) {
        items.push(`<li style="margin:6px 0;">${renderInline(lines[i].replace(/^-\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul style="margin:12px 0;padding-left:24px;">${items.join('')}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li style="margin:6px 0;">${renderInline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol style="margin:12px 0;padding-left:24px;">${items.join('')}</ol>`);
      continue;
    }
    if (line.trim() === '') {
      i++;
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3}\s+|>|---+\s*$|-\s+|\d+\.\s+)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p style="margin:12px 0;line-height:1.6;color:#1f2937;">${renderInline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

// ─── Email shell ──────────────────────────────────────────────────────────────

const baseStyles = {
  body: 'font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1f2937; max-width: 640px; margin: 0 auto; padding: 24px; line-height: 1.6; background:#ffffff;',
  header: 'border-bottom:1px solid #e5e7eb;padding-bottom:16px;margin-bottom:24px;',
  brand: 'font-size:13px;color:#6b7280;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;',
  title: 'font-size:26px;color:#111827;font-weight:700;margin:8px 0 4px;',
  weekOf: 'font-size:13px;color:#6b7280;',
  divider: 'border:0;border-top:1px solid #e5e7eb;margin:32px 0 16px;',
  small: 'color:#6b7280;font-size:12px;line-height:1.5;',
};

function fmtWeekOf(weekOf: string): string {
  // weekOf is YYYY-MM-DD; render as "Week of May 4, 2026"
  const d = new Date(`${weekOf}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return weekOf;
  const fmt = d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return `Week of ${fmt}`;
}

interface ShellInput {
  title: string;
  weekOf: string;
  bodyHtml: string;
  siteUrl: string;
  testBanner?: boolean;
}

function renderEmailShell(input: ShellInput): string {
  const unsub = `${input.siteUrl}/#/profile`;
  const banner = input.testBanner
    ? `<div style="background:#fef3c7;border:1px solid #fcd34d;color:#92400e;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px;">⚠️ <strong>Test send</strong> — only the admin received this. Use "Broadcast" to send to all users.</div>`
    : '';
  return `<!doctype html>
<html><body style="${baseStyles.body}">
  ${banner}
  <div style="${baseStyles.header}">
    <div style="${baseStyles.brand}">taxbenchmark.ai · weekly release</div>
    <div style="${baseStyles.title}">${escapeHtml(input.title)}</div>
    <div style="${baseStyles.weekOf}">${escapeHtml(fmtWeekOf(input.weekOf))}</div>
  </div>
  ${input.bodyHtml}
  <hr style="${baseStyles.divider}" />
  <p style="${baseStyles.small}">
    You're getting this because you signed up at <a href="${input.siteUrl}" style="color:#1e3a8a;">taxbenchmark.ai</a>.<br />
    To stop receiving release emails, <a href="${unsub}" style="color:#1e3a8a;">manage your preferences</a>.
  </p>
</body></html>`;
}

function plainTextFallback(title: string, weekOf: string, md: string, siteUrl: string): string {
  // Strip the most common markdown marks for the text/* fallback. We don't
  // need a perfect plain-text render — modern clients render HTML — but a
  // best-effort fallback satisfies spam filters that down-rank text-less mail.
  const stripped = md
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '[image]')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/[*_`#>]+/g, '')
    .replace(/\n{3,}/g, '\n\n');
  return [
    `${title}`,
    fmtWeekOf(weekOf),
    '',
    stripped.trim(),
    '',
    '--',
    `taxbenchmark.ai`,
    `Manage email preferences: ${siteUrl}/#/profile`,
  ].join('\n');
}

// ─── Recipient filtering (pure, exported for tests) ───────────────────────────

interface RecipientProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  email_reminders_enabled: boolean | null;
}

function isBroadcastRecipient(p: RecipientProfile): boolean {
  // Release letters go to every signed-up user — including admins. The
  // reminder cron deliberately excludes admins (no point nagging the team
  // about completing a survey they built), but release letters are a
  // product newsletter — admins should see what's going out.
  //
  // We still respect the email_reminders_enabled toggle so users who
  // opted out of email don't get blasted.
  if (p.email_reminders_enabled === false) return false;
  if (!p.email || !p.email.includes('@')) return false;
  return true;
}

function filterBroadcastRecipients(profiles: RecipientProfile[]): RecipientProfile[] {
  return profiles.filter(isBroadcastRecipient);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

interface SendBody {
  letterId: string;
  mode: 'test' | 'broadcast';
}

function bearerToken(req: VercelRequest): string | null {
  const auth = (req.headers['authorization'] as string | undefined) || '';
  const m = /^Bearer\s+(.+)$/.exec(auth);
  return m ? m[1] : null;
}

async function runHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return res.status(500).json({
      error: 'Missing Supabase env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY required',
    });
  }

  // 1. Auth — verify the caller is an admin.
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Missing Authorization bearer token' });

  // anon client just to call auth.getUser(token) — service role can't decode user JWTs
  const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const callerId = userData.user.id;
  const callerEmail = userData.user.email || '';

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: callerProfile, error: profErr } = await admin
    .from('profiles')
    .select('id, role, email')
    .eq('id', callerId)
    .single();
  if (profErr || !callerProfile) {
    return res.status(403).json({ error: 'Profile not found' });
  }
  if (callerProfile.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  // 2. Parse body.
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as SendBody;
  if (!body?.letterId || !body?.mode || !['test', 'broadcast'].includes(body.mode)) {
    return res.status(400).json({ error: 'Body must include { letterId, mode: "test" | "broadcast" }' });
  }

  // 3. Load the letter.
  const { data: letter, error: letterErr } = await admin
    .from('release_letters')
    .select('id, title, week_of, body_markdown, status')
    .eq('id', body.letterId)
    .single();
  if (letterErr || !letter) {
    return res.status(404).json({ error: 'Release letter not found' });
  }

  // 4. Resolve recipients.
  const siteUrl = (process.env.SITE_URL || 'https://taxbenchmark.ai').replace(/\/$/, '');

  let recipients: { email: string; name: string }[] = [];
  if (body.mode === 'test') {
    const target = callerEmail || (callerProfile.email as string) || '';
    if (!target) return res.status(400).json({ error: 'Caller has no email on file' });
    recipients = [{ email: target, name: 'Admin (test send)' }];
  } else {
    const { data: profiles, error: pErr } = await admin
      .from('profiles')
      .select('id, name, email, role, email_reminders_enabled');
    if (pErr) return res.status(500).json({ error: pErr.message });
    recipients = filterBroadcastRecipients((profiles as RecipientProfile[]) || []).map(p => ({
      email: p.email,
      name: p.name,
    }));
  }

  // 5. Render & send.
  //
  // Sender precedence: RELEASE_LETTER_FROM_ADDRESS wins, then EMAIL_FROM_ADDRESS.
  // This keeps reminder emails (cron) on `reminders@…` while release letters
  // can ship from a friendlier `news@…` address. Both must be on a verified
  // Resend domain; no extra Resend setup is needed if the domain is already
  // verified for one of them.
  const resendKey = process.env.RESEND_API_KEY;
  const fromAddress =
    process.env.RELEASE_LETTER_FROM_ADDRESS ||
    process.env.EMAIL_FROM_ADDRESS;
  if (!resendKey || !fromAddress) {
    return res.status(500).json({
      error: 'Email backend not configured',
      detail: 'Set RESEND_API_KEY and one of RELEASE_LETTER_FROM_ADDRESS or EMAIL_FROM_ADDRESS in Vercel env',
    });
  }

  const bodyHtml = markdownToHtml(letter.body_markdown);
  const html = renderEmailShell({
    title: letter.title,
    weekOf: letter.week_of,
    bodyHtml,
    siteUrl,
    testBanner: body.mode === 'test',
  });
  const text = plainTextFallback(letter.title, letter.week_of, letter.body_markdown, siteUrl);
  const subject = body.mode === 'test'
    ? `[TEST] ${letter.title}`
    : letter.title;

  const sentEmails: string[] = [];
  const errors: { email: string; status: number | string; detail?: string }[] = [];

  // Resend free tier limits to ~2 req/s. Without throttling, broadcasts of
  // 5+ recipients fire in rapid succession and the second half come back as
  // 429 Too Many Requests. We pace at ~2.5 req/s with a small in-loop
  // delay AND retry once on 429 with backoff. Stays well under Vercel's
  // 10s function timeout for typical recipient counts (<20).
  const RESEND_DELAY_MS = 400;       // ~2.5 req/s, safe under the 2/s cap
  const RESEND_429_BACKOFF_MS = 1100; // wait > 1s after a 429 before retry

  async function sendOne(toEmail: string, attempt = 1): Promise<Response> {
    return fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: toEmail,
        subject,
        text,
        html,
      }),
    });
  }

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    try {
      let resp = await sendOne(r.email);
      if (resp.status === 429) {
        // One retry with backoff — covers the burst case after a brief pause.
        await new Promise(res => setTimeout(res, RESEND_429_BACKOFF_MS));
        resp = await sendOne(r.email);
      }
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        errors.push({ email: r.email, status: resp.status, detail: detail.slice(0, 200) });
      } else {
        sentEmails.push(r.email);
      }
    } catch (e: any) {
      errors.push({ email: r.email, status: 'fetch-error', detail: e?.message || 'unknown' });
    }
    // Pace the next send — skip the delay after the last one.
    if (i < recipients.length - 1) {
      await new Promise(res => setTimeout(res, RESEND_DELAY_MS));
    }
  }

  // 6. On a successful broadcast, mark the letter as sent.
  //    Test sends never mutate the letter row — admins can iterate freely.
  if (body.mode === 'broadcast' && sentEmails.length > 0) {
    const { error: markErr } = await admin
      .from('release_letters')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_count: sentEmails.length,
      })
      .eq('id', letter.id);
    if (markErr) {
      // Emails went out — don't fail the whole call; just record it.
      errors.push({ email: 'mark-sent', status: 'mark-error', detail: markErr.message });
    }
  }

  return res.status(200).json({
    mode: body.mode,
    sent: sentEmails.length,
    failed: errors.length,
    recipientsFound: recipients.length,
    errors: errors.slice(0, 10),
  });
}

/**
 * Top-level wrapper — without it any uncaught exception (or top-level import
 * failure) surfaces as Vercel's opaque FUNCTION_INVOCATION_FAILED 500 with
 * no detail in the response body.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await runHandler(req, res);
  } catch (e: any) {
    return res.status(500).json({
      error: 'send-release-letter handler crashed',
      message: e?.message || 'unknown',
      stack: process.env.NODE_ENV === 'production' ? undefined : e?.stack,
    });
  }
}

// Exported for tests — pure logic, no env/network/db dependencies.
export {
  markdownToHtml,
  renderEmailShell,
  plainTextFallback,
  isBroadcastRecipient,
  filterBroadcastRecipients,
  fmtWeekOf,
};
export type { RecipientProfile, ShellInput, SendBody };
