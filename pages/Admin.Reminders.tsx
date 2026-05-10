import React, { useMemo, useState } from 'react';
import {
  Bell, Mail, Copy, Download, ChevronUp, AlertCircle, CheckCircle2, Loader2, BellRing, Clock, FileWarning,
} from 'lucide-react';
import {
  useAllProfiles,
  useSubmissions,
  useCurrentSurveyVersion,
  useSetCurrentSurveyVersion,
  useMarkRemindersSent,
} from '../services/queries';
import {
  ReminderCandidate,
  candidatesToBccString,
  candidatesToEmailCsv,
  findIncompleteCandidates,
  findOutdatedCandidates,
  findStaleCandidates,
} from './Admin.reminders.helpers';

/**
 * Admin → Reminders tab.
 *
 * Surfaces the three reminder candidate lists (incomplete / outdated / stale)
 * and provides "copy emails", "download CSV", and "mark all as reminded"
 * actions for each. Sending emails happens out-of-band — admin pastes into
 * Gmail/Outlook BCC.
 *
 * Future automation (Vercel Cron + transactional email service) is a
 * separate PR; this component intentionally avoids depending on any
 * server-side email infrastructure.
 */
const AdminReminders: React.FC = () => {
  const { data: profiles = [], isLoading: profilesLoading } = useAllProfiles();
  const { data: submissions = [], isLoading: subsLoading } = useSubmissions();
  const { data: currentVersion = 1, isLoading: versionLoading } = useCurrentSurveyVersion();
  const setVersion = useSetCurrentSurveyVersion();
  const markReminded = useMarkRemindersSent();

  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const now = useMemo(() => new Date(), []);
  const incomplete = useMemo(() => findIncompleteCandidates(profiles, submissions), [profiles, submissions]);
  const outdated   = useMemo(() => findOutdatedCandidates(profiles, submissions, currentVersion), [profiles, submissions, currentVersion]);
  const stale      = useMemo(() => findStaleCandidates(profiles, submissions, now), [profiles, submissions, now]);

  const isLoading = profilesLoading || subsLoading || versionLoading;

  const handleCopy = async (key: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(key);
      setTimeout(() => setCopiedSection(curr => (curr === key ? null : curr)), 2000);
    } catch {
      setActionMessage({ kind: 'error', text: 'Could not copy to clipboard. Use Download CSV instead.' });
    }
  };

  const handleDownload = (filename: string, csv: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleMarkReminded = (candidates: ReminderCandidate[], label: string) => {
    if (candidates.length === 0) return;
    const ok = window.confirm(
      `Record that you've sent reminders to ${candidates.length} ${label} ${candidates.length === 1 ? 'user' : 'users'}? This sets their "last reminded at" timestamp so you don't double-send.`
    );
    if (!ok) return;
    markReminded.mutate(
      candidates.map(c => c.userId),
      {
        onSuccess: () => setActionMessage({ kind: 'success', text: `Marked ${candidates.length} ${label} ${candidates.length === 1 ? 'user' : 'users'} as reminded.` }),
        onError: (e: any) => setActionMessage({ kind: 'error', text: e?.message || 'Could not record reminder send.' }),
      }
    );
  };

  const handleBumpVersion = () => {
    const next = currentVersion + 1;
    const ok = window.confirm(
      `Bump the current survey version from ${currentVersion} to ${next}? Every existing submission stays in the database but will count as outdated, so the Outdated section below will populate with all current respondents.`
    );
    if (!ok) return;
    setVersion.mutate(next, {
      onSuccess: () => setActionMessage({ kind: 'success', text: `Survey version bumped to v${next}.` }),
      onError: (e: any) => setActionMessage({ kind: 'error', text: e?.message || 'Could not bump version.' }),
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 flex items-center justify-center text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading reminder candidates…
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

      {/* Survey version control */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FileWarning className="h-5 w-5 text-primary" /> Survey version
            </h3>
            <p className="text-sm text-gray-500 mt-1.5 max-w-xl leading-relaxed">
              Current version is <span className="font-bold text-gray-900">v{currentVersion}</span>. Bump it after you ship a survey change so existing submissions count as outdated. The Outdated section below will populate with everyone who needs to refill.
            </p>
          </div>
          <button
            onClick={handleBumpVersion}
            disabled={setVersion.isPending}
            className="inline-flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-xl font-bold shadow-sm hover:bg-indigo-900 transition-all disabled:opacity-60"
          >
            <ChevronUp className="h-4 w-4" /> Bump to v{currentVersion + 1}
          </button>
        </div>
      </div>

      <CandidateSection
        title="Incomplete surveys"
        description="Registered users who never submitted. Reminder copy: 'You started but didn't finish — your benchmark is two clicks away.'"
        icon={<BellRing className="h-5 w-5 text-amber-acc" />}
        candidates={incomplete}
        sectionKey="incomplete"
        copiedSection={copiedSection}
        onCopy={handleCopy}
        onDownload={handleDownload}
        onMarkReminded={cands => handleMarkReminded(cands, 'incomplete')}
        markRemindedPending={markReminded.isPending}
        showSubmittedAt={false}
        showSurveyVersion={false}
      />

      <CandidateSection
        title="Outdated submissions"
        description={`Users on a survey version older than v${currentVersion}. Reminder copy: 'We added new questions — please refresh your benchmark.'`}
        icon={<FileWarning className="h-5 w-5 text-orange-500" />}
        candidates={outdated}
        sectionKey="outdated"
        copiedSection={copiedSection}
        onCopy={handleCopy}
        onDownload={handleDownload}
        onMarkReminded={cands => handleMarkReminded(cands, 'outdated')}
        markRemindedPending={markReminded.isPending}
        showSubmittedAt={true}
        showSurveyVersion={true}
      />

      <CandidateSection
        title="Stale submissions (90+ days)"
        description="Users whose last submission is older than 90 days. Reminder copy: 'Quarterly check-in — has anything changed in your stack?'"
        icon={<Clock className="h-5 w-5 text-sky-500" />}
        candidates={stale}
        sectionKey="stale"
        copiedSection={copiedSection}
        onCopy={handleCopy}
        onDownload={handleDownload}
        onMarkReminded={cands => handleMarkReminded(cands, 'stale')}
        markRemindedPending={markReminded.isPending}
        showSubmittedAt={true}
        showSurveyVersion={false}
      />
    </div>
  );
};

interface SectionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  candidates: ReminderCandidate[];
  sectionKey: string;
  copiedSection: string | null;
  onCopy: (key: string, text: string) => void;
  onDownload: (filename: string, csv: string) => void;
  onMarkReminded: (candidates: ReminderCandidate[]) => void;
  markRemindedPending: boolean;
  showSubmittedAt: boolean;
  showSurveyVersion: boolean;
}

const CandidateSection: React.FC<SectionProps> = ({
  title,
  description,
  icon,
  candidates,
  sectionKey,
  copiedSection,
  onCopy,
  onDownload,
  onMarkReminded,
  markRemindedPending,
  showSubmittedAt,
  showSurveyVersion,
}) => {
  const empty = candidates.length === 0;
  const csv = useMemo(() => candidatesToEmailCsv(candidates), [candidates]);
  const bcc = useMemo(() => candidatesToBccString(candidates), [candidates]);
  const wasCopied = copiedSection === sectionKey;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
      <div className="flex items-start justify-between gap-6 flex-wrap mb-4">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            {icon}
            {title}
            <span className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-bold ${empty ? 'bg-gray-100 text-gray-500' : 'bg-indigo-50 text-primary'}`}>
              {candidates.length}
            </span>
          </h3>
          <p className="text-sm text-gray-500 mt-1.5 max-w-2xl leading-relaxed">{description}</p>
        </div>
      </div>

      {empty ? (
        <p className="text-sm text-gray-400 italic py-6 text-center">Nobody in this category right now.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => onCopy(sectionKey, bcc)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              {wasCopied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              {wasCopied ? 'Copied!' : 'Copy emails (BCC)'}
            </button>
            <button
              onClick={() => onDownload(`${sectionKey}-reminders-${new Date().toISOString().slice(0, 10)}.csv`, csv)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              <Download className="h-4 w-4" /> Download CSV
            </button>
            <button
              onClick={() => onMarkReminded(candidates)}
              disabled={markRemindedPending}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-sm font-semibold text-primary hover:bg-indigo-100 disabled:opacity-60"
            >
              <Mail className="h-4 w-4" /> Mark all as reminded
            </button>
          </div>

          <div className="overflow-x-auto -mx-2">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-200">
                  <th className="px-2 py-2.5">Name</th>
                  <th className="px-2 py-2.5">Email</th>
                  {showSubmittedAt && <th className="px-2 py-2.5">Last submitted</th>}
                  {showSurveyVersion && <th className="px-2 py-2.5">On version</th>}
                  <th className="px-2 py-2.5">Last reminded</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(c => (
                  <tr key={c.userId} className="border-b border-gray-100 hover:bg-gray-50/40">
                    <td className="px-2 py-2.5 font-semibold text-gray-900">{c.name}</td>
                    <td className="px-2 py-2.5 text-gray-700 font-mono text-xs">{c.email}</td>
                    {showSubmittedAt && (
                      <td className="px-2 py-2.5 text-gray-500">
                        {c.lastSubmittedAt ? new Date(c.lastSubmittedAt).toLocaleDateString() : '—'}
                      </td>
                    )}
                    {showSurveyVersion && (
                      <td className="px-2 py-2.5 text-gray-500">
                        {c.lastSurveyVersion != null ? `v${c.lastSurveyVersion}` : '—'}
                      </td>
                    )}
                    <td className="px-2 py-2.5 text-gray-500">
                      {c.lastReminderSentAt ? new Date(c.lastReminderSentAt).toLocaleDateString() : 'never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminReminders;
