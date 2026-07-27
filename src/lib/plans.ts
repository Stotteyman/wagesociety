/**
 * Tier vocabulary, shared so nothing has to re-derive it.
 *
 * The slugs are load-bearing: they map to Discord roles and to profiles.tier.
 * Renaming one breaks role sync for every existing member, so names and prices
 * change in the database while these stay put.
 */
export const TIER_ORDER = ['free', 'creator', 'pro', 'elite', 'unlimited'] as const;

export type Plan = {
  slug: string;
  name: string;
  display_price: string | null;
  price_cents: number;
  annual_price_cents: number | null;
  features?: string[] | null;
  sort_order?: number;
};

export type Addon = {
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  price_cents: number;
  billing: 'one_time' | 'monthly';
  category: string;
  sort_order: number;
};

/** Position in the ladder, or -1 for anything unrecognised. */
export const tierRank = (slug?: string): number =>
  TIER_ORDER.indexOf((slug || '') as (typeof TIER_ORDER)[number]);

/** Whole dollars when the price is whole, cents when it is not. */
export const price = (cents: number): string =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;

/** Annual falls back to ten months, matching what checkout.js charges. */
export const planPrice = (p: Plan, cycle: 'monthly' | 'annual'): string =>
  price(cycle === 'annual' ? (p.annual_price_cents ?? p.price_cents * 10) : p.price_cents);
