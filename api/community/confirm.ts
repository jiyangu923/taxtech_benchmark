import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Anonymous endpoint. Member submits either:
 *   - action='confirm' with their edited fields → row flipped to confirmed
 *     and immediately appears on /community
 *   - action='decline' → row flipped to declined and stays off /community
 *
 * Either way, the confirm_token is cleared so the link can't be replayed.
 *
 * Server-side input sanitization mirrors what the admin form does:
 *   - name required, trimmed
 *   - role/company optional, trimmed, null if empty
 *   - linkedin_url optional, normalized to include https://
 *   - photo_url optional, accepted as-is (it's the publicUrl from a prior
 *     signed-upload-URL flow, or a URL the admin already stored)
 *
 * The member CANNOT change their email — that's the invariant the admin set
 * when they created the row, and changing it would break the audit trail.
 */

interface ConfirmBody {
  token: string;
  action: 'confirm' | 'decline';
  name?: string;
  role?: string | null;
  company?: string | null;
  linkedin_url?: string | null;
  photo_url?: string | null;
}

interface ConfirmResponse {
  status: 'confirmed' | 'declined';
}

const MAX_LEN = {
  name: 120,
  role: 120,
  company: 120,
  url: 500,
};

function normalizeUrl(input: string | null | undefined): string | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  // Add scheme first so the eventual `https://` prefix is always present,
  // then clip — otherwise a bare-domain string longer than MAX_LEN would be
  // returned without the prefix.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.length > MAX_LEN.url ? withScheme.slice(0, MAX_LEN.url) : withScheme;
}

function clipString(input: string | null | undefined, max: number): string | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

async function runHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as ConfirmBody;
  const token = (body?.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Missing token' });
  if (body?.action !== 'confirm' && body?.action !== 'decline') {
    return res.status(400).json({ error: 'action must be "confirm" or "decline"' });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const nowIso = new Date().toISOString();

  const { data: member, error: lookupErr } = await admin
    .from('community_members')
    .select('id, status, confirm_token_expires_at')
    .eq('confirm_token', token)
    .single();

  if (lookupErr || !member) {
    return res.status(401).json({ error: 'Invalid or expired invite link' });
  }
  if (member.status !== 'pending') {
    return res.status(409).json({ error: 'This invite has already been used' });
  }
  if (member.confirm_token_expires_at && member.confirm_token_expires_at < nowIso) {
    return res.status(410).json({ error: 'This invite link has expired' });
  }

  let patch: Record<string, any>;

  if (body.action === 'decline') {
    patch = {
      status: 'declined',
      declined_at: nowIso,
      confirm_token: null,
      confirm_token_expires_at: null,
      updated_at: nowIso,
    };
  } else {
    // confirm — validate and clean the edited fields.
    const name = clipString(body.name, MAX_LEN.name);
    if (!name) return res.status(400).json({ error: 'Name is required to confirm' });

    patch = {
      name,
      role: clipString(body.role, MAX_LEN.role),
      company: clipString(body.company, MAX_LEN.company),
      linkedin_url: normalizeUrl(body.linkedin_url),
      photo_url: normalizeUrl(body.photo_url),
      status: 'confirmed',
      confirmed_at: nowIso,
      confirm_token: null,
      confirm_token_expires_at: null,
      updated_at: nowIso,
    };
  }

  const { error: updErr } = await admin
    .from('community_members')
    .update(patch)
    .eq('id', member.id);
  if (updErr) {
    return res.status(500).json({ error: `Could not save: ${updErr.message}` });
  }

  const out: ConfirmResponse = { status: body.action === 'confirm' ? 'confirmed' : 'declined' };
  return res.status(200).json(out);
}

export const config = { maxDuration: 10 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await runHandler(req, res);
  } catch (e: any) {
    return res.status(500).json({
      error: 'community confirm handler crashed',
      message: e?.message || 'unknown',
    });
  }
}

// Exported for tests — pure logic, no env/network deps.
export { normalizeUrl, clipString, MAX_LEN };
export type { ConfirmBody, ConfirmResponse };
