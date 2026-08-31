const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP_WITH_ZONE = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseIsoDateOrTimestamp(value: string, field: string): string {
  const match = DATE_ONLY.exec(value) ?? TIMESTAMP_WITH_ZONE.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be an ISO date or timezone-qualified timestamp`);
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    throw new Error(`${field} must be an ISO date or timezone-qualified timestamp`);
  }
  return value;
}
