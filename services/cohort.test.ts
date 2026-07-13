import { describe, it, expect } from 'vitest';
import { hasCohortAccess, isWaitlisted, gateReason } from './cohort';

const sub = (status: string) => ({ status }) as any;

describe('cohort access rules', () => {
  it('grants access only to approved members', () => {
    expect(hasCohortAccess(sub('approved'), false)).toBe(true);
    expect(hasCohortAccess(sub('waitlist'), false)).toBe(false);
    expect(hasCohortAccess(sub('pending'), false)).toBe(false);
    expect(hasCohortAccess(sub('rejected'), false)).toBe(false);
    expect(hasCohortAccess(null, false)).toBe(false);
  });

  it('always grants admins, regardless of submission', () => {
    expect(hasCohortAccess(null, true)).toBe(true);
    expect(hasCohortAccess(sub('waitlist'), true)).toBe(true);
  });

  it('detects the waitlist status', () => {
    expect(isWaitlisted(sub('waitlist'))).toBe(true);
    expect(isWaitlisted(sub('approved'))).toBe(false);
    expect(isWaitlisted(null)).toBe(false);
  });

  it('resolves the gate reason for messaging', () => {
    expect(gateReason(sub('approved'), false)).toBe('granted');
    expect(gateReason(sub('waitlist'), false)).toBe('waitlist');
    expect(gateReason(sub('pending'), false)).toBe('needs_survey');
    expect(gateReason(null, false)).toBe('needs_survey');
    // Admins are always granted even while waitlisted (shouldn't happen, but safe).
    expect(gateReason(sub('waitlist'), true)).toBe('granted');
  });
});
