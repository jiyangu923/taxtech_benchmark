import { createClient } from '@supabase/supabase-js';
import { processLock } from '@supabase/auth-js';
import { Submission, User, Feedback, FeedbackStatus, FeedbackSubmission, ReleaseLetter, ReleaseLetterDraft, CommunityMember, CommunityMemberDraft, CommunityMemberStatus } from '../types';
import { submissionsToCsv, downloadCsv } from './csv';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// `lock: processLock` swaps Supabase's default `navigatorLock` (which uses
// the browser `navigator.locks` API) for a single-process lock. The
// navigator-locks default can leak orphaned locks when components unmount
// mid-auth-call (e.g. during SPA route changes), causing `getSession()` to
// hang for ~5s while the lock self-recovers. Symptom: the admin Releases
// editor's "Broadcast" click would freeze with all action buttons stuck in
// loading state because `supabase.auth.getSession()` never resolved in
// time. processLock is a single-tab in-memory lock that can't orphan and
// is the documented fix from Supabase for this issue. Trade-off: no
// cross-tab coordination — fine for our app since auth state is per-tab.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    lock: processLock,
  },
});

const INITIAL_ADMINS = ['admin@taxbenchmark.com', 'jiyangu923@gmail.com'];

export const api = {
  // ─── Auth ────────────────────────────────────────────────────────────────

  async getCurrentUser(): Promise<User | null> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (profile) return profile as User;

    // Profile row was deleted but auth user still exists — recreate it.
    // Use hard-coded initial admins for role check here to avoid reading
    // the settings table (which requires admin RLS) in a non-admin context.
    const email = (authUser.email ?? '').toLowerCase();
    const role = INITIAL_ADMINS.map(e => e.toLowerCase()).includes(email) ? 'admin' : 'user';
    const name =
      authUser.user_metadata?.full_name ||
      authUser.user_metadata?.name ||
      email.split('@')[0];

    const { data: created } = await supabase
      .from('profiles')
      .insert({ id: authUser.id, email, name, role })
      .select()
      .single();

    return (created as User) || null;
  },

  async register(name: string, email: string, password: string): Promise<void> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Registration failed.');
    // Profile is created by ensureProfile() after the user confirms their email
    // and onAuthStateChange fires with a valid session.
  },

  async login(email: string, password: string): Promise<User> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Login failed.');

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();
    if (!profile) throw new Error('Account not found. Please register first or confirm your email.');
    return profile as User;
  },

  async loginWithGoogle(): Promise<void> {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/' },
    });
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut();
  },

  async updateUserProfile(updatedUser: User): Promise<User> {
    const { data, error } = await supabase
      .from('profiles')
      .update({ name: updatedUser.name, email: updatedUser.email })
      .eq('id', updatedUser.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as User;
  },

  // ─── Submissions ─────────────────────────────────────────────────────────

  async createSubmission(data: Omit<Submission, 'id' | 'userId' | 'userName' | 'status' | 'submittedAt' | 'is_current' | 'survey_version'>): Promise<Submission> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error('Must be logged in');

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('id', authUser.id)
      .single();
    if (!profile) throw new Error('Profile not found');

    // Soft-archive any prior current submission so historical data is
    // preserved for trend analysis. We don't delete — we flip is_current
    // so the new row becomes the active one and the old one survives in
    // the table for time-series queries.
    await supabase
      .from('submissions')
      .update({ is_current: false })
      .eq('userId', profile.id)
      .eq('is_current', true);

    // Tag the new submission with the current survey version so we can
    // detect outdated submissions later when admin bumps the version.
    const surveyVersion = await api.getCurrentSurveyVersion();

    const { data: sub, error } = await supabase
      .from('submissions')
      .insert({
        ...data,
        userId: profile.id,
        userName: profile.name,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        is_current: true,
        survey_version: surveyVersion,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return sub as Submission;
  },

  async getSubmissions(): Promise<Submission[]> {
    // Return only the latest version of each user's submission. Historical
    // rows (is_current = false) are kept for trend analysis but excluded
    // from peer comparisons and the admin dashboard's default view.
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('is_current', true);
    if (error) throw new Error(error.message);
    return (data as Submission[]) || [];
  },

  /**
   * Admin-only: returns every submission ever made (current + historical).
   * Used by trend analysis. Falls back to current-only on environments
   * where the migration hasn't run.
   */
  async getAllSubmissionsIncludingHistory(): Promise<Submission[]> {
    const { data, error } = await supabase.from('submissions').select('*');
    if (error) throw new Error(error.message);
    return (data as Submission[]) || [];
  },

  /**
   * Returns the current user's own submission (if any) so the survey can
   * pre-populate fields when re-opening it. Filters to is_current = true
   * so a user with prior versions still gets just the latest prefill.
   */
  async getMySubmission(): Promise<Submission | null> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('userId', authUser.id)
      .eq('is_current', true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Submission) || null;
  },

  // ─── Survey versioning + reminder candidates ─────────────────────────────

  async getCurrentSurveyVersion(): Promise<number> {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'current_survey_version')
      .maybeSingle();
    const parsed = parseInt(data?.value ?? '1', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  },

  async setCurrentSurveyVersion(version: number): Promise<void> {
    if (!Number.isFinite(version) || version < 1) {
      throw new Error('Survey version must be a positive integer');
    }
    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'current_survey_version', value: String(version) });
    if (error) throw new Error(error.message);
  },

  async updateMyEmailReminderPref(enabled: boolean): Promise<void> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error('Must be logged in');
    const { error } = await supabase
      .from('profiles')
      .update({ email_reminders_enabled: enabled })
      .eq('id', authUser.id);
    if (error) throw new Error(error.message);
  },

  async markRemindersSent(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const { error } = await supabase
      .from('profiles')
      .update({ last_reminder_sent_at: new Date().toISOString() })
      .in('id', userIds);
    if (error) throw new Error(error.message);
  },

  // ─── Feedback widget ─────────────────────────────────────────────────────
  //
  // Anyone (even unauthenticated visitors) can submit feedback. Reads/updates
  // are admin-only via RLS — the helpers below assume the caller is an admin
  // when invoking get/update/delete and let Supabase reject non-admins server-
  // side. The widget itself only ever calls submitFeedback().

  /**
   * Public submission from the floating feedback widget. Auto-attaches the
   * current authenticated user's id/name/email if logged in; works fine
   * anonymously otherwise.
   */
  async submitFeedback(s: FeedbackSubmission): Promise<void> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    let userId: string | null = null;
    let userName: string | null = s.user_name ?? null;
    let userEmail: string | null = s.user_email ?? null;
    if (authUser) {
      userId = authUser.id;
      // Pull the profile so we have a name to show in the admin UI even if
      // the widget didn't ask for one (logged-in users skip those fields).
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, email')
        .eq('id', authUser.id)
        .maybeSingle();
      if (profile?.name && !userName)  userName  = profile.name as string;
      if (profile?.email && !userEmail) userEmail = profile.email as string;
    }
    const { error } = await supabase.from('feedback').insert({
      user_id:    userId,
      user_name:  userName,
      user_email: userEmail,
      type:       s.type,
      message:    s.message,
      page_path:  s.page_path ?? null,
      user_agent: s.user_agent ?? null,
    });
    if (error) throw new Error(error.message);
  },

  async getAllFeedback(): Promise<Feedback[]> {
    const { data, error } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Feedback[]) || [];
  },

  async updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
    const patch: Record<string, unknown> = { status };
    if (status === 'resolved') patch.resolved_at = new Date().toISOString();
    if (status !== 'resolved') patch.resolved_at = null;
    const { error } = await supabase.from('feedback').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async deleteFeedback(id: string): Promise<void> {
    const { error } = await supabase.from('feedback').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ─── Community Members ───────────────────────────────────────────────────
  //
  // Public-facing list shown on /community. Public visitors can read confirmed
  // rows (RLS-enforced); admins can read/write everything.
  // PR 2 will add token-confirmed self-edit + Supabase Storage photo upload.

  async getPublicCommunityMembers(): Promise<CommunityMember[]> {
    // Anyone can call this — RLS filters to status='confirmed' for non-admins.
    // We add the explicit `eq` so admins also get only confirmed rows from
    // this endpoint (the admin tab uses getAllCommunityMembers).
    const { data, error } = await supabase
      .from('community_members')
      .select('*')
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as CommunityMember[]) || [];
  },

  async getAllCommunityMembers(): Promise<CommunityMember[]> {
    // Admin-only view (RLS enforces). Includes pending and declined.
    const { data, error } = await supabase
      .from('community_members')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as CommunityMember[]) || [];
  },

  async createCommunityMember(draft: CommunityMemberDraft): Promise<CommunityMember> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error('Must be logged in');
    const { data, error } = await supabase
      .from('community_members')
      .insert({ ...draft, created_by: authUser.id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as CommunityMember;
  },

  async updateCommunityMember(
    id: string,
    patch: Partial<CommunityMemberDraft> & { status?: CommunityMemberStatus }
  ): Promise<void> {
    // When flipping status, stamp the corresponding timestamp so the public
    // sort by confirmed_at stays meaningful and the audit trail is honest.
    const stamped: Record<string, any> = { ...patch, updated_at: new Date().toISOString() };
    if (patch.status === 'confirmed') stamped.confirmed_at = new Date().toISOString();
    if (patch.status === 'declined')  stamped.declined_at  = new Date().toISOString();
    const { error } = await supabase
      .from('community_members')
      .update(stamped)
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async deleteCommunityMember(id: string): Promise<void> {
    const { error } = await supabase.from('community_members').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  /**
   * Admin-triggered. Server generates a fresh confirmation token, stores it
   * on the member row, and sends an email with the /#/confirm-member?token
   * link. Refusing a confirmed row keeps us from churning a published
   * listing; refusing rows with no email is a defensive check.
   */
  async sendCommunityInvite(memberId: string): Promise<{ email: string; expiresAt: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Must be logged in');
    const resp = await fetch('/api/admin/send-community-invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ memberId }),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(body.error || `HTTP ${resp.status}`);
    return body;
  },

  // ─── Release Letters ─────────────────────────────────────────────────────
  //
  // Admin writes weekly "what shipped this week" letters in markdown,
  // then sends a test to themselves before broadcasting to all users.
  // CRUD here; the actual email send lives in api/admin/send-release-letter.

  async listReleaseLetters(): Promise<ReleaseLetter[]> {
    const { data, error } = await supabase
      .from('release_letters')
      .select('*')
      .order('week_of', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as ReleaseLetter[]) || [];
  },

  async createReleaseLetter(draft: ReleaseLetterDraft): Promise<ReleaseLetter> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error('Must be logged in');
    const { data, error } = await supabase
      .from('release_letters')
      .insert({ ...draft, created_by: authUser.id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ReleaseLetter;
  },

  async updateReleaseLetter(id: string, patch: Partial<ReleaseLetterDraft>): Promise<void> {
    const { error } = await supabase
      .from('release_letters')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async deleteReleaseLetter(id: string): Promise<void> {
    const { error } = await supabase.from('release_letters').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  /**
   * Upload an image to the release-images bucket and return its public URL.
   * Filename is auto-prefixed with a UUID so admin can upload screenshots
   * with the same name across letters without collision.
   */
  async uploadReleaseImage(file: File): Promise<string> {
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
    const path = `${crypto.randomUUID()}${ext}`;
    const { error } = await supabase.storage
      .from('release-images')
      .upload(path, file, { cacheControl: '31536000', upsert: false });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('release-images').getPublicUrl(path);
    return data.publicUrl;
  },

  /**
   * Calls the admin-only serverless function to send a release letter.
   * mode='test' sends only to the current admin's own email; mode='broadcast'
   * sends to every opted-in non-admin profile.
   */
  async sendReleaseLetter(letterId: string, mode: 'test' | 'broadcast'): Promise<{ sent: number; failed: number; errors: any[] }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Must be logged in');
    const resp = await fetch('/api/admin/send-release-letter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ letterId, mode }),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(body.error || `HTTP ${resp.status}`);
    return body;
  },

  /**
   * Admin-only (RLS enforced server-side via "Admins can view all profiles"
   * policy). Used by the reminders tab to identify users who registered
   * but never submitted.
   */
  async getAllProfiles(): Promise<User[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, email_reminders_enabled, last_reminder_sent_at');
    if (error) throw new Error(error.message);
    return (data as User[]) || [];
  },

  /**
   * Public aggregate stats for the Home page hero — total approved
   * submissions, distinct industries, and total revenue covered (USD).
   * Calls a SECURITY DEFINER RPC so anonymous visitors can read aggregates
   * without exposing individual rows or PII.
   */
  async getPublicStats(): Promise<{ totalSubmissions: number; distinctIndustries: number; totalRevenue: number }> {
    const { data, error } = await supabase.rpc('get_public_stats');
    if (error) throw new Error(error.message);
    // RPC returns a JSON object; default to zeros if Supabase returns null.
    return (data as any) || { totalSubmissions: 0, distinctIndustries: 0, totalRevenue: 0 };
  },

  async updateSubmissionStatus(id: string, status: 'approved' | 'rejected'): Promise<void> {
    const { error } = await supabase.from('submissions').update({ status }).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async deleteSubmission(id: string): Promise<void> {
    const { error } = await supabase.from('submissions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ─── Settings ────────────────────────────────────────────────────────────

  async getWebhookUrl(): Promise<string> {
    const { data } = await supabase.from('settings').select('value').eq('key', 'webhookUrl').single();
    return data?.value || '';
  },

  async setWebhookUrl(url: string): Promise<void> {
    const { error } = await supabase.from('settings').upsert({ key: 'webhookUrl', value: url });
    if (error) throw new Error(error.message);
  },

  async getAdminEmails(): Promise<string[]> {
    const { data } = await supabase.from('settings').select('value').eq('key', 'adminEmails').single();
    if (!data?.value) return [...INITIAL_ADMINS];
    try { return JSON.parse(data.value); } catch { return [...INITIAL_ADMINS]; }
  },

  async addAdminEmail(email: string): Promise<void> {
    const normalized = email.toLowerCase();
    const emails = await api.getAdminEmails();
    if (!emails.map(e => e.toLowerCase()).includes(normalized)) {
      emails.push(normalized);
      const { error: settingsErr } = await supabase
        .from('settings')
        .upsert({ key: 'adminEmails', value: JSON.stringify(emails) });
      if (settingsErr) throw new Error(settingsErr.message);
    }
    // Promote existing profile via SECURITY DEFINER RPC. Direct UPDATE
    // would silently affect 0 rows under non-self profiles RLS.
    const { error: rpcErr } = await supabase.rpc('promote_to_admin', { target_email: normalized });
    if (rpcErr) throw new Error(rpcErr.message);
  },

  async removeAdminEmail(email: string): Promise<void> {
    const normalized = email.toLowerCase();
    const emails = await api.getAdminEmails();
    const filtered = emails.filter(e => e.toLowerCase() !== normalized);
    const { error: settingsErr } = await supabase
      .from('settings')
      .upsert({ key: 'adminEmails', value: JSON.stringify(filtered) });
    if (settingsErr) throw new Error(settingsErr.message);
    const { error: rpcErr } = await supabase.rpc('demote_from_admin', { target_email: normalized });
    if (rpcErr) throw new Error(rpcErr.message);
  },

  // ─── Chat sessions (Taxi) ────────────────────────────────────────────────
  //
  // RLS scopes every read/write to auth.uid() = user_id, so callers don't
  // need to pass the user id — Supabase will only return the caller's rows.
  // Storage shape: messages is jsonb, an array of ChatMessage objects.

  async getChatSessions(): Promise<import('../pages/Taxi.helpers').Session[]> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return [];
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('id, title, created_at, updated_at, messages')
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(row => ({
      id: row.id as string,
      title: row.title as string,
      createdAt: new Date(row.created_at as string).getTime(),
      updatedAt: new Date(row.updated_at as string).getTime(),
      messages: (row.messages as any[]) || [],
    }));
  },

  async createChatSession(session: import('../pages/Taxi.helpers').Session): Promise<void> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error('Must be logged in');
    const { error } = await supabase.from('chat_sessions').insert({
      id: session.id,
      user_id: authUser.id,
      title: session.title,
      created_at: new Date(session.createdAt).toISOString(),
      updated_at: new Date(session.updatedAt).toISOString(),
      messages: session.messages,
    });
    if (error) throw new Error(error.message);
  },

  async updateChatSession(
    id: string,
    patch: Partial<Pick<import('../pages/Taxi.helpers').Session, 'title' | 'messages' | 'updatedAt'>>
  ): Promise<void> {
    const update: Record<string, unknown> = {};
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.messages !== undefined) update.messages = patch.messages;
    if (patch.updatedAt !== undefined) update.updated_at = new Date(patch.updatedAt).toISOString();
    const { error } = await supabase.from('chat_sessions').update(update).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async deleteChatSession(id: string): Promise<void> {
    const { error } = await supabase.from('chat_sessions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ─── Notify Me ───────────────────────────────────────────────────────────

  async subscribeDirectTaxNotify(): Promise<void> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    await supabase.from('notifications').upsert({
      user_id: authUser.id,
      type: 'directtax_launch',
    });
  },

  async getDirectTaxNotify(): Promise<boolean> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return false;
    const { data } = await supabase
      .from('notifications')
      .select('user_id')
      .eq('user_id', authUser.id)
      .eq('type', 'directtax_launch')
      .single();
    return !!data;
  },

  /**
   * Downloads all *approved* submissions as a CSV file. Admin-only feature —
   * intended for offline analysis in Excel or BI tools.
   */
  async exportApprovedSubmissionsCsv(): Promise<{ count: number; filename: string }> {
    const subs = await api.getSubmissions();
    const approved = subs.filter(s => s.status === 'approved');
    if (approved.length === 0) {
      throw new Error('No approved submissions to export.');
    }
    const csv = submissionsToCsv(approved);
    const filename = `benchmark_submissions_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(csv, filename);
    return { count: approved.length, filename };
  },

  // ─── Data Portability ────────────────────────────────────────────────────

  async exportDatabase(): Promise<void> {
    const [submissions, adminEmails, webhookUrl] = await Promise.all([
      api.getSubmissions(),
      api.getAdminEmails(),
      api.getWebhookUrl(),
    ]);
    const blob = new Blob(
      [JSON.stringify({ submissions, settings: { webhookUrl, adminEmails } }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'benchmark_full_db.json';
    link.click();
  },

  async importDatabase(file: File): Promise<boolean> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          if (data.submissions?.length) {
            const { error: delErr } = await supabase.from('submissions').delete().not('id', 'is', null);
            if (delErr) { console.error('[importDatabase] delete error:', delErr); resolve(false); return; }
            // Insert one at a time to handle potential conflicts
            for (const sub of data.submissions) {
              const { error: insErr } = await supabase.from('submissions').upsert(sub);
              if (insErr) console.error('[importDatabase] upsert error:', insErr, sub.id);
            }
          }
          if (data.settings?.adminEmails) {
            const { error } = await supabase.from('settings').upsert({ key: 'adminEmails', value: JSON.stringify(data.settings.adminEmails) });
            if (error) console.error('[importDatabase] adminEmails error:', error);
          }
          if (data.settings?.webhookUrl !== undefined) {
            const { error } = await supabase.from('settings').upsert({ key: 'webhookUrl', value: data.settings.webhookUrl });
            if (error) console.error('[importDatabase] webhookUrl error:', error);
          }
          resolve(true);
        } catch (err) {
          console.error('[importDatabase] parse error:', err);
          resolve(false);
        }
      };
      reader.readAsText(file);
    });
  },
};
