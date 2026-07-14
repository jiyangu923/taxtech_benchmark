import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { parseSseFrames, streamClaudeStructured, STREAM_IDLE_MS } from './claude';

describe('parseSseFrames', () => {
  it('extracts a single delta event from a complete frame', () => {
    const { events, remaining } = parseSseFrames('data: {"type":"delta","text":"hi"}\n\n');
    expect(events).toEqual([{ type: 'delta', text: 'hi' }]);
    expect(remaining).toBe('');
  });

  it('extracts multiple events from one chunk', () => {
    const chunk =
      'data: {"type":"delta","text":"a"}\n\n' +
      'data: {"type":"delta","text":"b"}\n\n' +
      'data: {"type":"done","text":"ab","usage":{"input_tokens":1,"output_tokens":2,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}\n\n';
    const { events, remaining } = parseSseFrames(chunk);
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: 'delta', text: 'a' });
    expect(events[1]).toEqual({ type: 'delta', text: 'b' });
    expect(events[2].type).toBe('done');
    expect(remaining).toBe('');
  });

  it('buffers an incomplete frame in the trailing string', () => {
    const { events, remaining } = parseSseFrames('data: {"type":"delta","text":"hi"}\n\ndata: {"type":"de');
    expect(events).toEqual([{ type: 'delta', text: 'hi' }]);
    expect(remaining).toBe('data: {"type":"de');
  });

  it('reassembles an event split across two chunks via the prevBuffer arg', () => {
    const first = parseSseFrames('data: {"type":"de');
    expect(first.events).toEqual([]);
    expect(first.remaining).toBe('data: {"type":"de');

    const second = parseSseFrames('lta","text":"hi"}\n\n', first.remaining);
    expect(second.events).toEqual([{ type: 'delta', text: 'hi' }]);
    expect(second.remaining).toBe('');
  });

  it('flags malformed JSON as unknown without crashing', () => {
    const { events } = parseSseFrames('data: {not valid json}\n\n');
    expect(events).toEqual([{ type: 'unknown' }]);
  });

  it('ignores frames without a data: line', () => {
    const { events, remaining } = parseSseFrames(': heartbeat\n\n');
    expect(events).toEqual([]);
    expect(remaining).toBe('');
  });

  it('preserves an error event verbatim', () => {
    const { events } = parseSseFrames('data: {"type":"error","message":"upstream failed"}\n\n');
    expect(events).toEqual([{ type: 'error', message: 'upstream failed' }]);
  });
});

describe('streamClaudeStructured answerId plumbing', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns the answerId carried on the done event', async () => {
    const frames = [
      'data: {"type":"delta","text":"{\\"a\\":"}\n\n',
      'data: {"type":"done","text":"{\\"a\\":1}","answerId":"ans-123","usage":{"input_tokens":1,"output_tokens":2,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}\n\n',
    ];
    let i = 0;
    const reader = {
      read: async () => (i < frames.length
        ? { done: false, value: new TextEncoder().encode(frames[i++]) }
        : { done: true, value: undefined }),
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, body: { getReader: () => reader } })));

    const res = await streamClaudeStructured<{ a: number }>({ messages: [{ role: 'user', content: 'q' }], outputFormat: {} });
    expect(res.answerId).toBe('ans-123');
    expect(res.json).toEqual({ a: 1 });
  });

  it('yields answerId null when the server omits it (pre-migration / persist failure)', async () => {
    const frames = [
      'data: {"type":"done","text":"{}","usage":{"input_tokens":1,"output_tokens":1,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}\n\n',
    ];
    let i = 0;
    const reader = {
      read: async () => (i < frames.length
        ? { done: false, value: new TextEncoder().encode(frames[i++]) }
        : { done: true, value: undefined }),
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, body: { getReader: () => reader } })));

    const res = await streamClaudeStructured({ messages: [{ role: 'user', content: 'q' }], outputFormat: {} });
    expect(res.answerId).toBeNull();
  });
});

describe('streamClaudeStructured idle timeout', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('aborts and rejects when no data arrives within STREAM_IDLE_MS', async () => {
    // A body whose reader never yields on its own, but whose read() rejects the
    // instant the request's AbortSignal fires — mirroring how a real fetch body
    // errors when the connection is aborted. Without the idle guard this read
    // would await forever and the whole call would hang.
    const fetchMock = vi.fn((_url: string, opts: any) => {
      const signal: AbortSignal = opts.signal;
      const reader = {
        read: () => new Promise((_resolve, reject) => {
          const bail = () => reject(signal.reason ?? new Error('aborted'));
          if (signal.aborted) bail();
          else signal.addEventListener('abort', bail, { once: true });
        }),
      };
      return Promise.resolve({ ok: true, body: { getReader: () => reader } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const promise = streamClaudeStructured({
      messages: [{ role: 'user', content: 'hi' }],
      outputFormat: {},
    });
    // Attach the rejection handler before advancing timers so the abort has a
    // listener (no unhandled rejection).
    const assertion = expect(promise).rejects.toThrow(/stalled/i);
    await vi.advanceTimersByTimeAsync(STREAM_IDLE_MS + 100);
    await assertion;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
