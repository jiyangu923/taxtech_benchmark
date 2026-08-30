# `@taxbrains/tax-domain`

Pure, deterministic contracts and invariants for tax operations. This package has no database, HTTP, UI, or model dependency.

The first ported capabilities are transaction-to-GL tax reconciliation, explainable anomaly rules, and provenance-required filing workpaper aggregation. They improve the original `taxinfra` prototype by:

- using integer minor units rather than JavaScript floating point;
- enforcing organization and currency boundaries;
- aggregating split GL postings with the same reference;
- returning typed source identifiers and exact absolute variance totals;
- rejecting cross-tenant and mixed-money-unit anomaly runs;
- linking duplicate source records to the first observed transaction;
- requiring every workpaper amount to originate in deterministic, sourced tax determinations;
- returning draft workpapers that always require named approval.

Database adapters must convert Postgres `numeric` values to `Money` at their boundary. Never coerce tax amounts through JavaScript `number`.
