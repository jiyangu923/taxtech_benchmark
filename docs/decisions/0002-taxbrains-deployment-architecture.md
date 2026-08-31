# ADR 0002: TaxBrains deployment architecture

**Status:** Accepted for implementation<br>
**Date:** 2026-08-30<br>
**Owner:** J Gu

## Context

The unified repository has two web surfaces and a compliance product that will need secure data ingestion, deterministic calculations, durable workflow state, retries, and human approval. The current `taxbrains.ai` deployment is a legacy FastAPI service on Cloud Run. It has useful rollback value, but its deployed environment has no database configuration and it is not the foundation for the new paid product.

The decision is whether to place the entire backend on Vercel, rebuild the entire product on Google Cloud, or use each platform for the work it handles best.

## Decision

Use a deliberately small hybrid stack:

- **Vercel:** the public benchmark frontend and the TaxBrains frontend. They remain separate Vercel projects and deploy from different roots in this repository.
- **Supabase:** Postgres, authentication, row-level security, and evidence storage. Organization ownership is enforced in the database as well as the server.
- **Google Cloud Run:** stateless TaxBrains APIs and containerized workers that need longer execution, controlled concurrency, or non-JavaScript libraries.
- **Google Cloud Tasks or an equivalent durable queue:** dispatch imports, reconciliations, evidence generation, and notice processing to idempotent Cloud Run workers when those asynchronous workflows are implemented.

The browser never receives a Supabase service-role key and never writes normalized financial rows directly. It obtains a user session, calls a trusted API, and the API re-validates the user and organization membership before invoking narrow database operations.

The legacy `taxbrains-platform` Cloud Run service is not extended into the new architecture. It remains available during migration as a rollback target and source reference. A new backend service will use a distinct deployment identity and the planned `api.taxbrains.ai` hostname.

## Why not put everything on Vercel

Vercel is a strong fit for the React frontends and short request/response endpoints. It is not the preferred execution boundary for tax imports, OCR, large reconciliations, retryable evidence jobs, or workloads needing explicit container resources and concurrency controls. Those workflows should not be forced through a frontend deployment simply to reduce the number of platforms.

## Why not move everything to Google Cloud

Rebuilding frontend hosting, previews, authentication, Postgres policies, and storage on Google Cloud would add migration work without improving the first compliance pilot. The existing React/Vercel and Supabase foundation is the fastest path to a customer-visible, tenant-safe product.

## Deployment and trust boundaries

| Component | Deployment | Public hostname | Authority |
|---|---|---|---|
| Taxbenchmark | Vercel, repository root | `taxbenchmark.ai` | Community and benchmark data only |
| TaxBrains web | Vercel, `apps/tax-ops` | `taxbrains.ai` after preview approval | Browser UI and user sessions; no service credentials |
| TaxBrains API | New Cloud Run service | `api.taxbrains.ai` | Authenticated organization operations and narrow RPCs |
| Tax workflow workers | Cloud Run jobs/services | No public browser hostname | Imports, reconciliation, evidence, notices, and retries |
| System of record | Supabase | Provider-managed endpoints | Auth, organization-owned data, RLS, and evidence storage |

Only exact allowed frontend origins may call the API. API authentication uses a verified Supabase JWT and a server-side membership check. Every queued job carries an immutable organization ID, workflow ID, and idempotency key; the worker re-checks these values against the database rather than trusting browser input.

## Consequences

Positive:

- frontend previews and rollback remain simple;
- long-running compliance work has an appropriate execution environment;
- the database remains the source of tenancy and approval truth;
- the old in-memory Python application does not become a hidden production dependency.

Costs:

- Vercel, Supabase, and Google Cloud each require separate secrets and deployment controls;
- API CORS, JWT verification, queues, and service identities must be tested explicitly;
- observability must correlate one workflow across the web, API, queue, worker, and database.

## Cutover rule

Do not point `taxbrains.ai` at Vercel merely because the landing pages build. First pass the preview, route, accessibility, authentication-transition, API, and rollback gates in `docs/runbooks/taxbrains-domain-cutover.md`. `taxbenchmark.ai` is out of scope for this domain migration and remains untouched.
