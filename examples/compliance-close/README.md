# Synthetic compliance-close example

These records are fictional and contain no customer data. Run the deterministic preflight from the repository root:

```sh
npm run compliance:preflight -- \
  examples/compliance-close/transactions.csv \
  examples/compliance-close/general-ledger.csv \
  example-organization \
  synthetic-billing \
  USD=100000.00
```

The expected review has:

- one `missing_tax` anomaly for `txn-1002`;
- one $2.50 transaction-to-GL variance for `INV-1001`;
- a `review_ready` status that stops before expected-tax determination.

The CLI prints counts, anomalies, and reconciliation summaries only. It does not print raw imported rows.
