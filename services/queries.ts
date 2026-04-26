import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { api } from './api';
import { Submission } from '../types';

/**
 * Centralized React Query keys + hooks. Components import these instead of
 * calling the api layer directly so cache keys stay consistent and
 * invalidation is one place.
 */

export const queryKeys = {
  submissions: ['submissions'] as const,
  mySubmission: ['mySubmission'] as const,
  webhookUrl: ['settings', 'webhookUrl'] as const,
  adminEmails: ['settings', 'adminEmails'] as const,
  publicStats: ['publicStats'] as const,
};

// ─── Reads ───────────────────────────────────────────────────────────────────

export function useSubmissions(opts?: Omit<UseQueryOptions<Submission[]>, 'queryKey' | 'queryFn'>) {
  return useQuery<Submission[]>({
    queryKey: queryKeys.submissions,
    queryFn: () => api.getSubmissions(),
    ...opts,
  });
}

export function useMySubmission() {
  return useQuery<Submission | null>({
    queryKey: queryKeys.mySubmission,
    queryFn: () => api.getMySubmission(),
  });
}

export function useWebhookUrl() {
  return useQuery<string>({
    queryKey: queryKeys.webhookUrl,
    queryFn: () => api.getWebhookUrl(),
  });
}

export function useAdminEmails() {
  return useQuery<string[]>({
    queryKey: queryKeys.adminEmails,
    queryFn: () => api.getAdminEmails(),
  });
}

export function usePublicStats() {
  return useQuery<{ totalSubmissions: number; distinctIndustries: number; totalRevenue: number }>({
    queryKey: queryKeys.publicStats,
    queryFn: () => api.getPublicStats(),
  });
}

// ─── Mutations + invalidations ───────────────────────────────────────────────
//
// Each mutation invalidates the queries whose data it could have changed,
// so any observing component re-fetches and shows fresh data without manual
// reload.

export function useCreateSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof api.createSubmission>[0]) => api.createSubmission(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.submissions });
      qc.invalidateQueries({ queryKey: queryKeys.mySubmission });
      qc.invalidateQueries({ queryKey: queryKeys.publicStats });
    },
  });
}

export function useUpdateSubmissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      api.updateSubmissionStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.submissions });
      qc.invalidateQueries({ queryKey: queryKeys.publicStats });
    },
  });
}

export function useDeleteSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSubmission(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.submissions });
      qc.invalidateQueries({ queryKey: queryKeys.publicStats });
    },
  });
}

export function useSetWebhookUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.setWebhookUrl(url),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.webhookUrl }),
  });
}

export function useAddAdminEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => api.addAdminEmail(email),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.adminEmails }),
  });
}

export function useRemoveAdminEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => api.removeAdminEmail(email),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.adminEmails }),
  });
}
