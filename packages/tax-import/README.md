# `@taxbrains/tax-import`

Deterministic CSV parsing and transaction normalization for the first compliance-close workflow.

The package accepts explicit transaction and general-ledger column mappings, returns accepted rows and structured row errors, and converts financial fields directly from strings into exact `Money`. It does not use a model to infer columns or repair amounts. An AI-assisted mapping proposal can be added later, but deterministic validation remains authoritative.
