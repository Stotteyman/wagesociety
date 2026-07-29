import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';
import { runProvisioning, priceFor, type Provision } from '../lib/provision';
import StatTile from '../components/ui/StatTile';
import TierChip from '../components/ui/TierChip';
import { referralUrl } from '../lib/site';
import ReturnNotice from '../components/ui/ReturnNotice';
import DashboardTools from '../components/DashboardTools';

type Profile = {
  username: string | null; display_name: string | null; tier: string; role: string;
  referral_code: string | null; referral_points: number; total_referrals: number; referral_tier: string;
};

export default function Dashboard() {
  const { session } = useSession();
  const [p, setP] = useState<Profile | null>(null);
  const [prov, setProv] = useState<Provision | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const provResult = await runProvisioning();   // link Discord —  grant tier/trial —  sync role
      setProv(provResult);
      const { data } = await supabase.rpc('ws_my_profile');
      setP(data as Profile | null);
      setLoading(false);
    })();
  }, []);

  async function connectDiscord() {
    await supabase.auth.linkIdentity({
      provider: 'discord',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
  }

  // Always the public domain — a link copied from localhost or a preview deploy
  // would be useless to whoever it's shared with.
  const refUrl = p?.referral_code ? referralUrl(p.referral_code) : '';
  const showWelcome = prov?.imported && prov.tier && prov.tier !== 'free';

  // Setup steps drive the checklist — profiles that finish all of them convert better.
  const steps = [
    { done: true, label: 'Create your account' },
    { done: Boolean(p?.username), label: 'Set up your creator profile', to: '/onboarding', cta: 'Set up' },
    { done: Boolean(prov?.linked), label: 'Connect Discord', action: connectDiscord, cta: 'Connect' },
    { done: (p?.total_referrals ?? 0) > 0, label: 'Invite your first creator', to: '/referrals', cta: 'Get link' },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  return (
    <section className="mx-auto max-w-5xl px-5 py-14">
      <ReturnNotice
        params={['upgraded']}
        resolve={(q) => {
          const slug = q.get('upgraded');
          if (!slug) return null;
          return {
            tone: 'ok',
            title: `You are on ${slug.charAt(0).toUpperCase()}${slug.slice(1)}`,
            body: 'Your trial has started. Discord roles sync within a minute or so of the payment clearing.',
          };
        }}
      />

      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <span className="wage-eyebrow wage-eyebrow-mute">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          <h1 className="mt-2.5 text-[clamp(28px,4vw,44px)]">
            {p?.display_name ? `Hey, ${p.display_name}` : 'Your dashboard'}
          </h1>
          <p className="mt-2 text-sm text-wage-muted">
            {session?.user.email}
            {p?.role && p.role !== 'member' ? ` · ${p.role}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {p?.username && (
            <Link to={`/creators/${p.username}`} className="wage-btn wage-btn-ghost !py-2 text-sm">
              View public profile
            </Link>
          )}
          <Link to="/settings" className="wage-btn wage-btn-ghost !py-2 text-sm">Settings</Link>
        </div>
      </div>

      {showWelcome && (
        <div className="mt-7 rounded-[14px] border border-wage-amber/45 bg-wage-amber/[0.08] p-5">
          <div className="text-[16px] font-bold text-wage-amber-2">
            You're on a complimentary {String(prov!.tier).toUpperCase()} trial
          </div>
          <p className="mt-1.5 max-w-[70ch] text-sm leading-relaxed text-[#C2BBCE]">
            As a founding Discord member your {prov!.tier} membership is <b>free for one month</b>
            {prov!.trial_ends_at ? <> — through <b>{prov!.trial_ends_at}</b></> : null}. Normally {priceFor(prov!.tier)}.
            After the trial it's 50% off for month two, then full price. We'll email you before anything changes.
          </p>
        </div>
      )}

      {loading ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="wage-card h-[104px] animate-pulse" />)}
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="wage-card px-5 py-4">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">Membership</div>
              <div className="mt-2.5"><TierChip tier={p?.tier} /></div>
              <div className="mt-2 text-[12.5px] text-wage-muted-2">
                {p?.tier && p.tier !== 'free' ? 'Active' : 'Upgrade to sell memberships'}
              </div>
            </div>
            <StatTile
              label="Referral points"
              value={p?.referral_points ?? 0}
              tone="gold"
              detail={(p?.referral_points ?? 0) === 0 ? 'Share your link to start earning' : 'Spend them in the point store'}
            />
            <StatTile
              label="Creators referred"
              value={p?.total_referrals ?? 0}
              detail={(p?.total_referrals ?? 0) === 0 ? 'Nobody has joined through you yet' : `${p?.referral_tier ?? 'bronze'} tier`}
            />
            <StatTile
              label="Setup"
              value={`${steps.length - remaining}/${steps.length}`}
              tone={remaining === 0 ? 'live' : 'default'}
              detail={remaining === 0 ? 'Everything is done' : `${remaining} step${remaining === 1 ? '' : 's'} left`}
            />
          </div>

          <DashboardTools />

          <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px]">
            <div className="grid content-start gap-5">
              {p?.referral_code && (
                <div className="wage-card p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[16px] font-bold">Your referral link</div>
                    <span className="wage-chip border-wage-amber/45 bg-wage-amber/10 text-wage-amber-2">
                      {p.referral_tier || 'bronze'}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-wage-muted">
                    You get 150 points when someone joins through it. They get 200.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2.5">
                    <code className="min-w-0 flex-1 truncate rounded-[10px] border border-wage-line-hi bg-wage-ink-2 px-4 py-3 font-mono text-sm text-wage-amber-2">
                      {refUrl}
                    </code>
                    <button
                      className="wage-btn wage-btn-ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(refUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1600);
                      }}
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              <div className="wage-card p-6">
                <div className="text-[16px] font-bold">Where to go next</div>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <Link to="/referrals" className="wage-btn wage-btn-ghost !px-4 !py-1.5 text-sm">Referrals &amp; points</Link>
                  <Link to="/shop" className="wage-btn wage-btn-ghost !px-4 !py-1.5 text-sm">Point store</Link>
                  <Link to="/creators" className="wage-btn wage-btn-ghost !px-4 !py-1.5 text-sm">Directory</Link>
                  <Link to="/leaderboard" className="wage-btn wage-btn-ghost !px-4 !py-1.5 text-sm">Leaderboard</Link>
                </div>
              </div>
            </div>

            <aside className="wage-card p-6">
              <div className="text-[16px] font-bold">Finish your setup</div>
              <p className="mt-1 text-sm text-wage-muted">
                {remaining === 0
                  ? 'All done — your profile is complete.'
                  : 'A complete profile is what turns a visitor into a member.'}
              </p>
              <ol className="mt-5 grid">
                {steps.map((s, i) => (
                  <li
                    key={s.label}
                    className={`flex items-center gap-3 border-t border-wage-line py-3 text-[14.5px] ${
                      s.done ? 'text-wage-muted-2' : ''
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px] ${
                        s.done
                          ? 'bg-wage-amber text-[#1A1204]'
                          : 'border border-wage-line-hi text-wage-muted-2'
                      }`}
                    >
                      {s.done ? '✓' : i + 1}
                    </span>
                    <span className={`flex-1 ${s.done ? 'line-through' : ''}`}>{s.label}</span>
                    {!s.done && s.to && (
                      <Link to={s.to} className="wage-btn wage-btn-gold !px-3 !py-1 text-[13px]">{s.cta}</Link>
                    )}
                    {!s.done && s.action && (
                      <button onClick={s.action} className="wage-btn wage-btn-gold !px-3 !py-1 text-[13px]">
                        {s.cta}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
