-- ============================================================
-- Seed: curated industry knowledge, July 2026 sweep (26 articles).
-- Sources: KPMG, PwC, EY, Deloitte-adjacent trackers, Thomson Reuters,
-- Sovos, Vertex, official EU/ZATCA/LHDN material and specialist
-- e-invoicing trackers. Facts limited to what each source states.
--
-- Requires: supabase/add_kb_articles_table.sql (run first).
-- Idempotent — guarded by title, safe to re-run.
-- ============================================================

insert into public.kb_articles (title, summary, source_url, tags, status, published_at)
select * from (values
  -- ── Europe: e-invoicing mandates ────────────────────────────────────────
  (
    'Belgium: B2B structured e-invoicing mandatory since 1 January 2026',
    'Since 1 January 2026, all VAT-registered Belgian enterprises must exchange structured e-invoices for domestic B2B transactions via the Peppol network, following the EN 16931 European standard. A roughly three-month administrative tolerance period softened initial enforcement, but the obligation itself applies from day one of 2026.',
    'https://tradeshift.com/resources/compliance/belgium-b2b-e-invoicing-mandate-2026-tolerance-period/',
    array['Belgium', 'e_invoicing_mandate', 'Peppol', 'EN16931'],
    'published', '2026-01-01T00:00:00Z'::timestamptz
  ),
  (
    'Poland: KSeF e-invoicing goes mandatory in waves through 2026-2027',
    'Poland''s national e-invoicing platform KSeF becomes mandatory for large taxpayers on 1 February 2026, with most other VAT-registered businesses following on 1 April 2026 and micro-entrepreneurs from 1 January 2027. Invoices must be issued through the government platform rather than exchanged directly.',
    'https://www.fiskaly.com/blog/e-invoicing-mandates-in-europe-2026',
    array['Poland', 'e_invoicing_mandate', 'KSeF'],
    'published', '2026-02-01T00:00:00Z'::timestamptz
  ),
  (
    'France: e-invoicing receive obligation hits all businesses September 2026',
    'France makes e-invoicing and e-reporting mandatory for domestic B2B transactions from 1 September 2026. From that date every business — including SMEs — must be able to RECEIVE e-invoices; the obligation to ISSUE them applies to large and mid-size companies first, with SMEs issuing from September 2027. Forbes called 2026 "the year mandatory e-invoicing sweeps across Europe" (Poland, Belgium, France).',
    'https://www.forbes.com/sites/aleksandrabal/2025/11/02/2026-the-year-mandatory-e-invoicing-sweeps-across-europe/',
    array['France', 'e_invoicing_mandate', 'e-reporting'],
    'published', '2025-11-02T00:00:00Z'::timestamptz
  ),
  (
    'Germany: mandatory e-invoice issuance from 2027, all companies by 2028',
    'Germany''s B2B e-invoicing mandate phases in issuance obligations: from 1 January 2027 for companies with turnover above EUR 800k, and from 1 January 2028 for all companies, phasing out paper and unstructured PDF invoices. (Receiving structured e-invoices has been required since the earlier phase of the mandate.)',
    'https://www.lasernetgroup.com/news-blogs/complete-guide-to-2026-and-2027-einvoicing-mandates',
    array['Germany', 'e_invoicing_mandate'],
    'published', '2026-07-12T00:00:00Z'::timestamptz
  ),
  (
    'Spain: Verifactu delayed to 2027; separate B2B e-invoicing decree approved March 2026',
    'Spain postponed its Verifactu certified-invoicing-software obligations to 1 January 2027 for corporate taxpayers and 1 July 2027 for all others (Real Decreto-ley 15/2025 of 2 December 2025). Separately, the Council of Ministers approved a royal decree on 24 March 2026 introducing mandatory B2B e-invoicing, phased: companies with revenue above EUR 8M get one year from publication of the platform''s ministerial order; all others get two years.',
    'https://kpmg.com/us/en/taxnewsflash/news/2026/03/spain-e-invoicing-mandate-b2b.html',
    array['Spain', 'e_invoicing_mandate', 'Verifactu', 'filing_change'],
    'published', '2026-03-24T00:00:00Z'::timestamptz
  ),
  (
    'Greece: B2B e-invoicing mandate set for February 2026',
    'Greece''s mandatory B2B e-invoicing regime is set to apply from February 2026, extending the myDATA digital-reporting ecosystem into structured invoice exchange and adding Greece to the wave of European mandates going live in 2026.',
    'https://www.invoicenavigator.eu/deadlines',
    array['Greece', 'e_invoicing_mandate', 'myDATA'],
    'published', '2026-07-12T00:00:00Z'::timestamptz
  ),
  (
    'EU ViDA package: adopted March 2025, milestones run to January 2035',
    'The EU''s VAT in the Digital Age (ViDA) package was adopted on 11 March 2025 and rolls out progressively: OSS/IOSS clarifications by January 2027; platform-economy deemed-supplier rules (short-term accommodation and road passenger transport) plus Single VAT Registration from 1 July 2028; mandatory Digital Reporting Requirements for cross-border B2B transactions from 1 July 2030 (replacing EC Sales Lists); and full harmonization of domestic reporting systems to the EN 16931 standard by 1 January 2035 — including pre-approved systems like Italy, France, Poland, Germany, Romania and Belgium.',
    'https://taxation-customs.ec.europa.eu/taxation/vat/vat-digital-age-vida_en',
    array['EU', 'ViDA', 'legislation', 'digital-reporting'],
    'published', '2025-03-11T00:00:00Z'::timestamptz
  ),
  (
    'EU VAT gap fell from EUR 99B to EUR 61B in one year, credited to e-invoicing (KPMG)',
    'KPMG''s "Future of Indirect Taxes to 2030" work cites a reduction in the EU VAT gap from EUR 99 billion to EUR 61 billion in a single year, largely attributed to e-invoicing and real-time reporting — the core evidence governments use to justify accelerating digital reporting mandates worldwide.',
    'https://kpmg.com/xx/en/our-insights/risk-and-regulation/the-future-of-indirect-taxes-to-2030.html',
    array['EU', 'VAT-gap', 'e-invoicing', 'KPMG'],
    'published', '2026-07-12T00:00:00Z'::timestamptz
  ),

  -- ── Middle East ─────────────────────────────────────────────────────────
  (
    'UAE: voluntary Peppol e-invoicing pilot July 2026, mandatory rollout from 2027',
    'The UAE opens a voluntary e-invoicing pilot window in July 2026 — businesses should have selected an Accredited Service Provider and be testing by 1 July 2026 — ahead of a phased mandatory rollout beginning January 2027. The framework starts as a Peppol 4-corner model and moves to a 5-corner model integrating the Federal Tax Authority; updated e-invoicing rules (version 1.1) were issued in June 2026.',
    'https://www.fiscal-requirements.com/news/5572',
    array['UAE', 'e_invoicing_mandate', 'Peppol'],
    'published', '2026-06-15T00:00:00Z'::timestamptz
  ),
  (
    'Saudi Arabia: ZATCA Phase 2 waves 23-24 pull in SMEs by mid-2026',
    'ZATCA''s Phase 2 (integration with the Fatoora platform) continues expanding: Wave 23 covers VAT-registered businesses with taxable turnover above SAR 750k (integration due 31 March 2026), and Wave 24 — the largest wave so far — drops the threshold to SAR 375k with compliance due by 30 June 2026, when the penalty waiver ends and full enforcement begins.',
    'https://www.flick.network/en-ae/zatca-wave-24-phase-2-einvoicing-2026-guide',
    array['Saudi Arabia', 'e_invoicing_mandate', 'ZATCA', 'threshold_change'],
    'published', '2026-07-12T00:00:00Z'::timestamptz
  ),
  (
    'GCC: first amendments to the Unified VAT Agreement + GCC-UK trade deal (PwC Q2 2026)',
    'PwC''s GCC Indirect Tax News Roundup for Q2 2026 highlights two regional milestones: the first-ever amendments to the GCC Unified VAT Agreement and the signing of the GCC-UK Free Trade Agreement, alongside tax authorities across the region enhancing compliance frameworks and advancing digital transformation programs.',
    'https://www.pwc.com/m1/en/services/tax/middle-east-tax-news-alerts/2026/gcc-indirect-tax-news-roundup-q2-2026.html',
    array['GCC', 'legislation', 'treaty_update', 'PwC'],
    'published', '2026-07-08T00:00:00Z'::timestamptz
  ),

  -- ── Asia-Pacific ────────────────────────────────────────────────────────
  (
    'Malaysia: MyInvois Phase 4 live January 2026; exemption threshold raised to RM1M',
    'Malaysia''s MyInvois e-invoicing Phase 4 (annual turnover RM 1M-5M) went live 1 January 2026 with a relaxation period to 31 December 2027. On 6 December 2025 the Cabinet raised the permanent exemption threshold from RM 500k to RM 1M turnover and cancelled the planned Phase 5. Also from 1 January 2026, individual e-invoices are mandatory for transactions above RM 10,000 — consolidated invoices are no longer allowed above that value.',
    'https://rtcsuite.com/malaysias-new-rm1-million-e-invoicing-threshold-a-focused-update/',
    array['Malaysia', 'e_invoicing_mandate', 'threshold_change', 'MyInvois'],
    'published', '2025-12-06T00:00:00Z'::timestamptz
  ),
  (
    'Singapore: InvoiceNow GST transmission required for new voluntary registrants from April 2026',
    'From 1 April 2026, companies applying for voluntary GST registration in Singapore must transmit invoice data to IRAS via the InvoiceNow (Peppol) network. The requirement covers B2B and B2G transactions — narrower than Malaysia''s regime, which spans B2C as well and is oriented to income tax.',
    'https://altomate.io/sg/blog/starting_business/invoicenow-singapore-the-2026-guide-to-e-invoicing-and-gst-registration/',
    array['Singapore', 'filing_change', 'InvoiceNow', 'GST'],
    'published', '2026-04-01T00:00:00Z'::timestamptz
  ),

  -- ── Americas ────────────────────────────────────────────────────────────
  (
    'Brazil: 2026 is the pilot year of the CBS/IBS dual-VAT reform (through 2033)',
    'Brazil began its multi-year transition to a new consumption-tax model in January 2026: test rates of roughly 0.9% CBS (federal) and 0.1% IBS (state/municipal) run alongside existing PIS/COFINS/ICMS/ISS, with no new collection obligations — authorities describe 2026 as an "educational year" for systems adjustment. CBS fully replaces PIS/COFINS in 2027; IBS ramps up 2029-2032 as ICMS/ISS phase down; the combined target rate is approximately 28% (8.8% CBS + 17.7% IBS under PLP 108/2024).',
    'https://www.fiscal-requirements.com/news/4936',
    array['Brazil', 'legislation', 'new_tax', 'CBS-IBS'],
    'published', '2026-01-06T00:00:00Z'::timestamptz
  ),
  (
    'Brazil: CBS/IBS fields become mandatory in e-invoices from August 2026, with penalties',
    'From 1 August 2026, businesses under Brazil''s regular tax regime must issue electronic tax documents containing the mandatory CBS and IBS fields — ending the adaptation phase of the reform and shifting to enforceable compliance. Penalties can apply from 1 August 2026 for failing to include taxable transactions in reporting.',
    'https://www.vatupdate.com/2026/07/06/brazil-tax-reform-moves-to-mandatory-phase-cbs-and-ibs-become-operational-in-e-invoicing/',
    array['Brazil', 'e_invoicing_mandate', 'filing_change', 'CBS-IBS'],
    'published', '2026-07-06T00:00:00Z'::timestamptz
  ),
  (
    'US: states keep dropping the 200-transaction nexus test — Illinois latest from January 2026',
    'The post-Wayfair economic-nexus landscape keeps consolidating toward revenue-only thresholds: over 16 states including California, Illinois and Washington have removed the 200-transaction count. Illinois dropped it on 1 January 2026 and counts GROSS sales (including exempt items) toward its $100k threshold. Current landscape: 41 states use a $100k threshold, two use $250k, and three use $500k.',
    'https://taxcloud.com/blog/sales-tax-changes-2026/',
    array['US', 'threshold_change', 'economic-nexus', 'sales-tax'],
    'published', '2026-07-12T00:00:00Z'::timestamptz
  ),
  (
    'US: retail delivery fees active in Colorado and Minnesota — a template other states watch',
    'Colorado continues its $0.50 retail delivery fee and Minnesota charges $0.50 on retail deliveries of $100 or more. The fees must appear as separate line items on invoices to avoid audit complications, and 2026 state changes to taxability rules, nexus standards and exemptions were flagged in Arkansas, Illinois, Maine, Missouri, Nebraska, Ohio, Rhode Island, Texas, Utah, Washington and DC.',
    'https://taxcloud.com/blog/sales-tax-changes-2026/',
    array['US', 'new_tax', 'retail-delivery-fee', 'sales-tax'],
    'published', '2026-07-12T00:00:00Z'::timestamptz
  ),
  (
    'US sales-tax rate and rule changes hit record levels in 2025 (Vertex)',
    'Vertex''s end-of-year tracking reported record-level growth in US sales-tax rate and rules changes during 2025 amid fiscal pressure on states and localities — reinforcing that compliance churn, not just new mandates, is a primary workload driver for US indirect tax teams heading into 2026.',
    'https://www.vertexinc.com/company/news/latest-news/vertex-report-us-sees-record-level-growth-sales-tax-rates-and-rules-changes-2025-amid-fiscal',
    array['US', 'rate_change', 'sales-tax', 'Vertex'],
    'published', '2026-07-12T00:00:00Z'::timestamptz
  ),

  -- ── Benchmark & survey intelligence ─────────────────────────────────────
  (
    'KPMG 2026 Indirect Tax Benchmarking Survey: data quality and legacy ERPs are the pressure points',
    'KPMG''s 2026 Indirect Tax Benchmarking Survey examines how leading organizations respond to shifts in indirect tax compliance — mounting pressure on data quality, constraints from legacy ERP systems, and the growing role of AI, automation and analytics in managing the VAT/GST landscape. Useful as a peer reference for how top functions are structuring their technology response.',
    'https://kpmg.com/xx/en/our-insights/operations/indirect-tax-benchmark-survey.html',
    array['global', 'benchmark-report', 'KPMG', 'data-quality'],
    'published', '2026-07-12T00:00:00Z'::timestamptz
  ),
  (
    'KPMG "Future of Indirect Taxes to 2030": AI and e-invoicing reshape how governments collect',
    'KPMG''s multi-year outlook examines how innovations from AI to electronic invoicing are transforming business operations and government tax collection. It frames e-invoicing as one step in a broader digital transformation journey rather than an endpoint, and offers forecasts for how indirect taxes evolve through 2030 in response to technology and societal change.',
    'https://kpmg.com/xx/en/our-insights/risk-and-regulation/the-future-of-indirect-taxes-to-2030.html',
    array['global', 'benchmark-report', 'KPMG', 'AI'],
    'published', '2026-07-12T00:00:00Z'::timestamptz
  ),
  (
    'EY: 78% of companies juggle 4-7 ERPs; half of tax leaders lack a sustainable data plan',
    'EY''s Tax Technology and Transformation research finds 78% of companies run between four and seven ERP systems — just one of several data sources tax must reconcile — and 50% of tax department leaders say the lack of a sustainable data/technology plan is the biggest barrier to delivering their function''s vision. A bright spot: in recent ERP upgrades, data is being sensitized for direct and indirect tax reporting nearly 90% of the time.',
    'https://www.ey.com/en_us/insights/tax/tax-transformation-examining-the-critical-role-of-data-and-technology',
    array['global', 'benchmark-report', 'EY', 'ERP', 'data-quality'],
    'published', '2026-07-12T00:00:00Z'::timestamptz
  ),
  (
    'EY: 95% say tax skills must expand beyond tax; 87% expect GenAI efficiency gains',
    'In EY''s Tax and Finance Operations survey, 95% of respondents said tax technical competencies need to be augmented with process, data and technology skills, and 87% said GenAI in particular will help drive effectiveness and efficiency in their teams over the next three years — the talent-mix shift underlying most tax-technology hiring debates.',
    'https://www.ey.com/en_gl/insights/tax/how-gen-ai-is-reshaping-the-future-of-tax-talent',
    array['global', 'benchmark-report', 'EY', 'AI', 'talent'],
    'published', '2026-07-12T00:00:00Z'::timestamptz
  ),
  (
    'Thomson Reuters 2026: tax-tech satisfaction crashed from 56% to 34% in one year',
    'The 2026 Corporate Tax Department Technology Report (Thomson Reuters Institute) finds satisfaction with tax technology plummeted to 34% from 56% in a single year, 64% of departments still operate in chaotic or reactive modes, and most tax leaders say upgrading tax technology remains a low priority at their company — a "frustration gap" between AI ambitions and operational reality.',
    'https://www.thomsonreuters.com/en-us/posts/corporates/corporate-tax-department-technology-report-2026/',
    array['global', 'benchmark-report', 'Thomson-Reuters', 'tax-technology'],
    'published', '2026-03-15T00:00:00Z'::timestamptz
  ),
  (
    'Thomson Reuters 2026: AI now central for 7% of tax teams; compliance automation tops the wishlist',
    'Per the same 2026 report, the share of corporate tax departments saying AI is already central to their workflow more than tripled — from 2% to 7% — and the most common expectation is centrality within one to two years. Top expected AI applications: automating routine compliance (69%) and accelerating technical research (61%). But only 50% of departments provided technology training in 2025, and while 69% expect a tech-budget increase, only about 39% of last year''s optimists actually got one.',
    'https://tax.thomsonreuters.com/blog/direct-tax-leaders-are-working-to-close-the-frustration-gap-six-findings-from-the-2026-tax-technology-report-tri/',
    array['global', 'benchmark-report', 'Thomson-Reuters', 'AI', 'training'],
    'published', '2026-03-15T00:00:00Z'::timestamptz
  ),
  (
    'Sovos: 82% of companies feel more exposed to tax-compliance risk than five years ago',
    'Sovos''s State of Tax Compliance research (October 2025) found 82% of companies believe they are more exposed to tax-related compliance risk than five years ago and 90% expect compliance costs to keep rising as governments abandon declarative reporting for real-time data collection — embedding themselves directly into AR, AP, logistics and general-ledger systems. 95% of finance leaders call accurate real-time reporting critical and 94% are investing in automation; a separate Sovos survey found 58% of finance leaders struggle to keep pace with mandates even as AI adoption rises.',
    'https://sovos.com/press-releases/sovos-2025-state-of-tax-compliance-82-of-companies-face-higher-risk-as-governments-shift-to-real-time-data-collection/',
    array['global', 'benchmark-report', 'Sovos', 'real-time-reporting'],
    'published', '2025-10-28T00:00:00Z'::timestamptz
  ),
  (
    'Vertex 2026: only 12% of organizations have fully integrated tax technology',
    'Vertex research published May 2026 (1,050 senior IT, Finance and Tax leaders across the US, UK and Europe) finds gaps between IT, Tax and Finance teams are a growing compliance barrier that puts revenue at risk as regulatory demands accelerate. Only 12% of organizations report fully integrated tax technology, despite 94% expecting stronger cross-functional collaboration.',
    'https://www.vertexinc.com/company/news/latest-news/new-vertex-research-highlights-rising-revenue-risk-it-tax-and-finance-misalignment',
    array['global', 'benchmark-report', 'Vertex', 'integration'],
    'published', '2026-05-19T00:00:00Z'::timestamptz
  )
) as seed(title, summary, source_url, tags, status, published_at)
where not exists (
  select 1 from public.kb_articles k where k.title = seed.title
);
