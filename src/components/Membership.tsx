import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { tierRank, planPrice } from '../lib/plans';
import type { Plan } from '../lib/plans';

/**
 * Plan switcher for the settings page.
 *
 * Direction matters: someone already on the top plan is not "upgrading" to a
 * cheaper one, so the action is labelled from where they actually stand.
 */
export default function Membership({ currentTier }: { currentTier: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('wagesociety_plans').select('*').order('sort_order')
      .then(({ data }) => setPlans(((data as Plan[]) ?? []).filter((p) => p.price_cents > 0)));
  }, []);

  const currentRank = tierRank(currentTier);

  async function choose(planSlug: string) {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Membership</h2>
        <div className="flex gap-1 border border-wage-line p-1 text-xs">
          {(['monthly', 'annual'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={`px-2.5 py-1 font-mono uppercase tracking-[0.1em] transition-colors ${
                cycle === c ? 'bg-wage-amber text-wage-ink' : 'text-wage-muted hover:text-wage-paper'
              }`}
            >
              {c === 'monthly' ? 'Monthly' : 'Annual'}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-1 text-sm text-wage-muted">
        Current plan: <b className="text-wage-paper">{currentTier.toUpperCase()}</b>
        {cycle === 'annual' && <span className="ml-2 text-wage-amber-2">Annual saves two months</span>}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {plans.map((p) => {
          const rank = tierRank(p.slug);
          const isCurrent = p.slug === currentTier;
          const isDowngrade = rank >= 0 && currentRank >= 0 && rank < currentRank;

          return (
            <div
              key={p.slug}
              className={`wage-card wage-card-sm p-4 ${isCurrent ? '!border-wage-amber' : ''}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{p.name}</span>
                {isCurrent && <span className="wage-chip border-wage-amber/60 text-wage-amber-2">current</span>}
              </div>
              <div className="wage-num mt-1 text-[15px] text-wage-amber-2">
                {planPrice(p, cycle)}
                <span className="text-wage-muted-2">/{cycle === 'annual' ? 'yr' : 'mo'}</span>
              </div>

              <button
                className={`mt-3 w-full !py-1.5 text-sm wage-btn ${
                  isDowngrade ? 'wage-btn-ghost' : 'wage-btn-primary'
                }`}
                disabled={isCurrent || busySlug === p.slug}
                onClick={() => choose(p.slug)}
              >
                {isCurrent
                  ? 'Current plan'
                  : busySlug === p.slug
                    ? 'Redirecting...'
                    : `${isDowngrade ? 'Downgrade' : 'Upgrade'} to ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>

      {error && (
        <p role="status" className="mt-3 border border-wage-error/40 bg-wage-error/[0.08] px-4 py-2.5 text-sm text-wage-error">
          {error}
        </p>
      )}
    </div>
  );
}
