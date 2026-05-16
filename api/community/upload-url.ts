import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Anonymous endpoint. Member proves consent via the same confirmation token
 * they're holding from the email, and gets back a one-shot signed upload URL
 * for the community-photos bucket. The client then uploads directly to
 * Supabase Storage with `uploadToSignedUrl` and computes the public URL,
 * which it submits with the confirm action.
 *
 * Storage bucket has NO RLS write policy — uploads only happen via service-
 * role-issued signed URLs (this endpoint) or directly from the dashboard.
 */

interface UploadUrlBody {
  token: string;
  ext?: string; // file extension without the dot, e.g. "jpg", "png", "webp"
}

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

interface UploadUrlResponse {
  path: string;       // pass to uploadToSignedUrl
  signedToken: string; // pass to uploadToSignedUrl
  publicUrl: string;  // what to save as photo_url after upload succeeds
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

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as UploadUrlBody;
  const token = (body?.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Missing token' });

  // Normalize and validate ext to prevent path traversal / weird filenames.
  const ext = (body?.ext || 'jpg').toLowerCase().replace(/^\./, '');
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return res.status(400).json({
      error: `Unsupported file type. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
    });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const nowIso = new Date().toISOString();

  const { data: member, error } = await admin
    .from('community_members')
    .select('id, status, confirm_token_expires_at')
    .eq('confirm_token', token)
    .single();

  if (error || !member) {
    return res.status(401).json({ error: 'Invalid or expired invite link' });
  }
  if (member.status !== 'pending') {
    return res.status(409).json({ error: 'This invite has already been used' });
  }
  if (member.confirm_token_expires_at && member.confirm_token_expires_at < nowIso) {
    return res.status(410).json({ error: 'This invite link has expired' });
  }

  // Path prefix scopes uploads to one folder per member, which keeps the
  // bucket browsable in the dashboard and lets us delete by prefix later.
  // The uuid suffix avoids collisions if a member uploads twice (we only
  // ever reference the latest URL via the member row's photo_url).
  const path = `${member.id}/${crypto.randomUUID()}.${ext}`;

  const { data, error: signErr } = await admin.storage
    .from('community-photos')
    .createSignedUploadUrl(path);
  if (signErr || !data) {
    return res.status(500).json({ error: signErr?.message || 'Could not create upload URL' });
  }

  const { data: pub } = admin.storage.from('community-photos').getPublicUrl(path);

  const out: UploadUrlResponse = {
    path: data.path,
    signedToken: data.token,
    publicUrl: pub.publicUrl,
  };
  return res.status(200).json(out);
}

export const config = { maxDuration: 10 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await runHandler(req, res);
  } catch (e: any) {
    return res.status(500).json({
      error: 'community upload-url handler crashed',
      message: e?.message || 'unknown',
    });
  }
}

export { ALLOWED_EXTENSIONS };
export type { UploadUrlBody, UploadUrlResponse };
