import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Plus, MessageSquare, MoreHorizontal, Pencil, Trash2, Menu, X, Check } from 'lucide-react';
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
  useCreateSubmission,
  usePublishedKbArticles,
  useMyAiUsage,
  queryKeys,
} from '../services/queries';
import { useQueryClient } from '@tanstack/react-query';
import { askTaxiWithTools } from '../services/taxi';
import {
  IntakeTurn, IntakeExtracted, EMPTY_EXTRACTED, INTAKE_GREETING,
  runIntakeTurn, requiredComplete, missingRequired, capturedChips, buildIntakeSubmission,
} from '../services/intake';
import { gateReason } from '../services/cohort';
import { api } from '../services/api';
import { usageState } from '../services/usageMeter';
import { User, Submission } from '../types';
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
  const { data: allSubmissions = [], isLoading: submissionsLoading } = useSubmissions({ enabled: !!user });
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
  // The peer cohort the AI analyzes is APPROVED members only — never waitlisted
  // or pending rows (they aren't in the founding cohort yet). mySubmission stays
  // sourced from all rows so a waitlisted user still resolves their own status.
  const cohortSubmissions = React.useMemo(
    () => allSubmissions.filter(s => s.status === 'approved'),
    [allSubmissions]
  );

  // Persisted sessions live in Supabase; React Query owns the cache.
  // Empty sessions stay in-memory until a first message creates the row,
  // matching the ChatGPT/Claude UX of "no sidebar entry until you type".
  const sessionsQuery = useChatSessions({ enabled: !!user });
  const persistedSessions = sessionsQuery.data || [];
  const createSession = useCreateChatSession();
  const updateSession = useUpdateChatSession();
  const deleteSessionMutation = useDeleteChatSession();
  // AI-led intake (docs/AI_INTAKE_PIVOT.md): the interview replaces the old
  // survey lock screen; completing it creates the submission right here.
  const createSubmissionMut = useCreateSubmission();
  const [autoAskPending, setAutoAskPending] = useState(false);

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
      // ("what about just multinationals?"). The request caps how many
      // turns are actually sent (MAX_HISTORY_TURNS in taxi.ts).
      // Error/limit turns carry no analytical context — replaying them would
      // waste tokens and teach the model to apologize.
      const history = activeSession.messages
        .filter(m => m.analysis
          && !m.analysis.startsWith('I apologize, but I encountered an error')
          && !m.analysis.startsWith("You've reached your daily AI limit"))
        .map(m => ({ question: m.question, analysis: m.analysis }));
      const { result: res, answerId, rulesApplied } = await askTaxiWithTools(query, mySubmission, cohortSubmissions, history, kbArticles);
      const newMsg: ChatMessage = { question: query, ...res, answerId, rulesApplied };
      const isPendingActive = pendingSession?.id === activeSession.id;
      const isFirst = activeSession.messages.length === 0;
      // Rebuild from the LATEST cached copy of this session, not the closure
      // snapshot taken before the (multi-second) request: a 👍/👎 landed
      // mid-flight would otherwise be clobbered by this write. (Pending sessions
      // aren't in the cache yet — their closure copy is by definition current.)
      const cachedMessages = isPendingActive
        ? null
        : (qc.getQueryData<Session[]>(queryKeys.chatSessions) ?? []).find(s => s.id === activeSession.id)?.messages;
      const nextMessages = [...(cachedMessages ?? activeSession.messages), newMsg].slice(-MAX_MESSAGES_PER_SESSION);
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

  // The intake→benchmark hand-off: once the interview created the submission
  // and the queries refetched (gate flips to granted, a session exists), fire
  // the first benchmark question automatically — the payoff moment arrives
  // without the user having to type anything.
  useEffect(() => {
    if (autoAskPending && mySubmission && activeSession && !isAiLoading) {
      setAutoAskPending(false);
      handleAiQuery('How does my tax organization compare to peers overall?');
    }
    // handleAiQuery is stable enough for this purpose; including it would
    // re-run the effect on every render since it's redeclared each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAskPending, mySubmission, activeSession, isAiLoading]);

  // 👍/👎 on a specific answer: optimistic write into the session (survives
  // reloads) + fire-and-forget server rating. Only answers with an answerId
  // (post-harness) show controls — legacy messages have nothing to anchor to.
  const handleRateMessage = (index: number, rating: 1 | -1) => {
    if (!activeSession) return;
    const msg = activeSession.messages[index];
    if (!msg?.answerId) return;
    api.rateAnswer(msg.answerId, rating); // best-effort; warns on failure
    const nextMessages = activeSession.messages.map((m, j) => (j === index ? { ...m, rating } : m));
    updateSession.mutate({ id: activeSession.id, patch: { messages: nextMessages, updatedAt: Date.now() } });
  };

  const handleNewChat = () => {
    setMobileDrawerOpen(false);
    setAiInput('');
    // Don't carry an in-flight question's bubble into a different view — the
    // answer still lands in its original session when it resolves.
    setPendingQuestion(null);
    if (pendingSession && activeId === pendingSession.id) return;
    const fresh = makeFreshSession();
    setPendingSession(fresh);
    setActiveId(fresh.id);
  };

  const handleSelectSession = (id: string) => {
    setMobileDrawerOpen(false);
    if (id === activeId) return;
    setPendingQuestion(null);
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

  const taxiGate = gateReason(mySubmission, isAdmin);
  if (taxiGate !== 'granted') {
    // While the submissions query is in flight we don't yet know whether this
    // user has a record — show a quiet loading state instead of flashing the
    // interactive interview at an approved member on a cold load.
    if (submissionsLoading) {
      return (
        <div className="max-w-2xl mx-auto py-24 px-4 text-center text-gray-400 text-sm" role="status">
          Loading your benchmark…
        </div>
      );
    }
    // AI-led intake: no survey form, no lock screen — Taxi interviews the new
    // member right here and creates their benchmark record from the answers.
    return (
      <IntakeExperience
        userId={user?.id ?? 'anon'}
        onDone={async (payload) => {
          await createSubmissionMut.mutateAsync(payload as Omit<Submission, 'id' | 'userId' | 'userName' | 'status' | 'submittedAt'>);
          setAutoAskPending(true);
        }}
      />
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
                    {/* Evidence chips: the cohort is always in context; ⚖️ rate
                        chips are the verified tax_rules the lookup_rate tool
                        applied (never model memory); 📰 KB chips render only for
                        titles the model reported AND that exist in the real KB
                        (both sanitized server-side). */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-200 rounded-full text-[11px] font-semibold text-gray-600">
                        📊 Your cohort · n={cohortSubmissions.length}
                      </span>
                      {(item.rulesApplied ?? []).map(r => (
                        <span
                          key={`${r.jurisdiction}-${r.tax_type}`}
                          title={`${r.jurisdiction_name} · ${r.tax_type.replace('_', '/')} ${r.standard_rate}%${r.last_verified ? ` · verified ${r.last_verified}` : ''}${r.source_url ? ` · ${r.source_url}` : ''}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-200 rounded-full text-[11px] font-semibold text-gray-600"
                        >
                          ⚖️ {r.jurisdiction_name} {r.tax_type.replace('_', '/')} {r.standard_rate}%
                        </span>
                      ))}
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
                    {item.answerId && (
                      <AnswerFeedback
                        key={item.answerId}
                        answerId={item.answerId}
                        rating={item.rating ?? null}
                        disabled={isAiLoading}
                        onRate={(r) => handleRateMessage(i, r)}
                      />
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

/**
 * Per-answer feedback row (harness Phase 0): 👍/👎 plus CP1's structured
 * "report a wrong fact" form. 👎 reveals the optional form — the report is what
 * turns a complaint into a golden-set eval candidate. Self-contained state; the
 * parent persists the rating into the session so it survives reloads.
 */
const AnswerFeedback: React.FC<{
  answerId: string;
  rating: 1 | -1 | null;
  /** True while a query is streaming in this session — rating then would race
   *  the session write that lands with the new answer (belt to the cache-
   *  rebuild suspenders in handleAiQuery). */
  disabled?: boolean;
  onRate: (r: 1 | -1) => void;
}> = ({ answerId, rating, disabled, onRate }) => {
  const [formOpen, setFormOpen] = useState(false);
  const [expected, setExpected] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const submitReport = async () => {
    if (expected.trim().length < 3 || state === 'sending') return;
    setState('sending');
    try {
      await api.reportAnswer(answerId, expected, sourceUrl || undefined);
      setState('sent');
      setFormOpen(false);
    } catch (e: any) {
      setState('error');
      setErrorMsg(e?.message || 'Could not submit the report.');
    }
  };

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onRate(1)}
          disabled={disabled}
          aria-label="Good answer"
          aria-pressed={rating === 1}
          className={`p-1.5 rounded-lg text-[13px] transition-colors disabled:opacity-40 ${rating === 1 ? 'bg-indigo-50 text-primary' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}
        >👍</button>
        <button
          onClick={() => {
            onRate(-1);
            // 'sent' is sticky: reopening a pre-filled form would let every
            // extra click insert a duplicate report row.
            if (state !== 'sent') {
              setFormOpen(true);
              if (state === 'error') setState('idle');
            }
          }}
          disabled={disabled}
          aria-label="Wrong or unhelpful answer"
          aria-pressed={rating === -1}
          className={`p-1.5 rounded-lg text-[13px] transition-colors disabled:opacity-40 ${rating === -1 ? 'bg-amber-50 text-amber-700' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}
        >👎</button>
        {state === 'sent' && (
          <span className="text-[12px] text-gray-400 ml-1">Thanks — we'll review and fold it into our accuracy tests.</span>
        )}
      </div>
      {formOpen && state !== 'sent' && (
        <div className="mt-2 p-3 bg-white border border-gray-200 rounded-xl max-w-lg">
          <p className="text-[12px] font-semibold text-gray-600 mb-1.5">What should the answer have said? (optional but gold for us)</p>
          <textarea
            value={expected}
            onChange={e => setExpected(e.target.value)}
            maxLength={4000}
            rows={2}
            placeholder="e.g. Poland's KSeF deadline for large taxpayers is 1 Feb 2026, not April"
            className="w-full text-[13px] border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/10 resize-y"
          />
          <input
            value={sourceUrl}
            onChange={e => setSourceUrl(e.target.value)}
            maxLength={2000}
            placeholder="Source link (optional)"
            className="mt-1.5 w-full text-[13px] border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-primary/10"
          />
          {state === 'error' && <p className="mt-1.5 text-[12px] text-red-600">{errorMsg}</p>}
          <div className="mt-2 flex gap-2">
            <button
              onClick={submitReport}
              disabled={expected.trim().length < 3 || state === 'sending'}
              className="px-3 py-1.5 bg-primary text-white rounded-lg text-[12px] font-bold disabled:opacity-40"
            >{state === 'sending' ? 'Sending…' : 'Send report'}</button>
            <button onClick={() => setFormOpen(false)} className="px-3 py-1.5 text-[12px] font-semibold text-gray-500 hover:bg-gray-100 rounded-lg">Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── AI-led intake (docs/AI_INTAKE_PIVOT.md) ─────────────────────────────────
//
// Replaces the old survey lock screen: Taxi interviews the new member, the
// server extracts survey fields turn by turn (mode:'intake'), captured fields
// render as chips, and when the four required fields are in, the record is
// created and the parent flips straight into benchmark mode.

// Per-user key: on a shared machine another account must never inherit (or
// submit!) someone else's interview transcript and extracted fields.
const intakeDraftKey = (userId: string) => `taxtech_intake_draft_v1:${userId}`;

interface IntakeDraft { turns: IntakeTurn[]; acc: IntakeExtracted; }

function loadIntakeDraft(userId: string): IntakeDraft {
  try {
    const raw = localStorage.getItem(intakeDraftKey(userId));
    if (!raw) return { turns: [], acc: EMPTY_EXTRACTED };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.turns) || typeof parsed?.acc !== 'object' || !parsed.acc) {
      return { turns: [], acc: EMPTY_EXTRACTED };
    }
    return {
      turns: parsed.turns.filter((t: any) =>
        (t?.role === 'user' || t?.role === 'assistant') && typeof t?.content === 'string'),
      acc: { ...EMPTY_EXTRACTED, ...parsed.acc },
    };
  } catch {
    return { turns: [], acc: EMPTY_EXTRACTED };
  }
}

export const IntakeExperience: React.FC<{ userId: string; onDone: (payload: Partial<Submission>) => Promise<void> }> = ({ userId, onDone }) => {
  const [draft] = useState(() => loadIntakeDraft(userId));
  const [turns, setTurns] = useState<IntakeTurn[]>(draft.turns);
  const [acc, setAcc] = useState<IntakeExtracted>(draft.acc);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Draft survives reloads mid-interview, mirroring the old form's autosave.
    try { localStorage.setItem(intakeDraftKey(userId), JSON.stringify({ turns, acc })); } catch { /* quota — non-fatal */ }
  }, [turns, acc, userId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, busy, creating]);

  const finish = async (finalAcc: IntakeExtracted) => {
    setCreating(true);
    setError(null);
    try {
      await onDone(buildIntakeSubmission(finalAcc));
      localStorage.removeItem(intakeDraftKey(userId));
      // Normally the parent's queries refetch, the gate flips, and this
      // component unmounts. If that refetch fails, don't leave the spinner
      // stuck forever (setState after unmount is a no-op in React 19).
      setCreating(false);
    } catch {
      setError('Could not create your profile just now — tap "Create my benchmark profile" to retry.');
      setCreating(false);
    }
  };

  // Runs the model on the current turns (last turn must be the user's — true
  // both for a fresh send and for a retry after a failed round trip).
  const advance = async (nextTurns: IntakeTurn[]) => {
    setBusy(true);
    setError(null);
    // Commit the user's turn BEFORE the round trip: a failed request must
    // never eat what they typed, and Retry needs the turn in state to rerun.
    setTurns(nextTurns);
    try {
      const r = await runIntakeTurn(nextTurns, acc);
      setTurns([...nextTurns, { role: 'assistant', content: r.reply }]);
      setAcc(r.acc);
      if (r.complete) await finish(r.acc);
    } catch (e: any) {
      // 429 (daily limit) / 403 / network — surface the server's message; the
      // user's turn is already committed, so Retry can rerun it.
      setError(e?.message || 'Something went wrong — please retry.');
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text || busy || creating) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    void advance([...turns, { role: 'user', content: text }]);
  };

  // Retry is available whenever the conversation ends on an unanswered user
  // turn — after an in-session failure OR a reload of a failed-turn draft
  // (where `error` state was lost with the page).
  const canRetry = !busy && !creating && turns.length > 0 && turns[turns.length - 1].role === 'user';
  const chips = capturedChips(acc);
  const missing = missingRequired(acc);
  const readyToFinish = requiredComplete(acc) && !creating;

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center gap-3 mb-4">
        <img src={taxiAvatar} alt="" className="w-9 h-9 rounded-lg" />
        <div>
          <h2 className="font-display text-lg font-semibold text-gray-900">Set up your benchmark — just chat</h2>
          <p className="text-xs text-gray-500">
            {creating
              ? 'Creating your profile…'
              : missing.length === 0
                ? 'All set — create your profile below'
                : `Anonymous · ~2 minutes · still needed: ${missing.join(', ')}`}
          </p>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3" data-testid="intake-chips">
          {chips.map(c => (
            <span key={c.field} className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-[11px] font-semibold text-emerald-700">
              <Check className="w-3 h-3" /> {c.text}
            </span>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        <IntakeBubble role="assistant" content={INTAKE_GREETING} />
        {turns.map((t, i) => <IntakeBubble key={i} role={t.role} content={t.content} />)}
        {(busy || creating) && (
          <div className="flex items-center gap-2 text-gray-400 text-sm pl-1" role="status">
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:120ms]" />
              <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:240ms]" />
            </span>
            {creating ? 'Creating your benchmark profile…' : 'Taxi is thinking…'}
          </div>
        )}
        {error && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[13px] text-amber-800" role="alert">
            {error}
            {canRetry && (
              <button onClick={() => void advance(turns)} className="ml-2 font-bold underline">Retry</button>
            )}
          </div>
        )}
        {!error && canRetry && (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-[13px] text-gray-600">
            Your last answer wasn't sent.
            <button onClick={() => void advance(turns)} className="ml-2 font-bold underline">Retry</button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {readyToFinish && (
        <button
          onClick={() => void finish(acc)}
          className="mb-2 w-full py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm"
        >
          Create my benchmark profile
        </button>
      )}

      <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-2xl p-2 shadow-sm">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => {
            setInput(e.target.value);
            const el = inputRef.current;
            if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }
          }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={1}
          maxLength={2000}
          placeholder="Type your answer…"
          aria-label="Your answer"
          disabled={creating}
          className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={!input.trim() || busy || creating}
          aria-label="Send"
          className="p-2.5 bg-primary text-white rounded-xl disabled:opacity-30"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const IntakeBubble: React.FC<{ role: 'user' | 'assistant'; content: string }> = ({ role, content }) => (
  role === 'user' ? (
    <div className="flex justify-end">
      <div className="bg-gray-100 text-gray-900 px-4 py-2.5 rounded-2xl text-[15px] leading-6 max-w-[85%] whitespace-pre-wrap">{content}</div>
    </div>
  ) : (
    <div className="flex items-start gap-2.5">
      <img src={taxiAvatar} alt="" className="w-6 h-6 rounded-md mt-1" />
      <div className="text-[15px] text-gray-800 leading-6 max-w-[85%] whitespace-pre-wrap">{content}</div>
    </div>
  )
);

export default Taxi;
