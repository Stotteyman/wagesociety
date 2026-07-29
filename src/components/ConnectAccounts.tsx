import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { linkKick, isKickIdentity } from '../lib/kick';
import { linkDiscord } from '../lib/discord';
import YouTubeChannelPicker from './YouTubeChannelPicker';

/**
 * The one place a creator connects platforms. Streams are derived from these
 * connections — there is no manual "add a stream" anywhere.
 */
const PLATFORMS = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'kick', label: 'Kick' },
  { value: 'twitch', label: 'Twitch' },
] as const;

export default function ConnectAccounts({
  primaryPlatform,
  onPrimaryPlatformChange,
}: {
  primaryPlatform?: string;
  onPrimaryPlatformChange?: (value: string) => void;
}) {
  const [linked, setLinked] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.auth.getUserIdentities();
    setLinked((data?.identities || []).map((i) => i.provider));
  }
  useEffect(() => { load(); }, []);

  async function connect(provider: 'discord' | 'google' | 'kick' | 'x', reconsent = false) {
    setBusy(provider); setMsg(null);

    // Discord goes through its own helper: it needs guilds.join so we can add
    // the member to the official server on their behalf.
    if (provider === 'discord') {
      const err = await linkDiscord();
      if (err) { setMsg(err); setBusy(null); }
      return;
    }

    // Kick is a custom Supabase provider, so it carries no extra scopes.
    if (provider === 'kick') {
      const err = await linkKick();
      if (err) { setMsg(err); setBusy(null); }
      return;
    }

    const { error } = await supabase.auth.linkIdentity({
      // 'x' is Supabase's OAuth 2.0 X provider; supabase-js types have not caught up.
      provider: provider as 'google',
      options: {
        redirectTo: `${window.location.origin}/settings?linked=${provider}`,
        // youtube.readonly is a Google *sensitive* scope, which Google will refuse
        // until the app passes its verification review. Requesting it on every Google
        // link meant a refusal took ordinary Google sign-in down with it. It is now
        // asked for only when someone deliberately opts into the YouTube feature, so
        // the worst case is that one feature is unavailable rather than the account
        // connection failing.
        ...(provider === 'google' && reconsent
          ? {
              scopes: 'https://www.googleapis.com/auth/youtube.readonly',
              // Google silently reuses an earlier consent, so re-asking for a scope
              // that was declined does nothing without prompt=consent.
              queryParams: { prompt: 'consent' },
            }
          : {}),
      },
    });
    if (error) { setMsg(error.message); setBusy(null); }
  }

  const googleLinked = linked.includes('google');

  return (
    <div className="wage-card p-5">
      <h2 className="font-display text-lg">Connected accounts</h2>
      <p className="mt-1 text-sm text-wage-muted">
        Your streams come from these connections. Nothing to add by hand.
      </p>

      <div className="mt-4 space-y-3">
        <Row
          label="Discord"
          note="Sync your server role and unlock founding-member perks"
          linked={linked.includes('discord')}
          busy={busy === 'discord'}
          onConnect={() => connect('discord')}
        />
        {/* This row is Google, not YouTube. Linking Google does not by itself mean we
            can see a YouTube channel — that is a separate permission Google asks for,
            and it can be declined while the sign-in still succeeds. Calling the row
            "YouTube" made a connected Google account look like a connected channel. */}
        <Row
          label="Google"
          note="Sign in with Google, and read which YouTube channels you own"
          linked={googleLinked}
          busy={busy === 'google'}
          onConnect={() => connect('google')}
        />

        {googleLinked && (
          <div className="border-t border-wage-line pt-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Featured YouTube channel</div>
                <p className="mt-0.5 text-xs text-wage-muted-2">
                  Reading your channel list needs an extra Google permission, asked for
                  separately so a refusal cannot break your sign-in.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => connect('google', true)}
                  disabled={busy === 'google'}
                  className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm"
                >
                  {busy === 'google' ? 'Opening...' : 'Grant YouTube access'}
                </button>
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="wage-btn wage-btn-quiet !px-3 !py-1 text-sm"
                >
                  Google permissions
                </a>
              </div>
            </div>
            <YouTubeChannelPicker />
          </div>
        )}

        <Row
          label="Kick"
          note="Feature your Kick channel"
          linked={linked.some(isKickIdentity)}
          busy={busy === 'kick'}
          onConnect={() => connect('kick')}
        />

        <Row
          label="X"
          note="Show your X profile on your page"
          linked={linked.includes('x') || linked.includes('twitter')}
          busy={busy === 'x'}
          onConnect={() => connect('x')}
        />

        <div className="flex items-center justify-between gap-4 border-t border-wage-line pt-3 opacity-60">
          <div>
            <div className="font-semibold">Twitch</div>
            <div className="text-xs text-wage-muted-2">Not connected yet</div>
          </div>
          <span className="text-xs text-wage-muted-2">Coming next</span>
        </div>
      </div>

      {onPrimaryPlatformChange && (
        <div className="mt-5 border-t border-wage-line pt-4">
          <div className="text-sm font-semibold">Main streaming platform</div>
          <p className="mt-1 text-xs text-wage-muted-2">
            Which one leads on your profile when you're live on more than one.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const active = (primaryPlatform || '').toLowerCase() === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onPrimaryPlatformChange(active ? '' : p.value)}
                  className={`wage-chip transition-colors ${
                    active
                      ? '!border-wage-amber !bg-wage-amber !text-wage-ink'
                      : 'hover:border-wage-line-hi'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12.5px] text-wage-muted-2">
            Saved with the profile form above.
          </p>
        </div>
      )}

      {msg && (
        <p role="status" className="mt-3 border border-wage-error/40 bg-wage-error/[0.08] px-4 py-3 text-sm text-wage-error">
          {msg}
        </p>
      )}
    </div>
  );
}

function Row({
  label, note, linked, busy, onConnect,
}: {
  label: string; note: string; linked: boolean; busy: boolean; onConnect: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-wage-line pt-3">
      <div>
        <div className="font-semibold">{label}</div>
        <div className="text-xs text-wage-muted-2">{linked ? 'Connected' : note}</div>
      </div>
      {linked ? (
        <span className="wage-chip border-wage-success/50 bg-wage-success/[0.10] text-wage-success">Linked</span>
      ) : (
        <button
          className="wage-btn wage-btn-primary !px-4 !py-1.5 text-sm"
          disabled={busy}
          onClick={onConnect}
        >
          {busy ? 'Opening...' : 'Connect'}
        </button>
      )}
    </div>
  );
}
