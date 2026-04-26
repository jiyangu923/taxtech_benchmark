import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACTIVE_SESSION_KEY,
  LEGACY_HISTORY_KEY,
  SESSIONS_KEY,
  appendMessage,
  deleteSession,
  loadSessions,
  makeFreshSession,
  makeSessionId,
  pickActiveAfterDelete,
  pickInitialActiveId,
  renameSession,
  sortByRecent,
  titleFromQuestion,
} from './Taxi.helpers';

beforeEach(() => {
  localStorage.clear();
});

describe('titleFromQuestion', () => {
  it('returns trimmed text when short', () => {
    expect(titleFromQuestion('  How do I compare?  ')).toBe('How do I compare?');
  });

  it('truncates long text with an ellipsis', () => {
    const long = 'A'.repeat(60);
    const result = titleFromQuestion(long);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(41);
  });

  it('collapses internal whitespace', () => {
    expect(titleFromQuestion('How   do\nI\tcompare?')).toBe('How do I compare?');
  });

  it('falls back to "New chat" for empty input', () => {
    expect(titleFromQuestion('')).toBe('New chat');
    expect(titleFromQuestion('   ')).toBe('New chat');
  });
});

describe('makeSessionId', () => {
  it('produces unique ids on rapid calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => makeSessionId()));
    expect(ids.size).toBe(100);
  });

  it('starts with the s_ prefix', () => {
    expect(makeSessionId().startsWith('s_')).toBe(true);
  });
});

describe('makeFreshSession', () => {
  it('has empty messages and a "New chat" title', () => {
    const s = makeFreshSession();
    expect(s.messages).toEqual([]);
    expect(s.title).toBe('New chat');
    expect(s.createdAt).toBe(s.updatedAt);
  });
});

describe('sortByRecent', () => {
  it('orders by updatedAt descending without mutating input', () => {
    const a = { id: 'a', title: 'A', createdAt: 1, updatedAt: 100, messages: [] };
    const b = { id: 'b', title: 'B', createdAt: 2, updatedAt: 300, messages: [] };
    const c = { id: 'c', title: 'C', createdAt: 3, updatedAt: 200, messages: [] };
    const input = [a, b, c];
    const out = sortByRecent(input);
    expect(out.map(s => s.id)).toEqual(['b', 'c', 'a']);
    expect(input.map(s => s.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('appendMessage', () => {
  it('appends and bumps updatedAt on the active session only', () => {
    const t0 = Date.now() - 1000;
    const sessions = [
      { id: 'a', title: 'New chat', createdAt: t0, updatedAt: t0, messages: [] },
      { id: 'b', title: 'Other', createdAt: t0, updatedAt: t0, messages: [{ question: 'x', analysis: 'y' }] },
    ];
    const next = appendMessage(sessions, 'a', { question: 'Hello world', analysis: 'hi' });
    expect(next[0].messages).toHaveLength(1);
    expect(next[0].updatedAt).toBeGreaterThan(t0);
    expect(next[1]).toBe(sessions[1]);
  });

  it('sets title from first message but preserves it on subsequent appends', () => {
    const t0 = Date.now();
    const sessions = [{ id: 'a', title: 'New chat', createdAt: t0, updatedAt: t0, messages: [] }];
    const after1 = appendMessage(sessions, 'a', { question: 'First question here', analysis: 'a' });
    expect(after1[0].title).toBe('First question here');
    const after2 = appendMessage(after1, 'a', { question: 'Second one', analysis: 'b' });
    expect(after2[0].title).toBe('First question here');
  });

  it('caps messages at the per-session limit', () => {
    const t0 = Date.now();
    const messages = Array.from({ length: 50 }, (_, i) => ({ question: `q${i}`, analysis: 'a' }));
    const sessions = [{ id: 'a', title: 'T', createdAt: t0, updatedAt: t0, messages }];
    const next = appendMessage(sessions, 'a', { question: 'q50', analysis: 'a' });
    expect(next[0].messages).toHaveLength(50);
    expect(next[0].messages[0].question).toBe('q1');
    expect(next[0].messages[49].question).toBe('q50');
  });

  it('is a no-op if the activeId does not match any session', () => {
    const t0 = Date.now();
    const sessions = [{ id: 'a', title: 'T', createdAt: t0, updatedAt: t0, messages: [] }];
    const next = appendMessage(sessions, 'missing', { question: 'q', analysis: 'a' });
    expect(next).toEqual(sessions);
  });
});

describe('pickInitialActiveId', () => {
  it('returns the stored id when it matches a session', () => {
    const t0 = Date.now();
    const sessions = [
      { id: 'a', title: 'A', createdAt: t0, updatedAt: 100, messages: [] },
      { id: 'b', title: 'B', createdAt: t0, updatedAt: 200, messages: [] },
    ];
    expect(pickInitialActiveId(sessions, 'a')).toBe('a');
  });

  it('falls back to the most recently updated when stored is missing or stale', () => {
    const t0 = Date.now();
    const sessions = [
      { id: 'a', title: 'A', createdAt: t0, updatedAt: 100, messages: [] },
      { id: 'b', title: 'B', createdAt: t0, updatedAt: 200, messages: [] },
    ];
    expect(pickInitialActiveId(sessions, null)).toBe('b');
    expect(pickInitialActiveId(sessions, 'gone')).toBe('b');
  });

  it('returns empty string for empty sessions', () => {
    expect(pickInitialActiveId([], null)).toBe('');
  });
});

describe('loadSessions', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(loadSessions()).toEqual([]);
  });

  it('parses valid stored sessions', () => {
    const t0 = Date.now();
    const sessions = [{ id: 'a', title: 'T', createdAt: t0, updatedAt: t0, messages: [] }];
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    expect(loadSessions()).toEqual(sessions);
  });

  it('drops corrupted entries silently', () => {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify([{ id: 'good', title: 't', createdAt: 1, updatedAt: 1, messages: [] }, null, { id: 5 }]));
    const out = loadSessions();
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('good');
  });

  it('returns empty array when JSON is malformed', () => {
    localStorage.setItem(SESSIONS_KEY, 'not-json');
    expect(loadSessions()).toEqual([]);
  });

  it('migrates legacy taxi_chat_history into a single session and removes the legacy key', () => {
    const legacy = [
      { question: 'How do I compare on FTEs?', analysis: 'You compare well.' },
      { question: 'Follow-up', analysis: 'Sure.' },
    ];
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify(legacy));
    const out = loadSessions();
    expect(out).toHaveLength(1);
    expect(out[0].messages).toEqual(legacy);
    expect(out[0].title).toBe('How do I compare on FTEs?');
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)).toBeNull();
  });

  it('does not migrate when legacy key holds an empty array', () => {
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([]));
    expect(loadSessions()).toEqual([]);
  });

  it('prefers SESSIONS_KEY over legacy key when both exist', () => {
    const sessions = [{ id: 'a', title: 'T', createdAt: 1, updatedAt: 1, messages: [] }];
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify([{ question: 'q', analysis: 'a' }]));
    const out = loadSessions();
    expect(out).toEqual(sessions);
    expect(localStorage.getItem(LEGACY_HISTORY_KEY)).not.toBeNull();
  });
});

describe('storage key constants', () => {
  it('keeps stable values so reloads find prior data', () => {
    expect(SESSIONS_KEY).toBe('taxi_sessions');
    expect(ACTIVE_SESSION_KEY).toBe('taxi_active_session');
    expect(LEGACY_HISTORY_KEY).toBe('taxi_chat_history');
  });
});

describe('deleteSession', () => {
  const mk = (id: string) => ({ id, title: id, createdAt: 1, updatedAt: 1, messages: [] });

  it('removes the matching session and leaves others untouched', () => {
    const sessions = [mk('a'), mk('b'), mk('c')];
    const out = deleteSession(sessions, 'b');
    expect(out.map(s => s.id)).toEqual(['a', 'c']);
    expect(out[0]).toBe(sessions[0]);
    expect(out[1]).toBe(sessions[2]);
  });

  it('is a no-op for unknown ids', () => {
    const sessions = [mk('a'), mk('b')];
    expect(deleteSession(sessions, 'missing').map(s => s.id)).toEqual(['a', 'b']);
  });

  it('returns an empty array when deleting the last session', () => {
    expect(deleteSession([mk('a')], 'a')).toEqual([]);
  });
});

describe('renameSession', () => {
  const mk = (id: string, title: string) => ({ id, title, createdAt: 1, updatedAt: 1, messages: [] });

  it('updates the title of the matching session', () => {
    const sessions = [mk('a', 'Old'), mk('b', 'Other')];
    const out = renameSession(sessions, 'a', 'New name');
    expect(out[0].title).toBe('New name');
    expect(out[1]).toBe(sessions[1]);
  });

  it('collapses internal whitespace and trims edges', () => {
    const sessions = [mk('a', 'Old')];
    expect(renameSession(sessions, 'a', '  hello   world  ')[0].title).toBe('hello world');
  });

  it('caps overly long titles with an ellipsis', () => {
    const sessions = [mk('a', 'Old')];
    const long = 'B'.repeat(80);
    const out = renameSession(sessions, 'a', long);
    expect(out[0].title.endsWith('…')).toBe(true);
    expect(out[0].title.length).toBeLessThanOrEqual(61);
  });

  it('refuses empty titles (returns sessions unchanged)', () => {
    const sessions = [mk('a', 'Old')];
    expect(renameSession(sessions, 'a', '   ')).toBe(sessions);
  });

  it('preserves all non-title fields', () => {
    const sessions = [{ id: 'a', title: 'Old', createdAt: 100, updatedAt: 200, messages: [{ question: 'q', analysis: 'r' }] }];
    const out = renameSession(sessions, 'a', 'Renamed')[0];
    expect(out.createdAt).toBe(100);
    expect(out.updatedAt).toBe(200);
    expect(out.messages).toBe(sessions[0].messages);
  });
});

describe('pickActiveAfterDelete', () => {
  const mk = (id: string, updatedAt: number) => ({ id, title: id, createdAt: 1, updatedAt, messages: [] });

  it('keeps the current active id when a different session is deleted', () => {
    const remaining = [mk('a', 100), mk('c', 300)];
    expect(pickActiveAfterDelete(remaining, 'b', 'a')).toBe('a');
  });

  it('falls back to the most recently updated when active is deleted', () => {
    const remaining = [mk('a', 100), mk('c', 300), mk('b', 200)];
    expect(pickActiveAfterDelete(remaining, 'x', 'x')).toBe('c');
  });

  it('returns empty string when nothing is left', () => {
    expect(pickActiveAfterDelete([], 'a', 'a')).toBe('');
  });
});
