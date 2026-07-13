# Reuse Inventory: /Users/jgu/taxinfra → Vertical Tax AI

## Overview

`taxinfra` (TaxBrains) is a pre-revenue, solo-built FastAPI indirect-tax platform targeting SMB tax operations. The honest state is documented in its own `CLAUDE.md` and `AGENTS.md` (last updated 2026-05-30): **the country modules and data models are the real assets**; most "AI agents" are scaffolds with hardcoded logic, except the Notice Agent which has a genuinely wired Gemini pipeline. Trust-layer infrastructure (audit trail, explainability, traceability) is in-memory only. `CLAUDE.md:112-135` is an explicit "known issues" ledger — read it as the project's own gap analysis.

Key intent docs:
- `README.md` — aspirational architecture ("fleet of specialized AI agents"); `CLAUDE.md:13-14` explicitly warns not to trust it
- `CLAUDE.md` — binding conventions + audit findings (fake scaffolding, $0 line items, `as_of` ignored)
- `AGENTS.md` — multi-agent coordination file with backlog, build-vs-buy decisions (BUY TaxJar for US rates; BUILD EU/CA/APAC), and strategy: Tax Notice Agent → Nexus Agent → Filing Agent

## Law-as-code modules (`src/taxinfra/countries/`)

All 9 modules implement the same abstract interface (`countries/base.py:64-113`): `determine_tax()`, `get_filing_schema()`, `get_penalty_rules()`, `get_registration_threshold()`, `get_filing_deadline()`. All registered in `registry.py:30-53`. **Universal caveat: every module ignores the `as_of` date parameter** (`CLAUDE.md:130-132`) — no historical rate queries.

The interface shape (base.py:15-62) — this is the schema worth porting:

```python
class TaxDetermination(BaseModel):
    jurisdiction_code: str
    tax_type: TaxType
    taxable_amount: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    is_exempt: bool = False
    is_reverse_charge: bool = False
    rules_applied: list[str]        # human-readable rule citations

class PenaltyRule(BaseModel):
    penalty_type: str               # "late_filing" | "late_payment" | "understatement"
    rate: Decimal
    is_percentage: bool = True
    max_amount: Decimal | None
    grace_period_days: int
```

Per country:

| Module | Coverage | Completeness |
|---|---|---|
| `us.py` (187 ln) | 10 state rates hardcoded (`STATE_RATES` at us.py:31-42, e.g. `"US-CA": 7.25`), 5 no-tax states, generic 4-box sales-tax form, $100K Wayfair threshold, "20th of following month" deadline | **Thin/demo.** Their own decision (AGENTS.md:144): buy TaxJar rather than build US rates. Penalty rules are generic, not per-state |
| `uk.py` (187) | 20/5/0% VAT, export zero-rating, B2B reverse charge, **real MTD 9-box return schema** (uk.py:140-160), £90K threshold, points-based £200 late-filing + 2%/2% late-payment penalties, period+37-day deadline | **Best-in-repo.** Real domain knowledge |
| `de.py` (191) | 19/7% USt, reverse charge §13b, export exemption with UStG § citations in `rules_applied` (de.py:83-129), **real UStVA box numbers** (81/86/41/21/46/66/83), XRechnung flag, 10th-of-month deadline, Verspätungs-/Säumniszuschlag penalties | **Good.** Statute citations are a nice pattern |
| `in_.py` (275) | 18% GST with **CGST/SGST intra-state split vs IGST inter-state** (in_.py:166-208), GSTR-3B schema, Rs.40 lakh threshold, Rs.50/day + 18% p.a. penalties | **Good logic, thin state list** (only 7 of 36 states) |
| `ca.py` (455) | **Full 13-province GST/HST/PST/QST table** (ca.py:46-60, e.g. `"CA-QC": {"gst": 5.0, "pst": 9.975, "total": 14.975}`), CAD $30K non-resident digital threshold, GST34 schema, CRA source URLs in docstring, "2026 verified" | **Most complete rate table in repo** |
| `au.py`/`sg.py`/`nz.py`/`jp.py` (208/215/208/300) | AU 10% / SG 9% (OVR regime) / NZ 15% / JP 10%+8% with national/local split (jp.py:72-80), thresholds AUD 75K / SGD 100K / JPY 10M | **Decent static modules**, verified ~2026-01 |

### `tax_data/` (flat files, not wired to the modules)
- `tax_rates.json` — only **10 records** (5 EU VAT + 5 US states), AI-services-flavored, created 2026-05-27. Shape: `{"jurisdiction_code": "DE", "tax_type": "VAT", "standard_rate": 19.0, "effective_date": "2026-01-01", "source_url": ..., "tags": [...]}`. Toy dataset.
- `us_saas_taxability_2026.md` — **genuinely valuable**: full 50-state SaaS taxability matrix (taxable/exempt/mixed/no-tax with per-state notes and DOR sources), compiled 2026-05-30. This is exactly the seed data for a Postgres taxability table.
- `content_research_2026.md` — research notes backing the M1-M7 backlog (India OIDAR, GCC VAT, DST tracker).
- News/briefing JSONs — one-day snapshots from 2026-05-28, stale, ignore.

### `src/taxinfra/content/` (separate, overlapping rate layer)
- `eu_vat_scraper.py` (344) — live EC-page scrape with a **verified 2026 fallback table of 30 countries** (`EU_VAT_RATES_2026` at eu_vat_scraper.py:63-95, standard + reduced rates, incl. GB/CH/NO) plus SaaS VAT notes (B2B reverse charge, OSS threshold). Working code per AGENTS.md C1.
- `simple_content_library.py` (180) — static APAC rate records with rich `saas_notes` and `last_verified` fields (simple_content_library.py:24-60).
- `country_database.py` (389) — `CountryTaxProfile` dataclass for 150+ country metadata (rates, DST flags, complexity scores, launch priority). Planning/metadata, not calculation.
- `news_collector.py` (413) — real aiohttp+feedparser RSS pipeline, but **3 of 4 feed URLs are broken** (AGENTS.md bugs RSS-1..3).
- Note: the content layer and the country modules **duplicate rates independently** (e.g., DE 19% appears in `de.py`, `eu_vat_scraper.py`, and `tax_rates.json`) with no single source of truth.

## Agents (`src/taxinfra/agents/`)

| Agent | What it does | Maturity |
|---|---|---|
| `base.py` (173) | `TaxAgent` ABC: `run()` wraps `execute()` with audit-trail logging, status machine (IDLE/RUNNING/WAITING_FOR_APPROVAL/...), typed `AgentContext`/`AgentResult`, trivial list-based memory | **Working framework code**, no LLM. Solid Pydantic contracts worth copying |
| `orchestrator.py` (411) | DAG workflow engine: topological sort (Kahn's), dependency conditions (`on_success`/`on_failure`), prior-step output injection, 3 pre-built workflows (end-of-period, new-market-entry, audit-response). Tested (`test_orchestrator.py`, 6 tests) | **Working, generic code** — but it orchestrates scaffold agents, so the workflows produce nothing real |
| `notice_agent.py` (433) | **The MVP.** PDF → pdfminer text extraction (with raw fallback) → Gemini structured extraction (notice type/severity/authority/amount/deadline as JSON) → Gemini response-letter draft. Robust JSON parsing for thinking models (notice_agent.py:261-289), never-raise error handling, deadline-days computation | **Real working LLM code** (Gemini via httpx, `gemini-3.5-flash`, key in header). Standalone — does NOT inherit `TaxAgent`. Most reusable agent asset: the two prompts (notice_agent.py:151-222) and the field schema |
| `regulatory.py` (135) | Takes pre-detected `RegulatoryChange` objects from parameters and maps change-type → canned recommendation strings; records Decision objects. **Does not actually monitor anything** — no fetching, no LLM | Scaffold. Useful only for its `RegulatoryChangeType` taxonomy (regulatory.py:25-33) |
| `compliance.py` (159) | Creates a draft `Filing` with **two hardcoded $0 line items** (compliance.py:82-93), logs decisions, routes for approval. Contains the audited `__import__("datetime")` anti-pattern (lines 52, 140) | Scaffold — flagged in CLAUDE.md:121-123 |
| `planning.py` (112), `audit_defense.py` (157) | Template recommendations + Decision logging, no analysis | Scaffolds |
| `/agents/team_setup.py` (repo root) | Config dict describing a fictional "agent team" (QA/DevOps/Security) | Aspirational config, ignore |

Also real (non-agent): `compliance/filing.py` `FilingEngine.generate_filing()` (filing.py:23-60) actually aggregates transactions through `country_module.determine_tax()` into output/input tax with traceability links — the honest version of what ComplianceAgent fakes. `compliance/anomaly.py` has a rules-based `AnomalyDetector` (7 anomaly types).

## Domain models (`src/taxinfra/models/`, tests in `tests/test_models/`)

Clean Pydantic v2, Decimal money, UUID ids, StrEnum statuses. 10 model tests + 37 country tests confirm behavior.

- **Transaction** (transaction.py:45-92): line-item based; parties as `seller/buyer_country` + `seller/buyer_jurisdiction` codes; classification flags `is_b2b / is_cross_border / is_digital_service / is_exempt`; traceability fields (`source_system`, `gl_account`, `invoice_number`); computed `net_total/tax_total/gross_total`. Line items carry `hs_code`, `product_category`, `exemption_certificate`.
- **Filing** (filing.py:33-77): status lifecycle DRAFT→IN_REVIEW→APPROVED→SUBMITTED→ACCEPTED/REJECTED/AMENDED; line items keyed by form `box_number` with `source_transaction_ids` back-links (the traceability story); `amendment_of` chain.
- **Entity** (entity.py:11-65): legal entity + `tax_registrations: dict[jurisdiction, reg_no]`; `EntityStructure` tree with subsidiaries/ownership.
- **Jurisdiction** (jurisdiction.py:55-99): the richest model — rates with `effective_from/to` windows and `get_active_rate(as_of, product_category)`, filing frequency/deadline-days, registration threshold + currency, e-invoicing standard, reverse-charge/real-time-reporting flags. Ironically the model supports time-travel; the country modules just don't use it.

This model set maps almost 1:1 to a Supabase schema: `entities`, `transactions` + `transaction_line_items`, `filings` + `filing_line_items`, `jurisdictions` + `tax_rates`.

## Reuse assessment (tool-by-tool)

The country modules are pure functions over Pydantic inputs — deterministic, side-effect-free, ideal tool material. For a TS/Supabase/Vercel product (per the TaxTech stack), the general pattern: **rates/thresholds/penalties/schemas → Postgres tables; determination/deadline logic → TS functions**. Nothing here justifies running a Python service except the Notice Agent PDF pipeline.

| Candidate tool | Source | Verdict | Notes |
|---|---|---|---|
| **Rate lookup** | `countries/*.py` constants + `eu_vat_scraper.py:63-95` + `simple_content_library.py` + `ca.py:46-60` | **Port → Postgres table** | Consolidate the 3 duplicated rate sources into one `tax_rates` table with `jurisdiction, tax_type, rate, reduced_rates[], effective_from/to, source_url, last_verified`. ~45 jurisdictions of seed data exist (27 EU + GB/CH/NO + 13 CA provinces + AU/SG/NZ/JP/IN + 10 US states). Trivial lookup query, no Python needed |
| **US SaaS taxability check** | `tax_data/us_saas_taxability_2026.md` | **Port → Postgres table** | 50-state matrix with taxable/exempt/mixed + notes + source. Directly a `saas_taxability` table; highest-value single asset for a SaaS-focused vertical |
| **Threshold / nexus check** | `get_registration_threshold()` per module + `saas_notes` in content lib | **Port → table + tiny TS function** | Static per-jurisdiction thresholds (£90K, $100K Wayfair, CAD/AUD/SGD/JPY values, non-resident digital-supplier variants). Compare against revenue — pure data |
| **Penalty calculator** | `get_penalty_rules()` per module | **Port → table + TS calc** | `PenaltyRule` shape is already table-ready. Logic (% per month with cap vs flat fee vs per-day fee vs annual interest) needs a small typed TS evaluator (~50 lines). Beware: rules are simplified (US is one generic rule, not per-state) |
| **Filing calendar / deadline** | `get_filing_deadline()` overrides + `Jurisdiction.filing_frequency/deadline_days` | **Port → TS function** | All logic is "Nth day of following month" or "period + N days" — trivial to port, easy to unit-test against the 37 existing Python country tests as fixtures |
| **Tax determination** (given a transaction, compute tax + rule citations) | `determine_tax()` in uk/de/in_/ca | **Port → TS** (worth it for UK/DE/IN/CA), **rebuild/buy for US** | The branch logic (export zero-rate, reverse charge, CGST/SGST split, HST-vs-GST+PST) is ~100 lines per country and pure. The `rules_applied` citation pattern (esp. DE's UStG § refs) is a great fit for LLM-explainable output. US: their own verdict — buy TaxJar/Avalara |
| **Filing schema / form boxes** | `get_filing_schema()` — MTD 9-box, UStVA, GSTR-3B, GST34 | **Reuse as JSON seed data** | `FilingSchema`/`FilingBox` are declarative; dump to JSON/table as-is. `calculation` strings ("box_3 - box_4") would need a tiny expression evaluator if you compute forms |
| **Notice analysis pipeline** | `notice_agent.py` | **Reuse prompts + schema; rebuild runtime in TS** | The extraction/response prompts and `NoticeAnalysis` field schema port directly to your existing Claude structured-outputs backend (better fit than a Gemini dependency). PDF extraction: either a small Python microservice with pdfminer, or TS `pdf-parse`/unpdf on Vercel. This is the one component where a small Python service is defensible, but not required |
| **Workflow orchestrator** | `orchestrator.py` | **Skip / rebuild if needed** | Well-written but generic DAG runner; TS ecosystem (Inngest, Trigger.dev, or plain functions) covers this. The pre-built workflow definitions are the only domain content |
| **Anomaly detector** | `compliance/anomaly.py` | **Port rules → TS or SQL** | Simple rule checks (missing tax, rate outliers, duplicates); many map to SQL queries over a transactions table |
| **FilingEngine** | `compliance/filing.py` | **Port pattern → TS/SQL** | Transaction→box aggregation with source-transaction back-links; in Supabase this is mostly a GROUP BY plus a join table |
| **Domain models** | `models/*.py` | **Port → Postgres DDL + Zod/TS types** | Near-mechanical translation; keep Decimal→numeric, StrEnum→Postgres enum |
| Compliance/Planning/AuditDefense/Regulatory agents, ERP connectors, content collectors (non-EU), auth, trust layer | various | **Do not reuse** | Scaffolds, stubs (`NetSuiteConnector.fetch_transactions()` returns `[]`), in-memory-only trust layer, mock content collectors |

**Python-service question:** No. Everything deterministic is <1K lines of pure logic + data that ports cleanly to TS/Postgres; keeping a Python service alive on Cloud Run for it adds ops burden with no payoff. Only exception worth considering: a stateless PDF-text-extraction endpoint if TS PDF libraries prove inadequate for scanned notices (and even then, OCR would be the real gap — pdfminer doesn't handle image-only PDFs either, per notice_agent.py:311).

## Staleness & gaps

- **All rates are point-in-time snapshots, verified 2026-01 to 2026-05-30** (`LAST_VERIFIED = "2026-05-30"` in eu_vat_scraper.py:26; `last_verified: "2026-01-01"` in APAC records; CA table labeled "2026 verified"). Today is 2026-07; anything imported needs re-verification, and staleness tracking (backlog item C8, never built) should be a day-one feature: store `last_verified` + `source_url` per row, flag >90 days.
- **`as_of` ignored everywhere** (CLAUDE.md:130-132): no historical rates despite `TaxRate.effective_from/to` supporting it. If you port to a rates table, add effective-dating from the start — it's free in SQL.
- **US coverage is decorative**: 10 states, one flat rate each, no local jurisdictions, generic penalties, `effective_from=date(2020,1,1)` placeholder (us.py:71). Their own build-vs-buy call (AGENTS.md:144): TaxJar $99/mo. UK's £90K threshold and SG's 9% are marked "as of 2024" in docstrings.
- **Filing schemas are simplified**: MTD 9-box and UStVA box numbers look right; GSTR-3B is 4 boxes vs the real form's many sub-tables; US form is generic. Treat as scaffolding for the real forms, and version them (`FilingSchema.version` exists: "2024.1", "2024").
- **Penalty rules are jurisdiction-level approximations** — e.g., one US rule when reality is 50 state regimes; UK points-based system reduced to a flat £200. Fine for "estimated exposure" UX, not for filed amounts.
- **India module covers 7 of 36 states/UTs** (in_.py:37-45); OIDAR/foreign-supplier rules were researched (backlog M1) but never coded.
- **No tests exist for CA/AU/SG/NZ/JP modules** (only US/UK/DE/IN + registry under `tests/test_countries/`), so the largest rate table (ca.py) is untested.
- **Data duplication risk**: DE 19% lives in 3 places; if you import, dedupe into one canonical table and record provenance.
- Known-broken bits to avoid importing: RSS feed URLs (AGENTS.md RSS-1..3), `tax_news.json` schema mismatch (RSS-4), one-day-old news snapshots in `tax_data/`.

**Bottom line:** the durable assets are (1) the CountryModule interface + Pydantic domain models as a schema blueprint, (2) ~45 jurisdictions of verified-2026 rate/threshold/penalty/deadline data (CA and EU tables best), (3) the 50-state SaaS taxability matrix, (4) real filing-form schemas for UK/DE/IN, and (5) the Notice Agent prompts + output schema. Port all of it to Postgres tables + small TS functions; skip the agent scaffolds, trust layer, and integrations entirely.