import { describe, it, expect } from 'vitest';
import {
  derivePhase, participantsRemaining, progressPercent,
  eyebrowCopy, bannerCopy, CLOSING_THRESHOLD_RATIO,
} from './ParticipantCounter.helpers';

describe('derivePhase', () => {
  it('returns "building" well below the closing threshold', () => {
    expect(derivePhase(0, 100)).toBe('building');
    expect(derivePhase(4, 100)).toBe('building');
    expect(derivePhase(50, 100)).toBe('building');
    expect(derivePhase(79, 100)).toBe('building');
  });

  it('returns "closing" once the threshold is hit', () => {
    expect(derivePhase(80, 100)).toBe('closing');
    expect(derivePhase(99, 100)).toBe('closing');
  });

  it('returns "full" at and above the max', () => {
    expect(derivePhase(100, 100)).toBe('full');
    expect(derivePhase(150, 100)).toBe('full');
  });

  it('handles a non-100 max consistently with the ratio', () => {
    expect(derivePhase(15, 50)).toBe('building');         // 30%
    expect(derivePhase(Math.ceil(50 * CLOSING_THRESHOLD_RATIO), 50)).toBe('closing'); // 40
    expect(derivePhase(50, 50)).toBe('full');
  });
});

describe('participantsRemaining', () => {
  it('returns max - count', () => {
    expect(participantsRemaining(4, 100)).toBe(96);
    expect(participantsRemaining(87, 100)).toBe(13);
  });

  it('clamps to 0 when full or over', () => {
    expect(participantsRemaining(100, 100)).toBe(0);
    expect(participantsRemaining(150, 100)).toBe(0);
  });
});

describe('progressPercent', () => {
  it('returns the rounded percentage of count / max', () => {
    expect(progressPercent(0, 100)).toBe(0);
    expect(progressPercent(4, 100)).toBe(4);
    expect(progressPercent(50, 100)).toBe(50);
    expect(progressPercent(99, 100)).toBe(99);
  });

  it('clamps to 100 when over', () => {
    expect(progressPercent(150, 100)).toBe(100);
  });

  it('returns 0 for a non-positive max instead of dividing by zero', () => {
    expect(progressPercent(50, 0)).toBe(0);
    expect(progressPercent(50, -10)).toBe(0);
  });
});

describe('eyebrowCopy', () => {
  it('shows the filled count in the building phase', () => {
    expect(eyebrowCopy(4, 100)).toBe('Founding cohort · 4 of 100 spots filled');
  });

  it('appends "closing soon" in the closing phase', () => {
    expect(eyebrowCopy(87, 100)).toBe('Founding cohort · 87 of 100 spots filled · closing soon');
  });

  it('switches to the closed / waitlist message at the cap', () => {
    expect(eyebrowCopy(100, 100)).toBe('Founding cohort · closed · join the waitlist');
    expect(eyebrowCopy(150, 100)).toBe('Founding cohort · closed · join the waitlist');
  });
});

describe('bannerCopy', () => {
  it('returns a building-phase title with the count', () => {
    const c = bannerCopy(4, 100);
    expect(c.title).toContain('4 of 100');
    expect(c.subtitle).toContain('100 participants');
  });

  it('returns a closing-phase title with the remaining count', () => {
    const c = bannerCopy(87, 100);
    expect(c.title).toContain('13 spots');
    expect(c.subtitle).toMatch(/closing soon/i);
  });

  it('returns a full-phase waitlist message at the cap', () => {
    const c = bannerCopy(100, 100);
    expect(c.title).toMatch(/closed/i);
    expect(c.subtitle).toMatch(/waitlist/i);
  });
});
