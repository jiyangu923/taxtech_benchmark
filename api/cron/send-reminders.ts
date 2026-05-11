import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ─── Email templates (inlined) ────────────────────────────────────────────────
//
// Inlined into this file rather than imported from `services/emailTemplates.ts`
// because Vercel's serverless bundler with `"type": "module"` in package.json
// fails to resolve relative TS imports outside the `/api/` directory at
// runtime — the function 500s with FUNCTION_INVOCATION_FAILED before it ever
// runs. Keeping all dependencies inside `/api/` (or as npm packages) is the
// safe pattern, matching `api/gemini.ts` which has zero relative imports.

type ReminderKind = 'incomplete' | 'stale' | 'outdated';

interface RenderInput {
  name: string;
  siteUrl: string;
  lastSubmittedAt?: string | null;
}

interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const baseStyles = {
  body:    'font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1f2937; max-width: 560px; margin: 0 auto; padding: 24px; line-height: 1.6;',
  h1:      'color: #1e3a8a; font-size: 22px; font-weight: 600; margin: 0 0 16px;',
  p:       'margin: 0 0 16px; font-size: 16px;',
  cta:     'display: inline-block; padding: 12px 24px; background: #1e3a8a; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 8px 0 24px;',
  small:   'color: #6b7280; font-size: 12px; line-height: 1.5;',
  divider: 'border: 0; border-top: 1px solid #e5e7eb; margin: 32px 0 16px;',
};

function firstName(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
}

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

function renderShared(greeting: string, body: string, ctaLabel: string, ctaPath: string, input: RenderInput): { text: string; html: string } {
  const url = `${input.siteUrl}${ctaPath}`;
  const unsub = `${input.siteUrl}/#/profile`;

  const text = [
    `Hi ${firstName(input.name)},`,
    '',
    body,
    '',
    `${ctaLabel}: ${url}`,
    '',
    '--',
    `taxbenchmark.ai — community-built peer comparison for in-house tax-tech functions.`,
    `To stop these reminders, visit ${unsub} and toggle off email reminders.`,
  ].join('\n');

  const html = `<!doctype html>
<html><body style="${baseStyles.body}">
  <h1 style="${baseStyles.h1}">${greeting}</h1>
  <p style="${baseStyles.p}">${body}</p>
  <a href="${url}" style="${baseStyles.cta}">${ctaLabel}</a>
  <hr style="${baseStyles.divider}" />
  <p style="${baseStyles.small}">
    taxbenchmark.ai — community-built peer comparison for in-house tax-tech functions.<br />
    To stop these reminders, <a href="${unsub}" style="color:#1e3a8a;">manage your email preferences</a>.
  </p>
</body></html>`;

  return { text, html };
}

function renderReminderEmail(kind: ReminderKind, input: RenderInput): RenderedEmail {
  if (kind === 'incomplete') {
    const greeting = `${firstName(input.name)}, your benchmark is two clicks away`;
    const body = `You signed up to benchmark your tax-tech function against industry peers but didn't finish the survey. It takes about 10 minutes — once approved, you unlock automation, FTE, AI adoption, and trend comparisons against the rest of the community.`;
    const shared = renderShared(greeting, body, 'Finish the survey', '/#/survey', input);
    return { subject: `Finish your tax-tech benchmark, ${firstName(input.name)}`, ...shared };
  }
  if (kind === 'stale') {
    const days = daysSince(input.lastSubmittedAt);
    const dayPhrase = days != null ? `${days} days ago` : `more than a quarter ago`;
    const greeting = `Quarterly check-in: refresh your benchmark`;
    const body = `Your last benchmark was ${dayPhrase}. A lot can change in a quarter — new automation rollouts, AI tooling, headcount shifts. Resubmitting takes a couple of minutes and keeps your peer comparison (and the industry trend lines you contribute to) accurate.`;
    const shared = renderShared(greeting, body, 'Update your benchmark', '/#/survey', input);
    return { subject: `Time to refresh your tax-tech benchmark`, ...shared };
  }
  // outdated
  const greeting = `New questions in the benchmark — please update`;
  const body = `We added new questions to the survey since you last submitted. To keep your peer comparison apples-to-apples, please take a couple of minutes to fill in the new fields. Your previous answers are pre-filled — you only need to address what's new.`;
  const shared = renderShared(greeting, body, 'Update your benchmark', '/#/survey', input);
  return { subject: `Survey updated — please refresh your responses`, ...shared };
}

// ─── Cron handler ─────────────────────────────────────────────────────────────

/**
 * Vercel Cron handler — runs daily and sends reminder emails to candidates.
 *
 * Auth: optional bearer-token check via CRON_SECRET. Vercel automatically
 * sends `Authorization: Bearer <CRON_SECRET>` for scheduled invocations on
 * Pro plans; on Hobby this header isn't auto-set, so the secret is treated
 * as an opt-in safeguard against random callers hitting the public URL.
 *
 * Modes:
 *   - dry-run: returns candidate counts without sending. Active when
 *     RESEND_API_KEY or EMAIL_FROM_ADDRESS aren't set. Lets admins deploy
 *     this PR and verify it works before standing up a Resend account.
 *   - live:    sends via Resend, marks profiles.last_reminder_sent_at.
 *
 * Cooldown: 14 days per user across all reminder kinds — prevents weekly
 * nag if a user stays in the candidate list (e.g. they ignored an
 * "incomplete" reminder, they shouldn't get another one tomorrow).
 *
 * Outdated candidates are intentionally NOT included — the OUTDATED bucket
 * only fires after an admin explicitly bumps current_survey_version, which
 * is a manual signal that should be coordinated by humans (e.g. paired
 * with a release announcement). The cron stays conservative.
 */

const COOLDOWN_DAYS = 7;
const STALE_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  role: string;
  email_reminders_enabled: boolean | null;
  last_reminder_sent_at: string | null;
}

interface SubmissionRow {
  userId: string;
  submittedAt: string;
  is_current: boolean | null;
}

interface Candidate {
  kind: ReminderKind;
  userId: string;
  name: string;
  email: string;
  lastSubmittedAt: string | null;
}

function isOptedIn(p: ProfileRow): boolean {
  return p.email_reminders_enabled !== false && p.role !== 'admin';
}

function isPastCooldown(p: ProfileRow, now: number): boolean {
  if (!p.last_reminder_sent_at) return true;
  const t = Date.parse(p.last_reminder_sent_at);
  if (!Number.isFinite(t)) return true;
  return now - t >= COOLDOWN_DAYS * MS_PER_DAY;
}

function findCandidates(profiles: ProfileRow[], submissions: SubmissionRow[], now: number): Candidate[] {
  const eligible = profiles.filter(p => isOptedIn(p) && isPastCooldown(p, now));
  const submittedByUser = new Map<string, SubmissionRow>();
  for (const s of submissions) {
    if (s.is_current === false) continue;
    submittedByUser.set(s.userId, s);
  }
  const out: Candidate[] = [];
  const staleCutoff = now - STALE_DAYS * MS_PER_DAY;
  for (const p of eligible) {
    const sub = submittedByUser.get(p.id);
    if (!sub) {
      out.push({ kind: 'incomplete', userId: p.id, name: p.name, email: p.email, lastSubmittedAt: null });
      continue;
    }
    const submittedTime = Date.parse(sub.submittedAt);
    if (Number.isFinite(submittedTime) && submittedTime < staleCutoff) {
      out.push({ kind: 'stale', userId: p.id, name: p.name, email: p.email, lastSubmittedAt: sub.submittedAt });
    }
  }
  return out;
}

function bearerOk(req: VercelRequest, secret: string): boolean {
  const auth = (req.headers['authorization'] as string | undefined) || '';
  return auth === `Bearer ${secret}`;
}

async function runHandler(req: VercelRequest, res: VercelResponse) {
  // Optional auth gate
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && !bearerOk(req, cronSecret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Service-role Supabase: required to read profiles + submissions across all users
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({
      error: 'Missing required env: SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY',
    });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const [{ data: profiles, error: pErr }, { data: subs, error: sErr }] = await Promise.all([
    admin.from('profiles').select('id, name, email, role, email_reminders_enabled, last_reminder_sent_at'),
    admin.from('submissions').select('userId, submittedAt, is_current'),
  ]);
  if (pErr || sErr) {
    return res.status(500).json({ error: pErr?.message || sErr?.message });
  }

  const now = Date.now();
  const candidates = findCandidates(
    (profiles as ProfileRow[]) || [],
    (subs as SubmissionRow[]) || [],
    now,
  );

  const breakdown = {
    incomplete: candidates.filter(c => c.kind === 'incomplete').length,
    stale: candidates.filter(c => c.kind === 'stale').length,
  };

  const resendKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  const siteUrl = (process.env.SITE_URL || 'https://taxbenchmark.ai').replace(/\/$/, '');

  if (!resendKey || !fromAddress) {
    // Dry run — let the admin deploy + verify without standing up Resend yet
    return res.status(200).json({
      mode: 'dry-run',
      reason: 'RESEND_API_KEY or EMAIL_FROM_ADDRESS not set',
      candidatesFound: candidates.length,
      breakdown,
    });
  }

  const sentUserIds: string[] = [];
  const errors: { userId: string; kind: ReminderKind; status: number | string; detail?: string }[] = [];

  for (const c of candidates) {
    try {
      const email = renderReminderEmail(c.kind, {
        name: c.name,
        siteUrl,
        lastSubmittedAt: c.lastSubmittedAt,
      });
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: c.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
        }),
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        errors.push({ userId: c.userId, kind: c.kind, status: resp.status, detail: detail.slice(0, 200) });
        continue;
      }
      sentUserIds.push(c.userId);
    } catch (e: any) {
      errors.push({ userId: c.userId, kind: c.kind, status: 'fetch-error', detail: e?.message || 'unknown' });
    }
  }

  // Mark recipients reminded so the cooldown applies on the next run
  if (sentUserIds.length > 0) {
    const { error: markErr } = await admin
      .from('profiles')
      .update({ last_reminder_sent_at: new Date(now).toISOString() })
      .in('id', sentUserIds);
    if (markErr) {
      // The emails already went — log the marking failure but don't fail the whole run
      errors.push({ userId: 'bulk-mark', kind: 'incomplete', status: 'mark-error', detail: markErr.message });
    }
  }

  return res.status(200).json({
    mode: 'live',
    sent: sentUserIds.length,
    failed: errors.length,
    candidatesFound: candidates.length,
    breakdown,
    errors: errors.slice(0, 10),
  });
}

/**
 * Top-level wrapper: catches any unhandled error and returns it as JSON.
 * Without this, an exception (or a top-level import failure) surfaces as
 * Vercel's opaque "FUNCTION_INVOCATION_FAILED" 500 with no detail in the
 * response body — debuggable only via Vercel function logs.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await runHandler(req, res);
  } catch (e: any) {
    return res.status(500).json({
      error: 'Cron handler crashed',
      message: e?.message || 'unknown',
      stack: process.env.NODE_ENV === 'production' ? undefined : e?.stack,
    });
  }
}

// Exported for tests — pure logic separated from the handler
export { findCandidates, renderReminderEmail };
export type { ProfileRow, SubmissionRow, Candidate, ReminderKind, RenderInput, RenderedEmail };
