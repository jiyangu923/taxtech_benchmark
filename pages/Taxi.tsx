import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Send, Loader2, Trash2, Lock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { api } from '../services/api';
import { askBenchmarkAI } from '../services/gemini';
import { Submission, User } from '../types';
import taxiAvatar from '../assets/taxi-avatar-cab.svg';

interface TaxiProps { user: User | null; }

const SUGGESTED_PROMPTS = [
  'How do I compare on FTEs?',
  'What are the common AI use cases?',
  'Am I a market leader or follower?',
  'Where are my biggest automation gaps?',
  'How does my tech stack compare?',
];

const Taxi: React.FC<TaxiProps> = ({ user }) => {
  const isAdmin = user?.role === 'admin';
  const [mySubmission, setMySubmission] = useState<Submission | null>(null);
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiHistory, setAiHistory] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('taxi_chat_history');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const trimmed = aiHistory.length > 50 ? aiHistory.slice(-50) : aiHistory;
      localStorage.setItem('taxi_chat_history', JSON.stringify(trimmed));
    } catch { /* ignore quota errors */ }
  }, [aiHistory]);

  useEffect(() => {
    if (!user) return;
    api.getSubmissions().then(subs => {
      setAllSubmissions(subs);
      setMySubmission(subs.find(s => s.userId === user.id) || null);
    });
  }, [user]);

  const scrollToBottom = () => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleAiQuery = async (q?: string) => {
    const query = (q || aiInput).trim();
    if (!query || (!mySubmission && !isAdmin) || isAiLoading) return;
    setIsAiLoading(true);
    setAiInput('');
    scrollToBottom();
    try {
      const res = await askBenchmarkAI(query, mySubmission, allSubmissions);
      setAiHistory(prev => [...prev, { question: query, ...res }]);
    } finally {
      setIsAiLoading(false);
      scrollToBottom();
    }
  };

  const clearChat = () => {
    if (!window.confirm('Clear all chat history?')) return;
    setAiHistory([]);
    localStorage.removeItem('taxi_chat_history');
  };

  if (!isAdmin && (!mySubmission || mySubmission.status === 'pending')) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-4">
        <div className="flex flex-col items-center justify-center text-center p-12 bg-white rounded-3xl shadow-lg border border-gray-100">
          <Lock className="h-16 w-16 text-gray-200 mb-6" />
          <h2 className="text-2xl font-black text-gray-900">Taxi is Restricted</h2>
          <p className="text-gray-500 mt-2 max-w-sm">Submit your survey and await admin approval to chat with Taxi.</p>
          <Link to="/survey" className="mt-8 px-8 py-3 bg-primary text-white rounded-xl font-bold">Start Survey</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-br from-primary to-secondary text-white px-6 py-5 sm:px-10 sm:py-6 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <img src={taxiAvatar} alt="Taxi" className="w-12 h-12 rounded-full shadow-lg flex-shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-300" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200">Powered by Taxable AI</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black truncate">Ask Taxi</h1>
            </div>
          </div>
          {aiHistory.length > 0 && (
            <button
              onClick={clearChat}
              className="flex items-center gap-2 px-3 py-2 text-indigo-100 hover:text-white hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
              title="Clear chat history"
            >
              <Trash2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </header>

      {/* Chat scroll area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {aiHistory.length === 0 && (
            <div className="py-12 text-center">
              <img src={taxiAvatar} alt="Taxi" className="w-24 h-24 mx-auto mb-6 rounded-full shadow-xl" />
              <h2 className="text-xl font-black text-gray-700 mb-2">Hey, I'm Taxi.</h2>
              <p className="text-gray-500 font-medium max-w-md mx-auto">Ask me about your maturity level, automation gaps, FTE benchmarks, or how you stack up against peers.</p>
            </div>
          )}
          {aiHistory.map((item, i) => (
            <div key={i} className="space-y-4 animate-fadeIn">
              <div className="flex justify-end">
                <div className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold max-w-[90%] sm:max-w-[80%] shadow-lg">{item.question}</div>
              </div>
              <div className="flex justify-start items-start gap-3">
                <img src={taxiAvatar} alt="Taxi" className="w-9 h-9 rounded-full shadow-md flex-shrink-0 mt-1" />
                <div className="bg-white border border-gray-100 p-5 sm:p-7 rounded-3xl max-w-full sm:max-w-[90%] shadow-sm">
                  <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-3">Taxi</p>
                  <div className="prose prose-sm text-gray-700 font-medium leading-relaxed">
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
                          <Bar dataKey="value" fill="#1e3a8a" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {item.followUps?.length > 0 && i === aiHistory.length - 1 && (
                    <div className="mt-6 pt-4 border-t border-gray-200">
                      <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3">Dig deeper</p>
                      <div className="flex flex-wrap gap-2">
                        {item.followUps.map((q: string) => (
                          <button key={q} onClick={() => handleAiQuery(q)} className="px-4 py-2.5 bg-indigo-50 text-indigo-700 rounded-full text-xs sm:text-sm font-bold hover:bg-indigo-100 active:bg-indigo-200 transition-all border border-indigo-200 shadow-sm">{q}</button>
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
                  className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold hover:bg-indigo-100 transition-all border border-indigo-100"
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
              className="w-full pl-5 pr-16 py-4 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary font-medium shadow-inner"
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAiQuery()}
              disabled={isAiLoading}
            />
            <button
              onClick={() => handleAiQuery()}
              disabled={isAiLoading || !aiInput.trim()}
              className="absolute right-2 top-2 bottom-2 px-5 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
              aria-label="Send"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Taxi;
