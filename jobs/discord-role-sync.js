#!/usr/bin/env node
// jobs/discord-role-sync.js — 15-minute drift fix cron job.
// Guards: only runs when POLSIA_IN_PROCESS_CRONS_ENABLED === 'true'.
// Queries all users with Discord connected, compares expected vs actual roles,
// and fixes any drift. Syncs via syncRoles() from lib/discord-sync.js.
//
// Schedule: */15 * * * *  →  node jobs/discord-role-sync.js
// Nothing currently runs it — see docs/CRON_SCHEDULES.md for where the schedule lived
// and what a new host has to wire up.

'use strict';

const path = require('path');

// ── Gate: only run if in-process crons are enabled ───────────────────────────
if (process.env.POLSIA_IN_PROCESS_CRONS_ENABLED !== 'true') {
  console.log(JSON.stringify({ event: 'discord_role_sync_skip', reason: 'POLSIA_IN_PROCESS_CRONS_ENABLED != true' }));
  process.exit(0);
}

const { pool } = require('../db/index');
const { syncRoles } = require('../lib/discord-sync');

const GUILD_ID = process.env.DISCORD_GUILD_ID || '1160158300168527895';
const BATCH_SIZE = 50;
const DRY_RUN = process.env.DISCORD_SYNC_DRY_RUN === 'true';

async function run() {
  console.log(JSON.stringify({ event: 'discord_role_sync_job_start', guild_id: GUILD_ID, dry_run: DRY_RUN }));

  // Get all Discord-linked users who have been active in the last 30 days
  // (avoid syncing completely abandoned accounts)
  const usersRes = await pool.query(
    `SELECT dl.user_id, au.role
     FROM discord_links dl
     JOIN auth_users au ON au.id = dl.user_id
     WHERE dl.user_id IS NOT NULL
       AND dl.discord_id IS NOT NULL
       AND (au.last_seen_at IS NULL OR au.last_seen_at > NOW() - INTERVAL '30 days')
     ORDER BY COALESCE(dl.last_synced_at, '1970-01-01') ASC
     LIMIT 200`
  );

  const users = usersRes.rows;
  console.log(JSON.stringify({ event: 'discord_role_sync_users_to_check', count: users.length }));

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    try {
      // Compute expected role state for this user
      const expected = await _computeExpectedRoles(user.user_id);
      const actual = await _fetchActualRoles(user.user_id);

      // Skip if already in sync
      const mismatched = expected.difference(actual).size > 0;
      if (!mismatched) {
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(JSON.stringify({
          event: 'discord_role_sync_dry_run',
          user_id: user.user_id,
          expected: [...expected],
          actual: [...actual],
        }));
        skipped++;
        continue;
      }

      // Apply fix
      const result = await syncRoles(user.user_id);
      if (result.synced) {
        synced++;
        console.log(JSON.stringify({
          event: 'discord_role_sync_drift_fixed',
          user_id: user.user_id,
          staff_role: result.staff_role,
          tier: result.tier,
        }));
      } else {
        failed++;
        console.log(JSON.stringify({
          event: 'discord_role_sync_failed',
          user_id: user.user_id,
          reason: result.reason,
        }));
      }
    } catch (err) {
      failed++;
      console.log(JSON.stringify({
        event: 'discord_role_sync_error',
        user_id: user.user_id,
        error: err.message,
      }));
    }

    // Rate limit: process in batches, small delay between users
    if ((synced + failed) % BATCH_SIZE === 0 && synced + failed < users.length) {
      await sleep(500);
    }
  }

  console.log(JSON.stringify({
    event: 'discord_role_sync_job_complete',
    total: users.length,
    synced,
    skipped,
    failed,
  }));

  await pool.end().catch(() => {});
  process.exit(failed > 0 ? 1 : 0);
}

// Compute the set of role IDs a user should have based on current DB state.
async function _computeExpectedRoles(userId) {
  // Get staff role
  const userRes = await pool.query('SELECT role FROM auth_users WHERE id = $1', [userId]);
  const staffRole = (userRes.rows[0]?.role || 'member').toLowerCase();

  // Get subscription tier
  const emailRes = await pool.query('SELECT email FROM auth_users WHERE id = $1', [userId]);
  const email = emailRes.rows[0]?.email;
  let tier = 'free';
  if (email) {
    const memRes = await pool.query(
      `SELECT plan_slug FROM user_memberships
       WHERE email = $1 AND status IN ('active', 'trialing')
       ORDER BY (SELECT sort_order FROM membership_plans WHERE slug = user_memberships.plan_slug) DESC
       LIMIT 1`,
      [email]
    );
    if (memRes.rows[0]?.plan_slug) tier = memRes.rows[0].plan_slug.toLowerCase();
  }

  const expected = new Set();

  // Staff role
  const STAFF_ROLE_MAP = {
    superadmin: '1171230293210959872',
    admin: '1160653381543661609',
    moderator: '1171231031857258587',
    helper: '1509868681369227345',
    member: '1508994738207064184',
  };
  const staffId = STAFF_ROLE_MAP[staffRole] || STAFF_ROLE_MAP.member;
  expected.add(staffId);

  // Cumulative subscription tiers
  const TIER_CUMULATIVE = {
    member: ['1508994738207064184'],
    creator: ['1508994738207064184', '1508994738924027945'],
    pro: ['1508994738207064184', '1508994738924027945', '1508994740358484010'],
    elite: ['1508994738207064184', '1508994738924027945', '1508994740358484010'],
    unlimited: ['1508994738207064184', '1508994738924027945', '1508994740358484010'],
  };
  const subRoles = TIER_CUMULATIVE[tier] || TIER_CUMULATIVE.free;
  for (const rid of subRoles) expected.add(rid);

  return expected;
}

// Fetch the user's actual current Discord roles via the bot API.
async function _fetchActualRoles(userId) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return new Set();

  const linkRes = await pool.query(
    'SELECT discord_id FROM discord_links WHERE user_id = $1', [userId]
  );
  const discordId = linkRes.rows[0]?.discord_id;
  if (!discordId) return new Set();

  const https = require('https');
  const DISCORD_API = 'https://discord.com/api/v10';

  const res = await new Promise((resolve) => {
    const { hostname, pathname } = new URL(`${DISCORD_API}/guilds/${GUILD_ID}/members/${discordId}`);
    const req = https.request(
      { hostname, path: pathname, method: 'GET', headers: { Authorization: `Bot ${botToken}` } },
      (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve({ status: r.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: r.statusCode, body: null }); } }); }
    );
    req.on('error', () => resolve({ status: 0, body: null }));
    req.end();
  });

  if (res.status === 200 && Array.isArray(res.body?.roles)) {
    return new Set(res.body.roles);
  }
  return new Set();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

run().catch(err => {
  console.error(JSON.stringify({ event: 'discord_role_sync_job_crash', error: err.message }));
  process.exit(1);
});