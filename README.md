# TaxBrains platform workspace

One codebase for two separately deployed product surfaces:

- **taxbenchmark.ai** — community, benchmark reports, and the public acquisition layer. It remains at the repository root during the first consolidation phase.
- **taxbrains.ai** — the commercial indirect-tax compliance workspace in `apps/tax-ops`.

See [Platform workspace](docs/PLATFORM_WORKSPACE.md) for commands and security boundaries, and [ADR 0001](docs/decisions/0001-unified-platform-workspace.md) for the consolidation decision.

## Local development

Prerequisite: Node.js 22.

```sh
npm install
npm run dev
```

Set benchmark environment variables in `.env.local`. The Anthropic key is server-side only.

Run TaxBrains separately:

```sh
npm --workspace=@taxbrains/tax-ops run dev
```

## Verification

```sh
npm run verify
npm audit --audit-level=high
```

`verify` type-checks both applications, builds both production bundles, and runs the deterministic workspace test suite.
