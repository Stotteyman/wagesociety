// routes/api/admin-shop.js — Admin shop: merch items + URL import.
const express = require('express');
const router = express.Router();
const { pool } = require('../../db/index');
const { getMemberAccess } = require('../../db/orgAccess');

function requireAdmin(req, res, next) {
  const email = req.session?.userEmail;
  if (!email) return res.status(401).json({ error: 'Not authenticated' });
  getMemberAccess(email).then(access => {
    if (access.role === 'banned') return res.status(403).json({ error: 'Banned' });
    if (access.role === 'superadmin' || access.role === 'admin') return next();
    return res.status(403).json({ error: 'Admin access required' });
  }).catch(() => res.status(500).json({ error: 'Auth check failed' }));
}

// GET /api/admin/shop/items — all merch items
router.get('/items', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM merch_items ORDER BY sort_order, created_at`
    );
    res.json({ items: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load items' });
  }
});

// POST /api/admin/shop/import-url — import product from URL (basic scraping)
router.post('/import-url', requireAdmin, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url?.startsWith('http')) return res.status(400).json({ error: 'Valid URL required' });

    // Basic URL-based product info extraction
    // In production, this would use a headless browser or product API
    // For now, extract what we can from the URL path
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const hostname = urlObj.hostname.replace('www.', '');

    // Heuristic: last path segment often contains the product name/ID
    const lastSegment = pathParts[pathParts.length - 1] || '';
    const productName = lastSegment
      .replace(/[-_]/g, ' ')
      .replace(/\b(pro|buy|shop|store)\b/gi, '')
      .trim();

    // Extract price if in URL params (Amazon ASIN pages sometimes have ?price=)
    const priceParam = urlObj.searchParams.get('price');
    const price = priceParam ? `$${priceParam}` : null;

    // Detect brand from hostname
    const brandMap = {
      'amazon.com': 'Amazon', 'etsy.com': 'Etsy', 'shopify.com': 'Shopify',
      'ebay.com': 'eBay', 'walmart.com': 'Walmart',
    };
    const brand = brandMap[hostname] || hostname.split('.')[0].toUpperCase();

    res.json({
      product: {
        name: productName || 'Imported Product',
        price: price || 'Price varies',
        description: `Imported from ${brand} — ${urlObj.pathname}`,
        imageUrl: null,
        images: [],
        sourceUrl: url,
        brand,
        availability: null,
        currency: price ? 'USD' : null,
        rating: null,
        reviewCount: null,
        sku: null,
        confidence: 'low',
        signals: [`Source: ${hostname}`, 'Manual review recommended'],
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to import from URL' });
  }
});

// POST /api/admin/shop/items — create merch item
router.post('/items', requireAdmin, async (req, res) => {
  try {
    const { name, price, description, sort_order, is_active, image_url } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'name and price required' });
    const result = await pool.query(
      `INSERT INTO merch_items (name, price, description, sort_order, is_active, image_url)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, price, description || '', sort_order || 0, is_active !== false, image_url || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// PUT /api/admin/shop/items/:id — update merch item
router.put('/items/:id', requireAdmin, async (req, res) => {
  try {
    const { name, price, description, sort_order, is_active, image_url } = req.body;
    const result = await pool.query(
      `UPDATE merch_items SET
       name=COALESCE($1,name), price=COALESCE($2,price),
       description=COALESCE($3,description), sort_order=COALESCE($4,sort_order),
       is_active=COALESCE($5,is_active), image_url=COALESCE($6,image_url),
       updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [name, price, description, sort_order, is_active, image_url, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE /api/admin/shop/items/:id
router.delete('/items/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM merch_items WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Membership plans CRUD
router.get('/plans', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM membership_plans ORDER BY sort_order');
    res.json({ plans: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load plans' });
  }
});

router.post('/plans', requireAdmin, async (req, res) => {
  try {
    const { slug, name, display_price, price_cents, description, features, sort_order, is_active } = req.body;
    const result = await pool.query(
      `INSERT INTO membership_plans (slug, name, display_price, price_cents, description, features, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [slug, name, display_price, price_cents || 0, description || '', features || [], sort_order || 0, is_active !== false]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

router.put('/plans/:id', requireAdmin, async (req, res) => {
  try {
    const { name, display_price, price_cents, description, features, sort_order, is_active } = req.body;
    const result = await pool.query(
      `UPDATE membership_plans SET
       name=COALESCE($1,name), display_price=COALESCE($2,display_price),
       price_cents=COALESCE($3,price_cents), description=COALESCE($4,description),
       features=COALESCE($5,features), sort_order=COALESCE($6,sort_order),
       is_active=COALESCE($7,is_active), updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name, display_price, price_cents, description, features, sort_order, is_active, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

module.exports = router;