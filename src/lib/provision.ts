import { supabase } from './supabase';
import { apiFetch } from './api';
import { joinOfficialServer } from './discord';

export type Provision = {
  linked: boolean;
  imported?: boolean;
  tier?: string;
  role?: string;
  trial_ends_at?: string;
  is_new_grant?: boolean;
  /** Whether we got them into the Discord server on this pass. */
  joined?: boolean;
  joinProblem?: string;
};

// Mirrors wagesociety.membership_plans.price_cents. This is shown to someone on a trial
// as what they will be charged, so a stale number here is a misquoted price — keep it in
// step with the table (and with TIER_AMOUNTS in netlify/functions/_stripe-config.js).
const PRICE: Record<string, string> = {
  creator: '$9.99/mo',
  pro: '$24.99/mo',
  elite: '$49.99/mo',
  unlimited: '$99.99/mo',
};

// Run once after login: apply a captured referral, provision tier/trial from the
// Discord import, then sync the Discord role. Returns welcome info if granted.
export async function runProvisioning(): Promise<Provision | null> {
  const ref = localStorage.getItem('wage_ref');
  if (ref) {
    try { await supabase.rpc('ws_apply_referral', { p_code: ref }); } catch { /* ignore */ }
    localStorage.removeItem('wage_ref');
  }
  // Kick arrives as a Supabase identity now, so it needs the same sync into the
  // app tables that Discord gets. It is a no-op when Kick was never linked.
  try { await supabase.rpc('ws_link_kick'); } catch { /* ignore */ }

  const { data, error } = await supabase.rpc('ws_link_discord');
  if (error) return null;
  const p = data as Provision;
  if (!p?.linked) return p;

  // Order matters and is not interchangeable: Discord refuses a role write for someone
  // who is not a member of the guild yet. Syncing before joining left brand-new members
  // in the server with no roles at all — and with the server locked down, no roles means
  // no visible channels. Join first, then sync.
  const join = await joinOfficialServer();
  p.joined = join.ok;
  if (!join.ok) p.joinProblem = join.detail;

  await apiFetch('discord-sync', { method: 'POST' }).catch(() => {});
  return p;
}

export function priceFor(tier?: string): string {
  return (tier && PRICE[tier]) || '';
}

// Capture ?ref=WAGE-XXXX into localStorage for later application at signup.
export function captureRef() {
  const ref = new URLSearchParams(window.location.search).get('ref');
  if (ref && /^WAGE-/i.test(ref)) localStorage.setItem('wage_ref', ref.toUpperCase());
}
