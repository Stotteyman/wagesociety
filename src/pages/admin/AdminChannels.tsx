import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Avatar from '../../components/ui/Avatar';

/**
 * Connected channels, and whether the platform has verified them.
 *
 * The tick on /streams comes from member_livestreams.is_verified. For Kick that is set
 * automatically — kick-live reads it from kick.com once a day, because the official API
 * carries no verification field at all. YouTube has no equivalent check yet, so its
 * channels sit at "not checked" until someone sets one here.
 *
 * Three states, and the third is the point of this screen: "not checked" is not the same
 * as "not verified", and the page says so rather than defaulting to a confident no.
 */

type Channel = {
  id: string; user_id: string; platform: string; title: string | null; url: string | null;
  status: string; username: string | null; display_name: string | null; avatar_url: string | null;
  is_verified: boolean | null; verified_source: string | null;
  verified_checked_at: string | null; live_checked_at: string | null;
};

function Notice({ tone, children }: { tone: 'error' | 'ok'; children: React.ReactNode }) {
  const skin = tone === 'error'
    ? 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'
    : 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success';
  return <p role="status" className={`mb-4 border px-4 py-2.5 text-sm ${skin}`}>{children}</p>;
}

const when = (v?: string | null) => {
  if (!v) return 'never';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 'never' : d.toLocaleString();
};

export function ChannelsTab() {
  const [rows, setRows] = useState<Channel[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.rpc('ws_admin_list_channels');
    setReady(true);
    if (error) setErr(error.message);
    else { setErr(null); setRows((data as Channel[]) ?? []); }
  }
  useEffect(() => { load(); }, []);

  async function set(c: Channel, verified: boolean | null) {
    setBusy(c.id); setErr(null); setMsg(null);
    const { data, error } = await supabase.rpc('ws_admin_set_channel_verified', {
      p_channel_id: c.id, p_verified: verified,
    });
    setBusy(null);
    if (error) return setErr(error.message);
    if (data?.ok === false) return setErr(String(data.reason));
    setMsg(
      verified === null
        ? `${c.title || c.username} set back to not checked — the next automatic check will decide.`
        : `${c.title || c.username} marked ${verified ? 'verified' : 'not verified'}.`,
    );
    load();
  }

  return (
    <div>
      <p className="mb-5 max-w-[74ch] text-[13.5px] text-wage-muted">
        A verified channel gets the platform's tick on <span className="text-wage-paper">/streams</span>.
        Kick is checked automatically once a day. Setting a value here marks it as decided by a
        person, and the automatic check will not overwrite it — use{' '}
        <span className="text-wage-paper">Not checked</span> to hand it back.
      </p>

      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}

      <div className="space-y-2.5">
        {rows.map((c) => (
          <div key={c.id} className="wage-card wage-card-sm flex flex-wrap items-center gap-3 p-4">
            <Avatar name={c.display_name || c.username || '?'} src={c.avatar_url} size={34} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-semibold">{c.title || c.username}</span>
                <span className="wage-chip !text-[10.5px]">{c.platform}</span>
                {c.status === 'live' && (
                  <span className="wage-chip border-wage-red/50 text-wage-red">live</span>
                )}
                {c.is_verified === true && (
                  <span className="wage-chip border-wage-success/50 text-wage-success">verified</span>
                )}
                {c.is_verified === false && <span className="wage-chip">not verified</span>}
                {c.is_verified === null && (
                  <span className="wage-chip border-wage-warning/50 text-wage-warning">not checked</span>
                )}
                {c.verified_source === 'manual' && <span className="wage-chip !text-[10.5px]">set by hand</span>}
              </div>
              <div className="mt-1 truncate font-mono text-[11.5px] text-wage-muted-2">
                @{c.username} / live checked {when(c.live_checked_at)} / verification checked{' '}
                {when(c.verified_checked_at)}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                disabled={busy === c.id || c.is_verified === true}
                onClick={() => set(c, true)}
                className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm"
              >
                Verified
              </button>
              <button
                disabled={busy === c.id || c.is_verified === false}
                onClick={() => set(c, false)}
                className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm"
              >
                Not verified
              </button>
              <button
                disabled={busy === c.id || c.is_verified === null}
                onClick={() => set(c, null)}
                className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm"
              >
                Not checked
              </button>
            </div>
          </div>
        ))}
        {ready && rows.length === 0 && !err && (
          <div className="wage-card wage-card-sm px-5 py-10 text-center text-[15px] text-wage-muted">
            Nobody has connected a channel yet.
          </div>
        )}
      </div>
    </div>
  );
}
