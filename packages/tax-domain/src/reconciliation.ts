import {
  absoluteMoney,
  addMoney,
  assertSameMoneyUnit,
  moneyFromMinorUnits,
  subtractMoney,
  zeroMoney,
  type Money,
} from './money';

export interface TaxTransaction {
  readonly id: string;
  readonly organizationId: string;
  readonly sourceSystem: string;
  readonly externalId?: string;
  readonly invoiceNumber?: string;
  readonly taxAmount: Money;
}

export interface GeneralLedgerEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly reference: string;
  readonly taxAmount: Money;
}

export type ReconciliationStatus =
  | 'matched'
  | 'variance'
  | 'missing_in_gl'
  | 'missing_in_tax';

export interface ReconciliationItem {
  readonly status: ReconciliationStatus;
  readonly reference: string;
  readonly transactionId?: string;
  readonly transactionIds: readonly string[];
  readonly glEntryIds: readonly string[];
  readonly transactionTax: Money;
  readonly glTax: Money;
  readonly variance: Money;
}

export interface ReconciliationSummary {
  readonly totalItems: number;
  readonly matched: number;
  readonly variances: number;
  readonly missingInGl: number;
  readonly missingInTax: number;
  readonly totalAbsoluteVariance: Money;
  readonly isClean: boolean;
}

export interface ReconciliationResult {
  readonly organizationId: string;
  readonly items: readonly ReconciliationItem[];
  readonly summary: ReconciliationSummary;
}

interface GlReferenceGroup {
  readonly ids: string[];
  total: Money;
}

interface TransactionReferenceGroup {
  readonly ids: string[];
  total: Money;
}

function transactionReference(transaction: TaxTransaction): string {
  return transaction.invoiceNumber || transaction.externalId || transaction.id;
}

function assertOrganizationBoundary(
  organizationId: string,
  records: ReadonlyArray<{ organizationId: string }>,
): void {
  const invalid = records.find((record) => record.organizationId !== organizationId);
  if (invalid) {
    throw new Error(
      `Cross-organization reconciliation is forbidden: expected ${organizationId}, received ${invalid.organizationId}`,
    );
  }
}

function buildGlIndex(entries: readonly GeneralLedgerEntry[]): Map<string, GlReferenceGroup> {
  const groups = new Map<string, GlReferenceGroup>();
  for (const entry of entries) {
    const reference = entry.reference.trim();
    if (!reference) throw new Error(`GL entry ${entry.id} has no reference`);

    const current = groups.get(reference);
    if (!current) {
      groups.set(reference, { ids: [entry.id], total: entry.taxAmount });
      continue;
    }
    current.ids.push(entry.id);
    current.total = addMoney(current.total, entry.taxAmount);
  }
  return groups;
}

function buildTransactionIndex(
  transactions: readonly TaxTransaction[],
): Map<string, TransactionReferenceGroup> {
  const groups = new Map<string, TransactionReferenceGroup>();
  for (const transaction of transactions) {
    const reference = transactionReference(transaction).trim();
    if (!reference) throw new Error(`Transaction ${transaction.id} has no usable reference`);
    const current = groups.get(reference);
    if (!current) {
      groups.set(reference, { ids: [transaction.id], total: transaction.taxAmount });
      continue;
    }
    current.ids.push(transaction.id);
    current.total = addMoney(current.total, transaction.taxAmount);
  }
  return groups;
}

export function reconcileTransactionsToGl(
  organizationId: string,
  transactions: readonly TaxTransaction[],
  glEntries: readonly GeneralLedgerEntry[],
): ReconciliationResult {
  if (!organizationId) throw new Error('organizationId is required');
  assertOrganizationBoundary(organizationId, transactions);
  assertOrganizationBoundary(organizationId, glEntries);

  const firstMoney = transactions[0]?.taxAmount ?? glEntries[0]?.taxAmount;
  if (!firstMoney) {
    throw new Error('At least one transaction or GL entry is required to establish the money unit');
  }

  for (const transaction of transactions) assertSameMoneyUnit(firstMoney, transaction.taxAmount);
  for (const entry of glEntries) assertSameMoneyUnit(firstMoney, entry.taxAmount);

  const remainingGl = buildGlIndex(glEntries);
  const transactionGroups = buildTransactionIndex(transactions);
  const items: ReconciliationItem[] = [];

  for (const [reference, transaction] of transactionGroups) {
    const gl = remainingGl.get(reference);
    if (!gl) {
      const zero = zeroMoney(firstMoney.currency, firstMoney.scale);
      items.push({
        status: 'missing_in_gl',
        reference,
        transactionId: transaction.ids.length === 1 ? transaction.ids[0] : undefined,
        transactionIds: [...transaction.ids],
        glEntryIds: [],
        transactionTax: transaction.total,
        glTax: zero,
        variance: transaction.total,
      });
      continue;
    }

    remainingGl.delete(reference);
    const variance = subtractMoney(transaction.total, gl.total);
    items.push({
      status: variance.minorUnits === 0n ? 'matched' : 'variance',
      reference,
      transactionId: transaction.ids.length === 1 ? transaction.ids[0] : undefined,
      transactionIds: [...transaction.ids],
      glEntryIds: [...gl.ids],
      transactionTax: transaction.total,
      glTax: gl.total,
      variance,
    });
  }

  const zero = zeroMoney(firstMoney.currency, firstMoney.scale);
  for (const [reference, gl] of remainingGl) {
    items.push({
      status: 'missing_in_tax',
      reference,
      transactionIds: [],
      glEntryIds: [...gl.ids],
      transactionTax: zero,
      glTax: gl.total,
      variance: moneyFromMinorUnits(gl.total.currency, -gl.total.minorUnits, gl.total.scale),
    });
  }

  const counts = {
    matched: items.filter((item) => item.status === 'matched').length,
    variances: items.filter((item) => item.status === 'variance').length,
    missingInGl: items.filter((item) => item.status === 'missing_in_gl').length,
    missingInTax: items.filter((item) => item.status === 'missing_in_tax').length,
  };
  const totalAbsoluteVariance = items.reduce(
    (total, item) => addMoney(total, absoluteMoney(item.variance)),
    zero,
  );

  return {
    organizationId,
    items,
    summary: {
      totalItems: items.length,
      ...counts,
      totalAbsoluteVariance,
      isClean: counts.variances === 0 && counts.missingInGl === 0 && counts.missingInTax === 0,
    },
  };
}
