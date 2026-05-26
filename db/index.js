// db/index.js — Database pool singleton. All SQL goes through named functions in db/*.js.
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

module.exports = { pool };