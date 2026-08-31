# Platform workspace

## Current layout

```text
repository root/            taxbenchmark application (transitional location)
├── api/                    benchmark serverless functions
├── pages/                  benchmark product pages
├── services/               benchmark client/domain services
├── apps/tax-ops/           TaxBrains commercial application
├── packages/tax-domain/    exact compliance-domain behavior
├── packages/tax-import/    deterministic CSV ingestion boundary
├── packages/tax-rules/     effective-dated rate application
├── packages/tax-workflows/ deterministic compliance workflow composition
└── supabase/               current benchmark migrations and seeds
```

The benchmark remains at the repository root in Phase 1 to preserve its existing Vercel paths and production behavior. It will move to `apps/benchmark` only after deployment parity is proven in a preview environment.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run the benchmark locally |
| `npm --workspace=@taxbrains/tax-ops run dev` | Run TaxBrains locally |
| `npm run typecheck:all` | Type-check the root app and every workspace package |
| `npm run build:all` | Build the root app and every buildable workspace package |
| `npm test` | Run the complete deterministic workspace suite |
| `npm run verify` | Type-check, build, and test both surfaces |
| `npm audit --audit-level=high` | Gate production and development dependency advisories |
| `npm run compliance:preflight -- …` | Run the deterministic workflow against local CSV exports |

Vercel request/response imports are type-only. A narrow ambient declaration in
`types/vercel-node.d.ts` keeps those handlers type-checked without installing the
full `@vercel/node` build runtime and its unrelated transitive toolchain.

A fictional, non-customer example is available under `examples/compliance-close`.

## Deployment boundaries

| Surface | Runtime/project root | Domain | Data/secrets |
|---|---|---|---|
| Benchmark web | Vercel, repository root | `taxbenchmark.ai` | Community and benchmark browser credentials |
| Tax operations web | Vercel, `apps/tax-ops` | `taxbrains.ai` after preview approval | Browser-safe TaxBrains credentials only |
| Tax operations API | New Google Cloud Run service | `api.taxbrains.ai` | Server credentials and narrow organization operations |
| Tax workflow workers | Google Cloud Run jobs/services | No public browser domain | Imports, reconciliation, evidence, and notice processing |
| System of record | Supabase | Provider-managed endpoints | Auth, RLS-protected organization data, and evidence storage |

The projects share Git history and packages, not deployment authority. Production promotion remains independent. The existing `taxbrains-platform` FastAPI service is a retained rollback target during migration, not the backend foundation for the new product. See [ADR 0002](decisions/0002-taxbrains-deployment-architecture.md) and the [domain cutover runbook](runbooks/taxbrains-domain-cutover.md).

## Database transition

The existing `supabase/` directory is the benchmark schema. Paid-product tables must add organization tenancy before receiving customer records. Each new row family must have:

- `organization_id` ownership;
- membership-aware RLS;
- explicit service-role operations;
- created/updated actor and timestamps;
- idempotency keys for imports and workflow runs;
- evidence links for derived financial values;
- separate policies for approved anonymous aggregates.

Do not place uploaded transaction, GL, filing, notice, or workpaper data into benchmark submission tables.

The two unapplied tax-operations migrations are ordered:

1. `add_tax_ops_foundation.sql` — organizations, membership, imports, normalized transactions/GL, and reconciliation.
2. `add_tax_ops_workpapers.sql` — sourced determinations, workpapers, line provenance, named approvals, and content-addressed evidence.

## Migration rule for `taxinfra`

`taxinfra` is a source of domain knowledge, not a service dependency. Port only one vertical slice at a time:

1. Extract Python behavior into language-neutral golden fixtures.
2. Re-verify the underlying tax authority source and effective date.
3. Implement the deterministic TypeScript/SQL equivalent.
4. Prove parity against the fixtures.
5. Add provenance, tenant ownership, and review controls.
6. Retire the corresponding Python implementation only after parity and product validation.

The first slice is CSV transaction/GL ingestion through reconciliation, exception review, filing workpapers, approval, and export. Autonomous filing and payment remain out of scope.
