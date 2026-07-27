// routes/api/wageworld-rewards.js - WageWorld reward token ledger bridge.
const express = require('express');
const router = express.Router();
const { pool } = require('../../db/index');
const { getUserByEmail, getUserById } = require('../../db/users');

const PICKUP_REWARD_AMOUNT = 25;
const VALID_PICKUP_IDS = new Set([
  'hub-token-01',
  'hub-token-02',
  'hub-token-03',
  'hub-token-04',
  'hub-token-05',
  'hub-token-06',
  'hub-token-07',
]);

async function getSessionUser(req) {
  if (req.session?.userId) return getUserById(req.session.userId);
  if (req.session?.userEmail) return getUserByEmail(req.session.userEmail);
  return null;
}

router.get('/balance', async (req, res) => {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return res.json({
        authenticated: false,
        tokenName: 'WAGE Tokens',
        tokenSymbol: 'WAGE',
        balance: 0,
      });
    }

    res.json({
      authenticated: true,
      tokenName: 'WAGE Tokens',
      tokenSymbol: 'WAGE',
      balance: Number(user.referral_points || 0),
    });
  } catch (err) {
    console.error('[/api/wageworld/rewards/balance]', err);
    res.status(500).json({ error: 'Failed to load WAGE token balance' });
  }
});

router.post('/claim', async (req, res) => {
  const pickupId = String(req.body?.pickupId || '').trim();
  if (!VALID_PICKUP_IDS.has(pickupId)) {
    return res.status(400).json({ error: 'Invalid WageWorld reward pickup' });
  }
  if (!req.session?.userId && !req.session?.userEmail) {
    return res.status(401).json({ error: 'Log in to bank WAGE tokens' });
  }

  let client;
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Log in to bank WAGE tokens' });

    client = await pool.connect();
    const description = `WageWorld token pickup: ${pickupId}`;
    await client.query('BEGIN');

    const alreadyClaimed = await client.query(
      `SELECT id FROM point_transactions
       WHERE user_id = $1 AND type = 'wageworld_pickup' AND description = $2
       LIMIT 1`,
      [user.id, description]
    );

    if (alreadyClaimed.rows.length) {
      await client.query('ROLLBACK');
      return res.json({
        success: true,
        alreadyClaimed: true,
        amount: 0,
        balance: Number(user.referral_points || 0),
        tokenSymbol: 'WAGE',
      });
    }

    const updated = await client.query(
      `UPDATE auth_users
       SET referral_points = referral_points + $1
       WHERE id = $2
       RETURNING referral_points`,
      [PICKUP_REWARD_AMOUNT, user.id]
    );

    await client.query(
      `INSERT INTO point_transactions (user_id, amount, type, description)
       VALUES ($1, $2, 'wageworld_pickup', $3)`,
      [user.id, PICKUP_REWARD_AMOUNT, description]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      alreadyClaimed: false,
      amount: PICKUP_REWARD_AMOUNT,
      balance: Number(updated.rows[0]?.referral_points || 0),
      tokenSymbol: 'WAGE',
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[/api/wageworld/rewards/claim]', err);
    res.status(500).json({ error: 'Failed to claim WAGE token reward' });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
