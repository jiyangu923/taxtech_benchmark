# TaxBrains tax operations

This app is the authenticated commercial product surface for indirect-tax compliance operations. During Phase 1 it contains the public pilot landing page; product workflows will be added behind organization-level authentication and row-level security.

## Local commands

Run commands from the repository root so the shared lockfile is used:

```sh
npm install
npm run build:tax-ops
npm run typecheck:tax-ops
npm --workspace=@taxbrains/tax-ops run dev
```

For an independent Vercel project, configure the project root directory as `apps/tax-ops`. Keep its domains, secrets, service roles, and deployment approvals separate from the benchmark project.

## Product boundary

- TaxBrains owns organization, transaction, GL, reconciliation, filing-workpaper, approval, and evidence data.
- taxbenchmark owns community profiles, submissions, reports, and approved aggregate benchmarks.
- Customer tax records never enter benchmark/community tables by default.
- Models can organize, route, and explain work; deterministic tools calculate tax and reconciliation outputs.
