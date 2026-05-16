import { describe, it, expect } from 'vitest';
import {
  initialsFromName, nextStatusOnAction, normalizeUrl, isValidEmail,
  STATUS_LABELS, STATUS_BADGE_CLASSES,
} from './Admin.community.helpers';

describe('initialsFromName', () => {
  it('returns first+last initial for a two-token name', () => {
    expect(initialsFromName('J Gu')).toBe('JG');
    expect(initialsFromName('Jiyan Gu')).toBe('JG');
    expect(initialsFromName('Ada Lovelace')).toBe('AL');
  });

  it('uses first+last initial when there are 3+ tokens', () => {
    expect(initialsFromName('Mary Ann Evans')).toBe('ME');
  });

  it('returns first two letters for a single-token name', () => {
    expect(initialsFromName('Madonna')).toBe('MA');
    expect(initialsFromName('X')).toBe('X');
  });

  it('returns "?" for empty or whitespace-only input', () => {
    expect(initialsFromName('')).toBe('?');
    expect(initialsFromName('   ')).toBe('?');
  });

  it('always returns uppercase', () => {
    expect(initialsFromName('jane doe')).toBe('JD');
  });

  it('strips non-letter characters before extracting initials', () => {
    expect(initialsFromName('J. Gu')).toBe('JG');
    expect(initialsFromName('A1 B2')).toBe('AB');
  });

  it('collapses extra whitespace between tokens', () => {
    expect(initialsFromName('Ada   Lovelace')).toBe('AL');
    expect(initialsFromName('  J   Gu  ')).toBe('JG');
  });
});

describe('nextStatusOnAction', () => {
  it('maps confirm action to confirmed regardless of current', () => {
    expect(nextStatusOnAction('pending', 'confirm')).toBe('confirmed');
    expect(nextStatusOnAction('declined', 'confirm')).toBe('confirmed');
    expect(nextStatusOnAction('confirmed', 'confirm')).toBe('confirmed');
  });

  it('maps decline action to declined regardless of current', () => {
    expect(nextStatusOnAction('pending', 'decline')).toBe('declined');
    expect(nextStatusOnAction('confirmed', 'decline')).toBe('declined');
    expect(nextStatusOnAction('declined', 'decline')).toBe('declined');
  });

  it('maps reset action to pending regardless of current', () => {
    expect(nextStatusOnAction('confirmed', 'reset')).toBe('pending');
    expect(nextStatusOnAction('declined', 'reset')).toBe('pending');
    expect(nextStatusOnAction('pending', 'reset')).toBe('pending');
  });
});

describe('normalizeUrl', () => {
  it('returns null for empty, whitespace, null, or undefined input', () => {
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('   ')).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl(undefined)).toBeNull();
  });

  it('preserves an https-prefixed URL', () => {
    expect(normalizeUrl('https://linkedin.com/in/foo')).toBe('https://linkedin.com/in/foo');
  });

  it('preserves an http-prefixed URL', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('prepends https:// for a bare domain', () => {
    expect(normalizeUrl('linkedin.com/in/foo')).toBe('https://linkedin.com/in/foo');
  });

  it('trims surrounding whitespace before normalizing', () => {
    expect(normalizeUrl('  linkedin.com/in/foo  ')).toBe('https://linkedin.com/in/foo');
    expect(normalizeUrl('  https://x.com  ')).toBe('https://x.com');
  });

  it('treats the scheme prefix case-insensitively', () => {
    expect(normalizeUrl('HTTPS://example.com')).toBe('HTTPS://example.com');
  });
});

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('first.last+tag@sub.example.com')).toBe(true);
  });

  it('rejects empty / whitespace / missing parts', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('   ')).toBe(false);
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('no@dot')).toBe(false);
    expect(isValidEmail('@no-local.com')).toBe(false);
    expect(isValidEmail('no-domain@')).toBe(false);
  });

  it('rejects addresses containing whitespace', () => {
    expect(isValidEmail('foo bar@example.com')).toBe(false);
    expect(isValidEmail('foo@exa mple.com')).toBe(false);
  });
});

describe('label and badge maps', () => {
  it('have entries for every status', () => {
    for (const status of ['pending', 'confirmed', 'declined'] as const) {
      expect(STATUS_LABELS[status]).toBeTruthy();
      expect(STATUS_BADGE_CLASSES[status]).toBeTruthy();
    }
  });
});
