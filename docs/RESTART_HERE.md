# Restart here

**Last updated:** 2026-08-30<br>
**Working branch:** `codex/unify-platform-phase-1`<br>
**Plan of record:** `docs/decisions/0001-unified-platform-workspace.md`

## Current state

The local `taxtech_benchmark` checkout is now the consolidation workspace. The benchmark remains at the repository root to avoid changing its production Vercel routing. The TaxBrains commercial surface is integrated at `apps/tax-ops`.

Implemented foundations:

- npm workspace covering `apps/*` and `packages/*`;
- compliance-first TaxBrains landing surface and separate Vercel project config;
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

## Verification

Run from the repository root:

```sh
npm ci
npm run verify
npm audit --audit-level=high
git diff --check
```

The migrations `supabase/add_tax_ops_foundation.sql` and `supabase/add_tax_ops_workpapers.sql` have been reviewed statically but not executed because no local Postgres/Supabase CLI is installed and production mutation was intentionally excluded.

## Important stop gates

- Do not apply the migration to production first. Use a preview Supabase project and add RLS integration tests.
- Do not move the benchmark into `apps/benchmark` until a preview deployment proves API and route parity.
- Do not calculate expected tax for a customer until taxability, jurisdiction, effective-date, source, and rounding rules are all explicit.
- Do not connect customer tax data to benchmark/community tables.
- Do not add a generic “agent” in front of the preflight; the deterministic workflow already defines the calculation path.

## Next implementation order

1. Validate `add_tax_ops_foundation.sql` in a preview Supabase project and test two-user/two-organization isolation.
2. Add TaxBrains authentication plus an organization selector using the new RPC and membership tables.
3. Add a trusted server endpoint for import-batch creation and normalized-row persistence; clients must not write financial rows directly.
4. Build the review UI around `runComplianceClosePreflight`: import errors first, then anomalies and reconciliation items.
5. Re-verify and import the first narrow taxability/rate rule set demanded by a design partner.
6. Connect sourced determinations to `buildFilingWorkpaper` and persist named approvals/evidence artifacts.
7. Deploy only after a preview exercise with synthetic company data passes.

## Repositories retained as references

- `work/taxinfra` remains clean and read-only. Port golden fixtures and verified domain behavior only.
- `work/taxbrains` remains clean and read-only. Its commercial surface has been incorporated and repositioned around compliance.
- Neither repository has been archived or changed remotely.
