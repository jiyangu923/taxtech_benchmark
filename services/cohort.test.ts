import { describe, it, expect } from 'vitest';
import { hasCohortAccess, gateReason } from './cohort';

const sub = (status: string) => ({ status }) as any;

describe('cohort access rules', () => {
  it('grants access only to approved members', () => {
    expect(hasCohortAccess(sub('approved'), false)).toBe(true);
    expect(hasCohortAccess(sub('pending'), false)).toBe(false);
    expect(hasCohortAccess(sub('rejected'), false)).toBe(false);
    // Retired status kept as a legal DB value for historical rows — still gated.
    expect(hasCohortAccess(sub('waitlist'), false)).toBe(false);
    expect(hasCohortAccess(null, false)).toBe(false);
  });

  it('always grants admins, regardless of submission', () => {
    expect(hasCohortAccess(null, true)).toBe(true);
    expect(hasCohortAccess(sub('pending'), true)).toBe(true);
  });

  it('resolves the gate reason: granted or needs_intake, nothing else', () => {
    expect(gateReason(sub('approved'), false)).toBe('granted');
    expect(gateReason(sub('pending'), false)).toBe('needs_intake');
    expect(gateReason(sub('rejected'), false)).toBe('needs_intake');
    // A legacy waitlist row simply routes to the intake interview now.
    expect(gateReason(sub('waitlist'), false)).toBe('needs_intake');
    expect(gateReason(null, false)).toBe('needs_intake');
    expect(gateReason(null, true)).toBe('granted');
  });
});
