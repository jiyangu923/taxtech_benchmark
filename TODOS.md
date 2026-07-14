# TODOS

Deferred work with context. Convention: every deferral from a review lands here or it
didn't happen. Effort scale: human-team → (CC = with Claude Code). Priority P1-P3.

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
