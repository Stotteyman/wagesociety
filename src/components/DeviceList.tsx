import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Apps signed in to this account, with a way to sign them out.
 *
 * Revoking is the member's own kill switch: the app's next entitlement check fails and
 * it stops working, which is what makes handing a licence to a desktop binary safe.
 */
type Device = { id: string; app: string; device: string | null; created_at: string; last_seen_at: string | null };

const APP_NAMES: Record<string, string> = { 'clip-studio': 'Clip Studio' };

const when = (v: string | null) => {
  if (!v) return 'never';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString();
};

export default function DeviceList() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    supabase.rpc('ws_my_devices').then(({ data }) => setDevices((data as Device[]) ?? []));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function revoke(id: string) {
    setBusy(id);
    await supabase.rpc('ws_revoke_device', { p_id: id });
    setBusy(null);
    load();
  }

  // Nothing linked and nothing to explain — stay out of the way.
  if (!devices || devices.length === 0) return null;

  return (
    <div className="wage-card mt-5 p-6">
      <h2 className="font-body text-[17px] font-bold normal-case tracking-normal">Apps signed in</h2>
      <p className="mt-1.5 text-[14px] text-wage-muted">
        Signing one out stops it working on that machine straight away.
      </p>

      <div className="mt-4 grid gap-2">
        {devices.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-3 border border-wage-line px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold">
                {APP_NAMES[d.app] || d.app}
                {d.device && <span className="ml-2 font-normal text-wage-muted">on {d.device}</span>}
              </div>
              <div className="font-mono text-[11.5px] text-wage-muted-2">last used {when(d.last_seen_at)}</div>
            </div>
            <button
              onClick={() => revoke(d.id)}
              disabled={busy === d.id}
              className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm"
            >
              {busy === d.id ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
