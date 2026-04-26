// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  queryKeys,
  useSubmissions, useMySubmission, useWebhookUrl, useAdminEmails, usePublicStats,
  useCreateSubmission, useUpdateSubmissionStatus, useDeleteSubmission,
  useSetWebhookUrl, useAddAdminEmail, useRemoveAdminEmail,
} from './queries';

// ─── Mock the api layer the hooks depend on ─────────────────────────────────

vi.mock('./api', () => ({
  api: {
    getSubmissions: vi.fn(),
    getMySubmission: vi.fn(),
    getWebhookUrl: vi.fn(),
    getAdminEmails: vi.fn(),
    getPublicStats: vi.fn(),
    createSubmission: vi.fn(),
    updateSubmissionStatus: vi.fn(),
    deleteSubmission: vi.fn(),
    setWebhookUrl: vi.fn(),
    addAdminEmail: vi.fn(),
    removeAdminEmail: vi.fn(),
  },
}));

const { api } = await import('./api');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Each test gets a fresh QueryClient so cache state doesn't leak.
 * retry: false makes errors surface immediately instead of slowly retrying.
 */
function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { client, Wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── queryKeys: stable identity ──────────────────────────────────────────────

describe('queryKeys', () => {
  it('exposes the expected key shape for each query', () => {
    expect(queryKeys.submissions).toEqual(['submissions']);
    expect(queryKeys.mySubmission).toEqual(['mySubmission']);
    expect(queryKeys.webhookUrl).toEqual(['settings', 'webhookUrl']);
    expect(queryKeys.adminEmails).toEqual(['settings', 'adminEmails']);
    expect(queryKeys.publicStats).toEqual(['publicStats']);
  });

  it('keys are stable references (same identity on re-import)', () => {
    // If keys are recreated as new arrays each access, useQuery would treat
    // them as different and never hit cache. Sanity-check identity.
    expect(queryKeys.submissions).toBe(queryKeys.submissions);
  });
});

// ─── Reads ───────────────────────────────────────────────────────────────────

describe('useSubmissions', () => {
  it('calls api.getSubmissions and returns the result', async () => {
    const rows = [{ id: 's1' }, { id: 's2' }];
    vi.mocked(api.getSubmissions).mockResolvedValueOnce(rows as any);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSubmissions(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toEqual(rows));
    expect(api.getSubmissions).toHaveBeenCalledTimes(1);
  });

  it('respects the `enabled: false` option (skips the fetch)', async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useSubmissions({ enabled: false }), { wrapper: Wrapper });
    // Give effects a moment to fire if they were going to.
    await new Promise(r => setTimeout(r, 20));
    expect(api.getSubmissions).not.toHaveBeenCalled();
  });
});

describe('useMySubmission', () => {
  it('returns the user submission from the cache', async () => {
    const sub = { id: 'sub-1', userId: 'u-1', companyName: 'Acme' };
    vi.mocked(api.getMySubmission).mockResolvedValueOnce(sub as any);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMySubmission(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toEqual(sub));
  });
});

describe('useWebhookUrl, useAdminEmails, usePublicStats', () => {
  it('useWebhookUrl returns the saved URL', async () => {
    vi.mocked(api.getWebhookUrl).mockResolvedValueOnce('https://script.google/exec');
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useWebhookUrl(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBe('https://script.google/exec'));
  });

  it('useAdminEmails returns the array of admins', async () => {
    vi.mocked(api.getAdminEmails).mockResolvedValueOnce(['a@x.com', 'b@x.com']);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdminEmails(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(['a@x.com', 'b@x.com']));
  });

  it('usePublicStats returns the stats object', async () => {
    const stats = { totalSubmissions: 12, distinctIndustries: 3, totalRevenue: 1_000_000 };
    vi.mocked(api.getPublicStats).mockResolvedValueOnce(stats);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => usePublicStats(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(stats));
  });
});

// ─── Mutation invalidation ───────────────────────────────────────────────────
//
// These are the contracts the rest of the app depends on: when X mutation
// runs, Y queries must invalidate so observing components see fresh data
// without manual reload.

describe('useCreateSubmission invalidations', () => {
  it('invalidates submissions, mySubmission, and publicStats on success', async () => {
    vi.mocked(api.createSubmission).mockResolvedValueOnce({ id: 'sub-new' } as any);
    const { client, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useCreateSubmission(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({} as any);
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(c => (c[0] as any).queryKey);
    expect(invalidatedKeys).toEqual(expect.arrayContaining([
      queryKeys.submissions,
      queryKeys.mySubmission,
      queryKeys.publicStats,
    ]));
  });
});

describe('useUpdateSubmissionStatus invalidations', () => {
  it('invalidates submissions and publicStats on success', async () => {
    vi.mocked(api.updateSubmissionStatus).mockResolvedValueOnce(undefined);
    const { client, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateSubmissionStatus(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 'sub-1', status: 'approved' });
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(c => (c[0] as any).queryKey);
    expect(invalidatedKeys).toEqual(expect.arrayContaining([
      queryKeys.submissions,
      queryKeys.publicStats,
    ]));
    expect(api.updateSubmissionStatus).toHaveBeenCalledWith('sub-1', 'approved');
  });
});

describe('useDeleteSubmission invalidations', () => {
  it('invalidates submissions and publicStats on success', async () => {
    vi.mocked(api.deleteSubmission).mockResolvedValueOnce(undefined);
    const { client, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteSubmission(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync('sub-1');
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(c => (c[0] as any).queryKey);
    expect(invalidatedKeys).toEqual(expect.arrayContaining([
      queryKeys.submissions,
      queryKeys.publicStats,
    ]));
  });
});

describe('useSetWebhookUrl invalidations', () => {
  it('invalidates webhookUrl on success', async () => {
    vi.mocked(api.setWebhookUrl).mockResolvedValueOnce(undefined);
    const { client, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useSetWebhookUrl(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync('https://new.url');
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(c => (c[0] as any).queryKey);
    expect(invalidatedKeys).toEqual(expect.arrayContaining([queryKeys.webhookUrl]));
  });

  it('does NOT invalidate on failure (so cache stays consistent with server)', async () => {
    vi.mocked(api.setWebhookUrl).mockRejectedValueOnce(new Error('RLS denied'));
    const { client, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useSetWebhookUrl(), { wrapper: Wrapper });

    await act(async () => {
      try { await result.current.mutateAsync('https://bad.url'); } catch { /* expected */ }
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useAddAdminEmail invalidations', () => {
  it('invalidates adminEmails on success', async () => {
    vi.mocked(api.addAdminEmail).mockResolvedValueOnce(undefined);
    const { client, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useAddAdminEmail(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync('new@admin.com');
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(c => (c[0] as any).queryKey);
    expect(invalidatedKeys).toEqual(expect.arrayContaining([queryKeys.adminEmails]));
  });
});

describe('useRemoveAdminEmail invalidations', () => {
  it('invalidates adminEmails on success', async () => {
    vi.mocked(api.removeAdminEmail).mockResolvedValueOnce(undefined);
    const { client, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRemoveAdminEmail(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync('old@admin.com');
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(c => (c[0] as any).queryKey);
    expect(invalidatedKeys).toEqual(expect.arrayContaining([queryKeys.adminEmails]));
  });
});
