import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

/**
 * Admin-only AI ingestion for the knowledge base.
 *
 * Accepts ONE of:
 *   - { text }        raw pasted text (newsletter, alert, statute excerpt)
 *   - { url }         a public page — fetched server-side, tags stripped
 *   - { pdfBase64 }   a PDF (≤ ~3.5MB base64) — read natively by Claude
 *
 * Returns { articles: [{ title, summary, tags, source_url, effective_date }] }
 * — the client shows them for review and inserts via the normal kb_articles
 * path (drafts or published). This endpoint never writes to the DB.
 *
 * The change-type tag vocabulary is borrowed from the taxinfra project's
 * RegulatoryChange taxonomy so downstream tooling can rely on stable tags.
 *
 * Same inline-everything constraint as the other /api functions (Vercel's
 * bundler can't resolve relative TS imports outside /api with type:module).
 */

const EXTRACTION_MODEL = 'claude-haiku-4-5';
const MAX_INPUT_CHARS = 60_000;       // ~15k tokens of source text
const MAX_PDF_BASE64_CHARS = 5_000_000; // ~3.7MB binary — under Vercel body limits
const MAX_ARTICLES = 12;

// taxinfra RegulatoryChangeType vocabulary (agents/regulatory.py).
const CHANGE_TYPES = [
  'rate_change', 'new_tax', 'threshold_change', 'filing_change',
  'e_invoicing_mandate', 'exemption_change', 'treaty_update', 'legislation',
] as const;

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    articles: {
      type: 'array',
      description: `Distinct tax-relevant knowledge items found in the source (max ${MAX_ARTICLES}). Split digests into one item per development; return a single item for a single-topic document. Return an empty array if nothing is tax-relevant.`,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Factual one-line title stating what changed/applies (not a headline tease).' },
          summary: { type: 'string', description: '2-4 plain sentences: what happened/applies, who is affected, effective when. Facts only — no commentary.' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: `2-5 tags. Include the jurisdiction (e.g. "France", "US-CA", "EU") and exactly one change-type tag from: ${CHANGE_TYPES.join(', ')}.`,
          },
          effective_date: { type: ['string', 'null'], description: 'ISO date (YYYY-MM-DD) the change takes effect, or null if not stated.' },
        },
        required: ['title', 'summary', 'tags', 'effective_date'],
        additionalProperties: false,
      },
    },
  },
  required: ['articles'],
  additionalProperties: false,
} as const;

const EXTRACTION_SYSTEM = `You extract tax-law and tax-technology knowledge for an indirect-tax benchmark community. From the provided source, extract each distinct, dateable, tax-relevant development or rule as a separate item. Prefer indirect tax (VAT/GST/sales tax, e-invoicing, digital reporting) but include any material tax development. Never invent facts not present in the source; when in doubt, omit. Write summaries a busy tax leader can absorb in ten seconds.`;

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/** Crude but dependency-free HTML → text: drops scripts/styles/tags, collapses whitespace. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>(?=\S)/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

function capText(s: string, max = MAX_INPUT_CHARS): string {
  return s.length > max ? s.slice(0, max) : s;
}

interface ExtractedArticle {
  title: string;
  summary: string;
  tags: string[];
  effective_date: string | null;
}

/** Validates/normalizes the model's output; drops malformed items, caps count. */
function sanitizeArticles(raw: any): ExtractedArticle[] {
  const items = Array.isArray(raw?.articles) ? raw.articles : [];
  const out: ExtractedArticle[] = [];
  for (const a of items) {
    if (!a || typeof a.title !== 'string' || typeof a.summary !== 'string') continue;
    const title = a.title.trim();
    const summary = a.summary.trim();
    if (!title || !summary) continue;
    const tags = Array.isArray(a.tags) ? a.tags.filter((t: any) => typeof t === 'string' && t.trim()).map((t: string) => t.trim()).slice(0, 6) : [];
    const eff = typeof a.effective_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a.effective_date)
      ? a.effective_date.slice(0, 10) : null;
    out.push({ title: title.slice(0, 200), summary: summary.slice(0, 1200), tags, effective_date: eff });
    if (out.length >= MAX_ARTICLES) break;
  }
  return out;
}

// ── Handler ──────────────────────────────────────────────────────────────────

function bearerToken(req: VercelRequest): string | null {
  const auth = (req.headers['authorization'] as string | undefined) || '';
  const m = /^Bearer\s+(.+)$/.exec(auth);
  return m ? m[1] : null;
}

interface IngestBody {
  text?: string;
  url?: string;
  pdfBase64?: string;
  filename?: string;
}

async function runHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return res.status(500).json({ error: 'Auth backend not configured' });
  }

  // Admin-only: identify the caller, then check their profile role.
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Missing Authorization bearer token' });
  const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Invalid token' });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: profile } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
  if ((profile as any)?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as IngestBody;
  const provided = [body?.text, body?.url, body?.pdfBase64].filter(Boolean).length;
  if (provided !== 1) {
    return res.status(400).json({ error: 'Provide exactly one of: text, url, pdfBase64' });
  }

  // Assemble the model input.
  const content: any[] = [];
  let sourceUrl: string | null = null;

  if (body.pdfBase64) {
    if (body.pdfBase64.length > MAX_PDF_BASE64_CHARS) {
      return res.status(413).json({ error: 'PDF too large — keep uploads under ~3.5MB (split larger documents).' });
    }
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: body.pdfBase64 },
    });
    content.push({ type: 'text', text: `Extract the tax-relevant knowledge items from this document${body.filename ? ` (${body.filename})` : ''}.` });
  } else if (body.url) {
    let parsed: URL;
    try {
      parsed = new URL(body.url);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error('bad protocol');
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    sourceUrl = parsed.toString();
    let pageText = '';
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const resp = await fetch(sourceUrl, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'taxbenchmark-kb-ingest/1.0 (+https://taxbenchmark.ai)' },
      });
      clearTimeout(t);
      if (!resp.ok) return res.status(502).json({ error: `Source returned HTTP ${resp.status}` });
      pageText = htmlToText(await resp.text());
    } catch {
      return res.status(502).json({ error: 'Could not fetch that URL (timeout or network error).' });
    }
    if (pageText.length < 200) {
      return res.status(422).json({ error: 'That page had too little readable text (it may require JavaScript). Paste the text instead.' });
    }
    content.push({ type: 'text', text: `Source URL: ${sourceUrl}\n\nExtract the tax-relevant knowledge items from this page content:\n\n${capText(pageText)}` });
  } else {
    const text = (body.text || '').trim();
    if (text.length < 40) return res.status(422).json({ error: 'Paste at least a paragraph of source text.' });
    content.push({ type: 'text', text: `Extract the tax-relevant knowledge items from this text:\n\n${capText(text)}` });
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 4000,
    system: EXTRACTION_SYSTEM,
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
  } as any);

  const textBlock = (response as any).content?.find((b: any) => b.type === 'text');
  let parsed: any = null;
  try {
    parsed = JSON.parse(textBlock?.text ?? '');
  } catch {
    return res.status(502).json({ error: 'Extraction returned invalid JSON — try again or paste cleaner text.' });
  }

  const articles = sanitizeArticles(parsed).map(a => ({ ...a, source_url: sourceUrl }));
  return res.status(200).json({ articles, count: articles.length });
}

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await runHandler(req, res);
  } catch (e: any) {
    return res.status(500).json({ error: 'kb-ingest handler crashed', message: e?.message || 'unknown' });
  }
}

// Exported for tests — pure helpers only.
export { htmlToText, capText, sanitizeArticles, CHANGE_TYPES, EXTRACTION_SCHEMA, MAX_ARTICLES, MAX_INPUT_CHARS };
export type { ExtractedArticle, IngestBody };
