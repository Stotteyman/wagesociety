// Kick OAuth 2.1 + PKCE (custom — Kick isn't a Supabase provider).
import { SITE_URL } from './site';

const AUTH_URL = 'https://id.kick.com/oauth/authorize';
const SCOPES = 'user:read channel:read';
const CLIENT_ID = import.meta.env.VITE_KICK_CLIENT_ID as string | undefined;
const REDIRECT_OVERRIDE = import.meta.env.VITE_KICK_REDIRECT_URI as string | undefined;

function b64url(bytes: Uint8Array): string {
  let s = ''; bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

export function kickConfigured(): boolean {
  return Boolean(CLIENT_ID);
}

/**
 * The redirect URI sent to Kick — and it must EXACTLY match one of the redirect
 * URIs registered on the Kick developer app, or Kick rejects the request with
 * "invalid redirect uri" before the user ever sees a consent screen.
 *
 * It deliberately does NOT use window.location.origin: on localhost that produces
 * `http://localhost:8888/kick/callback`, which is not registered, which is exactly
 * the failure this replaced. Defaults to the public domain; set
 * VITE_KICK_REDIRECT_URI to point somewhere else, but only after registering that
 * same value on the Kick app.
 *
 * The token exchange in KickCallback reuses this helper, so the authorize call and
 * the exchange can never drift apart — OAuth requires them to be identical.
 */
export function kickRedirectUri(): string {
  return REDIRECT_OVERRIDE || `${SITE_URL}/kick/callback`;
}

// Kick off the Kick OAuth consent flow.
export async function startKickLink(): Promise<void> {
  if (!CLIENT_ID) { alert('Kick is not configured yet.'); return; }
  const { verifier, challenge } = await pkce();
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem('kick_verifier', verifier);
  sessionStorage.setItem('kick_state', state);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: kickRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  window.location.href = `${AUTH_URL}?${params}`;
}
