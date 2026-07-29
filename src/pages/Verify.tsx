import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';
import { captureDiscordToken, joinOfficialServer, linkDiscord, signInWithDiscord, syncDiscordRoles } from '../lib/discord';
import { runProvisioning } from '../lib/provision';

type StepState = 'todo' | 'doing' | 'done';

/**
 * /verify — the front door. Walks someone from "never heard of this" to
 * "in the Discord with a public profile" without them having to work out the
 * order of operations themselves.
 */
export default function Verify() {
  const { session } = useSession();
  const nav = useNavigate();

  const [identities, setIdentities] = useState<string[] | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [joined, setJoined] = useState<boolean | null>(null);
  const [joining, setJoining] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Coming back from Discord OAuth: grab the token, provision, then auto-join.
  useEffect(() => {
    (async () => {
      await captureDiscordToken();
      if (!session) return;

      const { data } = await supabase.auth.getUserIdentities();
      const providers = (data?.identities || []).map((i) => i.provider);
      setIdentities(providers);

      const { data: profile } = await supabase.rpc('ws_my_profile');
      setUsername((profile as { username?: string } | null)?.username ?? null);

      if (providers.includes('discord')) {
        // runProvisioning joins the server and then syncs roles, in that order.
        setJoining(true);
        const p = await runProvisioning();
        setJoining(false);
        setJoined(Boolean(p?.joined));
        if (p && !p.joined && p.joinProblem) setProblem(p.joinProblem);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function attemptJoin() {
    setJoining(true); setProblem(null);
    const r = await joinOfficialServer();
    if (r.ok) {
      // Roles can only be written once they are a member, so this has to follow the join.
      await syncDiscordRoles();
      setJoining(false);
      setJoined(true);
      return;
    }
    setJoining(false);
    setJoined(false);
    setProblem(r.detail);
  }

  const signedIn = Boolean(session);
  const discordLinked = Boolean(identities?.includes('discord'));
  const hasHandle = Boolean(username);

  const steps: { title: string; body: string; state: StepState; action?: React.ReactNode }[] = [
    {
      title: 'Create your account',
      body: 'Discord is the fastest way in — it signs you in and connects your server identity in one go.',
      state: signedIn ? 'done' : 'doing',
      action: signedIn ? undefined : (
        <div className="flex flex-wrap gap-2.5">
          <button
            className="wage-btn wage-btn-primary"
            onClick={async () => { const e = await signInWithDiscord(); if (e) setProblem(e); }}
          >
            Continue with Discord
          </button>
          <Link to="/login" className="wage-btn wage-btn-ghost">Use email instead</Link>
        </div>
      ),
    },
    {
      title: 'Join the Discord',
      body: discordLinked
        ? 'Connected. We add you to the W.A.G.E. Society server automatically and keep your role in sync with your membership.'
        : 'Connect Discord and we will add you to the server for you — no invite link to hunt down.',
      state: !signedIn ? 'todo' : joined ? 'done' : discordLinked ? 'doing' : 'doing',
      action: !signedIn ? undefined : !discordLinked ? (
        <button
          className="wage-btn wage-btn-primary"
          onClick={async () => { const e = await linkDiscord('/verify'); if (e) setProblem(e); }}
        >
          Connect Discord
        </button>
      ) : joined === false ? (
        <button className="wage-btn wage-btn-ghost" onClick={attemptJoin} disabled={joining}>
          {joining ? 'Adding you...' : 'Try again'}
        </button>
      ) : undefined,
    },
    {
      title: 'Claim your handle',
      body: hasHandle
        ? `You're @${username}. Your public profile is live in the directory.`
        : 'Pick the name your profile lives at. This is what you share when you send people to your page.',
      state: !signedIn ? 'todo' : hasHandle ? 'done' : 'doing',
      action: !signedIn || hasHandle ? undefined : (
        <Link to="/onboarding" className="wage-btn wage-btn-primary">Claim your handle</Link>
      ),
    },
    {
      title: 'Connect where you stream',
      body: 'Link YouTube or Kick and your channel shows on your profile and in Streams — offline until you go live.',
      state: !hasHandle ? 'todo' : 'doing',
      action: !hasHandle ? undefined : (
        <Link to="/settings" className="wage-btn wage-btn-ghost">Open Settings</Link>
      ),
    },
  ];

  const doneCount = steps.filter((s) => s.state === 'done').length;
  const allDone = doneCount === steps.length;

  return (
    <section className="relative overflow-hidden px-5 py-16">
      <div
        aria-hidden="true"
        className="wage-portal-glow pointer-events-none absolute left-1/2 top-0 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/3 rounded-full"
      />
      <div className="relative mx-auto max-w-[620px]">
        <div className="text-center">
          <img
            src="/brand/wage-crest.png"
            alt="W.A.G.E. Society"
            width={512}
            height={512}
            className="mx-auto h-24 w-24"
          />
          <h1 className="wage-cut mt-5 text-[clamp(30px,5vw,46px)]">Get set up</h1>
          <p className="mx-auto mt-3 max-w-[46ch] text-[16px] text-wage-muted">
            Four steps, about two minutes, all of it free.
          </p>
          <p className="wage-num mt-4 text-[13px] text-wage-muted-2">
            {doneCount} of {steps.length} done
          </p>
        </div>

        {problem && (
          <p role="status" className="mt-6 border border-wage-warning/40 bg-wage-warning/[0.08] px-4 py-3 text-sm text-wage-warning">
            {problem}
          </p>
        )}

        <ol className="mt-8 grid gap-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className={`wage-card p-5 ${s.state === 'todo' ? 'opacity-55' : ''}`}
            >
              <div className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className={`grid h-7 w-7 shrink-0 place-items-center font-mono text-[12px] font-bold ${
                    s.state === 'done'
                      ? 'bg-wage-amber text-wage-ink'
                      : s.state === 'doing'
                        ? 'border border-wage-amber text-wage-amber-2'
                        : 'border border-wage-line-hi text-wage-muted-2'
                  }`}
                >
                  {s.state === 'done' ? '+' : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-body text-[17px] font-bold normal-case tracking-normal">{s.title}</h2>
                    {s.state === 'done' && (
                      <span className="wage-chip border-wage-success/50 bg-wage-success/[0.10] text-wage-success">
                        Done
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[14.5px] leading-relaxed text-wage-muted">{s.body}</p>
                  {s.action && <div className="mt-4">{s.action}</div>}
                </div>
              </div>
            </li>
          ))}
        </ol>

        {allDone && (
          <div className="wage-card mt-6 p-6 text-center">
            <h2 className="wage-cut font-display text-[22px]">You're in</h2>
            <p className="mx-auto mt-2 max-w-[44ch] text-sm text-wage-muted">
              Your profile is live and your Discord role is synced.
            </p>
            <button className="wage-btn wage-btn-primary mt-5" onClick={() => nav('/dashboard')}>
              Go to your dashboard
            </button>
          </div>
        )}

        <p className="mt-8 text-center text-[13px] text-wage-muted-2">
          Stuck on a step? <Link to="/faq" className="underline hover:text-wage-paper">Read the FAQ</Link>
        </p>
      </div>
    </section>
  );
}
