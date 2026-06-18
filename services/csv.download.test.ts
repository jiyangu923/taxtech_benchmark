// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadBlob } from './csv';

describe('downloadBlob', () => {
  afterEach(() => vi.restoreAllMocks());

  it('appends the anchor to the DOM before clicking, then cleans up', () => {
    // jsdom doesn't implement object URLs — stub them.
    (URL as any).createObjectURL = vi.fn(() => 'blob:mock-url');
    (URL as any).revokeObjectURL = vi.fn();

    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');
    // Spy on click so jsdom doesn't attempt real navigation on the blob URL.
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBlob(new Blob(['{}'], { type: 'application/json' }), 'snapshot.json');

    // The regression we're guarding: a detached <a>.click() is silently
    // ignored by several browsers, so the anchor must be in the DOM when
    // clicked. (Export Snapshot used to skip the append and did nothing.)
    expect(appendSpy).toHaveBeenCalledTimes(1);
    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.tagName).toBe('A');
    expect(anchor.download).toBe('snapshot.json');
    expect(anchor.getAttribute('href')).toBe('blob:mock-url');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith(anchor);
    expect((URL as any).revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
