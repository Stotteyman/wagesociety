// scripts/backfill-referral-codes.js — One-time backfill for existing users.
// Run via: node scripts/backfill-referral-codes.js
// Idempotent: skips users who already have a referral_code.
'use strict';

require('../server'); // loads DB pool via migrate.js / db/index

async function main() {
  const { pool } = require('../db/index');
  const { generateUniqueReferralCode, calculateReferralTier } = require('../lib/referral-codes');

  console.log('[backfill-referral-codes] Starting backfill...');

  const result = await pool.query(
    `SELECT id, email FROM auth_users WHERE referral_code IS NULL`
  );

  let updated = 0;
  let failed = 0;

  for (const user of result.rows) {
    const code = await generateUniqueReferralCode();
    if (!code) {
      console.error(`[backfill] FAILED for user ${user.id} (${user.email}) — all 5 attempts collided`);
      failed++;
      continue;
    }
    await pool.query(
      `UPDATE auth_users SET referral_code = $1 WHERE id = $2`,
      [code, user.id]
    );
    console.log(`[backfill] ${user.email} → ${code}`);
    updated++;
  }

  console.log(`\n[backfill-referral-codes] Done. Updated: ${updated} | Failed: ${failed}`);

  // Also seed some sample shop items (only if none exist)
  const shopCheck = await pool.query(`SELECT 1 FROM shop_items LIMIT 1`);
  if (shopCheck.rows.length === 0) {
    console.log('[backfill] Seeding default shop items...');
    await pool.query(`
      INSERT INTO shop_items (name, description, point_cost, item_type, metadata, sort_order) VALUES
        ('WAGE Supporter Badge', 'Display a Supporter badge on your profile', 50, 'badge', '{"image_url": "/images/badges/supporter.svg"}', 1),
        ('30 Bonus Days', 'Extend your membership by 30 days', 200, 'membership_days', '{"days": 30}', 2),
        ('Profile Glow Frame', 'Golden glow frame around your avatar', 150, 'profile_frame', '{"color": "#ffd700", "style": "glow"}', 3),
        ('Custom Username Color', 'Choose your own username display color', 100, 'username_color', '{"allowed_colors": ["#ff6600","#00ff88","#ff00ff","#00ffff"]}', 4),
        ('Early Access Pass', 'Early access to new platform features', 75, 'vip_access', '{}', 5)
    `);
    console.log('[backfill] Shop items seeded.');
  }

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('[backfill-referral-codes] Fatal error:', err);
  process.exit(1);
});