import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: function(this: any) {
    this.models = { generateContent: mockGenerateContent };
  },
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    ARRAY: 'ARRAY',
  },
  Schema: {},
}));

beforeEach(() => {
  vi.resetModules();
  mockGenerateContent.mockReset();
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  vi.stubEnv('API_KEY', '');
});

async function freshAskBenchmarkAI() {
  const { askBenchmarkAI } = await import('./gemini.ts');
  return askBenchmarkAI;
}

const fakeSubmission = { id: '1', revenue: '100m_1b' } as any;
const fakeAll = [fakeSubmission];

describe('askBenchmarkAI', () => {
  it('returns parsed analysis and chart on success', async () => {
    const payload = { analysis: 'Great performance!', chart: null };
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify(payload) });

    const askBenchmarkAI = await freshAskBenchmarkAI();
    const result = await askBenchmarkAI('How am I doing?', fakeSubmission, fakeAll);

    expect(result.analysis).toBe('Great performance!');
    expect(result.chart).toBeNull();
    expect(mockGenerateContent).toHaveBeenCalledOnce();
  });

  it('returns fallback object when generateContent throws', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Network error'));

    const askBenchmarkAI = await freshAskBenchmarkAI();
    const result = await askBenchmarkAI('How am I doing?', fakeSubmission, fakeAll);

    expect(result.analysis).toMatch(/error/i);
    expect(result.chart).toBeNull();
  });

  it('throws when API key is missing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('API_KEY', '');
    vi.resetModules();

    const { askBenchmarkAI } = await import('./gemini.ts');
    // generateContent won't be reached; getAI() throws first
    mockGenerateContent.mockResolvedValueOnce({ text: '{}' });

    // The error is caught internally and returns the fallback
    const result = await askBenchmarkAI('question', fakeSubmission, fakeAll);
    expect(result.analysis).toMatch(/error/i);
  });
});
