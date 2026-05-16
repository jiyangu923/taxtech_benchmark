import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ─── Inlined helpers ──────────────────────────────────────────────────────────
//
// Same constraint as api/admin/send-release-letter.ts: Vercel's serverless
// bundler with `"type": "module"` in package.json fails to resolve relative TS
// imports outside `/api/`, so every dependency must be inlined or come from an
// npm package.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Email shell ──────────────────────────────────────────────────────────────

interface InviteEmailInput {
  memberName: string;
  confirmUrl: string;
  declineUrl: string;
  siteUrl: string;
  expiresAt: string; // ISO timestamp
}

function fmtExpiresAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function renderInviteHtml(input: InviteEmailInput): string {
  const body =
    'font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1f2937; max-width: 560px; margin: 0 auto; padding: 32px 24px; line-height: 1.6; background:#ffffff;';
  const brand = 'font-size:13px;color:#6b7280;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;';
  const h1 = 'font-size:24px;color:#111827;font-weight:600;margin:8px 0 16px;line-height:1.3;';
  const p = 'font-size:15px;color:#374151;margin:14px 0;line-height:1.65;';
  const primaryBtn =
    'display:inline-block;background:#1e3a8a;color:#ffffff !important;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:15px;';
  const secondary =
    'display:inline-block;color:#6b7280;text-decoration:underline;font-size:13px;margin-top:18px;';
  const small = 'color:#9ca3af;font-size:12px;line-height:1.5;';
  const divider = 'border:0;border-top:1px solid #e5e7eb;margin:32px 0 16px;';
  return `<!doctype html>
<html><body style="${body}">
  <div style="${brand}">taxbenchmark.ai · community</div>
  <h1 style="${h1}">You're invited to join the taxbenchmark.ai community</h1>
  <p style="${p}">Hi ${escapeHtml(input.memberName)},</p>
  <p style="${p}">
    You've been invited to be listed on the <a href="${input.siteUrl}/#/community" style="color:#1e3a8a;">taxbenchmark.ai community page</a> — a public list of practitioners and leaders behind the benchmark.
  </p>
  <p style="${p}">
    Click below to review what we'll show, edit your name, and optionally add a LinkedIn link and photo. You can decline if you'd rather not be listed.
  </p>
  <p style="margin:28px 0;">
    <a href="${input.confirmUrl}" style="${primaryBtn}">Review &amp; confirm my listing</a>
  </p>
  <p style="${p}">
    <a href="${input.declineUrl}" style="${secondary}">Or click here to decline</a>
  </p>
  <hr style="${divider}" />
  <p style="${small}">
    This invite expires on ${escapeHtml(fmtExpiresAt(input.expiresAt))}. If you didn't expect this email or have questions, just reply — a human (J Gu) will see it.
  </p>
</body></html>`;
}

function renderInviteText(input: InviteEmailInput): string {
  return [
    `Hi ${input.memberName},`,
    '',
    `You've been invited to be listed on the taxbenchmark.ai community page — a public list of practitioners and leaders behind the benchmark.`,
    '',
    `Review and confirm: ${input.confirmUrl}`,
    `Or decline:        ${input.declineUrl}`,
    '',
    `This invite expires on ${fmtExpiresAt(input.expiresAt)}.`,
    '',
    '--',
    'taxbenchmark.ai',
  ].join('\n');
}

// ─── Handler ──────────────────────────────────────────────────────────────────

interface SendBody {
  memberId: string;
}

function bearerToken(req: VercelRequest): string | null {
  const auth = (req.headers['authorization'] as string | undefined) || '';
  const m = /^Bearer\s+(.+)$/.exec(auth);
  return m ? m[1] : null;
}

const TOKEN_TTL_DAYS = 7;

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

  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Missing Authorization bearer token' });

  const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const callerId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', callerId)
    .single();
  if (!callerProfile || callerProfile.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as SendBody;
  if (!body?.memberId) {
    return res.status(400).json({ error: 'Body must include { memberId }' });
  }

  const { data: member, error: mErr } = await admin
    .from('community_members')
    .select('id, email, name, status')
    .eq('id', body.memberId)
    .single();
  if (mErr || !member) {
    return res.status(404).json({ error: 'Member not found' });
  }
  if (member.status === 'confirmed') {
    return res.status(409).json({ error: 'Member is already confirmed; nothing to send' });
  }
  if (!member.email || !member.email.includes('@')) {
    return res.status(400).json({ error: 'Member has no valid email on file' });
  }

  // Fresh token + expiry, regardless of any prior pending invite — sending
  // again rotates the secret so a leaked old link stops working.
  // crypto.randomUUID is built into Node 19+ and the Vercel runtime.
  const confirmToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Resetting status here covers the "previously declined, admin wants to
  // try again" path — flip back to pending so the confirm page accepts it.
  const { error: updErr } = await admin
    .from('community_members')
    .update({
      confirm_token: confirmToken,
      confirm_token_expires_at: expiresAt,
      invited_at: new Date().toISOString(),
      status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', member.id);
  if (updErr) {
    return res.status(500).json({ error: `Could not stamp token: ${updErr.message}` });
  }

  // Email send.
  const resendKey = process.env.RESEND_API_KEY;
  const fromAddress =
    process.env.COMMUNITY_INVITE_FROM_ADDRESS ||
    process.env.EMAIL_FROM_ADDRESS;
  if (!resendKey || !fromAddress) {
    // We've already stamped the token, so the admin can recover by clicking
    // Resend after configuring env vars — no need to roll back the row.
    return res.status(500).json({
      error: 'Email backend not configured',
      detail: 'Set RESEND_API_KEY and one of COMMUNITY_INVITE_FROM_ADDRESS or EMAIL_FROM_ADDRESS in Vercel env',
    });
  }

  const siteUrl = (process.env.SITE_URL || 'https://taxbenchmark.ai').replace(/\/$/, '');
  const confirmUrl = `${siteUrl}/#/confirm-member?token=${encodeURIComponent(confirmToken)}`;
  const declineUrl = `${siteUrl}/#/confirm-member?token=${encodeURIComponent(confirmToken)}&decline=1`;

  const html = renderInviteHtml({
    memberName: member.name,
    confirmUrl,
    declineUrl,
    siteUrl,
    expiresAt,
  });
  const text = renderInviteText({
    memberName: member.name,
    confirmUrl,
    declineUrl,
    siteUrl,
    expiresAt,
  });

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress,
      to: member.email,
      subject: `You're invited to join the taxbenchmark.ai community`,
      text,
      html,
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return res.status(502).json({
      error: 'Email provider rejected the send',
      detail: detail.slice(0, 300),
    });
  }

  return res.status(200).json({ email: member.email, expiresAt });
}

export const config = { maxDuration: 15 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await runHandler(req, res);
  } catch (e: any) {
    return res.status(500).json({
      error: 'send-community-invite handler crashed',
      message: e?.message || 'unknown',
      stack: process.env.NODE_ENV === 'production' ? undefined : e?.stack,
    });
  }
}

// Exported for tests.
export { renderInviteHtml, renderInviteText, fmtExpiresAt, escapeHtml };
export type { InviteEmailInput, SendBody };
