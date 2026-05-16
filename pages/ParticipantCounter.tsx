import React from 'react';
import { usePublicStats } from '../services/queries';
import { MAX_PARTICIPANTS } from '../constants';
import {
  derivePhase, progressPercent, eyebrowCopy, bannerCopy,
} from './ParticipantCounter.helpers';

/**
 * Two-variant founding-cohort counter:
 *   - variant="eyebrow"  → single mono/amber line above the H1 on Home
 *   - variant="banner"   → small panel with title + progress bar + subtitle,
 *                          used on the Survey step-1 intro
 *
 * Both call usePublicStats() so the consumer doesn't need to wire the data.
 * While loading, the component renders nothing — neutral fallback for both
 * placements (no jarring placeholder text).
 */

const WAITLIST_MAILTO =
  'mailto:jiyangu923@gmail.com?subject=taxbenchmark.ai%20waitlist&body=Hi%20J%20%E2%80%94%20please%20add%20me%20to%20the%20waitlist%20for%20the%20next%20cohort.';

interface Props {
  variant: 'eyebrow' | 'banner';
}

const ParticipantCounter: React.FC<Props> = ({ variant }) => {
  const { data: stats } = usePublicStats();
  if (!stats) return null;
  const count = stats.totalSubmissions;
  const phase = derivePhase(count, MAX_PARTICIPANTS);

  if (variant === 'eyebrow') {
    return <EyebrowVariant count={count} phase={phase} />;
  }
  return <BannerVariant count={count} phase={phase} />;
};

const EyebrowVariant: React.FC<{ count: number; phase: ReturnType<typeof derivePhase> }> = ({ count, phase }) => {
  const text = eyebrowCopy(count, MAX_PARTICIPANTS);
  const className = 'font-mono text-[11px] uppercase tracking-[0.12em] font-semibold';
  if (phase === 'full') {
    return (
      <a
        href={WAITLIST_MAILTO}
        className={`${className} text-amber-acc-2 hover:underline`}
      >
        {text}
      </a>
    );
  }
  return (
    <p className={`${className} text-amber-acc-2`}>{text}</p>
  );
};

const BannerVariant: React.FC<{ count: number; phase: ReturnType<typeof derivePhase> }> = ({ count, phase }) => {
  const copy = bannerCopy(count, MAX_PARTICIPANTS);
  const pct = progressPercent(count, MAX_PARTICIPANTS);
  const isFull = phase === 'full';
  const accent = phase === 'closing' ? 'border-amber-acc/40 bg-amber-acc/5' : isFull ? 'border-gray-200 bg-gray-50' : 'border-indigo-100 bg-indigo-50/40';

  return (
    <div className={`rounded-2xl border p-5 ${accent}`}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-display text-sm sm:text-base font-semibold text-gray-900">
          {copy.title}
        </p>
        {!isFull && (
          <span className="font-mono text-xs text-gray-500 tabular-nums whitespace-nowrap">
            {count} / {MAX_PARTICIPANTS}
          </span>
        )}
      </div>
      {!isFull && (
        <div className="mt-3 h-1.5 w-full bg-white/70 rounded-full overflow-hidden border border-gray-200/60">
          <div
            className={`h-full transition-all duration-500 ${phase === 'closing' ? 'bg-amber-acc-2' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <p className="mt-3 text-xs sm:text-sm text-gray-600 leading-relaxed">
        {copy.subtitle}
        {isFull && (
          <>
            {' '}
            <a href={WAITLIST_MAILTO} className="font-semibold text-primary hover:underline">
              Join the waitlist →
            </a>
          </>
        )}
      </p>
    </div>
  );
};

export default ParticipantCounter;
