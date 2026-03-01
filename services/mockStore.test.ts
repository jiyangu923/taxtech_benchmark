// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Reset module cache + localStorage before each test so every test
// gets a brand-new MockStore instance with an empty database.
beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function freshStore() {
  const { mockStore } = await import('./mockStore.ts');
  return mockStore;
}

// ── Email/Password auth ─────────────────────────────────────────────

describe('register', () => {
  it('creates a new user and logs them in', async () => {
    const store = await freshStore();
    const user = store.register('Alice', 'alice@test.com', 'pass123');
    expect(user.email).toBe('alice@test.com');
    expect(user.name).toBe('Alice');
    expect(user.role).toBe('user');
    expect(store.getCurrentUser()).not.toBeNull();
  });

  it('throws if email already registered', async () => {
    const store = await freshStore();
    store.register('Alice', 'alice@test.com', 'pass123');
    expect(() => store.register('Alice2', 'alice@test.com', 'other')).toThrow('already registered');
  });

  it('assigns admin role if email is in the admin list', async () => {
    const store = await freshStore();
    // Dynamically add a fresh email to the admin list, then register with it
    store.addAdminEmail('newadmin@test.com');
    const user = store.register('New Admin', 'newadmin@test.com', 'pass');
    expect(user.role).toBe('admin');
  });
});

describe('login (email/password)', () => {
  it('logs in with correct password', async () => {
    const store = await freshStore();
    store.register('Bob', 'bob@test.com', 'secret');
    store.logout();
    const user = store.login('bob@test.com', 'secret');
    expect(user.email).toBe('bob@test.com');
  });

  it('throws on wrong password', async () => {
    const store = await freshStore();
    store.register('Bob', 'bob@test.com', 'secret');
    store.logout();
    expect(() => store.login('bob@test.com', 'wrong')).toThrow('Incorrect password');
  });

  it('throws if account not found', async () => {
    const store = await freshStore();
    expect(() => store.login('nobody@test.com', 'pass')).toThrow('Account not found');
  });

  it('skips password check when password arg is undefined (Google internal path)', async () => {
    const store = await freshStore();
    store.register('Carol', 'carol@test.com', 'realpassword');
    store.logout();
    expect(() => store.login('carol@test.com')).not.toThrow();
  });
});

// ── Google OAuth auth ───────────────────────────────────────────────

describe('loginWithGoogle', () => {
  it('auto-registers a brand-new Google user', async () => {
    const store = await freshStore();
    const user = store.loginWithGoogle('new@gmail.com', 'New User');
    expect(user.email).toBe('new@gmail.com');
    expect(user.name).toBe('New User');
    expect(user.role).toBe('user');
  });

  it('uses email prefix as name when name is not provided', async () => {
    const store = await freshStore();
    const user = store.loginWithGoogle('jane@gmail.com');
    expect(user.name).toBe('jane');
  });

  it('logs in an existing Google user without creating a duplicate', async () => {
    const store = await freshStore();
    store.loginWithGoogle('returning@gmail.com', 'Returning User');
    store.logout();
    const user = store.loginWithGoogle('returning@gmail.com', 'Returning User');
    expect(user.email).toBe('returning@gmail.com');
    const allUsers = (store as any).users as { email: string }[];
    expect(allUsers.filter(u => u.email === 'returning@gmail.com').length).toBe(1);
  });

  it('grants admin role if Google email is in INITIAL_ADMINS', async () => {
    const store = await freshStore();
    const user = store.loginWithGoogle('jiyangu923@gmail.com', 'Jiyangu');
    expect(user.role).toBe('admin');
  });

  it('Google-registered users cannot log in via password form', async () => {
    const store = await freshStore();
    store.loginWithGoogle('googleonly@gmail.com', 'Google User');
    store.logout();
    expect(() => store.login('googleonly@gmail.com', 'password123')).toThrow('Incorrect password');
    expect(() => store.login('googleonly@gmail.com', '')).toThrow('Incorrect password');
  });
});
