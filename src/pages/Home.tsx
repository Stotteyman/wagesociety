import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, supabaseConfigured } from '../lib/supabase';
import WageHero from '../components/WageHero';
import Icon, { type IconName } from '../components/Icon';
import TierChip from '../components/ui/TierChip';
import Avatar from '../components/ui/Avatar';

type Creator = { username: string; display_name: string | null; avatar_url: string | null; bio: string | null; tier: string };
type Plan = { slug: string; name: string; display_price: string; features: string[]; sort_order: number };

const steps = [
  {
    title: 'Claim your handle',
    body: 'Pick your name, write your bio, link the platforms you already stream on. Public profile live in two minutes.',
  },
  {
    title: 'Set your price',
    body: 'Memberships, merch, tips, paid streams. You set the tiers, you keep the revenue, Stripe pays you direct.',
  },
  {
    title: 'Bring your people',
    body: 'Your referral link earns points and rank. Your Discord roles sync automatically. Your audience stays yours.',
  },
];

const features: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'earn',
    title: 'Monetize everything',
    body: 'Memberships, merch, tips, paid video — every revenue channel in one dashboard. We take 10%, you keep the rest.',
  },
  {
    icon: 'stream',
    title: 'Stream anywhere, land here',
    body: 'Connect Kick, YouTube or Twitch. Go live there, show up live on your WAGE profile and the network feed.',
  },
  {
    icon: 'network',
    title: 'A network, not a feed',
    body: 'Creator directory, referral rank, collab requests, and Discord roles that sync themselves. Built for your people.',
  },
  {
    icon: 'stats',
    title: 'Numbers you can act on',
    body: 'Who subscribed, what sold, which referral worked. Your data, plainly stated — no black box in the middle.',
  },
];

export default function Home() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [creators, setCreators] = useState<Creator[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    (async () => {
      await supabase.rpc('ws_heartbeat'); // presence: counts the viewer in "online now"
      const { data } = await supabase.from('wagesociety_home_stats').select('*').maybeSingle();
      setStats((data as Record<string, number>) || {});
    })();
    supabase.from('wagesociety_creators').select('username,display_name,avatar_url,bio,tier').limit(4)
      .then(({ data }) => setCreators((data as Creator[]) ?? []));
    supabase.from('wagesociety_plans').select('*').order('sort_order')
      .then(({ data }) => setPlans((data as Plan[]) ?? []));
  }, []);

  const creatorCount = stats.creators ?? 0;

  return (
    <>
      {/* —──— Hero —────────────────────────────────────────────────────────────────────────────────────────────────────────────────────— */}
      <section className="relative overflow-hidden px-5 pb-20 pt-16">
        <div
          aria-hidden="true"
          className="wage-portal-glow pointer-events-none absolute -right-20 top-[46%] h-[900px] w-[900px] -translate-y-1/2 rounded-full"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.02fr_0.98fr]">
          <div>
            <span className="wage-eyebrow">The creator operating system</span>
            <h1 className="wage-cut mt-4 text-[clamp(52px,8vw,110px)]">
              We all<br />gotta <span className="text-wage-amber-2">eat.</span>
            </h1>
            <p className="mt-6 max-w-[52ch] text-[19px] leading-relaxed text-[#C9C3D2]">
              Your profile, your streams, your memberships, your merch — one place you actually own.
              We take 10%, not 45%. No algorithm deciding who gets fed.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className="wage-btn wage-btn-primary">Claim your handle — free</Link>
              <Link to="/creators" className="wage-btn wage-btn-ghost">See who's building</Link>
            </div>
            {creatorCount > 0 && (
              <p className="mt-6 text-sm text-wage-muted">
                {creatorCount} {creatorCount === 1 ? 'creator is' : 'creators are'} already building here.
              </p>
            )}
          </div>

          <div className="w-full justify-self-end lg:max-w-[420px]">
            <div className="py-10">
              <WageHero />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <HudTile label="Creators" value={stats.creators ?? 0} />
              <HudTile label="Live now" value={stats.live_now ?? 0} tone={stats.live_now ? 'live' : 'idle'} />
              <HudTile label="Online" value={stats.online_now ?? 0} tone={stats.online_now ? 'live' : 'idle'} />
              <HudTile label="Products" value={stats.products ?? 0} />
            </div>
            <p className="mt-2.5 text-right font-mono text-[10.5px] tracking-[0.1em] text-wage-muted-2">
              Live from the network
            </p>
          </div>
        </div>
      </section>

      <hr className="h-px border-0 bg-gradient-to-r from-wage-line-hi to-transparent" />

      {/* —──— Manifesto —──────────────────────────────────────────────────────────────────────────────────────────────────────────— */}
      <section className="px-5 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-[900px] border-l-2 border-wage-amber pl-8">
            <span className="wage-eyebrow">The belief</span>
            <p className="mt-4 font-display text-[clamp(24px,3vw,38px)] normal-case leading-[1.18] tracking-[-0.015em]">
              The internet was supposed to set creators free. Instead it built cages with nice logos.
            </p>
            <p className="mt-6 max-w-[62ch] text-[18px] leading-relaxed text-[#B7B0C2]">
              Algorithms that decide who hears you. Terms that change overnight. Revenue splits that
              leave you with crumbs. WAGE Society runs on a different idea — creators deserve
              infrastructure built around them. One place to connect, stream, sell, and grow, with
              nobody taking your lunch.
            </p>
          </div>
        </div>
      </section>

      {/* —──— How it works —────────────────────────────────────────────────────────────────────────────────────────────────────— */}
      <section className="px-5 pb-20">
        <div className="mx-auto max-w-6xl">
          <span aria-hidden="true" className="wage-chevron mr-2.5 align-middle" /><span className="wage-eyebrow wage-eyebrow-mute">How it works</span>
          <h2 className="wage-cut mt-3 text-[clamp(30px,4vw,50px)]">Three steps to your own storefront</h2>
          <ol className="mt-9 grid border-t border-wage-line md:grid-cols-3">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className="relative border-wage-line px-7 pb-9 pt-8 md:border-r md:last:border-r-0"
              >
                <span aria-hidden="true" className="absolute left-0 top-[-1px] h-0.5 w-12 bg-wage-amber" />
                <span className="font-mono text-xs tracking-[0.2em] text-wage-amber-2">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3.5 font-body text-[19px] font-bold normal-case tracking-normal">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-wage-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* —──— Features —────────────────────────────────────────────────────────────────────────────────────────────────────────────— */}
      <section className="px-5 py-16">
        <div className="mx-auto max-w-6xl">
          <span aria-hidden="true" className="wage-chevron mr-2.5 align-middle" /><span className="wage-eyebrow wage-eyebrow-mute">What you get</span>
          <h2 className="wage-cut mt-3 text-[clamp(30px,4vw,50px)]">
            Built for creators.<br />Designed for freedom.
          </h2>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="wage-card wage-card-hover px-6 pb-7 pt-6">
                <Icon name={f.icon} size={34} className="mb-4 text-wage-amber-2" />
                <h3 className="font-body text-[17px] font-bold normal-case tracking-[-0.01em]">{f.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-wage-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* —──— Directory preview —──────────────────────────────────────────────────────────────────────────────────────────— */}
      {creators.length > 0 && (
        <section className="px-5 py-16">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-end justify-between gap-6">
              <div>
                <span aria-hidden="true" className="wage-chevron mr-2.5 align-middle" /><span className="wage-eyebrow wage-eyebrow-mute">The directory</span>
                <h2 className="wage-cut mt-3 text-[clamp(22px,2.4vw,32px)]">Creators building right now</h2>
              </div>
              <Link to="/creators" className="wage-btn wage-btn-ghost !px-3.5 !py-1.5 text-[13.5px]">
                Browse all{creatorCount ? ` ${creatorCount}` : ''}
              </Link>
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {creators.map((c) => (
                <Link
                  key={c.username}
                  to={`/creators/${c.username}`}
                  className="wage-card wage-card-hover flex flex-col gap-3.5 p-5"
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={c.display_name || c.username} src={c.avatar_url} />
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-bold">{c.display_name || c.username}</div>
                      <div className="truncate font-mono text-[12px] text-wage-muted-2">@{c.username}</div>
                    </div>
                  </div>
                  <p className="line-clamp-2 min-h-[42px] text-sm text-wage-muted">{c.bio || ''}</p>
                  <div className="flex items-center justify-between border-t border-wage-line pt-3">
                    <TierChip tier={c.tier} />
                    <span className="text-sm text-wage-muted">View profile</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* —──— Membership —────────────────────────────────────────────────────────────────────────────────────────────────────────— */}
      {plans.length > 0 && (
        <section id="pricing" className="px-5 py-20">
          <div className="mx-auto max-w-6xl">
            <span aria-hidden="true" className="wage-chevron mr-2.5 align-middle" /><span className="wage-eyebrow wage-eyebrow-mute">Membership</span>
            <h2 className="wage-cut mt-3 text-[clamp(30px,4vw,50px)]">Start free. Upgrade when it pays for itself.</h2>
            <div className="mt-9 grid gap-5 md:grid-cols-3">
              {plans.filter((p) => ['free', 'creator', 'pro'].includes(p.slug)).map((p) => {
                const featured = p.slug === 'creator';
                return (
                  <div
                    key={p.slug}
                    className={`wage-card flex flex-col px-6 py-7 ${
                      featured ? '!border-wage-amber/50 !bg-gradient-to-b !from-wage-amber/[0.09] !to-white/[0.008]' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-xl">{p.name}</span>
                      {featured && <span className="wage-chip border-wage-amber/45 bg-wage-amber/10 text-wage-amber-2">Most picked</span>}
                    </div>
                    <div className={`wage-num mt-3 text-[42px] leading-none tracking-[-0.03em] ${featured ? 'text-wage-amber-2' : ''}`}>
                      {p.display_price}
                    </div>
                    <div className="mt-1.5 font-mono text-xs text-wage-muted-2">
                      {p.slug === 'free' ? 'forever' : 'per month · cancel anytime'}
                    </div>
                    <ul className="my-6 grid gap-2.5">
                      {(p.features || []).map((f, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-[14.5px] text-[#C2BBCE]">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                               strokeWidth="2.6" className="mt-1 shrink-0 text-wage-amber-2" aria-hidden="true">
                            <path d="m5 13 4 4L19 7" />
                          </svg>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Link
                      to="/login"
                      className={`wage-btn mt-auto w-full ${featured ? 'wage-btn-primary' : 'wage-btn-ghost'}`}
                    >
                      {p.slug === 'free' ? 'Claim your handle' : `Start ${p.name}`}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* —──— Closing —──────────────────────────────────────────────────────────────────────────────────────────────────────────────— */}
      <section className="relative overflow-hidden px-5 py-28 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[900px] -translate-x-1/2 -translate-y-1/2"
          style={{ background: 'radial-gradient(ellipse, rgba(245,165,36,0.13), transparent 66%)' }}
        />
        <div className="relative mx-auto max-w-6xl">
          <span className="wage-eyebrow">W.A.G.E. Society</span>
          <h2 className="wage-cut mt-3.5 text-[clamp(28px,4vw,50px)]">
            Your work feeds you.<br />Not the other way around.
          </h2>
          <p className="mx-auto mt-4 max-w-[52ch] text-wage-muted">
            {creatorCount > 0
              ? `${creatorCount} ${creatorCount === 1 ? 'creator is' : 'creators are'} already building here. Your profile takes two minutes.`
              : 'Your profile takes two minutes.'}
          </p>
          <Link to="/login" className="wage-btn wage-btn-primary mt-7">Claim your handle — free</Link>
        </div>
      </section>
    </>
  );
}

function HudTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'live' | 'idle';
}) {
  const toneClass = tone === 'live' ? 'text-wage-silver' : tone === 'idle' ? 'text-wage-muted-2' : 'text-wage-paper';
  return (
    <div className="rounded-[14px] border border-wage-line bg-wage-ink-2/70 px-4 py-3.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-wage-muted-2">{label}</div>
      <div className={`wage-num mt-1 text-[26px] leading-none ${toneClass}`}>{value.toLocaleString()}</div>
    </div>
  );
}

