import { supabase } from './supabase';
import { apiFetch } from './api';

/**
 * Discord linking, including being added to the official server.
 *
 * `guilds.join` is what lets the bot add someone to the server on their behalf.
 * Supabase does not persist provider tokens, so the Discord access token is
 * captured from the session the moment we return from OAuth, used once, and
 * dropped.
 */
const TOKEN_KEY = 'discord_provider_token';

export const DISCORD_SCOPES = 'identify email guilds guilds.join';

export async function linkDiscord(returnTo = '/settings?linked=discord'): Promise<string | null> {
  const { error } = await supabase.auth.linkIdentity({
    provider: 'discord',
    options: { redirectTo: `${window.location.origin}${returnTo}`, scopes: DISCORD_SCOPES },
  });
  return error ? error.message : null;
}

export async function signInWithDiscord(returnTo = '/verify'): Promise<string | null> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: `${window.location.origin}${returnTo}`, scopes: DISCORD_SCOPES },
  });
  return error ? error.message : null;
}

/** Stash the Discord token if we've just come back from OAuth. */
export async function captureDiscordToken(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.provider_token;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
}

export type JoinResult =
  | { ok: true; joined: boolean; username?: string }
  | { ok: false; detail: string };

/** Add the signed-in user to the official server. Safe to call when already a member. */
export async function joinOfficialServer(): Promise<JoinResult> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    return { ok: false, detail: 'Connect Discord first — the permission to add you only arrives during sign-in.' };
  }
  try {
    const r = await apiFetch<{ ok: boolean; joined: boolean; username?: string }>('discord-join', {
      method: 'POST',
      body: JSON.stringify({ provider_token: token }),
    });
    return { ok: true, joined: r.joined, username: r.username };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'Could not reach Discord.' };
  }
}
