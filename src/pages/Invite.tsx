import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';
import Avatar from '../components/ui/Avatar';
import ProfileBadges, { type Badge } from '../components/ui/ProfileBadges';
import { rememberRef } from '../lib/provision';

/**
 * /join/:handle — where a referral link actually lands.
 *
 * It used to be the ordinary home page with ?ref=WAGE-6SSSQB in the address bar: nothing
 * told the visitor they had been invited, by whom, or what either of them got out of it.
 * The code was captured silently and that was the whole experience.
 *
 * Everything on this page comes from ws_referrer_info, including the point values, so the
 * promise made here is the same number ws_apply_referral awards. They were previously two
 * separate hardcoded facts, free to disagree.
 *
 * An unknown handle is not an error. It stores nothing and sends the visitor to the home
 * page — a mistyped or expired link should look like an ordinary visit, not a failure.
 */

type Referrer = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  tier: string;
  badges: Badge[];
  reward_joiner: number;
  reward_referrer: number;
};

export default function Invite() {
  const { handle } = useParams();
  const nav = useNavigate();
  const { session } = useSession();
  const [ref, setRef] = useState<Referrer | null | 'loading'>('loading');

  useEffect(() => {
    if (!handle) { nav('/', { replace: true }); return; }
    supabase.rpc('ws_referrer_info', { p_ref: handle }).then(({ data }) => {
      const r = data as Referrer | null;
      if (!r) { nav('/', { replace: true }); return; }
      // Stored now, applied after they sign in — the account does not exist yet.
      rememberRef(r.username);
      setRef(r);
    });
  }, [handle]);

  if (ref === 'loading') {
    return <section className="mx-auto max-w-3xl px-5 py-24 text-center text-wage-muted">Loading...</section>;
  }
  if (!ref) return null;

  const name = ref.display_name || ref.username;

  return (
    <section className="relative overflow-hidden px-5 py-16">
      <div
        aria-hidden="true"
        className="wage-portal-glow pointer-events-none absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full"
      />
      <div className="relative mx-auto max-w-[560px]">
        <div className="text-center">
          <span className="wage-eyebrow">You have been invited</span>

          <div className="mt-6 flex flex-col items-center gap-3">
            <Avatar name={name} src={ref.avatar_url} size={76} />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-[22px] font-bold">{name}</span>
              <ProfileBadges badges={ref.badges} size={19} />
            </div>
            <span className="font-mono text-[13px] text-wage-muted-2">@{ref.username}</span>
          </div>

          <h1 className="mt-6 text-[clamp(26px,4.5vw,38px)]">
            {name} wants you in W.A.G.E. Society
          </h1>
          {ref.bio && <p className="mt-3 text-[15px] text-wage-muted">{ref.bio}</p>}
        </div>

        <div className="wage-card mt-8 p-6">
          <div className="wage-eyebrow-mute font-mono text-[10.5px] uppercase tracking-[0.16em]">
            What you get
          </div>
          <ul className="mt-3 grid gap-2.5">
            <li className="flex items-start gap-2.5 text-[14.5px]">
              <span aria-hidden="true" className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 bg-wage-amber" />
              <span>
                <b className="wage-num text-wage-amber-2">{ref.reward_joiner}</b> points the moment you
                join, to spend in the point store
              </span>
            </li>
            <li className="flex items-start gap-2.5 text-[14.5px]">
              <span aria-hidden="true" className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 bg-wage-amber" />
              <span>A free public creator profile, and your own <b>@handle</b></span>
            </li>
            <li className="flex items-start gap-2.5 text-[14.5px]">
              <span aria-hidden="true" className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 bg-wage-amber" />
              <span>Into the Discord, with your roles set up automatically</span>
            </li>
            <li className="flex items-start gap-2.5 text-[14.5px]">
              <span aria-hidden="true" className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 bg-wage-amber" />
              <span>Your streams listed on the site whenever you go live</span>
            </li>
          </ul>

          <p className="mt-4 border-t border-wage-line pt-3.5 text-[13px] text-wage-muted">
            {name} gets <b className="wage-num text-wage-amber-2">{ref.reward_referrer}</b> points for
            the introduction. Joining is free — no card needed.
          </p>

          {session ? (
            <div className="mt-5">
              <p className="text-[13.5px] text-wage-muted">
                You are already signed in, so this invite cannot be applied to your account.
              </p>
              <Link to="/dashboard" className="wage-btn wage-btn-ghost mt-3">Go to your dashboard</Link>
            </div>
          ) : (
            <Link to="/login" className="wage-btn wage-btn-primary mt-5 w-full">
              Join with {name}&rsquo;s invite
            </Link>
          )}
        </div>

        <p className="mt-5 text-center text-[13px] text-wage-muted-2">
          Already a member? <Link to="/login" className="underline hover:text-wage-paper">Sign in</Link>
        </p>
      </div>
    </section>
  );
}
