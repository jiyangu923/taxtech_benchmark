/**
 * Live test of the AI-led intake brain (docs/AI_INTAKE_PIVOT.md) against the
 * DEPLOYED /api/claude mode:'intake'. Runs in CI (workflow intake-live-test.yml)
 * because confirming a test user requires the service-role key, which lives
 * only in GitHub secrets.
 *
 * Modes (MODE env):
 *   drive   (default) — create an ephemeral confirmed user (in-run password,
 *             never printed), play a scripted persona through the interview,
 *             assert extraction correctness, ALWAYS delete the user at the end.
 *   confirm — just email-confirm an existing user (CONFIRM_EMAIL env) so a
 *             human can log in with their locally-created throwaway and test
 *             the real UI. No password is ever transmitted or printed.
 *   report  — ephemeral confirmed user + service-role-inserted approved
 *             submission, then POST the deployed /api/benchmark-report and
 *             assert it generates + emails (to Resend's official test inbox,
 *             which accepts delivery — no bounce). User and row always deleted.
 *   rls     — ephemeral confirmed user attempts to self-promote
 *             (role='admin') and repoint email on its own profiles row with
 *             its OWN JWT; both must be rejected (lock_profiles_columns.sql
 *             column grants) while a name update still succeeds. No model
 *             cost. User always deleted.
 *
 * Exit codes: 0 pass, 1 assertion/transport failure, 2 not configured.
 */

import { pathToFileURL } from 'node:url';
import { INTAKE_ENUMS } from '../api/claude';
import { checkServiceKeyShape } from './env';
import { EMPTY_EXTRACTED, toWireTurns, mergeExtracted, requiredComplete, buildIntakeSubmission, type IntakeExtracted, type IntakeTurn } from '../services/intake';

const SITE_URL = process.env.SITE_URL || 'https://taxbenchmark.ai';
// The publishable (anon) key ships in the public client bundle — not a secret.
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_mmo9723RyXpCIwzb6WWBxg_4uhzGAnk';

// The scripted persona. Each answer maps to expected extractions; the interview
// prompt asks required fields first, so a fixed sequence works.
const PERSONA_TURNS = [
  "We're a public multinational.",
  'I lead the tax technology team.',
  'Around 200 million dollars a year in revenue.',
  'We file in 8 countries.',
  "Roughly 70 to 90 percent of our tax calculation is automated. We've adopted AI — running proofs of concept right now. The tech team is about 10 people. We lean heavily on Alteryx for data prep.",
];
const EXPECTED: Partial<IntakeExtracted> = {
  companyProfile: ['public', 'multinational'],
  respondentRole: 'tax_technology',
  revenueRange: '100m_500m',
  jurisdictionsCovered: 8,
  taxCalculationAutomationRange: '70_90',
  aiAdopted: true,
  genAIAdoptionStage: 'poc',
  taxTechFTEsRange: '6_15',
};
// Fields where model judgment may reasonably differ from the canned expectation
// (e.g. "about 10 people" → 6_15 is right but not iron-clad). Mismatches WARN;
// required-field mismatches FAIL.
const SOFT_FIELDS = new Set(['taxCalculationAutomationRange', 'genAIAdoptionStage', 'taxTechFTEsRange', 'aiAdopted']);

async function adminFetch(path: string, init: RequestInit, serviceKey: string, supabaseUrl: string) {
  const resp = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json', ...(init.headers || {}),
    },
  });
  const body = await resp.json().catch(() => ({}));
  return { status: resp.status, body };
}

async function findUserIdByEmail(email: string, serviceKey: string, supabaseUrl: string): Promise<string | null> {
  // Paginate: the launch cohort is already 100+ users and growing.
  for (let page = 1; page <= 20; page++) {
    const { body } = await adminFetch(`/auth/v1/admin/users?page=${page}&per_page=200`, { method: 'GET' }, serviceKey, supabaseUrl);
    const users: any[] = body?.users || [];
    if (!users.length) return null;
    const hit = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (users.length < 200) return null;
  }
  return null;
}

async function confirmMode(supabaseUrl: string, serviceKey: string): Promise<number> {
  const email = process.env.CONFIRM_EMAIL;
  if (!email) { console.error('NOT CONFIGURED — CONFIRM_EMAIL required in confirm mode'); return 2; }
  const id = await findUserIdByEmail(email, serviceKey, supabaseUrl);
  if (!id) { console.error(`No auth user found for ${email} — sign up on the site first.`); return 1; }
  const { status } = await adminFetch(`/auth/v1/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ email_confirm: true }) }, serviceKey, supabaseUrl);
  if (status !== 200) { console.error(`Confirm failed: HTTP ${status}`); return 1; }
  console.log(`Confirmed ${email} — you can now sign in on ${SITE_URL} and test the interview UI.`);
  return 0;
}

async function driveMode(supabaseUrl: string, serviceKey: string): Promise<number> {
  const runId = process.env.GITHUB_RUN_ID || String(Math.floor(Math.random() * 1e9));
  const email = `intake-drive-${runId}@taxbenchmark-test.dev`;
  const password = process.env.DRIVE_PASSWORD; // generated by the workflow, never printed
  if (!password) { console.error('NOT CONFIGURED — DRIVE_PASSWORD required in drive mode'); return 2; }

  // 1. Create a confirmed ephemeral user.
  const created = await adminFetch('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name: 'Intake Drivebot' } }),
  }, serviceKey, supabaseUrl);
  const userId: string | undefined = created.body?.id;
  if (!userId) { console.error(`User create failed: HTTP ${created.status} ${JSON.stringify(created.body).slice(0, 200)}`); return 1; }
  console.log(`Created ephemeral drive user (${email})`);

  let exitCode = 0;
  try {
    // 2. Password-grant sign-in for a bearer token.
    const tokenResp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const tokenBody = await tokenResp.json().catch(() => ({}));
    const accessToken = tokenBody?.access_token;
    if (!accessToken) { console.error(`Sign-in failed: HTTP ${tokenResp.status}`); return 1; }

    // 3. Drive the interview — same wire shape the client sends (toWireTurns).
    const display: IntakeTurn[] = [];
    let acc: IntakeExtracted = { ...EMPTY_EXTRACTED };
    let complete = false;
    const answers = [...PERSONA_TURNS, "That's everything from me — please wrap up.", 'Please finish now.'];

    for (const answer of answers) {
      if (complete) break;
      display.push({ role: 'user', content: answer });
      // The exact wire shape the client sends — same function, zero drift.
      const wire = toWireTurns(display);
      const resp = await fetch(`${SITE_URL}/api/claude`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ mode: 'intake', messages: wire }),
      });
      const body = await resp.json().catch(() => ({}));
      if (resp.status !== 200 || !body?.json) {
        console.error(`Turn failed: HTTP ${resp.status} ${JSON.stringify(body).slice(0, 300)}`);
        return 1;
      }
      const turn = body.json as { reply: string; extracted: Partial<IntakeExtracted>; complete: boolean };
      display.push({ role: 'assistant', content: turn.reply });
      acc = mergeExtracted(acc, turn.extracted);
      complete = turn.complete && requiredComplete(acc);
      console.log(`\nYOU:  ${answer}`);
      console.log(`TAXI: ${turn.reply}`);
      console.log(`      extracted so far: ${JSON.stringify(acc)}`);
    }

    // 4. Assertions.
    const failures: string[] = [];
    const warnings: string[] = [];
    if (!complete) failures.push('interview never reached complete');
    if (!requiredComplete(acc)) failures.push('required fields missing at end');
    for (const [field, expected] of Object.entries(EXPECTED)) {
      const got = (acc as any)[field];
      const matches = JSON.stringify(field === 'companyProfile' ? [...(got ?? [])].sort() : got)
        === JSON.stringify(field === 'companyProfile' ? [...(expected as string[])].sort() : expected);
      if (!matches) {
        (SOFT_FIELDS.has(field) ? warnings : failures).push(`${field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
      }
    }
    // Every enum value must be legal (schema should guarantee this — verify anyway).
    for (const [field, allowed] of Object.entries(INTAKE_ENUMS)) {
      const v = (acc as any)[field === 'companyProfile' ? 'companyProfile' : field];
      if (field === 'companyProfile') {
        for (const item of v ?? []) if (!(allowed as readonly string[]).includes(item)) failures.push(`illegal enum ${field}=${item}`);
      } else if (v != null && !(allowed as readonly string[]).includes(v)) {
        failures.push(`illegal enum ${field}=${v}`);
      }
    }

    console.log('\n── Result ─────────────────────────────');
    warnings.forEach(w => console.log(`WARN: ${w}`));
    failures.forEach(f => console.error(`FAIL: ${f}`));
    if (failures.length) { exitCode = 1; } else {
      console.log(`PASS — interview completed in ${display.length / 2} turns, all required fields extracted correctly.`);
    }
  } finally {
    // 5. Always delete the ephemeral user (its ai_answers audit rows remain).
    const del = await adminFetch(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' }, serviceKey, supabaseUrl);
    console.log(del.status === 200 ? 'Ephemeral drive user deleted.' : `WARN: user delete returned HTTP ${del.status}`);
  }
  return exitCode;
}

async function reportMode(supabaseUrl: string, serviceKey: string): Promise<number> {
  const runId = process.env.GITHUB_RUN_ID || String(Math.floor(Math.random() * 1e9));
  // Resend's official test inbox: accepts and "delivers" the send, never
  // bounces, so the live email is real but harmless. The +label keeps each
  // run's auth user unique.
  const email = `delivered+report-${runId}@resend.dev`;
  const password = process.env.DRIVE_PASSWORD; // generated by the workflow, never printed
  if (!password) { console.error('NOT CONFIGURED — DRIVE_PASSWORD required in report mode'); return 2; }

  // 1. Ephemeral confirmed user (profile row auto-created by trigger).
  const created = await adminFetch('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name: 'Report Drivebot' } }),
  }, serviceKey, supabaseUrl);
  const userId: string | undefined = created.body?.id;
  if (!userId) { console.error(`User create failed: HTTP ${created.status} ${JSON.stringify(created.body).slice(0, 200)}`); return 1; }
  console.log('Created ephemeral report user (delivered+…@resend.dev)');

  let exitCode = 0;
  try {
    // 2. Approved current submission, inserted with the service role — the
    // exact record shape the intake flow creates (same builder, zero drift).
    // It joins the live cohort for the ~seconds this test runs, then is deleted.
    const acc: IntakeExtracted = {
      ...EMPTY_EXTRACTED,
      companyProfile: ['public', 'multinational'],
      respondentRole: 'tax_technology',
      revenueRange: '100m_500m',
      jurisdictionsCovered: 8,
      taxCalculationAutomationRange: '70_90',
      aiAdopted: true,
      genAIAdoptionStage: 'poc',
      taxTechFTEsRange: '6_15',
    };
    const row = {
      ...buildIntakeSubmission(acc),
      userId, userName: 'Report Drivebot',
      status: 'approved', submittedAt: new Date().toISOString(), is_current: true, survey_version: 1,
    };
    const ins = await adminFetch('/rest/v1/submissions', {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row),
    }, serviceKey, supabaseUrl);
    if (ins.status !== 201) { console.error(`Submission insert failed: HTTP ${ins.status} ${JSON.stringify(ins.body).slice(0, 300)}`); return 1; }

    // 3. Password-grant sign-in, then hit the deployed endpoint as the client does.
    const tokenResp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const accessToken = (await tokenResp.json().catch(() => ({})))?.access_token;
    if (!accessToken) { console.error(`Sign-in failed: HTTP ${tokenResp.status}`); return 1; }

    const resp = await fetch(`${SITE_URL}/api/benchmark-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    });
    const body = await resp.json().catch(() => ({}));

    // 4. Assertions. emailedTo must be the masked AUTH identity — the endpoint
    // never reads profiles.email (review P1: that column is self-updatable).
    const failures: string[] = [];
    if (resp.status !== 200) failures.push(`expected HTTP 200, got ${resp.status} ${JSON.stringify(body).slice(0, 300)}`);
    if (body?.ok !== true) failures.push(`expected ok:true, got ${JSON.stringify(body?.ok)}`);
    if (body?.emailedTo !== 'de***@resend.dev') failures.push(`expected emailedTo de***@resend.dev, got ${JSON.stringify(body?.emailedTo)}`);

    console.log('\n── Result ─────────────────────────────');
    failures.forEach(f => console.error(`FAIL: ${f}`));
    if (failures.length) { exitCode = 1; } else {
      console.log(`PASS — report generated and accepted by Resend for ${body.emailedTo} (Resend test inbox).`);
    }
  } finally {
    // 5. Always remove the drivebot's cohort row first, then the user.
    const delSub = await adminFetch(`/rest/v1/submissions?userId=eq.${userId}`, { method: 'DELETE' }, serviceKey, supabaseUrl);
    if (delSub.status >= 300) console.log(`WARN: submission delete returned HTTP ${delSub.status}`);
    const del = await adminFetch(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' }, serviceKey, supabaseUrl);
    console.log(del.status === 200 ? 'Ephemeral report user deleted.' : `WARN: user delete returned HTTP ${del.status}`);
  }
  return exitCode;
}

async function rlsMode(supabaseUrl: string, serviceKey: string): Promise<number> {
  const runId = process.env.GITHUB_RUN_ID || String(Math.floor(Math.random() * 1e9));
  const email = `rls-drive-${runId}@taxbenchmark-test.dev`;
  const password = process.env.DRIVE_PASSWORD; // generated by the workflow, never printed
  if (!password) { console.error('NOT CONFIGURED — DRIVE_PASSWORD required in rls mode'); return 2; }

  const created = await adminFetch('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name: 'RLS Drivebot' } }),
  }, serviceKey, supabaseUrl);
  const userId: string | undefined = created.body?.id;
  if (!userId) { console.error(`User create failed: HTTP ${created.status} ${JSON.stringify(created.body).slice(0, 200)}`); return 1; }
  console.log('Created ephemeral RLS user');

  let exitCode = 0;
  try {
    const tokenResp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const accessToken = (await tokenResp.json().catch(() => ({})))?.access_token;
    if (!accessToken) { console.error(`Sign-in failed: HTTP ${tokenResp.status}`); return 1; }

    // PATCH own profiles row with the USER's JWT — exactly what a malicious
    // client would do with the shipped supabase-js + anon key.
    const userPatch = async (payload: Record<string, unknown>) => {
      const resp = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          apikey: ANON_KEY, Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify(payload),
      });
      return resp.status;
    };

    const roleStatus = await userPatch({ role: 'admin' });
    const emailStatus = await userPatch({ email: `evil-${runId}@example.com` });
    const nameStatus = await userPatch({ name: 'RLS Drivebot Renamed' });

    // Ground truth from the service role — status codes alone can lie
    // (PostgREST returns 204 even for 0-row updates).
    const check = await adminFetch(`/rest/v1/profiles?id=eq.${userId}&select=role,email,name`, { method: 'GET' }, serviceKey, supabaseUrl);
    const rowAfter = (check.body as any[])?.[0] ?? {};

    const failures: string[] = [];
    if (roleStatus < 400) failures.push(`role self-promotion was ACCEPTED (HTTP ${roleStatus}) — expected 4xx permission denied`);
    if (rowAfter.role !== 'user') failures.push(`role in DB is '${rowAfter.role}' — self-promotion went through`);
    if (emailStatus < 400) failures.push(`email repoint was ACCEPTED (HTTP ${emailStatus}) — expected 4xx permission denied`);
    if (rowAfter.email !== email) failures.push('email in DB changed — repoint went through');
    if (nameStatus >= 400) failures.push(`legit name update REJECTED (HTTP ${nameStatus}) — lockdown is too broad`);
    if (rowAfter.name !== 'RLS Drivebot Renamed') failures.push(`name in DB is '${rowAfter.name}' — the allowed column did not update`);

    console.log('\n── Result ─────────────────────────────');
    console.log(`role patch: HTTP ${roleStatus} · email patch: HTTP ${emailStatus} · name patch: HTTP ${nameStatus}`);
    failures.forEach(f => console.error(`FAIL: ${f}`));
    if (failures.length) { exitCode = 1; } else {
      console.log('PASS — role/email writes rejected, name write allowed, DB row confirms.');
    }
  } finally {
    const del = await adminFetch(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' }, serviceKey, supabaseUrl);
    console.log(del.status === 200 ? 'Ephemeral RLS user deleted.' : `WARN: user delete returned HTTP ${del.status}`);
  }
  return exitCode;
}

async function main(): Promise<number> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('NOT CONFIGURED — need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
    return 2;
  }
  const keyErr = checkServiceKeyShape(serviceKey);
  if (keyErr) { console.error(`NOT CONFIGURED — ${keyErr}`); return 2; }
  const mode = process.env.MODE === 'confirm' ? confirmMode
    : process.env.MODE === 'report' ? reportMode
    : process.env.MODE === 'rls' ? rlsMode
    : driveMode;
  return mode(supabaseUrl, serviceKey);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then(code => process.exit(code)).catch(e => {
    console.error('intake-live crashed:', e?.message || e);
    process.exit(1);
  });
}
