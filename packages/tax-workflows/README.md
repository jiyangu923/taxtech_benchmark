# `@taxbrains/tax-workflows`

Durable workflow contracts composed from deterministic packages. The first workflow is a recorded-tax close preflight:

1. parse and validate transaction and GL CSVs;
2. block the run if either import contains invalid rows;
3. group accepted data by currency;
4. run anomaly detection and transaction-to-GL reconciliation;
5. return review-ready results with no LLM in the calculation path.

Expected-tax determination and filing workpaper generation remain a separate next gate because taxability and jurisdiction rules must be selected and sourced first.
