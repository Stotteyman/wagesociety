import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { apiFetch } from '../../lib/api';
import { useRole } from '../../hooks/useRole';
import Avatar from '../../components/ui/Avatar';
import ProfileBadges, { type Badge } from '../../components/ui/ProfileBadges';

/**
 * Staff — recruiting, access, and onboarding in one place.
 *
 * Four sections, in the order the work actually happens:
 *
 *   Applications   who has asked to join the team, and the decision
 *   Roster         who is on it now, and how far through onboarding
 *   Discord roles  which Discord role means which website role
 *   Positions      what is open, and the checklist each one carries
 *
 * Hiring is one action rather than three. ws_admin_staff_decide(..., 'hired') grants the
 * role, hands over the badge and seeds the checklist together, because doing them
 * separately is how someone ends up with moderator access and no onboarding.
 */

/* ── shared ──────────────────────────────────────────────────────────────── */

function Notice({ tone, children }: { tone: 'error' | 'ok' | 'warn'; children: React.ReactNode }) {
  const skin =
    tone === 'error' ? 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'
    : tone === 'warn' ? 'border-wage-warning/40 bg-wage-warning/[0.08] text-wage-warning'
    : 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success';
  return <p role="status" className={`mb-4 border px-4 py-2.5 text-sm ${skin}`}>{children}</p>;
}

function Section({ title, children, action, note }: {
  title: string; children: React.ReactNode; action?: React.ReactNode; note?: string;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">{title}</h3>
        {action}
      </div>
      {note && <p className="mb-3 max-w-[74ch] text-[13px] text-wage-muted">{note}</p>}
      {children}
    </section>
  );
}

const fmtDate = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};

const REASONS: Record<string, string> = {
  above_your_level: 'That position grants a role at or above your own, so you cannot hire into it.',
  target_outranks_you: 'That person outranks you. A superadmin has to make this change.',
  protected_account: 'That is an owner account and is deliberately unchangeable.',
  locked: 'Their role is locked. A superadmin has to unlock it first.',
  invalid_role: 'That is not a role.',
  no_guild: 'No Discord server is connected.',
};
const explain = (r?: string | null) => (r && REASONS[r]) || r || 'That did not work.';

/** Load an RPC into state, surfacing failures rather than blank data. */
function useRpc<T>(fn: string, args?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const key = JSON.stringify(args ?? {});
  const reload = useCallback(async () => {
    setBusy(true);
    const { data: d, error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { setErr(error.message); setData(null); }
    else { setErr(null); setData(d as T); }
  }, [fn, key]);
  useEffect(() => { reload(); }, [reload]);
  return { data, err, busy, reload };
}

/* ── applications ────────────────────────────────────────────────────────── */

type Application = {
  id: string; user_id: string; email: string; username: string | null; display_name: string | null;
  avatar_url: string | null; member_since: string; position: string; title: string; status: string;
  answers: Record<string, string>; review_note: string | null; created_at: string; decided_at: string | null;
  reviewer: string | null; discord_linked: boolean; current_role: string;
};

const STATUS_SKIN: Record<string, string> = {
  submitted: 'border-wage-amber/50 text-wage-amber-2',
  reviewing: 'border-wage-amber/50 text-wage-amber-2',
  interview: 'border-wage-amber/50 text-wage-amber-2',
  hired: 'border-wage-success/50 text-wage-success',
  rejected: 'border-wage-error/50 text-wage-error',
  withdrawn: 'border-wage-line-hi text-wage-muted-2',
};

/** The steps an application can move to from where it is now. */
const NEXT: Record<string, string[]> = {
  submitted: ['reviewing', 'rejected'],
  reviewing: ['interview', 'hired', 'rejected'],
  interview: ['hired', 'rejected'],
  hired: [],
  rejected: ['reviewing'],
  withdrawn: [],
};

const ACTION_LABEL: Record<string, string> = {
  reviewing: 'Start review',
  interview: 'Move to interview',
  hired: 'Hire',
  rejected: 'Reject',
};

function Applications({ onHired }: { onHired: () => void }) {
  const [filter, setFilter] = useState<string>('open');
  const { data, err, busy, reload } = useRpc<Application[]>('ws_admin_staff_applications');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function decide(a: Application, status: string) {
    setWorking(`${a.id}:${status}`); setMsg(null);
    const { data: res, error } = await supabase.rpc('ws_admin_staff_decide', {
      p_id: a.id, p_status: status, p_note: notes[a.id] || null,
    });
    setWorking(null);
    if (error) return setMsg({ tone: 'error', text: error.message });
    if (res?.ok === false) return setMsg({ tone: 'error', text: explain(res.reason) });
    setMsg({
      tone: 'ok',
      text: status === 'hired'
        ? `${a.username || a.email} hired as ${a.title}. Role granted, badge given, ${res.tasks_seeded} onboarding steps queued.`
        : `Moved to ${status}.`,
    });
    await reload();
    if (status === 'hired') onHired();
  }

  const rows = (data ?? []).filter((a) =>
    filter === 'all' ? true
    : filter === 'open' ? ['submitted', 'reviewing', 'interview'].includes(a.status)
    : a.status === filter);

  const openCount = (data ?? []).filter((a) => ['submitted', 'reviewing', 'interview'].includes(a.status)).length;

  return (
    <Section
      title={`Applications${openCount ? ` — ${openCount} open` : ''}`}
      action={
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input !w-auto !py-1.5 text-sm">
          <option value="open">Open</option>
          <option value="all">All</option>
          <option value="hired">Hired</option>
          <option value="rejected">Rejected</option>
        </select>
      }
    >
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {err && <Notice tone="error">{err}</Notice>}
      {busy && !data && <p className="text-wage-muted">Loading...</p>}

      {data && rows.length === 0 && (
        <div className="wage-card wage-card-sm px-5 py-8 text-center text-[15px] text-wage-muted">
          {filter === 'open' ? 'Nothing waiting on a decision.' : 'Nothing here.'}
        </div>
      )}

      <div className="space-y-2.5">
        {rows.map((a) => (
          <div key={a.id} className="wage-card wage-card-sm p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar name={a.display_name || a.username || a.email} src={a.avatar_url} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">{a.display_name || a.username || a.email}</span>
                  <span className={`wage-chip ${STATUS_SKIN[a.status] || ''}`}>{a.status}</span>
                  <span className="wage-chip">{a.title}</span>
                  {!a.discord_linked && (
                    <span className="wage-chip border-wage-warning/50 text-wage-warning">no discord</span>
                  )}
                </div>
                <div className="mt-1 truncate font-mono text-[11.5px] text-wage-muted-2">
                  {a.email} / member since {fmtDate(a.member_since)} / applied {fmtDate(a.created_at)}
                  {a.reviewer ? ` / last touched by ${a.reviewer}` : ''}
                </div>
              </div>
              <button
                onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                className="font-mono text-[11px] uppercase tracking-[0.12em] text-wage-muted-2 underline hover:text-wage-paper"
              >
                {expanded === a.id ? 'Hide' : 'Read'}
              </button>
            </div>

            {expanded === a.id && (
              <div className="mt-4 border-t border-wage-line pt-4">
                {Object.keys(a.answers || {}).length === 0 ? (
                  <p className="text-[13px] text-wage-muted">They left the form blank.</p>
                ) : (
                  <dl className="grid gap-3">
                    {Object.entries(a.answers).map(([q, ans]) => (
                      <div key={q}>
                        <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">
                          {q.replace(/_/g, ' ')}
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap text-[13.5px]">{String(ans)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {a.review_note && (
                  <p className="mt-3 text-[13px] text-wage-muted">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.14em]">Note</span> — {a.review_note}
                  </p>
                )}
              </div>
            )}

            {NEXT[a.status]?.length > 0 && (
              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                <input
                  value={notes[a.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
                  placeholder="Note for the record (optional)"
                  className="input !w-64 !py-1.5 text-sm"
                />
                {NEXT[a.status].map((s) => (
                  <button
                    key={s}
                    disabled={working === `${a.id}:${s}`}
                    onClick={() => decide(a, s)}
                    className={`wage-btn !px-3.5 !py-1.5 text-sm ${
                      s === 'hired' ? 'wage-btn-primary' : 'wage-btn-ghost'
                    }`}
                  >
                    {working === `${a.id}:${s}` ? '...' : ACTION_LABEL[s] || s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ── roster ──────────────────────────────────────────────────────────────── */

type RosterRow = {
  user_id: string; email: string; username: string | null; display_name: string | null;
  avatar_url: string | null; role: string; source: string; locked: boolean; since: string;
  discord_linked: boolean; tasks_total: number; tasks_done: number;
};

function Roster({ reloadKey }: { reloadKey: number }) {
  const { data, err, busy, reload } = useRpc<RosterRow[]>('ws_admin_staff_roster');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (reloadKey) reload(); }, [reloadKey]);

  return (
    <Section
      title="Staff roster"
      note="Everyone holding staff or above. A role marked 'from discord' is kept in step by the sync; one marked 'by hand' is not, and the sync will not undo it."
    >
      {err && <Notice tone="error">{err}</Notice>}
      {busy && !data && <p className="text-wage-muted">Loading...</p>}
      {data && data.length === 0 && (
        <div className="wage-card wage-card-sm px-5 py-8 text-center text-[15px] text-wage-muted">
          Nobody holds a staff role yet.
        </div>
      )}
      <div className="space-y-2.5">
        {(data ?? []).map((r) => (
          <div key={r.user_id} className="wage-card wage-card-sm p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar name={r.display_name || r.username || r.email} src={r.avatar_url} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">{r.display_name || r.username || r.email}</span>
                  <span className="wage-chip">{r.role}</span>
                  <span className="wage-chip !text-[10.5px]">
                    {r.source === 'discord' ? 'from discord' : 'by hand'}
                  </span>
                  {r.locked && <span className="wage-chip border-wage-warning/50 text-wage-warning">locked</span>}
                  {!r.discord_linked && (
                    <span className="wage-chip border-wage-warning/50 text-wage-warning">no discord</span>
                  )}
                </div>
                <div className="mt-1 font-mono text-[11.5px] text-wage-muted-2">
                  {r.email} / since {fmtDate(r.since)} /{' '}
                  {r.tasks_total === 0
                    ? 'no onboarding checklist'
                    : `onboarding ${r.tasks_done}/${r.tasks_total}`}
                </div>
              </div>
              {r.tasks_total > 0 && (
                <button
                  onClick={() => setOpen(open === r.user_id ? null : r.user_id)}
                  className="font-mono text-[11px] uppercase tracking-[0.12em] text-wage-muted-2 underline hover:text-wage-paper"
                >
                  {open === r.user_id ? 'Hide' : 'Checklist'}
                </button>
              )}
            </div>
            {open === r.user_id && <Checklist userId={r.user_id} onChanged={reload} />}
          </div>
        ))}
      </div>
    </Section>
  );
}

type Task = { slug: string; title: string; detail: string; required: boolean; done_at: string | null; done_by: string | null };

function Checklist({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const { data, err, reload } = useRpc<Task[]>('ws_admin_staff_onboarding', { p_user_id: userId });
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(t: Task) {
    setBusy(t.slug);
    await supabase.rpc('ws_admin_staff_task_set', {
      p_user_id: userId, p_task_slug: t.slug, p_done: !t.done_at, p_note: null,
    });
    setBusy(null);
    await reload();
    onChanged();
  }

  if (err) return <Notice tone="error">{err}</Notice>;
  return (
    <ul className="mt-4 grid gap-1.5 border-t border-wage-line pt-4">
      {(data ?? []).map((t) => (
        <li key={t.slug} className="flex items-start gap-3">
          <button
            disabled={busy === t.slug}
            aria-label={`${t.done_at ? 'Unmark' : 'Mark'} ${t.title}`}
            onClick={() => toggle(t)}
            className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center border font-mono text-[12px] ${
              t.done_at
                ? 'border-wage-success/50 bg-wage-success/[0.12] text-wage-success'
                : 'border-wage-line-hi text-wage-muted-2 hover:border-wage-amber'
            }`}
          >
            {t.done_at ? '+' : ''}
          </button>
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold">
              {t.title}
              {!t.required && <span className="ml-2 wage-chip !text-[10px]">optional</span>}
            </div>
            {t.detail && <div className="text-[12.5px] text-wage-muted">{t.detail}</div>}
            {t.done_at && (
              <div className="font-mono text-[11px] text-wage-muted-2">
                {fmtDate(t.done_at)}{t.done_by ? ` · ${t.done_by}` : ''}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── discord role mapping ────────────────────────────────────────────────── */

type RoleMap = {
  guild_id: string | null;
  mappings: { guild_id: string; role_id: string; role_name: string | null; website_role: string; badge_slug: string | null; updated_at: string }[];
  seen_roles: { role_id: string; role_name: string }[];
};

type SyncResult = {
  note?: string; changed?: number; linked_accounts?: number; guild_members?: number;
  mapped_roles?: number;
  changes?: { username?: string | null; email?: string; action: string; reason?: string; from?: string; to?: string }[];
};

function DiscordRoles({ onSynced, canEdit }: { onSynced: () => void; canEdit: boolean }) {
  const { data, err, busy, reload } = useRpc<RoleMap>('ws_admin_discord_role_map');
  const [badges, setBadges] = useState<Badge[]>([]);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ role_id: '', role_name: '', website_role: 'staff', badge_slug: '' });

  useEffect(() => {
    supabase.rpc('ws_admin_list_badges').then(({ data: b }) => setBadges((b as Badge[]) ?? []));
  }, []);

  async function save() {
    setMsg(null);
    const { data: res, error } = await supabase.rpc('ws_admin_set_discord_role_map', {
      p_role_id: draft.role_id.trim(),
      p_role_name: draft.role_name.trim() || null,
      p_website_role: draft.website_role,
      p_badge_slug: draft.badge_slug || null,
      p_guild_id: null,
    });
    if (error) return setMsg({ tone: 'error', text: error.message });
    if (res?.ok === false) return setMsg({ tone: 'error', text: explain(res.reason) });
    setDraft({ role_id: '', role_name: '', website_role: 'staff', badge_slug: '' });
    setMsg({ tone: 'ok', text: 'Mapping saved. Run a preview to see what it would change.' });
    reload();
  }

  async function clear(roleId: string) {
    await supabase.rpc('ws_admin_set_discord_role_map', {
      p_role_id: roleId, p_role_name: null, p_website_role: null, p_badge_slug: null, p_guild_id: null,
    });
    reload();
  }

  async function sync(action: 'preview' | 'apply') {
    setSyncing(action); setMsg(null); setResult(null);
    try {
      const r = await apiFetch<SyncResult>('discord-staff-sync', {
        method: 'POST', body: JSON.stringify({ action }),
      });
      setResult(r);
      if (r.note) setMsg({ tone: 'warn', text: r.note });
      else setMsg({
        tone: 'ok',
        text: action === 'preview'
          ? `${r.changed} of ${r.linked_accounts} linked accounts would change.`
          : `${r.changed} of ${r.linked_accounts} linked accounts changed.`,
      });
      if (action === 'apply') onSynced();
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setSyncing(null);
    }
  }

  const mapped = new Set((data?.mappings ?? []).map((m) => m.role_id));
  const unmapped = (data?.seen_roles ?? [])
    .filter((r) => !mapped.has(r.role_id) && r.role_name)
    .sort((a, b) => a.role_name.localeCompare(b.role_name));

  return (
    <Section
      title="Discord roles → website access"
      note="The Discord server is where staff are actually appointed, so it is treated as the source of truth for the roles listed here. A website role granted by hand is left alone, and a locked role is never touched — the sync raises access, it does not overrule a decision."
      action={
        <div className="flex gap-2">
          <button disabled={!!syncing} onClick={() => sync('preview')} className="wage-btn wage-btn-ghost !px-3 !py-1.5 text-sm">
            {syncing === 'preview' ? 'Checking...' : 'Preview'}
          </button>
          <button disabled={!!syncing} onClick={() => sync('apply')} className="wage-btn wage-btn-primary !px-3 !py-1.5 text-sm">
            {syncing === 'apply' ? 'Syncing...' : 'Sync now'}
          </button>
        </div>
      }
    >
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {err && <Notice tone="error">{err}</Notice>}
      {busy && !data && <p className="text-wage-muted">Loading...</p>}

      {(data?.mappings ?? []).length === 0 ? (
        <p className="mb-4 text-[13px] text-wage-muted">
          Nothing is mapped yet, so the sync has nothing to do. Map a Discord role below.
        </p>
      ) : (
        <ul className="mb-4 grid gap-2">
          {data!.mappings.map((m) => (
            <li key={m.role_id} className="flex flex-wrap items-center justify-between gap-3 border border-wage-line px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[13.5px] font-semibold">{m.role_name || m.role_id}</span>
                <span className="text-wage-muted-2">→</span>
                <span className="wage-chip">{m.website_role}</span>
                {m.badge_slug && (
                  <span className="flex items-center gap-1.5">
                    <span className="text-wage-muted-2">+</span>
                    <ProfileBadges badges={badges.filter((b) => b.slug === m.badge_slug)} size={15} />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10.5px] text-wage-muted-2">{m.role_id}</span>
                {canEdit && (
                  <button
                    onClick={() => clear(m.role_id)}
                    className="font-mono text-[11px] uppercase tracking-[0.12em] text-wage-muted-2 underline hover:text-wage-error"
                  >
                    Unmap
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!canEdit ? (
        <p className="text-[12.5px] text-wage-muted">
          Changing the mapping is an admin action — it decides what a Discord role is worth
          here. You can still preview and run the sync.
        </p>
      ) : (
      <div className="wage-card wage-card-sm flex flex-wrap items-end gap-2.5 p-4">
        {/* Real role names come from the guild snapshot, so nobody has to hunt for a
            snowflake in Discord's developer mode. Free entry stays for roles created
            since the last snapshot. */}
        <label className="grid gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">Discord role</span>
          <select
            value={draft.role_id}
            onChange={(e) => {
              const hit = unmapped.find((r) => r.role_id === e.target.value);
              setDraft({ ...draft, role_id: e.target.value, role_name: hit?.role_name || '' });
            }}
            className="input !w-auto !py-1.5 text-sm"
          >
            <option value="">Pick a role...</option>
            {unmapped.map((r) => <option key={r.role_id} value={r.role_id}>{r.role_name}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">or role ID</span>
          <input
            value={draft.role_id}
            onChange={(e) => setDraft({ ...draft, role_id: e.target.value })}
            placeholder="1508994738207064184"
            className="input !w-52 !py-1.5 font-mono text-sm"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">Website role</span>
          <select
            value={draft.website_role}
            onChange={(e) => setDraft({ ...draft, website_role: e.target.value })}
            className="input !w-auto !py-1.5 text-sm"
          >
            <option value="staff">staff</option>
            <option value="manager">manager</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">Badge (optional)</span>
          <select
            value={draft.badge_slug}
            onChange={(e) => setDraft({ ...draft, badge_slug: e.target.value })}
            className="input !w-auto !py-1.5 text-sm"
          >
            <option value="">none</option>
            {badges.map((b) => <option key={b.slug} value={b.slug}>{b.label}</option>)}
          </select>
        </label>
        <button disabled={!draft.role_id.trim()} onClick={save} className="wage-btn wage-btn-primary !px-3.5 !py-1.5 text-sm">
          Map
        </button>
      </div>
      )}

      {result?.changes && result.changes.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-wage-muted-2">
            {result.guild_members != null && `${result.guild_members} guild members · `}
            {result.linked_accounts} linked accounts
          </p>
          <ul className="grid gap-1">
            {result.changes.map((c, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2.5 font-mono text-[11.5px]">
                <span className={
                  c.action === 'promote' ? 'text-wage-success'
                  : c.action === 'demote' ? 'text-wage-warning'
                  : 'text-wage-muted-2'
                }>
                  {c.action}
                </span>
                <span className="text-wage-paper">{c.username || c.email}</span>
                {c.from && c.to && <span className="text-wage-amber-2">{c.from} → {c.to}</span>}
                {c.reason && <span className="text-wage-muted-2">{c.reason.replace(/_/g, ' ')}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

/* ── positions ───────────────────────────────────────────────────────────── */

type Position = {
  slug: string; title: string; blurb: string; responsibilities: string[]; requirements: string[];
  time_commitment: string | null; website_role: string; badge_slug: string | null;
  is_open: boolean; sort_order: number; open_applications: number;
};
type TaskDef = {
  slug: string; title: string; detail: string; position_slug: string | null;
  is_required: boolean; is_active: boolean; sort_order: number;
};

function Positions({ canEdit }: { canEdit: boolean }) {
  const { data, err, busy, reload } = useRpc<{ positions: Position[]; tasks: TaskDef[] }>('ws_admin_list_positions');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [edit, setEdit] = useState<Partial<Position> | null>(null);

  async function save() {
    if (!edit?.slug || !edit?.title) return;
    setMsg(null);
    const { data: res, error } = await supabase.rpc('ws_admin_save_position', {
      p_slug: edit.slug,
      p_title: edit.title,
      p_blurb: edit.blurb || '',
      // Textareas are one item per line: a list of bullet points is what this is, and
      // asking anyone to type JSON into an admin form is how it stops being edited.
      p_responsibilities: (edit.responsibilities as unknown as string[]) ?? [],
      p_requirements: (edit.requirements as unknown as string[]) ?? [],
      p_time_commitment: edit.time_commitment || null,
      p_website_role: edit.website_role || 'staff',
      p_badge_slug: edit.badge_slug || null,
      p_is_open: edit.is_open !== false,
      p_sort_order: edit.sort_order ?? 100,
    });
    if (error) return setMsg({ tone: 'error', text: error.message });
    if (res?.ok === false) return setMsg({ tone: 'error', text: explain(res.reason) });
    setEdit(null);
    setMsg({ tone: 'ok', text: 'Position saved.' });
    reload();
  }

  async function toggleOpen(p: Position) {
    await supabase.rpc('ws_admin_save_position', {
      p_slug: p.slug, p_title: p.title, p_blurb: p.blurb,
      p_responsibilities: p.responsibilities, p_requirements: p.requirements,
      p_time_commitment: p.time_commitment, p_website_role: p.website_role,
      p_badge_slug: p.badge_slug, p_is_open: !p.is_open, p_sort_order: p.sort_order,
    });
    reload();
  }

  const lines = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean);

  return (
    <Section
      title="Positions"
      note="What appears on /join-the-team, and what being hired into each one grants. Closing a position hides it from the public page; applications already in flight are untouched."
      action={canEdit && (
        <button
          onClick={() => setEdit({ website_role: 'staff', is_open: true, sort_order: 100, responsibilities: [], requirements: [] })}
          className="wage-btn wage-btn-ghost !px-3 !py-1.5 text-sm"
        >
          New position
        </button>
      )}
    >
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {err && <Notice tone="error">{err}</Notice>}
      {busy && !data && <p className="text-wage-muted">Loading...</p>}

      {edit && (
        <div className="wage-card mb-5 grid gap-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              placeholder="slug (helper, moderator...)"
              value={edit.slug || ''}
              onChange={(e) => setEdit({ ...edit, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
              className="input font-mono text-sm"
            />
            <input
              placeholder="Title"
              value={edit.title || ''}
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              className="input"
            />
          </div>
          <textarea
            placeholder="What this role is, in a sentence or two"
            rows={2}
            value={edit.blurb || ''}
            onChange={(e) => setEdit({ ...edit, blurb: e.target.value })}
            className="input"
          />
          <textarea
            placeholder="Responsibilities — one per line"
            rows={3}
            value={(edit.responsibilities ?? []).join('\n')}
            onChange={(e) => setEdit({ ...edit, responsibilities: lines(e.target.value) })}
            className="input"
          />
          <textarea
            placeholder="Requirements — one per line"
            rows={3}
            value={(edit.requirements ?? []).join('\n')}
            onChange={(e) => setEdit({ ...edit, requirements: lines(e.target.value) })}
            className="input"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              placeholder="Time commitment"
              value={edit.time_commitment || ''}
              onChange={(e) => setEdit({ ...edit, time_commitment: e.target.value })}
              className="input"
            />
            <select
              value={edit.website_role || 'staff'}
              onChange={(e) => setEdit({ ...edit, website_role: e.target.value })}
              className="input"
            >
              <option value="staff">grants staff</option>
              <option value="manager">grants manager</option>
              <option value="admin">grants admin</option>
            </select>
            <label className="flex items-center gap-2 text-[13.5px]">
              <input
                type="checkbox"
                checked={edit.is_open !== false}
                onChange={(e) => setEdit({ ...edit, is_open: e.target.checked })}
              />
              Open for applications
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="wage-btn wage-btn-primary">Save</button>
            <button onClick={() => setEdit(null)} className="wage-btn wage-btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        {(data?.positions ?? []).map((p) => (
          <div key={p.slug} className="wage-card wage-card-sm flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{p.title}</span>
                <span className="wage-chip">grants {p.website_role}</span>
                {!p.is_open && <span className="wage-chip border-wage-line-hi text-wage-muted-2">closed</span>}
                {p.open_applications > 0 && (
                  <span className="wage-chip border-wage-amber/50 text-wage-amber-2">
                    {p.open_applications} waiting
                  </span>
                )}
              </div>
              <p className="mt-1 max-w-[70ch] text-[13px] text-wage-muted">{p.blurb}</p>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <button onClick={() => toggleOpen(p)} className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm">
                  {p.is_open ? 'Close' : 'Reopen'}
                </button>
                <button onClick={() => setEdit(p)} className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm">Edit</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {(data?.tasks ?? []).length > 0 && (
        <div className="mt-6">
          <h4 className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">
            Onboarding checklist
          </h4>
          <p className="mb-3 max-w-[70ch] text-[13px] text-wage-muted">
            Seeded onto a new hire the moment they are hired. A step with no position applies to everyone.
          </p>
          <ul className="grid gap-1.5">
            {data!.tasks.map((t) => (
              <li key={t.slug} className="flex flex-wrap items-center gap-2.5 border border-wage-line px-3.5 py-2 text-[13.5px]">
                <span className="font-semibold">{t.title}</span>
                {t.position_slug && <span className="wage-chip !text-[10.5px]">{t.position_slug} only</span>}
                {!t.is_required && <span className="wage-chip !text-[10.5px]">optional</span>}
                {!t.is_active && <span className="wage-chip !text-[10.5px] text-wage-muted-2">retired</span>}
                <span className="truncate text-[12.5px] text-wage-muted">{t.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

/* ── the tab ─────────────────────────────────────────────────────────────── */

export function StaffTab() {
  // Hiring and syncing both change the roster, so it is refreshed by a counter rather
  // than by each section guessing when its neighbour has done something.
  const [rosterKey, setRosterKey] = useState(0);
  const bump = () => setRosterKey((n) => n + 1);

  // This tab is open to managers, but defining what a position grants and what a Discord
  // role is worth are admin decisions — ws_admin_save_position and
  // ws_admin_set_discord_role_map both require it. Hiding the controls beats offering a
  // button that only ever returns forbidden.
  const { atLeast } = useRole();
  const canEdit = atLeast('admin');

  return (
    <div className="grid gap-10">
      <Applications onHired={bump} />
      <Roster reloadKey={rosterKey} />
      <DiscordRoles onSynced={bump} canEdit={canEdit} />
      <Positions canEdit={canEdit} />
    </div>
  );
}
