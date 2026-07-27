// Platform economics — one place, so the rate can never drift between the
// checkout that charges it, the payout that splits it, and the copy that states it.
//
// W.A.G.E. takes 10% of creator sales. Stripe's own processing fee is separate
// and comes out of the creator's side, which is how Connect destination charges
// work by default.
const PLATFORM_FEE_PERCENT = 10;

/** Application fee in cents for a sale, rounded to the nearest cent. */
function platformFeeCents(amountCents) {
  return Math.round((amountCents * PLATFORM_FEE_PERCENT) / 100);
}

/** What the creator actually receives before Stripe's processing fee. */
function creatorNetCents(amountCents) {
  return amountCents - platformFeeCents(amountCents);
}

module.exports = { PLATFORM_FEE_PERCENT, platformFeeCents, creatorNetCents };
