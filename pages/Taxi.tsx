import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Send, Loader2, Lock, Plus, MessageSquare, MoreHorizontal, Pencil, Trash2, Menu, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useSubmissions } from '../services/queries';
import { askBenchmarkAI } from '../services/gemini';
import { User } from '../types';
import taxiAvatar from '../assets/taxi-avatar-cab.svg';
import {
  ACTIVE_SESSION_KEY,
  SESSIONS_KEY,
  Session,
  ChatMessage,
  appendMessage,
  deleteSession,
  loadSessions,
  makeFreshSession,
  pickActiveAfterDelete,
  pickInitialActiveId,
  renameSession,
  sortByRecent,
} from './Taxi.helpers';

interface TaxiProps { user: User | null; }

const SUGGESTED_PROMPTS = [
  'How do I compare on FTEs?',
  'What are the common AI use cases?',
  'Am I a market leader or follower?',
  'Where are my biggest automation gaps?',
  'How does my tech stack compare?',
];

interface ChatState { sessions: Session[]; activeId: string; }

function getInitialChat(): ChatState {
  const loaded = loadSessions();
  const sessions = loaded.length > 0 ? loaded : [makeFreshSession()];
  const activeId = pickInitialActiveId(sessions, localStorage.getItem(ACTIVE_SESSION_KEY));
  return { sessions, activeId };
}

const Taxi: React.FC<TaxiProps> = ({ user }) => {
  const isAdmin = user?.role === 'admin';
  const { data: allSubmissions = [] } = useSubmissions({ enabled: !!user });
  const mySubmission = React.useMemo(
    () => allSubmissions.find(s => s.userId === user?.id) || null,
    [allSubmissions, user?.id]
  );

  const [chat, setChat] = useState<ChatState>(getInitialChat);
  const { sessions, activeId } = chat;
  const activeSession = sessions.find(s => s.id === activeId) || sessions[0];
  const aiHistory = activeSession?.messages || [];
  const sortedSessions = React.useMemo(() => sortByRecent(sessions), [sessions]);

  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [menuOpenForId, setMenuOpenForId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

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
    try {
      const persistable = sessions.filter(s => s.messages.length > 0);
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(persistable));
    } catch { /* ignore quota errors */ }
  }, [sessions]);

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
    setAiInput('');
    scrollToBottom();
    try {
      const res = await askBenchmarkAI(query, mySubmission, allSubmissions);
      const newMsg: ChatMessage = { question: query, ...res };
      setChat(prev => ({ ...prev, sessions: appendMessage(prev.sessions, activeSession.id, newMsg) }));
    } finally {
      setIsAiLoading(false);
      scrollToBottom();
    }
  };

  const handleNewChat = () => {
    setMobileDrawerOpen(false);
    if (activeSession && activeSession.messages.length === 0) return;
    const fresh = makeFreshSession();
    setChat(prev => ({ sessions: [fresh, ...prev.sessions], activeId: fresh.id }));
    setAiInput('');
  };

  const handleSelectSession = (id: string) => {
    setMobileDrawerOpen(false);
    if (id === activeId) return;
    setChat(prev => ({ ...prev, activeId: id }));
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
    const draft = renameDraft;
    setRenamingId(null);
    setRenameDraft('');
    setChat(prev => ({ ...prev, sessions: renameSession(prev.sessions, id, draft) }));
  };

  const handleCancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  const handleDeleteSession = (id: string) => {
    setMenuOpenForId(null);
    const target = sessions.find(s => s.id === id);
    if (target && target.messages.length > 0) {
      const ok = window.confirm(`Delete "${target.title}"? This cannot be undone.`);
      if (!ok) return;
    }
    setChat(prev => {
      const remaining = deleteSession(prev.sessions, id);
      const nextActive = pickActiveAfterDelete(remaining, id, prev.activeId);
      if (remaining.length === 0) {
        const fresh = makeFreshSession();
        return { sessions: [fresh], activeId: fresh.id };
      }
      return { sessions: remaining, activeId: nextActive };
    });
  };

  if (!isAdmin && (!mySubmission || mySubmission.status === 'pending')) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-4">
        <div className="flex flex-col items-center justify-center text-center p-12 bg-white rounded-3xl shadow-lg border border-gray-100">
          <Lock className="h-16 w-16 text-gray-200 mb-6" />
          <h2 className="font-display text-2xl font-semibold text-gray-900">Taxi is Restricted</h2>
          <p className="text-gray-500 mt-2 max-w-sm">Submit your survey and await admin approval to chat with Taxi.</p>
          <Link to="/survey" className="mt-8 px-8 py-3 bg-primary text-white rounded-xl font-bold">Start Survey</Link>
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
        <div className="px-4 pt-4 pb-3 border-b border-gray-200">
          <div className="flex items-center justify-between gap-2 mb-4">
            <Link to="/" className="flex items-center gap-2.5 group min-w-0">
              <div className="w-7 h-7 border-[1.5px] border-gray-900 rounded-md grid place-items-center font-mono text-[12px] font-semibold text-gray-900 group-hover:border-primary group-hover:text-primary transition-colors flex-shrink-0">
                b
              </div>
              <span className="font-display text-[16px] font-semibold tracking-tight text-gray-900 truncate">
                benchmarktax<span className="text-amber-acc">.</span>ai
              </span>
            </Link>
            <button
              onClick={() => setMobileDrawerOpen(false)}
              className="lg:hidden p-1.5 rounded-md text-gray-500 hover:bg-gray-100 flex-shrink-0"
              aria-label="Close sessions"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 text-white rounded-xl font-bold shadow-sm hover:bg-indigo-600 active:scale-[0.98] transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>New Chat</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <p className="px-2 mb-2 text-[10px] font-black uppercase text-gray-400 tracking-widest">Recent</p>
          {sortedSessions.length === 0 || (sortedSessions.length === 1 && sortedSessions[0].messages.length === 0) ? (
            <p className="px-2 text-xs text-gray-400 font-medium">No conversations yet. Start chatting below.</p>
          ) : (
            <ul className="space-y-1">
              {sortedSessions.map(s => {
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

      {/* Chat column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="bg-gradient-to-br from-indigo-500 to-indigo-400 text-white px-4 py-5 sm:px-10 sm:py-6 shadow-md">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <button
                onClick={() => setMobileDrawerOpen(true)}
                className="lg:hidden p-2 -ml-1 rounded-lg text-white hover:bg-white/10 transition-colors flex-shrink-0"
                aria-label="Open chat sessions"
              >
                <Menu className="h-6 w-6" />
              </button>
              <img src={taxiAvatar} alt="Taxi" className="w-12 h-12 rounded-full shadow-lg flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-300" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200">Powered by Taxable AI</span>
                </div>
                <h1 className="font-display text-xl sm:text-2xl font-medium truncate">Ask Taxi</h1>
              </div>
            </div>
          </div>
        </header>

        {/* Chat scroll area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-8">
          <div className="max-w-4xl mx-auto space-y-8">
            {aiHistory.length === 0 && (
              <div className="py-12 text-center">
                <img src={taxiAvatar} alt="Taxi" className="w-24 h-24 mx-auto mb-6 rounded-full shadow-xl" />
                <h2 className="font-display text-2xl font-semibold text-gray-700 mb-3">Hey, I'm Taxi.</h2>
                <p className="text-gray-500 font-medium max-w-lg mx-auto text-lg leading-7">Ask me about your maturity level, automation gaps, FTE benchmarks, or how you stack up against peers.</p>
              </div>
            )}
            {aiHistory.map((item, i) => (
              <div key={i} className="space-y-4 animate-fadeIn">
                <div className="flex justify-end">
                  <div className="bg-indigo-500 text-white px-6 py-4 rounded-2xl text-[18px] leading-[28px] font-semibold max-w-[90%] sm:max-w-[80%] shadow-lg">{item.question}</div>
                </div>
                <div className="flex justify-start items-start gap-3">
                  <img src={taxiAvatar} alt="Taxi" className="w-9 h-9 rounded-full shadow-md flex-shrink-0 mt-1" />
                  <div className="bg-white border border-gray-100 p-5 sm:p-7 rounded-3xl max-w-full sm:max-w-[90%] shadow-sm">
                    <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-3">Taxi</p>
                    <div className="text-[18px] text-gray-700 leading-[32px] [&_p]:my-4 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-gray-900 [&_ul]:my-4 [&_ul]:pl-6 [&_ul]:list-disc [&_ol]:my-4 [&_ol]:pl-6 [&_ol]:list-decimal [&_li]:my-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-3 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:bg-gray-100 [&_code]:rounded [&_code]:font-mono [&_code]:text-[17px]">
                      <ReactMarkdown>{item.analysis}</ReactMarkdown>
                    </div>
                    {item.chart && (
                      <div className="mt-8 p-6 bg-gray-50 rounded-2xl border border-gray-100 h-64 min-h-[256px]" role="img" aria-label={`${item.chart.title} bar chart`}>
                        <p className="text-[10px] font-black uppercase text-gray-400 mb-4">{item.chart.title}</p>
                        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                          <BarChart data={item.chart.data}>
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {item.followUps && item.followUps.length > 0 && i === aiHistory.length - 1 && (
                      <div className="mt-6 pt-4 border-t border-gray-200">
                        <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3">Dig deeper</p>
                        <div className="flex flex-wrap gap-2">
                          {item.followUps.map((q: string) => (
                            <button key={q} onClick={() => handleAiQuery(q)} className="px-5 py-3 bg-indigo-50 text-indigo-700 rounded-full text-[17px] font-semibold hover:bg-indigo-100 active:bg-indigo-200 transition-all border border-indigo-200 shadow-sm">{q}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isAiLoading && (
              <div className="flex items-center gap-3 text-primary animate-pulse">
                <img src={taxiAvatar} alt="Taxi" className="w-9 h-9 rounded-full shadow-md" />
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-xs font-black uppercase tracking-widest">Taxi is analyzing your data...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input bar */}
        <div className="border-t border-gray-200 bg-white px-4 sm:px-6 py-4">
          <div className="max-w-4xl mx-auto space-y-3">
            {aiHistory.length === 0 && (
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTED_PROMPTS.map(s => (
                  <button
                    key={s}
                    onClick={() => handleAiQuery(s)}
                    className="px-5 py-3 bg-indigo-50 text-indigo-700 rounded-full text-[17px] font-semibold hover:bg-indigo-100 transition-all border border-indigo-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="relative">
              <input
                type="text"
                placeholder="Ask Taxi anything about your benchmark..."
                className="w-full pl-6 pr-16 py-5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary text-[18px] font-medium shadow-inner"
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAiQuery()}
                disabled={isAiLoading}
              />
              <button
                onClick={() => handleAiQuery()}
                disabled={isAiLoading || !aiInput.trim()}
                className="absolute right-2 top-2 bottom-2 px-5 bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:scale-105 transition-all disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
                aria-label="Send"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Taxi;
