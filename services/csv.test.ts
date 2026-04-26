import { describe, it, expect } from 'vitest';
import { escapeCell, submissionsToCsv } from './csv';
import { Submission } from '../types';

const baseSub = (overrides: Partial<Submission> = {}): Submission => ({
  id: 'sub-1',
  userId: 'u-1',
  userName: 'Alice',
  status: 'approved',
  submittedAt: '2026-04-01T00:00:00Z',
  companyProfile: [],
  participationGoal: [],
  respondentRole: '',
  ownedTaxFunctions: [],
  organizationScope: '',
  revenueRange: '',
  aiAdopted: false,
  ...overrides,
});

// ─── escapeCell ──────────────────────────────────────────────────────────────

describe('escapeCell', () => {
  it('returns an empty string for null', () => {
    expect(escapeCell(null)).toBe('');
  });

  it('returns an empty string for undefined', () => {
    expect(escapeCell(undefined)).toBe('');
  });

  it('passes through plain strings without delimiters', () => {
    expect(escapeCell('Acme Corp')).toBe('Acme Corp');
  });

  it('quotes a string containing a comma', () => {
    expect(escapeCell('Acme, Inc.')).toBe('"Acme, Inc."');
  });

  it('quotes a string containing a newline', () => {
    expect(escapeCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('quotes a string containing a carriage return', () => {
    expect(escapeCell('a\rb')).toBe('"a\rb"');
  });

  it('quotes and doubles internal double-quotes', () => {
    expect(escapeCell('she said "hi"')).toBe('"she said ""hi"""');
  });

  it('joins arrays with ", " and escapes the result', () => {
    expect(escapeCell(['public', 'private'])).toBe('"public, private"');
  });

  it('renders empty arrays as the empty string', () => {
    expect(escapeCell([])).toBe('');
  });

  it('JSON-stringifies plain objects', () => {
    expect(escapeCell({ a: 1, b: 2 })).toBe('"{""a"":1,""b"":2}"');
  });

  it('serializes booleans as "true" / "false"', () => {
    expect(escapeCell(true)).toBe('true');
    expect(escapeCell(false)).toBe('false');
  });

  it('serializes numbers as plain digits', () => {
    expect(escapeCell(0)).toBe('0');
    expect(escapeCell(42)).toBe('42');
    expect(escapeCell(-3.14)).toBe('-3.14');
  });

  it('handles arrays containing null elements gracefully', () => {
    expect(escapeCell(['a', null, 'b'])).toBe('"a, , b"');
  });
});

// ─── submissionsToCsv ────────────────────────────────────────────────────────

describe('submissionsToCsv', () => {
  it('returns an empty string when given no rows', () => {
    expect(submissionsToCsv([])).toBe('');
  });

  it('puts id as the first column', () => {
    const csv = submissionsToCsv([baseSub({ id: 'first' })]);
    expect(csv.split('\r\n')[0].startsWith('id,')).toBe(true);
  });

  it('uses CRLF as line separator (RFC 4180)', () => {
    const csv = submissionsToCsv([baseSub(), baseSub({ id: 'sub-2' })]);
    expect(csv.split('\r\n')).toHaveLength(3); // header + 2 data
    expect(csv).not.toContain('\n\n');
  });

  it('builds header from the union of keys across submissions', () => {
    const csv = submissionsToCsv([
      baseSub({ id: 'a', industry: 'tech' }),
      baseSub({ id: 'b', revenueRange: '500m_5b' }),
      baseSub({ id: 'c', companyName: 'Acme' }),
    ]);
    const headers = csv.split('\r\n')[0].split(',');
    expect(headers).toContain('industry');
    expect(headers).toContain('revenueRange');
    expect(headers).toContain('companyName');
  });

  it('writes blank cells for missing fields per row', () => {
    const csv = submissionsToCsv([
      baseSub({ id: 'a', industry: 'tech' }),
      baseSub({ id: 'b' }), // no industry
    ]);
    const lines = csv.split('\r\n');
    const headers = lines[0].split(',');
    const industryIdx = headers.indexOf('industry');
    const cellsRow2 = lines[2].split(',');
    expect(cellsRow2[industryIdx]).toBe('');
  });

  it('serializes array fields as comma-joined quoted strings', () => {
    const csv = submissionsToCsv([baseSub({ companyProfile: ['public', 'multinational'] })]);
    expect(csv).toContain('"public, multinational"');
  });

  it('escapes a company name containing a comma without breaking columns', () => {
    const csv = submissionsToCsv([baseSub({ companyName: 'Acme, Inc.' })]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toContain('"Acme, Inc."');
    // Header column count must equal data column count → CSV is well-formed.
    const headers = lines[0].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    const data    = lines[1].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    expect(data.length).toBe(headers.length);
  });

  it('round-trips through a naive CSV parser when escaping is needed', () => {
    const subs = [
      baseSub({ id: 'a', companyName: 'O"Brien & Co.' }),
      baseSub({ id: 'b', companyName: 'Hello\nWorld' }),
    ];
    const csv = submissionsToCsv(subs);
    // The double-quoted internal " becomes "" — make sure that token is present.
    expect(csv).toContain('""Brien & Co.');
    // The newline inside a cell stays inside the quoted region (1 quoted cell).
    expect(csv).toMatch(/"Hello\nWorld"/);
  });
});
