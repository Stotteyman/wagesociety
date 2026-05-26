// db/merch.js — Merch shop queries.
const { pool } = require('./index');

async function getActiveItems() {
  const result = await pool.query(
    'SELECT * FROM merch_items WHERE is_active = TRUE ORDER BY created_at ASC'
  );
  return result.rows;
}

module.exports = { getActiveItems };