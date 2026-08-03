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

/**
 * A member's shareable referral link.
 *
 * Leads with the handle — /join/stotteyman rather than /?ref=WAGE-6SSSQB — because a
 * link gets read aloud, typed from a screenshot and pasted into a bio, and a random
 * code survives none of those. It also says who is inviting before the page loads.
 *
 * Falls back to the code for an account that somehow has no handle. ws_apply_referral
 * accepts either, so every link already handed out keeps working.
 */
export const referralUrl = (handleOrCode: string, code?: string) =>
  handleOrCode
    ? `${SITE_URL}/join/${handleOrCode}`
    : `${SITE_URL}/?ref=${code ?? ''}`;

/** A creator's public profile link. Always on the public domain. */
export const profileUrl = (username: string) => `${SITE_URL}/creators/${username}`;
