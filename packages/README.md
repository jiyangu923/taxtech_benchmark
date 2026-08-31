# Shared package boundaries

Create a package only after two applications need the same stable contract or after a domain module has executable behavior and tests. Empty architecture placeholders are intentionally avoided.

Planned dependency direction:

```text
apps/benchmark ───────────────> auth, agent-runtime, evidence, ui
apps/tax-ops ──> tax-workflows ──> tax-import ──> tax-domain
                         │         tax-rules ───> tax-domain
                         └──────────────────────> tax-domain
```

Current executable packages:

- `tax-domain` — exact money, reconciliation, anomaly rules, and sourced draft workpapers.
- `tax-import` — deterministic CSV parsing and transaction normalization into `tax-domain` types.
- `tax-rules` — effective-dated, source-linked rational rates with explicit rounding.
- `tax-workflows` — deterministic compliance-close workflow composition and stop gates.

Rules:

1. Applications may depend on packages; packages never import application code.
2. `tax-domain` contains types and deterministic invariants only—no database, HTTP, model, or UI dependencies.
3. `tax-rules` returns typed determinations with rule/version/source identifiers; it never calls an LLM.
4. `tax-import` performs deterministic parsing and validation; model-suggested mappings are always untrusted inputs to that validator.
5. `tax-workflows` composes domain tools and stop gates but contains no UI, HTTP, or model calls.
6. `agent-runtime` may select approved tools, but it cannot write approvals or perform irreversible filing/payment actions.
7. `evidence` owns provenance, decision logs, approval records, and artifact hashes.
8. Shared `ui` components cannot make authorization or data-access decisions.
9. Cross-app data reuse occurs through explicit, reviewed aggregate contracts—not direct access to customer tax records.
