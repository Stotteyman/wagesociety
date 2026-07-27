/**
 * The canonical public address of W.A.G.E. Society.
 *
 * Anything a creator SHARES must be built from this, never from
 * `window.location.origin` — otherwise a referral link copied while on
 * localhost or a Netlify preview deploy hands out a URL nobody else can open,
 * and the referral silently never lands.
 *
 * OAuth `redirectTo` values are the opposite case and must keep using
 * `window.location.origin`: they have to return to the environment the user is
 * actually signing in from.
 */
export const SITE_URL = 'https://wagesociety.com';

/** A creator's shareable referral link. Always on the public domain. */
export const referralUrl = (code: string) => `${SITE_URL}/?ref=${code}`;

/** A creator's public profile link. Always on the public domain. */
export const profileUrl = (username: string) => `${SITE_URL}/creators/${username}`;
