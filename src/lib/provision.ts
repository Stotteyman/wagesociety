import { supabase } from './supabase';
import { apiFetch } from './api';

export type Provision = {
  linked: boolean;
  imported?: boolean;
  tier?: string;
  role?: string;
  trial_ends_at?: string;
  is_new_grant?: boolean;
};

const PRICE: Record<string, string> = { creator: '$29/mo', pro: '$79/mo', elite: 'custom', unlimited: 'custom' };

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
  if (p?.linked) apiFetch('discord-sync', { method: 'POST' }).catch(() => {});
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
