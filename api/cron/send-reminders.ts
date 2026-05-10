import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { renderReminderEmail, ReminderKind } from '../../services/emailTemplates';

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

const COOLDOWN_DAYS = 14;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

// Exported for tests — pure logic separated from the handler
export { findCandidates };
export type { ProfileRow, SubmissionRow, Candidate };
