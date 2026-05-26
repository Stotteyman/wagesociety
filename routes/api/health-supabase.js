// routes/api/health-supabase.js — Supabase connectivity health check.
// Verifies both auth service (getSession) and DB (member_profiles select).
// Does NOT own session management or auth logic.
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

router.get('/', async (_req, res) => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  const env_present = {
    SUPABASE_URL: !!SUPABASE_URL,
    SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY,
    DATABASE_URL: !!process.env.DATABASE_URL,
  };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.json({
      supabase_auth: 'fail',
      supabase_db: 'fail',
      env_present,
      error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars',
    });
  }

  // Pass ws as transport — Node.js 20 has no native WebSocket
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { transport: ws } });

  let supabase_auth = 'fail';
  let supabase_db = 'fail';
  let error = null;

  // Check auth service
  try {
    const { error: authErr } = await supabase.auth.getSession();
    if (!authErr) {
      supabase_auth = 'ok';
    } else {
      error = `auth: ${authErr.message}`;
    }
  } catch (e) {
    error = `auth exception: ${e.message}`;
  }

  // Check DB via Supabase client (routes through Supabase PostgREST, not direct Neon)
  try {
    const { data, error: dbErr } = await supabase
      .from('member_profiles')
      .select('id')
      .limit(1);
    if (!dbErr) {
      supabase_db = 'ok';
    } else {
      error = (error ? error + '; ' : '') + `db: ${dbErr.message}`;
    }
  } catch (e) {
    error = (error ? error + '; ' : '') + `db exception: ${e.message}`;
  }

  res.json({ supabase_auth, supabase_db, env_present, error });
});

module.exports = router;
