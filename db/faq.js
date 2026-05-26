// db/faq.js — FAQ entry queries.
const { pool } = require('./index');

async function getActiveFaqs() {
  const result = await pool.query(
    `SELECT question, answer FROM faq_entries
     WHERE is_active = true ORDER BY sort_order ASC`
  );
  return result.rows;
}

module.exports = { getActiveFaqs };