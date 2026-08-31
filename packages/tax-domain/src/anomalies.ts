import { absoluteMoney, assertSameMoneyUnit, type Money } from './money';

export interface AnomalyTransaction {
  readonly id: string;
  readonly organizationId: string;
  readonly sourceSystem: string;
  readonly externalId?: string;
  readonly buyerCountry?: string;
  readonly buyerJurisdiction?: string;
  readonly isExempt: boolean;
  readonly netAmount: Money;
  readonly taxAmount: Money;
}

export type TaxAnomalyType =
  | 'missing_tax'
  | 'duplicate_transaction'
  | 'large_amount'
  | 'missing_jurisdiction';

export type AnomalySeverity = 'medium' | 'high' | 'critical';

export interface TaxAnomaly {
  readonly type: TaxAnomalyType;
  readonly severity: AnomalySeverity;
  readonly transactionId: string;
  readonly relatedTransactionId?: string;
  readonly message: string;
}

export interface AnomalyOptions {
  readonly largeAmountThreshold: Money;
}

export function detectTransactionAnomalies(
  organizationId: string,
  transactions: readonly AnomalyTransaction[],
  options: AnomalyOptions,
): readonly TaxAnomaly[] {
  if (!organizationId) throw new Error('organizationId is required');
  if (options.largeAmountThreshold.minorUnits < 0n) {
    throw new Error('Large-amount review threshold must not be negative');
  }

  const anomalies: TaxAnomaly[] = [];
  const seenSourceIds = new Map<string, string>();

  for (const transaction of transactions) {
    if (transaction.organizationId !== organizationId) {
      throw new Error(
        `Cross-organization anomaly detection is forbidden: expected ${organizationId}, received ${transaction.organizationId}`,
      );
    }
    assertSameMoneyUnit(transaction.netAmount, transaction.taxAmount);
    assertSameMoneyUnit(transaction.netAmount, options.largeAmountThreshold);

    if (!transaction.isExempt && transaction.netAmount.minorUnits > 0n && transaction.taxAmount.minorUnits === 0n) {
      anomalies.push({
        type: 'missing_tax',
        severity: 'high',
        transactionId: transaction.id,
        message: 'Positive-value transaction has no recorded tax and is not marked exempt.',
      });
    }

    if (absoluteMoney(transaction.netAmount).minorUnits > options.largeAmountThreshold.minorUnits) {
      anomalies.push({
        type: 'large_amount',
        severity: 'medium',
        transactionId: transaction.id,
        message: 'Transaction exceeds the configured large-amount review threshold.',
      });
    }

    if (!transaction.buyerCountry && !transaction.buyerJurisdiction) {
      anomalies.push({
        type: 'missing_jurisdiction',
        severity: 'high',
        transactionId: transaction.id,
        message: 'Transaction has no buyer country or buyer jurisdiction.',
      });
    }

    if (transaction.externalId) {
      const sourceKey = `${transaction.sourceSystem}:${transaction.externalId}`;
      const originalId = seenSourceIds.get(sourceKey);
      if (originalId) {
        anomalies.push({
          type: 'duplicate_transaction',
          severity: 'critical',
          transactionId: transaction.id,
          relatedTransactionId: originalId,
          message: 'Source system and external transaction ID duplicate an earlier record.',
        });
      } else {
        seenSourceIds.set(sourceKey, transaction.id);
      }
    }
  }

  return anomalies;
}
