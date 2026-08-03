import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageHeader, { CardSkeleton } from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import Avatar from '../components/ui/Avatar';
import { LiveChip } from '../components/ui/TierChip';

type Stream = {
  platform: string; title: string | null; url: string | null; thumbnail_url: string | null;
  viewer_count: number; username: string; display_name: string | null; avatar_url: string | null;
  is_live: boolean; live_checked_at: string | null; is_verified: boolean | null;
};

/**
 * The platform's own verification tick, not ours.
 *
 * Deliberately not a ProfileBadges emblem: those are things W.A.G.E. Society says about
 * a member, and this is a fact about their channel on somebody else's platform. Giving
 * them the same shape would imply we vouched for it. It reads in the platform's own
 * colour — Kick green — for the same reason.
 */
const VERIFIED_TINT: Record<string, string> = {
  kick: '#53FC18',
  youtube: '#FF0033',
};

function PlatformVerified({ platform }: { platform: string }) {
  const tint = VERIFIED_TINT[platform.toLowerCase()] ?? '#B7C2CC';
  const label = `Verified on ${platform}`;
  return (
    <svg role="img" aria-label={label} width={15} height={15} viewBox="0 0 24 24" className="shrink-0">
      <title>{label}</title>
      <path
        d="M12 2 14.76 5.35 19.07 4.93 18.65 9.24 22 12 18.65 14.76 19.07 19.07 14.76 18.65 12 22 9.24 18.65 4.93 19.07 5.35 14.76 2 12 5.35 9.24 4.93 4.93 9.24 5.35 Z"
        fill={tint}
      />
      <path
        d="M8 12.2 11 15.2 16.2 9.4"
        fill="none"
        stroke="#06090B"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Streams() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchChannels() {
    // wagesociety_channels returns every connected channel, live or not, so a
    // creator who is offline still shows up rather than vanishing.
    const { data } = await supabase.from('wagesociety_channels').select('*');
    const rows = (data as Stream[]) ?? [];
    rows.sort((a, b) => Number(b.is_live) - Number(a.is_live));
    setStreams(rows);
    setLoading(false);
  }

  // Status is kept current by scheduled jobs in the database — Kick through its API,
  // YouTube by reading the channel's own /live page. Neither needs an API key.
  //
  // Show what we have first, then ask Kick to re-check and repaint. Someone who has
  // just gone live shouldn't wait out the cron interval to appear here. kick-live
  // ignores channels it checked seconds ago, so this stays cheap however many people
  // open the page; a failed nudge just leaves the cron's data on screen.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      await fetchChannels();
      await supabase.functions.invoke('kick-live').catch(() => {});
      if (!cancelled) fetchChannels();
    }

    load();
    // Keep a page left open honest rather than frozen at whatever it loaded with.
    const timer = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const liveCount = streams.filter((s) => s.is_live).length;

  return (
    <section className="mx-auto max-w-6xl px-5 py-14">
      <PageHeader
        eyebrow="Streams"
        title={liveCount > 0 ? `${liveCount} live now` : 'Nobody live right now'}
        lede="Every WAGE creator's channel, pulled from the platforms they've connected. Live ones come first."
      />

      <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <CardSkeleton count={3} height={260} />
        ) : streams.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <EmptyState
              title="No channels connected yet."
              detail="Connect YouTube or Kick in Settings and your channel appears here — offline until you go live."
              action={<Link to="/settings" className="wage-btn wage-btn-primary">Connect a platform</Link>}
            />
          </div>
        ) : (
          streams.map((s, i) => (
            <a
              key={`${s.username}-${i}`}
              href={s.url || '#'}
              target="_blank"
              rel="noreferrer"
              className={`wage-card wage-card-hover overflow-hidden ${s.is_live ? '' : 'opacity-70'}`}
            >
              <div className="relative grid aspect-video place-items-center bg-wage-ink-2">
                {s.thumbnail_url ? (
                  <img
                    src={s.thumbnail_url}
                    alt=""
                    className={`h-full w-full object-cover ${s.is_live ? '' : 'grayscale'}`}
                  />
                ) : (
                  <span aria-hidden="true" className="font-mono text-[11px] tracking-[0.2em] text-wage-muted-2">
                    NO PREVIEW
                  </span>
                )}
                <span className="absolute left-3 top-3">
                  {s.is_live
                    ? <LiveChip />
                    : !s.live_checked_at
                      ? <span className="wage-chip">Status unknown</span>
                      : <span className="wage-chip">Offline</span>}
                </span>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">
                    {s.platform}
                  </span>
                  {s.is_live && s.viewer_count > 0 && (
                    <span className="wage-num text-[12px] text-wage-amber-2">
                      {s.viewer_count.toLocaleString()} watching
                    </span>
                  )}
                </div>
                <div className="mt-2 truncate text-[15px] font-semibold">
                  {s.title || `${s.display_name || s.username} on ${s.platform}`}
                </div>
                <div className="mt-3 flex items-center gap-2.5 border-t border-wage-line pt-3">
                  <Avatar name={s.display_name || s.username} src={s.avatar_url} size={26} />
                  <span className="truncate text-sm text-wage-muted">{s.display_name || s.username}</span>
                  {/* Only ever rendered for a true. null means the check has not landed,
                      and an absent tick is the honest way to show that. */}
                  {s.is_verified && <PlatformVerified platform={s.platform} />}
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </section>
  );
}
