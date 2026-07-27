// Kick is registered in Supabase as a custom OAuth provider, so it links exactly
// like Discord and Google: Supabase owns the client credentials, performs the
// exchange, and writes the result into auth.identities.
//
// This replaced a hand-rolled PKCE flow that sent redirect_uri=<site>/kick/callback.
// Kick rejected that with "invalid redirect uri", because the address registered
// on the Kick developer app is Supabase's callback, not ours:
//
//   https://<project>.supabase.co/auth/v1/callback
//
// Nothing here should ever send a redirect_uri of its own again.
import { supabase } from './supabase';

/** The provider identifier Supabase exposes custom providers under. */
export const KICK_PROVIDER = 'custom:kick';

/** Identities may report either form depending on when they were created. */
export function isKickIdentity(provider: string): boolean {
  return provider === KICK_PROVIDER || provider === 'kick';
}

/**
 * Send the user to Kick to link their channel.
 * Resolves to an error message, or null when the redirect is under way.
 */
export async function linkKick(): Promise<string | null> {
  const { error } = await supabase.auth.linkIdentity({
    // Supabase's typings only enumerate the built-in providers; custom ones are
    // valid at runtime and are resolved by name on the server.
    provider: KICK_PROVIDER as never,
    options: { redirectTo: `${window.location.origin}/settings?linked=kick` },
  });
  return error ? error.message : null;
}
