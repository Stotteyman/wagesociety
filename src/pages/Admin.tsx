import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { useRole } from '../hooks/useRole';
import PageHeader from '../components/ui/PageHeader';

type Tab = 'overview' | 'users' | 'subs' | 'store' | 'blog' | 'merch' | 'faq';

const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['users', 'Users'],
  ['subs', 'Subscriptions'],
  ['store', 'Point Store'],
  ['blog', 'Blog'],
  ['merch', 'Merch'],
  ['faq', 'FAQ'],
];

/* ── shared bits ─────────────────────────────────────────────────────────── */

/** Inline status line. Replaces alert() so a failure never blocks the page. */
function Notice({ tone, children }: { tone: 'error' | 'ok'; children: React.ReactNode }) {
  const skin =
    tone === 'error'
      ? 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'
      : 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success';
  return (
    <p role="status" className={`mb-4 border px-4 py-2.5 text-sm ${skin}`}>
      {children}
    </p>
  );
}

/**
 * Two-step delete. The first click arms it, the second commits, and it disarms
 * itself after a few seconds. Native confirm() dialogs are easy to click past;
 * this keeps the decision on the row you are actually deleting.
 */
function DeleteButton({ onDelete }: { onDelete: () => Promise<void> | void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      onClick={() => (armed ? (setArmed(false), onDelete()) : setArmed(true))}
      className={`wage-btn !px-3 !py-1 text-sm ${armed ? 'wage-btn-primary' : 'wage-btn-ghost'}`}
    >
      {armed ? 'Confirm' : 'Delete'}
    </button>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="wage-card wage-card-sm px-5 py-10 text-center text-[15px] text-wage-muted">
      {children}
    </div>
  );
}

function Loading() {
  return <p className="text-wage-muted">Loading...</p>;
}

/** Dates arrive as ISO strings; show them short, and never crash on a bad one. */
function fmtDate(v?: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ── page ────────────────────────────────────────────────────────────────── */

export default function Admin() {
  const { loading, atLeast } = useRole();
  const [tab, setTab] = useState<Tab>('overview');

  if (loading) return <p className="p-16 text-center text-wage-muted">Loading...</p>;
  if (!atLeast('staff')) {
    return (
      <section className="mx-auto max-w-xl px-5 py-24 text-center">
        <h1 className="wage-cut text-[28px]">Staff only</h1>
        <p className="mt-3 text-wage-muted">This area is limited to W.A.G.E. staff accounts.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-5 py-14">
      <PageHeader eyebrow="Staff" title="Admin" lede="Members, subscriptions and everything the site publishes." />

      <nav className="mt-9 flex flex-wrap border-b border-wage-line">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-current={tab === t ? 'page' : undefined}
            className={`relative px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] transition-colors ${
              tab === t ? 'text-wage-amber-2' : 'text-wage-muted-2 hover:text-wage-paper'
            }`}
          >
            {label}
            {tab === t && <span aria-hidden="true" className="absolute inset-x-3 -bottom-px h-[2px] bg-wage-amber" />}
          </button>
        ))}
      </nav>

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

/* ── overview ────────────────────────────────────────────────────────────── */

function Overview() {
  const [o, setO] = useState<Record<string, number> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    supabase.rpc('ws_admin_overview').then(({ data, error }) => (error ? setErr(error.message) : setO(data as any)));
  }, []);

  if (err) return <Notice tone="error">{err}</Notice>;
  if (!o) return <Loading />;

  // Grouped so the people numbers read first and the content numbers second.
  const groups: [string, [string, string][]][] = [
    ['Members', [['Creators', 'creators'], ['Active members', 'memberships'], ['Subscribers', 'subscribers']]],
    ['Content', [['Published posts', 'published'], ['Blog (all)', 'blog_posts'], ['Merch', 'merch'], ['FAQ', 'faq']]],
  ];

  return (
    <div className="grid gap-8">
      {groups.map(([heading, tiles]) => (
        <div key={heading}>
          <div className="wage-eyebrow-mute mb-3 font-mono text-[10.5px] uppercase tracking-[0.16em]">{heading}</div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {tiles.map(([label, k]) => (
              <div key={k} className="wage-card wage-card-sm px-4 py-5">
                <div className="wage-num text-[30px] leading-none text-wage-amber-2">{o[k] ?? 0}</div>
                <div className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-wage-muted-2">{label}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── list helper ─────────────────────────────────────────────────────────── */

function useList(rpc: string) {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const reload = () =>
    supabase.rpc(rpc).then(({ data, error }) => {
      setReady(true);
      if (error) setErr(error.message);
      else { setErr(null); setRows((data as any[]) ?? []); }
    });
  useEffect(() => { reload(); }, []);
  return { rows, err, ready, reload, setErr };
}

/** Shared shell for the four content editors: they differ only in their fields. */
function EditorShell({
  newLabel, err, editing, onNew, onCancel, onSubmit, children, list,
}: {
  newLabel: string;
  err: string | null;
  editing: boolean;
  onNew: () => void;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
  list: React.ReactNode;
}) {
  return (
    <div>
      <button className="wage-btn wage-btn-primary mb-5" onClick={onNew}>{newLabel}</button>
      {err && <Notice tone="error">{err}</Notice>}
      {editing && (
        <form onSubmit={onSubmit} className="wage-card mb-6 flex flex-col gap-3 p-5">
          {children}
          <div className="mt-1 flex gap-2">
            <button className="wage-btn wage-btn-primary">Save</button>
            <button type="button" className="wage-btn wage-btn-ghost" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      )}
      <div className="space-y-2.5">{list}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="wage-card wage-card-sm flex flex-wrap items-center justify-between gap-3 p-4">{children}</div>;
}

/* ── blog ────────────────────────────────────────────────────────────────── */

function BlogAdmin() {
  const { rows, err, ready, reload, setErr } = useList('ws_admin_list_blog');
  const [f, setF] = useState<any>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc('ws_admin_save_blog', {
      p_id: f.id || null, p_slug: f.slug, p_title: f.title, p_excerpt: f.excerpt || null,
      p_body: f.body || null, p_cover: f.cover_image_url || null, p_status: f.status || 'draft',
    });
    if (error) return setErr(error.message);
    setF(null); reload();
  }

  return (
    <EditorShell
      newLabel="New post" err={err} editing={!!f}
      onNew={() => setF({ status: 'draft' })} onCancel={() => setF(null)} onSubmit={save}
      list={
        ready && rows.length === 0 ? <EmptyState>No posts yet.</EmptyState> :
        rows.map((r) => (
          <Row key={r.id}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="truncate font-semibold">{r.title}</span>
              <span className="wage-chip">{r.status}</span>
            </div>
            <div className="flex gap-2">
              <button className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm" onClick={() => setF(r)}>Edit</button>
              <DeleteButton onDelete={async () => { await supabase.rpc('ws_admin_delete_blog', { p_id: r.id }); reload(); }} />
            </div>
          </Row>
        ))
      }
    >
      <input required placeholder="Title" className="input" value={f?.title || ''} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <input required placeholder="slug (url-friendly)" className="input" value={f?.slug || ''} onChange={(e) => setF({ ...f, slug: e.target.value })} />
      <input placeholder="Excerpt" className="input" value={f?.excerpt || ''} onChange={(e) => setF({ ...f, excerpt: e.target.value })} />
      <input placeholder="Cover image URL" className="input" value={f?.cover_image_url || ''} onChange={(e) => setF({ ...f, cover_image_url: e.target.value })} />
      <textarea placeholder="Body" rows={6} className="input" value={f?.body || ''} onChange={(e) => setF({ ...f, body: e.target.value })} />
      <select className="input" value={f?.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>
    </EditorShell>
  );
}

/* ── merch ───────────────────────────────────────────────────────────────── */

function MerchAdmin() {
  const { rows, err, ready, reload, setErr } = useList('ws_admin_list_merch');
  const [f, setF] = useState<any>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc('ws_admin_save_merch', {
      p_id: f.id || null, p_name: f.name, p_description: f.description || null,
      p_price_cents: Math.round(parseFloat(f.price || '0') * 100), p_image_url: f.image_url || null,
      p_url: f.url || null, p_is_active: f.is_active !== false, p_sort_order: parseInt(f.sort_order || '0', 10),
    });
    if (error) return setErr(error.message);
    setF(null); reload();
  }

  return (
    <EditorShell
      newLabel="New item" err={err} editing={!!f}
      onNew={() => setF({ is_active: true })} onCancel={() => setF(null)} onSubmit={save}
      list={
        ready && rows.length === 0 ? <EmptyState>No merch yet.</EmptyState> :
        rows.map((r) => (
          <Row key={r.id}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="truncate font-semibold">{r.name}</span>
              <span className="wage-num text-[13px] text-wage-amber-2">${(r.price_cents / 100).toFixed(2)}</span>
            </div>
            <div className="flex gap-2">
              <button className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm" onClick={() => setF(r)}>Edit</button>
              <DeleteButton onDelete={async () => { await supabase.rpc('ws_admin_delete_merch', { p_id: r.id }); reload(); }} />
            </div>
          </Row>
        ))
      }
    >
      <input required placeholder="Name" className="input" value={f?.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input placeholder="Description" className="input" value={f?.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <input placeholder="Price (e.g. 25.00)" className="input"
        value={f?.price ?? (f?.price_cents != null ? (f.price_cents / 100).toString() : '')}
        onChange={(e) => setF({ ...f, price: e.target.value })} />
      <input placeholder="Image URL" className="input" value={f?.image_url || ''} onChange={(e) => setF({ ...f, image_url: e.target.value })} />
      <input placeholder="Buy URL" className="input" value={f?.url || ''} onChange={(e) => setF({ ...f, url: e.target.value })} />
    </EditorShell>
  );
}

/* ── faq ─────────────────────────────────────────────────────────────────── */

function FaqAdmin() {
  const { rows, err, ready, reload, setErr } = useList('ws_admin_list_faq');
  const [f, setF] = useState<any>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc('ws_admin_save_faq', {
      p_id: f.id || null, p_question: f.question, p_answer: f.answer,
      p_sort_order: parseInt(f.sort_order || '0', 10), p_is_active: f.is_active !== false,
    });
    if (error) return setErr(error.message);
    setF(null); reload();
  }

  return (
    <EditorShell
      newLabel="New question" err={err} editing={!!f}
      onNew={() => setF({ is_active: true })} onCancel={() => setF(null)} onSubmit={save}
      list={
        ready && rows.length === 0 ? <EmptyState>No questions yet.</EmptyState> :
        rows.map((r) => (
          <Row key={r.id}>
            <span className="min-w-0 flex-1 truncate font-semibold">{r.question}</span>
            <div className="flex gap-2">
              <button className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm" onClick={() => setF(r)}>Edit</button>
              <DeleteButton onDelete={async () => { await supabase.rpc('ws_admin_delete_faq', { p_id: r.id }); reload(); }} />
            </div>
          </Row>
        ))
      }
    >
      <input required placeholder="Question" className="input" value={f?.question || ''} onChange={(e) => setF({ ...f, question: e.target.value })} />
      <textarea required placeholder="Answer" rows={3} className="input" value={f?.answer || ''} onChange={(e) => setF({ ...f, answer: e.target.value })} />
      <input placeholder="Sort order" className="input" value={f?.sort_order ?? ''} onChange={(e) => setF({ ...f, sort_order: e.target.value })} />
    </EditorShell>
  );
}

/* ── point store ─────────────────────────────────────────────────────────── */

function ShopAdmin() {
  const { rows, err, ready, reload, setErr } = useList('ws_admin_list_shop');
  const [f, setF] = useState<any>(null);
  const TYPES = ['badge', 'username_color', 'profile_frame', 'vip_access', 'membership_days', 'role'];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc('ws_admin_save_shop_item', {
      p_id: f.id || null, p_name: f.name, p_description: f.description || null,
      p_point_cost: parseInt(f.point_cost || '0', 10), p_item_type: f.item_type || 'badge',
      p_is_active: f.is_active !== false,
    });
    if (error) return setErr(error.message);
    setF(null); reload();
  }

  return (
    <EditorShell
      newLabel="New reward" err={err} editing={!!f}
      onNew={() => setF({ item_type: 'badge', is_active: true })} onCancel={() => setF(null)} onSubmit={save}
      list={
        ready && rows.length === 0 ? <EmptyState>No rewards yet.</EmptyState> :
        rows.map((r) => (
          <Row key={r.id}>
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="truncate font-semibold">{r.name}</span>
              <span className="wage-num text-[13px] text-wage-amber-2">{r.point_cost} pts</span>
              <span className="wage-chip">{r.item_type}</span>
              {!r.is_active && <span className="wage-chip">hidden</span>}
            </div>
            <div className="flex gap-2">
              <button className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm" onClick={() => setF(r)}>Edit</button>
              <DeleteButton onDelete={async () => { await supabase.rpc('ws_admin_delete_shop_item', { p_id: r.id }); reload(); }} />
            </div>
          </Row>
        ))
      }
    >
      <input required placeholder="Name" className="input" value={f?.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input placeholder="Description" className="input" value={f?.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <input placeholder="Point cost" className="input" value={f?.point_cost ?? ''} onChange={(e) => setF({ ...f, point_cost: e.target.value })} />
      <select className="input" value={f?.item_type} onChange={(e) => setF({ ...f, item_type: e.target.value })}>
        {TYPES.map((t) => <option key={t}>{t}</option>)}
      </select>
    </EditorShell>
  );
}

/* ── users ───────────────────────────────────────────────────────────────── */

const TIERS = ['free', 'creator', 'pro', 'elite', 'unlimited'];

function UsersAdmin() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  async function load() {
    const { data, error } = await supabase.rpc('ws_admin_list_users', { p_search: q || null });
    setReady(true);
    if (error) setErr(error.message);
    else { setErr(null); setRows((data as any[]) ?? []); }
  }
  useEffect(() => { load(); }, []);

  async function setTier(u: any, tier: string) {
    const who = u.username || u.email;
    const { data, error } = await supabase.rpc('ws_admin_set_tier', { p_user_id: u.id, p_tier: tier });
    if (error) return setErr(error.message);
    setNote(`${who} set to ${tier}.`);
    // Only worth calling the bot if this person actually has Discord linked.
    if ((data as any)?.discord_id) {
      apiFetch('discord-sync-user', { method: 'POST', body: JSON.stringify({ user_id: u.id }) })
        .then(() => setNote(`${who} set to ${tier}. Discord role synced.`))
        .catch(() => setNote(`${who} set to ${tier}, but the Discord role did not sync.`));
    }
    load();
  }

  async function suspend(u: any) {
    const { error } = await supabase.rpc('ws_admin_suspend', { p_user_id: u.id, p_suspended: !u.suspended });
    if (error) return setErr(error.message);
    setNote(`${u.username || u.email} ${u.suspended ? 'reinstated' : 'suspended'}.`);
    load();
  }

  return (
    <div>
      <div className="mb-5 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Search email or username"
          className="input max-w-sm"
        />
        <button className="wage-btn wage-btn-ghost" onClick={load}>Search</button>
      </div>

      {err && <Notice tone="error">{err}</Notice>}
      {note && <Notice tone="ok">{note}</Notice>}

      <div className="space-y-2.5">
        {rows.map((u) => (
          <div key={u.id} className="wage-card wage-card-sm flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span className="truncate font-semibold">{u.display_name || u.username || u.email}</span>
                {u.suspended && <span className="wage-chip border-wage-error/50 text-wage-error">suspended</span>}
                {u.discord_linked && <span className="wage-chip">discord</span>}
              </div>
              <div className="mt-1 truncate font-mono text-[11.5px] text-wage-muted-2">
                {u.email} / {u.role} / <span className="wage-num">{u.points}</span> pts
                {u.membership ? ` / ${u.membership}` : ''}
                {u.trial_ends_at ? ` / trial ends ${fmtDate(u.trial_ends_at)}` : ''}
              </div>
            </div>
            <select value={u.tier} onChange={(e) => setTier(u, e.target.value)} className="input !w-auto !py-1.5 text-sm">
              {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="wage-btn wage-btn-ghost !px-3 !py-1.5 text-sm" onClick={() => suspend(u)}>
              {u.suspended ? 'Unsuspend' : 'Suspend'}
            </button>
          </div>
        ))}
        {ready && rows.length === 0 && !err && (
          <EmptyState>{q ? `Nobody matches "${q}".` : 'No members yet.'}</EmptyState>
        )}
      </div>
    </div>
  );
}

/* ── subscriptions ───────────────────────────────────────────────────────── */

function SubsAdmin() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.rpc('ws_admin_list_subscriptions').then(({ data, error }) => {
      setReady(true);
      if (error) setErr(error.message);
      else setRows((data as any[]) ?? []);
    });
  }, []);

  if (err) return <Notice tone="error">{err}</Notice>;
  if (!ready) return <Loading />;
  if (rows.length === 0) return <EmptyState>No active subscriptions or trials.</EmptyState>;

  return (
    <div className="space-y-2.5">
      {rows.map((s, i) => (
        <Row key={i}>
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <span className="truncate font-semibold">{s.email}</span>
            <span className="wage-chip">{s.plan}</span>
            <span className={`wage-chip ${s.status === 'active' ? 'border-wage-success/50 text-wage-success' : ''}`}>
              {s.status}
            </span>
            {s.winback && <span className="wage-chip">win-back</span>}
          </div>
          <div className="font-mono text-[11.5px] text-wage-muted-2">
            {s.source ? `${s.source} ` : ''}
            {s.trial_ends_at ? `trial ends ${fmtDate(s.trial_ends_at)}` : s.period_end ? `renews ${fmtDate(s.period_end)}` : ''}
          </div>
        </Row>
      ))}
    </div>
  );
}
