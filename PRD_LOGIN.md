# PRD: Login & Admin User Management

## Overview

This document defines the requirements to fix the broken login flow and implement reliable admin user management for the TaxTech Benchmark portal.

---

## Problem Statement

1. **Login role mismatch**: A user's role is stored in `localStorage` at registration time. If an email is later added to the `adminEmails` allowlist, the user's stored role is never updated, so they log in as `user` even though they should be `admin`.
2. **Email case sensitivity**: `addAdminEmail` stores emails as-is, but login comparisons use `.toLowerCase()`, creating subtle mismatches.
3. **Admin promotion doesn't update live session**: When an admin promotes another email, the target user's role isn't corrected until they re-register.
4. **Admin demotion doesn't downgrade role**: Removing an email from the admin list doesn't downgrade the stored user record.
5. **TypeScript type mismatch**: `handleAuthSuccess` in `App.tsx` has no parameters but is passed as a prop typed `(email, name, password?) => void`, causing a TS build error.

---

## Goals

- `jiyangu923@gmail.com` is always recognized as admin on login, regardless of what is stored in localStorage.
- Any admin can add or remove other admin users from the Admin panel.
- Adding/removing an admin email takes effect immediately for any registered user with that email.
- Login and registration are reliable, case-insensitive, and consistent.

---

## User Stories

| # | As a... | I want to... | So that... |
|---|---------|-------------|------------|
| 1 | Admin (`jiyangu923@gmail.com`) | Log in and immediately have admin access | I can manage the portal without manual fixes |
| 2 | Admin | Add a new admin by entering their email | I can delegate admin duties |
| 3 | Admin | Remove admin access from another admin | I can revoke access when needed |
| 4 | New user | Register with my email and get correct role | Admins get admin, users get user |
| 5 | Returning user | Log in and have my correct current role | Role changes by an admin take effect |

---

## Functional Requirements

### FR-1: Role resolution on login
- On every login, the user's role **must** be resolved from the live `adminEmails` list, not from the cached `users` store.
- If the user's stored role differs from their current entitlement, update the record and persist.

### FR-2: Role resolution on register
- When a new user registers, check `adminEmails` (case-insensitive) to assign the correct initial role.

### FR-3: Admin email normalization
- All emails in `adminEmails` **must** be stored as lowercase.
- All comparisons against `adminEmails` **must** be case-insensitive.

### FR-4: Promote user when admin email is added
- When an admin adds an email to `adminEmails`:
  - If a registered user exists with that email, upgrade their `role` to `'admin'` immediately.
  - Persist the updated user record.

### FR-5: Demote user when admin email is removed
- When an admin removes an email from `adminEmails`:
  - If a registered user exists with that email, downgrade their `role` to `'user'` immediately.
  - Persist the updated user record.

### FR-6: Cannot remove own admin access
- An admin cannot remove their own email from the admin list (already guarded in the UI; must also be consistent with store state).

### FR-7: Seeded admin account
- `jiyangu923@gmail.com` is always in `INITIAL_ADMINS`.
- Default password for the seeded account is `password123`.

---

## Non-Goals

- Real authentication (this app uses a mock store / localStorage).
- Password reset flow.
- Email verification.

---

## Implementation Notes

- Changes are confined to `services/mockStore.ts` and `App.tsx`.
- No new files or dependencies required.
- All fixes are backwards-compatible with existing localStorage data.
