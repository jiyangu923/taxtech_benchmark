import { describe, it, expect } from 'vitest';
import {
  parseTokenFromSearch, parseDeclineIntent, extFromFilename,
  validatePhoto, errorMessageForStatus,
  ALLOWED_PHOTO_EXTENSIONS, MAX_PHOTO_BYTES,
} from './ConfirmMember.helpers';

function makeFile(name: string, size: number): File {
  // Vitest's jsdom env supplies File; we just need name + size to feed validation.
  const blob = new Blob(['x'.repeat(size)], { type: 'application/octet-stream' });
  return new File([blob], name);
}

describe('parseTokenFromSearch', () => {
  it('returns the token when present', () => {
    expect(parseTokenFromSearch('?token=abc123')).toBe('abc123');
    expect(parseTokenFromSearch('token=abc123')).toBe('abc123');
  });

  it('handles extra params alongside the token', () => {
    expect(parseTokenFromSearch('?token=xyz&decline=1')).toBe('xyz');
  });

  it('returns null when missing or empty', () => {
    expect(parseTokenFromSearch('')).toBeNull();
    expect(parseTokenFromSearch('?')).toBeNull();
    expect(parseTokenFromSearch('?other=foo')).toBeNull();
    expect(parseTokenFromSearch('?token=')).toBeNull();
    expect(parseTokenFromSearch('?token=   ')).toBeNull();
  });
});

describe('parseDeclineIntent', () => {
  it('returns true only for decline=1', () => {
    expect(parseDeclineIntent('?decline=1')).toBe(true);
    expect(parseDeclineIntent('?token=abc&decline=1')).toBe(true);
  });

  it('returns false otherwise', () => {
    expect(parseDeclineIntent('')).toBe(false);
    expect(parseDeclineIntent('?decline=0')).toBe(false);
    expect(parseDeclineIntent('?decline=true')).toBe(false);
    expect(parseDeclineIntent('?token=abc')).toBe(false);
  });
});

describe('extFromFilename', () => {
  it('extracts lowercased extension without the dot', () => {
    expect(extFromFilename('cat.JPG')).toBe('jpg');
    expect(extFromFilename('headshot.png')).toBe('png');
    expect(extFromFilename('my.photo.webp')).toBe('webp');
  });

  it('falls back to jpg when there is no extension', () => {
    expect(extFromFilename('cat')).toBe('jpg');
    expect(extFromFilename('cat.')).toBe('jpg');
  });
});

describe('validatePhoto', () => {
  it('accepts a small jpg', () => {
    const result = validatePhoto(makeFile('me.jpg', 100));
    expect(result.ok).toBe(true);
    expect(result.ext).toBe('jpg');
    expect(result.reason).toBe('');
  });

  it('accepts all allowed extensions', () => {
    for (const ext of ALLOWED_PHOTO_EXTENSIONS) {
      const r = validatePhoto(makeFile(`x.${ext}`, 100));
      expect(r.ok).toBe(true);
      expect(r.ext).toBe(ext);
    }
  });

  it('rejects oversized files', () => {
    const result = validatePhoto(makeFile('giant.jpg', MAX_PHOTO_BYTES + 1));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too large/i);
  });

  it('rejects unsupported extensions', () => {
    const result = validatePhoto(makeFile('paper.pdf', 100));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unsupported/i);
  });
});

describe('errorMessageForStatus', () => {
  it('maps known statuses to friendly text', () => {
    expect(errorMessageForStatus(401)).toMatch(/not valid/i);
    expect(errorMessageForStatus(409)).toMatch(/already been used/i);
    expect(errorMessageForStatus(410)).toMatch(/expired/i);
    expect(errorMessageForStatus(502)).toMatch(/try again/i);
  });

  it('uses the fallback for unknown statuses', () => {
    expect(errorMessageForStatus(500, 'Boom')).toBe('Boom');
    expect(errorMessageForStatus(500)).toMatch(/wrong/i);
  });
});
