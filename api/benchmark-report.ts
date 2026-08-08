import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
// NOTE: the explicit .js extension is REQUIRED. package.json is type:module,
// so the compiled function resolves this specifier with strict Node ESM rules
// — extensionless './claude' crashes at cold start with ERR_MODULE_NOT_FOUND
// (verified in production logs, 2026-08-08).
import {
  bearerToken, recordUsage, resolveWindow, pickUsage,
  DEFAULT_MODEL, DAILY_LIMIT_USD, WINDOW_MS,
} from './claude.js';

/**
 * POST /api/benchmark-report — generate the member's printable benchmark
 * report and email it to their REGISTERED address (docs/AI_INTAKE_PIVOT.md
 * follow-up: "open with a tailored summary, emailed printable analysis").
 *
 * Harness discipline: every number in the report is computed HERE,
 * deterministically, as a cross-peer MEDIAN (founder decision, PR #147).
 * The model receives a finished fact sheet and only writes the role-tailored
 * narrative around it — it never computes a statistic, so it can't
 * hallucinate one.
 *
 * Recipient is always the AUTH identity email (userData.user.email from the
 * verified JWT) — never profiles.email, which is self-updatable under RLS and
 * could be repointed at an arbitrary address. The endpoint cannot be used to
 * send mail anywhere else.
 */

// Enum→number maps, inlined (the no-imports-outside-/api rule). Parity with
// the client's Report helpers is asserted in tests/api/benchmark-report.test.ts.
const AUTO_MAP: Record<string, number> = { '99_plus': 99.5, '90_99': 95, '70_90': 80, '40_70': 55, under_40: 20 };
const TECH_FTE_MAP: Record<string, number> = { zero: 0, '1_5': 3, '6_15': 10, '16_30': 23, '31_100': 65, over_100: 130 };
const AUTO_LABELS: Record<string, string> = { '99_plus': '99%+', '90_99': '90–99%', '70_90': '70–90%', '40_70': '40–70%', under_40: 'under 40%' };
const TECH_FTE_LABELS: Record<string, string> = { zero: '0', '1_5': '1–5', '6_15': '6–15', '16_30': '16–30', '31_100': '31–100', over_100: '100+' };

export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const mapAuto = (v?: string) => (v ? AUTO_MAP[v] ?? 0 : 0);
const mapTechFte = (v?: string) => (v ? TECH_FTE_MAP[v] ?? 0 : 0);

interface SubRow {
  respondentRole?: string;
  revenueRange?: string;
  jurisdictionsCovered?: number;
  companyProfile?: string[];
  taxCalculationAutomationRange?: string;
  taxPaymentAutomationRange?: string;
  complianceAutomationCoverageRange?: string;
  taxTechFTEsRange?: string;
  aiAdopted?: boolean;
  genAIAdoptionStage?: string;
  submittedAt?: string;
}

export interface MetricRow {
  label: string;
  yours: string;
  peerMedian: string;
  /** 'above' | 'at' | 'below' | 'n/a' — computed here, never by the model. */
  position: string;
}

function positionOf(mine: number, peers: number): string {
  if (!Number.isFinite(mine) || !Number.isFinite(peers)) return 'n/a';
  if (mine > peers) return 'above';
  if (mine < peers) return 'below';
  return 'at';
}

/**
 * The deterministic fact sheet: every metric compared against the peer
 * MEDIAN. Missing answers render as "not provided" with position n/a rather
 * than a fake zero comparison. Pure; exported for tests.
 */
export function buildFactSheet(mine: SubRow, peers: SubRow[]): { metrics: MetricRow[]; cohortSize: number; aiAdoptionPct: number } {
  const cohortSize = peers.length;
  const pct = (v?: string) => (v ? `~${AUTO_LABELS[v] ?? v}` : 'not provided');
  const medOf = (fn: (s: SubRow) => number, include: (s: SubRow) => boolean) =>
    median(peers.filter(include).map(fn));

  const autoMetric = (label: string, field: keyof SubRow): MetricRow => {
    const mineVal = mine[field] as string | undefined;
    const peerMed = medOf(s => mapAuto(s[field] as string | undefined), s => Boolean(s[field]));
    return {
      label,
      yours: pct(mineVal),
      peerMedian: peerMed ? `~${peerMed}%` : 'no data yet',
      position: mineVal && peerMed ? positionOf(mapAuto(mineVal), peerMed) : 'n/a',
    };
  };

  const techMed = medOf(s => mapTechFte(s.taxTechFTEsRange), s => Boolean(s.taxTechFTEsRange));
  const aiAdopters = peers.filter(s => s.aiAdopted === true).length;
  const aiAdoptionPct = cohortSize ? Math.round((aiAdopters / cohortSize) * 100) : 0;

  const metrics: MetricRow[] = [
    autoMetric('Tax calculation automation', 'taxCalculationAutomationRange'),
    autoMetric('Tax payment automation', 'taxPaymentAutomationRange'),
    autoMetric('Compliance automation coverage', 'complianceAutomationCoverageRange'),
    {
      label: 'Tax technology team (FTEs)',
      yours: mine.taxTechFTEsRange ? TECH_FTE_LABELS[mine.taxTechFTEsRange] ?? mine.taxTechFTEsRange : 'not provided',
      peerMedian: techMed ? `~${Math.round(techMed)}` : 'no data yet',
      position: mine.taxTechFTEsRange && techMed ? positionOf(mapTechFte(mine.taxTechFTEsRange), techMed) : 'n/a',
    },
    {
      label: 'GenAI adoption',
      yours: mine.aiAdopted ? `adopted${mine.genAIAdoptionStage ? ` (${mine.genAIAdoptionStage.replace(/_/g, ' ')})` : ''}` : 'not yet',
      peerMedian: `${aiAdoptionPct}% of peers adopted`,
      position: mine.aiAdopted ? (aiAdoptionPct >= 50 ? 'at' : 'above') : (aiAdoptionPct >= 50 ? 'below' : 'at'),
    },
  ];
  return { metrics, cohortSize, aiAdoptionPct };
}

// Narrative schema: prose fields only — every number the model mentions must
// come from the fact sheet it is handed.
const NARRATIVE_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'One sentence: the single most important takeaway for this member. No greeting.' },
    summary: { type: 'string', description: '2-3 short paragraphs, tailored to the member role, using ONLY figures from the fact sheet.' },
    strengths: { type: 'array', items: { type: 'string' }, description: '1-3 bullets: where they lead the cohort. Empty if none.' },
    gaps: { type: 'array', items: { type: 'string' }, description: '1-3 bullets: where they trail. Empty if none.' },
    recommendations: { type: 'array', items: { type: 'string' }, description: '2-3 concrete next steps tailored to the role.' },
  },
  required: ['headline', 'summary', 'strengths', 'gaps', 'recommendations'],
  additionalProperties: false,
} as const;

const NARRATIVE_SYSTEM = `You write the narrative for a member's printable tax-technology benchmark report.
You are given a FACT SHEET with the member's metrics vs the peer MEDIAN, already computed. Rules:
- Use ONLY numbers that appear in the fact sheet. Never compute, estimate, or add figures.
- Tailor the story to the member's role: tax_professionals care about compliance workload, process risk, and where automation buys them time; tax_technology cares about architecture, engineering investment, and platform maturity.
- Plain, direct language. No marketing words (robust, seamless, excited). No exclamation marks.
- If the cohort is small, say so once, plainly.
- Never mention any company or person by name; the benchmark is anonymous.`;

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Printable HTML (email-safe inline styles; prints cleanly from the mail client). */
export function renderReportHtml(input: {
  name: string;
  role: string;
  headline: string; summary: string; strengths: string[]; gaps: string[]; recommendations: string[];
  metrics: MetricRow[]; cohortSize: number; generatedAt: string; siteUrl: string;
}): string {
  const posBadge = (p: string) =>
    p === 'above' ? '<span style="color:#047857;font-weight:700;">above median</span>'
    : p === 'below' ? '<span style="color:#b45309;font-weight:700;">below median</span>'
    : p === 'at' ? '<span style="color:#6b7280;font-weight:700;">at median</span>'
    : '<span style="color:#9ca3af;">—</span>';
  const rows = input.metrics.map(m => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">${esc(m.label)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-weight:600;">${esc(m.yours)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#374151;">${esc(m.peerMedian)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${posBadge(m.position)}</td>
    </tr>`).join('');
  const list = (items: string[]) => items.map(i => `<li style="margin:4px 0;color:#1f2937;">${esc(i)}</li>`).join('');

  return `<!doctype html>
<html><body style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;max-width:680px;margin:0 auto;padding:24px;line-height:1.6;background:#ffffff;">
  <div style="border-bottom:2px solid #1e3a8a;padding-bottom:14px;margin-bottom:20px;">
    <div style="font-size:12px;color:#6b7280;letter-spacing:0.05em;text-transform:uppercase;font-weight:700;">taxbenchmark.ai · benchmark report</div>
    <div style="font-size:24px;color:#111827;font-weight:800;margin-top:6px;">${esc(input.headline)}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:4px;">Prepared for ${esc(input.name)} · ${esc(input.role)} · ${esc(input.generatedAt)}</div>
  </div>
  <div style="white-space:pre-wrap;">${esc(input.summary)}</div>
  <h3 style="font-size:15px;margin:22px 0 8px;color:#111827;">Your metrics vs the peer median</h3>
  <table style="border-collapse:collapse;width:100%;font-size:14px;">
    <tr>
      <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #d1d5db;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Metric</th>
      <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #d1d5db;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">You</th>
      <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #d1d5db;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Peer median</th>
      <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #d1d5db;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Position</th>
    </tr>
    ${rows}
  </table>
  ${input.strengths.length ? `<h3 style="font-size:15px;margin:22px 0 6px;color:#047857;">Where you lead</h3><ul style="margin:0;padding-left:20px;">${list(input.strengths)}</ul>` : ''}
  ${input.gaps.length ? `<h3 style="font-size:15px;margin:18px 0 6px;color:#b45309;">Where you trail</h3><ul style="margin:0;padding-left:20px;">${list(input.gaps)}</ul>` : ''}
  ${input.recommendations.length ? `<h3 style="font-size:15px;margin:18px 0 6px;color:#111827;">Recommended next steps</h3><ul style="margin:0;padding-left:20px;">${list(input.recommendations)}</ul>` : ''}
  <hr style="border:0;border-top:1px solid #e5e7eb;margin:28px 0 12px;" />
  <p style="color:#6b7280;font-size:12px;line-height:1.5;">
    Peer medians computed from ${input.cohortSize} anonymized member submissions on ${esc(input.generatedAt)}. Medians, not averages — one outlier can't skew your comparison.<br />
    Ask follow-up questions any time: <a href="${input.siteUrl}/#/taxi" style="color:#1e3a8a;">chat with Taxi</a>. Update your numbers: <a href="${input.siteUrl}/#/taxi?refresh=1" style="color:#1e3a8a;">refresh your benchmark</a>.<br />
    taxbenchmark.ai — community-built, non-profit. Operated by Seven Twenty Two LLC.
  </p>
</body></html>`;
}

// Identity fields never reach the model (house privacy rule).
export function sanitizeForModel(sub: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...sub };
  for (const f of ['companyName', 'userName', 'id', 'userId']) delete clean[f];
  return clean;
}

async function runHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!apiKey || !resendKey || !fromAddress || !supabaseUrl || !serviceKey || !anonKey) {
    return res.status(500).json({ error: 'Report backend not configured' });
  }

  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Sign in to request your report.' });
  const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Your session expired — sign in again.' });
  const userId = userData.user.id;
  // Recipient comes from the VERIFIED auth identity, never from profiles.email:
  // the profiles row is self-updatable under RLS, so a client could repoint it
  // at an arbitrary address. auth.users.email can only change via a confirmed
  // email-change flow.
  const authEmail = userData.user.email;
  if (!authEmail) return res.status(500).json({ error: 'No registered email on your account.' });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const [profileRes, mineRes, cohortRes, usageRes] = await Promise.all([
    admin.from('profiles').select('name, role').eq('id', userId).maybeSingle(),
    admin.from('submissions').select('*').eq('userId', userId).eq('is_current', true).eq('status', 'approved').limit(1),
    admin.from('submissions').select('*').eq('is_current', true).eq('status', 'approved'),
    admin.from('ai_usage').select('window_started_at, cost_usd, input_tokens, output_tokens').eq('user_id', userId).maybeSingle(),
  ]);
  const profile = profileRes.data as { name?: string; role?: string } | null;
  const mine = (mineRes.data as SubRow[] | null)?.[0];
  if (!mine) return res.status(403).json({ error: 'Set up your benchmark profile first — chat with Taxi for two minutes.' });
  const cohort = (cohortRes.data as SubRow[]) ?? [];

  // Same rolling daily meter as /api/claude — a report costs one model call.
  const isAdmin = profile.role === 'admin';
  let meterState: ReturnType<typeof resolveWindow> | null = null;
  if (!isAdmin) {
    meterState = resolveWindow((usageRes.data as any) ?? null, Date.now());
    if (meterState.used >= DAILY_LIMIT_USD) {
      const resetsAtMs = meterState.windowStartMs + WINDOW_MS;
      return res.status(429).json({
        error: `You've reached your daily AI limit. It resets ${new Date(resetsAtMs).toISOString()}.`,
      });
    }
  }

  // 1. Deterministic fact sheet (medians — never the model's math).
  const { metrics, cohortSize } = buildFactSheet(mine, cohort);
  const role = mine.respondentRole === 'tax_professionals' ? 'Tax professional' : mine.respondentRole === 'tax_technology' ? 'Tax technology' : 'Member';

  // 2. Role-tailored narrative around the fact sheet.
  const client = new Anthropic({ apiKey });
  const response: any = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1500,
    system: NARRATIVE_SYSTEM,
    messages: [{
      role: 'user',
      content:
        `Member role: ${mine.respondentRole || 'unknown'}\n` +
        `Member profile (anonymized): ${JSON.stringify(sanitizeForModel(mine as Record<string, unknown>))}\n` +
        `Cohort size: ${cohortSize}\n` +
        `FACT SHEET (metric | yours | peer median | position):\n` +
        metrics.map(m => `- ${m.label} | ${m.yours} | ${m.peerMedian} | ${m.position}`).join('\n'),
    }],
    output_config: { format: { type: 'json_schema', schema: NARRATIVE_SCHEMA } },
  } as any);
  // Meter before parsing — the model call cost money even if the output is
  // unusable (mirrors /api/claude ordering).
  if (!isAdmin && meterState) await recordUsage(admin, userId, meterState, pickUsage(response.usage));
  const text = (response.content.find((b: any) => b.type === 'text') as { text?: string } | undefined)?.text ?? '';
  let narrative: { headline: string; summary: string; strengths: string[]; gaps: string[]; recommendations: string[] };
  try {
    narrative = JSON.parse(text);
  } catch {
    return res.status(502).json({ error: 'Report generation failed — please try again.' });
  }

  // 3. Render + email to the member's own registered address (never elsewhere).
  const siteUrl = 'https://taxbenchmark.ai';
  const generatedAt = new Date().toISOString().slice(0, 10);
  const html = renderReportHtml({
    name: profile?.name || 'Member', role, ...narrative, metrics, cohortSize, generatedAt, siteUrl,
  });
  const sendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromAddress,
      to: authEmail,
      subject: 'Your tax benchmark report — taxbenchmark.ai',
      html,
    }),
  });
  if (!sendResp.ok) {
    const detail = await sendResp.text().catch(() => '');
    console.warn('[report] resend failed:', sendResp.status, detail.slice(0, 200));
    return res.status(502).json({ error: 'Could not send the email right now — please try again.' });
  }

  return res.status(200).json({ ok: true, emailedTo: maskEmail(authEmail) });
}

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await runHandler(req, res);
  } catch (e: any) {
    return res.status(500).json({ error: 'report handler crashed', message: e?.message || 'unknown' });
  }
}
