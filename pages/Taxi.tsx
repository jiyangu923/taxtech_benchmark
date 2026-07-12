import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, Lock, Plus, MessageSquare, MoreHorizontal, Pencil, Trash2, Menu, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  useSubmissions,
  useChatSessions,
  useCreateChatSession,
  useUpdateChatSession,
  useDeleteChatSession,
  usePublishedKbArticles,
  useMyAiUsage,
  queryKeys,
} from '../services/queries';
import { useQueryClient } from '@tanstack/react-query';
import { streamTaxi } from '../services/taxi';
import { usageState } from '../services/usageMeter';
import { User } from '../types';
import taxiAvatar from '../assets/taxi-avatar-cab.svg';
import {
  ACTIVE_SESSION_KEY,
  LEGACY_HISTORY_KEY,
  MAX_MESSAGES_PER_SESSION,
  SESSIONS_KEY,
  Session,
  ChatMessage,
  loadSessions,
  makeFreshSession,
  pickActiveAfterDelete,
  pickInitialActiveId,
  sortByRecent,
  titleFromQuestion,
} from './Taxi.helpers';

interface TaxiProps { user: User | null; }

const SUGGESTED_PROMPTS = [
  'How do I compare on FTEs?',
  'Where are my biggest automation gaps?',
  'What e-invoicing deadlines hit in 2026?',
  'Am I a market leader or follower?',
];

const Taxi: React.FC<TaxiProps> = ({ user }) => {
  const isAdmin = user?.role === 'admin';
  const { data: allSubmissions = [] } = useSubmissions({ enabled: !!user });
  // Curated industry news — joins Taxi's cached system prompt so answers can
  // reference current events. Empty array (table empty / not yet migrated)
  // degrades to the pre-KB behavior.
  const { data: kbArticles = [] } = usePublishedKbArticles({ enabled: !!user });
  // Fair-use meter (display only — /api/claude enforces the limit). Admins
  // are exempt, so no meter for them.
  const qc = useQueryClient();
  const { data: aiUsageRow } = useMyAiUsage({ enabled: !!user && !isAdmin });
  const mySubmission = React.useMemo(
    () => allSubmissions.find(s => s.userId === user?.id) || null,
    [allSubmissions, user?.id]
  );

  // Persisted sessions live in Supabase; React Query owns the cache.
  // Empty sessions stay in-memory until a first message creates the row,
  // matching the ChatGPT/Claude UX of "no sidebar entry until you type".
  const sessionsQuery = useChatSessions({ enabled: !!user });
  const persistedSessions = sessionsQuery.data || [];
  const createSession = useCreateChatSession();
  const updateSession = useUpdateChatSession();
  const deleteSessionMutation = useDeleteChatSession();

  const [pendingSession, setPendingSession] = useState<Session | null>(null);

  // The question currently in flight — echoed as a user bubble with a
  // thinking indicator until the answer lands in the session.
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  // Auto-growing composer (ChatGPT/Claude-style): height tracks content up
  // to ~6 lines, reset after send.
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const autoGrowComposer = () => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };
  const [activeId, setActiveId] = useState<string>(() =>
    localStorage.getItem(ACTIVE_SESSION_KEY) || ''
  );
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [menuOpenForId, setMenuOpenForId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const migrationRanRef = useRef(false);

  // Combined view: pending (if any) prepended to persisted, sorted by recency.
  const sessionsForDisplay = React.useMemo(() => {
    const sorted = sortByRecent(persistedSessions);
    return pendingSession ? [pendingSession, ...sorted] : sorted;
  }, [persistedSessions, pendingSession]);

  const activeSession =
    sessionsForDisplay.find(s => s.id === activeId) ||
    sessionsForDisplay[0] ||
    null;
  const aiHistory = activeSession?.messages || [];

  // One-time migration: if the user has localStorage sessions from v1/v2 and
  // an empty Supabase, push them up then clear localStorage. We rely on
  // loadSessions() which also handles the older taxi_chat_history shape.
  useEffect(() => {
    if (migrationRanRef.current) return;
    if (!user || sessionsQuery.isLoading) return;
    if (persistedSessions.length > 0) {
      migrationRanRef.current = true;
      localStorage.removeItem(SESSIONS_KEY);
      localStorage.removeItem(LEGACY_HISTORY_KEY);
      return;
    }
    const local = loadSessions().filter(s => s.messages.length > 0);
    if (local.length === 0) {
      migrationRanRef.current = true;
      return;
    }
    migrationRanRef.current = true;
    Promise.all(local.map(s => createSession.mutateAsync(s)))
      .then(() => {
        localStorage.removeItem(SESSIONS_KEY);
      })
      .catch((err) => {
        console.error('[Taxi] migration to Supabase failed:', err);
        migrationRanRef.current = false; // allow retry on next mount
      });
  }, [user, sessionsQuery.isLoading, persistedSessions.length, createSession]);

  // Spawn a pending empty session if there's nothing to land on after the
  // initial query settles.
  useEffect(() => {
    if (sessionsQuery.isLoading) return;
    if (persistedSessions.length > 0) return;
    if (pendingSession) return;
    const fresh = makeFreshSession();
    setPendingSession(fresh);
    setActiveId(fresh.id);
  }, [sessionsQuery.isLoading, persistedSessions.length, pendingSession]);

  // Once we have data, snap activeId to a valid id (stored or newest).
  useEffect(() => {
    if (sessionsQuery.isLoading) return;
    if (sessionsForDisplay.length === 0) return;
    if (sessionsForDisplay.some(s => s.id === activeId)) return;
    setActiveId(pickInitialActiveId(persistedSessions, localStorage.getItem(ACTIVE_SESSION_KEY)));
  }, [sessionsQuery.isLoading, sessionsForDisplay, activeId, persistedSessions]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (!menuOpenForId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-session-menu]')) setMenuOpenForId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpenForId]);

  useEffect(() => {
    if (activeId) {
      try { localStorage.setItem(ACTIVE_SESSION_KEY, activeId); } catch { /* ignore */ }
    }
  }, [activeId]);

  const scrollToBottom = () => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleAiQuery = async (q?: string) => {
    const query = (q || aiInput).trim();
    if (!query || (!mySubmission && !isAdmin) || isAiLoading || !activeSession) return;
    setIsAiLoading(true);
    setPendingQuestion(query);
    setAiInput('');
    if (composerRef.current) composerRef.current.style.height = 'auto';
    scrollToBottom();
    try {
      // Pass the conversation so far so follow-ups keep their context
      // ("what about just multinationals?"). streamTaxi caps how many
      // turns are actually sent.
      const history = activeSession.messages.map(m => ({ question: m.question, analysis: m.analysis }));
      const { result: res } = await streamTaxi(query, mySubmission, allSubmissions, history, kbArticles);
      const newMsg: ChatMessage = { question: query, ...res };
      const isPendingActive = pendingSession?.id === activeSession.id;
      const isFirst = activeSession.messages.length === 0;
      const nextMessages = [...activeSession.messages, newMsg].slice(-MAX_MESSAGES_PER_SESSION);
      const nextTitle = isFirst ? titleFromQuestion(query) : activeSession.title;

      if (isPendingActive) {
        // First-ever message in this conversation — create the row, then
        // drop the in-memory pending session. activeId stays the same.
        const newSession: Session = {
          ...activeSession,
          messages: nextMessages,
          title: nextTitle,
          updatedAt: Date.now(),
        };
        await createSession.mutateAsync(newSession);
        setPendingSession(null);
      } else {
        await updateSession.mutateAsync({
          id: activeSession.id,
          patch: { messages: nextMessages, title: nextTitle, updatedAt: Date.now() },
        });
      }
    } finally {
      setIsAiLoading(false);
      setPendingQuestion(null);
      // Refresh the fair-use meter after every question so the warning
      // tracks reality without polling.
      qc.invalidateQueries({ queryKey: queryKeys.myAiUsage });
      scrollToBottom();
    }
  };

  const handleNewChat = () => {
    setMobileDrawerOpen(false);
    setAiInput('');
    if (pendingSession && activeId === pendingSession.id) return;
    const fresh = makeFreshSession();
    setPendingSession(fresh);
    setActiveId(fresh.id);
  };

  const handleSelectSession = (id: string) => {
    setMobileDrawerOpen(false);
    if (id === activeId) return;
    if (pendingSession && pendingSession.id !== id) {
      // Discard the empty in-memory session when navigating away from it.
      setPendingSession(null);
    }
    setActiveId(id);
    setAiInput('');
  };

  const handleStartRename = (s: Session) => {
    setMenuOpenForId(null);
    setRenamingId(s.id);
    setRenameDraft(s.title);
  };

  const handleCommitRename = () => {
    if (!renamingId) return;
    const id = renamingId;
    const draft = renameDraft.trim().replace(/\s+/g, ' ');
    setRenamingId(null);
    setRenameDraft('');
    if (!draft) return;
    const capped = draft.length > 60 ? draft.slice(0, 60).trimEnd() + '…' : draft;
    if (pendingSession && pendingSession.id === id) {
      setPendingSession({ ...pendingSession, title: capped });
      return;
    }
    const target = persistedSessions.find(s => s.id === id);
    if (!target || target.title === capped) return;
    updateSession.mutate({ id, patch: { title: capped } });
  };

  const handleCancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  const handleDeleteSession = (id: string) => {
    setMenuOpenForId(null);
    if (pendingSession && pendingSession.id === id) {
      setPendingSession(null);
      // Active id will be re-snapped by the effect; if no persisted exist,
      // a new pending will be spawned.
      return;
    }
    const target = persistedSessions.find(s => s.id === id);
    if (!target) return;
    if (target.messages.length > 0) {
      const ok = window.confirm(`Delete "${target.title}"? This cannot be undone.`);
      if (!ok) return;
    }
    const remaining = persistedSessions.filter(s => s.id !== id);
    const nextActive = pickActiveAfterDelete(remaining, id, activeId);
    if (nextActive) setActiveId(nextActive);
    deleteSessionMutation.mutate(id);
  };

  const firstName = (user?.name || '').trim().split(/\s+/)[0] || '';

  // Usage-warning thresholds: silent below 60%, gentle note 60-85%, amber
  // above 85%, explicit reset time at 100%. Capped fraction comes from
  // usageState (mirrors the server window logic).
  const usage = usageState(aiUsageRow ?? null, Date.now());
  const usagePct = Math.round(usage.fraction * 100);
  const usageResetStr = usage.resetsAtMs
    ? new Date(usage.resetsAtMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const showUsageWarning = !isAdmin && usage.fraction >= 0.6 && usage.fraction < 1;
  const usageCapped = !isAdmin && usage.fraction >= 1;

  // One composer, two homes: centered mid-screen in the empty state,
  // docked at the bottom once a conversation exists.
  const composer = (
    <div className="bg-white border border-gray-300 rounded-2xl shadow-sm focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/5 transition-shadow px-4 pt-3 pb-2.5">
      <textarea
        ref={composerRef}
        rows={1}
        placeholder="Message Taxi — benchmarks, peers, regulations…"
        className="w-full resize-none outline-none text-[15px] leading-6 text-gray-900 placeholder:text-gray-400 bg-transparent max-h-40"
        value={aiInput}
        onChange={e => { setAiInput(e.target.value); autoGrowComposer(); }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiQuery(); } }}
        disabled={isAiLoading}
        aria-label="Message Taxi"
      />
      <div className="flex items-center justify-between mt-1">
        <span className="hidden sm:block font-mono text-[9px] uppercase tracking-wider text-gray-300 select-none">Shift+Enter for new line</span>
        <button
          onClick={() => handleAiQuery()}
          disabled={isAiLoading || !aiInput.trim()}
          className="ml-auto w-8 h-8 rounded-full bg-primary text-white grid place-items-center hover:bg-indigo-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Send"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  if (!isAdmin && (!mySubmission || mySubmission.status === 'pending')) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-4">
        <div className="flex flex-col items-center justify-center text-center p-12 bg-white rounded-3xl shadow-lg border border-gray-100">
          <Lock className="h-16 w-16 text-gray-200 mb-6" />
          <h2 className="font-display text-2xl font-semibold text-gray-900">Meet Taxi — after a quick survey</h2>
          <p className="text-gray-500 mt-2 max-w-sm">Contribute your ~3-minute benchmark survey and Taxi unlocks instantly — your answers join the peer data it analyzes for you.</p>
          <Link to="/survey" className="mt-8 px-8 py-3 bg-primary text-white rounded-xl font-bold">Take the 3-minute survey</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50 relative">
      {/* Mobile backdrop */}
      {mobileDrawerOpen && (
        <div
          onClick={() => setMobileDrawerOpen(false)}
          className="fixed inset-0 top-16 bg-black/30 z-30 lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Sidebar — slide-in drawer on mobile, static panel on desktop */}
      <aside
        aria-label="Chat sessions"
        className={`flex flex-col w-72 sm:w-80 lg:w-64 xl:w-72 border-r border-gray-200 bg-white flex-shrink-0
          fixed top-16 bottom-0 left-0 z-40 transform transition-transform duration-200
          lg:relative lg:top-auto lg:bottom-auto lg:z-auto lg:translate-x-0 lg:transition-none
          ${mobileDrawerOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="px-3 pt-3 pb-2">
          {/* The navbar above already carries the brand — the sidebar stays
              purely functional (Claude/ChatGPT style). */}
          <div className="lg:hidden flex items-center justify-between px-1 mb-2">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Chats</span>
            <button
              onClick={() => setMobileDrawerOpen(false)}
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
              aria-label="Close sessions"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl font-semibold text-sm text-gray-800 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99] transition-all"
          >
            <Plus className="h-4 w-4 text-primary" />
            <span>New chat</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <p className="px-2 mb-2 text-[10px] font-black uppercase text-gray-400 tracking-widest">Recent</p>
          {sessionsQuery.isLoading ? (
            <div className="px-2 space-y-2" aria-label="Loading sessions">
              <div className="h-9 bg-gray-100 rounded-lg animate-pulse" />
              <div className="h-9 bg-gray-100 rounded-lg animate-pulse w-4/5" />
              <div className="h-9 bg-gray-100 rounded-lg animate-pulse w-3/5" />
            </div>
          ) : sessionsForDisplay.length === 0 || (sessionsForDisplay.length === 1 && sessionsForDisplay[0].messages.length === 0) ? (
            <p className="px-2 text-xs text-gray-400 font-medium">No conversations yet. Start chatting below.</p>
          ) : (
            <ul className="space-y-1">
              {sessionsForDisplay.map(s => {
                const isActive = s.id === activeId;
                const isEmpty = s.messages.length === 0;
                const isRenaming = renamingId === s.id;
                const isMenuOpen = menuOpenForId === s.id;
                return (
                  <li key={s.id} className="group relative">
                    {isRenaming ? (
                      <form
                        onSubmit={(e) => { e.preventDefault(); handleCommitRename(); }}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white border border-indigo-300 ring-2 ring-indigo-100"
                      >
                        <MessageSquare className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameDraft}
                          onChange={e => setRenameDraft(e.target.value)}
                          onBlur={handleCommitRename}
                          onKeyDown={e => {
                            if (e.key === 'Escape') { e.preventDefault(); handleCancelRename(); }
                          }}
                          className="flex-1 min-w-0 text-sm font-semibold bg-transparent outline-none text-gray-900"
                          maxLength={80}
                          aria-label="Rename session"
                        />
                      </form>
                    ) : (
                      <div
                        className={`flex items-stretch rounded-lg border transition-colors ${
                          isActive
                            ? 'bg-indigo-50 border-indigo-100'
                            : 'border-transparent hover:bg-gray-50'
                        }`}
                      >
                        <button
                          onClick={() => handleSelectSession(s.id)}
                          className="flex-1 min-w-0 text-left px-3 py-2.5 flex items-start gap-2"
                          title={s.title}
                        >
                          <MessageSquare
                            className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                              isActive ? 'text-indigo-500' : 'text-gray-400'
                            }`}
                          />
                          <span className={`text-sm truncate min-w-0 flex-1 ${
                            isEmpty
                              ? 'italic font-medium text-gray-500'
                              : isActive ? 'font-semibold text-indigo-900' : 'font-semibold text-gray-700'
                          }`}>
                            {s.title}
                          </span>
                        </button>
                        <button
                          data-session-menu
                          onClick={(e) => { e.stopPropagation(); setMenuOpenForId(isMenuOpen ? null : s.id); }}
                          className={`flex-shrink-0 px-2 rounded-r-lg text-gray-500 hover:text-gray-900 hover:bg-gray-200/60 transition-opacity ${
                            isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                          }`}
                          aria-label={`Options for ${s.title}`}
                          aria-expanded={isMenuOpen}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    {isMenuOpen && (
                      <div
                        data-session-menu
                        role="menu"
                        className="absolute right-2 top-full mt-1 z-20 w-36 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
                      >
                        <button
                          role="menuitem"
                          onClick={() => handleStartRename(s)}
                          className="w-full text-left px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Rename
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => handleDeleteSession(s.id)}
                          className="w-full text-left px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Chat column — no banner: the conversation owns the full height.
          Desktop identity lives in the empty-state greeting + per-message
          rows; mobile gets a slim bar for the drawer toggle. */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white">
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Open chat sessions"
          >
            <Menu className="h-5 w-5" />
          </button>
          <img src={taxiAvatar} alt="" className="w-6 h-6 rounded-md" />
          <span className="text-sm font-semibold text-gray-900">Taxi</span>
        </div>

        {aiHistory.length === 0 && !pendingQuestion ? (
          /* ── Empty state: the AI is literally front and center ── */
          <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 pb-16 overflow-y-auto">
            <div className="w-full max-w-2xl mx-auto">
              <img src={taxiAvatar} alt="Taxi" className="w-14 h-14 mx-auto mb-5 rounded-2xl shadow-sm" />
              <h1 className="font-display text-2xl sm:text-[27px] font-semibold tracking-tight text-gray-900 text-center mb-7 text-balance">
                Where should we dig in{firstName ? `, ${firstName}` : ''}?
              </h1>
              {composer}
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {SUGGESTED_PROMPTS.map(s => (
                  <button
                    key={s}
                    onClick={() => handleAiQuery(s)}
                    className="px-3.5 py-2 bg-white border border-gray-200 rounded-full text-[13px] font-semibold text-gray-600 hover:border-gray-300 hover:text-gray-900 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-gray-400">
                Powered by Claude · cites your cohort + industry sources · free fair-use daily limit
              </p>
              {(showUsageWarning || usageCapped) && (
                <p className={`mt-2 text-center text-[11px] font-semibold ${usageCapped || usage.fraction >= 0.85 ? 'text-amber-700' : 'text-gray-500'}`}>
                  {usageCapped
                    ? `Daily free AI allowance reached — resets around ${usageResetStr}.`
                    : `~${usagePct}% of today's free AI allowance used.`}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* ── Conversation: flat answers in a reading column ── */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-8 pb-2">
              <div className="max-w-3xl mx-auto space-y-9">
                {aiHistory.map((item, i) => (
                  <div key={i} className="animate-fadeIn">
                    <div className="flex justify-end mb-5">
                      <div className="bg-gray-100 text-gray-900 px-4 py-2.5 rounded-2xl text-[15px] leading-6 max-w-[85%] sm:max-w-[75%]">{item.question}</div>
                    </div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <img src={taxiAvatar} alt="" className="w-6 h-6 rounded-md" />
                      <span className="text-xs font-bold text-gray-500">Taxi</span>
                    </div>
                    {/* Evidence chips: the cohort is always in context; KB
                        chips render only for titles the model reported AND
                        that exist in the real KB (sanitized server-side). */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-200 rounded-full text-[11px] font-semibold text-gray-600">
                        📊 Your cohort · n={allSubmissions.length}
                      </span>
                      {(item.sources ?? []).map(s => (
                        <span key={s} title={s} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-200 rounded-full text-[11px] font-semibold text-gray-600">
                          📰 {s.length > 48 ? s.slice(0, 47) + '…' : s}
                        </span>
                      ))}
                    </div>
                    <div className="text-[15px] text-gray-800 leading-7 [&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-gray-900 [&_ul]:my-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:my-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:my-1.5 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-5 [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:bg-gray-100 [&_code]:rounded [&_code]:font-mono [&_code]:text-[13px]">
                      <ReactMarkdown>{item.analysis}</ReactMarkdown>
                    </div>
                    {item.chart && (
                      <div className="mt-4 p-4 bg-white rounded-xl border border-gray-200" role="img" aria-label={`${item.chart.title} bar chart`}>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 mb-3">{item.chart.title}</p>
                        <div className="h-48">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                            <BarChart data={item.chart.data}>
                              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 10 }} />
                              <Tooltip />
                              <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                    {item.followUps && item.followUps.length > 0 && i === aiHistory.length - 1 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {item.followUps.map((q: string) => (
                          <button key={q} onClick={() => handleAiQuery(q)} className="px-3.5 py-1.5 bg-white border border-indigo-200 text-primary rounded-full text-[13px] font-semibold hover:bg-indigo-50 active:bg-indigo-100 transition-colors">{q}</button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {pendingQuestion && (
                  <div className="animate-fadeIn">
                    <div className="flex justify-end mb-5">
                      <div className="bg-gray-100 text-gray-900 px-4 py-2.5 rounded-2xl text-[15px] leading-6 max-w-[85%] sm:max-w-[75%]">{pendingQuestion}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <img src={taxiAvatar} alt="" className="w-6 h-6 rounded-md" />
                      <span className="text-xs font-bold text-gray-500">Taxi</span>
                      <span className="flex items-center gap-1 ml-1" role="status" aria-label="Taxi is thinking">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce motion-reduce:animate-none" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce motion-reduce:animate-none" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce motion-reduce:animate-none" style={{ animationDelay: '300ms' }} />
                      </span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            {/* ── Docked composer ── */}
            <div className="px-4 sm:px-6 pb-4 pt-2">
              <div className="max-w-3xl mx-auto">
                {composer}
                {usageCapped ? (
                  <p className="mt-2 text-center text-[11px] font-semibold text-amber-700">
                    Daily free AI allowance reached — resets around {usageResetStr}.
                  </p>
                ) : (
                  <p className="mt-2 text-center text-[11px] text-gray-400">
                    Taxi analyzes anonymized cohort data — verify important figures.
                    {showUsageWarning && (
                      <span className={usage.fraction >= 0.85 ? ' text-amber-700 font-semibold' : ''}>
                        {' '}· ~{usagePct}% of today&apos;s free allowance used
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Taxi;
