import { describe, it, expect, beforeEach } from 'vitest';
import { MockStore } from './mockStore';

// Each test gets a fresh store backed by a clean localStorage
let store: MockStore;

beforeEach(() => {
  localStorage.clear();
  store = new MockStore();
});

// ---------------------------------------------------------------------------
// Seeded data
// ---------------------------------------------------------------------------
describe('seeded users', () => {
  it('seeds jiyangu923@gmail.com as admin', () => {
    const user = store.login('jiyangu923@gmail.com', 'password123');
    expect(user.role).toBe('admin');
    expect(user.email).toBe('jiyangu923@gmail.com');
  });

  it('seeds admin@taxbenchmark.com as admin', () => {
    const user = store.login('admin@taxbenchmark.com', 'password123');
    expect(user.role).toBe('admin');
  });

  it('seeds a standard user with user role', () => {
    const user = store.login('user@company.com', 'password123');
    expect(user.role).toBe('user');
  });
});

// ---------------------------------------------------------------------------
// login()
// ---------------------------------------------------------------------------
describe('login()', () => {
  it('throws when email is not registered', () => {
    expect(() => store.login('nobody@example.com', 'x')).toThrow('Account not found');
  });

  it('throws on wrong password', () => {
    expect(() => store.login('jiyangu923@gmail.com', 'wrong')).toThrow('Incorrect password');
  });

  it('is case-insensitive for email', () => {
    const user = store.login('JIYANGU923@GMAIL.COM', 'password123');
    expect(user.email).toBe('jiyangu923@gmail.com');
  });

  it('resolves admin role from adminEmails even if stored role is user (stale localStorage bug)', () => {
    // Corrupt the stored role to simulate the pre-fix bug
    const rawUsers = JSON.parse(localStorage.getItem('tax_benchmark_db_users') as string);
    const target = rawUsers.find((u: { email: string }) => u.email === 'jiyangu923@gmail.com');
    target.role = 'user';
    localStorage.setItem('tax_benchmark_db_users', JSON.stringify(rawUsers));

    // Re-load the store from the now-corrupted storage
    const store2 = new MockStore();
    const user = store2.login('jiyangu923@gmail.com', 'password123');
    expect(user.role).toBe('admin');
  });

  it('persists the session to localStorage', () => {
    store.login('jiyangu923@gmail.com', 'password123');
    const session = JSON.parse(localStorage.getItem('tax_benchmark_db_user_session') as string);
    expect(session.email).toBe('jiyangu923@gmail.com');
    expect(session.role).toBe('admin');
  });

  it('getCurrentUser() returns the logged-in user', () => {
    store.login('jiyangu923@gmail.com', 'password123');
    expect(store.getCurrentUser()?.email).toBe('jiyangu923@gmail.com');
  });
});

// ---------------------------------------------------------------------------
// logout()
// ---------------------------------------------------------------------------
describe('logout()', () => {
  it('clears the session', () => {
    store.login('jiyangu923@gmail.com', 'password123');
    store.logout();
    expect(store.getCurrentUser()).toBeNull();
    expect(localStorage.getItem('tax_benchmark_db_user_session')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// register()
// ---------------------------------------------------------------------------
describe('register()', () => {
  it('assigns admin role when email is in adminEmails', () => {
    // Add a new admin email before the user registers
    store.addAdminEmail('newadmin@corp.com');
    const user = store.register('New Admin', 'newadmin@corp.com', 'pass');
    expect(user.role).toBe('admin');
  });

  it('assigns user role for a regular email', () => {
    const user = store.register('Regular', 'regular@corp.com', 'pass');
    expect(user.role).toBe('user');
  });

  it('is case-insensitive when matching adminEmails on register', () => {
    store.addAdminEmail('Admin@Corp.com');
    const user = store.register('Admin', 'admin@corp.com', 'pass');
    expect(user.role).toBe('admin');
  });

  it('throws on duplicate email', () => {
    store.register('User', 'dup@test.com', 'pass');
    expect(() => store.register('User2', 'dup@test.com', 'pass')).toThrow('already registered');
  });

  it('auto-logs in after registration', () => {
    store.register('Jane', 'jane@corp.com', 'pass');
    expect(store.getCurrentUser()?.email).toBe('jane@corp.com');
  });
});

// ---------------------------------------------------------------------------
// addAdminEmail()
// ---------------------------------------------------------------------------
describe('addAdminEmail()', () => {
  it('normalizes email to lowercase before storing', () => {
    store.addAdminEmail('NEWADMIN@Corp.com');
    expect(store.getAdminEmails()).toContain('newadmin@corp.com');
  });

  it('does not add duplicate emails', () => {
    store.addAdminEmail('dup@corp.com');
    store.addAdminEmail('dup@corp.com');
    const count = store.getAdminEmails().filter(e => e === 'dup@corp.com').length;
    expect(count).toBe(1);
  });

  it('promotes an already-registered user to admin immediately', () => {
    store.register('Bob', 'bob@corp.com', 'pass');
    store.addAdminEmail('bob@corp.com');

    // Reload store to verify persistence
    const store2 = new MockStore();
    const user = store2.login('bob@corp.com', 'pass');
    expect(user.role).toBe('admin');
  });

  it('is case-insensitive when checking duplicates', () => {
    store.addAdminEmail('admin@corp.com');
    store.addAdminEmail('ADMIN@CORP.COM');
    const count = store.getAdminEmails().filter(e => e === 'admin@corp.com').length;
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// removeAdminEmail()
// ---------------------------------------------------------------------------
describe('removeAdminEmail()', () => {
  it('removes the email from the admin list', () => {
    store.addAdminEmail('temp@corp.com');
    store.removeAdminEmail('temp@corp.com');
    expect(store.getAdminEmails()).not.toContain('temp@corp.com');
  });

  it('is case-insensitive when removing', () => {
    store.addAdminEmail('temp@corp.com');
    store.removeAdminEmail('TEMP@CORP.COM');
    expect(store.getAdminEmails()).not.toContain('temp@corp.com');
  });

  it('downgrades a registered user role to user immediately', () => {
    store.register('Alice', 'alice@corp.com', 'pass');
    store.addAdminEmail('alice@corp.com');
    store.removeAdminEmail('alice@corp.com');

    const store2 = new MockStore();
    const user = store2.login('alice@corp.com', 'pass');
    expect(user.role).toBe('user');
  });
});

// ---------------------------------------------------------------------------
// loginWithGoogle()
// ---------------------------------------------------------------------------
describe('loginWithGoogle()', () => {
  it('auto-registers a new user', () => {
    const user = store.loginWithGoogle('brand.new@google.com');
    expect(user.email).toBe('brand.new@google.com');
  });

  it('logs in an existing user without creating a duplicate', () => {
    store.register('Existing', 'existing@corp.com', 'pass');
    const user = store.loginWithGoogle('existing@corp.com');
    expect(user.email).toBe('existing@corp.com');
  });

  it('gives admin role if the google email is in adminEmails', () => {
    store.addAdminEmail('googleadmin@gmail.com');
    const user = store.loginWithGoogle('googleadmin@gmail.com');
    expect(user.role).toBe('admin');
  });

  it('uses the verified name from Google profile when provided', () => {
    const user = store.loginWithGoogle('jane@gmail.com', 'Jane Smith');
    expect(user.name).toBe('Jane Smith');
  });

  it('falls back to deriving a name from the email when no name is provided', () => {
    const user = store.loginWithGoogle('janedoe@gmail.com');
    expect(user.name).toBe('Janedoe');
  });
});

// ---------------------------------------------------------------------------
// Session persistence across reloads
// ---------------------------------------------------------------------------
describe('session persistence', () => {
  it('restores the logged-in user from localStorage on init', () => {
    store.login('jiyangu923@gmail.com', 'password123');

    // Simulate a page reload by creating a new store instance
    const store2 = new MockStore();
    expect(store2.getCurrentUser()?.email).toBe('jiyangu923@gmail.com');
    expect(store2.getCurrentUser()?.role).toBe('admin');
  });
});
