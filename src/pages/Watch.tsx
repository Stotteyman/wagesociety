import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';
import { apiFetch } from '../lib/api';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';

type Video = {
  id: string; title: string; description: string | null; thumbnail_url: string | null;
  duration_seconds: number | null; price_cents: number; subscriber_only: boolean;
  creator_username: string; creator_name: string | null; creator_avatar: string | null;
  subscription_price_cents: number;
};

type Playback = { provider: string; videoId: string; title: string };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function Watch() {
  const { id } = useParams();
  const { session } = useSession();
  const [video, setVideo] = useState<Video | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    // Metadata only. This view carries no provider id by design.
    supabase.from('wagesociety_videos').select('*').eq('id', id).maybeSingle()
      .then(({ data }) => { setVideo(data as Video | null); setLoading(false); });
  }, [id]);

  // Ask for playback separately. A 403 here is the normal path for someone who
  // hasn't bought it, not an error worth shouting about.
  useEffect(() => {
    if (!session || !id) return;
    apiFetch<Playback>('video-playback', { method: 'POST', body: JSON.stringify({ videoId: id }) })
      .then(setPlayback)
      .catch(() => setPlayback(null));
  }, [session, id]);

  async function buy(mode: 'video' | 'subscribe') {
    if (!session) { window.location.href = '/login'; return; }
    setBuying(true); setProblem(null);
    try {
      const r = await apiFetch<{ url: string }>('video-checkout', {
        method: 'POST',
        body: JSON.stringify(
          mode === 'video'
            ? { videoId: id }
            : { mode: 'subscribe', creatorUsername: video?.creator_username },
        ),
      });
      window.location.href = r.url;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Checkout could not start.');
      setBuying(false);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-4xl px-5 py-16"><div className="wage-card h-[380px] animate-pulse" /></div>;
  }

  if (!video) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20">
        <EmptyState
          title="That video isn't available."
          detail="It may have been unpublished, or the link is wrong."
          action={<Link to="/creators" className="wage-btn wage-btn-ghost">Browse creators</Link>}
        />
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-4xl px-5 py-12">
      <div className="relative aspect-video w-full overflow-hidden border border-wage-line bg-wage-ink-2">
        {playback ? (
          <iframe
            // Only ever rendered once the server confirmed entitlement.
            src={`https://www.youtube-nocookie.com/embed/${playback.videoId}?rel=0&modestbranding=1&playsinline=1`}
            title={playback.title}
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        ) : (
          <div className="grid h-full place-items-center text-center">
            {video.thumbnail_url && (
              <img src={video.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 blur-sm" />
            )}
            <div className="relative px-6">
              <span className="wage-eyebrow">Locked</span>
              <p className="mx-auto mt-3 max-w-[38ch] text-[15px] text-wage-muted">
                {session
                  ? 'Buy this video, or subscribe to the creator, to watch it.'
                  : 'Sign in and buy this video to watch it.'}
              </p>
            </div>
          </div>
        )}
      </div>

      <h1 className="wage-cut mt-6 text-[clamp(24px,3.5vw,36px)] normal-case">{video.title}</h1>

      <Link to={`/creators/${video.creator_username}`} className="mt-4 flex items-center gap-3">
        <Avatar name={video.creator_name || video.creator_username} src={video.creator_avatar} size={40} />
        <span>
          <span className="block text-[15px] font-semibold">{video.creator_name || video.creator_username}</span>
          <span className="block font-mono text-[12px] text-wage-muted-2">@{video.creator_username}</span>
        </span>
      </Link>

      {video.description && (
        <p className="mt-5 max-w-[68ch] whitespace-pre-wrap text-[15.5px] leading-relaxed text-[#C2CBD3]">
          {video.description}
        </p>
      )}

      {!playback && (
        <div className="wage-card mt-7 p-6">
          <div className="text-[16px] font-bold">Get access</div>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {video.price_cents > 0 && (
              <button className="wage-btn wage-btn-primary" onClick={() => buy('video')} disabled={buying}>
                {buying ? 'Starting checkout...' : `Buy for ${money(video.price_cents)}`}
              </button>
            )}
            {video.subscription_price_cents > 0 && (
              <button className="wage-btn wage-btn-ghost" onClick={() => buy('subscribe')} disabled={buying}>
                Subscribe · {money(video.subscription_price_cents)}/mo
              </button>
            )}
          </div>
          <p className="mt-3 text-[12.5px] text-wage-muted-2">
            One-off purchases are yours permanently. A subscription unlocks everything this
            creator marks for subscribers, for as long as it's active.
          </p>
          {problem && (
            <p role="status" className="mt-4 border border-wage-error/40 bg-wage-error/[0.08] px-4 py-3 text-sm text-wage-error">
              {problem}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
