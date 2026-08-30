import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { moneyFromDecimal, type Money } from '@taxbrains/tax-domain';
import {
  runComplianceClosePreflight,
  type ComplianceClosePreflightResult,
} from '@taxbrains/tax-workflows';

export function parseThresholds(value: string): Record<string, Money> {
  if (!value.trim()) throw new Error('At least one currency threshold is required');
  return Object.fromEntries(
    value.split(',').map((item) => {
      const [currency, amount, ...extra] = item.split('=');
      if (!currency || !amount || extra.length > 0) {
        throw new Error(`Invalid threshold ${item}; expected CURRENCY=AMOUNT`);
      }
      const code = currency.trim().toUpperCase();
      return [code, moneyFromDecimal(code, amount.trim())];
    }),
  );
}

export function stringifyExact(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item), 2);
}

/** Safe console projection: counts and review results, never raw imported rows. */
export function toCliReport(result: ComplianceClosePreflightResult): unknown {
  const imports = {
    acceptedTransactions: result.transactionImport.accepted.length,
    transactionErrors: result.transactionImport.errors,
    acceptedGlEntries: result.generalLedgerImport.accepted.length,
    generalLedgerErrors: result.generalLedgerImport.errors,
  };
  if (result.status === 'needs_input_fix') {
    return { status: result.status, imports, blockers: result.blockers };
  }
  return {
    status: result.status,
    imports,
    currencyReviews: result.currencyReviews.map((review) => ({
      currency: review.currency,
      anomalies: review.anomalies.map(({ type, severity, transactionId, relatedTransactionId }) => ({
        type,
        severity,
        transactionId,
        relatedTransactionId,
      })),
      reconciliation: review.reconciliation.summary,
    })),
    nextGate: result.nextGate,
  };
}

async function main(args: readonly string[]): Promise<number> {
  const [transactionPath, glPath, organizationId, sourceSystem, thresholdText] = args;
  if (!transactionPath || !glPath || !organizationId || !sourceSystem || !thresholdText) {
    console.error(
      'Usage: npm run compliance:preflight -- <transactions.csv> <gl.csv> <organization-id> <source-system> <USD=100000.00,EUR=100000.00>',
    );
    return 1;
  }

  const [transactionCsv, generalLedgerCsv] = await Promise.all([
    readFile(transactionPath, 'utf8'),
    readFile(glPath, 'utf8'),
  ]);
  const result = runComplianceClosePreflight({
    organizationId,
    transactionCsv,
    generalLedgerCsv,
    transactionImport: { sourceSystem },
    largeAmountThresholds: parseThresholds(thresholdText),
  });

  console.log(stringifyExact(toCliReport(result)));
  return result.status === 'review_ready' ? 0 : 2;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
