import { describe, it, expect } from 'vitest';
import { parseSseFrames } from './claude';

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
