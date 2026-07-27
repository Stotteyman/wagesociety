import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { useRole } from '../hooks/useRole';

type Tab = 'overview' | 'users' | 'subs' | 'store' | 'blog' | 'merch' | 'faq';

export default function Admin() {
  const { loading, atLeast } = useRole();
  const [tab, setTab] = useState<Tab>('overview');

  if (loading) return <p className="p-16 text-center text-neutral-400">Loading...</p>;
  if (!atLeast('staff')) return <p className="p-16 text-center text-neutral-400">Admins only.</p>;

  return (
    <section className="mx-auto max-w-5xl px-5 py-12">
      <h1 className="font-display text-3xl font-bold">Admin</h1>
      <div className="mt-6 flex flex-wrap gap-2 border-b border-wage-border pb-3">
        {(['overview', 'users', 'subs', 'store', 'blog', 'merch', 'faq'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`wage-btn !py-1.5 !px-4 text-sm ${tab === t ? 'wage-btn-primary' : 'wage-btn-ghost'}`}>
            {({ overview: 'Overview', users: 'Users', subs: 'Subscriptions', store: 'Point Store', blog: 'Blog', merch: 'Merch', faq: 'FAQ' } as Record<Tab, string>)[t]}
          </button>
        ))}
      </div>
      <div className="mt-8">
        {tab === 'overview' && <Overview />}
        {tab === 'users' && <UsersAdmin />}
        {tab === 'subs' && <SubsAdmin />}
        {tab === 'store' && <ShopAdmin />}
        {tab === 'blog' && <BlogAdmin />}
        {tab === 'merch' && <MerchAdmin />}
        {tab === 'faq' && <FaqAdmin />}
      </div>
    </section>
  );
}

function Overview() {
  const [o, setO] = useState<Record<string, number> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { supabase.rpc('ws_admin_overview').then(({ data, error }) => error ? setErr(error.message) : setO(data as any)); }, []);
  if (err) return <p className="text-red-300">{err}</p>;
  if (!o) return <p className="text-neutral-400">Loading...</p>;
  const tiles: [string, string][] = [
    ['Creators', 'creators'], ['Published posts', 'published'], ['Blog (all)', 'blog_posts'],
    ['Merch', 'merch'], ['Subscribers', 'subscribers'], ['Active members', 'memberships'], ['FAQ', 'faq'],
  ];
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {tiles.map(([label, k]) => (
        <div key={k} className="wage-card px-4 py-5">
          <div className="font-display text-3xl font-bold">{o[k] ?? 0}</div>
          <div className="mt-1 text-xs uppercase text-neutral-500">{label}</div>
        </div>
      ))}
    </div>
  );
}

function useList(rpc: string) {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const reload = () => supabase.rpc(rpc).then(({ data, error }) => error ? setErr(error.message) : setRows((data as any[]) ?? []));
  useEffect(() => { reload(); }, []);
  return { rows, err, reload };
}

function BlogAdmin() {
  const { rows, err, reload } = useList('ws_admin_list_blog');
  const [f, setF] = useState<any>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc('ws_admin_save_blog', {
      p_id: f.id || null, p_slug: f.slug, p_title: f.title, p_excerpt: f.excerpt || null,
      p_body: f.body || null, p_cover: f.cover_image_url || null, p_status: f.status || 'draft',
    });
    if (error) return alert(error.message);
    setF(null); reload();
  }
  return (
    <div>
      <button className="wage-btn wage-btn-primary mb-4" onClick={() => setF({ status: 'draft' })}>+ New post</button>
      {err && <p className="text-red-300">{err}</p>}
      {f && (
        <form onSubmit={save} className="wage-card mb-6 flex flex-col gap-3 p-5">
          <input required placeholder="Title" className="input" value={f.title || ''} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input required placeholder="slug (url-friendly)" className="input" value={f.slug || ''} onChange={(e) => setF({ ...f, slug: e.target.value })} />
          <input placeholder="Excerpt" className="input" value={f.excerpt || ''} onChange={(e) => setF({ ...f, excerpt: e.target.value })} />
          <input placeholder="Cover image URL" className="input" value={f.cover_image_url || ''} onChange={(e) => setF({ ...f, cover_image_url: e.target.value })} />
          <textarea placeholder="Body" rows={6} className="input" value={f.body || ''} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
          </select>
          <div className="flex gap-2">
            <button className="wage-btn wage-btn-primary">Save</button>
            <button type="button" className="wage-btn wage-btn-ghost" onClick={() => setF(null)}>Cancel</button>
          </div>
        </form>
      )}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="wage-card flex items-center justify-between p-4">
            <div><span className="font-semibold">{r.title}</span> <span className="text-xs uppercase text-neutral-500">{r.status}</span></div>
            <div className="flex gap-2">
              <button className="wage-btn wage-btn-ghost !py-1 !px-3 text-sm" onClick={() => setF(r)}>Edit</button>
              <button className="wage-btn wage-btn-ghost !py-1 !px-3 text-sm" onClick={async () => { if (confirm('Delete?')) { await supabase.rpc('ws_admin_delete_blog', { p_id: r.id }); reload(); } }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MerchAdmin() {
  const { rows, err, reload } = useList('ws_admin_list_merch');
  const [f, setF] = useState<any>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc('ws_admin_save_merch', {
      p_id: f.id || null, p_name: f.name, p_description: f.description || null,
      p_price_cents: Math.round(parseFloat(f.price || '0') * 100), p_image_url: f.image_url || null,
      p_url: f.url || null, p_is_active: f.is_active !== false, p_sort_order: parseInt(f.sort_order || '0', 10),
    });
    if (error) return alert(error.message);
    setF(null); reload();
  }
  return (
    <div>
      <button className="wage-btn wage-btn-primary mb-4" onClick={() => setF({ is_active: true })}>+ New item</button>
      {err && <p className="text-red-300">{err}</p>}
      {f && (
        <form onSubmit={save} className="wage-card mb-6 flex flex-col gap-3 p-5">
          <input required placeholder="Name" className="input" value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input placeholder="Description" className="input" value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <input placeholder="Price (e.g. 25.00)" className="input" value={f.price ?? (f.price_cents != null ? (f.price_cents / 100).toString() : '')} onChange={(e) => setF({ ...f, price: e.target.value })} />
          <input placeholder="Image URL" className="input" value={f.image_url || ''} onChange={(e) => setF({ ...f, image_url: e.target.value })} />
          <input placeholder="Buy URL" className="input" value={f.url || ''} onChange={(e) => setF({ ...f, url: e.target.value })} />
          <div className="flex gap-2">
            <button className="wage-btn wage-btn-primary">Save</button>
            <button type="button" className="wage-btn wage-btn-ghost" onClick={() => setF(null)}>Cancel</button>
          </div>
        </form>
      )}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="wage-card flex items-center justify-between p-4">
            <span className="font-semibold">{r.name} · ${(r.price_cents / 100).toFixed(2)}</span>
            <div className="flex gap-2">
              <button className="wage-btn wage-btn-ghost !py-1 !px-3 text-sm" onClick={() => setF(r)}>Edit</button>
              <button className="wage-btn wage-btn-ghost !py-1 !px-3 text-sm" onClick={async () => { if (confirm('Delete?')) { await supabase.rpc('ws_admin_delete_merch', { p_id: r.id }); reload(); } }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqAdmin() {
  const { rows, err, reload } = useList('ws_admin_list_faq');
  const [f, setF] = useState<any>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc('ws_admin_save_faq', {
      p_id: f.id || null, p_question: f.question, p_answer: f.answer,
      p_sort_order: parseInt(f.sort_order || '0', 10), p_is_active: f.is_active !== false,
    });
    if (error) return alert(error.message);
    setF(null); reload();
  }
  return (
    <div>
      <button className="wage-btn wage-btn-primary mb-4" onClick={() => setF({ is_active: true })}>+ New FAQ</button>
      {err && <p className="text-red-300">{err}</p>}
      {f && (
        <form onSubmit={save} className="wage-card mb-6 flex flex-col gap-3 p-5">
          <input required placeholder="Question" className="input" value={f.question || ''} onChange={(e) => setF({ ...f, question: e.target.value })} />
          <textarea required placeholder="Answer" rows={3} className="input" value={f.answer || ''} onChange={(e) => setF({ ...f, answer: e.target.value })} />
          <input placeholder="Sort order" className="input" value={f.sort_order ?? ''} onChange={(e) => setF({ ...f, sort_order: e.target.value })} />
          <div className="flex gap-2">
            <button className="wage-btn wage-btn-primary">Save</button>
            <button type="button" className="wage-btn wage-btn-ghost" onClick={() => setF(null)}>Cancel</button>
          </div>
        </form>
      )}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="wage-card flex items-center justify-between p-4">
            <span className="font-semibold">{r.question}</span>
            <div className="flex gap-2">
              <button className="wage-btn wage-btn-ghost !py-1 !px-3 text-sm" onClick={() => setF(r)}>Edit</button>
              <button className="wage-btn wage-btn-ghost !py-1 !px-3 text-sm" onClick={async () => { if (confirm('Delete?')) { await supabase.rpc('ws_admin_delete_faq', { p_id: r.id }); reload(); } }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TIERS = ['free', 'creator', 'pro', 'elite', 'unlimited'];

function UsersAdmin() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.rpc('ws_admin_list_users', { p_search: q || null });
    if (error) setErr(error.message); else setRows((data as any[]) ?? []);
  }
  useEffect(() => { load(); }, []);

  async function setTier(u: any, tier: string) {
    const { data, error } = await supabase.rpc('ws_admin_set_tier', { p_user_id: u.id, p_tier: tier });
    if (error) return alert(error.message);
    setNote(`${u.username || u.email}  ${tier}`);
    if ((data as any)?.discord_id) {
      apiFetch('discord-sync-user', { method: 'POST', body: JSON.stringify({ user_id: u.id }) })
        .then(() => setNote(`${u.username || u.email}  ${tier} · Discord role synced`)).catch(() => {});
    }
    load();
  }
  async function suspend(u: any) {
    await supabase.rpc('ws_admin_suspend', { p_user_id: u.id, p_suspended: !u.suspended });
    load();
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Search email / username..." className="input max-w-sm" />
        <button className="wage-btn wage-btn-ghost" onClick={load}>Search</button>
      </div>
      {err && <p className="text-red-300">{err}</p>}
      {note && <p className="mb-3 text-sm text-green-400">{note}</p>}
      <div className="space-y-2">
        {rows.map((u) => (
          <div key={u.id} className="wage-card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{u.display_name || u.username || u.email} {u.suspended && <span className="text-xs text-red-400">(suspended)</span>}</div>
              <div className="truncate text-xs text-neutral-500">{u.email} · {u.role} · {u.points} pts {u.discord_linked ? '· 🎮 Discord' : ''} {u.membership ? `· ${u.membership}` : ''}{u.trial_ends_at ? ` (trial${u.trial_ends_at})` : ''}</div>
            </div>
            <select value={u.tier} onChange={(e) => setTier(u, e.target.value)} className="input !w-auto !py-1.5 text-sm">
              {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="wage-btn wage-btn-ghost !py-1.5 !px-3 text-sm" onClick={() => suspend(u)}>{u.suspended ? 'Unsuspend' : 'Suspend'}</button>
          </div>
        ))}
        {rows.length === 0 && !err && <p className="text-neutral-400">No users.</p>}
      </div>
    </div>
  );
}

function SubsAdmin() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { supabase.rpc('ws_admin_list_subscriptions').then(({ data, error }) => error ? setErr(error.message) : setRows((data as any[]) ?? [])); }, []);
  if (err) return <p className="text-red-300">{err}</p>;
  return (
    <div className="space-y-2">
      {rows.length === 0 ? <p className="text-neutral-400">No active subscriptions or trials.</p> : rows.map((s, i) => (
        <div key={i} className="wage-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div><span className="font-semibold">{s.email}</span> <span className="text-xs uppercase text-neutral-500">{s.plan} · {s.status}</span></div>
          <div className="text-xs text-neutral-500">
            {s.winback ? 'win-back · ' : ''}{s.source || ''} {s.trial_ends_at ? `· trial${s.trial_ends_at}` : s.period_end ? `· renews ${s.period_end}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

function ShopAdmin() {
  const { rows, err, reload } = useList('ws_admin_list_shop');
  const [f, setF] = useState<any>(null);
  const TYPES = ['badge', 'username_color', 'profile_frame', 'vip_access', 'membership_days', 'role'];
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc('ws_admin_save_shop_item', {
      p_id: f.id || null, p_name: f.name, p_description: f.description || null,
      p_point_cost: parseInt(f.point_cost || '0', 10), p_item_type: f.item_type || 'badge', p_is_active: f.is_active !== false,
    });
    if (error) return alert(error.message);
    setF(null); reload();
  }
  return (
    <div>
      <button className="wage-btn wage-btn-primary mb-4" onClick={() => setF({ item_type: 'badge', is_active: true })}>+ New reward</button>
      {err && <p className="text-red-300">{err}</p>}
      {f && (
        <form onSubmit={save} className="wage-card mb-6 flex flex-col gap-3 p-5">
          <input required placeholder="Name" className="input" value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input placeholder="Description" className="input" value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <input placeholder="Point cost" className="input" value={f.point_cost ?? ''} onChange={(e) => setF({ ...f, point_cost: e.target.value })} />
          <select className="input" value={f.item_type} onChange={(e) => setF({ ...f, item_type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <div className="flex gap-2"><button className="wage-btn wage-btn-primary">Save</button><button type="button" className="wage-btn wage-btn-ghost" onClick={() => setF(null)}>Cancel</button></div>
        </form>
      )}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="wage-card flex items-center justify-between p-4">
            <span className="font-semibold">{r.name} · {r.point_cost} pts <span className="text-xs uppercase text-neutral-500">{r.item_type}{r.is_active ? '' : ' · hidden'}</span></span>
            <div className="flex gap-2">
              <button className="wage-btn wage-btn-ghost !py-1 !px-3 text-sm" onClick={() => setF(r)}>Edit</button>
              <button className="wage-btn wage-btn-ghost !py-1 !px-3 text-sm" onClick={async () => { if (confirm('Delete?')) { await supabase.rpc('ws_admin_delete_shop_item', { p_id: r.id }); reload(); } }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
