// lib/referral-codes.js — Referral code generation + tier calculation.
// Owns: generateReferralCode, calculateReferralTier.
// Does NOT own: DB writes, point transaction logic.
const { pool } = require('../db/index');

/** Generate a unique WAGE-XXXXXX code (6 alphanumeric chars after prefix). */
function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'WAGE-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a unique referral code, retrying on collision (max 5 attempts).
 * Returns null if all attempts fail (DB integrity issue).
 */
async function generateUniqueReferralCode() {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const code = generateReferralCode();
    try {
      const result = await pool.query(
        `SELECT 1 FROM auth_users WHERE referral_code = $1`,
        [code]
      );
      if (result.rows.length === 0) {
        return code;
      }
    } catch (err) {
      console.error('[referral-codes] DB error during code uniqueness check:', err);
      // On DB error, return the code anyway — let the caller handle the INSERT failure
      return code;
    }
  }
  return null;
}

/** Calculate referral tier based on total referrals count. */
function calculateReferralTier(totalReferrals) {
  if (totalReferrals >= 250) return 'diamond';
  if (totalReferrals >= 50)  return 'gold';
  if (totalReferrals >= 10)  return 'silver';
  return 'bronze';
}

module.exports = {
  generateReferralCode,
  generateUniqueReferralCode,
  calculateReferralTier,
};