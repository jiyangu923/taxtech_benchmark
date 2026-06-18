import { describe, it, expect } from 'vitest';
import { isPasswordSetupUrl } from './authFlow';

describe('isPasswordSetupUrl', () => {
  it('detects an invite in the URL hash (implicit flow)', () => {
    expect(isPasswordSetupUrl('https://taxbenchmark.ai/#access_token=abc&type=invite&expires_in=3600')).toBe(true);
  });

  it('detects an invite in the query string (PKCE forwards type)', () => {
    expect(isPasswordSetupUrl('https://taxbenchmark.ai/?type=invite&code=xyz')).toBe(true);
  });

  it('detects a recovery link in the hash', () => {
    expect(isPasswordSetupUrl('https://taxbenchmark.ai/#access_token=abc&type=recovery')).toBe(true);
  });

  it('detects a recovery link in the query string', () => {
    expect(isPasswordSetupUrl('https://taxbenchmark.ai/?type=recovery&code=xyz')).toBe(true);
  });

  it('ignores a plain OAuth code redirect (no type)', () => {
    expect(isPasswordSetupUrl('https://taxbenchmark.ai/?code=oauthcode123')).toBe(false);
  });

  it('ignores a signup confirmation (user already chose a password)', () => {
    expect(isPasswordSetupUrl('https://taxbenchmark.ai/#access_token=abc&type=signup')).toBe(false);
  });

  it('ignores an ordinary app URL', () => {
    expect(isPasswordSetupUrl('https://taxbenchmark.ai/#/report')).toBe(false);
  });

  it('does not match a substring like type=invited or type=recovery_x', () => {
    expect(isPasswordSetupUrl('https://taxbenchmark.ai/?type=invitedXYZ')).toBe(false);
    expect(isPasswordSetupUrl('https://taxbenchmark.ai/?type=recovery_test')).toBe(false);
  });
});
