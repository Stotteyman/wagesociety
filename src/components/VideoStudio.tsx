import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';

type MyVideo = {
  id: string; title: string; description: string | null; thumbnail_url: string | null;
  price_cents: number; subscriber_only: boolean; is_published: boolean;
  purchase_count: number; revenue_cents: number;
};

type ConnectStatus = { connected: boolean; canSell: boolean; requirementsDue?: number };

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const PLATFORM_FEE_PERCENT = 10;

/** Pull the video id out of whatever form of YouTube link was pasted. */
function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return s;                       // already an id
  const m =
    s.match(/[?&]v=([\w-]{11})/) ||
    s.match(/youtu\.be\/([\w-]{11})/) ||
    s.match(/\/embed\/([\w-]{11})/) ||
    s.match(/\/live\/([\w-]{11})/) ||
    s.match(/\/shorts\/([\w-]{11})/);
  return m ? m[1] : null;
}

const BLANK = {
  id: null as string | null,
  title: '', description: '', link: '', thumbnail: '',
  price: '', subscriberOnly: false, publish: true,
};

const THUMB_BUCKET = 'wage-avatars'; // per-user folder policy already enforces ownership

export default function VideoStudio() {
  const [videos, setVideos] = useState<MyVideo[]>([]);
  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [subPrice, setSubPrice] = useState('');
  const [form, setForm] = useState({ ...BLANK });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  async function load() {
    const { data } = await supabase.rpc('ws_my_videos');
    setVideos((data as MyVideo[]) ?? []);
    const { data: p } = await supabase.rpc('ws_my_profile');
    const cents = (p as { subscription_price_cents?: number } | null)?.subscription_price_cents ?? 0;
    setSubPrice(cents ? (cents / 100).toFixed(2) : '');
  }

  useEffect(() => {
    load();
    apiFetch<ConnectStatus>('connect-status').then(setConnect).catch(() => setConnect(null));
  }, []);

  async function startOnboarding() {
    setBusy(true); setMsg(null);
    try {
      const r = await apiFetch<{ url: string }>('connect-onboard', { method: 'POST', body: '{}' });
      window.location.href = r.url;
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'Could not reach Stripe.' });
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const priceCents = form.price ? Math.round(parseFloat(form.price) * 100) : 0;
    if (!priceCents && !form.subscriberOnly) {
      setMsg({ tone: 'error', text: 'Set a price, or mark it for subscribers only.' });
      return;
    }

    let providerId = '';
    if (form.link.trim()) {
      const parsed = parseYouTubeId(form.link);
      if (!parsed) {
        setMsg({ tone: 'error', text: "That doesn't look like a YouTube link. Paste the full URL or the 11-character id." });
        return;
      }
      providerId = parsed;
    } else if (!form.id) {
      setMsg({ tone: 'error', text: 'Paste the unlisted video link.' });
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.rpc('ws_upsert_video', {
      p_id: form.id,
      p_title: form.title,
      p_description: form.description || null,
      p_provider_video_id: providerId,
      // NEVER derive this from the provider id. YouTube's own thumbnail URL is
      // https://i.ytimg.com/vi/<ID>/... — and thumbnail_url is exposed in the
      // public wagesociety_videos view, so using it would publish the very id
      // the gating exists to protect. Creators upload their own cover instead.
      p_thumbnail_url: form.thumbnail || null,
      p_price_cents: priceCents,
      p_subscriber_only: form.subscriberOnly,
      p_is_published: form.publish,
    } as never);
    setBusy(false);

    const r = data as { ok?: boolean; reason?: string } | null;
    if (error || !r?.ok) {
      setMsg({ tone: 'error', text: reasonToText(r?.reason) || error?.message || 'Could not save.' });
      return;
    }
    setForm({ ...BLANK });
    setEditing(false);
    setMsg({ tone: 'ok', text: 'Saved.' });
    load();
  }

  async function remove(v: MyVideo) {
    if (!confirm(`Delete "${v.title}"? Anyone who bought it loses access.`)) return;
    await supabase.rpc('ws_delete_video', { p_id: v.id });
    load();
  }

  async function saveSubPrice() {
    const cents = subPrice ? Math.round(parseFloat(subPrice) * 100) : 0;
    setBusy(true);
    await supabase.rpc('ws_set_subscription_price', { p_cents: cents });
    setBusy(false);
    setMsg({ tone: 'ok', text: cents ? `Subscription set to ${money(cents)}/mo.` : 'Subscription turned off.' });
  }

  return (
    <div className="wage-card p-5">
      <h2 className="font-display text-lg">Paid video</h2>
      <p className="mt-1 text-sm text-wage-muted">
        Sell videos one at a time, or bundle them into a monthly subscription.
        W.A.G.E. takes {PLATFORM_FEE_PERCENT}%; Stripe pays you the rest directly.
      </p>

      {/* Payouts must exist before anything can be sold. */}
      {connect && !connect.canSell && (
        <div className="mt-4 border border-wage-amber/45 bg-wage-amber/[0.08] p-4">
          <div className="text-[15px] font-bold text-wage-amber-2">
            {connect.connected ? 'Finish your payout setup' : 'Set up payouts first'}
          </div>
          <p className="mt-1.5 text-sm text-[#C2CBD3]">
            Stripe needs to verify who you are before it can send you money. Until that's done,
            your videos can't be bought.
          </p>
          <button className="wage-btn wage-btn-primary mt-3" onClick={startOnboarding} disabled={busy}>
            {busy ? 'Opening Stripe...' : connect.connected ? 'Continue setup' : 'Set up payouts'}
          </button>
        </div>
      )}

      {/* Creator subscription price */}
      <div className="mt-5 border-t border-wage-line pt-4">
        <div className="text-sm font-semibold">Monthly subscription</div>
        <p className="mt-1 text-xs text-wage-muted-2">
          Unlocks every video you mark "subscribers only". Leave blank to not offer one.
        </p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          <input
            className="input max-w-[160px]"
            inputMode="decimal"
            placeholder="8.00"
            value={subPrice}
            onChange={(e) => setSubPrice(e.target.value)}
          />
          <button className="wage-btn wage-btn-ghost" onClick={saveSubPrice} disabled={busy}>Save price</button>
        </div>
      </div>

      {/* Video list */}
      <div className="mt-6 border-t border-wage-line pt-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Your videos</div>
          <button
            className="wage-btn wage-btn-ghost !px-4 !py-1.5 text-sm"
            onClick={() => { setEditing(!editing); setForm({ ...BLANK }); }}
          >
            {editing ? 'Cancel' : 'Add a video'}
          </button>
        </div>

        {editing && (
          <form onSubmit={save} className="mt-4 grid gap-3 border border-wage-line p-4">
            <Field label="Title">
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <Field
              label="Unlisted video link"
              hint="Set the video to Unlisted on YouTube. We never show this link on the site — it's handed to a viewer only after they've paid."
            >
              <input
                className="input"
                placeholder={form.id ? 'Leave blank to keep the current link' : 'https://youtube.com/watch?v=...'}
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
              />
            </Field>
            <Field
              label="Cover image"
              hint="Upload your own. We deliberately don't use YouTube's thumbnail, because its URL contains the video id."
            >
              <div className="flex items-center gap-3">
                {form.thumbnail && (
                  <img src={form.thumbnail} alt="" className="h-12 w-20 shrink-0 border border-wage-line object-cover" />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="text-sm text-wage-muted file:mr-3 file:border file:border-wage-line-hi file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-wage-paper"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    setBusy(true); setMsg(null);
                    const { data: u } = await supabase.auth.getUser();
                    const uid = u.user?.id;
                    if (!uid) { setBusy(false); return; }
                    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
                    const path = `${uid}/video-thumbs/${Date.now()}.${ext}`;
                    const { error } = await supabase.storage.from(THUMB_BUCKET)
                      .upload(path, file, { upsert: true, contentType: file.type });
                    if (error) { setMsg({ tone: 'error', text: `Upload failed. ${error.message}` }); setBusy(false); return; }
                    const { data } = supabase.storage.from(THUMB_BUCKET).getPublicUrl(path);
                    setForm((f) => ({ ...f, thumbnail: data.publicUrl }));
                    setBusy(false);
                  }}
                />
              </div>
            </Field>
            <Field label="Description">
              <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Price" hint={form.price ? `You keep ${money(Math.round(parseFloat(form.price || '0') * 100 * 0.9))}` : 'Blank = not sold individually'}>
                <input className="input" inputMode="decimal" placeholder="4.99" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </Field>
              <label className="flex items-end gap-2.5 pb-2 text-sm">
                <input type="checkbox" checked={form.subscriberOnly} onChange={(e) => setForm({ ...form, subscriberOnly: e.target.checked })} />
                Include for subscribers
              </label>
            </div>
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={form.publish} onChange={(e) => setForm({ ...form, publish: e.target.checked })} />
              Publish now
            </label>
            <button className="wage-btn wage-btn-primary justify-self-start" disabled={busy}>
              {busy ? 'Saving...' : 'Save video'}
            </button>
          </form>
        )}

        <div className="mt-4 grid gap-2">
          {videos.length === 0 ? (
            <p className="text-sm text-wage-muted-2">Nothing published yet.</p>
          ) : videos.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-wage-line py-3">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold">{v.title}</div>
                <div className="font-mono text-[11.5px] text-wage-muted-2">
                  {v.price_cents ? money(v.price_cents) : 'subscribers only'}
                  {' · '}{v.purchase_count} sold
                  {v.revenue_cents > 0 && ` · ${money(v.revenue_cents)} earned`}
                  {!v.is_published && ' · draft'}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="wage-btn wage-btn-ghost !px-3 !py-1 text-[13px]"
                  onClick={() => {
                    setForm({
                      id: v.id, title: v.title, description: v.description ?? '', link: '',
                      thumbnail: v.thumbnail_url ?? '',
                      price: v.price_cents ? (v.price_cents / 100).toFixed(2) : '',
                      subscriberOnly: v.subscriber_only, publish: v.is_published,
                    });
                    setEditing(true);
                  }}
                >
                  Edit
                </button>
                <button className="wage-btn wage-btn-quiet !px-3 !py-1 text-[13px]" onClick={() => remove(v)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {msg && (
        <p
          role="status"
          className={`mt-4 border px-4 py-3 text-sm ${
            msg.tone === 'error'
              ? 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'
              : 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success'
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}

function reasonToText(reason?: string): string | null {
  switch (reason) {
    case 'title_required': return 'Give it a title.';
    case 'video_link_required': return 'Paste the unlisted video link.';
    case 'needs_price_or_subscriber_only': return 'Set a price, or mark it for subscribers only.';
    case 'not_your_video': return "That video isn't yours to edit.";
    case 'not_authenticated': return 'Your session expired. Sign in again.';
    default: return null;
  }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">{label}</span>
      {children}
      {hint && <span className="text-[12.5px] text-wage-muted-2">{hint}</span>}
    </label>
  );
}
