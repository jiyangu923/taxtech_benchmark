import { describe, it, expect } from 'vitest';
import {
  htmlToText, capText, sanitizeArticles,
  CHANGE_TYPES, EXTRACTION_SCHEMA, MAX_ARTICLES, MAX_INPUT_CHARS,
} from '../../../api/admin/kb-ingest';

describe('htmlToText', () => {
  it('strips scripts, styles, and tags but keeps the readable text', () => {
    const html = `<html><head><style>.x{color:red}</style><script>alert(1)</script></head>
      <body><h1>France delays mandate</h1><p>The e-invoicing start moves to <b>2027</b>.</p></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain('France delays mandate');
    expect(text).toContain('The e-invoicing start moves to 2027');
    expect(text).not.toContain('alert(1)');
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('<p>');
  });

  it('decodes common entities and collapses whitespace', () => {
    expect(htmlToText('A&nbsp;&amp;&nbsp;B    C')).toBe('A & B C');
  });

  it('turns block-level closes into line breaks so items stay separated', () => {
    const text = htmlToText('<li>Item one</li><li>Item two</li>');
    expect(text).toMatch(/Item one\s*\n\s*Item two/);
  });
});

describe('capText', () => {
  it('caps at MAX_INPUT_CHARS and leaves short text alone', () => {
    expect(capText('short')).toBe('short');
    expect(capText('x'.repeat(MAX_INPUT_CHARS + 500)).length).toBe(MAX_INPUT_CHARS);
  });
});

describe('sanitizeArticles', () => {
  const good = { title: ' T ', summary: ' S ', tags: ['France', 'rate_change'], effective_date: '2027-09-01' };

  it('trims fields and passes valid items through', () => {
    const out = sanitizeArticles({ articles: [good] });
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ title: 'T', summary: 'S', tags: ['France', 'rate_change'], effective_date: '2027-09-01' });
  });

  it('drops malformed items (missing title/summary, wrong types)', () => {
    const out = sanitizeArticles({ articles: [
      { title: '', summary: 'x', tags: [], effective_date: null },
      { title: 'x', summary: 42, tags: [], effective_date: null },
      null,
      good,
    ]});
    expect(out).toHaveLength(1);
  });

  it('nulls out non-ISO effective dates and filters junk tags', () => {
    const out = sanitizeArticles({ articles: [{
      title: 't', summary: 's',
      tags: ['ok', 7, '  ', 'also-ok'],
      effective_date: 'sometime next year',
    }]});
    expect(out[0].effective_date).toBeNull();
    expect(out[0].tags).toEqual(['ok', 'also-ok']);
  });

  it('caps output at MAX_ARTICLES and survives garbage input', () => {
    const many = Array.from({ length: MAX_ARTICLES + 5 }, (_, i) => ({ title: `t${i}`, summary: 's', tags: [], effective_date: null }));
    expect(sanitizeArticles({ articles: many })).toHaveLength(MAX_ARTICLES);
    expect(sanitizeArticles(undefined)).toEqual([]);
    expect(sanitizeArticles({ articles: 'nope' })).toEqual([]);
  });
});

describe('extraction contract', () => {
  it('EXTRACTION_SCHEMA has additionalProperties:false on every object (structured outputs requirement)', () => {
    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'object') expect(node.additionalProperties).toBe(false);
      if (node.properties) Object.values(node.properties).forEach(visit);
      if (node.items) visit(node.items);
    };
    visit(EXTRACTION_SCHEMA);
  });

  it('uses the taxinfra RegulatoryChange taxonomy for change-type tags', () => {
    for (const t of ['rate_change', 'e_invoicing_mandate', 'threshold_change', 'filing_change', 'treaty_update', 'legislation']) {
      expect(CHANGE_TYPES).toContain(t);
    }
  });
});
