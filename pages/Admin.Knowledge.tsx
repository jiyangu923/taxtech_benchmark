import React, { useState, useRef } from 'react';
import {
  BookOpen, Plus, Loader2, AlertCircle, CheckCircle2, Trash2, Edit2,
  Save, X, ExternalLink, EyeOff, Eye as EyeIcon,
  Wand2, Upload, Link2, ClipboardPaste,
} from 'lucide-react';
import {
  useKbArticles, useCreateKbArticle, useUpdateKbArticle, useDeleteKbArticle,
} from '../services/queries';
import { api } from '../services/api';
import type { KbArticle, KbArticleDraft } from '../types';

/**
 * Admin "Knowledge" tab — curated industry news for the AI analyst.
 * Published articles are injected into Taxi's cached system prompt (top 20
 * newest), so keep summaries short and factual. Drafts are admin-only.
 */

const emptyDraft: KbArticleDraft = {
  title: '',
  summary: '',
  source_url: '',
  tags: [],
  status: 'published',
};

/** "e-invoicing, VAT" → ['e-invoicing', 'VAT'] */
export function parseTags(input: string): string[] {
  return input.split(',').map(t => t.trim()).filter(Boolean);
}

/** An AI-extracted article candidate awaiting review. */
interface ExtractedItem {
  title: string;
  summary: string;
  tags: string[];
  effective_date: string | null;
  source_url: string | null;
}

type ImportMode = 'file' | 'url' | 'text';
// 3MB binary → ~4MB as base64 + JSON overhead, safely under Vercel's 4.5MB
// request-body limit (3.5MB binary would base64 to ~4.7MB and 413 at the
// platform edge before our handler ever runs).
const MAX_PDF_BYTES = 3 * 1024 * 1024;

function readFileAsText(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsText(f);
  });
}

function readFileAsBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(f);
  });
}

const AdminKnowledge: React.FC = () => {
  const { data: articles = [], isLoading, error } = useKbArticles();
  const createMutation = useCreateKbArticle();
  const updateMutation = useUpdateKbArticle();
  const deleteMutation = useDeleteKbArticle();

  const [draft, setDraft] = useState<KbArticleDraft>(emptyDraft);
  const [tagsInput, setTagsInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<KbArticleDraft>(emptyDraft);
  const [editTagsInput, setEditTagsInput] = useState('');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // AI import state
  const [importMode, setImportMode] = useState<ImportMode>('file');
  const [importUrl, setImportUrl] = useState('');
  const [importText, setImportText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flash = (kind: 'success' | 'error', text: string) => {
    setMessage({ kind, text });
    setTimeout(() => setMessage(curr => (curr?.text === text ? null : curr)), 4000);
  };

  const runExtraction = async (input: { text?: string; url?: string; pdfBase64?: string; filename?: string }) => {
    setExtracting(true);
    try {
      const { articles } = await api.ingestKbSource(input);
      if (articles.length === 0) {
        flash('error', 'No tax-relevant items found in that source.');
      } else {
        setExtracted(prev => [...articles, ...prev]);
        flash('success', `Extracted ${articles.length} item${articles.length === 1 ? '' : 's'} — review below, then add.`);
      }
    } catch (err: any) {
      flash('error', err?.message || 'Extraction failed.');
    } finally {
      setExtracting(false);
    }
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const name = f.name.toLowerCase();
    try {
      if (name.endsWith('.pdf')) {
        if (f.size > MAX_PDF_BYTES) {
          flash('error', 'PDF too large — keep uploads under 3MB (split larger documents).');
          return;
        }
        const pdfBase64 = await readFileAsBase64(f);
        await runExtraction({ pdfBase64, filename: f.name });
      } else if (name.endsWith('.txt') || name.endsWith('.md')) {
        const text = await readFileAsText(f);
        await runExtraction({ text });
      } else {
        flash('error', 'Supported files: .pdf, .txt, .md');
      }
    } catch (err: any) {
      flash('error', err?.message || 'Could not read the file.');
    }
  };

  const handleExtractClick = () => {
    if (importMode === 'file') { fileInputRef.current?.click(); return; }
    if (importMode === 'url') {
      if (!importUrl.trim()) { flash('error', 'Paste a URL first.'); return; }
      runExtraction({ url: importUrl.trim() });
    } else {
      if (importText.trim().length < 40) { flash('error', 'Paste at least a paragraph of text.'); return; }
      runExtraction({ text: importText });
    }
  };

  const addExtracted = async (item: ExtractedItem, status: 'draft' | 'published') => {
    try {
      await createMutation.mutateAsync({
        title: item.title,
        summary: item.summary,
        source_url: item.source_url,
        tags: item.tags,
        status,
        ...(item.effective_date ? { published_at: new Date(item.effective_date).toISOString() } : {}),
      });
      setExtracted(prev => prev.filter(x => x !== item));
      flash('success', status === 'published' ? 'Published — Taxi will use it on the next question.' : 'Added as draft.');
    } catch (err: any) {
      flash('error', err?.message || 'Could not add article.');
    }
  };

  const addAllExtracted = async (status: 'draft' | 'published') => {
    const items = [...extracted];
    for (const item of items) {
      // Sequential on purpose — keeps ordering stable and errors attributable.
      // eslint-disable-next-line no-await-in-loop
      await addExtracted(item, status);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim() || !draft.summary.trim()) {
      flash('error', 'Title and summary are required.');
      return;
    }
    createMutation.mutate(
      {
        title: draft.title.trim(),
        summary: draft.summary.trim(),
        source_url: (draft.source_url || '').trim() || null,
        tags: parseTags(tagsInput),
        status: draft.status,
      },
      {
        onSuccess: () => {
          flash('success', 'Article added — Taxi will use it on the next question.');
          setDraft(emptyDraft);
          setTagsInput('');
        },
        onError: (err: any) => flash('error', err?.message || 'Could not add article.'),
      },
    );
  };

  const startEdit = (a: KbArticle) => {
    setEditingId(a.id);
    setEditDraft({
      title: a.title,
      summary: a.summary,
      source_url: a.source_url || '',
      status: a.status,
    });
    setEditTagsInput((a.tags || []).join(', '));
  };

  const saveEdit = () => {
    if (!editingId) return;
    if (!editDraft.title?.trim() || !editDraft.summary?.trim()) {
      flash('error', 'Title and summary are required.');
      return;
    }
    updateMutation.mutate(
      {
        id: editingId,
        patch: {
          title: editDraft.title.trim(),
          summary: editDraft.summary.trim(),
          source_url: (editDraft.source_url || '').trim() || null,
          tags: parseTags(editTagsInput),
          status: editDraft.status,
        },
      },
      {
        onSuccess: () => { flash('success', 'Article updated.'); setEditingId(null); },
        onError: (err: any) => flash('error', err?.message || 'Could not save changes.'),
      },
    );
  };

  const togglePublish = (a: KbArticle) => {
    const next = a.status === 'published' ? 'draft' : 'published';
    updateMutation.mutate(
      { id: a.id, patch: { status: next } },
      {
        onSuccess: () => flash('success', next === 'published' ? 'Published — visible to Taxi.' : 'Unpublished (draft).'),
        onError: (err: any) => flash('error', err?.message || 'Could not update status.'),
      },
    );
  };

  const handleDelete = (a: KbArticle) => {
    if (!window.confirm(`Delete "${a.title}"? Cannot be undone.`)) return;
    deleteMutation.mutate(a.id, {
      onSuccess: () => flash('success', 'Article deleted.'),
      onError: (err: any) => flash('error', err?.message || 'Could not delete.'),
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 flex items-center justify-center text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading knowledge base…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-3xl p-8 flex items-start gap-4">
        <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-red-900">Could not load the knowledge base</h3>
          <p className="text-sm text-red-800 mt-1 font-medium">{(error as Error).message}</p>
          <p className="text-xs text-red-700 mt-3 font-medium">
            Did you run <code className="font-mono bg-red-100 px-1.5 py-0.5 rounded">supabase/add_kb_articles_table.sql</code>?
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {message && (
        <div className={`rounded-2xl border p-4 flex items-center gap-3 text-sm font-medium ${
          message.kind === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {message.kind === 'success' ? <CheckCircle2 className="h-5 w-5 flex-shrink-0" /> : <AlertCircle className="h-5 w-5 flex-shrink-0" />}
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto text-xs font-bold uppercase tracking-widest opacity-60 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* AI import — the primary path. Manual entry below is the fallback. */}
      <div className="bg-white rounded-2xl shadow-sm border-2 border-indigo-100 p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-primary p-2 rounded-lg"><Wand2 className="h-5 w-5 text-white" /></div>
          <div>
            <h3 className="font-display text-lg font-semibold text-gray-900">Import with AI</h3>
            <p className="text-xs text-gray-500 mt-0.5 font-medium">
              Upload a document, paste a link, or paste text — Claude extracts titled, tagged knowledge items for your review. Nothing is saved until you add it.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {([['file', 'Upload file', Upload], ['url', 'From URL', Link2], ['text', 'Paste text', ClipboardPaste]] as const).map(([mode, label, Icon]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setImportMode(mode)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                importMode === mode ? 'bg-primary text-white shadow-sm' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {importMode === 'file' && (
          <p className="text-sm text-gray-500 mb-4">
            PDF (≤3MB), .txt or .md — e.g. a regulator bulletin, firm newsletter, or statute excerpt.
          </p>
        )}
        {importMode === 'url' && (
          <input
            type="text"
            value={importUrl}
            onChange={e => setImportUrl(e.target.value)}
            placeholder="https://… (a public article or regulator page)"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm mb-4 focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
          />
        )}
        {importMode === 'text' && (
          <textarea
            rows={5}
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder="Paste the newsletter / alert / law text here…"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm mb-4 focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none resize-y"
          />
        )}

        <input type="file" ref={fileInputRef} onChange={handleFilePicked} accept=".pdf,.txt,.md" className="hidden" />
        <button
          type="button"
          onClick={handleExtractClick}
          disabled={extracting}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-indigo-900 disabled:opacity-60 transition-all active:scale-95"
        >
          {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {extracting ? 'Extracting…' : importMode === 'file' ? 'Choose file & extract' : 'Extract with AI'}
        </button>

        {extracted.length > 0 && (
          <div className="mt-6 border-t border-gray-100 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                {extracted.length} extracted — review &amp; add
              </span>
              <div className="flex gap-2">
                <button onClick={() => addAllExtracted('draft')} disabled={createMutation.isPending} className="px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60">
                  Add all as drafts
                </button>
                <button onClick={() => addAllExtracted('published')} disabled={createMutation.isPending} className="px-3.5 py-2 bg-green-50 border border-green-200 rounded-lg text-sm font-semibold text-green-800 hover:bg-green-100 disabled:opacity-60">
                  Publish all
                </button>
                <button onClick={() => setExtracted([])} className="px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-100">
                  Discard
                </button>
              </div>
            </div>
            <ul className="space-y-3">
              {extracted.map((item, i) => (
                <li key={`${item.title}-${i}`} className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-gray-900">{item.title}</span>
                    {item.effective_date && (
                      <span className="text-[10px] font-bold text-amber-acc-2">effective {item.effective_date}</span>
                    )}
                    {item.tags.map(t => (
                      <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white text-indigo-700 border border-indigo-100">{t}</span>
                    ))}
                  </div>
                  <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{item.summary}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => addExtracted(item, 'published')} disabled={createMutation.isPending} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-60">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Publish
                    </button>
                    <button onClick={() => addExtracted(item, 'draft')} disabled={createMutation.isPending} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                      <Plus className="h-3.5 w-3.5" /> Draft
                    </button>
                    <button onClick={() => setExtracted(prev => prev.filter(x => x !== item))} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-red-600">
                      <X className="h-3.5 w-3.5" /> Skip
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Add article */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-indigo-50 p-2 rounded-lg"><BookOpen className="h-5 w-5 text-primary" /></div>
          <div>
            <h3 className="font-display text-lg font-semibold text-gray-900">Add manually</h3>
            <p className="text-xs text-gray-500 mt-0.5 font-medium">
              Published articles feed Taxi's industry context (newest 20). Keep summaries short, factual, and self-contained — the AI cites them by title.
            </p>
          </div>
        </div>
        <form onSubmit={handleCreate} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Title *">
              <input
                required type="text" value={draft.title}
                onChange={e => setDraft({ ...draft, title: e.target.value })}
                placeholder="France postpones e-invoicing mandate to 2027"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
              />
            </Field>
            <Field label="Source URL">
              <input
                type="text" value={draft.source_url || ''}
                onChange={e => setDraft({ ...draft, source_url: e.target.value })}
                placeholder="https://…"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
              />
            </Field>
          </div>
          <Field label="Summary * (2-4 sentences — this is what the AI reads)">
            <textarea
              required rows={3} value={draft.summary}
              onChange={e => setDraft({ ...draft, summary: e.target.value })}
              placeholder="What happened, who it affects, and by when. Plain facts beat commentary."
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none resize-y"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Tags (comma-separated)">
              <input
                type="text" value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="e-invoicing, France, mandate"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
              />
            </Field>
            <Field label="Status">
              <select
                value={draft.status}
                onChange={e => setDraft({ ...draft, status: e.target.value as 'draft' | 'published' })}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white outline-none"
              >
                <option value="published">Published (Taxi uses it)</option>
                <option value="draft">Draft (hidden)</option>
              </select>
            </Field>
          </div>
          <div className="flex justify-end">
            <button
              type="submit" disabled={createMutation.isPending}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-indigo-900 disabled:opacity-60 transition-all active:scale-95"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {createMutation.isPending ? 'Adding…' : 'Add article'}
            </button>
          </div>
        </form>
      </div>

      {/* Articles list */}
      {articles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <BookOpen className="h-10 w-10 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No knowledge yet. Add the first industry update above.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {articles.map(a => (
            <li key={a.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6">
              {editingId === a.id ? (
                <div className="space-y-3">
                  <Field label="Title">
                    <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={editDraft.title} onChange={e => setEditDraft({ ...editDraft, title: e.target.value })} />
                  </Field>
                  <Field label="Summary">
                    <textarea rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-y" value={editDraft.summary} onChange={e => setEditDraft({ ...editDraft, summary: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Source URL">
                      <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={editDraft.source_url || ''} onChange={e => setEditDraft({ ...editDraft, source_url: e.target.value })} />
                    </Field>
                    <Field label="Tags (comma-separated)">
                      <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={editTagsInput} onChange={e => setEditTagsInput(e.target.value)} />
                    </Field>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={updateMutation.isPending} className="inline-flex items-center gap-2 px-3.5 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-indigo-900 disabled:opacity-60">
                      {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100">
                      <X className="h-4 w-4" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base font-semibold text-gray-900">{a.title}</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      a.status === 'published' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}>
                      {a.status}
                    </span>
                    {(a.tags || []).map(t => (
                      <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">{t}</span>
                    ))}
                  </div>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">{a.summary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                    <span>{new Date(a.published_at).toLocaleDateString()}</span>
                    {a.source_url && (
                      <a href={a.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                        <ExternalLink className="h-3 w-3" /> Source
                      </a>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => startEdit(a)} className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100">
                      <Edit2 className="h-4 w-4" /> Edit
                    </button>
                    <button onClick={() => togglePublish(a)} disabled={updateMutation.isPending} className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60">
                      {a.status === 'published' ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      {a.status === 'published' ? 'Unpublish' : 'Publish'}
                    </button>
                    <button onClick={() => handleDelete(a)} disabled={deleteMutation.isPending} className="inline-flex items-center gap-2 px-3.5 py-2 ml-auto bg-red-50 border border-red-200 rounded-lg text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60">
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                  </div>
                </>
              )}
            </li>
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

export default AdminKnowledge;
