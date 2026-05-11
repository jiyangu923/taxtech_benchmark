import React, { useMemo, useState } from 'react';
import {
  MessageSquare, Bug, Lightbulb, MessageCircle, CheckCircle2, Clock, Archive, Trash2, Copy, Sparkles, Loader2, AlertCircle, RotateCcw,
} from 'lucide-react';
import { useAllFeedback, useUpdateFeedbackStatus, useDeleteFeedback } from '../services/queries';
import { Feedback, FeedbackStatus, FeedbackType } from '../types';
import {
  STATUS_LABELS, TYPE_LABELS, feedbackToClaudePrompt, nextStatusOnAction,
} from './Admin.feedback.helpers';

const TYPE_ICONS: Record<FeedbackType, React.ReactNode> = {
  bug:     <Bug className="h-3.5 w-3.5 text-red-600" />,
  feature: <Lightbulb className="h-3.5 w-3.5 text-amber-acc" />,
  general: <MessageCircle className="h-3.5 w-3.5 text-sky-500" />,
};

const STATUS_BADGES: Record<FeedbackStatus, string> = {
  new:      'bg-indigo-50 text-primary border-indigo-100',
  triaged:  'bg-amber-50 text-amber-700 border-amber-100',
  resolved: 'bg-green-50 text-green-700 border-green-100',
  archived: 'bg-gray-50 text-gray-500 border-gray-200',
};

const FILTERS: Array<{ key: FeedbackStatus | 'all'; label: string }> = [
  { key: 'all',      label: 'All' },
  { key: 'new',      label: 'New' },
  { key: 'triaged',  label: 'Triaged' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'archived', label: 'Archived' },
];

const AdminFeedback: React.FC = () => {
  const { data: feedback = [], isLoading, error } = useAllFeedback();
  const updateStatus = useUpdateFeedbackStatus();
  const deleteFeedback = useDeleteFeedback();
  const [filter, setFilter] = useState<FeedbackStatus | 'all'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const counts = useMemo(() => {
    const c: Record<FeedbackStatus | 'all', number> = { all: feedback.length, new: 0, triaged: 0, resolved: 0, archived: 0 };
    for (const f of feedback) c[f.status] += 1;
    return c;
  }, [feedback]);

  const visible = useMemo(() => {
    if (filter === 'all') return feedback;
    return feedback.filter(f => f.status === filter);
  }, [feedback, filter]);

  const handleCopyPrompt = async (f: Feedback) => {
    try {
      await navigator.clipboard.writeText(feedbackToClaudePrompt(f));
      setCopiedId(f.id);
      setTimeout(() => setCopiedId(curr => (curr === f.id ? null : curr)), 2000);
    } catch {
      setActionMessage({ kind: 'error', text: 'Could not copy to clipboard.' });
    }
  };

  const handleCopyMessage = async (f: Feedback) => {
    try {
      await navigator.clipboard.writeText(f.message);
      setCopiedId(`${f.id}-msg`);
      setTimeout(() => setCopiedId(curr => (curr === `${f.id}-msg` ? null : curr)), 2000);
    } catch {
      setActionMessage({ kind: 'error', text: 'Could not copy to clipboard.' });
    }
  };

  const handleStatusChange = (f: Feedback, action: 'triage' | 'resolve' | 'archive' | 'reopen') => {
    const next = nextStatusOnAction(f.status, action);
    updateStatus.mutate({ id: f.id, status: next }, {
      onError: (e: any) => setActionMessage({ kind: 'error', text: e?.message || 'Could not update status.' }),
    });
  };

  const handleDelete = (f: Feedback) => {
    const ok = window.confirm(`Permanently delete this ${TYPE_LABELS[f.type].toLowerCase()} from ${f.user_name || f.user_email || 'anonymous'}? Cannot be undone.`);
    if (!ok) return;
    deleteFeedback.mutate(f.id, {
      onSuccess: () => setActionMessage({ kind: 'success', text: 'Feedback deleted.' }),
      onError: (e: any) => setActionMessage({ kind: 'error', text: e?.message || 'Could not delete.' }),
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 flex items-center justify-center text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading feedback…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-3xl p-8 flex items-start gap-4">
        <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-red-900">Could not load feedback</h3>
          <p className="text-sm text-red-800 mt-1 font-medium">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {actionMessage && (
        <div
          className={`rounded-2xl border p-4 flex items-center gap-3 text-sm font-medium ${
            actionMessage.kind === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {actionMessage.kind === 'success' ? <CheckCircle2 className="h-5 w-5 flex-shrink-0" /> : <AlertCircle className="h-5 w-5 flex-shrink-0" />}
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="ml-auto text-xs font-bold uppercase tracking-widest opacity-60 hover:opacity-100">Dismiss</button>
        </div>
      )}

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
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
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

      {visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <MessageSquare className="h-10 w-10 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">
            {filter === 'all'
              ? 'No feedback submitted yet. The widget is on every page — anyone can submit.'
              : `Nothing in "${STATUS_LABELS[filter as FeedbackStatus]}" right now.`}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {visible.map(f => (
            <FeedbackCard
              key={f.id}
              f={f}
              copiedId={copiedId}
              onCopyPrompt={() => handleCopyPrompt(f)}
              onCopyMessage={() => handleCopyMessage(f)}
              onStatusChange={(action) => handleStatusChange(f, action)}
              onDelete={() => handleDelete(f)}
              statusPending={updateStatus.isPending}
              deletePending={deleteFeedback.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

interface CardProps {
  f: Feedback;
  copiedId: string | null;
  onCopyPrompt: () => void;
  onCopyMessage: () => void;
  onStatusChange: (action: 'triage' | 'resolve' | 'archive' | 'reopen') => void;
  onDelete: () => void;
  statusPending: boolean;
  deletePending: boolean;
}

const FeedbackCard: React.FC<CardProps> = ({ f, copiedId, onCopyPrompt, onCopyMessage, onStatusChange, onDelete, statusPending, deletePending }) => {
  const promptCopied = copiedId === f.id;
  const msgCopied = copiedId === `${f.id}-msg`;
  return (
    <li className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-50 border border-gray-200 text-gray-700">
              {TYPE_ICONS[f.type]} {TYPE_LABELS[f.type]}
            </span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${STATUS_BADGES[f.status]}`}>
              {STATUS_LABELS[f.status]}
            </span>
            <span className="text-xs text-gray-400 font-medium">
              {new Date(f.created_at).toLocaleString()}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-gray-900">
            {f.user_name || f.user_email || <span className="italic text-gray-500">Anonymous</span>}
            {f.user_email && f.user_name && (
              <span className="font-mono text-xs text-gray-400 ml-2">{f.user_email}</span>
            )}
          </p>
          {f.page_path && (
            <p className="mt-1 text-xs text-gray-500 font-mono truncate">From: {f.page_path}</p>
          )}
        </div>
      </div>

      {/* Message */}
      <div className="bg-gray-50 rounded-xl p-4 mb-4 whitespace-pre-wrap text-sm text-gray-800 leading-relaxed font-medium">
        {f.message}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onCopyPrompt}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-sm font-semibold text-primary hover:bg-indigo-100"
          title="Copies a self-contained prompt — paste into a Claude Code session and ask Claude to investigate or fix."
        >
          {promptCopied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Sparkles className="h-4 w-4" />}
          {promptCopied ? 'Copied!' : 'Copy as Claude prompt'}
        </button>

        <button
          onClick={onCopyMessage}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100"
        >
          {msgCopied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          {msgCopied ? 'Copied!' : 'Copy message'}
        </button>

        {f.status === 'new' && (
          <button onClick={() => onStatusChange('triage')} disabled={statusPending} className="inline-flex items-center gap-2 px-3.5 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60">
            <Clock className="h-4 w-4" /> Mark triaged
          </button>
        )}
        {(f.status === 'new' || f.status === 'triaged') && (
          <button onClick={() => onStatusChange('resolve')} disabled={statusPending} className="inline-flex items-center gap-2 px-3.5 py-2 bg-green-50 border border-green-200 rounded-lg text-sm font-semibold text-green-800 hover:bg-green-100 disabled:opacity-60">
            <CheckCircle2 className="h-4 w-4" /> Resolve
          </button>
        )}
        {f.status !== 'archived' && f.status !== 'resolved' && (
          <button onClick={() => onStatusChange('archive')} disabled={statusPending} className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60">
            <Archive className="h-4 w-4" /> Archive
          </button>
        )}
        {(f.status === 'resolved' || f.status === 'archived') && (
          <button onClick={() => onStatusChange('reopen')} disabled={statusPending} className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60">
            <RotateCcw className="h-4 w-4" /> Reopen
          </button>
        )}
        <button onClick={onDelete} disabled={deletePending} className="inline-flex items-center gap-2 px-3.5 py-2 ml-auto bg-red-50 border border-red-200 rounded-lg text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60">
          <Trash2 className="h-4 w-4" /> Delete
        </button>
      </div>

      {f.user_agent && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-gray-400 font-mono hover:text-gray-600">User agent</summary>
          <p className="mt-2 text-xs text-gray-500 font-mono break-all">{f.user_agent}</p>
        </details>
      )}
    </li>
  );
};

export default AdminFeedback;
