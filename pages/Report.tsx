import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Submission, User } from '../types';
import { Lock, Sparkles, TrendingUp, Users, ArrowRight, Database } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import * as C from '../constants';
import taxiAvatar from '../assets/taxi-avatar-cab.svg';

interface ReportProps { user: User | null; }

const COLORS = {
  primary: '#1e3a8a',
  secondary: '#4f46e5', 
  accent: '#0ea5e9',
  industry: '#94a3b8',
  pie: ['#4f46e5', '#818cf8', '#a5b4fc', '#c7d2fe', '#e2e8f0']
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
 * Exported for unit testing.
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

const Report: React.FC<ReportProps> = ({ user }) => {
  const isAdmin = user?.role === 'admin';
  const [mySubmission, setMySubmission] = useState<Submission | null>(null);
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [industryStats, setIndustryStats] = useState<any>(null);

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
        <h2 className="text-2xl font-black text-gray-900">Analysis Restricted</h2>
        <p className="text-gray-500 mt-2 max-w-sm">Please submit your survey and await admin approval to unlock industry benchmarking.</p>
        <Link to="/survey" className="mt-8 px-8 py-3 bg-primary text-white rounded-xl font-bold">Start Survey</Link>
      </div>
    );
  }

  const autoData = [
    { name: 'Calc', you: mapAuto(mySubmission?.taxCalculationAutomationRange), avg: industryStats?.averages.calculation },
    { name: 'Payment', you: mapAuto(mySubmission?.taxPaymentAutomationRange), avg: industryStats?.averages.payment },
    { name: 'Compl.', you: mapAuto(mySubmission?.complianceAutomationCoverageRange), avg: industryStats?.averages.compliance },
  ];

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 space-y-8 animate-fadeIn">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 tracking-tight">Benchmark Analytics</h1>
            <p className="text-gray-500 font-medium">Peer-to-peer maturity comparisons</p>
        </div>
        <div className="bg-indigo-50 p-3 sm:p-4 rounded-2xl flex items-center gap-4">
            <div className="text-right">
                <p className="text-[10px] font-black uppercase text-indigo-400">Sample Size</p>
                <p className="text-sm font-black text-indigo-900">{allSubmissions.length} Entities</p>
            </div>
            <Users className="h-6 w-6 text-indigo-600" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
        {/* Automation Bar Chart */}
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100">
          <div className="flex items-center gap-3 mb-8">
            <TrendingUp className="h-6 w-6 text-primary" />
            <h3 className="text-lg font-black text-gray-900">Automation Gaps</h3>
          </div>
          <div className="h-48 sm:h-56 md:h-64 min-h-[192px]" role="img" aria-label="Automation Gaps bar chart comparing your automation levels to peer average">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
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
            <div className="h-48 sm:h-56 md:h-64 min-h-[192px]" role="img" aria-label="Industry Data Architecture pie chart showing distribution of data architecture types">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
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

      {/* Taxi AI CTA */}
      <Link to="/taxi" className="block group">
        <div className="bg-gradient-to-br from-primary to-secondary rounded-3xl shadow-xl overflow-hidden border border-gray-100 p-8 sm:p-10 text-white hover:shadow-2xl transition-all">
          <div className="flex items-center gap-6">
            <img src={taxiAvatar} alt="Taxi" className="w-16 h-16 sm:w-20 sm:h-20 rounded-full shadow-lg flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-indigo-300" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200">Powered by Taxable AI</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black mb-1">Ask Taxi</h2>
              <p className="text-indigo-100 font-medium">Maturity level, automation gaps, FTE benchmarks — anything about your data.</p>
            </div>
            <ArrowRight className="h-6 w-6 text-white opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all flex-shrink-0" />
          </div>
        </div>
      </Link>
    </div>
  );
};

export default Report;