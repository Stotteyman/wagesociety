/**
 * Platform economics for the browser.
 *
 * The authority for what is actually charged is netlify/functions/_platform.js —
 * that is the code Stripe obeys. This file exists because the browser cannot
 * import CommonJS from the functions directory, and it must stay in step with it.
 * If the rate changes, change it in both places.
 */
export const PLATFORM_FEE_PERCENT = 10;

/**
 * Stripe's standard US card rate. Approximate on purpose: the real figure moves
 * with card type, country, and currency conversion, so everything shown to a
 * creator is labelled as an estimate.
 */
export const STRIPE_PERCENT = 2.9;
export const STRIPE_FIXED_CENTS = 30;

export const platformFeeCents = (amountCents: number): number =>
  Math.round((amountCents * PLATFORM_FEE_PERCENT) / 100);

/** What the creator receives. Charges are destination charges, so this is exact. */
export const creatorNetCents = (amountCents: number): number =>
  amountCents - platformFeeCents(amountCents);

/**
 * Stripe's cut. It comes out of the platform's share, not the creator's: these
 * are destination charges with no on_behalf_of, so the platform is the merchant
 * of record and settles Stripe's fee from its own balance.
 */
export const stripeFeeCents = (amountCents: number): number =>
  Math.round((amountCents * STRIPE_PERCENT) / 100) + STRIPE_FIXED_CENTS;

/** What W.A.G.E. actually keeps once Stripe is paid. Can be negative on tiny sales. */
export const platformNetCents = (amountCents: number): number =>
  platformFeeCents(amountCents) - stripeFeeCents(amountCents);

export const money = (cents: number): string =>
  `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;
