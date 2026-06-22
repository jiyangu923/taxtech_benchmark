# Tax AI Infrastructure — Speaker Notes & Run-of-Show

**Talk:** TEI Conference keynote · ~45 minutes
**Core message:** AI in tax evolves through three stages — **AI-Native Foundation → AI Continuous Learning → AI Proactive Management** (near-autonomous, human approval retained). Coding AI is the leading indicator, ~2–3 years ahead.
**Throughline:** Models commoditize; *infrastructure compounds*. Build the stack in order; earn autonomy with evidence.

> The deck (`index.html`) carries full speaker notes on every slide — press **N** while presenting to see them. This file is the rehearsal script and timing plan.

---

## The spine (memorize this)

1. **Three shifts** frame the change: Software→Infrastructure · Batch→Real-time · Headcount→Oversight.
2. **The 6-layer stack:** Data → Knowledge/Grounding → Models → Agents → Orchestration → Governance/Evals. Built bottom-up.
3. **The three stages of AI evolution:** AI-Native Foundation → Continuous Learning → Proactive Management.
4. **The proof:** coding AI is already running this playbook ~2–3 years ahead. Stage 1 done (90), Stage 2 in progress (40), Stage 3 emerging (20).

---

## Run of show (~45 min)

| # | Slide | ~min | Beat |
|---|-------|------|------|
| 1 | Title | 1 | "Everyone talks about AI *models*. I want to talk about AI *infrastructure*." |
| 2 | The question | 1 | "In 2028, what part of tax is done the way it is today?" Show of hands. |
| 3 | Evidence base | 1.5 | Credibility: a vendor-neutral benchmark of real tax-tech teams. |
| 4 | Thesis: 3 shifts | 2 | The spine. "Best infrastructure around an ordinary model wins." |
| 5 | Divider: Today | 0.5 | Be honest about the floor. |
| 6 | Today's reality | 2 | ERP+XLS, batch, multi-week response. "Can't bolt agents onto a spreadsheet." |
| 7 | The AI gap | 2 | Exploration/PoC dominate. The demo→production gap *is* the infrastructure. |
| 8 | Why now | 2 | Capability (possible) · Regulation (necessary) · Pressure (urgent). |
| 9 | Divider: The stack | 0.5 | Six layers, bottom-up. |
| 10 | Stack overview | 2 | Value lives in layers 1, 2, 6 — demos live in layer 4. |
| 11 | Layer 1 · Data | 2 | Unglamorous, highest ROI. E-invoicing hands you the data. |
| 12 | Layer 2 · Grounding | 2 | RAG = citable answers. No citations, no auditor. |
| 13 | Layer 3 · Models | 2 | Commodity. Stay swappable. ~10× cost drop per generation. |
| 14 | Layer 4 · Agents | 2 | Research / compliance / provision / controversy. Drafts for review. |
| 15 | Layer 5 · Orchestration | 2 | Connectors + MCP + approvals. Where pilots touch a real return. |
| 16 | Layer 6 · Governance | 2.5 | The moat. "Being right isn't enough — prove you were right." |
| 17 | Divider: 3 stages | 0.5 | Transition to the framework. |
| 18 | **Three-stage framework** | 3 | **Centerpiece.** Walk all three, then dwell on each. |
| 19 | **Coding = leading indicator** | 3 | **The proof.** Stage 1 done, 2 in progress, 3 emerging. Approval gate constant. |
| 20 | **Scorecard: Coding vs Tax** | 2 | **Most quotable slide.** Coding 90/40/20, Tax 15/5/0. Same curve, ~2–3 yr lag. Invite the room to argue the numbers. |
| 21 | **The harness diffuses** | 3 | **The mechanism.** Stage 2/3 harness doesn't exist yet; built in coding first, diffuses to tax. Most startups still foundation-stage. |
| 22 | **Foundation across the lifecycle** | 3 | **Your case study.** One AI-native foundation under Planning / Compliance & Reporting / Audit. Foundation first. |
| 23 | **The flywheel** | 2.5 | **The payoff.** Connect end-to-end → audit-ready lineage → feedback → foundation compounds. Audit closes the loop = Stage 2 fuel. |
| 24 | **What the foundation requires** | 2.5 | **Infra depth + vendors.** Nine disciplines: lakehouse · streaming · integration · master data · **graph** · retrieval · ML platform · governance · evals — each with a representative service. |
| 25 | **Why it's hard** | 2 | **The honest part.** Fragmented data · real-time skills · doubly-rare talent · multi-year build · split ownership · cost center. |
| 26 | **Why we were positioned** | 2.5 | **Earned, not lucky.** Hyperscale infra exists · real-time by default · eng talent · in-house AI/compute · scale ROI · eng-owned tax. |
| 27 | First vs last to automate | 2 | Volume/structure automate; judgment/accountability stay human. |
| 28 | Divider: Implications | 0.5 | What it means for your team. |
| 29 | Build vs buy | 2 | Buy the commodity, own the context. |
| 30 | Org & talent | 2 | Team inverts. The "credibly both" hire. Resolve ownership. |
| 31 | Risks / trust | 2.5 | Each risk maps to a layer. The stack *is* the risk strategy. |
| 32 | Maturity model | 2 | "Be honest — who's above Level 0?" Climb in order. |
| 33 | Action: 5 moves | 2 | Data foundation · eval set · ownership · one workflow · model-agnostic. |
| 34 | Recap | 1 | Callback to 3 shifts. "Infrastructure compounds." |
| 35 | Benchmark / join | 1 | Community infrastructure for the field. |
| 36 | QR / try it live | 0.5 | Scan to join. |
| 37 | Thank you / Q&A | — | "Tell me what's broken in your stack." |

> **Slides 19–21 are the engine of the argument.** 19: coding is already running
> the playbook. 20: the scorecard makes the gap a number (90/40/20 vs 15/5/0).
> 21: the Stage 2/3 harness doesn't exist yet anywhere — invented in coding,
> diffuses to tax. *Therefore* the rational move (22) is to build the AI-native
> foundation now — the portable part you control — so you're ready when the
> harness arrives.
>
> **Slides 24–26 are the infra core.** 24: the nine disciplines a real
> foundation needs. 25: why almost no tax function can stand them up (the blocker
> is infra surface area, not the model). 26: why your environment could — the
> barriers on 25 are exactly what's already solved at Meta. Genericize 26 if
> you're not cleared to attribute specifics.
>
> **Running ~43–45 min. To hit a hard 40, collapse the six stack-layer slides
> (11–16) into two.**

---

## The coding analogy — say it precisely

- **Stage 1 — AI-Native Foundation → DONE in coding (~90).** Writing code with AI is the default now (Claude Code, AI-first editors). The transformation is complete, not coming.
- **Stage 2 — Continuous Learning → IN PROGRESS (~40).** The strategic prize is *data access* — the usage signal (accepts, edits, fixes) that lets tools learn. Still batch retraining + memory, not a closed real-time loop.
- **Stage 3 — Proactive Management → EMERGING (~20).** Agents that proactively refactor, fix, open a PR exist — but it's *not* autonomous. A human still approves the merge.

**The killer line:** "In coding, the human approves the *merge*. In tax, the human approves the *filing*. The approval gate is the constant — all the way through. Tax is roughly where coding was two years ago; the map is already drawn."

> Keep the data-access point directional ("AI-native coding tools are valued for their data access") rather than asserting a specific acquisition you'd have to defend in Q&A. Treat the 90/40/20 vs 15/5/0 scores as a directional, early-2026 judgment — invite the room to argue them.

---

## Likely Q&A — have answers ready

- **"Won't AI replace tax jobs?"** → Volume and structure get automated; judgment and accountability stay human and grow as a share of the role. Stage 3 keeps the approval gate. (Slide 27)
- **"How do we trust a hallucinating model with tax?"** → Grounding (citations) + evals (measured accuracy) + audit trail (lineage). Slide 31 — each risk maps to a layer.
- **"Build or buy?"** → Buy the commodity (models, engines, connectors). Own the context (data, grounding, evals, governance). Slide 29.
- **"Where do we start with no budget?"** → The eval set and data foundation are discipline, not spend. Slide 33.
- **"Which model should we standardize on?"** → None — stay swappable. Architect so you can change the model in an afternoon. Slide 13.
- **"Aren't you just guessing at the 90/40/20 numbers?"** → Yes, they're directional — but the *shape* (same curve, 2–3 yr lag) is the point, and coding's trajectory is observable. Happy to debate the digits.
