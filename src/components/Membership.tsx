import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';

type Plan = { slug: string; name: string; display_price: string | null; price_cents: number; annual_price_cents: number | null };

export default function Membership({ currentTier }: { currentTier: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('wagesociety_plans').select('*').order('sort_order')
      .then(({ data }) => setPlans(((data as Plan[]) ?? []).filter((p) => p.price_cents > 0)));
  }, []);

  async function upgrade(planSlug: string) {
    setBusySlug(planSlug); setError(null);
    try {
      const { redirectUrl } = await apiFetch<{ redirectUrl: string }>('checkout', {
        method: 'POST',
        body: JSON.stringify({ planSlug, cycle }),
      });
      window.location.href = redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
      setBusySlug(null);
    }
  }

  return (
    <div className="wage-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Membership</h2>
        <div className="flex gap-1 rounded-lg border border-wage-border p-1 text-xs">
          <button className={`rounded px-2 py-1 ${cycle === 'monthly' ? 'bg-white/10' : ''}`} onClick={() => setCycle('monthly')}>Monthly</button>
          <button className={`rounded px-2 py-1 ${cycle === 'annual' ? 'bg-white/10' : ''}`} onClick={() => setCycle('annual')}>Annual</button>
        </div>
      </div>
      <p className="mt-1 text-sm text-neutral-400">Current plan: <b>{currentTier.toUpperCase()}</b></p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {plans.map((p) => {
          const isCurrent = p.slug === currentTier;
          const cents = cycle === 'annual' ? p.annual_price_cents ?? p.price_cents * 12 : p.price_cents;
          return (
            <div key={p.slug} className="rounded-xl border border-wage-border p-4">
              <div className="font-semibold">{p.name}</div>
              <div className="text-sm text-neutral-400">${(cents / 100).toFixed(0)}/{cycle === 'annual' ? 'yr' : 'mo'}</div>
              <button
                className="wage-btn wage-btn-primary mt-3 w-full !py-1.5 text-sm"
                disabled={isCurrent || busySlug === p.slug}
                onClick={() => upgrade(p.slug)}
              >
                {isCurrent ? 'Current plan' : busySlug === p.slug ? 'Redirecting...' : `Upgrade to ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
