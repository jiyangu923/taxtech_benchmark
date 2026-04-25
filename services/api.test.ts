// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Supabase mock ────────────────────────────────────────────────────────────
//
// We need to mock the Supabase fluent builder chain (e.g. from().select().eq().single()).
// The trick: each per-table mock is a plain object that is also *thenable* (has a .then()
// method), so `await chain` works just like awaiting a Promise.  When a test needs to
// control the resolved value it calls `table.mockResolveWith(value)` to queue a response.
// For `.single()` calls (the most common terminal), tests use the standard
// `table.single.mockResolvedValueOnce(...)` Vitest helper.
//
// All chain method mocks are reset and re-wired to return `this` in beforeEach.

const { profiles, submissions, settings, mockFrom, mockAuth, mockRpc } = vi.hoisted(() => {
  function makeTableMock() {
    const resolveQueue: any[] = [];

    const t: any = {
      // Thenable – lets `await chain` resolve to a queued value (or a safe default).
      then(onFulfilled: any, onRejected: any) {
        const val = resolveQueue.length
          ? resolveQueue.shift()
          : { data: null, error: null };
        return Promise.resolve(val).then(onFulfilled, onRejected);
      },
      // Queue one response for the next `await chain` (non-single terminal).
      mockResolveWith(val: any) {
        resolveQueue.push(val);
      },
      // Called in beforeEach to flush queue + re-wire chain methods.
      _reset() {
        resolveQueue.length = 0;
        for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'not', 'upsert']) {
          t[m].mockReset();
          t[m].mockReturnValue(t);
        }
        t.single.mockReset();
      },
    };

    for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'not', 'upsert']) {
      t[m] = vi.fn(() => t);
    }
    t.single = vi.fn();
    return t;
  }

  const profiles   = makeTableMock();
  const submissions = makeTableMock();
  const settings   = makeTableMock();

  const mockFrom = vi.fn((table: string) => {
    if (table === 'profiles')    return profiles;
    if (table === 'submissions') return submissions;
    if (table === 'settings')    return settings;
    return makeTableMock();
  });

  const mockAuth = {
    getUser:              vi.fn(),
    signUp:               vi.fn(),
    signInWithPassword:   vi.fn(),
    signInWithOAuth:      vi.fn().mockResolvedValue({}),
    signOut:              vi.fn().mockResolvedValue({}),
  };

  // SECURITY DEFINER RPCs (promote_to_admin, demote_from_admin).
  // Default: succeeds with no error. Tests can override per-call with mockResolvedValueOnce.
  const mockRpc = vi.fn().mockResolvedValue({ error: null });

  return { profiles, submissions, settings, mockFrom, mockAuth, mockRpc };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: mockAuth, from: mockFrom, rpc: mockRpc }),
}));

beforeEach(() => {
  profiles._reset();
  submissions._reset();
  settings._reset();

  mockFrom.mockReset();
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles')    return profiles;
    if (table === 'submissions') return submissions;
    if (table === 'settings')    return settings;
    return profiles;
  });

  mockAuth.getUser.mockReset();
  mockAuth.signUp.mockReset();
  mockAuth.signInWithPassword.mockReset();
  mockAuth.signInWithOAuth.mockReset().mockResolvedValue({});
  mockAuth.signOut.mockReset().mockResolvedValue({});

  mockRpc.mockReset().mockResolvedValue({ error: null });
});

// Static import is fine: vi.mock() is hoisted before module resolution.
import { api } from './api';

// ─── getCurrentUser ───────────────────────────────────────────────────────────

describe('getCurrentUser', () => {
  it('returns null when there is no active session', async () => {
    mockAuth.getUser.mockResolvedValueOnce({ data: { user: null } });
    expect(await api.getCurrentUser()).toBeNull();
  });

  it('returns the profile row for an authenticated user', async () => {
    const profile = { id: 'u1', name: 'Alice', email: 'alice@test.com', role: 'user' };
    mockAuth.getUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } });
    profiles.single.mockResolvedValueOnce({ data: profile });
    expect(await api.getCurrentUser()).toEqual(profile);
  });

  it('returns null when the profile row does not exist and recreation fails', async () => {
    mockAuth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'u1', email: 'new@test.com', user_metadata: {} } },
    });
    profiles.single.mockResolvedValueOnce({ data: null });   // initial profile lookup
    settings.single.mockResolvedValueOnce({ data: null });   // getAdminEmails() → fallback list
    profiles.single.mockResolvedValueOnce({ data: null });   // insert().select().single() → fails
    expect(await api.getCurrentUser()).toBeNull();
  });
});

// ─── register ────────────────────────────────────────────────────────────────

describe('register', () => {
  it('calls signUp with the correct arguments', async () => {
    mockAuth.signUp.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });
    await api.register('Alice', 'alice@test.com', 'password123');
    expect(mockAuth.signUp).toHaveBeenCalledWith({
      email: 'alice@test.com',
      password: 'password123',
      options: { data: { full_name: 'Alice' } },
    });
  });

  it('throws when Supabase returns an auth error', async () => {
    mockAuth.signUp.mockResolvedValueOnce({
      data: {}, error: { message: 'Email already registered' },
    });
    await expect(api.register('Alice', 'alice@test.com', 'pass'))
      .rejects.toThrow('Email already registered');
  });

  it('throws when signUp returns no user object', async () => {
    mockAuth.signUp.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(api.register('Alice', 'alice@test.com', 'pass'))
      .rejects.toThrow('Registration failed');
  });
});

// ─── login ────────────────────────────────────────────────────────────────────

describe('login', () => {
  it('returns the user profile on valid credentials', async () => {
    const profile = { id: 'u1', name: 'Alice', email: 'alice@test.com', role: 'user' };
    mockAuth.signInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'u1' } }, error: null,
    });
    profiles.single.mockResolvedValueOnce({ data: profile });
    expect(await api.login('alice@test.com', 'pass')).toEqual(profile);
  });

  it('throws when Supabase returns an auth error', async () => {
    mockAuth.signInWithPassword.mockResolvedValueOnce({
      data: {}, error: { message: 'Invalid login credentials' },
    });
    await expect(api.login('bad@test.com', 'wrong'))
      .rejects.toThrow('Invalid login credentials');
  });

  it('throws when auth succeeds but the profile row is missing', async () => {
    mockAuth.signInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'u1' } }, error: null,
    });
    profiles.single.mockResolvedValueOnce({ data: null });
    await expect(api.login('unregistered@test.com', 'pass'))
      .rejects.toThrow('Account not found. Please register first or confirm your email.');
  });

  it('throws when auth returns a null user', async () => {
    mockAuth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null }, error: null,
    });
    await expect(api.login('alice@test.com', 'pass'))
      .rejects.toThrow('Login failed');
  });
});

// ─── logout ───────────────────────────────────────────────────────────────────

describe('logout', () => {
  it('calls supabase signOut', async () => {
    await api.logout();
    expect(mockAuth.signOut).toHaveBeenCalled();
  });
});

// ─── createSubmission ─────────────────────────────────────────────────────────

describe('createSubmission', () => {
  it('throws when the user is not authenticated', async () => {
    mockAuth.getUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(api.createSubmission({} as any)).rejects.toThrow('Must be logged in');
  });

  it('throws when the user profile row is missing', async () => {
    mockAuth.getUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } });
    profiles.single.mockResolvedValueOnce({ data: null });
    await expect(api.createSubmission({} as any)).rejects.toThrow('Profile not found');
  });

  it('deletes the previous submission and inserts a new one', async () => {
    const profile = { id: 'u1', name: 'Alice' };
    const newSub  = { id: 's1', userId: 'u1', userName: 'Alice', status: 'pending' };
    mockAuth.getUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } });
    profiles.single.mockResolvedValueOnce({ data: profile });
    submissions.single.mockResolvedValueOnce({ data: newSub, error: null });

    const result = await api.createSubmission({ revenueRange: '100m_500m' } as any);

    expect(submissions.delete).toHaveBeenCalled();
    expect(submissions.insert).toHaveBeenCalled();
    expect(result.status).toBe('pending');
    expect(result.userName).toBe('Alice');
  });

  it('stamps the submission with the correct userId and userName', async () => {
    const profile = { id: 'uid-99', name: 'Bob' };
    mockAuth.getUser.mockResolvedValueOnce({ data: { user: { id: 'uid-99' } } });
    profiles.single.mockResolvedValueOnce({ data: profile });
    submissions.single.mockResolvedValueOnce({
      data: { id: 's2', userId: 'uid-99', userName: 'Bob', status: 'pending' },
      error: null,
    });

    const result = await api.createSubmission({ revenueRange: 'over_5b' } as any);

    const insertArg = submissions.insert.mock.calls[0][0];
    expect(insertArg.userId).toBe('uid-99');
    expect(insertArg.userName).toBe('Bob');
    expect(insertArg.status).toBe('pending');
    expect(result.userId).toBe('uid-99');
  });

  it('throws when the database insert fails', async () => {
    mockAuth.getUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } });
    profiles.single.mockResolvedValueOnce({ data: { id: 'u1', name: 'Alice' } });
    submissions.single.mockResolvedValueOnce({ data: null, error: { message: 'Insert failed' } });
    await expect(api.createSubmission({} as any)).rejects.toThrow('Insert failed');
  });
});

// ─── getSubmissions ───────────────────────────────────────────────────────────

describe('getSubmissions', () => {
  it('returns the array of submissions from the database', async () => {
    const rows = [{ id: 's1' }, { id: 's2' }];
    submissions.select.mockResolvedValueOnce({ data: rows, error: null });
    expect(await api.getSubmissions()).toEqual(rows);
  });

  it('returns an empty array when there are no rows', async () => {
    submissions.select.mockResolvedValueOnce({ data: null, error: null });
    expect(await api.getSubmissions()).toEqual([]);
  });

  it('throws on a database error', async () => {
    submissions.select.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });
    await expect(api.getSubmissions()).rejects.toThrow('DB error');
  });
});

// ─── updateSubmissionStatus ───────────────────────────────────────────────────

describe('updateSubmissionStatus', () => {
  it('calls update with the correct status and id', async () => {
    submissions.eq.mockResolvedValueOnce({ error: null });
    await api.updateSubmissionStatus('s1', 'approved');
    expect(submissions.update).toHaveBeenCalledWith({ status: 'approved' });
    expect(submissions.eq).toHaveBeenCalledWith('id', 's1');
  });

  it('calls update with rejected status', async () => {
    submissions.eq.mockResolvedValueOnce({ error: null });
    await api.updateSubmissionStatus('s2', 'rejected');
    expect(submissions.update).toHaveBeenCalledWith({ status: 'rejected' });
  });

  it('throws on a database error', async () => {
    submissions.eq.mockResolvedValueOnce({ error: { message: 'Update failed' } });
    await expect(api.updateSubmissionStatus('s1', 'approved')).rejects.toThrow('Update failed');
  });
});

// ─── deleteSubmission ─────────────────────────────────────────────────────────

describe('deleteSubmission', () => {
  it('calls delete with the correct id', async () => {
    submissions.eq.mockResolvedValueOnce({ error: null });
    await api.deleteSubmission('s1');
    expect(submissions.delete).toHaveBeenCalled();
    expect(submissions.eq).toHaveBeenCalledWith('id', 's1');
  });

  it('throws on a database error', async () => {
    submissions.eq.mockResolvedValueOnce({ error: { message: 'Delete failed' } });
    await expect(api.deleteSubmission('s1')).rejects.toThrow('Delete failed');
  });
});

// ─── updateUserProfile ────────────────────────────────────────────────────────

describe('updateUserProfile', () => {
  it('returns the updated profile', async () => {
    const updated = { id: 'u1', name: 'New Name', email: 'new@test.com', role: 'user' as const };
    profiles.single.mockResolvedValueOnce({ data: updated, error: null });
    const result = await api.updateUserProfile(updated);
    expect(result.name).toBe('New Name');
    expect(result.email).toBe('new@test.com');
  });

  it('throws on a database error', async () => {
    const user = { id: 'u1', name: 'X', email: 'x@x.com', role: 'user' as const };
    profiles.single.mockResolvedValueOnce({ data: null, error: { message: 'Update failed' } });
    await expect(api.updateUserProfile(user)).rejects.toThrow('Update failed');
  });
});

// ─── getAdminEmails ───────────────────────────────────────────────────────────

describe('getAdminEmails', () => {
  it('returns INITIAL_ADMINS when no settings row exists', async () => {
    settings.single.mockResolvedValueOnce({ data: null });
    const emails = await api.getAdminEmails();
    expect(emails).toContain('admin@taxbenchmark.com');
    expect(emails).toContain('jiyangu923@gmail.com');
  });

  it('returns the parsed list stored in settings', async () => {
    const stored = ['custom@example.com', 'another@example.com'];
    settings.single.mockResolvedValueOnce({ data: { value: JSON.stringify(stored) } });
    expect(await api.getAdminEmails()).toEqual(stored);
  });

  it('falls back to INITIAL_ADMINS when the stored value is invalid JSON', async () => {
    settings.single.mockResolvedValueOnce({ data: { value: 'NOT_VALID_JSON' } });
    const emails = await api.getAdminEmails();
    expect(emails).toContain('admin@taxbenchmark.com');
  });
});

// ─── addAdminEmail ────────────────────────────────────────────────────────────

describe('addAdminEmail', () => {
  it('appends a new email and persists the updated list', async () => {
    settings.single.mockResolvedValueOnce({ data: null }); // getAdminEmails → INITIAL_ADMINS
    await api.addAdminEmail('newadmin@example.com');
    const upsertArg = settings.upsert.mock.calls[0][0];
    const updatedList = JSON.parse(upsertArg.value);
    expect(updatedList).toContain('newadmin@example.com');
  });

  it('calls the promote_to_admin RPC with the lowercased email', async () => {
    settings.single.mockResolvedValueOnce({ data: null });
    await api.addAdminEmail('NewAdmin@Example.COM');
    expect(mockRpc).toHaveBeenCalledWith('promote_to_admin', { target_email: 'newadmin@example.com' });
  });

  it('does not duplicate an already-listed admin email but still re-promotes', async () => {
    const existing = ['admin@taxbenchmark.com', 'jiyangu923@gmail.com'];
    settings.single.mockResolvedValueOnce({ data: { value: JSON.stringify(existing) } });
    await api.addAdminEmail('admin@taxbenchmark.com');
    // upsert should NOT be called when the email is already in the list
    expect(settings.upsert).not.toHaveBeenCalled();
    // …but the RPC must still run so a previously-unpromoted profile gets fixed
    expect(mockRpc).toHaveBeenCalledWith('promote_to_admin', { target_email: 'admin@taxbenchmark.com' });
  });

  it('throws when the RPC returns an error', async () => {
    settings.single.mockResolvedValueOnce({ data: null });
    mockRpc.mockResolvedValueOnce({ error: { message: 'Only admins can promote users' } });
    await expect(api.addAdminEmail('newadmin@example.com'))
      .rejects.toThrow('Only admins can promote users');
  });
});

// ─── removeAdminEmail ─────────────────────────────────────────────────────────

describe('removeAdminEmail', () => {
  it('removes the specified email from the list', async () => {
    const existing = ['a@x.com', 'b@x.com'];
    settings.single.mockResolvedValueOnce({ data: { value: JSON.stringify(existing) } });
    await api.removeAdminEmail('a@x.com');
    const upsertArg = settings.upsert.mock.calls[0][0];
    const updatedList = JSON.parse(upsertArg.value);
    expect(updatedList).not.toContain('a@x.com');
    expect(updatedList).toContain('b@x.com');
  });

  it('calls the demote_from_admin RPC with the lowercased email', async () => {
    settings.single.mockResolvedValueOnce({ data: { value: JSON.stringify(['a@x.com']) } });
    await api.removeAdminEmail('A@X.com');
    expect(mockRpc).toHaveBeenCalledWith('demote_from_admin', { target_email: 'a@x.com' });
  });

  it('leaves the list unchanged when removing a non-existent email', async () => {
    const existing = ['a@x.com'];
    settings.single.mockResolvedValueOnce({ data: { value: JSON.stringify(existing) } });
    await api.removeAdminEmail('nobody@x.com');
    const upsertArg = settings.upsert.mock.calls[0][0];
    const updatedList = JSON.parse(upsertArg.value);
    expect(updatedList).toEqual(existing);
  });

  it('throws when the RPC returns an error', async () => {
    settings.single.mockResolvedValueOnce({ data: { value: JSON.stringify(['a@x.com']) } });
    mockRpc.mockResolvedValueOnce({ error: { message: 'Cannot demote yourself' } });
    await expect(api.removeAdminEmail('a@x.com'))
      .rejects.toThrow('Cannot demote yourself');
  });
});
