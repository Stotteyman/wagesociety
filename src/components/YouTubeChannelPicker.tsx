import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';

type Channel = {
  id: string; name: string; avatar: string | null;
  handle: string | null; subscribers: number | null; url: string;
};

/**
 * Pick which YouTube channel to feature, from the channels the linked Google
 * account actually owns.
 *
 * The Google provider token is only available on the session immediately after
 * the OAuth redirect and is never persisted by Supabase, so it is stashed in
 * sessionStorage on arrival and used once.
 */
export default function YouTubeChannelPicker() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'saving'>('idle');
  const [problem, setProblem] = useState<string | null>(null);

  // Current selection, so we can show it without needing Google at all.
  useEffect(() => {
    supabase.rpc('ws_my_profile').then(({ data }) => {
      const p = data as { featured_youtube_channel_id?: string; youtube_channel_name?: string } | null;
      if (!p) return;
      setSelectedId(p.featured_youtube_channel_id ?? null);
      setSavedName(p.youtube_channel_name ?? null);
    });
  }, []);

  // Capture the provider token the moment we come back from Google.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const t = data.session?.provider_token;
      if (t) sessionStorage.setItem('google_provider_token', t);
    });
  }, []);

  async function loadChannels() {
    setState('loading'); setProblem(null);
    const token = sessionStorage.getItem('google_provider_token');
    if (!token) {
      setProblem('Reconnect Google above — the YouTube permission is only handed over during sign-in.');
      setState('idle');
      return;
    }
    try {
      const r = await apiFetch<{ channels: Channel[] }>('youtube-channels', {
        method: 'POST',
        body: JSON.stringify({ provider_token: token }),
      });
      setChannels(r.channels);
      if (r.channels.length === 0) {
        setProblem('That Google account does not own any YouTube channels.');
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not reach YouTube.');
    } finally {
      setState('idle');
    }
  }

  async function choose(c: Channel) {
    setState('saving'); setProblem(null);
    const { error } = await supabase.rpc('ws_set_youtube_channel', {
      p_channel_id: c.id, p_name: c.name, p_avatar: c.avatar, p_url: c.url,
    });
    setState('idle');
    if (error) { setProblem(error.message); return; }
    setSelectedId(c.id);
    setSavedName(c.name);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Featured YouTube channel</div>
          <div className="text-xs text-wage-muted-2">
            {savedName ? `Showing ${savedName} on your profile` : 'No channel chosen yet'}
          </div>
        </div>
        <button
          className="wage-btn wage-btn-ghost !px-4 !py-1.5 text-sm"
          onClick={loadChannels}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? 'Checking...' : channels ? 'Refresh' : 'Choose channel'}
        </button>
      </div>

      {problem && (
        <p role="status" className="mt-3 border border-wage-warning/40 bg-wage-warning/[0.08] px-3 py-2 text-xs text-wage-warning">
          {problem}
        </p>
      )}

      {channels && channels.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {channels.map((c) => {
            const active = c.id === selectedId;
            return (
              <li key={c.id}>
                <button
                  onClick={() => choose(c)}
                  disabled={state === 'saving'}
                  className={`flex w-full items-center gap-3 border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'border-wage-amber bg-wage-amber/[0.10]'
                      : 'border-wage-line hover:border-wage-line-hi'
                  }`}
                >
                  {c.avatar
                    ? <img src={c.avatar} alt="" className="h-8 w-8 shrink-0 rounded-full" />
                    : <span className="h-8 w-8 shrink-0 bg-wage-panel-2" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{c.name}</span>
                    <span className="block truncate font-mono text-[11px] text-wage-muted-2">
                      {c.handle ?? c.id}
                      {c.subscribers !== null && ` · ${c.subscribers.toLocaleString()} subs`}
                    </span>
                  </span>
                  {active && <span className="wage-chip border-wage-amber/50 text-wage-amber-2">Featured</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
