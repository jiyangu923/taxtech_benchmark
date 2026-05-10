import React, { useMemo } from 'react';
import { Activity, Cpu, Clock, Users, AlertCircle, Loader2 } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useSubmissionsHistory } from '../services/queries';
import {
  hasTrendData,
  submissionVolumeTrend,
  automationIndexTrend,
  aiAdoptionTrend,
  fteCompositionTrend,
} from './Report.trends.helpers';

/**
 * /report → Trends tab.
 *
 * Time-series view of how the industry is shifting over time. Reads from
 * `useSubmissionsHistory()` (admin-only RLS view) which returns BOTH current
 * and archived submission rows — each archived row is a real past snapshot
 * of one user's state.
 *
 * Empty-state handling: with only 1 quarter of data the trend is meaningless
 * (you need at least 2 points to draw a line), so we render a friendly
 * placeholder explaining what unlocks the view.
 */
const ReportTrends: React.FC = () => {
  const { data: history = [], isLoading, error } = useSubmissionsHistory();

  const volumeData = useMemo(() => submissionVolumeTrend(history), [history]);
  const autoData   = useMemo(() => automationIndexTrend(history), [history]);
  const aiData     = useMemo(() => aiAdoptionTrend(history), [history]);
  const fteData    = useMemo(() => fteCompositionTrend(history), [history]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-3xl border border-gray-100 shadow-xl p-12 flex items-center justify-center text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading historical submissions…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-3xl p-8 flex items-start gap-4">
        <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-red-900">Could not load trend data</h3>
          <p className="text-sm text-red-800 mt-1 font-medium">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  if (!hasTrendData(history)) {
    return (
      <div className="bg-white rounded-3xl border border-gray-100 shadow-xl p-10 sm:p-14 text-center animate-fadeIn">
        <Activity className="h-12 w-12 text-gray-300 mx-auto mb-5" />
        <h3 className="font-display text-xl font-medium text-gray-900">Trends will populate as users resubmit</h3>
        <p className="text-gray-500 font-medium mt-3 max-w-xl mx-auto leading-relaxed">
          Right now the dataset spans a single quarter — not enough to draw a line.
          Each time a user resubmits the survey (manually, or after a quarterly reminder),
          a new dated snapshot is preserved. Once two or more quarters of submissions
          exist, this tab unlocks: volume over time, industry automation index, AI
          adoption, and FTE composition shifts.
        </p>
        <p className="text-xs text-gray-400 font-medium mt-6">
          Currently: <span className="font-bold text-gray-600">{history.length}</span> total submissions across history (current + archived).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <TrendCard
        icon={<Users className="h-5 w-5 text-primary" />}
        title="Submissions over time"
        subtitle="How many users submitted (or refreshed) their benchmark each quarter. Counts each snapshot, with unique-user count overlaid."
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <BarChart data={volumeData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="quarter" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="count" name="Submissions" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="uniqueUsers" name="Unique users" fill="#a5b4fc" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </TrendCard>

      <TrendCard
        icon={<Activity className="h-5 w-5 text-primary" />}
        title="Industry automation index"
        subtitle="Average composite automation score (0–100) across all in-quarter submissions. Higher = more automated tax operations."
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <LineChart data={autoData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="quarter" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => v.toFixed(1)} />
            <Line type="monotone" dataKey="avgAutomationIndex" name="Avg automation index" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 5, fill: '#6366f1' }} />
          </LineChart>
        </ResponsiveContainer>
      </TrendCard>

      <TrendCard
        icon={<Cpu className="h-5 w-5 text-primary" />}
        title="AI adoption (industry)"
        subtitle="Percent of in-quarter submissions reporting some level of GenAI adoption. Tracks how fast the industry is moving on AI."
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <LineChart data={aiData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="quarter" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => `${v.toFixed(0)}%`} />
            <Line type="monotone" dataKey="aiAdoptedPercent" name="% adopted GenAI" stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 5, fill: '#0ea5e9' }} />
          </LineChart>
        </ResponsiveContainer>
      </TrendCard>

      <TrendCard
        icon={<Clock className="h-5 w-5 text-primary" />}
        title="FTE composition by quarter"
        subtitle="Average tax-tech and tax-business FTE counts per submitted snapshot. Tracks team-size shifts over time."
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <BarChart data={fteData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="quarter" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => v.toFixed(1)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="avgTaxTechFte" name="Avg tax-tech FTEs" stackId="fte" fill="#6366f1" />
            <Bar dataKey="avgTaxBusinessFte" name="Avg tax-business FTEs" stackId="fte" fill="#c7d2fe" />
          </BarChart>
        </ResponsiveContainer>
      </TrendCard>

      <p className="text-xs text-gray-400 font-medium text-center pt-2">
        Trends are bucketed by the quarter each submission was made. Each user resubmit creates a new snapshot — the current submission is not duplicated.
      </p>
    </div>
  );
};

interface CardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

const TrendCard: React.FC<CardProps> = ({ icon, title, subtitle, children }) => (
  <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-xl border border-gray-100">
    <div className="flex items-center gap-3 mb-2">
      {icon}
      <h3 className="font-display text-xl font-medium text-gray-900">{title}</h3>
    </div>
    <p className="text-sm text-gray-500 font-medium mb-6 max-w-3xl">{subtitle}</p>
    <div className="h-72 min-h-[288px]">{children}</div>
  </div>
);

export default ReportTrends;
