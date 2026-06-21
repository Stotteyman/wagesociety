// db/index.js — Database pool singleton. All SQL goes through named functions in db/*.js.
const { Pool } = require('pg');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl || dbUrl === 'undefined' || dbUrl === '') {
  throw new Error('DATABASE_URL is not set. Ensure it is configured in Render Environment Variables or in .env');
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});

module.exports = { pool };