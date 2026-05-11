import React, { useMemo, useRef, useState } from 'react';
import {
  Mail, Plus, Send, ImagePlus, FileText, Eye, Save, Trash2, Loader2, AlertCircle, CheckCircle2, ArrowLeft, Calendar, Sparkles,
} from 'lucide-react';
import {
  useReleaseLetters,
  useCreateReleaseLetter,
  useUpdateReleaseLetter,
  useDeleteReleaseLetter,
  useUploadReleaseImage,
  useSendReleaseLetter,
} from '../services/queries';
import { ReleaseLetter, ReleaseLetterDraft, ReleaseLetterStatus } from '../types';
import { markdownToHtml } from '../services/markdown';

/**
 * Admin → Releases tab.
 *
 * List view: all past letters with status + sent count.
 * Edit view: title + week_of date + markdown body editor with live preview
 *            and inline image upload (drag-drop or file picker).
 * Send: "Send test to me" (admin's own email) and "Broadcast" (all opted-in users).
 *
 * The actual email send happens server-side in /api/admin/send-release-letter.
 */
const AdminReleases: React.FC = () => {
  const { data: letters = [], isLoading } = useReleaseLetters();
  const [editingId, setEditingId] = useState<string | null | 'new'>(null);

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 flex items-center justify-center text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading release letters…
      </div>
    );
  }

  if (editingId !== null) {
    return <LetterEditor letterId={editingId} onClose={() => setEditingId(null)} letters={letters} />;
  }
  return <LetterList letters={letters} onNew={() => setEditingId('new')} onEdit={setEditingId} />;
};

const LetterList: React.FC<{ letters: ReleaseLetter[]; onNew: () => void; onEdit: (id: string) => void }> = ({ letters, onNew, onEdit }) => (
  <div className="space-y-6 animate-fadeIn">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs text-gray-500 font-medium">
          Weekly product update emails. Sent to all signed-up users (opted in via /profile).
        </p>
      </div>
      <button onClick={onNew} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl font-bold shadow-sm hover:bg-indigo-900 transition-all">
        <Plus className="h-4 w-4" /> New Release Letter
      </button>
    </div>

    {letters.length === 0 ? (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
        <Mail className="h-10 w-10 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 font-medium">No release letters yet. Click <strong>New Release Letter</strong> to start one.</p>
      </div>
    ) : (
      <ul className="space-y-3">
        {letters.map(l => (
          <li key={l.id}>
            <button onClick={() => onEdit(l.id)} className="w-full text-left bg-white border border-gray-200 hover:border-indigo-200 rounded-2xl p-5 flex items-center justify-between gap-4 transition-colors">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <StatusBadge status={l.status} />
                  <span className="text-xs text-gray-400 font-medium">
                    Week of {new Date(l.week_of + 'T00:00:00').toLocaleDateString()}
                  </span>
                  {l.sent_at && (
                    <span className="text-xs text-gray-400 font-medium">
                      • Sent {new Date(l.sent_at).toLocaleDateString()} to {l.sent_count} recipients
                    </span>
                  )}
                </div>
                <p className="font-display text-lg font-semibold text-gray-900 truncate">{l.title}</p>
              </div>
              <FileText className="h-5 w-5 text-gray-300 flex-shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const StatusBadge: React.FC<{ status: ReleaseLetterStatus }> = ({ status }) => {
  const cls = status === 'sent'
    ? 'bg-green-50 text-green-700 border-green-100'
    : 'bg-amber-50 text-amber-700 border-amber-100';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${cls}`}>
      {status === 'sent' ? 'Sent' : 'Draft'}
    </span>
  );
};

interface EditorProps {
  letterId: string | 'new';
  letters: ReleaseLetter[];
  onClose: () => void;
}

const LetterEditor: React.FC<EditorProps> = ({ letterId, letters, onClose }) => {
  const existing = letterId !== 'new' ? letters.find(l => l.id === letterId) : null;
  const isReadOnly = existing?.status === 'sent';

  const [title,        setTitle]        = useState(existing?.title         ?? `Week of ${formatToday()}`);
  const [weekOf,       setWeekOf]       = useState(existing?.week_of       ?? formatToday());
  const [bodyMarkdown, setBodyMarkdown] = useState(existing?.body_markdown ?? defaultBodyTemplate());
  const [view,         setView]         = useState<'edit' | 'preview'>('edit');
  const [actionMsg,    setActionMsg]    = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const create   = useCreateReleaseLetter();
  const update   = useUpdateReleaseLetter();
  const remove   = useDeleteReleaseLetter();
  const upload   = useUploadReleaseImage();
  const send     = useSendReleaseLetter();

  const handleSave = async (): Promise<string | null> => {
    const draft: ReleaseLetterDraft = { title, week_of: weekOf, body_markdown: bodyMarkdown };
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, patch: draft });
        setActionMsg({ kind: 'success', text: 'Saved.' });
        return existing.id;
      } else {
        const created = await create.mutateAsync(draft);
        setActionMsg({ kind: 'success', text: 'Draft created.' });
        return created.id;
      }
    } catch (e: any) {
      setActionMsg({ kind: 'error', text: e?.message || 'Save failed.' });
      return null;
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setActionMsg({ kind: 'error', text: 'Only image files are allowed.' });
      return;
    }
    try {
      const url = await upload.mutateAsync(file);
      // Insert markdown image at cursor
      const ta = textareaRef.current;
      const insert = `\n\n![${file.name.replace(/\.[^.]+$/, '')}](${url})\n\n`;
      if (ta) {
        const start = ta.selectionStart;
        const next = bodyMarkdown.slice(0, start) + insert + bodyMarkdown.slice(start);
        setBodyMarkdown(next);
        // Restore cursor after inserted text
        setTimeout(() => {
          ta.focus();
          ta.setSelectionRange(start + insert.length, start + insert.length);
        }, 0);
      } else {
        setBodyMarkdown(prev => prev + insert);
      }
      setActionMsg({ kind: 'success', text: `Uploaded "${file.name}" — embedded at cursor.` });
    } catch (e: any) {
      setActionMsg({ kind: 'error', text: e?.message || 'Upload failed.' });
    }
  };

  const handleSend = async (mode: 'test' | 'broadcast') => {
    if (mode === 'broadcast') {
      const ok = window.confirm('Broadcast this letter to ALL signed-up users (including admins, respecting email-reminder opt-outs)? This cannot be undone.');
      if (!ok) return;
    }
    const id = existing ? existing.id : await handleSave();
    if (!id) return;
    try {
      const result = await send.mutateAsync({ letterId: id, mode });
      setActionMsg({
        kind: result.failed > 0 ? 'error' : 'success',
        text: mode === 'test'
          ? `Test sent to your email (${result.sent} delivered, ${result.failed} failed).`
          : `Broadcast sent: ${result.sent} delivered, ${result.failed} failed.`,
      });
    } catch (e: any) {
      setActionMsg({ kind: 'error', text: e?.message || 'Send failed.' });
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    const ok = window.confirm(`Delete this release letter? Cannot be undone.`);
    if (!ok) return;
    try {
      await remove.mutateAsync(existing.id);
      onClose();
    } catch (e: any) {
      setActionMsg({ kind: 'error', text: e?.message || 'Delete failed.' });
    }
  };

  const renderedHtml = useMemo(() => markdownToHtml(bodyMarkdown), [bodyMarkdown]);

  return (
    <div className="space-y-6 animate-fadeIn">
      <button onClick={onClose} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> Back to letters
      </button>

      {actionMsg && (
        <div
          className={`rounded-2xl border p-4 flex items-center gap-3 text-sm font-medium ${
            actionMsg.kind === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {actionMsg.kind === 'success' ? <CheckCircle2 className="h-5 w-5 flex-shrink-0" /> : <AlertCircle className="h-5 w-5 flex-shrink-0" />}
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} className="ml-auto text-xs font-bold uppercase tracking-widest opacity-60 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* Metadata */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          {existing ? <StatusBadge status={existing.status} /> : <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-0.5 rounded-full">New draft</span>}
          {isReadOnly && <span className="text-xs text-gray-500 font-medium italic">(read-only — already sent)</span>}
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            disabled={isReadOnly}
            placeholder="Week of …"
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-base font-semibold outline-none disabled:opacity-60"
            maxLength={140}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
            <Calendar className="h-3 w-3" /> Week of
          </label>
          <input
            type="date"
            value={weekOf}
            onChange={e => setWeekOf(e.target.value)}
            disabled={isReadOnly}
            className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-sm font-medium outline-none disabled:opacity-60"
          />
        </div>
      </div>

      {/* Editor / Preview tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200 flex items-center justify-between px-2">
          <div className="flex">
            <button
              onClick={() => setView('edit')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-bold transition-colors border-b-2 ${
                view === 'edit' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}
            >
              <FileText className="h-4 w-4" /> Edit
            </button>
            <button
              onClick={() => setView('preview')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-bold transition-colors border-b-2 ${
                view === 'preview' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}
            >
              <Eye className="h-4 w-4" /> Preview
            </button>
          </div>
          {!isReadOnly && (
            <div className="flex items-center gap-2 pr-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                  e.target.value = ''; // reset for next upload
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={upload.isPending}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-60"
              >
                {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                Upload image
              </button>
            </div>
          )}
        </div>

        {view === 'edit' ? (
          <textarea
            ref={textareaRef}
            value={bodyMarkdown}
            onChange={e => setBodyMarkdown(e.target.value)}
            disabled={isReadOnly}
            rows={24}
            className="w-full px-6 py-5 outline-none font-mono text-sm leading-relaxed resize-y disabled:opacity-60 bg-white"
            placeholder="Write your release letter in markdown…"
          />
        ) : (
          <div className="px-6 py-6 max-w-3xl mx-auto">
            {bodyMarkdown.trim() ? (
              <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
            ) : (
              <p className="text-sm text-gray-400 italic">Nothing to preview — write something on the Edit tab.</p>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {!isReadOnly && (
          <button
            onClick={() => handleSave()}
            disabled={create.isPending || update.isPending}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> Save draft
          </button>
        )}
        <button
          onClick={() => handleSend('test')}
          disabled={send.isPending}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl font-bold text-sm text-amber-800 hover:bg-amber-100 disabled:opacity-60"
        >
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Send test to me
        </button>
        <button
          onClick={() => handleSend('broadcast')}
          disabled={send.isPending || isReadOnly}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-indigo-900 transition-all disabled:opacity-60"
        >
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {isReadOnly ? 'Already broadcast' : 'Broadcast to all users'}
        </button>
        {existing && (
          <button onClick={handleDelete} disabled={remove.isPending} className="inline-flex items-center gap-2 px-3.5 py-2.5 ml-auto bg-red-50 border border-red-200 rounded-xl text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400 font-medium text-center pt-2">
        "Send test" delivers only to your own email so you can preview the rendering. Broadcast goes to every signed-up user (including admins) who hasn't opted out of email reminders via /profile.
      </p>
    </div>
  );
};

function formatToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultBodyTemplate(): string {
  return `Hi everyone,

Quick weekly update on what's new in benchmarktax.

## What shipped this week

- **Feature one** — short description of why this matters to you.
- **Feature two** — what changed and how to find it.

## Coming next

A sentence about what's queued for next week.

---

Have feedback? Click the **Feedback** button in the bottom-right of any page on [taxbenchmark.ai](https://taxbenchmark.ai).
`;
}

export default AdminReleases;
