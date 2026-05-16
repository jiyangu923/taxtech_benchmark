import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, TrendingUp, Users, Heart, ShieldCheck, Eye } from 'lucide-react';
import { User } from '../types';
import { usePublicStats } from '../services/queries';
import ParticipantCounter from './ParticipantCounter';

interface HomeProps {
  user: User | null;
  /**
   * Triggers the global AuthModal (lives in App.tsx). Passed down so the
   * homepage CTAs can open the sign-in sheet directly instead of navigating
   * to a route. Without this, the "Sign in to participate" buttons and the
   * "View benchmark" link were dead — the protected routes (/survey, /report)
   * silently bounce back to "/" for unauthenticated users, so clicks did
   * nothing visible.
   */
  onOpenLogin: () => void;
}

interface PublicStats {
  totalSubmissions: number;
  distinctIndustries: number;
  totalRevenue: number;
}

/**
 * Formats a USD revenue number into a friendly hero-strip label.
 * Examples: 4_287_500_000_000 → "$4.3T", 35_600_000_000 → "$35.6B".
 * Exported for unit testing.
 */
export function formatRevenue(usd: number): string {
  if (!usd || usd <= 0) return '$0';
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(1)}T`;
  if (usd >= 1e9)  return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6)  return `$${(usd / 1e6).toFixed(1)}M`;
  if (usd >= 1e3)  return `$${(usd / 1e3).toFixed(0)}K`;
  return `$${usd}`;
}

const Home: React.FC<HomeProps> = ({ user, onOpenLogin }) => {
  const { data: stats = null } = usePublicStats();

  return (
    <div className="bg-canvas min-h-screen">
      <Hero user={user} stats={stats} onOpenLogin={onOpenLogin} />

      {/* Feature grid — pulled up via -mt-24 to overlap the hero's indigo deck.
          Creates the same "tray" effect as the original full-bleed hero
          without the heavy color block. */}
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12 -mt-24">
        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:gap-8 md:grid-cols-3">
          {[
            { icon: <TrendingUp className="h-6 w-6" />, title: 'Automation Metrics', desc: 'Benchmark your tax calculation, payment, and compliance automation rates against the market.' },
            { icon: <Users className="h-6 w-6" />, title: 'Team Structure', desc: 'Understand how peer organizations structure their tax technology vs. tax business teams.' },
            { icon: <CheckCircle2 className="h-6 w-6" />, title: 'AI Readiness', desc: 'See where the industry stands on GenAI adoption—from exploration to mass production.' },
          ].map((card) => {
            const cardClasses = 'rounded-2xl bg-white p-8 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group border border-gray-100 text-left w-full';
            const cardBody = (
              <>
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-50 text-primary group-hover:bg-indigo-100 transition-colors">
                  {card.icon}
                </div>
                <h3 className="font-display text-2xl font-medium text-gray-900 group-hover:text-primary transition-colors">{card.title}</h3>
                <p className="mt-3 text-base text-gray-600 leading-relaxed">{card.desc}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:gap-2.5 transition-all">
                  {user ? 'Start Survey' : 'Sign in to participate'} <ArrowRight className="h-4 w-4" />
                </span>
              </>
            );
            return user ? (
              <Link key={card.title} to="/survey" className={cardClasses}>{cardBody}</Link>
            ) : (
              <button key={card.title} type="button" onClick={onOpenLogin} className={cardClasses}>{cardBody}</button>
            );
          })}
        </div>
      </div>

      {/* Trust section */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-16">
        <div className="text-center mb-12">
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900">Built for the Community</h2>
          <p className="mt-3 text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">This benchmark is a non-profit, community-driven initiative. Your data helps everyone make better decisions.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          <TrustCard
            icon={<Heart className="h-6 w-6" />}
            iconClass="bg-emerald-50 text-emerald-700"
            title="Non-Profit"
            desc="A free, community resource. No commercial agenda — just honest industry data to help tax teams improve."
          />
          <TrustCard
            icon={<ShieldCheck className="h-6 w-6" />}
            iconClass="bg-amber-acc-tint text-amber-acc-2"
            title="Anonymous & Reviewed"
            desc="Every submission is anonymized. Each response goes through a completeness review before entering the dataset."
          />
          <TrustCard
            icon={<Eye className="h-6 w-6" />}
            iconClass="bg-sky-50 text-sky-700"
            title="Equal Access"
            desc="Once approved, every participant gets the same access to survey data and analytics — no premium tiers, no admin advantage."
          />
        </div>
      </div>
    </div>
  );
};

const TrustCard: React.FC<{ icon: React.ReactNode; iconClass: string; title: string; desc: string }> = ({ icon, iconClass, title, desc }) => (
  <div className="text-center p-6">
    <div className={`inline-flex h-12 w-12 items-center justify-center rounded-lg mb-4 ${iconClass}`}>{icon}</div>
    <h3 className="font-display font-medium text-gray-900 text-xl">{title}</h3>
    <p className="mt-3 text-base text-gray-600 leading-relaxed">{desc}</p>
  </div>
);

// ─── Hero ────────────────────────────────────────────────────────────────────

/**
 * Editorial hero with indigo "deck" continuity.
 * - Top: off-white canvas with sans-serif headline + stat strip on the right.
 * - Bottom: full-width indigo band that the feature cards overlap into via
 *   the parent's -mt-24 negative margin. Replicates the visual "tray" of the
 *   original full-bleed indigo hero without the heavy full-section color.
 * - Thin indigo "publication spine" along the very top edge.
 */
const Hero: React.FC<{ user: User | null; stats: PublicStats | null; onOpenLogin: () => void }> = ({ user, stats, onOpenLogin }) => (
  <div className="relative">
    <div className="absolute inset-x-0 top-0 h-[3px] bg-primary z-10" />

    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 lg:pt-28 pb-16 lg:pb-20 grid lg:grid-cols-12 gap-12 items-end">
      <div className="lg:col-span-7">
        <div className="mb-2"><ParticipantCounter variant="eyebrow" /></div>
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-amber-acc-2 mb-6">
          Indirect Tax · Benchmark Edition v1
        </p>
        <h1 className="font-display font-semibold text-4xl sm:text-5xl lg:text-6xl tracking-tight text-gray-900 leading-[1.05]">
          Indirect Tax Technology <span className="text-primary">Benchmark</span>
        </h1>
        <p className="mt-6 text-lg text-gray-700 max-w-2xl leading-relaxed">
          A community-built peer comparison for in-house tax-technology functions. Anonymous data, equal access, no vendor agenda.
        </p>
        <HeroCTAs user={user} onOpenLogin={onOpenLogin} />
      </div>
      <div className="lg:col-span-5">
        <div className="bg-white border border-gray-200 rounded-xl p-8 grid grid-cols-2 gap-x-6 gap-y-8 shadow-sm">
          <Stat n={stats ? String(stats.totalSubmissions)        : '—'} label="Approved benchmarks contributed" />
          <Stat n={stats ? String(stats.distinctIndustries)      : '—'} label="Industries represented" />
          <Stat n={stats ? formatRevenue(stats.totalRevenue)     : '—'} label="Combined revenue covered" />
          <Stat n="100%" label="Free · non-profit · open access" />
        </div>
      </div>
    </div>

    {/* Indigo deck — feature cards in the parent component overlap into this band. */}
    <div className="bg-primary h-40 sm:h-48" />
  </div>
);

const HeroCTAs: React.FC<{ user: User | null; onOpenLogin: () => void }> = ({ user, onOpenLogin }) => {
  const primaryClass = 'inline-flex items-center gap-2 px-7 py-3.5 bg-primary text-white rounded-md text-base font-semibold hover:bg-indigo-900 transition-colors shadow-sm';
  const secondaryClass = 'inline-flex items-center gap-2 px-7 py-3.5 bg-white border border-gray-300 text-gray-900 rounded-md text-base font-semibold hover:bg-gray-50 hover:border-gray-400 transition-colors';
  return (
    <div className="mt-10 flex flex-wrap gap-3">
      {/* Primary CTA: survey for logged-in users; sign-in for guests. */}
      {user ? (
        <Link to="/survey" className={primaryClass}>
          Start the survey <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <button type="button" onClick={onOpenLogin} className={primaryClass}>
          Sign in to participate <ArrowRight className="h-4 w-4" />
        </button>
      )}

      {/* Secondary CTA: report is gated, so guests get the sign-in modal too
          (instead of bouncing silently to "/" via the protected-route guard). */}
      {user ? (
        <Link to="/report" className={secondaryClass}>View benchmark</Link>
      ) : (
        <button type="button" onClick={onOpenLogin} className={secondaryClass}>View benchmark</button>
      )}
    </div>
  );
};

const Stat: React.FC<{ n: string; label: string }> = ({ n, label }) => (
  <div>
    <div className="font-mono text-3xl font-semibold tabular-nums text-primary leading-none">{n}</div>
    <div className="mt-2.5 text-sm text-gray-700 leading-snug">{label}</div>
  </div>
);

export default Home;
