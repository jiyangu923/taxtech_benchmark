import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Submission, User } from '../types';
import { Lock, Sparkles, TrendingUp, Users, ArrowRight, Database, DollarSign, Brain, Layers, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
  ScatterChart, Scatter, ZAxis, ReferenceLine,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import * as C from '../constants';
import taxiAvatar from '../assets/taxi-avatar-cab.svg';
import {
  compositeAuto, compositeCost, costPerAutoPoint,
  automationRadar, automationVsCost, costPerAutoRanking,
  resourceMixByRevenue, aiAdoptionFunnel, architectureByRevenue,
  fmtCostM,
} from './Report.helpers';

interface ReportProps { user: User | null; }

const COLORS = {
  primary: '#1e3a8a',
  secondary: '#4f46e5',
  accent: '#0ea5e9',
  industry: '#94a3b8',
  you: '#1e3a8a',
  peer: '#94a3b8',
  pie: ['#4f46e5', '#818cf8', '#a5b4fc', '#c7d2fe', '#e2e8f0', '#312e81', '#6366f1'],
  funnel: ['#cbd5e1', '#a5b4fc', '#818cf8', '#4f46e5', '#312e81'],
};

/**
 * Maps an automation range key to a representative numeric percentage.
 * Exported for unit testing.
 */
export function mapAuto(val?: string): number {
  const m: Record<string, number> = { '99_plus': 99.5, '90_99': 95, '70_90': 80, '40_70': 55, 'under_40': 20 };
  return val ? m[val] ?? 0 : 0;
}

/**
 * Computes aggregate industry statistics from a list of submissions.
 * Exported for unit testing — shape is depended on by Report.test.ts.
 */
export function calculateIndustryStats(allSubs: Submission[]) {
  const valid = allSubs.filter(s => s.status !== 'rejected');
  const n = valid.length;
  if (n === 0) return null;

  const avg = (fn: (s: Submission) => number) => valid.reduce((acc, s) => acc + fn(s), 0) / n;

  const archCounts: Record<string, number> = {};
  valid.forEach(s => {
    if (s.taxDataArchitecture) archCounts[s.taxDataArchitecture] = (archCounts[s.taxDataArchitecture] || 0) + 1;
  });
  const archData = Object.keys(archCounts).map(k => ({
    name: C.OPTS_TAX_DATA_ARCH.find(o => o.value === k)?.label || k,
    value: archCounts[k],
  }));

  return {
    averages: {
      calculation: Math.round(avg(s => mapAuto(s.taxCalculationAutomationRange))),
      payment:     Math.round(avg(s => mapAuto(s.taxPaymentAutomationRange))),
      compliance:  Math.round(avg(s => mapAuto(s.complianceAutomationCoverageRange))),
      techFTE:     Math.round(avg(s => (s.taxTechFTEsRange === 'over_100' ? 120 : 10))),
      bizFTE:      Math.round(avg(s => (s.taxBusinessFTEsRange === 'over_150' ? 170 : 20))),
      aiRate:      Math.round((valid.filter(s => s.aiAdopted).length / n) * 100),
    },
    archData,
  };
}

type TabKey = 'overview' | 'automation' | 'cost' | 'ai';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'overview',   label: 'Overview',         icon: <BarChart3 className="h-4 w-4" /> },
  { key: 'automation', label: 'Automation',       icon: <TrendingUp className="h-4 w-4" /> },
  { key: 'cost',       label: 'Cost & Resources', icon: <DollarSign className="h-4 w-4" /> },
  { key: 'ai',         label: 'AI Maturity',      icon: <Brain className="h-4 w-4" /> },
];

const Report: React.FC<ReportProps> = ({ user }) => {
  const isAdmin = user?.role === 'admin';
  const [mySubmission, setMySubmission] = useState<Submission | null>(null);
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [industryStats, setIndustryStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  useEffect(() => {
    if (user) {
      const loadData = async () => {
        const subs = await api.getSubmissions();
        setAllSubmissions(subs);
        const mySub = subs.find(s => s.userId === user.id) || null;
        setMySubmission(mySub);
        if (mySub || isAdmin) {
          const stats = calculateIndustryStats(subs);
          if (stats) setIndustryStats(stats);
        }
      };
      loadData();
    }
  }, [user]);

  if (!isAdmin && (!mySubmission || mySubmission.status === 'pending')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-12 bg-white rounded-3xl shadow-lg border border-gray-100">
        <Lock className="h-16 w-16 text-gray-200 mb-6" />
        <h2 className="font-display text-2xl font-semibold text-gray-900">Analysis Restricted</h2>
        <p className="text-gray-500 mt-2 max-w-sm">Please submit your survey and await admin approval to unlock industry benchmarking.</p>
        <Link to="/survey" className="mt-8 px-8 py-3 bg-primary text-white rounded-xl font-bold">Start Survey</Link>
      </div>
    );
  }

  const approvedPeers = allSubmissions.filter(s => s.status === 'approved');

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-amber-acc-2 mb-2">Q{Math.floor((new Date().getMonth() / 3)) + 1} {new Date().getFullYear()} · Benchmark</p>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-gray-900 tracking-tight leading-tight">Benchmark Analytics</h1>
          <p className="text-gray-500 font-medium mt-1">Peer-to-peer maturity comparisons</p>
        </div>
        <div className="bg-indigo-50 p-3 sm:p-4 rounded-2xl flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] font-mono uppercase tracking-wider text-amber-acc-2">Sample Size</p>
            <p className="font-mono text-sm font-semibold text-indigo-900 tabular-nums">{approvedPeers.length} Entities</p>
          </div>
          <Users className="h-6 w-6 text-indigo-600" />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-2 sm:gap-6 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`pb-3 px-2 sm:px-1 border-b-2 font-bold text-xs sm:text-sm transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'overview'   && <OverviewTab   subs={approvedPeers} mySub={mySubmission} stats={industryStats} />}
      {activeTab === 'automation' && <AutomationTab subs={approvedPeers} mySub={mySubmission} />}
      {activeTab === 'cost'       && <CostTab       subs={approvedPeers} mySub={mySubmission} />}
      {activeTab === 'ai'         && <AiTab         subs={approvedPeers} />}

      {/* Persistent Taxi CTA */}
      <Link to="/taxi" className="block group">
        <div className="bg-gradient-to-br from-primary to-secondary rounded-3xl shadow-xl overflow-hidden border border-gray-100 p-6 sm:p-8 text-white hover:shadow-2xl transition-all">
          <div className="flex items-center gap-6">
            <img src={taxiAvatar} alt="Taxi" className="w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-lg flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-indigo-300" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200">Powered by Taxable AI</span>
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-medium mb-1">Ask Taxi</h2>
              <p className="text-sm text-indigo-100 font-medium">Get a personalized read on any of these reports.</p>
            </div>
            <ArrowRight className="h-5 w-5 text-white opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all flex-shrink-0" />
          </div>
        </div>
      </Link>
    </div>
  );
};

export default Report;

// ─── Tabs ───────────────────────────────────────────────────────────────────────

const Card: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }> = ({ icon, title, subtitle, children }) => (
  <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-xl border border-gray-100">
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-center gap-3">
        {icon}
        <h3 className="font-display text-xl font-medium text-gray-900">{title}</h3>
      </div>
    </div>
    {subtitle && <p className="text-sm text-gray-500 -mt-4 mb-4 font-medium">{subtitle}</p>}
    {children}
  </div>
);

// ─── 1. Overview ────────────────────────────────────────────────────────────────

const OverviewTab: React.FC<{ subs: Submission[]; mySub: Submission | null; stats: any }> = ({ subs, mySub, stats }) => {
  const archByRev = architectureByRevenue(subs);
  const archKeys  = archByRev.length > 0 ? Object.keys(archByRev[0]).filter(k => k !== 'band') : [];

  const myAuto = mySub ? compositeAuto(mySub) : 0;
  const peerAuto = stats ? Math.round((stats.averages.calculation + stats.averages.payment + stats.averages.compliance) / 3) : 0;

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Your Automation Index" value={`${myAuto}/100`} delta={mySub ? `${myAuto - peerAuto >= 0 ? '+' : ''}${myAuto - peerAuto} vs peers` : '—'} />
        <KpiCard label="Peer Sample" value={`${subs.length}`} delta="approved entities" />
        <KpiCard label="AI Adoption (industry)" value={`${stats?.averages.aiRate ?? 0}%`} delta="have adopted GenAI" />
        <KpiCard label="Architectures Tracked" value={`${stats?.archData?.length ?? 0}`} delta="distinct types" />
      </div>

      {/* Architecture by revenue */}
      <Card icon={<Database className="h-5 w-5 text-indigo-600" />} title="Architecture mix by revenue band" subtitle="How peer organizations of similar size structure their tax data architecture.">
        <div className="h-64 sm:h-72 min-h-[256px]" role="img" aria-label="Stacked bar chart showing data architecture distribution across revenue bands">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <BarChart data={archByRev}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="band" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {archKeys.map((k, i) => (
                <Bar key={k} dataKey={k} stackId="a" fill={COLORS.pie[i % COLORS.pie.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};

// ─── 2. Automation ──────────────────────────────────────────────────────────────

const AutomationTab: React.FC<{ subs: Submission[]; mySub: Submission | null }> = ({ subs, mySub }) => {
  const radar = automationRadar(mySub, subs);

  return (
    <div className="space-y-6">
      <Card icon={<TrendingUp className="h-5 w-5 text-primary" />} title="Automation maturity radar" subtitle="Your coverage across all 7 tax streams vs peer median. Outer ring = full automation.">
        <div className="h-80 min-h-[320px]" role="img" aria-label="Radar chart comparing your automation across 7 tax streams against the peer median">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <RadarChart data={radar}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fontWeight: 600, fill: '#475569' }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Radar name="You"         dataKey="you"  stroke={COLORS.you}  fill={COLORS.you}  fillOpacity={0.3} />
              <Radar name="Peer median" dataKey="peer" stroke={COLORS.peer} fill={COLORS.peer} fillOpacity={0.2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card icon={<TrendingUp className="h-5 w-5 text-primary" />} title="Stream-by-stream comparison" subtitle="Same data as the radar, viewed as bars — easier to scan exact gaps.">
        <div className="h-64 min-h-[256px]" role="img" aria-label="Bar chart comparing your automation rate per tax stream to the peer median">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <BarChart data={radar} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="dimension" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="you"  name="You"         fill={COLORS.you}  radius={[0, 4, 4, 0]} />
              <Bar dataKey="peer" name="Peer median" fill={COLORS.peer} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};

// ─── 3. Cost & Resources ────────────────────────────────────────────────────────

const CostTab: React.FC<{ subs: Submission[]; mySub: Submission | null }> = ({ subs, mySub }) => {
  const scatter = automationVsCost(mySub, subs);
  const ranking = costPerAutoRanking(mySub, subs);
  const mix     = resourceMixByRevenue(subs);

  return (
    <div className="space-y-6">
      <Card icon={<DollarSign className="h-5 w-5 text-primary" />} title="Automation vs Cost" subtitle={`Each dot is one organization. Dashed lines = peer medians. Quadrants identify Leaders, Efficient, Cost-Heavy, Underinvested. Cost = (FTEs × $${(150).toLocaleString()}K) + budget midpoint.`}>
        <div className="h-96 min-h-[384px] relative" role="img" aria-label="Scatter plot positioning each organization by total cost (x-axis) and composite automation index (y-axis)">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                type="number"
                dataKey="cost"
                name="Cost"
                tick={{ fontSize: 10 }}
                tickFormatter={fmtCostM}
                label={{ value: 'Annual cost (USD)', position: 'insideBottom', offset: -10, style: { fontSize: 11, fill: '#64748b' } }}
              />
              <YAxis
                type="number"
                dataKey="auto"
                name="Automation"
                domain={[0, 100]}
                tick={{ fontSize: 10 }}
                label={{ value: 'Automation index (%)', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#64748b' } }}
              />
              <ZAxis range={[80, 80]} />
              <ReferenceLine x={scatter.medianCost} stroke="#cbd5e1" strokeDasharray="4 4" />
              <ReferenceLine y={scatter.medianAuto} stroke="#cbd5e1" strokeDasharray="4 4" />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(value: any, name: string) => name === 'Cost' ? fmtCostM(Number(value)) : `${value}%`}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''}
              />
              <Scatter data={scatter.points.filter(p => !p.isYou)} fill={COLORS.peer} fillOpacity={0.6} />
              <Scatter data={scatter.points.filter(p => p.isYou)}  fill={COLORS.you}  shape="star" />
            </ScatterChart>
          </ResponsiveContainer>
          {/* Quadrant labels */}
          <div className="absolute inset-0 pointer-events-none text-[10px] font-black uppercase tracking-widest text-gray-300">
            <span className="absolute top-6 right-6">LEADERS</span>
            <span className="absolute top-6 left-16">EFFICIENT</span>
            <span className="absolute bottom-12 right-6">COST-HEAVY</span>
            <span className="absolute bottom-12 left-16">UNDERINVESTED</span>
          </div>
        </div>
      </Card>

      <Card icon={<DollarSign className="h-5 w-5 text-primary" />} title="Cost per automation point ($K)" subtitle="Lower is better — who's getting more automation per dollar spent. Ranked ascending. You highlighted in primary.">
        <div className="h-72 min-h-[288px]" role="img" aria-label="Bar chart ranking cost per automation point in thousands of dollars across peers, lowest cost first">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <BarChart data={ranking}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}K`} />
              <Tooltip formatter={(value: any) => `$${value}K per auto-point`} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {ranking.map((p, i) => (
                  <Cell key={i} fill={p.isYou ? COLORS.you : COLORS.peer} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card icon={<Users className="h-5 w-5 text-primary" />} title="Resource mix by revenue band" subtitle="Average tax-tech FTE / tax-business FTE / outsourced headcount per revenue band.">
        <div className="h-64 min-h-[256px]" role="img" aria-label="Stacked bar chart showing average insourced and outsourced FTE counts across revenue bands">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <BarChart data={mix}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="band" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="tech"       stackId="r" name="Tax-tech FTE"       fill={COLORS.primary} />
              <Bar dataKey="biz"        stackId="r" name="Tax-business FTE"   fill={COLORS.secondary} />
              <Bar dataKey="outsourced" stackId="r" name="Outsourced"         fill={COLORS.peer} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};

// ─── 4. AI Maturity ─────────────────────────────────────────────────────────────

const AiTab: React.FC<{ subs: Submission[] }> = ({ subs }) => {
  const funnel = aiAdoptionFunnel(subs);

  return (
    <div className="space-y-6">
      <Card icon={<Brain className="h-5 w-5 text-primary" />} title="AI adoption funnel" subtitle="Where the peer set sits across GenAI adoption stages, from no-adoption to enterprise-wide deployment.">
        <div className="h-64 min-h-[256px]" role="img" aria-label="Horizontal bar chart showing the count and percent of peers at each AI adoption stage">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <BarChart data={funnel} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="stage" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
              <Tooltip formatter={(value: any, _name: string, props: any) => [`${value} (${props.payload.pct}%)`, 'Peers']} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {funnel.map((_, i) => (
                  <Cell key={i} fill={COLORS.funnel[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Top use cases (free-text, frequency) */}
      <Card icon={<Layers className="h-5 w-5 text-primary" />} title="Top reported AI use cases" subtitle="Most common phrases peers cite when describing where they're using GenAI today. Computed from free-text answers.">
        <UseCaseList subs={subs} />
      </Card>
    </div>
  );
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

const KpiCard: React.FC<{ label: string; value: string; delta?: string }> = ({ label, value, delta }) => (
  <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
    <div className="font-mono text-[10px] uppercase tracking-wider text-amber-acc-2 mb-2">{label}</div>
    <div className="font-mono text-2xl font-semibold text-gray-900 leading-none tabular-nums">{value}</div>
    {delta && <div className="text-xs text-gray-500 mt-2 font-medium">{delta}</div>}
  </div>
);

const UseCaseList: React.FC<{ subs: Submission[] }> = ({ subs }) => {
  // Tokenize the free-text aiUseCases field into rough phrase counts.
  const phrases: Record<string, number> = {};
  subs.forEach(s => {
    if (!s.aiUseCases) return;
    s.aiUseCases
      .toLowerCase()
      .split(/[,;.\n]+/)
      .map(p => p.trim())
      .filter(p => p.length > 4 && p.length < 80)
      .forEach(p => { phrases[p] = (phrases[p] || 0) + 1; });
  });

  const top = Object.entries(phrases)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  if (top.length === 0) {
    return <p className="text-sm text-gray-400 italic py-4">No use cases reported yet — peers haven't filled this field.</p>;
  }

  return (
    <ul className="divide-y divide-gray-100">
      {top.map(([phrase, count]) => (
        <li key={phrase} className="py-3 flex items-center justify-between gap-4">
          <span className="text-sm text-gray-700 font-medium capitalize truncate">{phrase}</span>
          <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full whitespace-nowrap">{count} mentions</span>
        </li>
      ))}
    </ul>
  );
};
