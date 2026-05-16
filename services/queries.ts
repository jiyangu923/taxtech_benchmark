import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { api } from './api';
import { Submission, User, Feedback, FeedbackStatus, FeedbackSubmission, ReleaseLetter, ReleaseLetterDraft, CommunityMember, CommunityMemberDraft, CommunityMemberStatus } from '../types';
import { Session, ChatMessage } from '../pages/Taxi.helpers';

/**
 * Centralized React Query keys + hooks. Components import these instead of
 * calling the api layer directly so cache keys stay consistent and
 * invalidation is one place.
 */

export const queryKeys = {
  submissions: ['submissions'] as const,
  submissionsHistory: ['submissions', 'history'] as const,
  mySubmission: ['mySubmission'] as const,
  webhookUrl: ['settings', 'webhookUrl'] as const,
  adminEmails: ['settings', 'adminEmails'] as const,
  publicStats: ['publicStats'] as const,
  chatSessions: ['chatSessions'] as const,
  currentSurveyVersion: ['settings', 'currentSurveyVersion'] as const,
  allProfiles: ['profiles', 'all'] as const,
  feedback: ['feedback'] as const,
  releaseLetters: ['releaseLetters'] as const,
  publicCommunityMembers: ['communityMembers', 'public'] as const,
  allCommunityMembers: ['communityMembers', 'all'] as const,
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

// ─── Reminders v1 ────────────────────────────────────────────────────────────

export function useSubmissionsHistory(opts?: Omit<UseQueryOptions<Submission[]>, 'queryKey' | 'queryFn'>) {
  return useQuery<Submission[]>({
    queryKey: queryKeys.submissionsHistory,
    queryFn: () => api.getAllSubmissionsIncludingHistory(),
    ...opts,
  });
}

export function useCurrentSurveyVersion() {
  return useQuery<number>({
    queryKey: queryKeys.currentSurveyVersion,
    queryFn: () => api.getCurrentSurveyVersion(),
  });
}

export function useSetCurrentSurveyVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => api.setCurrentSurveyVersion(version),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.currentSurveyVersion });
      qc.invalidateQueries({ queryKey: queryKeys.submissions });
    },
  });
}

export function useUpdateEmailReminderPref() {
  return useMutation({
    mutationFn: (enabled: boolean) => api.updateMyEmailReminderPref(enabled),
  });
}

export function useMarkRemindersSent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userIds: string[]) => api.markRemindersSent(userIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.allProfiles }),
  });
}

export function useAllProfiles(opts?: Omit<UseQueryOptions<User[]>, 'queryKey' | 'queryFn'>) {
  return useQuery<User[]>({
    queryKey: queryKeys.allProfiles,
    queryFn: () => api.getAllProfiles(),
    ...opts,
  });
}

// ─── Feedback ────────────────────────────────────────────────────────────────

export function useSubmitFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: FeedbackSubmission) => api.submitFeedback(s),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.feedback }),
  });
}

export function useAllFeedback(opts?: Omit<UseQueryOptions<Feedback[]>, 'queryKey' | 'queryFn'>) {
  return useQuery<Feedback[]>({
    queryKey: queryKeys.feedback,
    queryFn: () => api.getAllFeedback(),
    ...opts,
  });
}

export function useUpdateFeedbackStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: FeedbackStatus }) =>
      api.updateFeedbackStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.feedback }),
  });
}

export function useDeleteFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteFeedback(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.feedback }),
  });
}

// ─── Community Members ───────────────────────────────────────────────────────
//
// Two read hooks: `usePublicCommunityMembers` (confirmed only — drives the
// /community page) and `useAllCommunityMembers` (admin tab; includes pending
// and declined). Every mutation invalidates both so the admin and public
// views stay coherent without manual refetch.

function invalidateCommunityMembers(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.publicCommunityMembers });
  qc.invalidateQueries({ queryKey: queryKeys.allCommunityMembers });
}

export function usePublicCommunityMembers(opts?: Omit<UseQueryOptions<CommunityMember[]>, 'queryKey' | 'queryFn'>) {
  return useQuery<CommunityMember[]>({
    queryKey: queryKeys.publicCommunityMembers,
    queryFn: () => api.getPublicCommunityMembers(),
    ...opts,
  });
}

export function useAllCommunityMembers(opts?: Omit<UseQueryOptions<CommunityMember[]>, 'queryKey' | 'queryFn'>) {
  return useQuery<CommunityMember[]>({
    queryKey: queryKeys.allCommunityMembers,
    queryFn: () => api.getAllCommunityMembers(),
    ...opts,
  });
}

export function useCreateCommunityMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: CommunityMemberDraft) => api.createCommunityMember(draft),
    onSuccess: () => invalidateCommunityMembers(qc),
  });
}

export function useUpdateCommunityMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CommunityMemberDraft> & { status?: CommunityMemberStatus } }) =>
      api.updateCommunityMember(id, patch),
    onSuccess: () => invalidateCommunityMembers(qc),
  });
}

export function useDeleteCommunityMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteCommunityMember(id),
    onSuccess: () => invalidateCommunityMembers(qc),
  });
}

export function useSendCommunityInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => api.sendCommunityInvite(memberId),
    // The server stamps invited_at + confirm_token_expires_at, so refresh
    // the admin list to show "Invite sent · expires …" badges.
    onSuccess: () => invalidateCommunityMembers(qc),
  });
}

// ─── Release Letters ─────────────────────────────────────────────────────────

export function useReleaseLetters(opts?: Omit<UseQueryOptions<ReleaseLetter[]>, 'queryKey' | 'queryFn'>) {
  return useQuery<ReleaseLetter[]>({
    queryKey: queryKeys.releaseLetters,
    queryFn: () => api.listReleaseLetters(),
    ...opts,
  });
}

export function useCreateReleaseLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: ReleaseLetterDraft) => api.createReleaseLetter(draft),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.releaseLetters }),
  });
}

export function useUpdateReleaseLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ReleaseLetterDraft> }) =>
      api.updateReleaseLetter(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.releaseLetters }),
  });
}

export function useDeleteReleaseLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteReleaseLetter(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.releaseLetters }),
  });
}

export function useUploadReleaseImage() {
  return useMutation({
    mutationFn: (file: File) => api.uploadReleaseImage(file),
  });
}

export function useSendReleaseLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ letterId, mode }: { letterId: string; mode: 'test' | 'broadcast' }) =>
      api.sendReleaseLetter(letterId, mode),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.releaseLetters }),
  });
}

// ─── Chat sessions (Taxi) ────────────────────────────────────────────────────
//
// Optimistic updates on every mutation: the UI reflects the change instantly
// while the network request is in flight. On error, React Query rolls the
// cache back to the snapshot we captured in onMutate.

export function useChatSessions(opts?: Omit<UseQueryOptions<Session[]>, 'queryKey' | 'queryFn'>) {
  return useQuery<Session[]>({
    queryKey: queryKeys.chatSessions,
    queryFn: () => api.getChatSessions(),
    ...opts,
  });
}

type CacheCtx = { previous: Session[] | undefined };

function snapshotAndOptimistic(
  qc: ReturnType<typeof useQueryClient>,
  updater: (prev: Session[]) => Session[]
): CacheCtx {
  const previous = qc.getQueryData<Session[]>(queryKeys.chatSessions);
  qc.setQueryData<Session[]>(queryKeys.chatSessions, prev => updater(prev || []));
  return { previous };
}

function rollbackOnError(qc: ReturnType<typeof useQueryClient>, ctx: CacheCtx | undefined) {
  if (ctx?.previous !== undefined) qc.setQueryData(queryKeys.chatSessions, ctx.previous);
}

export function useCreateChatSession() {
  const qc = useQueryClient();
  return useMutation<void, Error, Session, CacheCtx>({
    mutationFn: (session) => api.createChatSession(session),
    onMutate: (session) => snapshotAndOptimistic(qc, prev => [session, ...prev]),
    onError: (_err, _vars, ctx) => rollbackOnError(qc, ctx),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.chatSessions }),
  });
}

export function useUpdateChatSession() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; patch: Partial<Pick<Session, 'title' | 'messages' | 'updatedAt'>> }, CacheCtx>({
    mutationFn: ({ id, patch }) => api.updateChatSession(id, patch),
    onMutate: ({ id, patch }) => snapshotAndOptimistic(qc, prev =>
      prev.map(s => (s.id === id ? { ...s, ...patch } : s))
    ),
    onError: (_err, _vars, ctx) => rollbackOnError(qc, ctx),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.chatSessions }),
  });
}

export function useDeleteChatSession() {
  const qc = useQueryClient();
  return useMutation<void, Error, string, CacheCtx>({
    mutationFn: (id) => api.deleteChatSession(id),
    onMutate: (id) => snapshotAndOptimistic(qc, prev => prev.filter(s => s.id !== id)),
    onError: (_err, _vars, ctx) => rollbackOnError(qc, ctx),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.chatSessions }),
  });
}

// Convenience: append a message to a session, bumping updatedAt and (if first
// message) auto-titling. Mirrors the local appendMessage helper but writes
// through to Supabase via useUpdateChatSession.
export function useAppendChatMessage() {
  const update = useUpdateChatSession();
  return {
    ...update,
    appendTo: (session: Session, msg: ChatMessage) => {
      const isFirst = session.messages.length === 0;
      const nextMessages = [...session.messages, msg].slice(-50);
      const patch: Partial<Pick<Session, 'title' | 'messages' | 'updatedAt'>> = {
        messages: nextMessages,
        updatedAt: Date.now(),
      };
      if (isFirst) {
        const t = msg.question.trim().replace(/\s+/g, ' ');
        patch.title = t.length > 40 ? t.slice(0, 40).trimEnd() + '…' : t || 'New chat';
      }
      return update.mutateAsync({ id: session.id, patch });
    },
  };
}

