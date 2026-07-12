-- ============================================================
-- Seed: Fonoa "State of Indirect Tax in the AI Era 2026" report
-- (survey of 176 indirect tax leaders, published 2026-06-17).
--
-- Curated from the public landing page — the full report is gated.
-- If the full PDF is downloaded later, upload it via the admin
-- Knowledge tab's "Import with AI" for the deeper chapters.
--
-- Requires: supabase/add_kb_articles_table.sql (run first).
-- Idempotent — guarded by title, safe to re-run.
-- ============================================================

insert into public.kb_articles (title, summary, source_url, tags, status, published_at)
select * from (values
  (
    'AI adoption in indirect tax is near-universal but largely unmeasured (Fonoa 2026)',
    'Fonoa''s State of Indirect Tax in the AI Era 2026 report (survey of 176 indirect tax leaders) finds 92% of tax functions now use AI in some form, and nearly 9 in 10 face leadership pressure to adopt it. Yet 87.5% have no specific targets or KPIs for AI — only 12.5% have defined success metrics, so for most teams the de facto KPI is simply "are we using AI, yes or no".',
    'https://www.fonoa.com/resources/guides/state-of-indirect-tax-in-the-ai-era-2026',
    array['AI', 'ai-adoption', 'KPIs', 'benchmark-report', 'Fonoa'],
    'published',
    '2026-06-17T00:00:00Z'::timestamptz
  ),
  (
    'Most tax teams could not defend AI-assisted decisions in an audit (Fonoa 2026)',
    'In Fonoa''s 2026 survey of 176 indirect tax leaders, 57.4% say they would NOT be confident defending AI-assisted decisions to a tax authority if challenged. Only about a third of organizations run formal human-in-the-loop validation of AI outputs; the rest rely on informal checks, undefined processes, or exclude AI from decisions entirely. The report''s framing: authorities audit process, not technology — "you''re not defending a technology, you''re demonstrating a process."',
    'https://www.fonoa.com/resources/guides/state-of-indirect-tax-in-the-ai-era-2026',
    array['AI', 'audit-defense', 'governance', 'human-in-the-loop', 'Fonoa'],
    'published',
    '2026-06-17T00:00:00Z'::timestamptz
  ),
  (
    'Defined AI governance correlates with 8x faster compliance-workload reduction (Fonoa 2026)',
    'Fonoa''s State of Indirect Tax in the AI Era 2026 report finds organizations with defined AI governance processes see compliance workload decrease at 8x the rate of those without such structures. The report distinguishes exploring AI with individual tools from building production-ready, enterprise-scale capability, and includes a five-question accountability checklist for tax leaders covering AI usage across ten indirect-tax workflows.',
    'https://www.fonoa.com/resources/guides/state-of-indirect-tax-in-the-ai-era-2026',
    array['AI', 'governance', 'compliance-automation', 'ROI', 'Fonoa'],
    'published',
    '2026-06-17T00:00:00Z'::timestamptz
  )
) as seed(title, summary, source_url, tags, status, published_at)
where not exists (
  select 1 from public.kb_articles k where k.title = seed.title
);
