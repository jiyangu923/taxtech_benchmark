import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Anonymous endpoint. The member opens /#/confirm-member?token=… and the
 * page POSTs the token here to fetch the prefill data for the form.
 *
 * We never return the token, the email-only confirmation flow id, or any
 * fields the member can't see — just the public-facing card fields and the
 * email they were invited under (so they can confirm "yes this is me").
 */

interface LookupBody {
  token: string;
}

interface LookupResponse {
  email: string;
  name: string;
  role: string | null;
  company: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
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

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as LookupBody;
  const token = (body?.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Missing token' });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Token must match, row must be pending, and the expiry (if set) must be
  // in the future. We use the service role to bypass RLS — the trust check
  // is the token itself.
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from('community_members')
    .select('email, name, role, company, linkedin_url, photo_url, status, confirm_token_expires_at')
    .eq('confirm_token', token)
    .single();

  if (error || !data) {
    return res.status(401).json({ error: 'Invalid or expired invite link' });
  }
  if (data.status !== 'pending') {
    return res.status(409).json({ error: 'This invite has already been used' });
  }
  if (data.confirm_token_expires_at && data.confirm_token_expires_at < nowIso) {
    return res.status(410).json({ error: 'This invite link has expired' });
  }

  const out: LookupResponse = {
    email: data.email,
    name: data.name,
    role: data.role,
    company: data.company,
    linkedin_url: data.linkedin_url,
    photo_url: data.photo_url,
  };
  return res.status(200).json(out);
}

export const config = { maxDuration: 10 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await runHandler(req, res);
  } catch (e: any) {
    return res.status(500).json({
      error: 'community lookup handler crashed',
      message: e?.message || 'unknown',
    });
  }
}

export type { LookupBody, LookupResponse };
