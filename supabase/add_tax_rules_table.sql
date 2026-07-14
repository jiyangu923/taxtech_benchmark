-- Phase 0 (AI harness) — law-as-code: the tax_rules table + seed.
--
-- The knowledge layer the deterministic lookup_rate tool reads (docs/AI_HARNESS_PLAN.md L1/L2):
-- Taxi must NEVER compute a rate from the model's memory — it calls a tool that
-- reads THIS table and cites it (⚖️ chip). Ported from ~/taxinfra:
--   - EU-30 VAT (27 EU + GB/CH/NO), standard + reduced, verified 2026-05-30
--     (eu_vat_scraper.py EU_VAT_RATES_2026)
--   - Canada 13 provinces GST/PST/HST, verified 2026-01-01 (ca.py CANADA_RATES)
-- (Vouched datasets only, per the CEO review; IN/APAC/US-sales-tax deferred to Phase 1.)
--
-- Effective-dated + provenanced from day one (taxinfra ignored as_of; we don't):
-- every row has effective_from/to, source_url, and last_verified so staleness
-- (>90d) is queryable. rate values are PERCENT (19.0 = 19%). Canada's combined
-- rate is in standard_rate with the gst/pst/hst split in components.
--
-- Idempotent. Re-running refreshes the seed to match this file.

create table if not exists public.tax_rules (
  id                uuid primary key default gen_random_uuid(),
  jurisdiction      text not null,               -- 'DE', 'GB', 'CA-QC' (ISO-ish)
  jurisdiction_name text not null,
  tax_type          text not null,               -- 'VAT' | 'GST_HST'
  standard_rate     numeric not null,            -- percent; Canada = combined total
  reduced_rates     jsonb not null default '[]', -- percents, e.g. [7.0]
  components         jsonb,                       -- Canada: {gst,pst,hst}; null for VAT
  notes             text,
  source_url        text,
  last_verified     date,
  effective_from    date not null default date '2026-01-01',
  effective_to      date,                         -- null = still in effect
  created_at        timestamptz not null default now()
);

-- The lookup_rate hot path: jurisdiction + tax_type + newest effective row.
create index if not exists tax_rules_lookup_idx
  on public.tax_rules (jurisdiction, tax_type, effective_from desc);

alter table public.tax_rules enable row level security;

-- Public tax rates — low sensitivity. Any signed-in user may read; the tool
-- itself reads via the service role. No write policy (seed/admin only).
drop policy if exists "Anyone signed in can read tax rules" on public.tax_rules;
create policy "Anyone signed in can read tax rules"
  on public.tax_rules for select
  using (auth.uid() is not null);

-- ── Seed ─────────────────────────────────────────────────────────────────────
-- Idempotent: clear the current-effective seed rows, then re-insert. Scoped to
-- effective_to is null so any future historical rows added later are preserved.
delete from public.tax_rules where effective_to is null;

insert into public.tax_rules
  (jurisdiction, jurisdiction_name, tax_type, standard_rate, reduced_rates, components, source_url, last_verified, effective_from, effective_to)
values
  ('AT', 'Austria', 'VAT', 20.0, '[10.0, 13.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('BE', 'Belgium', 'VAT', 21.0, '[6.0, 12.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('BG', 'Bulgaria', 'VAT', 20.0, '[9.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('CY', 'Cyprus', 'VAT', 19.0, '[5.0, 9.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('CZ', 'Czech Republic', 'VAT', 21.0, '[12.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('DE', 'Germany', 'VAT', 19.0, '[7.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('DK', 'Denmark', 'VAT', 25.0, '[]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('EE', 'Estonia', 'VAT', 22.0, '[9.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('ES', 'Spain', 'VAT', 21.0, '[4.0, 10.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('FI', 'Finland', 'VAT', 25.5, '[10.0, 14.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('FR', 'France', 'VAT', 20.0, '[5.5, 10.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('GR', 'Greece', 'VAT', 24.0, '[6.0, 13.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('HR', 'Croatia', 'VAT', 25.0, '[5.0, 13.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('HU', 'Hungary', 'VAT', 27.0, '[5.0, 18.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('IE', 'Ireland', 'VAT', 23.0, '[9.0, 13.5]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('IT', 'Italy', 'VAT', 22.0, '[5.0, 10.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('LT', 'Lithuania', 'VAT', 21.0, '[5.0, 9.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('LU', 'Luxembourg', 'VAT', 17.0, '[3.0, 8.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('LV', 'Latvia', 'VAT', 21.0, '[5.0, 12.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('MT', 'Malta', 'VAT', 18.0, '[5.0, 7.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('NL', 'Netherlands', 'VAT', 21.0, '[9.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('PL', 'Poland', 'VAT', 23.0, '[5.0, 8.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('PT', 'Portugal', 'VAT', 23.0, '[6.0, 13.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('RO', 'Romania', 'VAT', 19.0, '[5.0, 9.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('SE', 'Sweden', 'VAT', 25.0, '[6.0, 12.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('SI', 'Slovenia', 'VAT', 22.0, '[5.0, 9.5]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('SK', 'Slovakia', 'VAT', 23.0, '[5.0, 19.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('GB', 'United Kingdom', 'VAT', 20.0, '[5.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('CH', 'Switzerland', 'VAT', 8.1, '[2.6, 3.8]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('NO', 'Norway', 'VAT', 25.0, '[12.0, 15.0]'::jsonb, null, 'https://taxation-customs.ec.europa.eu/taxation/vat/vat-rates_en', date '2026-05-30', date '2026-01-01', null),
  ('CA-AB', 'Alberta', 'GST_HST', 5.0, '[]'::jsonb, '{"gst": 5.0, "pst": 0.0, "hst": 0.0}'::jsonb, 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html', date '2026-01-01', date '2026-01-01', null),
  ('CA-BC', 'British Columbia', 'GST_HST', 12.0, '[]'::jsonb, '{"gst": 5.0, "pst": 7.0, "hst": 0.0}'::jsonb, 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html', date '2026-01-01', date '2026-01-01', null),
  ('CA-MB', 'Manitoba', 'GST_HST', 12.0, '[]'::jsonb, '{"gst": 5.0, "pst": 7.0, "hst": 0.0}'::jsonb, 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html', date '2026-01-01', date '2026-01-01', null),
  ('CA-NB', 'New Brunswick', 'GST_HST', 15.0, '[]'::jsonb, '{"gst": 0.0, "pst": 0.0, "hst": 15.0}'::jsonb, 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html', date '2026-01-01', date '2026-01-01', null),
  ('CA-NL', 'Newfoundland & Labrador', 'GST_HST', 15.0, '[]'::jsonb, '{"gst": 0.0, "pst": 0.0, "hst": 15.0}'::jsonb, 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html', date '2026-01-01', date '2026-01-01', null),
  ('CA-NS', 'Nova Scotia', 'GST_HST', 15.0, '[]'::jsonb, '{"gst": 0.0, "pst": 0.0, "hst": 15.0}'::jsonb, 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html', date '2026-01-01', date '2026-01-01', null),
  ('CA-NT', 'Northwest Territories', 'GST_HST', 5.0, '[]'::jsonb, '{"gst": 5.0, "pst": 0.0, "hst": 0.0}'::jsonb, 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html', date '2026-01-01', date '2026-01-01', null),
  ('CA-NU', 'Nunavut', 'GST_HST', 5.0, '[]'::jsonb, '{"gst": 5.0, "pst": 0.0, "hst": 0.0}'::jsonb, 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html', date '2026-01-01', date '2026-01-01', null),
  ('CA-ON', 'Ontario', 'GST_HST', 13.0, '[]'::jsonb, '{"gst": 0.0, "pst": 0.0, "hst": 13.0}'::jsonb, 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html', date '2026-01-01', date '2026-01-01', null),
  ('CA-PE', 'Prince Edward Island', 'GST_HST', 15.0, '[]'::jsonb, '{"gst": 0.0, "pst": 0.0, "hst": 15.0}'::jsonb, 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html', date '2026-01-01', date '2026-01-01', null),
  ('CA-QC', 'Quebec', 'GST_HST', 14.975, '[]'::jsonb, '{"gst": 5.0, "pst": 9.975, "hst": 0.0}'::jsonb, 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html', date '2026-01-01', date '2026-01-01', null),
  ('CA-SK', 'Saskatchewan', 'GST_HST', 11.0, '[]'::jsonb, '{"gst": 5.0, "pst": 6.0, "hst": 0.0}'::jsonb, 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html', date '2026-01-01', date '2026-01-01', null),
  ('CA-YT', 'Yukon', 'GST_HST', 5.0, '[]'::jsonb, '{"gst": 5.0, "pst": 0.0, "hst": 0.0}'::jsonb, 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html', date '2026-01-01', date '2026-01-01', null);
