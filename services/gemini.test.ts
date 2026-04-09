import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function freshAskBenchmarkAI() {
  vi.resetModules();
  const { askBenchmarkAI } = await import('./gemini.ts');
  return askBenchmarkAI;
}

const fakeSubmission = { id: '1', revenue: '100m_1b' } as any;
const fakeAll = [fakeSubmission];

function geminiResponse(payload: object) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }),
  };
}

describe('askBenchmarkAI', () => {
  it('returns parsed analysis and chart on success', async () => {
    const payload = { analysis: 'Great performance!', chart: null, followUps: [] };
    mockFetch.mockResolvedValueOnce(geminiResponse(payload));

    const askBenchmarkAI = await freshAskBenchmarkAI();
    const result = await askBenchmarkAI('How am I doing?', fakeSubmission, fakeAll);

    expect(result.analysis).toBe('Great performance!');
    expect(result.chart).toBeNull();
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe('/api/gemini');
  });

  it('returns fallback object when fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const askBenchmarkAI = await freshAskBenchmarkAI();
    const result = await askBenchmarkAI('How am I doing?', fakeSubmission, fakeAll);

    expect(result.analysis).toMatch(/error/i);
    expect(result.chart).toBeNull();
    expect(result.followUps).toEqual([]);
  });

  it('returns fallback when server returns non-OK', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const askBenchmarkAI = await freshAskBenchmarkAI();
    const result = await askBenchmarkAI('question', fakeSubmission, fakeAll);

    expect(result.analysis).toMatch(/error/i);
  });
});
