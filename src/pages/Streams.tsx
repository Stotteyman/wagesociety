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
  is_live: boolean; live_checked_at: string | null;
};

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
  // YouTube by reading the channel's own /live page. Neither needs an API key, so
  // there is nothing to trigger from here and no quota to conserve; the page just
  // reads what the last check wrote.
  useEffect(() => { fetchChannels(); }, []);

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
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </section>
  );
}
