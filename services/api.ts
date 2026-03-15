import { createClient } from '@supabase/supabase-js';
import { Submission, User } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
    const adminEmails = await api.getAdminEmails();
    const email = (authUser.email ?? '').toLowerCase();
    const role = adminEmails.map(e => e.toLowerCase()).includes(email) ? 'admin' : 'user';
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

  async createSubmission(data: Omit<Submission, 'id' | 'userId' | 'userName' | 'status' | 'submittedAt'>): Promise<Submission> {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error('Must be logged in');

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('id', authUser.id)
      .single();
    if (!profile) throw new Error('Profile not found');

    // Replace any prior submission from this user
    await supabase.from('submissions').delete().eq('userId', profile.id);

    const { data: sub, error } = await supabase
      .from('submissions')
      .insert({
        ...data,
        userId: profile.id,
        userName: profile.name,
        status: 'pending',
        submittedAt: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return sub as Submission;
  },

  async getSubmissions(): Promise<Submission[]> {
    const { data, error } = await supabase.from('submissions').select('*');
    if (error) throw new Error(error.message);
    return (data as Submission[]) || [];
  },

  async updateSubmissionStatus(id: string, status: 'approved' | 'rejected'): Promise<void> {
    const { error } = await supabase.from('submissions').update({ status }).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async deleteSubmission(id: string): Promise<void> {
    const { error } = await supabase.from('submissions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async deleteAllSubmissions(): Promise<void> {
    const { error } = await supabase.from('submissions').delete().not('id', 'is', null);
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
    const emails = await api.getAdminEmails();
    if (!emails.includes(email)) {
      emails.push(email);
      await supabase.from('settings').upsert({ key: 'adminEmails', value: JSON.stringify(emails) });
      // Upgrade role if user already exists
      await supabase.from('profiles').update({ role: 'admin' }).eq('email', email);
    }
  },

  async removeAdminEmail(email: string): Promise<void> {
    const emails = await api.getAdminEmails();
    const filtered = emails.filter(e => e !== email);
    await supabase.from('settings').upsert({ key: 'adminEmails', value: JSON.stringify(filtered) });
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
            await supabase.from('submissions').delete().not('id', 'is', null);
            await supabase.from('submissions').insert(data.submissions);
          }
          if (data.settings?.adminEmails) {
            await supabase.from('settings').upsert({ key: 'adminEmails', value: JSON.stringify(data.settings.adminEmails) });
          }
          if (data.settings?.webhookUrl !== undefined) {
            await supabase.from('settings').upsert({ key: 'webhookUrl', value: data.settings.webhookUrl });
          }
          resolve(true);
        } catch { resolve(false); }
      };
      reader.readAsText(file);
    });
  },
};
