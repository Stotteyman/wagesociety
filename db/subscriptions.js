// db/subscriptions.js — Newsletter subscription queries.
const { pool } = require('./index');

async function subscribe(data) {
  const { email, live_alerts, newsletter, product_updates, community_updates, source } = data;
  const result = await pool.query(
    `INSERT INTO newsletter_subscriptions (email, live_alerts, newsletter, product_updates, community_updates, source)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (email) DO UPDATE SET
       live_alerts=$2, newsletter=$3, product_updates=$4, community_updates=$5, source=$6
     RETURNING *`,
    [email, live_alerts, newsletter, product_updates, community_updates, source]
  );
  return result.rows[0];
}

module.exports = { subscribe };