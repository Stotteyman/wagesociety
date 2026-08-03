import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { useSession } from '../hooks/useSession';
import PageHeader from '../components/ui/PageHeader';
import ReturnNotice from '../components/ui/ReturnNotice';
import { price, planPrice } from '../lib/plans';
import type { Plan, Addon } from '../lib/plans';

/**
 * What membership actually buys, and everything that can be bought without one.
 *
 * The order of the page is the argument: free first, because the site is free;
 * then the ladder; then the add-ons, which need no subscription at all.
 */

const CATEGORY_LABEL: Record<string, string> = {
  build: 'Websites',
  community: 'Community and Discord',
  management: 'Management',
  coaching: 'Coaching and workshops',
  design: 'Design',
  production: 'Production',
  strategy: 'Strategy',
};

const CATEGORY_ORDER = ['build', 'community', 'management', 'coaching', 'design', 'production', 'strategy'];

/** What ws_svc_price_for answers with, per plan. */
type Quote = {
  ok: boolean;
  base_cents: number;
  discount_cents: number;
  amount_cents: number;
  free: boolean;
  reason: string;
  launch_at: string | null;
};

/** Say why it is cheaper. A silent discount reads as a pricing bug. */
const REASON_LABEL: Record<string, string> = {
  founder: 'Founder — included',
  launch_grace: 'Free until launch',
  included: 'Included with your OG membership',
  early_member: 'OG price — Creator credit applied',
};

export default function Plans() {
  const { session } = useSession();
  const nav = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What THIS member pays, per plan, straight from the same function checkout charges
  // from. Signed-out visitors see list prices; there is nobody to price for yet.
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  useEffect(() => {
    supabase.from('wagesociety_plans').select('*').order('sort_order')
      .then(({ data }) => setPlans((data as Plan[]) ?? []));
    supabase.from('wagesociety_addons').select('*').order('sort_order')
      .then(({ data }) => setAddons((data as Addon[]) ?? []));
  }, []);

  // Re-quoted when the cycle flips, because the discount is a whole Creator
  // membership and that is ten times larger on the annual plan.
  useEffect(() => {
    if (!session) { setQuotes({}); return; }
    supabase.rpc('ws_my_pricing', { p_cycle: cycle })
      .then(({ data }) => setQuotes((data as Record<string, Quote>) ?? {}));
  }, [session, cycle]);

  async function order(slug: string) {
    if (!session) { nav('/login'); return; }
    setBusy(slug); setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>('addon-checkout', {
        method: 'POST',
        body: JSON.stringify({ slug }),
      });
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start that order.');
      setBusy(null);
    }
  }

  async function subscribe(planSlug: string) {
    if (!session) { nav('/login'); return; }
    setBusy(planSlug); setError(null);
    try {
      const { redirectUrl } = await apiFetch<{ redirectUrl: string }>('checkout', {
        method: 'POST',
        body: JSON.stringify({ planSlug, cycle }),
      });
      // When the price is zero the function activates the plan outright and hands back
      // a dashboard URL rather than a Stripe one — no card, no $0 subscription.
      window.location.href = redirectUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.');
      setBusy(null);
    }
  }

  const byCategory = CATEGORY_ORDER
    .map((c) => [c, addons.filter((a) => a.category === c)] as const)
    .filter(([, list]) => list.length > 0);

  return (
    <section className="mx-auto max-w-6xl px-5 py-14">
      <PageHeader
        eyebrow="Membership"
        title="Take what you need"
        lede="The site is free, and it stays free. A subscription adds tools, classes, workshops and people you can call. Add-ons can be bought on their own — no subscription required."
      />

      <div className="mt-8">
        <ReturnNotice
          params={['ordered', 'order']}
          resolve={(p) => {
            const ordered = p.get('ordered');
            if (ordered) {
              const name = addons.find((a) => a.slug === ordered)?.name || 'Your add-on';
              return {
                tone: 'ok',
                title: `${name} ordered`,
                body: 'Payment received. We will be in touch by email to get started.',
              };
            }
            if (p.get('order') === 'cancelled') {
              return {
                tone: 'info',
                title: 'Order cancelled',
                body: 'You were not charged. Nothing has been ordered.',
              };
            }
            return null;
          }}
        />
      </div>

      {error && (
        <p role="status" className="border border-wage-error/40 bg-wage-error/[0.08] px-4 py-3 text-sm text-wage-error">
          {error}
        </p>
      )}

      {/* ── billing toggle ────────────────────────────────────────────────── */}
      <div className="mt-10 flex items-center gap-3">
        <div className="flex border border-wage-line p-1">
          {(['monthly', 'annual'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={`px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
                cycle === c ? 'bg-wage-amber text-wage-ink' : 'text-wage-muted hover:text-wage-paper'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        {cycle === 'annual' && (
          <span className="wage-chip border-wage-amber/60 text-wage-amber-2">two months free</span>
        )}
      </div>

      {/* ── tiers ─────────────────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          const free = p.price_cents === 0;
          const features = (p.features as string[] | null) ?? [];
          const q = quotes[p.slug];
          return (
            <div key={p.slug} className="wage-card flex flex-col p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[20px]">{p.name}</h2>
                {p.slug === 'creator' && <span className="wage-chip">most picked</span>}
              </div>

              <div className="mt-3 flex items-baseline gap-1.5">
                {/* A discounted price is shown with the list price struck through beside
                    it, so nobody has to wonder whether the number is a mistake. */}
                {q && q.amount_cents !== q.base_cents && (
                  <span className="wage-num text-[17px] leading-none text-wage-muted-2 line-through">
                    {planPrice(p, cycle)}
                  </span>
                )}
                <span className="wage-num text-[30px] leading-none text-wage-amber-2">
                  {free ? 'Free' : q ? (q.amount_cents === 0 ? 'Free' : price(q.amount_cents)) : planPrice(p, cycle)}
                </span>
                {!free && !(q && q.amount_cents === 0) && (
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-wage-muted-2">
                    /{cycle === 'annual' ? 'yr' : 'mo'}
                  </span>
                )}
              </div>
              {q && q.amount_cents !== q.base_cents && (
                <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-wage-success">
                  {REASON_LABEL[q.reason] ?? 'Your price'}
                </p>
              )}

              <ul className="mt-5 grid flex-1 gap-2.5">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[14px] leading-relaxed">
                    <span aria-hidden="true" className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 bg-wage-amber" />
                    <span className="text-wage-muted">{f}</span>
                  </li>
                ))}
              </ul>

              {free ? (
                <Link to="/login" className="wage-btn wage-btn-ghost mt-6 w-full">Claim your handle</Link>
              ) : (
                <button
                  onClick={() => subscribe(p.slug)}
                  disabled={busy === p.slug}
                  className="wage-btn wage-btn-primary mt-6 w-full"
                >
                  {busy === p.slug ? 'Redirecting...' : `Start ${p.name}`}
                </button>
              )}
              {!free && (
                <p className="mt-2 text-center font-mono text-[10.5px] uppercase tracking-[0.1em] text-wage-muted-2">
                  7 days free, cancel anytime
                </p>
              )}
            </div>
          );
        })}

        {/* Custom sits in the same grid so it reads as the end of the ladder. */}
        <div className="wage-card flex flex-col border-dashed p-6">
          <h2 className="font-display text-[20px]">Custom</h2>
          <div className="mt-3 wage-num text-[30px] leading-none text-wage-paper">Let's talk</div>
          <p className="mt-5 flex-1 text-[14px] leading-relaxed text-wage-muted">
            Bigger teams, agencies, and anyone whose needs do not fit a tier. Tell us what you are
            trying to build and we will put a number on it.
          </p>
          <a href="mailto:hello@wagesociety.com?subject=Custom%20plan" className="wage-btn wage-btn-ghost mt-6 w-full">
            Talk to us
          </a>
        </div>
      </div>

      {/* ── add-ons ───────────────────────────────────────────────────────── */}
      <div className="mt-20">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="wage-chevron" />
          <span className="wage-eyebrow">Add-ons</span>
        </div>
        <h2 className="wage-cut mt-3 text-[clamp(26px,3.5vw,38px)]">Buy any of it on its own</h2>
        <p className="mt-3 max-w-[64ch] text-[16px] leading-relaxed text-wage-muted">
          None of this needs a subscription. Order a website, a workshop seat, or an hour of
          someone's time whether you are on a plan or not. Members on Unlimited get 20% off.
        </p>

        {byCategory.map(([category, list]) => (
          <div key={category} className="mt-10">
            <div className="wage-eyebrow-mute font-mono text-[10.5px] uppercase tracking-[0.16em]">
              {CATEGORY_LABEL[category] ?? category}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((a) => (
                <div key={a.slug} className="wage-card wage-card-sm flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[15px] font-bold">{a.name}</h3>
                    {a.billing === 'monthly' && <span className="wage-chip">monthly</span>}
                  </div>
                  {a.tagline && (
                    <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-wage-amber-2">
                      {a.tagline}
                    </div>
                  )}
                  <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-wage-muted">{a.description}</p>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="wage-num text-[16px] text-wage-paper">
                      {price(a.price_cents)}
                      {a.billing === 'monthly' && (
                        <span className="text-[11px] text-wage-muted-2">/mo</span>
                      )}
                    </span>
                    <button
                      onClick={() => order(a.slug)}
                      disabled={busy === a.slug}
                      className="wage-btn wage-btn-ghost !px-4 !py-1.5 text-sm"
                    >
                      {busy === a.slug ? 'Opening...' : session ? 'Order' : 'Sign in to order'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-20 text-center">
        <h2 className="wage-cut text-[clamp(22px,3vw,30px)]">Still just 10% on anything you sell.</h2>
        <p className="mx-auto mt-3 max-w-[54ch] text-[15px] text-wage-muted">
          Plans and add-ons are what you buy from us. They do not change the cut we take on your
          own sales, which is 10% on every tier including free.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/why-10-percent" className="wage-btn wage-btn-primary">Why we take 10%</Link>
          <Link to="/faq" className="wage-btn wage-btn-ghost">Read the FAQ</Link>
        </div>
      </div>
    </section>
  );
}
