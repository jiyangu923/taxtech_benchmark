import { describe, it, expect } from 'vitest';
import { checkServiceKeyShape } from '../../evals/env';

describe('checkServiceKeyShape (the wrong-paste diagnostic)', () => {
  it('names the publishable-key mistake precisely (the real incident)', () => {
    const err = checkServiceKeyShape('sb_publishable_abc123');
    expect(err).toContain('PUBLISHABLE');
    expect(err).toContain('gh secret set SUPABASE_SERVICE_ROLE_KEY');
  });

  it('accepts both valid service-key shapes', () => {
    expect(checkServiceKeyShape('sb_secret_abc123')).toBeNull();
    expect(checkServiceKeyShape('eyJhbGciOiJIUzI1NiIs...')).toBeNull(); // legacy service_role JWT
  });

  it('flags unrecognized shapes without printing the whole key', () => {
    const err = checkServiceKeyShape('totally-wrong-value-with-secrets-inside');
    expect(err).toContain('unrecognized shape');
    expect(err).not.toContain('secrets-inside'); // only an 8-char prefix leaks into logs
  });
});
