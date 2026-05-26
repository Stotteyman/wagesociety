// routes/api/shop.js — Merch items + membership plans (public + admin).
const express = require('express');
const router = express.Router();
const { pool } = require('../../db/index');

// GET /api/shop — public merch items + membership plans
router.get('/', async (_req, res) => {
  try {
    const [merchItems, plans] = await Promise.all([
      pool.query(`SELECT id, name, price, description, sort_order, is_active, created_at, updated_at
                  FROM merch_items WHERE is_active = true ORDER BY sort_order, created_at`),
      pool.query(`SELECT id, slug, name, display_price, price_cents, description, features, sort_order
                  FROM membership_plans WHERE is_active = true ORDER BY sort_order`),
    ]);
    res.json({ merchItems: merchItems.rows, membershipPlans: plans.rows });
  } catch (err) {
    console.error('[/api/shop GET]', err);
    res.status(500).json({ error: 'Failed to load shop data' });
  }
});

// POST /api/shop — create merch item (admin)
router.post('/', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });
    const { name, price, description, sort_order, is_active } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'name and price required' });
    const result = await pool.query(
      `INSERT INTO merch_items (name, price, description, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, price, description || '', sort_order || 0, is_active !== false]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[/api/shop POST]', err);
    res.status(500).json({ error: 'Failed to create merch item' });
  }
});

// PUT /api/shop/:id — update merch item (admin)
router.put('/:id', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });
    const { name, price, description, sort_order, is_active } = req.body;
    const result = await pool.query(
      `UPDATE merch_items SET name=COALESCE($1,name), price=COALESCE($2,price),
       description=COALESCE($3,description), sort_order=COALESCE($4,sort_order),
       is_active=COALESCE($5,is_active), updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [name, price, description, sort_order, is_active, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[/api/shop PUT]', err);
    res.status(500).json({ error: 'Failed to update merch item' });
  }
});

// DELETE /api/shop/:id — remove merch item (admin)
router.delete('/:id', async (req, res) => {
  try {
    const email = req.session?.userEmail;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });
    await pool.query('DELETE FROM merch_items WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[/api/shop DELETE]', err);
    res.status(500).json({ error: 'Failed to delete merch item' });
  }
});

module.exports = router;