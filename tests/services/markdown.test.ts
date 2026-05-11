import { describe, it, expect } from 'vitest';
import { markdownToHtml } from '../../services/markdown';

describe('markdownToHtml — empty / whitespace', () => {
  it('returns empty string for empty input', () => {
    expect(markdownToHtml('')).toBe('');
    expect(markdownToHtml('   \n  \n')).toBe('');
  });
});

describe('markdownToHtml — headings', () => {
  it('renders H1, H2, H3', () => {
    const out = markdownToHtml('# H1\n\n## H2\n\n### H3');
    expect(out).toContain('<h1');
    expect(out).toContain('>H1</h1>');
    expect(out).toContain('<h2');
    expect(out).toContain('>H2</h2>');
    expect(out).toContain('<h3');
    expect(out).toContain('>H3</h3>');
  });

  it('does NOT render h4 (####) as a heading — falls through to paragraph', () => {
    const out = markdownToHtml('#### nope');
    expect(out).not.toContain('<h4');
    expect(out).toContain('<p');
  });
});

describe('markdownToHtml — inline formatting', () => {
  it('renders **bold**', () => {
    expect(markdownToHtml('hello **world**')).toContain('<strong>world</strong>');
  });

  it('renders *italic* (single-star)', () => {
    expect(markdownToHtml('hello *world*')).toContain('<em>world</em>');
  });

  it('does NOT confuse ** with single-star italic', () => {
    const out = markdownToHtml('a **b** c');
    expect(out).toContain('<strong>b</strong>');
    expect(out).not.toContain('<em>');
  });

  it('renders inline `code`', () => {
    expect(markdownToHtml('use `npm test`')).toContain('<code');
    expect(markdownToHtml('use `npm test`')).toContain('>npm test</code>');
  });
});

describe('markdownToHtml — links and images', () => {
  it('renders [text](url) as anchor', () => {
    const out = markdownToHtml('see [docs](https://example.com)');
    expect(out).toContain('<a href="https://example.com"');
    expect(out).toContain('>docs</a>');
  });

  it('renders ![alt](url) as image', () => {
    const out = markdownToHtml('![screenshot](https://cdn.example.com/x.png)');
    expect(out).toContain('<img src="https://cdn.example.com/x.png"');
    expect(out).toContain('alt="screenshot"');
  });

  it('parses image before link (avoids ! being escaped into the anchor text)', () => {
    const out = markdownToHtml('![cap](https://x.test/a.png)');
    expect(out).toContain('<img');
    expect(out).not.toContain('<a href');
  });
});

describe('markdownToHtml — lists', () => {
  it('groups contiguous - lines into a single <ul>', () => {
    const out = markdownToHtml('- one\n- two\n- three');
    expect(out.match(/<ul/g)).toHaveLength(1);
    expect(out.match(/<li/g)).toHaveLength(3);
  });

  it('groups contiguous numbered lines into a single <ol>', () => {
    const out = markdownToHtml('1. one\n2. two\n3. three');
    expect(out.match(/<ol/g)).toHaveLength(1);
    expect(out.match(/<li/g)).toHaveLength(3);
  });
});

describe('markdownToHtml — blockquote and rule', () => {
  it('renders > as a single blockquote per contiguous block', () => {
    const out = markdownToHtml('> first line\n> second line');
    expect(out.match(/<blockquote/g)).toHaveLength(1);
    expect(out).toContain('first line second line');
  });

  it('renders --- as a horizontal rule', () => {
    expect(markdownToHtml('---')).toContain('<hr');
    expect(markdownToHtml('-----')).toContain('<hr');
  });
});

describe('markdownToHtml — paragraphs', () => {
  it('joins contiguous lines into one paragraph', () => {
    const out = markdownToHtml('alpha\nbeta\ngamma');
    expect(out.match(/<p/g)).toHaveLength(1);
    expect(out).toContain('alpha beta gamma');
  });

  it('blank line splits into multiple paragraphs', () => {
    const out = markdownToHtml('first\n\nsecond');
    expect(out.match(/<p/g)).toHaveLength(2);
  });
});

describe('markdownToHtml — HTML escaping', () => {
  it('escapes <script> in plain text so it does not execute', () => {
    const out = markdownToHtml('hello <script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('escapes & properly', () => {
    const out = markdownToHtml('Tom & Jerry');
    expect(out).toContain('Tom &amp; Jerry');
  });

  it('escapes quotes inside text content', () => {
    const out = markdownToHtml(`he said "hi"`);
    expect(out).toContain('&quot;hi&quot;');
  });
});
