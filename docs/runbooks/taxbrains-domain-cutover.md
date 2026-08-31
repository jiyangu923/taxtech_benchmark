# TaxBrains domain cutover runbook

## Goal

Move only `taxbrains.ai` from the legacy Cloud Run web application to the unified TaxBrains Vercel frontend without interrupting `taxbenchmark.ai`, losing the legacy rollback path, or silently removing authentication/API behavior.

## Audited starting state — 2026-08-30

- Google Cloud project: `taxbrains-ai-platform`
- Legacy Cloud Run service: `taxbrains-platform`
- Region: `us-west1`
- Traffic: 100% to revision `taxbrains-platform-00072-x99`
- Stable provider URL: `https://taxbrains-platform-fo6dbyfcda-uw.a.run.app`
- Custom domain: `taxbrains.ai`, currently mapped to Cloud Run and healthy
- Public legacy routes include `/login`, `/register`, `/docs`, `/openapi.json`, and `/api/v1/*`
- The deployed environment exposes application, Google OAuth, and Gemini configuration names but no database connection variable.

Do not copy secret values from the legacy service into documentation, logs, frontend variables, or pull requests.

## Non-negotiable preconditions

- [ ] The `apps/tax-ops` Vercel preview builds from the repository workspace and direct navigation works for `/`, `/automation`, `/automation/compliance`, and `/benchmark`.
- [ ] Desktop and mobile visual QA, keyboard navigation, and a basic accessibility scan pass.
- [ ] The full repository verification and dependency audit pass from a clean install.
- [ ] `taxbenchmark.ai` and its Vercel project show no code, environment, domain, or route changes.
- [ ] The treatment of the legacy `/login`, `/register`, and `/api/v1/*` routes is explicit: port them, replace them, or deliberately redirect them. A static landing page alone is not parity.
- [ ] A new TaxBrains API is reachable through a preview-safe URL and verifies Supabase JWTs plus organization membership. Do not expose the legacy in-memory API as the new product API.
- [ ] The future `api.taxbrains.ai` mapping, exact CORS allowlist, OAuth redirect URIs, cookie scope, and `APP_BASE_URL` changes are verified in a non-production environment.
- [ ] A synthetic two-user/two-organization test proves RLS and API tenant isolation.
- [ ] The current Cloud Run domain mapping and provider URL are retained for rollback.

## Cutover sequence

1. Push the reviewed branch and create a pull request. Do not merge until CI is green.
2. Create a Vercel preview for `apps/tax-ops`; record its immutable URL and deployment ID.
3. Exercise every TaxBrains route through the preview URL, including browser refresh on nested routes.
4. Deploy the new backend under a non-production URL and validate auth, tenancy, workflow idempotency, and error handling with synthetic data.
5. Add and validate `api.taxbrains.ai` before changing the apex web domain. Keep API and web DNS records independent.
6. Confirm OAuth providers and Supabase redirect allowlists contain the final TaxBrains URLs.
7. Reduce DNS TTL in advance if the current provider permits it; record the prior records and values.
8. Attach `taxbrains.ai` to the TaxBrains Vercel project only after Vercel reports the domain configuration it expects.
9. Change only the `taxbrains.ai` web DNS records. Do not edit `taxbenchmark.ai` records.
10. Run production smoke tests for the web routes, auth transition, API health, tenant isolation, and one synthetic compliance workflow.
11. Monitor both the new deployment and the legacy Cloud Run service through the agreed observation window.

## Rollback

Rollback is required if the web routes, authentication, API, tenant isolation, or compliance workflow smoke test fails.

1. Restore the previously recorded `taxbrains.ai` DNS records that point to the retained Cloud Run domain mapping.
2. Verify `https://taxbrains.ai/health`, `/login`, and `/register` on the legacy application.
3. Leave the failed Vercel deployment and new API available only through their provider/preview URLs for diagnosis.
4. Record the failure, timestamps, and affected checks before attempting another cutover.

The Cloud Run provider URL is a diagnostic and rollback aid, not the final customer API hostname.
