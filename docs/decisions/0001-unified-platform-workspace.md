# ADR 0001: Unified platform workspace

**Status:** Accepted locally for implementation<br>
**Date:** 2026-08-30<br>
**Owner:** J Gu

## Context

The product has three repositories with complementary assets:

- `taxtech_benchmark` is the working React/Supabase/Vercel product and evaluated Claude tool harness.
- `taxinfra` is a Python domain prototype with useful tax models, rules, filing primitives, reconciliation, anomalies, and notice prompts, alongside scaffold agents and in-memory infrastructure.
- `taxbrains` is a small commercial landing surface without product behavior.

Maintaining three product backlogs, dependency systems, auth approaches, and AI-agent contexts slows a founder-led company whose first target is 100 customers at about $10,000 annually.

## Decision

Build one TypeScript/Supabase workspace with two independently deployed applications:

- taxbenchmark is the public community, benchmark, and acquisition surface.
- TaxBrains tax operations is the organization-level paid compliance workspace.

Use the `taxtech_benchmark` history as the base. Add TaxBrains under `apps/tax-ops` now. Keep the benchmark at the root until a separate preview proves that moving it to `apps/benchmark` preserves all Vercel functions and routes.

Port selected `taxinfra` assets into tested deterministic packages and effective-dated database tables. Do not keep the Python runtime unless a measured workload, such as OCR, requires it.

## Options considered

1. **Keep three repositories:** rejected because it preserves duplicated coordination and unclear ownership.
2. **TypeScript/Supabase workspace with incremental ports:** accepted because it reuses the strongest product and AI foundations with one operating model.
3. **Permanent Python microservice:** deferred because current deterministic assets do not justify cross-service auth, deployment, and observability.
4. **Use `taxinfra` as the foundation:** rejected because it would rebuild the stronger UI, persistence, security, and evaluation harness.

## Consequences

Positive:

- one roadmap, lockfile, CI gate, and AI-agent context;
- shared typed contracts without mixing deployment authority;
- deterministic tools and evidence controls reused across apps;
- compliance can ship before planning and audit response.

Negative:

- selected Python rules and tests must be ported carefully;
- the benchmark remains temporarily at the root;
- shared infrastructure increases blast radius unless secrets, roles, and deployments remain separate.

## Guardrails

- Customer tax records never flow into benchmark datasets by default.
- All paid-product data is organization-owned and protected by RLS.
- Tax liabilities come from deterministic, versioned tools—not model memory.
- A named person approves filing workpapers and every irreversible action.
- No old repository is archived until its retained assets have parity tests and a recorded destination.

## First implementation slice

Monthly indirect-tax compliance close: CSV transaction/GL intake, normalization, deterministic expected-tax checks, reconciliation, exceptions, traceable filing workpapers, named approval, and export. Direct filing and payment are explicitly excluded.
