# taxbrains.ai — Product & Build Plan

**Status:** Superseded on 2026-08-30 by [ADR 0001](decisions/0001-unified-platform-workspace.md). Retained for decision history.
**Decision owner:** J Gu
**Relationship to prior docs:** revises one decision in [AI_HARNESS_PLAN.md](AI_HARNESS_PLAN.md) (see §1); inherits its non-negotiables (§2) and phase sequencing (§4).

---

## 1. What taxbrains.ai is — and the decision this revises

**taxbrains.ai is the commercial AI work-tools layer. taxbenchmark.ai stays the free community benchmark that powers it.**

Two brands solve the problem one brand couldn't:

- taxbenchmark.ai publicly promises *"Free · non-profit · open access · no commercial agenda."* That promise is the community flywheel and it must be kept — permanently.
- The AI work tools (rate/taxability lookups today; planning, audit response, return assistance later) are legitimately a product. Charging for them on a separate brand keeps faith with the benchmark promise instead of eroding it.

**Decision revision (Q-S10).** AI_HARNESS_PLAN.md recorded: *"taxbrains is parked until Phase 2 (audit workspace) ships and proves lifecycle demand."* That referred to the May-2026 services-led taxbrains vision. Revised 2026-08-08 by J Gu because the context changed:

1. Benchmarking is a **low-frequency** activity (quarterly at best). The site needs a daily/weekly-frequency layer to stay alive, and that layer belongs on the commercial brand from day one.
2. The free-tier / charge-later tension is resolved cleanly by the two-brand split — waiting until Phase 2 would have meant either breaking the benchmark's promise or launching a paid brand cold.
3. The taxbrains.ai domain is acquired and the harness foundations (tools loop, tax_rules, evals, meter) shipped and are live-verified — the marginal cost of standing up the surface is now small.

What is *not* revised: the phase order (compliance → audit → planning), the charging point (first paid tier at the Phase-2 audit workspace), and every honesty/HITL rule. taxbrains v1 is deliberately a **thin, free** surface over infrastructure that already exists.

**Monetization posture (public commitment):** everything on taxbrains.ai is free during beta. **Founding members — anyone with a taxbenchmark profile before paid tiers launch — keep free access for life.** Paid tiers arrive with the audit workspace (Phase 2) and charge at the organization level (teams, exports, integrations, support), never for what individuals got free.

---

## 2. Inherited non-negotiables

From AI_HARNESS_PLAN.md, binding on every taxbrains feature:

- **Never let the model compute a liability.** Numbers come from deterministic tools over `tax_rules`; the model writes narrative around tool results.
- **No-data honesty.** An empty tool result surfaces in the answer; the model never silently falls back to memory. An uncovered jurisdiction gets zero percentage figures.
- **Citations always.** Every rate/taxability claim carries `rules_applied` provenance (source_url + last_verified) rendered as evidence chips.
- **HITL gates.** Nothing files, remits, or sends externally without explicit human approval — ever. Autonomy is earned per-step with eval evidence.
- **Measure, don't market.** No "hallucination-free" claims; publish the eval pass rate instead. The /trust page remains public even though the harness is commercial ("open data + evals, closed harness").
- **Return/filing stays fenced off** until per-form evals and review gates exist. It is the highest-liability surface and is not in v1, v1.5, or v2 of this plan.

---

## 3. V1 scope (ship first)

Three things, nothing else:

1. **Landing page** — taxbenchmark's page skeleton (hero + stat card, indigo deck, overlapping feature cards, trust section) with taxbrains content and the same Inter/indigo/amber system so the family resemblance is obvious. Live stats from the shared `get_public_stats` RPC ("built on N anonymized member benchmarks"). Footer: `© Seven Twenty Two LLC · taxbrains.ai`.
2. **AI lookup chat** — a Taxi-grade chat wired to two tools:
   - `lookup_rate` (already live: EU-27 + GB/CH/NO VAT, 13 CA provinces GST/PST/HST)
   - `saas_taxability` (new: the 50-state + DC US SaaS taxability matrix — the daily-use hook nobody answers with citations)
   Evidence chips on every answer. Sign in with the same account as taxbenchmark.
3. **Weekly personalized digest** — "France's e-invoicing mandate hits you Sept 1." Users pick jurisdictions/topics; a Monday cron matches the week's published `kb_articles` against their interests and emails a cited digest. This is the retention hook — pilots die of silence.

**Explicitly not in v1:** planning/return/audit workspaces (staged, §4), payments or pricing pages (a "Free during beta · founding members free forever" badge instead), a separate benchmark on taxbrains (the benchmark lives on taxbenchmark, full stop).

**Access posture:** any signed-in user can use taxbrains v1 (auth + the shared $5/24h meter; no approved-submission gate). The chat nudges users without a benchmark profile toward the 2-minute Taxi intake on taxbenchmark — profile-aware answers are visibly better, and the benchmark remains the acquisition funnel in both directions.

---

## 4. Staging beyond v1

Unchanged from the harness plan, now with a home:

- **v1.5 (Phase-1 tools):** `filing_calendar` + `check_threshold` on the chat; "Export as cited memo" (the cheapest artifact-shaped feature); notice-upload **extraction-only teaser** to validate Phase-2 demand.
- **v2 (Phase 2 — audit workspace):** notice upload → extraction → cited draft response → human approves/edits/sends. Sonnet-class model, named owner per workflow, audit-trail export. **First paid tier lands here**, org-level, founding members grandfathered.
- **v3 (Phase 3 — planning):** what-if engine (deterministic recompute over tax_rules + cited narrative), regulatory horizon, budget/headcount planning grounded in cohort medians — the only product that can do this.

---

## 5. What merges from the existing taxbrains-ai work

The May-2026 taxbrains effort lives at **github.com/taxbrains-ai/taxinfra** (Python, local clone `~/taxinfra`) plus an approved dashboard design (gstack, 2026-05-31). Verdict: **merge the assets and the org, archive the runtime.**

**Harvested into this plan:**
- **`tax_data/us_saas_taxability_2026.md`** — the full 50-state SaaS matrix (rate, taxable/exempt/mixed/no-tax, notes, per-state DOR sources). Becomes the session-2 seed after a re-verification pass (compiled 2026-05-30; rates move). This deletes the hardest data task from v1.
- **The `taxbrains-ai` GitHub org** — the new frontend repo is `taxbrains-ai/taxbrains`, keeping the commercial brand's code under its own org rather than a personal account.
- **Notice Agent** (`src/`, Gemini-based) — the working prototype of the Phase-2 audit workspace. Its extraction prompts/schemas port to the Claude harness at Phase 2, per the harness plan's original intent.
- **Approved dashboard design** (`~/.gstack/projects/taxbrains-ai-taxinfra/designs/dashboard-20260531/finalized.html`, "Your AI Tax Department" 4-agent grid) — design reference for the product surface behind the landing page.
- **`docs/DATABASE_STRATEGY.md`** — independently ratified Supabase as taxbrains' system of record. This plan supersedes it (shared Supabase project + Supabase auth + Vercel, replacing own-auth + Cloud Run), which is a *convergence*, not a conflict.

**Archived, not ported:** the Python/FastAPI runtime, Gemini integration, Docker/Railway/Cloud Run deployment — different stack, and the deployed app stores state in process memory (its own database doc says so). This executes the harness plan's recorded leaning ("archive taxinfra; revisit only if a filing engine needs Python"). Add an archive note to the taxinfra README pointing here once assets are harvested.

---

## 6. Architecture

**New repo (`taxbrains-ai/taxbrains`), new Vercel project, same Supabase project.** Confirmed against the current codebase:

### Shared for free (zero copy — it's all in Supabase)
- **Auth & accounts:** same JWTs, same `profiles`. One login works on both products (sessions are per-domain; users sign in on each site with the same credentials — PKCE and Google OAuth work unchanged).
- **Tables:** `tax_rules` (+ the new US matrix), `kb_articles`, `ai_usage` (**shared meter — the $5/day cap spans both products, one row per user; deliberate**), `ai_answers` (audit trail), `get_public_stats` RPC.
- **All hardening carries over:** profiles column-lock, RLS posture, meter semantics.

### Vendored into the new repo (~500 LOC total, cannot be imported across repos)
- **`/api/brains.ts`** — a trimmed copy of `api/claude.ts`: bearer auth + meter + tools loop + `lookup_rate` + `saas_taxability`. Drops intake mode (−300 LOC), streaming (tools force non-streaming anyway), and the cohort gate. Same server-owned model (`claude-haiku-4-5`), same ignore-client-model rule.
- **Client plumbing** — trimmed `services/claude.ts` (authHeader + postClaude + askClaudeStructured, ~90 LOC) + a taxbrains prompt builder (taxi.ts pattern: cached system block, sanitized sources, 75s timeout).
- **Chat components** — composer, bubbles, evidence chips, suggested prompts, usage meter from `pages/Taxi.tsx`; design tokens from `index.css` (define the missing `--color-amber-acc-tint` while porting).
- **Email/cron skeleton** — send-reminders handler shape (CRON_SECRET, dry-run mode, error accumulation) + release-letter send loop (120ms throttle, 429 retry) + email shell (inline styles, esc/escapeHtml, LLC footer, plain-text fallback).

**Why vendor instead of CORS-ing to taxbenchmark.ai/api/claude:** no CORS exists today; adding it couples taxbrains to the community repo's deploys, leaks Taxi-specific persistence conventions, and puts commercial product logic in the non-profit codebase. 500 LOC is cheap; extract a shared package only if a third surface ever appears.

**Paid-for lessons the new repo must honor from day one:** explicit `.js` extensions on relative imports inside `/api` (type:module — crashes cold starts otherwise), no imports from outside `/api`, `VITE_*` env vars don't reach functions, nullable enums as `anyOf` in structured-output schemas, ≥4096-token cached system prefix, empty history turns filtered.

### Small migrations on the shared Supabase
1. **US SaaS matrix:** add `product_category text not null default 'general'` and `taxability text` (`taxable | exempt | mixed | no_sales_tax`) to `tax_rules`; extend the lookup index; seed `tax_type='SALES_TAX'`, jurisdictions `US-AL…US-WY` + `US-DC`, category `saas` — ~51 rows converted from taxinfra's `us_saas_taxability_2026.md` after re-verification, each with `source_url` + `last_verified` (idempotent seed file, house pattern). Defer B2B/B2C splits and home-rule locals (CO/AL/LA) — noted, not attempted.
2. **`ai_answers.app`** discriminator column (`default 'taxbenchmark'`) so the shared audit trail distinguishes products.
3. **Digest prefs:** new `digest_preferences` table (`user_id PK/FK, enabled bool default true, jurisdictions text[], topics text[]`) with self-only RLS — a new table avoids touching the freshly locked `profiles` grants. Plus `digest_sends` log (`user_id, sent_at, article_ids uuid[]`) for idempotent re-runs and no-repeat dedup.
4. **KB tag convention** (no schema change): prefix tags `jur:EU`, `jur:US-CA`, `topic:e-invoicing` going forward; backfill the ~29 published articles once.

### Quality bar
- Extend the eval harness with `saas_taxability` buckets (taxable/exempt correct + cited; `not_covered` honesty; no-spurious-fire) using the same deterministic graders and the reuse-production-exports pattern; nightly workflow in the new repo gated at the same threshold.
- A live smoke mode following the `intake-live.ts` template (ephemeral user → chat → assertions → cleanup) before announcing.
- Absorb the standing TODO: the deterministic honesty guard (scan final text for % figures absent from rulesApplied) becomes mandatory before taxbrains makes rate claims commercially.

---

## 7. Build sequence (session-sized)

| # | Ships | Needs from J first |
|---|-------|--------------------|
| 1 | Repo scaffold, landing page, auth, deployed on taxbrains.ai | Create `taxbrains-ai/taxbrains` repo + Vercel project + DNS; add `https://taxbrains.ai/*` to Supabase Auth redirect allowlist; env vars (same Supabase keys + ANTHROPIC_API_KEY) |
| 2 | US SaaS matrix (converted from taxinfra, re-verified) + `/api/brains.ts` with both tools; chat UI with evidence chips | Run 2 SQL files (matrix + ai_answers.app) |
| 3 | Eval buckets + nightly workflow + live smoke — **gate green before announcing** | Repo secrets (same two as taxbenchmark's evals) |
| 4 | Digest: prefs table + UI, tag backfill, `/api/cron/send-digest`, Monday cron | Run digest SQL; verify taxbrains.ai as a Resend sending domain |
| 5 | Announce: release letter to members — founding members get taxbrains free for life | Review + send (drafts only, as always) |

Realistic calendar: v1 live in **1–2 weeks of working sessions**, digest included.

Running costs: Haiku lookups ~$0.01–0.02/interaction under the existing shared $5/day/user cap; Resend within current plan; Vercel second project free-tier-fine at this scale. Effectively **tens of dollars a month** at current usage.

---

## 8. Risks — named, with mitigations

- **Focus split** (the reason Q-S10 originally parked this): mitigated by v1's thinness — it's ~80% vendored/ported code over shared infra, and taxbenchmark's cadence (weekly letter, nightly evals, intake funnel) continues untouched. If taxbrains starts eating benchmark momentum, the revisit trigger is explicit: pause taxbrains, not the community.
- **US SaaS matrix accuracy** (the highest-liability content in v1): per-row provenance + last_verified dates, the honesty guard, deterministic graders on every state, and **Terms of Service + "not tax advice" disclaimer under Seven Twenty Two LLC shipped with the landing page** (this plan makes the ToS/Privacy pages a v1 requirement, not an offer).
- **Community data across the paywall:** community-contributed rules/corrections feed `tax_rules`, which commercial tools consume. Mitigation is the standing middle-path posture made explicit and public: **tax_rules data + eval sets stay open; the harness is the product.** Contributors are credited; nothing a member contributed is ever paywalled away from them (they're founding members — free for life).
- **Shared meter surprise:** one $5/day cap across both products can confuse a heavy user. v1 shows the shared usage meter in both UIs with the same wording; revisit per-product budgets only if real users hit it.
- **Brand dilution:** same design system, different accent treatment and clearly different job-to-be-done ("measure yourself" vs "do the work"). Cross-links are explicit ("powered by the taxbenchmark community").

---

## 9. Decisions J has already made (recorded) and what's still open

**Decided 2026-08-08:** taxbrains = commercial AI work-tools layer · shared Supabase, new repo under the `taxbrains-ai` org · v1 = landing + AI lookups + digest · free-while-beta with founding-member grandfathering · Q-S10 parking revised as above · taxinfra assets harvested (SaaS matrix, Notice Agent prompts, dashboard design), Python runtime archived per the standing leaning.

**Still open (none block session 1):**
1. Digest brand: recommended **taxbrains** (it's the work-layer retention hook; the release letter stays on taxbenchmark). Decide by session 4.
2. Whether the /trust eval page lives on taxbenchmark (community asset) with taxbrains linking to it — recommended — or gets mirrored. Decide when the page ships.
3. Pricing mechanics at Phase 2 (seat vs org tiers, contributor discounts) — deliberately deferred; nothing in v1 constrains it.
