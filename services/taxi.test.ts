import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RESPONSE_SCHEMA, buildSystem, buildUserMessage, buildMessages, buildKbContext, sanitizeSources, FALLBACK, MAX_HISTORY_TURNS, MAX_KB_ARTICLES } from './taxi';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function freshAskTaxi() {
  vi.resetModules();
  const { askTaxi } = await import('./taxi.ts');
  return askTaxi;
}

const fakeSubmission = { id: '1', revenue: '100m_1b' } as any;
const fakeAll = [fakeSubmission];

function structuredResponse(payload: object) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      text: JSON.stringify(payload),
      json: payload,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    }),
  };
}

describe('askTaxi (non-streaming)', () => {
  it('returns the parsed analysis from a successful /api/claude call', async () => {
    const payload = { analysis: 'Great performance!', chart: null, followUps: [] };
    mockFetch.mockResolvedValueOnce(structuredResponse(payload));

    const askTaxi = await freshAskTaxi();
    const result = await askTaxi('How am I doing?', fakeSubmission, fakeAll);

    expect(result.analysis).toBe('Great performance!');
    expect(result.chart).toBeNull();
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe('/api/claude');
  });

  it('returns the fallback response when fetch rejects (network error)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const askTaxi = await freshAskTaxi();
    const result = await askTaxi('q', fakeSubmission, fakeAll);
    expect(result).toEqual(FALLBACK);
  });

  it('returns the fallback when the server returns non-OK', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    });
    const askTaxi = await freshAskTaxi();
    const result = await askTaxi('q', fakeSubmission, fakeAll);
    expect(result).toEqual(FALLBACK);
  });

  it('posts the structured-output schema as outputFormat in the request body', async () => {
    const payload = { analysis: 'ok', chart: null, followUps: [] };
    mockFetch.mockResolvedValueOnce(structuredResponse(payload));
    const askTaxi = await freshAskTaxi();
    await askTaxi('q', fakeSubmission, fakeAll);
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(sentBody.outputFormat).toBeDefined();
    expect(sentBody.outputFormat.required).toContain('analysis');
    expect(sentBody.outputFormat.required).toContain('followUps');
  });

  it('attaches cache_control to the system block for prompt caching', async () => {
    const payload = { analysis: 'ok', chart: null, followUps: [] };
    mockFetch.mockResolvedValueOnce(structuredResponse(payload));
    const askTaxi = await freshAskTaxi();
    await askTaxi('q', fakeSubmission, fakeAll);
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(Array.isArray(sentBody.system)).toBe(true);
    const lastSystemBlock = sentBody.system[sentBody.system.length - 1];
    expect(lastSystemBlock.cache_control).toEqual({ type: 'ephemeral' });
  });
});

describe('taxi helpers', () => {
  it('buildSystem returns a single text block with cache_control', () => {
    const blocks = buildSystem(fakeAll);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('text');
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(blocks[0].text).toContain('Taxi');
  });

  it('buildSystem embeds the dataset payload so it joins the cached prefix', () => {
    const blocks = buildSystem(fakeAll);
    expect(blocks[0].text).toContain('100m_1b');
  });

  it('buildUserMessage embeds the per-user submission + the question', () => {
    const msg = buildUserMessage('How am I doing?', fakeSubmission);
    expect(msg).toContain('How am I doing?');
    expect(msg).toContain('100m_1b');
  });

  it('buildMessages replays prior turns as alternating user/assistant messages', () => {
    const history = [
      { question: 'How do I compare on FTEs?', analysis: 'You are above the median.' },
      { question: 'And on automation?', analysis: 'Slightly below your peers.' },
    ];
    const msgs = buildMessages('What about budgets?', fakeSubmission, history);
    expect(msgs).toHaveLength(5);
    expect(msgs[0]).toEqual({ role: 'user', content: 'How do I compare on FTEs?' });
    expect(msgs[1]).toEqual({ role: 'assistant', content: 'You are above the median.' });
    expect(msgs[2].role).toBe('user');
    expect(msgs[3].role).toBe('assistant');
    // Only the FINAL message carries the submission JSON + new question.
    expect(msgs[4].role).toBe('user');
    expect(msgs[4].content).toContain('What about budgets?');
    expect(msgs[4].content).toContain('100m_1b');
    expect(msgs[0].content).not.toContain('100m_1b');
  });

  it('buildMessages caps replayed history at MAX_HISTORY_TURNS most-recent turns', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      question: `q${i}`, analysis: `a${i}`,
    }));
    const msgs = buildMessages('final', fakeSubmission, history);
    expect(msgs).toHaveLength(MAX_HISTORY_TURNS * 2 + 1);
    // The oldest surviving turn is the (10 - MAX)th.
    expect(msgs[0].content).toBe(`q${10 - MAX_HISTORY_TURNS}`);
  });

  it('buildMessages skips empty/fallback turns and works with no history', () => {
    const history = [
      { question: 'ok question', analysis: '' },           // failed answer — skipped
      { question: '  ', analysis: 'orphan analysis' },     // blank question — skipped
    ];
    expect(buildMessages('q', fakeSubmission, history)).toHaveLength(1);
    expect(buildMessages('q', fakeSubmission)).toHaveLength(1);
  });

  it('buildKbContext renders published articles into a cited, dated block', () => {
    const articles = [
      { id: '1', title: 'France delays e-invoicing', summary: 'Mandate moved to 2027.', source_url: null, tags: ['e-invoicing', 'France'], status: 'published', published_at: '2026-06-20T00:00:00Z', created_by: null, created_at: '', updated_at: '' },
    ] as any[];
    const block = buildKbContext(articles);
    expect(block).toContain('INDUSTRY CONTEXT');
    expect(block).toContain('(2026-06-20) France delays e-invoicing');
    expect(block).toContain('[e-invoicing, France]');
    expect(block).toContain('Mandate moved to 2027.');
  });

  it('buildKbContext returns an empty string when there are no articles', () => {
    expect(buildKbContext([])).toBe('');
  });

  it('buildKbContext caps at MAX_KB_ARTICLES and truncates very long summaries', () => {
    const articles = Array.from({ length: MAX_KB_ARTICLES + 10 }, (_, i) => ({
      id: String(i), title: `t${i}`, summary: i === 0 ? 'x'.repeat(2000) : 's',
      source_url: null, tags: [], status: 'published',
      published_at: '2026-01-01T00:00:00Z', created_by: null, created_at: '', updated_at: '',
    })) as any[];
    const block = buildKbContext(articles);
    expect((block.match(/^- \(/gm) || []).length).toBe(MAX_KB_ARTICLES);
    expect(block).toContain('…');
    expect(block).not.toContain('x'.repeat(1000));
  });

  it('buildSystem embeds the KB block inside the single cached system block', () => {
    const articles = [{
      id: '1', title: 'ViDA package adopted', summary: 'EU-wide digital reporting.',
      source_url: null, tags: [], status: 'published',
      published_at: '2026-05-01T00:00:00Z', created_by: null, created_at: '', updated_at: '',
    }] as any[];
    const blocks = buildSystem(fakeAll, articles);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toContain('ViDA package adopted');
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
    // No articles → no dangling section header (the word pair still appears
    // in the system GUIDELINES, which is fine — only the block must be absent).
    expect(buildSystem(fakeAll)[0].text).not.toContain('--- INDUSTRY CONTEXT');
  });

  it('RESPONSE_SCHEMA requires the sources array (evidence chips contract)', () => {
    expect((RESPONSE_SCHEMA as any).required).toContain('sources');
    expect((RESPONSE_SCHEMA as any).properties.sources.items.type).toBe('string');
  });

  it('sanitizeSources keeps only titles that exist in the real KB', () => {
    const kb = [{ title: 'France delays e-invoicing' }, { title: 'ViDA timeline' }] as any[];
    expect(sanitizeSources(['France delays e-invoicing', 'Totally invented article'], kb))
      .toEqual(['France delays e-invoicing']);
    expect(sanitizeSources(['ViDA timeline', 42, null], kb)).toEqual(['ViDA timeline']);
  });

  it('sanitizeSources returns [] for non-array input or empty KB', () => {
    expect(sanitizeSources('nope', [{ title: 'x' }] as any[])).toEqual([]);
    expect(sanitizeSources(undefined, [] as any[])).toEqual([]);
    expect(sanitizeSources(['anything'], [] as any[])).toEqual([]);
  });

  it('FALLBACK carries an empty sources array', () => {
    expect(FALLBACK.sources).toEqual([]);
  });

  it('RESPONSE_SCHEMA has additionalProperties:false on every object (required by structured outputs)', () => {
    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'object') {
        expect(node.additionalProperties).toBe(false);
      }
      if (node.properties) Object.values(node.properties).forEach(visit);
      if (node.items) visit(node.items);
    };
    visit(RESPONSE_SCHEMA);
  });
});
