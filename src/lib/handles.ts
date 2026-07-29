import { supabase } from './supabase';

/**
 * Handle rules live in Postgres (`ws_username_status`) so signup, self-serve changes
 * and the admin override cannot drift apart. This module only translates the reason
 * codes it returns into something a person can act on.
 */

export const HANDLE_MIN = 5;
export const HANDLE_MAX = 30;

/** Cheap client-side shape check, to avoid a round trip on obvious rejects. */
export const HANDLE_PATTERN = /^[a-z0-9_]+$/;

export type HandleStatus = { ok: true; username: string } | { ok: false; reason: string };

const MESSAGES: Record<string, string> = {
  empty: 'Pick a handle.',
  too_short: `Handles need at least ${HANDLE_MIN} characters.`,
  too_long: `Handles can be at most ${HANDLE_MAX} characters.`,
  invalid_characters: 'Use lowercase letters, numbers and underscores only.',
  needs_a_letter: 'Include at least one letter.',
  reserved: 'That handle is reserved.',
  taken: 'That handle is already taken.',
  no_such_user: 'That account no longer exists.',
};

export function handleMessage(reason?: string): string {
  return (reason && MESSAGES[reason]) || 'That handle cannot be used.';
}

/** Normalise as the database will, so the field shows what would actually be saved. */
export function normaliseHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

/** Ask the database whether a handle is usable, for the given account. */
export async function checkHandle(username: string, forUser?: string): Promise<HandleStatus> {
  const { data, error } = await supabase.rpc('ws_username_status', {
    p_username: username,
    p_for_user: forUser ?? null,
  });
  if (error) return { ok: false, reason: 'unavailable' };
  return data as HandleStatus;
}
