/**
 * Email templates for the reminders cron job.
 *
 * Three reminder types matching the three trigger categories from PR #67:
 *   - INCOMPLETE: registered but never submitted
 *   - STALE: last submission > 90 days ago
 *   - OUTDATED: submitted on an older survey version
 *
 * Templates are pure string functions — no external rendering deps. Each
 * returns subject + plain-text + HTML so the cron can pass straight to
 * Resend's REST API. HTML uses inline CSS only (no external stylesheets,
 * no <style> tags) since most email clients strip those.
 *
 * Every template includes an unsubscribe link to /profile where the user
 * can flip email_reminders_enabled off — required by good email hygiene
 * even for transactional-adjacent reminders.
 */

export type ReminderKind = 'incomplete' | 'stale' | 'outdated';

export interface RenderInput {
  /** Display name to greet the recipient. */
  name: string;
  /** Canonical site URL — e.g. https://taxbenchmark.ai (no trailing slash). */
  siteUrl: string;
  /** Optional ISO timestamp of the user's last submission, used by STALE. */
  lastSubmittedAt?: string | null;
}

export interface RenderedEmail {
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

function renderShared(
  greeting: string,
  body: string,
  ctaLabel: string,
  ctaPath: string,
  input: RenderInput,
): { text: string; html: string } {
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

function renderIncomplete(input: RenderInput): RenderedEmail {
  const greeting = `${firstName(input.name)}, your benchmark is two clicks away`;
  const body = `You signed up to benchmark your tax-tech function against industry peers but didn't finish the survey. It takes about 10 minutes — once approved, you unlock automation, FTE, AI adoption, and trend comparisons against the rest of the community.`;
  const { text, html } = renderShared(greeting, body, 'Finish the survey', '/#/survey', input);
  return {
    subject: `Finish your tax-tech benchmark, ${firstName(input.name)}`,
    text,
    html,
  };
}

function renderStale(input: RenderInput): RenderedEmail {
  const days = daysSince(input.lastSubmittedAt);
  const dayPhrase = days != null ? `${days} days ago` : `more than a quarter ago`;
  const greeting = `Quarterly check-in: refresh your benchmark`;
  const body = `Your last benchmark was ${dayPhrase}. A lot can change in a quarter — new automation rollouts, AI tooling, headcount shifts. Resubmitting takes a couple of minutes and keeps your peer comparison (and the industry trend lines you contribute to) accurate.`;
  const { text, html } = renderShared(greeting, body, 'Update your benchmark', '/#/survey', input);
  return {
    subject: `Time to refresh your tax-tech benchmark`,
    text,
    html,
  };
}

function renderOutdated(input: RenderInput): RenderedEmail {
  const greeting = `New questions in the benchmark — please update`;
  const body = `We added new questions to the survey since you last submitted. To keep your peer comparison apples-to-apples, please take a couple of minutes to fill in the new fields. Your previous answers are pre-filled — you only need to address what's new.`;
  const { text, html } = renderShared(greeting, body, 'Update your benchmark', '/#/survey', input);
  return {
    subject: `Survey updated — please refresh your responses`,
    text,
    html,
  };
}

export function renderReminderEmail(kind: ReminderKind, input: RenderInput): RenderedEmail {
  switch (kind) {
    case 'incomplete': return renderIncomplete(input);
    case 'stale':      return renderStale(input);
    case 'outdated':   return renderOutdated(input);
  }
}
