# TODOS

Deferred work with context. Convention: every deferral from a review lands here or it
didn't happen. Effort scale: human-team → (CC = with Claude Code). Priority P1-P3.

## From lookup_rate tool loop (PR #132, 2026-07-14)

### ✅ DONE — Wire Taxi to the lookup_rate tool (PR #134)
- Shipped the non-streaming transport (option c): `streamTaxi`→`askTaxiWithTools` sends `tools:['lookup_rate']`, ⚖️ chips render from `rulesApplied`. `add_tax_rules_table.sql` run 2026-07-14. The streaming-tool-loop upgrade (option a — preserve a live token indicator) remains a future option, tracked in the "retire the dead streaming path" P3 below.

### P1 — Live eval runner: BUILT — blocked only on 2 secrets (user)
- **What's done:** `evals/run.ts` (tsx) + `.github/workflows/evals-live.yml` (nightly 05:30 UTC + workflow_dispatch). Reuses production exports for fidelity (buildSystem/buildUserMessage/RESPONSE_SCHEMA from taxi.ts; LOOKUP_RATE_TOOL/executeLookupRate/MAX_TOOL_ITERATIONS from api/claude.ts). Preflights tax_rules non-empty; writes `evals-results.json` artifact (future /trust data source); gate `EVAL_MIN_OVERALL` default 0.8. Workflow no-ops with a warning until secrets exist (a red nightly must mean regression, not setup).
- **Still needed (user, ~2 min):** two repo secrets — `ANTHROPIC_API_KEY` (console.anthropic.com) and `SUPABASE_SERVICE_ROLE_KEY` (Supabase dashboard → Settings → API). `SUPABASE_URL` is already set (CC set it via gh; the other two are Vercel-"Sensitive" = write-only, unreadable from the laptop by design). Lowest-friction: run `gh secret set ANTHROPIC_API_KEY -R jiyangu923/taxtech_benchmark` (hidden paste) twice, or GitHub UI → Settings → Secrets → Actions.
- **Then:** trigger the first run (Actions → "Live evals" → Run workflow) to establish the baseline; tune `EVAL_MIN_OVERALL` + add per-bucket floors after a few nightlies.

### P2 — Enable typecheck gating in CI (deferred from CI setup)
- **What:** The new CI (`.github/workflows/ci.yml`) gates on `npm run build` + `npm test`, NOT `tsc --noEmit`. tsc has pre-existing baseline errors (`@vercel/node` types, `*.svg` module decls, `import.meta.env` needs `vite/client` types) that would red the gate. Fix the tsconfig/ambient decls, then add a `tsc --noEmit` step so type regressions are caught.
- **Why:** vitest transpiles via esbuild and ignores type errors, so CI currently won't catch a type break. Build+test is a solid first gate but not complete.
- **Effort:** S → (CC: S).

### P3 — lookup_rate hardening (adversarial review nits, PR #132)
- **What:** (1) `output_config.format` is applied on tool-calling turns too (baked into `base`); fine on Haiku today, but if the schema ever blocks a tool call, omit it until the final composing turn. (2) `lookup_rate` doesn't filter by `tax_type` — harmless while each jurisdiction has one current row; add the filter when a jurisdiction gets concurrent rows of different type. (3) Soft-cap worst case is now ~6 Haiku calls/request (5 loop + 1 fallback) before metering — accepted, revisit if MAX_TOKENS_CEILING or the model tier rises. (4) The invalid-JSON 502 path omits `answerId` (cosmetic; mirrors runNonStreaming).
- **Why:** All P3 — no correctness/security impact today; captured so they're not rediscovered.
- **Effort:** S each → (CC: S).

### P3 — Retire the now-dead streaming path (client + server + tests)
- **What:** Wiring Taxi to the non-streaming tool loop (PR #134) left the SSE path with no production caller. Dead-but-tested: client `streamClaudeStructured` + `STREAM_IDLE_MS` + `parseSseFrames` (services/claude.ts), server `runStreaming` + the `body.stream` dispatch branch (api/claude.ts). A future PR that commits to non-streaming should drop both sides **and** their tests together.
- **Why:** Not orphaned (still exercised by services/claude.test.ts + a valid server capability), so harmless today — but it's ~150 lines of unused transport. Keep until the streaming-tool-loop question (P1 above) is settled: if we later add a streaming tool loop, some of this is reused.
- **Effort:** S → (CC: S). **Note:** don't remove before deciding the streaming-tool-loop direction.

### P2 — Deterministic honesty guard (prose rate ∉ rulesApplied)
- **What:** The tool loop instructs the model not to state a rate on a miss, but nothing *forces* it. Since `rulesApplied` records exactly which verified rates backed an answer, a post-hoc check could scan the final text for percentage figures absent from any `rulesApplied` rate and flag/annotate them.
- **Why:** Closes the soft half of the honesty guarantee (the deterministic half — no fabricated ⚖️ chip — already holds).
- **Trigger:** Phase 1, once the tool is wired and producing real answers to eval against.
- **Effort:** M → (CC: M).

## From /plan-ceo-review of docs/AI_HARNESS_PLAN.md (2026-07-13)

### P2 — Public trust page (`/trust`) with live eval scores
- **What:** Public page CI updates on each deploy: eval pass rate per bucket, measured error rate, KB freshness.
- **Why:** The anti-"hallucination-free" marketing move — publish a number while incumbents publish adjectives (Stanford legal-RAG study is the backdrop).
- **Trigger:** Golden set reaches ≥100 *production-derived* cases (not the seeded v1 alone).
- **Effort:** M → (CC: S, ~half day once evals exist). **Depends on:** Phase 0 eval runner.

### P2 — "Export as cited memo" on any Taxi answer
- **What:** Button turning an answer into a citation-footnoted document (print-CSS first, PDF later).
- **Why:** Members carry it into meetings — the cheapest in-team viral loop for a 25-person pilot.
- **Trigger:** Phase 1, after ⚖️ tool citations land (memos get materially better).
- **Effort:** M → (CC: S). **Depends on:** tool citations.

### P2 — Weekly personalized jurisdiction digest email
- **What:** Weekly email per member: KB changes ∩ their profile jurisdictions ("France receive-obligation hits you Sept 1"). Reuses Resend infra + KB tags.
- **Why:** Retention — pilots die of silence; turns a chat product into a habit.
- **Trigger:** Bundle with the Phase-1 weekly regulatory cron (one data pass, two outputs).
- **Effort:** M → (CC: M, ~1 day).

### P2 — taxbrains.ai revisit trigger
- **What:** Formally revisit the parked taxbrains.ai services-led vision (design doc APPROVED 2026-05-24, local gstack dir).
- **Why:** Q-S10 decision (2026-07-13): SEQUENCED, not killed — taxbenchmark gets undivided focus through the pilot; Phase-2 evidence decides whether the services wedge is still wanted.
- **Trigger:** Phase 2 (audit workspace) exit criteria met.
- **Effort:** decision, not build.

### P3 — Reviewer-concern cleanups (spec review round 1, persisted in plan doc)
- **What:** Pin CP1 spec (`answer_reports` table shape, members-only, statuses); build `evals:promote` script with **sanitized** provenance (privacy: member context must not leak into eval cases); trim Phase-0 rule seeds to vouched datasets (CA, EU-30, UK MTD, DE UStVA, US SaaS matrix — IN/APAC to Phase 1); fix CP2 trigger wording + Approach-B estimate label.
- **Why:** 6 open concerns from the adversarial reviewer — deliberate deferrals, addressable at implementation time.
- **Effort:** S each → (CC: S). **Context:** docs/AI_HARNESS_PLAN.md "Reviewer Concerns" section.

### P3 — Phase-1 revisits from review decisions
- **What:** Streaming+tools transport (F1 deferred the SSE tool-chunk plumbing); contributor attribution UI (profile badges, "contributed by" on KB articles); notice-upload teaser (extraction-only preview to validate Phase-2 demand); dev-proxy tool parity decision (currently: accepted divergence, vite dev has no tools).
- **Why:** Each was consciously deferred with a named trigger rather than skipped.
- **Effort:** varies (S-M each) → (CC: S-M).

### P3 — Remove now-dead waitlist UI (cohort cap decoupled 2026-07-14)
- **What:** The founding cap no longer gates AI (drop_cohort_cap_gate.sql). These paths never fire now: Survey waitlist confirmation screen (`submitted && waitlisted`), Taxi/Report `gateReason` 'waitlist' branch, Admin submissions Waitlist filter + "Promote to cohort" button, `isWaitlisted` helper.
- **Why:** Dead/defensive code. Harmless (no waitlist rows produced), but confusing to future readers.
- **Effort:** S → (CC: S). **Note:** keep the DB `waitlist` status value + add_cohort_cap_trigger.sql so a hard cap can be re-enabled; this is purely UI cleanup.
