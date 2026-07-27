import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import EmptyState from '../components/ui/EmptyState';
import { CardSkeleton } from '../components/ui/PageHeader';

type Item = { id: string; name: string; description: string | null; point_cost: number; item_type: string };

export default function PointShop() {
  const [items, setItems] = useState<Item[]>([]);
  const [points, setPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data: shop } = await supabase.from('wagesociety_shop').select('*');
    setItems((shop as Item[]) ?? []);
    const { data: prof } = await supabase.rpc('ws_my_profile');
    setPoints((prof as { referral_points?: number } | null)?.referral_points ?? 0);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function redeem(it: Item) {
    if (!confirm(`Redeem "${it.name}" for ${it.point_cost.toLocaleString()} points?`)) return;
    setBusy(it.id); setMsg(null);
    const { data, error } = await supabase.rpc('ws_redeem_shop_item', { p_item_id: it.id });
    setBusy(null);
    const r = data as { ok?: boolean; reason?: string; need?: number; have?: number } | null;
    if (error) { setMsg({ tone: 'error', text: error.message }); return; }
    if (r?.ok) { setMsg({ tone: 'ok', text: `Redeemed ${it.name}.` }); load(); }
    else if (r?.reason === 'insufficient_points') {
      setMsg({ tone: 'error', text: `Not enough points — ${it.name} costs ${r.need}, you have ${r.have}.` });
    } else {
      setMsg({ tone: 'error', text: 'Could not redeem that item. Try again in a moment.' });
    }
  }

  return (
    <section className="mx-auto max-w-5xl px-5 py-14">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="wage-eyebrow">Rewards</span>
          <h1 className="mt-2.5 text-[clamp(30px,4vw,50px)]">Point store</h1>
          <p className="mt-3 max-w-[54ch] text-[17px] text-[#C9C3D2]">
            Spend the points you earn from referrals and activity.
          </p>
        </div>
        <div className="wage-card px-5 py-3.5">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">Your balance</div>
          <div className="wage-num mt-1 text-[26px] leading-none text-wage-amber-2">
            {points.toLocaleString()} <span className="text-[13px] text-wage-muted-2">pts</span>
          </div>
        </div>
      </div>

      {msg && (
        <p
          role="status"
          className={`mt-6 rounded-[10px] border px-4 py-3 text-sm ${
            msg.tone === 'error'
              ? 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'
              : 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success'
          }`}
        >
          {msg.text}
        </p>
      )}

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <CardSkeleton count={3} height={168} />
        ) : items.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <EmptyState
              title="Nothing in the store yet."
              detail="Rewards added in the admin panel show up here."
              action={<Link to="/referrals" className="wage-btn wage-btn-ghost">Earn points</Link>}
            />
          </div>
        ) : (
          items.map((it) => {
            const afford = points >= it.point_cost;
            return (
              <div key={it.id} className="wage-card flex flex-col p-5">
                <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">
                  {it.item_type.replace(/_/g, ' ')}
                </div>
                <div className="mt-2 text-[16px] font-bold">{it.name}</div>
                {it.description && (
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-wage-muted">{it.description}</p>
                )}
                <div className="mt-5 flex items-center justify-between gap-3 border-t border-wage-line pt-4">
                  <span className={`wage-num text-[17px] ${afford ? 'text-wage-amber-2' : 'text-wage-muted-2'}`}>
                    {it.point_cost.toLocaleString()} pts
                  </span>
                  <button
                    className={`wage-btn !px-4 !py-1.5 text-sm ${afford ? 'wage-btn-gold' : 'wage-btn-ghost'}`}
                    disabled={!afford || busy === it.id}
                    onClick={() => redeem(it)}
                  >
                    {busy === it.id
                      ? 'Redeeming...'
                      : afford
                        ? 'Redeem'
                        : `${(it.point_cost - points).toLocaleString()} more`}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
