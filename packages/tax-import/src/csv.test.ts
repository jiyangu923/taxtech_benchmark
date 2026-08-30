import { describe, expect, it } from 'vitest';

import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('parses CRLF, a UTF-8 BOM, quoted commas, and escaped quotes', () => {
    const parsed = parseCsv('\uFEFFid,name\r\n1,"Acme, Inc."\r\n2,"O""Brien"\r\n');

    expect(parsed.headers).toEqual(['id', 'name']);
    expect(parsed.records).toEqual([
      { id: '1', name: 'Acme, Inc.' },
      { id: '2', name: 'O"Brien' },
    ]);
  });

  it('preserves newlines inside quoted values', () => {
    const parsed = parseCsv('id,notes\n1,"line one\nline two"');
    expect(parsed.records[0].notes).toBe('line one\nline two');
  });

  it('rejects duplicate or empty headers', () => {
    expect(() => parseCsv('id,id\n1,2')).toThrow(/unique/);
    expect(() => parseCsv('id,\n1,2')).toThrow(/header 2 is empty/);
  });

  it('rejects malformed quoted data and inconsistent row widths', () => {
    expect(() => parseCsv('id,name\n1,"unfinished')).toThrow(/inside a quoted field/);
    expect(() => parseCsv('id,name\n1')).toThrow(/expected 2/);
  });

  it('does not silently drop an explicitly quoted empty row', () => {
    const parsed = parseCsv('id\n""');
    expect(parsed.records).toEqual([{ id: '' }]);
  });

  it('preserves a trailing empty field', () => {
    const parsed = parseCsv('id,name\n1,');
    expect(parsed.records).toEqual([{ id: '1', name: '' }]);
  });
});
