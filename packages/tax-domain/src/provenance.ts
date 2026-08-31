export interface TaxRuleReference {
  readonly ruleId: string;
  readonly version: string;
  readonly sourceUrl: string;
  readonly effectiveFrom: string;
  readonly lastVerified: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(value: string, field: string): void {
  if (!ISO_DATE.test(value)) {
    throw new Error(`${field} must be a valid YYYY-MM-DD date`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${field} must be a valid YYYY-MM-DD date`);
  }
}

function assertRequiredText(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`);
  }
}

export function assertValidTaxRuleReference(
  value: unknown,
  context = 'Rule reference',
): asserts value is TaxRuleReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }

  const reference = value as Partial<TaxRuleReference>;
  assertRequiredText(reference.ruleId, `${context} ruleId`);
  assertRequiredText(reference.version, `${context} version`);
  assertRequiredText(reference.sourceUrl, `${context} sourceUrl`);
  assertRequiredText(reference.effectiveFrom, `${context} effectiveFrom`);
  assertRequiredText(reference.lastVerified, `${context} lastVerified`);

  assertIsoDate(reference.effectiveFrom, `${context} effectiveFrom`);
  assertIsoDate(reference.lastVerified, `${context} lastVerified`);

  let source: URL;
  try {
    source = new URL(reference.sourceUrl);
  } catch {
    throw new Error(`${context} sourceUrl must be a valid HTTPS URL`);
  }
  if (source.protocol !== 'https:') {
    throw new Error(`${context} sourceUrl must use HTTPS`);
  }
}
