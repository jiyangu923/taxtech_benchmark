/**
 * Ops stats — read-only AGGREGATE health snapshot, run via ops-stats.yml
 * (workflow_dispatch) because the service key lives in GitHub secrets.
 *
 * PUBLIC-LOG SAFE BY DESIGN: this repo is public and workflow logs are
 * readable by anyone. Print ONLY aggregate numbers — never emails, names,
 * user ids, question text, or any row-level content.
 *
 * Exit codes: 0 ok, 2 not configured.
 */

import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { checkServiceKeyShape } from './env';

const DAY_MS = 24 * 60 * 60 * 1000;

async function main(): Promise<number> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('NOT CONFIGURED — need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
    return 2;
  }
  const keyErr = checkServiceKeyShape(serviceKey);
  if (keyErr) { console.error(`NOT CONFIGURED — ${keyErr}`); return 2; }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const now = Date.now();
  const d1 = new Date(now - DAY_MS).toISOString();
  const d7 = new Date(now - 7 * DAY_MS).toISOString();

  const count = async (table: string, mod?: (q: any) => any): Promise<number | string> => {
    let q = admin.from(table).select('*', { count: 'exact', head: true });
    if (mod) q = mod(q);
    const { count: c, error } = await q;
    return error ? `ERR(${error.message.slice(0, 60)})` : (c ?? 0);
  };

  console.log('── Cohort ──────────────────────────────');
  console.log(`  submissions (current+approved): ${await count('submissions', q => q.eq('is_current', true).eq('status', 'approved'))}`);
  console.log(`  submissions (current, any status): ${await count('submissions', q => q.eq('is_current', true))}`);
  console.log(`  new current submissions, last 7d: ${await count('submissions', q => q.eq('is_current', true).gte('submittedAt', d7))}`);
  console.log(`  by role — tax_professionals: ${await count('submissions', q => q.eq('is_current', true).eq('respondentRole', 'tax_professionals'))}, tax_technology: ${await count('submissions', q => q.eq('is_current', true).eq('respondentRole', 'tax_technology'))}`);

  console.log('── AI usage ────────────────────────────');
  console.log(`  ai_answers total: ${await count('ai_answers')}`);
  console.log(`  ai_answers last 24h: ${await count('ai_answers', q => q.gte('created_at', d1))}`);
  console.log(`  ai_answers last 7d: ${await count('ai_answers', q => q.gte('created_at', d7))}`);
  console.log(`  intake turns total: ${await count('ai_answers', q => q.eq('question', '[intake turn]'))}`);
  console.log(`  intake turns last 24h: ${await count('ai_answers', q => q.eq('question', '[intake turn]').gte('created_at', d1))}`);

  // Spend: aggregate only — no per-user identifiers, just the distribution shape.
  const { data: usage, error: usageErr } = await admin.from('ai_usage').select('cost_usd, window_started_at');
  if (usageErr) {
    console.log(`  ai_usage: ERR(${usageErr.message.slice(0, 60)})`);
  } else {
    const rows = (usage ?? []).map(r => Number(r.cost_usd) || 0);
    const active = (usage ?? []).filter(r => new Date(r.window_started_at).getTime() > now - DAY_MS).length;
    const total = rows.reduce((a, b) => a + b, 0);
    const max = rows.length ? Math.max(...rows) : 0;
    console.log(`  metered users (ever): ${rows.length} · active window last 24h: ${active}`);
    console.log(`  window spend — sum: $${total.toFixed(2)} · max single user: $${max.toFixed(2)} (cap $5)`);
    console.log(`  users above 80% of cap: ${rows.filter(v => v >= 4).length}`);
  }

  console.log('── Feedback loop ───────────────────────');
  console.log(`  rated answers (any 👍/👎): ${await count('ai_answers', q => q.not('rating', 'is', null))}`);
  console.log(`  ratings up: ${await count('ai_answers', q => q.eq('rating', 1))} · down: ${await count('ai_answers', q => q.eq('rating', -1))}`);
  console.log(`  wrong-fact reports open: ${await count('answer_reports', q => q.eq('status', 'open'))}`);

  console.log('── Knowledge layer ─────────────────────');
  console.log(`  tax_rules current rows: ${await count('tax_rules', q => q.is('effective_to', null))} (expect 43)`);
  console.log(`  kb_articles published: ${await count('kb_articles', q => q.eq('status', 'published'))}`);

  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then(code => process.exit(code)).catch(e => {
    console.error('stats crashed:', e?.message || e);
    process.exit(1);
  });
}
