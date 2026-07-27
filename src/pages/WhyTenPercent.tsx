import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import {
  PLATFORM_FEE_PERCENT, STRIPE_PERCENT, STRIPE_FIXED_CENTS,
  platformFeeCents, creatorNetCents, stripeFeeCents, platformNetCents, money,
} from '../lib/platform';

/**
 * The rate, explained with the actual arithmetic rather than a promise.
 * Every number on this page is computed from src/lib/platform.ts, which mirrors
 * the constants the checkout charges from — so the page cannot quietly drift
 * away from what a creator is really billed.
 */

const PRESETS = [500, 1000, 2500, 5000, 10000];

/** Below this, our fee does not even cover Stripe's. Derived, not guessed. */
const BREAK_EVEN_CENTS = Math.ceil(
  STRIPE_FIXED_CENTS / ((PLATFORM_FEE_PERCENT - STRIPE_PERCENT) / 100),
);

// Published standard rates. Deliberately the headline number each platform
// states publicly, not a negotiated deal, and each applies to a different
// product — which is exactly why the caveat sits under the chart.
const COMPARISON: { name: string; keeps: number; label: string; note: string; us?: boolean }[] = [
  { name: 'W.A.G.E. Society', keeps: 10, label: '10%', note: 'all sales', us: true },
  { name: 'Gumroad', keeps: 10, label: '10%', note: 'digital products' },
  { name: 'Patreon', keeps: 12, label: '8-12%', note: 'by plan' },
  { name: 'OnlyFans', keeps: 20, label: '20%', note: 'subs and tips' },
  { name: 'YouTube', keeps: 45, label: '45%', note: 'ad revenue' },
  { name: 'Twitch', keeps: 50, label: '50%', note: 'sub split' },
];

const SPEND: { title: string; body: string }[] = [
  {
    title: 'Card processing',
    body: `Stripe charges ${STRIPE_PERCENT}% plus ${money(STRIPE_FIXED_CENTS)} on every single transaction. That comes out of our ${PLATFORM_FEE_PERCENT}%, never out of yours.`,
  },
  {
    title: 'Payouts and compliance',
    body: 'Stripe Connect accounts, identity verification, and the 1099 that gets issued in your name because the money is legally yours, not ours.',
  },
  {
    title: 'Hosting and delivery',
    body: 'The site, the database, the gated video player, and the storage behind your profile, covers, and uploads.',
  },
  {
    title: 'The Discord machinery',
    body: 'The bot that syncs your paying members to their roles automatically, and keeps them in sync when someone upgrades, downgrades, or lapses.',
  },
  {
    title: 'Support and moderation',
    body: 'Actual people answering when a payment fails, a role does not land, or someone needs removing.',
  },
  {
    title: 'Building the next thing',
    body: 'Everything on the roadmap is funded by this and nothing else. No investors to repay, no ad business to serve.',
  },
];

const NEVER: string[] = [
  'A cut of anything you earn off this platform',
  'A cut of your sponsorships or brand deals',
  'Ad revenue, because there are no ads',
  'Exclusivity — stream and sell wherever you want',
  'A fee for having a profile, a storefront, or a payout',
];

export default function WhyTenPercent() {
  const [price, setPrice] = useState(1000);

  const fee = platformFeeCents(price);
  const creator = creatorNetCents(price);
  const stripe = stripeFeeCents(price);
  const net = platformNetCents(price);

  const creatorPct = (creator / price) * 100;
  const feePct = (fee / price) * 100;
  // Within our 10%: how much Stripe takes, capped so a loss still renders sanely.
  const stripeShareOfFee = Math.min(100, (stripe / fee) * 100);
  const losing = net < 0;

  return (
    <section className="mx-auto max-w-4xl px-5 py-14">
      <PageHeader
        eyebrow="Economics"
        title="Why we take 10%"
        lede="The whole rate, the arithmetic behind it, and what it pays for. No asterisks."
      />

      {/* ── the split ─────────────────────────────────────────────────────── */}
      <div className="wage-card mt-10 p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="wage-eyebrow">Your dollar</div>
            <h2 className="wage-cut mt-2 text-[26px]">Move the price. Watch the split.</h2>
          </div>
          <div className="text-right">
            <div className="wage-num text-[34px] leading-none text-wage-amber-2">{money(price)}</div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-wage-muted-2">
              what the fan pays
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPrice(p)}
              className={`wage-chip transition-colors ${
                price === p ? '!border-wage-amber !bg-wage-amber !text-wage-ink' : 'hover:border-wage-line-hi'
              }`}
            >
              {money(p)}
            </button>
          ))}
        </div>

        <label className="mt-5 block">
          <span className="sr-only">Price</span>
          <input
            type="range"
            min={100}
            max={20000}
            step={100}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="w-full accent-[color:var(--wage-amber)]"
          />
        </label>

        {/* Stacked bar: creator first, because that is the point. */}
        <div
          role="img"
          aria-label={`Of ${money(price)}, the creator receives ${money(creator)} and W.A.G.E. takes ${money(fee)}.`}
          className="mt-6 flex h-16 w-full overflow-hidden border border-wage-line"
          style={{ clipPath: 'polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px)' }}
        >
          <div className="flex items-center bg-wage-amber pl-4" style={{ width: `${creatorPct}%` }}>
            <span className="wage-num text-[15px] text-wage-ink">{money(creator)}</span>
          </div>
          <div
            className="flex items-center justify-center bg-wage-red"
            style={{ width: `${feePct}%` }}
          >
            <span className="wage-num text-[13px] text-wage-paper">{money(fee)}</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.14em]">
          <span className="flex items-center gap-2">
            <i aria-hidden="true" className="inline-block h-2.5 w-2.5 bg-wage-amber" />
            <span className="text-wage-paper">You keep 90%</span>
          </span>
          <span className="flex items-center gap-2">
            <i aria-hidden="true" className="inline-block h-2.5 w-2.5 bg-wage-red" />
            <span className="text-wage-muted">W.A.G.E. {PLATFORM_FEE_PERCENT}%</span>
          </span>
        </div>

        <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-wage-muted">
          Ninety percent is what actually lands in your Stripe account — not ninety percent
          minus processing, minus a payout fee, minus a currency spread. The money is paid to
          you directly and it is your name on the 1099.
        </p>
      </div>

      {/* ── inside the 10% ────────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-6 md:grid-cols-[1.1fr_1fr]">
        <div className="wage-card p-6 sm:p-8">
          <div className="wage-eyebrow">Inside our cut</div>
          <h2 className="wage-cut mt-2 text-[24px]">Most of it is not profit</h2>

          <div
            role="img"
            aria-label={`Of the ${money(fee)} fee, Stripe takes ${money(stripe)} and W.A.G.E. keeps ${money(net)}.`}
            className="mt-6 flex h-11 w-full overflow-hidden border border-wage-line"
            style={{ clipPath: 'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)' }}
          >
            <div className="bg-wage-chrome" style={{ width: `${stripeShareOfFee}%` }} />
            <div className="bg-wage-amber" style={{ width: `${100 - stripeShareOfFee}%` }} />
          </div>

          <dl className="mt-5 grid gap-2.5 text-[14px]">
            <div className="flex items-center justify-between gap-4 border-b border-wage-line pb-2.5">
              <dt className="flex items-center gap-2 text-wage-muted">
                <i aria-hidden="true" className="inline-block h-2.5 w-2.5 bg-wage-chrome" />
                Stripe takes
              </dt>
              <dd className="wage-num">{money(stripe)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-2 text-wage-muted">
                <i aria-hidden="true" className="inline-block h-2.5 w-2.5 bg-wage-amber" />
                We keep
              </dt>
              <dd className={`wage-num ${losing ? 'text-wage-error' : 'text-wage-amber-2'}`}>{money(net)}</dd>
            </div>
          </dl>

          <p className="mt-5 text-[14.5px] leading-relaxed text-wage-muted">
            {losing ? (
              <>
                At {money(price)} we are <strong className="text-wage-error">losing {money(-net)}</strong> on this
                sale. Stripe's flat {money(STRIPE_FIXED_CENTS)} per transaction is bigger than our whole fee.
                We run it anyway, because a creator selling something small should not be told no.
              </>
            ) : (
              <>
                Every sale carries Stripe's {STRIPE_PERCENT}% plus a flat {money(STRIPE_FIXED_CENTS)}. Below{' '}
                <strong className="text-wage-paper">{money(BREAK_EVEN_CENTS)}</strong> that flat fee is larger than
                our entire cut and the sale costs us money.
              </>
            )}
          </p>
        </div>

        <div className="wage-card flex flex-col justify-center p-6 sm:p-8">
          <div className="wage-eyebrow">The short version</div>
          <p className="mt-3 text-[17px] leading-relaxed">
            We only make money when you do. There is no listing fee, no monthly platform charge,
            and no minimum. If you sell nothing, we take nothing.
          </p>
          <p className="mt-4 text-[14.5px] leading-relaxed text-wage-muted">
            That is a deliberate constraint. It means the only way for us to grow is to make you
            sell more — not to squeeze a bigger slice, and not to sell your audience to someone else.
          </p>
        </div>
      </div>

      {/* ── comparison ────────────────────────────────────────────────────── */}
      <div className="wage-card mt-6 p-6 sm:p-8">
        <div className="wage-eyebrow">For scale</div>
        <h2 className="wage-cut mt-2 text-[24px]">What everyone else keeps</h2>

        <div className="mt-7 grid gap-3.5">
          {COMPARISON.map((c) => (
            <div key={c.name} className="grid grid-cols-[minmax(90px,140px)_1fr] items-center gap-4">
              <div className="text-right">
                <div className={`text-[14px] font-semibold ${c.us ? 'text-wage-amber-2' : ''}`}>{c.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-wage-muted-2">{c.note}</div>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className={`h-7 ${c.us ? 'bg-wage-amber' : 'bg-wage-line-hi'}`}
                  style={{ width: `${(c.keeps / 50) * 100}%`, minWidth: 4 }}
                />
                <span className={`wage-num text-[13px] ${c.us ? 'text-wage-amber-2' : 'text-wage-muted'}`}>
                  {c.label}
                </span>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 max-w-[70ch] text-[13px] leading-relaxed text-wage-muted-2">
          Published standard rates, and not a like-for-like comparison — each one applies to a
          different product, and large creators frequently negotiate terms that are not public.
          Shown to give the 10% a sense of scale, not to claim every platform is interchangeable.
        </p>
      </div>

      {/* ── what it pays for ──────────────────────────────────────────────── */}
      <div className="mt-14">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="wage-chevron" />
          <span className="wage-eyebrow">Where it goes</span>
        </div>
        <h2 className="wage-cut mt-3 text-[clamp(24px,3vw,32px)]">What the 10% actually buys</h2>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SPEND.map((s) => (
            <div key={s.title} className="wage-card wage-card-sm p-5">
              <div className="text-[15px] font-bold">{s.title}</div>
              <p className="mt-2 text-[14px] leading-relaxed text-wage-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── what we never take ────────────────────────────────────────────── */}
      <div className="wage-card mt-12 p-6 sm:p-8">
        <div className="wage-eyebrow">Never</div>
        <h2 className="wage-cut mt-2 text-[24px]">What we do not touch</h2>
        <ul className="mt-5 grid gap-2.5">
          {NEVER.map((n) => (
            <li key={n} className="flex items-start gap-3 text-[15px]">
              <span aria-hidden="true" className="mt-[7px] inline-block h-2 w-2 shrink-0 bg-wage-red" />
              <span className="text-wage-muted">{n}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-14 text-center">
        <h2 className="wage-cut text-[clamp(22px,3vw,30px)]">Ten percent, and nothing hidden under it.</h2>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/login" className="wage-btn wage-btn-primary">Claim your handle — free</Link>
          <Link to="/faq" className="wage-btn wage-btn-ghost">Read the FAQ</Link>
        </div>
      </div>
    </section>
  );
}
