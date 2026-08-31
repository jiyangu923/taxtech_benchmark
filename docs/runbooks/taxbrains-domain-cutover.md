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
- DNS authority: Cloudflare nameservers `darl.ns.cloudflare.com` and `michelle.ns.cloudflare.com`
- Current apex A records: `216.239.32.21`, `216.239.34.21`, `216.239.36.21`, and `216.239.38.21`
- Current apex AAAA records: Google `2001:4860:4802:*::15` domain-mapping targets
- `www.taxbrains.ai` did not return a public A or CNAME record during the audit
- Public legacy routes include `/login`, `/register`, `/docs`, `/openapi.json`, and `/api/v1/*`
- The deployed environment exposes application, Google OAuth, and Gemini configuration names but no database connection variable.

## Verified unified frontend preview — 2026-08-30

- Vercel project: `taxbrains` (`prj_rGSuA6PozoOHjTd7US43RbINw9kR`)
- Current Git link: none; current project root setting: repository root (`null`)
- Deployment ID: `dpl_2BmeaoNmPPrZKUKBgB3rbr2WoPvF`
- Immutable preview: `https://taxbrains-korpsww07-jiyangu923-3533s-projects.vercel.app`
- Deployment target: preview, not production
- Access: Vercel deployment protection is enabled
- The Vercel project already lists `taxbrains.ai` and `www.taxbrains.ai`, but Vercel correctly reports the domain as misconfigured because authoritative DNS still points the apex to Google Cloud Run.
- Authenticated smoke checks: `/`, `/automation`, `/automation/compliance`, `/benchmark`, `/not-a-real-page`, and `/og.png` all returned 200
- Local browser QA: desktop/mobile layouts, client navigation, Back/Forward, focus treatment, console, metadata, and overflow checks passed after the CTA contrast fix in commit `45c3c35`

The preview proves the static web route boundary. It does not satisfy the authentication, new API, Supabase isolation, or production-domain cutover gates below.

Do not connect the Vercel project to GitHub before PR #152 is merged: the current default branch does not yet contain `apps/tax-ops`. After merge, set the Vercel project root to `apps/tax-ops` and then connect `jiyangu923/taxtech_benchmark`; doing these in the opposite order can create a failed default-branch deployment.

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
