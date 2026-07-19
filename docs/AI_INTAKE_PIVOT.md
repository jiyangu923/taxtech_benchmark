# AI-Led Intake Pivot — "the survey becomes the backend"

**Decision (Jiyan, 2026-07-15):** people aren't filling the survey form. Replace it:
Taxi interviews new users conversationally, interprets their answers, and fills the
survey record for them. The `submissions` schema stays exactly as-is — it becomes a
backend data model with an AI front door instead of a form front door.

Decisions taken (AskUserQuestion, 2026-07-15):
- **Form's fate: REMOVED entirely** (not kept as fallback). The survey schema is the
  record format; AI interprets → fills → it becomes a record. The AI additionally
  captures benchmark-relevant facts beyond the fixed fields (overflow channel).
- **Depth: quick interview** — ~5–7 questions to first benchmark; everything else is
  collected progressively during later benchmark conversations.
- **Home: inside Taxi** — the interview replaces Taxi's lock screen; it IS the user's
  first Taxi conversation, flowing straight into their first peer comparison.

## Why this works with what's already built

- The form only ever *required* 4 fields (`companyProfile`, `respondentRole`,
  `revenueRange`, `jurisdictionsCovered`) — the rest of its 20–31 rendered fields are
  optional. A 5–7 question chat is genuinely shorter than the wizard, not just prettier.
- `createSubmission` (services/api.ts) already does everything the pivot needs:
  auto-approve on insert, `userName` stamped server-side from the profile, prior row
  archived via the SECURITY DEFINER RPC. AI intake produces the same payload the form
  did; zero backend schema change. Profile updates later = same insert-and-archive
  path (sidesteps the no-UPDATE RLS rule on submissions).
- Instant-AI decisions from earlier (auto-approve + cap decoupling, PR #130) mean
  submit → benchmark is already instantaneous. This pivot removes the last friction
  wall in the funnel: signup → chat → record created → first benchmark, one surface.

## Architecture

### Server: `mode: 'intake'` on /api/claude (max-lockdown posture)

The existing cohort gate 403s users without an approved submission — but intake users
by definition have none. Deleting the gate would open a free general-purpose Claude
proxy. Instead, intake is a **server-owned mode**, mirroring the model/tools lockdown:

- `body.mode === 'intake'` bypasses the approved-submission gate ONLY. Auth (bearer)
  and the $5/24h meter still apply in full.
- In intake mode the server **ignores** client `system`, `tools`, and `outputFormat`
  entirely and injects its own interview prompt + extraction schema (both inlined in
  api/claude.ts — the no-relative-imports rule — with a parity test asserting the
  inlined enum values match constants.ts `OPTS_*`).
- Tighter output budget (intake replies are short); no tools in intake mode.
- Every turn returns `{ reply, extracted, complete }` via structured outputs:
  `extracted` holds nullable enum-constrained survey fields + `otherFacts: string[]`
  (the overflow channel — benchmark-relevant facts that don't fit a fixed field).
- Intake turns persist to ai_answers like everything else (audit + future evals).

### Client: intake conversation inside Taxi

- New `services/intake.ts` (mirrors taxi.ts): interview message builder, an
  accumulator that merges each turn's non-null `extracted` fields over the running
  draft, and a completion check (the 4 required fields present).
- Taxi's lock screen is replaced by the live interview. Conversation state is local
  (+ localStorage draft mirror, like the form's old draft). Captured fields render as
  confirmation chips ("✓ Revenue: $100M–$1B"); corrections happen conversationally
  ("actually we're over $5B") — the accumulator takes the latest non-null value.
- On completion: build the submission payload (accumulated fields over the same
  defaults the form used; `otherFacts` joined into `additionalNotes`) →
  `createSubmission` → queries invalidate → Taxi flips to benchmark mode in the same
  thread and auto-asks the first comparison question. The wow moment is immediate.
- Progressive profiling (phase 2): during benchmark chats, Taxi may ask for a missing
  field relevant to the question; answers merge into a new submission via the same
  insert-and-archive path.

### Privacy (unchanged boundary, now stronger)

- `userName` was never user input (profile-stamped server-side) — unchanged.
- `companyName` was an optional form field; the interview **never asks for it** and
  the extraction schema has no slot for it. Anonymity becomes the default rather than
  an option. The intake prompt explicitly instructs: no names, no company identifiers;
  if the user volunteers one, don't record it.
- The intake system prompt contains no cohort data (nothing to leak to a brand-new
  user).

## Shipping order (form comes out LAST — no doorless moment)

1. **PR A — server intake mode** in api/claude.ts + tests (gate bypass only for
   intake; lockdown: client system/tools/outputFormat ignored; enum parity test).
   Deploy-safe: nothing calls it yet.
2. **PR B — Taxi interview UI** + services/intake.ts + completion → createSubmission
   → auto-first-benchmark. Form still exists; new users get the interview, the form
   quietly remains reachable for one release as a safety net.
3. **Verify live** (real signup → interview → record → benchmark), then
   **PR C — funnel switch + form removal**: Home/Report copy → "chat with Taxi",
   /survey route redirects to /taxi, delete Survey.tsx + branching + tests, and
   remove the dead waitlist UI (TODOS P3) in the same sweep.
4. **Later:** progressive profiling in benchmark mode; intake-extraction golden evals
   (wrong-enum traps, "didn't answer" cases); formalize `otherFacts` into a structured
   store if it proves valuable (currently → additionalNotes).

## Interview design (the 5–7 questions)

Required (blocks record creation): company profile, respondent role, revenue range,
jurisdictions count. High-value optional (asked if the flow feels natural, skippable):
tax-calculation automation level, AI adoption (+ stage if yes), tax-tech FTE range.
One question at a time, acknowledge each answer, never re-ask something answered,
accept corrections, and close with: "That's everything I need — creating your
benchmark profile now."
