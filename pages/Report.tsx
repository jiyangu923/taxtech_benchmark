import React, { useEffect, useState, useRef } from 'react';
import { mockStore } from '../services/mockStore';
import { Submission, User } from '../types';
import { 
  Lock, FileText, CheckCircle, Sparkles, BarChart3, TrendingUp, Users, 
  BrainCircuit, Hammer, Layers, Ruler, ArrowRight, Send, Loader2, 
  MessageSquare, Lightbulb, RefreshCcw, XCircle, Database
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell
} from 'recharts';
import * as C from '../constants';
import { askBenchmarkAI } from '../services/gemini';

interface ReportProps { user: User | null; }

const COLORS = {
  primary: '#1e3a8a',
  secondary: '#4f46e5', 
  accent: '#0ea5e9',
  industry: '#94a3b8',
  pie: ['#4f46e5', '#818cf8', '#a5b4fc', '#c7d2fe', '#e2e8f0']
};

const Report: React.FC<ReportProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'indirect' | 'direct'>('indirect');
  const [mySubmission, setMySubmission] = useState<Submission | null>(null);
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [industryStats, setIndustryStats] = useState<any>(null);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiHistory, setAiHistory] = useState<any[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
        const subs = mockStore.getSubmissions();
        setAllSubmissions(subs);
        const mySub = subs.find(s => s.userId === user.id) || null;
        setMySubmission(mySub);
        if (mySub) calculateIndustryStats(subs, mySub);
    }
  }, [user]);

  const mapAuto = (val?: string) => {
    const m: any = { '99_plus': 99.5, '90_99': 95, '70_90': 80, '40_70': 55, 'under_40': 20 };
    return val ? m[val] || 0 : 0;
  };

  const calculateIndustryStats = (allSubs: Submission[], mySub: Submission) => {
    const valid = allSubs.filter(s => s.status !== 'rejected');
    const n = valid.length;
    if (n === 0) return;

    const avg = (fn: (s: Submission) => number) => valid.reduce((acc, s) => acc + fn(s), 0) / n;

    const archCounts: any = {};
    valid.forEach(s => { if (s.taxDataArchitecture) archCounts[s.taxDataArchitecture] = (archCounts[s.taxDataArchitecture] || 0) + 1; });
    const archData = Object.keys(archCounts).map(k => ({ name: C.OPTS_TAX_DATA_ARCH.find(o => o.value === k)?.label || k, value: archCounts[k] }));

    setIndustryStats({
      averages: {
        calculation: Math.round(avg(s => mapAuto(s.taxCalculationAutomationRange))),
        payment: Math.round(avg(s => mapAuto(s.taxPaymentAutomationRange))),
        compliance: Math.round(avg(s => mapAuto(s.complianceAutomationCoverageRange))),
        techFTE: Math.round(avg(s => (s.taxTechFTEsRange === 'over_100' ? 120 : 10))),
        bizFTE: Math.round(avg(s => (s.taxBusinessFTEsRange === 'over_150' ? 170 : 20))),
        aiRate: Math.round((valid.filter(s => s.aiAdopted).length / n) * 100)
      },
      archData
    });
  };

  const handleAiQuery = async (q?: string) => {
    const query = q || aiInput;
    if (!query || !mySubmission || isAiLoading) return;
    setIsAiLoading(true);
    setAiInput('');
    try {
      const res = await askBenchmarkAI(query, mySubmission, allSubmissions);
      setAiHistory(prev => [...prev, { question: query, ...res }]);
    } finally { setIsAiLoading(false); }
  };

  if (!mySubmission || mySubmission.status === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-12 bg-white rounded-3xl shadow-lg border border-gray-100">
        <Lock className="h-16 w-16 text-gray-200 mb-6" />
        <h2 className="text-2xl font-black text-gray-900">Analysis Restricted</h2>
        <p className="text-gray-500 mt-2 max-w-sm">Please submit your survey and await admin approval to unlock industry benchmarking.</p>
        <Link to="/survey" className="mt-8 px-8 py-3 bg-primary text-white rounded-xl font-bold">Start Survey</Link>
      </div>
    );
  }

  const autoData = [
    { name: 'Calc', you: mapAuto(mySubmission.taxCalculationAutomationRange), avg: industryStats?.averages.calculation },
    { name: 'Payment', you: mapAuto(mySubmission.taxPaymentAutomationRange), avg: industryStats?.averages.payment },
    { name: 'Compl.', you: mapAuto(mySubmission.complianceAutomationCoverageRange), avg: industryStats?.averages.compliance },
  ];

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 space-y-8 animate-fadeIn">
      <div className="flex justify-between items-end">
        <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tight">Benchmark Analytics</h1>
            <p className="text-gray-500 font-medium">Peer-to-peer maturity comparisons</p>
        </div>
        <div className="bg-indigo-50 p-4 rounded-2xl flex items-center gap-4">
            <div className="text-right">
                <p className="text-[10px] font-black uppercase text-indigo-400">Sample Size</p>
                <p className="text-sm font-black text-indigo-900">{allSubmissions.length} Entities</p>
            </div>
            <Users className="h-6 w-6 text-indigo-600" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Automation Bar Chart */}
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100">
          <div className="flex items-center gap-3 mb-8">
            <TrendingUp className="h-6 w-6 text-primary" />
            <h3 className="text-lg font-black text-gray-900">Automation Gaps</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={autoData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{fontSize: 10, fontWeight: 700}} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="you" name="You" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
                <Bar dataKey="avg" name="Peer Avg" fill={COLORS.industry} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Data Architecture Pie */}
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100">
            <div className="flex items-center gap-3 mb-8">
                <Database className="h-6 w-6 text-indigo-600" />
                <h3 className="text-lg font-black text-gray-900">Industry Data Architecture</h3>
            </div>
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={industryStats?.archData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                            {industryStats?.archData.map((_:any, i:number) => <Cell key={i} fill={COLORS.pie[i % COLORS.pie.length]} />)}
                        </Pie>
                        <Tooltip />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>

      {/* AI Analyst Section */}
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100">
          <div className="bg-gradient-to-br from-primary to-secondary p-10 text-white">
              <div className="flex items-center gap-3 mb-4">
                  <Sparkles className="h-8 w-8 text-indigo-300" />
                  <span className="text-xs font-black uppercase tracking-[0.2em]">Strategy Assistant</span>
              </div>
              <h2 className="text-4xl font-black mb-4">Benchmark Intelligence</h2>
              <p className="text-indigo-100 max-w-2xl font-medium leading-relaxed">Ask specific questions about your maturity level, automation roadmap, or peer architecture choices.</p>
          </div>
          <div className="p-10">
              <div className="space-y-8 max-h-[500px] overflow-y-auto mb-10 px-2 custom-scrollbar">
                  {aiHistory.length === 0 && (
                      <div className="py-12 text-center opacity-30">
                          <BrainCircuit className="h-16 w-16 mx-auto mb-4" />
                          <p className="font-bold">Select a suggested analysis to begin</p>
                      </div>
                  )}
                  {aiHistory.map((item, i) => (
                      <div key={i} className="space-y-4 animate-fadeIn">
                          <div className="flex justify-end"><div className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold max-w-[80%] shadow-lg">{item.question}</div></div>
                          <div className="flex justify-start">
                              <div className="bg-gray-50 border border-gray-100 p-8 rounded-3xl max-w-[95%] shadow-sm">
                                  <div className="prose prose-sm text-gray-700 font-medium leading-relaxed whitespace-pre-wrap">{item.analysis}</div>
                                  {item.chart && (
                                      <div className="mt-8 p-6 bg-white rounded-2xl border border-gray-100 h-64 shadow-inner">
                                          <p className="text-[10px] font-black uppercase text-gray-400 mb-4">{item.chart.title}</p>
                                          <ResponsiveContainer width="100%" height="100%">
                                              <BarChart data={item.chart.data}><XAxis dataKey="name" tick={{fontSize: 10}} /><YAxis tick={{fontSize: 10}} /><Tooltip /><Bar dataKey="value" fill={COLORS.primary} radius={[4, 4, 0, 0]} /></BarChart>
                                          </ResponsiveContainer>
                                      </div>
                                  )}
                              </div>
                          </div>
                      </div>
                  ))}
                  {isAiLoading && <div className="flex items-center gap-3 text-primary animate-pulse"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-xs font-black uppercase tracking-widest">Synthesizing benchmark data...</span></div>}
                  <div ref={chatEndRef} />
              </div>
              <div className="flex flex-wrap gap-2 mb-8">
                  {["How do I compare on FTEs?", "What are the common AI use cases?", "Am I a market leader or follower?"].map(s => (
                      <button key={s} onClick={() => handleAiQuery(s)} className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all border border-indigo-100">{s}</button>
                  ))}
              </div>
              <div className="relative">
                  <input type="text" placeholder="Type your query..." className="w-full pl-6 pr-16 py-5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary font-bold shadow-inner" value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleAiQuery()} />
                  <button onClick={() => handleAiQuery()} className="absolute right-2 top-2 bottom-2 px-6 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"><Send className="h-5 w-5" /></button>
              </div>
          </div>
      </div>
    </div>
  );
};

export default Report;