// routes/api/points-shop.js — Admin: point shop items CRUD.
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../../lib/middleware');
const {
  getAllShopItems,
  createShopItem,
  updateShopItem,
  deleteShopItem,
} = require('../../db/points-shop');

router.use(requireAdmin);

// GET /api/points-shop/items — all items (active + inactive)
router.get('/items', async (_req, res) => {
  try {
    const items = await getAllShopItems();
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load items' });
  }
});

// POST /api/points-shop/items
router.post('/items', async (req, res) => {
  try {
    const { name, description, point_cost, item_type, metadata, sort_order, is_active } = req.body;
    if (!name || point_cost == null || !item_type) {
      return res.status(400).json({ error: 'name, point_cost, and item_type are required' });
    }
    const item = await createShopItem({ name, description, point_cost, item_type, metadata, sort_order, is_active });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// PUT /api/points-shop/items/:id
router.put('/items/:id', async (req, res) => {
  try {
    const { name, description, point_cost, item_type, metadata, sort_order, is_active } = req.body;
    const item = await updateShopItem(req.params.id, { name, description, point_cost, item_type, metadata, sort_order, is_active });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE /api/points-shop/items/:id
router.delete('/items/:id', async (req, res) => {
  try {
    await deleteShopItem(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

module.exports = router;