// Platform economics — one place, so the rate can never drift between the
// checkout that charges it, the payout that splits it, and the copy that states it.
//
// W.A.G.E. takes 10% of creator sales, and the creator receives exactly the
// other 90%.
//
// Stripe's processing fee comes out of OUR share, not theirs. These are
// destination charges (transfer_data[destination]) with no on_behalf_of, so the
// platform is the merchant of record and Stripe settles its fee against the
// platform balance; the connected account is transferred amount - application_fee.
// Adding on_behalf_of would flip that onto the creator and make the 90% a lie.
//
// The browser mirror of these numbers lives in src/lib/platform.ts.
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
