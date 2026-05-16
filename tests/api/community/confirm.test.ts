import { describe, it, expect } from 'vitest';
import { normalizeUrl, clipString, MAX_LEN } from '../../../api/community/confirm';

describe('confirm handler · normalizeUrl', () => {
  it('returns null for empty/whitespace/null/undefined', () => {
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl(undefined)).toBeNull();
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('   ')).toBeNull();
  });

  it('preserves an https- or http-prefixed URL', () => {
    expect(normalizeUrl('https://linkedin.com/in/foo')).toBe('https://linkedin.com/in/foo');
    expect(normalizeUrl('http://x.com')).toBe('http://x.com');
  });

  it('prepends https:// for a bare domain', () => {
    expect(normalizeUrl('linkedin.com/in/foo')).toBe('https://linkedin.com/in/foo');
  });

  it('trims surrounding whitespace before normalizing', () => {
    expect(normalizeUrl('  linkedin.com/in/foo  ')).toBe('https://linkedin.com/in/foo');
  });

  it('clips overly long input to MAX_LEN.url before scheme detection', () => {
    const long = 'a'.repeat(MAX_LEN.url + 50);
    const result = normalizeUrl(long);
    // Long bare strings still get prefixed (no scheme detected).
    expect(result?.startsWith('https://')).toBe(true);
    expect(result?.length).toBeLessThanOrEqual(MAX_LEN.url + 'https://'.length);
  });
});

describe('confirm handler · clipString', () => {
  it('trims and returns the string', () => {
    expect(clipString('  hello  ', 100)).toBe('hello');
  });

  it('returns null for empty/whitespace/null/undefined', () => {
    expect(clipString(null, 100)).toBeNull();
    expect(clipString(undefined, 100)).toBeNull();
    expect(clipString('', 100)).toBeNull();
    expect(clipString('   ', 100)).toBeNull();
  });

  it('truncates strings longer than max', () => {
    expect(clipString('abcdefghij', 5)).toBe('abcde');
  });

  it('does not truncate strings under the limit', () => {
    expect(clipString('abc', 100)).toBe('abc');
  });
});

describe('confirm handler · MAX_LEN constants', () => {
  it('defines limits for all sanitized fields', () => {
    expect(MAX_LEN.name).toBeGreaterThan(0);
    expect(MAX_LEN.role).toBeGreaterThan(0);
    expect(MAX_LEN.company).toBeGreaterThan(0);
    expect(MAX_LEN.url).toBeGreaterThan(0);
  });
});
