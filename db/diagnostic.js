// db/diagnostic.js — Queries for the Supabase diagnostic endpoint.
// Owns: direct Postgres counts for member_profiles, user_memberships; diagnostic_log write/delete.
// Does NOT own: Supabase client calls (those live in routes/api/test-supabase.js).
const { pool } = require('./index');

async function countMemberProfiles() {
  const { rows } = await pool.query('SELECT COUNT(*) AS count FROM member_profiles');
  return parseInt(rows[0].count, 10);
}

async function countUserMemberships() {
  const { rows } = await pool.query('SELECT COUNT(*) AS count FROM user_memberships');
  return parseInt(rows[0].count, 10);
}

// Insert a row into diagnostic_log and immediately delete it.
// Returns the inserted id to prove the round-trip.
async function writeAndRollbackDiagnosticLog() {
  const { rows } = await pool.query(
    `INSERT INTO diagnostic_log (ran_at, note) VALUES (now(), 'test-supabase diagnostic') RETURNING id`
  );
  const insertedId = rows[0].id;
  await pool.query('DELETE FROM diagnostic_log WHERE id = $1', [insertedId]);
  return insertedId;
}

module.exports = { countMemberProfiles, countUserMemberships, writeAndRollbackDiagnosticLog };
