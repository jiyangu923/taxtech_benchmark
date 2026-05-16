import React, { useMemo, useState } from 'react';
import {
  Users, UserPlus, Linkedin, CheckCircle2, Clock, XCircle,
  Trash2, Edit2, Save, X, AlertCircle, Loader2, RotateCcw, Mail, Send,
} from 'lucide-react';
import {
  useAllCommunityMembers, useCreateCommunityMember,
  useUpdateCommunityMember, useDeleteCommunityMember,
  useSendCommunityInvite,
} from '../services/queries';
import type { CommunityMember, CommunityMemberDraft, CommunityMemberStatus } from '../types';
import {
  STATUS_LABELS, STATUS_BADGE_CLASSES, initialsFromName,
  nextStatusOnAction, normalizeUrl, isValidEmail,
  type CommunityAction,
} from './Admin.community.helpers';

const FILTERS: Array<{ key: CommunityMemberStatus | 'all'; label: string }> = [
  { key: 'all',       label: 'All' },
  { key: 'pending',   label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'declined',  label: 'Declined' },
];

const emptyDraft: CommunityMemberDraft = {
  email: '',
  name: '',
  role: '',
  company: '',
  company_logo_url: '',
  linkedin_url: '',
  photo_url: '',
};

const AdminCommunity: React.FC = () => {
  const { data: members = [], isLoading, error } = useAllCommunityMembers();
  const createMutation = useCreateCommunityMember();
  const updateMutation = useUpdateCommunityMember();
  const deleteMutation = useDeleteCommunityMember();
  const sendInviteMutation = useSendCommunityInvite();

  const [filter, setFilter] = useState<CommunityMemberStatus | 'all'>('all');
  const [draft, setDraft] = useState<CommunityMemberDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<CommunityMemberDraft>(emptyDraft);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const counts = useMemo(() => {
    const c: Record<CommunityMemberStatus | 'all', number> = {
      all: members.length, pending: 0, confirmed: 0, declined: 0,
    };
    for (const m of members) c[m.status] += 1;
    return c;
  }, [members]);

  const visible = useMemo(() => {
    if (filter === 'all') return members;
    return members.filter(m => m.status === filter);
  }, [members, filter]);

  const flash = (kind: 'success' | 'error', text: string) => {
    setMessage({ kind, text });
    setTimeout(() => setMessage(curr => (curr?.text === text ? null : curr)), 4000);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(draft.email)) {
      flash('error', 'Enter a valid email address.');
      return;
    }
    if (!draft.name.trim()) {
      flash('error', 'Name is required.');
      return;
    }
    const payload: CommunityMemberDraft = {
      email: draft.email.trim().toLowerCase(),
      name: draft.name.trim(),
      role: (draft.role || '').trim() || null,
      company: (draft.company || '').trim() || null,
      company_logo_url: normalizeUrl(draft.company_logo_url),
      linkedin_url: normalizeUrl(draft.linkedin_url),
      photo_url: normalizeUrl(draft.photo_url),
    };
    createMutation.mutate(payload, {
      onSuccess: () => {
        flash('success', `Added ${payload.name} (pending).`);
        setDraft(emptyDraft);
      },
      onError: (err: any) => flash('error', err?.message || 'Could not add member.'),
    });
  };

  const startEdit = (m: CommunityMember) => {
    setEditingId(m.id);
    setEditDraft({
      email: m.email,
      name: m.name,
      role: m.role || '',
      company: m.company || '',
      company_logo_url: m.company_logo_url || '',
      linkedin_url: m.linkedin_url || '',
      photo_url: m.photo_url || '',
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    if (!isValidEmail(editDraft.email)) {
      flash('error', 'Enter a valid email address.');
      return;
    }
    if (!editDraft.name.trim()) {
      flash('error', 'Name is required.');
      return;
    }
    const patch: Partial<CommunityMemberDraft> = {
      email: editDraft.email.trim().toLowerCase(),
      name: editDraft.name.trim(),
      role: (editDraft.role || '').trim() || null,
      company: (editDraft.company || '').trim() || null,
      company_logo_url: normalizeUrl(editDraft.company_logo_url),
      linkedin_url: normalizeUrl(editDraft.linkedin_url),
      photo_url: normalizeUrl(editDraft.photo_url),
    };
    updateMutation.mutate({ id: editingId, patch }, {
      onSuccess: () => {
        flash('success', 'Member updated.');
        setEditingId(null);
      },
      onError: (err: any) => flash('error', err?.message || 'Could not save changes.'),
    });
  };

  const handleStatusChange = (m: CommunityMember, action: CommunityAction) => {
    const next = nextStatusOnAction(m.status, action);
    if (next === m.status) return;
    updateMutation.mutate({ id: m.id, patch: { status: next } }, {
      onSuccess: () => flash('success', `${m.name} → ${STATUS_LABELS[next]}.`),
      onError: (err: any) => flash('error', err?.message || 'Could not update status.'),
    });
  };

  const handleDelete = (m: CommunityMember) => {
    if (!window.confirm(`Permanently delete ${m.name} (${m.email}) from the community list? Cannot be undone.`)) return;
    deleteMutation.mutate(m.id, {
      onSuccess: () => flash('success', `Deleted ${m.name}.`),
      onError: (err: any) => flash('error', err?.message || 'Could not delete.'),
    });
  };

  const handleSendInvite = (m: CommunityMember) => {
    sendInviteMutation.mutate(m.id, {
      onSuccess: () => flash('success', `Invite sent to ${m.email}.`),
      onError: (err: any) => flash('error', err?.message || 'Could not send invite.'),
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 flex items-center justify-center text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading community members…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-3xl p-8 flex items-start gap-4">
        <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-red-900">Could not load community members</h3>
          <p className="text-sm text-red-800 mt-1 font-medium">{(error as Error).message}</p>
          <p className="text-xs text-red-700 mt-3 font-medium">
            Did you run <code className="font-mono bg-red-100 px-1.5 py-0.5 rounded">supabase/add_community_members_table.sql</code>?
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {message && (
        <div
          className={`rounded-2xl border p-4 flex items-center gap-3 text-sm font-medium ${
            message.kind === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message.kind === 'success' ? <CheckCircle2 className="h-5 w-5 flex-shrink-0" /> : <AlertCircle className="h-5 w-5 flex-shrink-0" />}
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto text-xs font-bold uppercase tracking-widest opacity-60 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* Add member form */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-indigo-50 p-2 rounded-lg"><UserPlus className="h-5 w-5 text-primary" /></div>
          <div>
            <h3 className="font-display text-lg font-semibold text-gray-900">Add a member</h3>
            <p className="text-xs text-gray-500 mt-0.5 font-medium">
              New members start as <strong>Pending</strong>. Use <strong>Send invite</strong> to email them a confirmation link, or flip the status manually if you've already collected consent another way.
            </p>
          </div>
        </div>
        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name *">
            <input
              required
              type="text"
              value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value })}
              placeholder="Ada Lovelace"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
            />
          </Field>
          <Field label="Email *">
            <input
              required
              type="email"
              value={draft.email}
              onChange={e => setDraft({ ...draft, email: e.target.value })}
              placeholder="ada@example.com"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
            />
          </Field>
          <Field label="Role">
            <input
              type="text"
              value={draft.role || ''}
              onChange={e => setDraft({ ...draft, role: e.target.value })}
              placeholder="VP of Tax Technology"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
            />
          </Field>
          <Field label="Company">
            <input
              type="text"
              value={draft.company || ''}
              onChange={e => setDraft({ ...draft, company: e.target.value })}
              placeholder="Acme Corp"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
            />
          </Field>
          <Field label="LinkedIn URL">
            <input
              type="text"
              value={draft.linkedin_url || ''}
              onChange={e => setDraft({ ...draft, linkedin_url: e.target.value })}
              placeholder="linkedin.com/in/ada"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
            />
          </Field>
          <Field label="Company Logo URL (auto-derived on confirm)">
            <input
              type="text"
              value={draft.company_logo_url || ''}
              onChange={e => setDraft({ ...draft, company_logo_url: e.target.value })}
              placeholder="Leave blank — server derives a favicon from the email or company name"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
            />
          </Field>
          <Field label="Photo URL">
            <input
              type="text"
              value={draft.photo_url || ''}
              onChange={e => setDraft({ ...draft, photo_url: e.target.value })}
              placeholder="https://… or use Send invite + member uploads"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
            />
          </Field>
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-indigo-900 disabled:opacity-60 transition-all active:scale-95"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {createMutation.isPending ? 'Adding…' : 'Add member'}
            </button>
          </div>
        </form>
      </div>

      {/* Filter pills */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex flex-wrap gap-2">
        {FILTERS.map(opt => {
          const isActive = filter === opt.key;
          const count = counts[opt.key];
          return (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                isActive ? 'bg-primary text-white shadow-sm' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {opt.label}
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Members list */}
      {visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <Users className="h-10 w-10 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">
            {filter === 'all'
              ? 'No community members yet. Add the first one using the form above.'
              : `Nothing in "${STATUS_LABELS[filter as CommunityMemberStatus]}" right now.`}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map(m => (
            <MemberRow
              key={m.id}
              member={m}
              isEditing={editingId === m.id}
              editDraft={editDraft}
              onStartEdit={() => startEdit(m)}
              onCancelEdit={() => setEditingId(null)}
              onEditChange={setEditDraft}
              onSaveEdit={saveEdit}
              onStatusChange={(action) => handleStatusChange(m, action)}
              onDelete={() => handleDelete(m)}
              onSendInvite={() => handleSendInvite(m)}
              busy={updateMutation.isPending || deleteMutation.isPending}
              invitePending={sendInviteMutation.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{label}</span>
    {children}
  </label>
);

interface RowProps {
  member: CommunityMember;
  isEditing: boolean;
  editDraft: CommunityMemberDraft;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEditChange: (d: CommunityMemberDraft) => void;
  onSaveEdit: () => void;
  onStatusChange: (action: CommunityAction) => void;
  onDelete: () => void;
  onSendInvite: () => void;
  busy: boolean;
  invitePending: boolean;
}

const MemberRow: React.FC<RowProps> = ({
  member: m, isEditing, editDraft, onStartEdit, onCancelEdit,
  onEditChange, onSaveEdit, onStatusChange, onDelete, onSendInvite, busy, invitePending,
}) => {
  // Invite state derived from the row, not held in component state — the
  // admin tab refreshes via React Query invalidation after sending.
  const now = Date.now();
  const expiresAtMs = m.confirm_token_expires_at ? new Date(m.confirm_token_expires_at).getTime() : null;
  const inviteSent = !!m.invited_at;
  const inviteExpired = expiresAtMs !== null && expiresAtMs < now;
  const inviteActive = inviteSent && !inviteExpired && m.status === 'pending';
  return (
    <li className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {m.photo_url ? (
            <img
              src={m.photo_url}
              alt={m.name}
              className="h-14 w-14 rounded-full object-cover border border-gray-200"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="h-14 w-14 rounded-full bg-indigo-50 text-primary flex items-center justify-center font-bold text-sm border border-indigo-100">
              {initialsFromName(m.name)}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Name">
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={editDraft.name} onChange={e => onEditChange({ ...editDraft, name: e.target.value })} />
              </Field>
              <Field label="Email">
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={editDraft.email} onChange={e => onEditChange({ ...editDraft, email: e.target.value })} />
              </Field>
              <Field label="Role">
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={editDraft.role || ''} onChange={e => onEditChange({ ...editDraft, role: e.target.value })} />
              </Field>
              <Field label="Company">
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={editDraft.company || ''} onChange={e => onEditChange({ ...editDraft, company: e.target.value })} />
              </Field>
              <Field label="LinkedIn URL">
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={editDraft.linkedin_url || ''} onChange={e => onEditChange({ ...editDraft, linkedin_url: e.target.value })} />
              </Field>
              <Field label="Company Logo URL (auto-derived on confirm)">
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={editDraft.company_logo_url || ''} onChange={e => onEditChange({ ...editDraft, company_logo_url: e.target.value })} placeholder="Leave blank to use the server-derived favicon" />
              </Field>
              <Field label="Photo URL">
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={editDraft.photo_url || ''} onChange={e => onEditChange({ ...editDraft, photo_url: e.target.value })} />
              </Field>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-base font-semibold text-gray-900">{m.name}</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${STATUS_BADGE_CLASSES[m.status]}`}>
                  {STATUS_LABELS[m.status]}
                </span>
              </div>
              {(m.role || m.company) && (
                <p className="mt-0.5 text-sm text-gray-600 font-medium">
                  {[m.role, m.company].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1.5 font-mono">
                  <Mail className="h-3.5 w-3.5" /> {m.email}
                </span>
                {m.linkedin_url && (
                  <a href={m.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-primary">
                    <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                  </a>
                )}
                <span className="text-gray-400">Added {new Date(m.created_at).toLocaleDateString()}</span>
                {inviteActive && expiresAtMs !== null && (
                  <span className="text-amber-acc-2 font-semibold">Invite sent · expires {new Date(expiresAtMs).toLocaleDateString()}</span>
                )}
                {inviteSent && inviteExpired && m.status === 'pending' && (
                  <span className="text-red-600 font-semibold">Invite expired</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {isEditing ? (
          <>
            <button onClick={onSaveEdit} disabled={busy} className="inline-flex items-center gap-2 px-3.5 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-indigo-900 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </button>
            <button onClick={onCancelEdit} className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100">
              <X className="h-4 w-4" /> Cancel
            </button>
          </>
        ) : (
          <>
            <button onClick={onStartEdit} className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100">
              <Edit2 className="h-4 w-4" /> Edit
            </button>
            {m.status !== 'confirmed' && (
              <button onClick={onSendInvite} disabled={invitePending} className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-sm font-semibold text-primary hover:bg-indigo-100 disabled:opacity-60">
                {invitePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {inviteActive ? 'Resend invite' : inviteSent && inviteExpired ? 'Send new invite' : 'Send invite'}
              </button>
            )}
            {m.status !== 'confirmed' && (
              <button onClick={() => onStatusChange('confirm')} disabled={busy} className="inline-flex items-center gap-2 px-3.5 py-2 bg-green-50 border border-green-200 rounded-lg text-sm font-semibold text-green-800 hover:bg-green-100 disabled:opacity-60">
                <CheckCircle2 className="h-4 w-4" /> Mark confirmed
              </button>
            )}
            {m.status !== 'declined' && (
              <button onClick={() => onStatusChange('decline')} disabled={busy} className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60">
                <XCircle className="h-4 w-4" /> Mark declined
              </button>
            )}
            {m.status !== 'pending' && (
              <button onClick={() => onStatusChange('reset')} disabled={busy} className="inline-flex items-center gap-2 px-3.5 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60">
                <RotateCcw className="h-4 w-4" /> Back to pending
              </button>
            )}
            <button onClick={onDelete} disabled={busy} className="inline-flex items-center gap-2 px-3.5 py-2 ml-auto bg-red-50 border border-red-200 rounded-lg text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </>
        )}
      </div>

      {m.status === 'pending' && !isEditing && (
        <p className="mt-3 text-xs text-amber-800 font-medium flex items-start gap-2">
          <Clock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          Not visible on /community yet. Mark confirmed once consent is received.
        </p>
      )}
    </li>
  );
};

export default AdminCommunity;
