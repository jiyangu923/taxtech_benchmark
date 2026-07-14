# Taxi Harness — Plan for a Community-Built Vertical AI for Indirect Tax

*Drafted 2026-07-13. Grounded in: a full read of `~/taxinfra` (what's real vs scaffold), an inventory of taxbenchmark.ai's current AI surface, and external research on vertical-AI practice in legal/tax/finance (2025-26).*

---

## 1. Vision & positioning

**North star:** the AI analyst for the full indirect-tax lifecycle — benchmarking → compliance → audit response → planning — built *with* its community, not just for it.

**The wedge the research found:** the market is barbelled. SMB filing autopilots (Kintsugi, Numeral) on one end, enterprise suites (Vertex, Thomson Reuters, Avalara) on the other. The underserved middle is **in-house indirect-tax teams doing judgment work** — planning, scenario analysis, audit response. And the single most underserved layer across all of them: **governance/audit-defensibility** — 92% of tax functions use AI, only 12.5% have KPIs for it, and most teams "could not defend AI-assisted decisions in an audit" (Fonoa 2026 — an article already in our own KB).

**Our unfair advantages (nobody else has all three):**
1. **Live peer benchmark data** — community-contributed, anonymized, growing with each cohort.
2. **Law-as-code seed assets** — taxinfra's ~45 jurisdictions of verified rates/thresholds/penalties/deadlines + a 50-state SaaS taxability matrix.
3. **A working product harness already in production** — cached prompt assembly, structured outputs, evidence chips, metering, AI ingestion, privacy boundary.

**Honesty rule (from the Stanford legal-RAG study — 17-33% hallucination in the best-funded legal AI tools):** never market "hallucination-free." Measure a correctness rate on a public eval set and publish it. That *is* the differentiator.

---

## 2. What we already have (grounded inventory)

### 2a. Production harness v0 (taxbenchmark.ai, live today)
| Capability | Where |
|---|---|
| Prompt assembly + ephemeral caching (4096-tok min prefix) | `services/taxi.ts` |
| Structured outputs (`analysis/chart/followUps/sources`) | `RESPONSE_SCHEMA`, `api/claude.ts` |
| SSE streaming + 60s idle abort | `services/claude.ts` |
| KB injection (40 articles, cached block) + evidence-chip sanitization | `buildKbContext`, `sanitizeSources` |
| Conversation replay (4 turns) | `buildMessages` |
| Per-user $5/day metering, server-enforced | `api/claude.ts`, `ai_usage` |
| AI ingestion (text/url/PDF → reviewed articles) | `api/admin/kb-ingest.ts` |
| Privacy boundary (identity fields never reach the model) | `sanitizeSubmissionForModel`, `get_visible_submissions()` |

**Known gaps found in grounding:** feedback widget is page-level, not tied to AI answers (no eval loop); Q&A pairs aren't persisted server-side; all harness constants hardcoded; ⚠️ `body.model` is client-overridable while the meter prices Haiku only (cost-abuse hole — fix in Phase 0).

### 2b. taxinfra — what to port, what to skip (from full read)
**Port (durable assets):**
- `CountryModule` interface + Pydantic domain models (`TaxDetermination`, `PenaltyRule`, `FilingSchema`, entity/transaction/filing) → Postgres DDL + Zod/TS types. Near-mechanical.
- ~45 jurisdictions of rate/threshold/penalty/deadline data — Canada's 13-province table and the 30-country EU VAT table are the best; UK MTD 9-box and German UStVA box schemas are real.
- **50-state SaaS taxability matrix** (`tax_data/us_saas_taxability_2026.md`) — the single most valuable dataset; seeds a `taxability` table directly.
- Notice Agent prompts + extraction schema (`notice_agent.py:151-222`) — the only genuinely working LLM pipeline in taxinfra; port prompts from Gemini to Claude for Phase 2.
- Anomaly rules + FilingEngine aggregation pattern → SQL over a transactions table (later phases).

**Skip:** agent scaffolds (compliance/planning/audit_defense/regulatory), orchestrator (generic DAG — TS ecosystem covers it), trust layer (in-memory only), ERP connectors (stubs), news collector (3 of 4 feeds broken). **No Python service** — everything deterministic is <1K lines and ports cleanly.

**Port-time rules (learned from taxinfra's own audit ledger):** effective-dating from day one (`as_of` was ignored everywhere); `last_verified` + `source_url` provenance on every row; staleness flag at >90 days; one canonical table (DE's 19% currently lives in 3 places).

### 2c. Community & data moat
6 approved members (cap 25, waitlist live), auto-approve + archive pipeline, KB draft/publish states, contribution-ready ingestion endpoint.

---

## 3. The harness: six layers on our exact stack

**A harness is everything around the model that makes it correct, cheap, and improvable — so models are swappable and every week's iteration is measured, not vibed.**

### L1 — Knowledge (three stores, three retrieval policies)
| Store | Content | Retrieval |
|---|---|---|
| `tax_rules` tables (new) | Law-as-code: rates, thresholds, penalties, deadlines, taxability — effective-dated, provenanced | **Tool calls** (never from model memory) |
| `kb_articles` (live) | Curated guidance/news summaries | Prompt-stuffed ≤40 → pgvector chunks in user message past ~150 articles (per-question retrieval must NOT enter the cached prefix) |
| Cohort data (live) | Anonymized peer submissions | Prompt-stuffed in cached block (small, stable) |

Research rule: **deterministic tools for anything numeric/boolean; RAG with verbatim citation for guidance; prompt-stuffing only for small stable context.** Never let the model compute a liability.

### L2 — Tools (the correctness lever)
Add `tools` passthrough in `api/claude.ts` `buildParams` + multi-turn tool loop (streaming needs `content_block_start`/`input_json_delta` handling). Server-side executors (inline, per the /api import constraint) reading the `tax_rules` tables:
- `lookup_rate(jurisdiction, tax_type, date)` · `check_threshold(jurisdiction, revenue)` · `estimate_penalty(jurisdiction, type, days_late, amount)` · `filing_calendar(jurisdictions[], from, to)` · `saas_taxability(state)`
- Each returns `rules_applied[]` citations (taxinfra's pattern — keep it). Tool answers render as a new evidence-chip class: ⚖️ *rule citation* alongside 📊 cohort and 📰 KB.
- **Correctness rules (CEO review 2026-07-13, approved):**
  - **No-data honesty:** an empty tool result ("no verified rate for X") must surface IN the answer — the model never silently falls back to memory. This is the anti-hallucination rule; silent fill-in is the documented failure mode.
  - `MAX_TOOL_ITERATIONS = 5`, then force a final answer (runaway-loop cap).
  - **Tool definitions are static** — they join the cached prompt prefix; dynamic defs would invalidate the cache on every request.
  - `tax_rules` gets a composite index `(jurisdiction, tax_type, effective_from)`.
  - **Transport (F1):** tool-using answers run on the non-streaming path first (simple `messages.create` loop); streaming+tools lands with progressive rendering in Phase 1. The current UI renders answers only at completion, so nothing is lost today.

### L3 — Orchestration
Model routing by task class: Haiku for chat (today), Sonnet for multi-step audit/planning workflows (Phase 2+). Config table (`harness_config`) replaces the hardcoded constants (model, caps, KB limits, history turns) — tunable without redeploy, same pattern as `foundingCohortMax`.

### L4 — Evals (build FIRST — this is what "efficient" means)
- **Golden set v1: 100 cases** growing to ~300-500 max, bucketed: rate lookups, thresholds/nexus, deadlines, exemptions/taxability, benchmark interpretation, audit-response quality, **false-premise traps** (documented failure mode: tax AI reinforcing users' wrong assumptions), privacy probes, refusal cases.
- **Deterministic grading wherever there's a right answer** (rate, date, threshold — gradable straight from `tax_rules`). Rubric-based LLM-judge *only* for memo/tone quality, criterion-by-criterion (holistic judge scores hide regressions and favor verbosity).
- **CI gate per-bucket, not aggregate** — a nexus regression must not hide behind improved rate lookups. `npm run evals` in GitHub Actions; the gate is a **required GitHub check** (Vercel auto-deploys on push, so blocking must happen at merge, not deploy). **Cadence (Q-S6, approved): path-filtered PR gate** (`services/taxi*`, `services/claude*`, `api/**`, `evals/**`, KB seeds) **+ nightly full run**; any LLM-judge buckets run nightly only.
- Every production failure (user flags a wrong answer) becomes a golden case. The set is versioned and diffable.

### L5 — Guardrails & trust (the market wedge itself)
- Citations-required as a hard rule: every factual claim traces to a KB title, a rule id, or the cohort (evidence chips already enforce the surface; extend to tool citations).
- Persist Q&A pairs server-side (`ai_answers` table: question, answer, sources, rules_applied, model, usage, timestamps) → this is simultaneously the **audit trail**, the eval-mining source, and the "defend your AI in an audit" feature. EU AI Act (Aug 2026) makes traceability table-stakes; we get it as a byproduct. **Retention (Q-S3, approved): 12-month rolling purge of raw Q&A; answers linked to corrections/evals/flags are kept permanently.** RLS: members read own rows; admins read all; inserts server-side only.
- HITL gates: nothing files, remits, or sends externally without explicit human approval — ever. Autonomy is earned per-step with eval evidence (highest-flagged-risk category in finance agentic AI).
- Existing: privacy sanitizer, RLS column protection, rate limiting. Phase 0 fix: lock `body.model` server-side.

### L6 — Community pipeline (the moat compounds)
Contribution ladder, each rung feeding a harness layer:
1. **Benchmark data** (live) → cohort store
2. **KB suggestions** — open `kb-ingest` to members with a moderation queue (draft → admin review → publish; states already exist). Provenance + reviewer recorded per article.
3. **Corrections-as-evals** — per-answer 👍/👎+reason in Taxi → flagged answers become golden-set candidates. Members literally train the harness.
4. **Rule contributions** — corrections/additions to `tax_rules` rows (a rate changed, a threshold updated) with source URL required; review gate on high-blast-radius rows (Wikidata semi-protection pattern).

**Incentives (research-backed):** capability, not cosmetics — contributor tiers raise the AI daily cap (meter exists), unlock early features; visible attribution on KB articles ("contributed by…", opt-in); no leaderboard-first gamification. **Moderation:** review selectively by risk, not pre-publication-everything (kills volume); provenance on every claim; in a professional niche the threat isn't vandals, it's *confidently wrong* — so require sources, gate the blast radius.

---

## 4. Phases

### Phase 0 — Harness foundations (2-4 weeks, pre/during pilot)
*Goal: measurement + the correctness backbone, while pilot feedback is fresh.*
1. `ai_answers` persistence + per-answer 👍/👎 in Taxi (closes the eval loop). **+ CP1 (CEO review, accepted): structured "report a wrong fact" flow** — 👎 can open an optional form (expected answer + source URL) feeding an admin review queue; accepted reports become golden-set candidates. Community rung 3 ships with rung 0.
2. Golden set v1 (100 cases) + `npm run evals` + CI gate. Seed correctness buckets from taxinfra data.
3. Port `tax_rules` schema + seed: EU VAT table, CA provinces, US SaaS taxability matrix, UK/DE/IN/APAC modules. Effective-dated, provenanced, staleness-flagged.
4. First two tools wired end-to-end: `lookup_rate` + `filing_calendar` (+ tool-loop plumbing in api/claude.ts).
5. Quick fixes: lock client model override; move harness constants to `harness_config`.
- **Exit:** eval dashboard green in CI; Taxi answers rate/deadline questions via ⚖️ tool citations; every answer persisted + rateable.

### Phase 1 — Compliance copilot (1-2 months)
*Goal: from "how do I compare" to "what do I owe attention to."*
- Full tool suite (thresholds, penalties, taxability). Profile-aware nudges: "You operate in 100 jurisdictions — 3 filing changes hit you next quarter" (KB × profile join).
- Weekly regulatory cron → kb-ingest → auto-drafts for review (already roadmapped); staleness gate on rules >90 days.
- Community rungs 2-3 live (member KB suggestions + corrections-as-evals).
- **Exit:** ≥90% on correctness buckets; ≥25% of pilot members contribute beyond the survey.

### Phase 2 — Audit workspace (a quarter)
*Goal: own "audit defense for indirect tax" — the gap no product owns.*
- Notice upload → extraction (port taxinfra Notice Agent prompts to Claude; PDF pipeline exists in kb-ingest) → cited draft response → human approves/edits/sends. Sonnet-class model, checklist UX, named owner per workflow (Harvey pattern).
- Audit trail export: "every AI-assisted answer your team relied on, with sources" — the defensibility story as a feature.
- Benchmark tie-in: "peers at your automation level see X% fewer audit adjustments."
- **Exit:** first real notices processed by pilot members; audit-response eval bucket green; zero un-cited claims.

### Phase 3 — Planning (2 quarters+)
*Goal: judgment support — the segment the incumbents ignore.*
- What-if engine: entity/nexus/volume changes → deterministic recompute over `tax_rules` → LLM narrative with citations. Regulatory horizon per profile (ViDA 2030, e-invoicing waves). Budget/headcount planning grounded in cohort data — the only product that can do this.
- **Exit:** planning scenarios used in members' real budget cycles; retention through a full quarter.

---

## 5. Decisions only Jiyan can make
1. **Open-source posture.** Open the `tax_rules` data + eval set (community magnet, trust signal, "the OSM of tax rules") vs keep proprietary (moat). Middle path: open data + evals, closed harness. *Leaning: middle path — the community can't co-build a closed rulebook.*
2. **Segment focus for Phases 2-3.** In-house teams (current cohort DNA, the research gap) vs advisors/accountants (TaxGPT's crowd). *Leaning: in-house.*
3. **When to charge.** Free pilot → paid tiers at Phase 2 (audit workspace is the first clearly-worth-paying-for artifact)? Contributor discounts tie monetization to the flywheel.
4. **taxinfra's fate.** Archive after extraction (plan assumes this — port data + prompts + schemas into taxbenchmark, no second codebase) vs keep as the future rules-engine service. *Leaning: archive; revisit only if a filing engine needs Python.*
5. **The two-visions fork — RESOLVED (CEO review Q-S10, 2026-07-13).** taxbrains.ai (services-led lifecycle vision, May 2026) vs this plan (product-led): **SEQUENCED — taxbenchmark gets undivided focus now; taxbrains is parked until Phase 2 (audit workspace) ships and proves lifecycle demand.** Revisit trigger: Phase 2 exit criteria met.

## 6. Metrics that matter
Eval pass rate per bucket (public!) · citation coverage (% claims with a source) · measured hallucination rate · weekly contributors & contribution mix · KB/rules freshness (median `last_verified`) · questions/member/week · cost/answer (cache hit rate) · Phase 2+: notices processed, hours saved self-reported.

## 7. First two weeks, concretely
1. `ai_answers` table + persistence in `streamTaxi` path + thumbs UI (2-3 days)
2. `tax_rules` DDL + seed migration from taxinfra exports (2 days)
3. Eval runner (`evals/` dir, golden JSON, deterministic graders, GH Action) + first 50 cases (3-4 days)
4. Tool-loop plumbing + `lookup_rate` behind a feature flag (3 days)
5. Model-override lock + `harness_config` (half day)

---
*Companion grounding reports: `docs/grounding/ground_taxinfra.md`, `ground_surface.md`, `ground_research.md`.*

## Reviewer Concerns (spec review round 1 — persisted, not yet adopted)

An independent adversarial reviewer scored the plan 6/10 and raised 14 issues. The user
adopted the correctness-rules packet + the decisions above; the following remain open for
implementation-time discretion (they do not block Phase 0 start):

1. **CP1 spec shape unpinned** — suggested: `answer_reports` table (`answer_id` FK, `expected_answer`, `source_url`, `status`, reviewer, timestamps); queue = status-filtered list in the existing admin UI; members-only reporting.
2. **Report→golden-case promotion path unspecified** — suggested: manual `evals:promote` script emitting a sanitized golden JSON case (bucket + provenance fields); **sanitize member context at promotion or eval cases can leak identifying details forever.**
3. **CP1 effort honesty** — full flow (queue + promotion) is ~1-2 CC days, not 2-3h; the 2-3h figure covers table + form + list only.
4. **Phase 0 seed set** — grounding vouches for CA, EU-30, UK MTD, DE UStVA, US SaaS matrix; IN/APAC module quality is undescribed — consider trimming them to Phase 1.
5. **CP2 trigger wording** — "≥100 cases" is met by golden set v1 by definition; intent is ≥100 *production-derived* cases.
6. **Approach-B estimate label** — "CC ~1-1.5wk" applies to Phase 0's original list; the two-week task list itself sums to ~10.5-12.5 CC-days before CP1.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | issues_open | 6 proposals (1 approach + 4 cherry-picks + mode), 2 accepted into scope, 3 deferred; spec review 14 issues → 6 concerns persisted |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 6 reviewer concerns (above) — deliberate deferrals, not gaps.
- **VERDICT:** CEO review complete with decisions recorded — eng review required before implementation is formally "cleared" (or start Phase 0 at owner's discretion; solo-repo mode).
