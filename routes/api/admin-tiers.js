// routes/api/admin-tiers.js — Admin membership tier CRUD with Stripe sync.
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../../lib/middleware');
const {
  getAllTiers,
  getTierById,
  getAllSubscriberCounts,
  createTier,
  updateTier,
  deleteTier,
  toggleTierActive,
} = require('../../db/membership_tiers');
const { createSubscriptionLink } = require('../../lib/stripe-sync');

// GET /api/admin/tiers — list all tiers with subscriber counts
router.get('/', requireAdmin, async (_req, res) => {
  try {
    const [tiers, counts] = await Promise.all([
      getAllTiers(),
      getAllSubscriberCounts(),
    ]);
    const countMap = Object.fromEntries(counts.map(c => [c.id, parseInt(c.subscriber_count, 10)]));
    const tiersWithCounts = tiers.map(t => ({
      ...t,
      subscriber_count: countMap[t.id] || 0,
    }));
    res.json({ tiers: tiersWithCounts });
  } catch (err) {
    console.error('[admin/tiers] get all:', err);
    res.status(500).json({ error: 'Failed to load tiers' });
  }
});

// POST /api/admin/tiers — create tier, optionally sync to Stripe
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, slug, description, price_cents, features, sort_order, is_active } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'name and slug are required' });

    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug)) return res.status(400).json({ error: 'slug must be lowercase alphanumeric with hyphens' });

    const priceCents = parseInt(price_cents, 10) || 0;
    const featuresParsed = Array.isArray(features) ? features : [];

    let stripePriceId = null;
    let stripeProductId = null;
    let stripeLink = null;

    // Sync to Stripe if price > 0 (free tier has no Stripe price)
    if (priceCents > 0) {
      try {
        const result = await createSubscriptionLink(name, priceCents);
        stripePriceId = result.stripe_price_id || null;
        stripeProductId = result.stripe_product_id || null;
        stripeLink = result.url || null;
      } catch (syncErr) {
        console.warn('[admin/tiers] Stripe sync failed (tier still created):', syncErr.message);
        // Don't fail the creation — tier is created without Stripe link
      }
    }

    const tier = await createTier({
      name,
      slug,
      description: description || '',
      priceCents,
      features: featuresParsed,
      sortOrder: parseInt(sort_order, 10) || 0,
      stripePriceId,
      stripeProductId,
    });

    res.status(201).json({ ...tier, stripe_link: stripeLink });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A tier with this slug already exists' });
    }
    console.error('[admin/tiers] create:', err);
    res.status(500).json({ error: 'Failed to create tier' });
  }
});

// PUT /api/admin/tiers/:id — update tier
// When price changes, archive old Stripe price and create a new one.
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, description, price_cents, features, sort_order, is_active } = req.body;
    const existing = await getTierById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Tier not found' });

    const priceCents = price_cents !== undefined ? parseInt(price_cents, 10) : existing.price_cents;
    const featuresParsed = features !== undefined
      ? (Array.isArray(features) ? features : JSON.parse(features || '[]'))
      : existing.features;

    let stripePriceId = existing.stripe_price_id;
    let stripeProductId = existing.stripe_product_id;
    let stripeLink = null;

    // Sync to Stripe if price changed and tier has a price
    const priceChanged = priceCents !== existing.price_cents;
    if (priceCents > 0 && priceChanged) {
      try {
        const result = await createSubscriptionLink(name || existing.name, priceCents);
        stripePriceId = result.stripe_price_id || null;
        stripeProductId = result.stripe_product_id || null;
        stripeLink = result.url || null;
      } catch (syncErr) {
        console.warn('[admin/tiers] Stripe sync failed (tier still updated):', syncErr.message);
      }
    }

    const updated = await updateTier(req.params.id, {
      name,
      description,
      priceCents,
      features: featuresParsed,
      sortOrder: sort_order !== undefined ? parseInt(sort_order, 10) : undefined,
      isActive: is_active !== undefined ? Boolean(is_active) : undefined,
      stripePriceId,
      stripeProductId,
    });

    res.json({ ...updated, stripe_link: stripeLink });
  } catch (err) {
    console.error('[admin/tiers] update:', err);
    res.status(500).json({ error: 'Failed to update tier' });
  }
});

// POST /api/admin/tiers/:id/toggle — toggle active/inactive
router.post('/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const tier = await toggleTierActive(req.params.id);
    if (!tier) return res.status(404).json({ error: 'Tier not found' });
    res.json(tier);
  } catch (err) {
    console.error('[admin/tiers] toggle:', err);
    res.status(500).json({ error: 'Failed to toggle tier' });
  }
});

// DELETE /api/admin/tiers/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const deleted = await deleteTier(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Tier not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/tiers] delete:', err);
    res.status(500).json({ error: 'Failed to delete tier' });
  }
});

module.exports = router;