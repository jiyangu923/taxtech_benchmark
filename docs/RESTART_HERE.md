# Restart here

**Last updated:** 2026-08-30<br>
**Working branch:** `codex/unify-platform-phase-1`<br>
**Plans of record:** `docs/decisions/0001-unified-platform-workspace.md` and `docs/decisions/0002-taxbrains-deployment-architecture.md`

## Current state

The local `taxtech_benchmark` checkout is now the consolidation workspace. The benchmark remains at the repository root to avoid changing its production Vercel routing. The TaxBrains commercial surface is integrated at `apps/tax-ops`.

Implemented foundations:

- npm workspace covering `apps/*` and `packages/*`;
- compliance-first TaxBrains landing surface and separate Vercel project config;
- TaxBrains routes for the automation roadmap, compliance pilot, benchmark intelligence, and explicit not-found behavior;
- workspace-wide type, build, test, and dependency-audit CI gates;
- shared agent instructions in `AGENTS.md` to prevent conflicting plans and fake agent scaffolds;
- exact-money representation with explicit scale and no JavaScript floating point;
- transaction-to-GL reconciliation, including split GL postings and source IDs;
- deterministic anomaly rules for missing tax, duplicates, missing jurisdictions, and large values;
- provenance-required, human-approval-required filing workpaper aggregation;
- RFC 4180-style transaction and GL CSV parsing/normalization with structured row errors;
- effective-dated rational tax-rate application with explicit rounding;
- an end-to-end recorded-tax compliance preflight that blocks bad imports, separates currencies, detects anomalies, and reconciles recorded tax to GL;
- unapplied Supabase migrations for organization tenancy, idempotent imports, normalized transaction/GL data, versioned reconciliation results, sourced determinations, filing workpapers, approvals, and evidence artifacts.
- a deployment boundary that uses Vercel for the two frontends, Supabase for auth/data, and a new Cloud Run service for authenticated APIs and durable workflow workers;
- a `taxbrains.ai` cutover runbook that keeps the existing Cloud Run application available for rollback and leaves `taxbenchmark.ai` untouched.

## Verification

Run from the repository root:

```sh
npm ci
npm run verify
npm audit --audit-level=high
git diff --check
```

The migrations `supabase/add_tax_ops_foundation.sql` and `supabase/add_tax_ops_workpapers.sql` have been reviewed statically but not executed because no local Postgres/Supabase CLI is installed and production mutation was intentionally excluded.

The unified TaxBrains frontend is deployed as a protected, non-production Vercel preview at `https://taxbrains-korpsww07-jiyangu923-3533s-projects.vercel.app` (deployment `dpl_2BmeaoNmPPrZKUKBgB3rbr2WoPvF`). All direct routes and the social image return 200 through the authenticated preview check. GitHub PR #152 contains the branch, CI is green, and neither production domain nor DNS has been changed.

## Important stop gates

- Do not apply the migration to production first. Use a preview Supabase project and add RLS integration tests.
- Do not move the benchmark into `apps/benchmark` until a preview deployment proves API and route parity.
- Do not calculate expected tax for a customer until taxability, jurisdiction, effective-date, source, and rounding rules are all explicit.
- Do not connect customer tax data to benchmark/community tables.
- Do not add a generic “agent” in front of the preflight; the deterministic workflow already defines the calculation path.
- Do not point `taxbrains.ai` at Vercel until the authentication/API transition and rollback gates in `docs/runbooks/taxbrains-domain-cutover.md` pass.

## Next implementation order

1. Validate `add_tax_ops_foundation.sql` in a preview Supabase project and test two-user/two-organization isolation.
2. Create the new TaxBrains Cloud Run API boundary and add Supabase JWT verification plus a server-side organization-membership check.
3. Add TaxBrains authentication plus an organization selector using the new API and membership tables.
4. Add a trusted server endpoint for import-batch creation and normalized-row persistence; clients must not write financial rows directly.
5. Build the review UI around `runComplianceClosePreflight`: import errors first, then anomalies and reconciliation items.
6. Re-verify and import the first narrow taxability/rate rule set demanded by a design partner.
7. Connect sourced determinations to `buildFilingWorkpaper` and persist named approvals/evidence artifacts.
8. Deploy only after a preview exercise with synthetic company data passes.

## Repositories retained as references

- `work/taxinfra` remains clean and read-only. Port golden fixtures and verified domain behavior only.
- `work/taxbrains` remains clean and read-only. Its commercial surface has been incorporated and repositioned around compliance.
- Neither repository has been archived or changed remotely.
