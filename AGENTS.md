# TaxBrains platform agent instructions

These instructions apply to the entire repository. They are the common entry point for Codex, Claude Code, and other implementation agents.

## Mission and current product direction

Build a company serving 100 small-to-medium businesses at approximately $10,000 per year.

- **taxbenchmark.ai** is the public benchmark, community, content, and acquisition layer.
- **taxbrains.ai** is the paid organization-level product for end-to-end tax operations.
- The first paid wedge is **indirect-tax compliance close automation** because it has frequent, measurable cost savings.
- Audit response follows compliance. Planning follows once customer data and workflows are trustworthy.

The plan in `docs/decisions/0001-unified-platform-workspace.md` supersedes the older free-tools-first plan in `docs/TAXBRAINS_PLAN.md`.

## Architecture

- The benchmark remains at the repository root during the transition.
- The TaxBrains app lives in `apps/tax-ops`.
- Shared executable domain code lives in `packages`; do not create empty package scaffolds.
- Supabase is the identity and persistence platform, with separate organization-owned tax-operations tables.
- Keep benchmark and tax-operations deployments, secrets, service roles, and data access independent.

Read `docs/PLATFORM_WORKSPACE.md` before changing boundaries or database tables.

## Required verification

Run from the repository root:

```sh
npm run verify
npm audit --audit-level=high
```

`verify` must type-check and build every app/package and pass the complete deterministic test suite. Add a focused test for every domain behavior or regression.

## Tax and financial invariants

1. Never calculate tax liabilities with an LLM or model memory.
2. Use deterministic, versioned tools that return rule IDs, sources, and effective dates.
3. Never represent financial amounts with JavaScript floating point. Use `Money` from `@taxbrains/tax-domain` or an equally exact representation.
4. Reject cross-organization and mixed-currency computation inputs.
5. Every derived value must retain links to its source transactions, GL entries, rule version, and workflow run.
6. Every rate/rule import requires a source URL, effective date, and verification date.
7. Every filing workpaper and irreversible action requires named human approval.
8. Direct filing and payment are out of scope until explicitly approved and separately controlled.

## Data security invariants

- Every paid-product row is owned by an organization and protected by membership-aware RLS.
- Customer transactions, GL entries, filings, notices, workpapers, and evidence never enter benchmark/community tables by default.
- Never expose service-role keys, model keys, raw customer records, or private benchmark submissions in client bundles, logs, evals, or fixtures.
- Client requests do not establish tenant identity. Derive the user from verified auth and re-check organization membership server-side.
- Financial imports and derived results are written by trusted server workflows. Prefer narrow audited RPCs over broad client table grants.
- Make import and workflow execution idempotent and content-addressed where practical.

## Agent and workflow terminology

- A **tool** is deterministic executable behavior.
- A **workflow** is a durable, stateful sequence with retries and approval gates.
- An **agent** is a constrained model planner selecting approved tools.

Do not create named “agents” that return canned recommendations, zero-dollar outputs, mocked integrations, or aspirational status. If only a contract exists, call it a contract and keep it out of product claims.

## Porting from `taxinfra`

Treat `taxinfra` as a read-only source of domain knowledge, not a runtime dependency:

1. Select one customer workflow and the minimum relevant Python behavior.
2. Extract language-neutral golden fixtures from its tests.
3. Re-verify legal/tax sources and effective dates.
4. Port deterministic behavior into TypeScript/SQL with exact money and tenant boundaries.
5. Pass parity, provenance, security, and product tests.
6. Record the retained destination before retiring old code.

Do not port scaffold agents, in-memory auth/trust stores, static dashboards, mock feeds, or empty ERP connectors.

## Scope discipline

- Prefer one complete vertical slice over broad country or agent coverage.
- For the first slice: CSV transaction/GL intake → normalization → deterministic checks → reconciliation → exceptions → filing workpapers → approval → export.
- Keep AI outside the financial calculation path. It may classify, organize, explain, and draft, but its outputs are untrusted until deterministic validation and human review.
- Do not move the benchmark into `apps/benchmark` until a preview deployment proves route and Vercel-function parity.
- Do not push, deploy, mutate production Supabase, or archive repositories unless the user explicitly authorizes that external action.

## Definition of done

A capability is done only when:

- its real data path exists—no hardcoded success;
- tenant authorization is enforced server-side and by RLS;
- deterministic outputs are exact and source-linked;
- failure, duplicate, and retry behavior is tested;
- human approval is present where required;
- workspace verification is green;
- `docs/RESTART_HERE.md` and relevant decision/runbook docs reflect the new state.
