// routes/api/test-supabase.js — Supabase connectivity diagnostic endpoint.
// Runs a battery of checks against Supabase and Postgres, returns JSON results.
// Does NOT own auth session logic — checks run anonymously with no user session.
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const { countMemberProfiles, countUserMemberships, writeAndRollbackDiagnosticLog } = require('../../db/diagnostic');

// Run a single named check; catches all errors; measures latency.
// fn may return { __warn: true, ...detail } to signal a non-fatal warning.
async function runCheck(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    if (detail && detail.__warn) {
      const { __warn, ...rest } = detail;
      return { name, status: 'warn', latency_ms: Date.now() - start, detail: rest, error: null };
    }
    return { name, status: 'pass', latency_ms: Date.now() - start, detail, error: null };
  } catch (err) {
    return { name, status: 'fail', latency_ms: Date.now() - start, detail: null, error: err.message };
  }
}

// Mask env-var values — show presence but not the secret itself.
function envMask(key) {
  const val = process.env[key];
  if (!val) return { present: false, value: null };
  // Show first 8 chars + masked remainder so you can confirm it's the right key
  const masked = val.length > 8 ? val.slice(0, 8) + '…[masked]' : '[masked]';
  return { present: true, value: masked };
}

router.get('/', async (_req, res) => {
  const SUPABASE_URL     = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const results = [];

  // ── 1. client_init ──────────────────────────────────────────────────────────
  let anonClient = null;
  results.push(await runCheck('client_init', async () => {
    const envInfo = {
      SUPABASE_URL: envMask('SUPABASE_URL'),
      SUPABASE_ANON_KEY: envMask('SUPABASE_ANON_KEY'),
    };
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not set');
    }
    anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { transport: ws } });
    return { client_constructed: true, env: envInfo };
  }));

  // ── 2. service_role_init ────────────────────────────────────────────────────
  // SUPABASE_SERVICE_ROLE_KEY is an optional admin-only credential used for
  // user management operations. Missing key → warn (not fail); connectivity still verified.
  let serviceClient = null;
  results.push(await runCheck('service_role_init', async () => {
    const envInfo = { SUPABASE_SERVICE_ROLE_KEY: envMask('SUPABASE_SERVICE_ROLE_KEY') };
    if (!SERVICE_ROLE_KEY) {
      return {
        __warn: true,
        service_client_constructed: false,
        env: envInfo,
        note: 'SUPABASE_SERVICE_ROLE_KEY not set — add it in Render env vars → Supabase Project Settings → API → service_role key. Required for admin user management only.',
      };
    }
    if (!SUPABASE_URL) throw new Error('SUPABASE_URL not set');
    serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { realtime: { transport: ws } });
    return { service_client_constructed: true, env: envInfo };
  }));

  // ── 3. db_read_member_profiles ──────────────────────────────────────────────
  results.push(await runCheck('db_read_member_profiles', async () => {
    if (!anonClient) throw new Error('anon client not initialised (client_init failed)');
    const { data, error } = await anonClient
      .from('member_profiles')
      .select('*', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    // count may be null if RLS blocks it — that's fine, it proves the table exists.
    // Get direct Postgres count for ground truth.
    const directCount = await countMemberProfiles();
    return { supabase_postgrest_ok: true, count_via_postgres: directCount };
  }));

  // ── 4. db_read_user_memberships ─────────────────────────────────────────────
  results.push(await runCheck('db_read_user_memberships', async () => {
    if (!anonClient) throw new Error('anon client not initialised (client_init failed)');
    const { error } = await anonClient
      .from('user_memberships')
      .select('*', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    const directCount = await countUserMemberships();
    return { count_via_postgres: directCount };
  }));

  // ── 5. db_write_rollback ────────────────────────────────────────────────────
  results.push(await runCheck('db_write_rollback', async () => {
    // diagnostic_log table created by migration; insert + delete proves write path
    const insertedId = await writeAndRollbackDiagnosticLog();
    return { inserted_id: insertedId, deleted: true };
  }));

  // ── 6. auth_signup_dry_run ───────────────────────────────────────────────────
  results.push(await runCheck('auth_signup_dry_run', async () => {
    if (!anonClient) throw new Error('anon client not initialised (client_init failed)');
    const throwaway = `diagnostic+${Date.now()}@wagesociety.test`;
    const { data, error } = await anonClient.auth.signUp({
      email: throwaway,
      password: `Diag_${Date.now()}_!`,
    });

    // Supabase may return error if the domain is blocked or email confirmations required.
    // We capture the full response regardless.
    const userId = data?.user?.id || null;

    // If a user was actually created (service client available), clean it up.
    if (userId && serviceClient) {
      try {
        await serviceClient.auth.admin.deleteUser(userId);
      } catch (_) {
        // best-effort cleanup; don't fail the check
      }
    }

    if (error) {
      // signUp error can be expected (e.g. email domain blocked) — report it but distinguish
      // from a client connectivity failure.
      return {
        email: throwaway,
        signup_error: error.message,
        user_created: false,
        note: 'signUp API reached; error may be config (email domain, confirmations required)',
      };
    }

    return {
      email: throwaway,
      user_id: userId,
      user_created: !!userId,
      cleaned_up: !!userId && !!serviceClient,
    };
  }));

  // ── 7. auth_session_lookup ──────────────────────────────────────────────────
  results.push(await runCheck('auth_session_lookup', async () => {
    if (!anonClient) throw new Error('anon client not initialised (client_init failed)');
    const { data, error } = await anonClient.auth.getSession();
    if (error) throw new Error(error.message);
    // No session expected (anonymous call) — presence of null session proves auth client responds
    return { session_present: !!data?.session, auth_client_responded: true };
  }));

  // ── 8. storage_list_buckets ─────────────────────────────────────────────────
  results.push(await runCheck('storage_list_buckets', async () => {
    if (!anonClient) throw new Error('anon client not initialised (client_init failed)');
    const { data, error } = await anonClient.storage.listBuckets();
    if (error) throw new Error(error.message);
    const names = (data || []).map(b => b.name);
    return { bucket_count: names.length, buckets: names };
  }));

  // ── 9. rls_protected_query ──────────────────────────────────────────────────
  // Attempt to query a table that should be RLS-protected without a session.
  // We expect either an error (RLS enforced) or empty rows (RLS filtering all).
  results.push(await runCheck('rls_protected_query', async () => {
    if (!anonClient) throw new Error('anon client not initialised (client_init failed)');
    // user_memberships should only expose rows belonging to the authenticated user.
    const { data, error } = await anonClient
      .from('user_memberships')
      .select('id')
      .limit(10);

    if (error) {
      // RLS error — this is the expected "pass" outcome
      return {
        rls_enforced: true,
        rows_returned: 0,
        error_message: error.message,
        note: 'RLS blocked query — correct behaviour',
      };
    }
    // If data returned with rows, RLS may be off or permissive
    if (data && data.length > 0) {
      return {
        rls_enforced: false,
        rows_returned: data.length,
        note: 'WARNING: rows returned without session — RLS may be disabled or permissive',
      };
    }
    // Empty result — RLS filtering silently (also acceptable)
    return {
      rls_enforced: true,
      rows_returned: 0,
      note: 'No rows returned without session — RLS filtering correctly',
    };
  }));

  // all_pass = true when no hard failures (warns are acceptable)
  const allPass = results.every(r => r.status === 'pass' || r.status === 'warn');
  res.json({ all_pass: allPass, ran_at: new Date().toISOString(), checks: results });
});

module.exports = router;
