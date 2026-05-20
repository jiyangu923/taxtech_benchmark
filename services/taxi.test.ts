import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RESPONSE_SCHEMA, buildSystem, buildUserMessage, FALLBACK } from './taxi';

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
