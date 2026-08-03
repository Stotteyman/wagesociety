import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { apiFetch } from '../../lib/api';
import Avatar from '../../components/ui/Avatar';
import ProfileBadges, { type Badge } from '../../components/ui/ProfileBadges';
import { HANDLE_MIN, handleMessage, normaliseHandle } from '../../lib/handles';

/**
 * People management.
 *
 * The list used to be the whole feature: a tier dropdown and a suspend button per row.
 * Everything else about a member — what role they hold, whether it came from Discord or
 * was granted by hand, which badges they carry, how far through onboarding they are —
 * either lived somewhere else or nowhere.
 *
 * So the row stays a row, and opening one gives the whole picture with the controls
 * attached to it. Every control here is also gated in its RPC; what is hidden or
 * disabled below is a courtesy, never the boundary. `can_manage` comes back from
 * ws_admin_user_detail so the ladder is worked out in one place instead of being
 * re-derived, slightly differently, in the browser.
 */

const TIERS = ['free', 'creator', 'pro', 'elite', 'unlimited'];
const ROLES = ['member', 'staff', 'manager', 'admin', 'superadmin'];

const RANK: Record<string, number> = { guest: 0, member: 1, staff: 2, manager: 3, admin: 4, superadmin: 5 };

const REASONS: Record<string, string> = {
  above_your_level: 'That role is at or above your own — you cannot grant it.',
  target_outranks_you: 'That person outranks you. A superadmin has to make this change.',
  protected_account: 'That is an owner account and is deliberately unchangeable.',
  locked: 'That role is locked. A superadmin has to unlock it first.',
  invalid_role: 'That is not a role.',
  unknown_user: 'That account no longer exists.',
  not_held: 'They do not have that badge.',
  unknown_badge: 'That badge no longer exists, or is hidden.',
  unknown_channel: 'That channel no longer exists.',
  already_has_open_application: 'They have since applied again, and that application is still open.',
};
const explain = (reason?: string | null) => (reason && REASONS[reason]) || reason || 'That did not work.';

function Notice({ tone, children }: { tone: 'error' | 'ok'; children: React.ReactNode }) {
  const skin = tone === 'error'
    ? 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'
    : 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success';
  return <p role="status" className={`mb-4 border px-4 py-2.5 text-sm ${skin}`}>{children}</p>;
}

/** Local, and deliberately not components/ui/EmptyState: the admin one is a plain line,
 * not the titled block used on member-facing pages. */
function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="wage-card wage-card-sm px-5 py-10 text-center text-[15px] text-wage-muted">
      {children}
    </div>
  );
}

const fmtDate = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};
const fmtWhen = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">{label}</div>
      <div className="mt-1 text-[13.5px]">{children}</div>
    </div>
  );
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-t border-wage-line pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ── handle editing ──────────────────────────────────────────────────────── */

function HandleField({ user, onSave }: { user: any; onSave: (u: any, handle: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(user.username || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setValue(user.username || ''); }, [user.username]);

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] text-wage-amber-2">@{user.username || '—'}</span>
        <button
          onClick={() => setEditing(true)}
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-wage-muted-2 underline hover:text-wage-paper"
        >
          Edit
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[12px] text-wage-muted-2">@</span>
      <input
        value={value}
        onChange={(e) => setValue(normaliseHandle(e.target.value))}
        autoFocus spellCheck={false} maxLength={30}
        className="input !w-44 !py-1 font-mono text-sm"
      />
      <button
        disabled={busy || value === user.username || value.length < HANDLE_MIN}
        onClick={async () => { setBusy(true); const ok = await onSave(user, value); setBusy(false); if (ok) setEditing(false); }}
        className="wage-btn wage-btn-primary !px-3 !py-1 text-sm"
      >
        {busy ? 'Saving...' : 'Save'}
      </button>
      <button
        onClick={() => { setValue(user.username || ''); setEditing(false); }}
        className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm"
      >
        Cancel
      </button>
    </div>
  );
}

/* ── the detail panel ────────────────────────────────────────────────────── */

type Detail = {
  id: string; email: string; username: string | null; display_name: string | null;
  avatar_url: string | null; tier: string; suspended: boolean; points: number;
  created_at: string; last_seen_at: string | null; referral_code: string | null;
  total_referrals: number; referral_tier: string | null;
  role: string; role_source: string | null; role_locked: boolean; role_assigned_at: string | null;
  can_manage: boolean; protected: boolean;
  permissions: string[];
  badges: (Badge & { granted_at: string; note: string | null; granted_by: string | null })[];
  discord: { discord_id: string; username: string | null; linked_at: string; roles: string[] } | null;
  connections: { provider: string; handle: string | null; linked_at: string }[];
  memberships: { plan: string; status: string; cycle: string | null; trial_ends_at: string | null; period_end: string | null; source: string | null }[];
  application: { id: string; position: string; status: string; created_at: string; answers: Record<string, string>; review_note: string | null } | null;
  onboarding: { slug: string; title: string; detail: string; required: boolean; done_at: string | null }[];
  history: { action: string; actor: string; at: string; detail: Record<string, unknown> }[];
};

function UserDetail({
  userId, viewerRole, onClose, onChanged,
}: {
  userId: string;
  viewerRole: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [catalog, setCatalog] = useState<Badge[]>([]);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [grantSlug, setGrantSlug] = useState('');
  const [grantNote, setGrantNote] = useState('');
  const [roleReason, setRoleReason] = useState('');

  const viewerRank = RANK[viewerRole] ?? 0;
  // Mirrors the RPC gates exactly. ws_admin_set_tier is admin; ws_admin_suspend and
  // ws_admin_set_role are manager, bounded by the ladder they enforce themselves.
  const canSetTier = viewerRank >= 4;

  async function load() {
    const { data, error } = await supabase.rpc('ws_admin_user_detail', { p_user_id: userId });
    if (error) return setMsg({ tone: 'error', text: error.message });
    setD(data as Detail);
  }
  useEffect(() => { load(); }, [userId]);
  useEffect(() => {
    supabase.rpc('ws_admin_list_badges').then(({ data }) => setCatalog((data as Badge[]) ?? []));
  }, []);

  /** Every mutation lands here so the panel, the list behind it and the notice agree. */
  async function run(key: string, fn: () => PromiseLike<{ data: any; error: any }>, okText: string) {
    setBusy(key); setMsg(null);
    const { data, error } = await fn();
    setBusy(null);
    if (error) return setMsg({ tone: 'error', text: error.message });
    if (data && data.ok === false) return setMsg({ tone: 'error', text: explain(data.reason) });
    setMsg({ tone: 'ok', text: okText });
    await load();
    onChanged();
    return data;
  }

  if (!d) {
    return (
      <div className="wage-card p-6">
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        {!msg && <p className="text-wage-muted">Loading...</p>}
      </div>
    );
  }

  const name = d.display_name || d.username || d.email;
  const held = new Set(d.badges.map((b) => b.slug));
  // ws_admin_grant_badge refuses an inactive badge, so offering one only produces a
  // rejection after the click. The catalog deliberately still lists them for editing.
  const grantable = catalog.filter((b) => !held.has(b.slug) && (b as { is_active?: boolean }).is_active !== false);
  const doneCount = d.onboarding.filter((t) => t.done_at).length;

  return (
    <div className="wage-card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <Avatar name={name} src={d.avatar_url} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-[17px] font-bold">{name}</span>
              <ProfileBadges badges={d.badges} size={17} />
              {d.suspended && <span className="wage-chip border-wage-error/50 text-wage-error">suspended</span>}
              {d.protected && <span className="wage-chip">owner</span>}
            </div>
            <div className="mt-0.5 truncate font-mono text-[12px] text-wage-muted-2">{d.email}</div>
          </div>
        </div>
        <button className="wage-btn wage-btn-ghost !px-3 !py-1.5 text-sm" onClick={onClose}>Close</button>
      </div>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {d.protected && (
        <p className="mb-4 border border-wage-line-hi px-4 py-2.5 text-[13px] text-wage-muted">
          This is a hardcoded owner account. Its role cannot be changed from here by design —
          that is what stops the platform locking its own owner out.
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Handle"><HandleField user={d} onSave={saveHandle} /></Field>
        <Field label="Member since">{fmtDate(d.created_at)}</Field>
        <Field label="Last seen">{fmtWhen(d.last_seen_at)}</Field>
        <Field label="Points"><span className="wage-num text-wage-amber-2">{d.points ?? 0}</span></Field>
      </div>

      {/* ── access ── */}
      <div className="mt-6 grid gap-6">
        <Panel title="Access">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">Role</span>
              <select
                value={d.role}
                disabled={!d.can_manage || busy === 'role'}
                onChange={(e) => run('role',
                  () => supabase.rpc('ws_admin_set_role', {
                    p_user_id: d.id, p_role: e.target.value, p_reason: roleReason || null,
                  }),
                  `Role set to ${e.target.value}.`)}
                className="input !w-auto !py-1.5 text-sm"
              >
                {ROLES.map((r) => (
                  // Offering a role you cannot grant only produces a rejection after the click.
                  <option key={r} value={r} disabled={RANK[r] >= viewerRank && viewerRole !== 'superadmin'}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            {/* Tier is a paid entitlement, so ws_admin_set_tier stays at admin while role
                and suspension have dropped to manager. Disabled rather than hidden: a
                manager should be able to see what tier someone is on. */}
            <label className="grid gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">
                Tier{!canSetTier && ' (admin only)'}
              </span>
              <select
                value={d.tier}
                disabled={!canSetTier || busy === 'tier'}
                onChange={(e) => setTier(e.target.value)}
                className="input !w-auto !py-1.5 text-sm"
              >
                {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>

            <label className="grid flex-1 gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">
                Reason (kept in the audit log)
              </span>
              <input
                value={roleReason}
                onChange={(e) => setRoleReason(e.target.value)}
                placeholder="Promoted after trial shift"
                className="input !py-1.5 text-sm"
              />
            </label>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <span className="wage-chip">
              {d.role_source === 'discord' ? 'role from Discord' : 'role granted by hand'}
            </span>
            {d.role_locked && <span className="wage-chip border-wage-warning/50 text-wage-warning">locked</span>}
            {d.role_assigned_at && (
              <span className="font-mono text-[11.5px] text-wage-muted-2">since {fmtDate(d.role_assigned_at)}</span>
            )}
            {viewerRole === 'superadmin' && !d.protected && (
              <button
                disabled={busy === 'lock'}
                onClick={() => run('lock',
                  () => supabase.rpc('ws_admin_lock_role', { p_user_id: d.id, p_locked: !d.role_locked }),
                  d.role_locked ? 'Role unlocked.' : 'Role locked — the Discord sync will not move it.')}
                className="wage-btn wage-btn-ghost !px-3 !py-1 text-[12.5px]"
              >
                {d.role_locked ? 'Unlock role' : 'Lock role'}
              </button>
            )}
            <button
              disabled={busy === 'suspend' || d.protected || !d.can_manage}
              onClick={() => run('suspend',
                () => supabase.rpc('ws_admin_suspend', { p_user_id: d.id, p_suspended: !d.suspended }),
                d.suspended ? 'Reinstated.' : 'Suspended.')}
              className="wage-btn wage-btn-ghost !px-3 !py-1 text-[12.5px]"
            >
              {d.suspended ? 'Reinstate' : 'Suspend'}
            </button>
          </div>

          {d.permissions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {d.permissions.map((p) => (
                <span key={p} className="wage-chip font-mono !text-[10.5px]">{p}</span>
              ))}
            </div>
          )}
        </Panel>

        {/* ── badges ── */}
        <Panel title="Badges">
          {d.badges.length === 0 ? (
            <p className="mb-3 text-[13px] text-wage-muted">No badges yet.</p>
          ) : (
            <ul className="mb-4 grid gap-2">
              {d.badges.map((b) => (
                <li key={b.slug} className="flex flex-wrap items-center justify-between gap-3 border border-wage-line px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ProfileBadges badges={[b]} size={18} />
                    <span className="text-[13.5px] font-semibold">{b.label}</span>
                    {b.note && <span className="truncate text-[12.5px] text-wage-muted">{b.note}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] text-wage-muted-2">
                      {fmtDate(b.granted_at)}{b.granted_by ? ` · ${b.granted_by}` : ''}
                    </span>
                    <button
                      disabled={busy === `revoke:${b.slug}`}
                      onClick={async () => {
                        const res = await run(`revoke:${b.slug}`,
                          () => supabase.rpc('ws_admin_revoke_badge', { p_user_id: d.id, p_slug: b.slug }),
                          `${b.label} revoked.`);
                        if (res?.ok && res.discord_role_id) pushBadgeRole(res.discord_role_id, false, b.label);
                      }}
                      className="font-mono text-[11px] uppercase tracking-[0.12em] text-wage-muted-2 underline hover:text-wage-error"
                    >
                      Revoke
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {grantable.length === 0 ? (
            <p className="text-[12.5px] text-wage-muted">They hold every badge in the catalog.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-2.5">
              <select
                value={grantSlug}
                onChange={(e) => setGrantSlug(e.target.value)}
                className="input !w-auto !py-1.5 text-sm"
              >
                <option value="">Give a badge...</option>
                {grantable.map((b) => <option key={b.slug} value={b.slug}>{b.label}</option>)}
              </select>
              <input
                value={grantNote}
                onChange={(e) => setGrantNote(e.target.value)}
                placeholder="Why (optional)"
                className="input !w-56 !py-1.5 text-sm"
              />
              <button
                disabled={!grantSlug || busy === 'grant'}
                onClick={async () => {
                  const slug = grantSlug;
                  const ok = await run('grant',
                    () => supabase.rpc('ws_admin_grant_badge', { p_user_id: d.id, p_slug: slug, p_note: grantNote || null }),
                    'Badge granted.');
                  if (ok?.ok) {
                    setGrantSlug(''); setGrantNote('');
                    // The badge is the record and the Discord role only reflects it, so a
                    // failed push reports itself and never reverts the grant.
                    if (ok.discord_role_id) pushBadgeRole(ok.discord_role_id, true, ok.label);
                  }
                }}
                className="wage-btn wage-btn-primary !px-3.5 !py-1.5 text-sm"
              >
                Grant
              </button>
            </div>
          )}
        </Panel>

        {/* ── discord ── */}
        <Panel
          title="Discord"
          action={d.discord && (
            <button
              disabled={busy === 'dsync'}
              onClick={syncDiscord}
              className="wage-btn wage-btn-ghost !px-3 !py-1 text-[12.5px]"
            >
              {busy === 'dsync' ? 'Syncing...' : 'Sync roles now'}
            </button>
          )}
        >
          {!d.discord ? (
            <p className="text-[13px] text-wage-muted">
              Not linked. Roles cannot be synced, and they cannot get into the server.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Account">
                <span className="font-mono text-[13px]">{d.discord.username || d.discord.discord_id}</span>
              </Field>
              <Field label="Linked">{fmtDate(d.discord.linked_at)}</Field>
              <Field label="Server roles">
                {d.discord.roles?.length
                  ? <span className="flex flex-wrap gap-1.5">
                      {d.discord.roles.map((r) => <span key={r} className="wage-chip !text-[10.5px]">{r}</span>)}
                    </span>
                  : <span className="text-wage-muted">none recorded</span>}
              </Field>
            </div>
          )}
          {d.connections.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {d.connections.map((c) => (
                <span key={c.provider} className="wage-chip !text-[10.5px]">
                  {c.provider}{c.handle ? ` · ${c.handle}` : ''}
                </span>
              ))}
            </div>
          )}
        </Panel>

        {/* ── staff onboarding ── */}
        {(d.onboarding.length > 0 || RANK[d.role] >= 2 || d.application) && (
          <Panel
            title="Staff onboarding"
            action={d.onboarding.length === 0 && RANK[d.role] >= 2 && (
              <button
                disabled={busy === 'seed'}
                onClick={() => run('seed',
                  () => supabase.rpc('ws_admin_staff_start_onboarding', { p_user_id: d.id, p_position_slug: null }),
                  'Checklist started.')}
                className="wage-btn wage-btn-ghost !px-3 !py-1 text-[12.5px]"
              >
                Start checklist
              </button>
            )}
          >
            {d.application && (
              <p className="mb-3 text-[13px] text-wage-muted">
                Applied for <span className="text-wage-paper">{d.application.position}</span> on{' '}
                {fmtDate(d.application.created_at)} — <span className="wage-chip">{d.application.status}</span>
              </p>
            )}
            {d.onboarding.length === 0 ? (
              <p className="text-[13px] text-wage-muted">No checklist yet.</p>
            ) : (
              <>
                <p className="mb-2.5 font-mono text-[11.5px] text-wage-muted-2">
                  {doneCount} of {d.onboarding.length} done
                </p>
                <ul className="grid gap-1.5">
                  {d.onboarding.map((t) => (
                    <li key={t.slug} className="flex items-start gap-3 border border-wage-line px-3 py-2">
                      <button
                        disabled={busy === `task:${t.slug}`}
                        aria-label={`${t.done_at ? 'Unmark' : 'Mark'} ${t.title}`}
                        onClick={() => run(`task:${t.slug}`,
                          () => supabase.rpc('ws_admin_staff_task_set', {
                            p_user_id: d.id, p_task_slug: t.slug, p_done: !t.done_at, p_note: null,
                          }),
                          t.done_at ? 'Marked not done.' : 'Marked done.')}
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
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        )}

        {/* ── billing ── */}
        {d.memberships.length > 0 && (
          <Panel title="Memberships">
            <ul className="grid gap-1.5">
              {d.memberships.map((m, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2.5 border border-wage-line px-3 py-2 text-[13px]">
                  <span className="font-semibold">{m.plan}</span>
                  <span className={`wage-chip ${m.status === 'active' ? 'border-wage-success/50 text-wage-success' : ''}`}>
                    {m.status}
                  </span>
                  {m.cycle && <span className="font-mono text-[11.5px] text-wage-muted-2">{m.cycle}</span>}
                  <span className="font-mono text-[11.5px] text-wage-muted-2">
                    {m.trial_ends_at ? `trial ends ${fmtDate(m.trial_ends_at)}`
                      : m.period_end ? `renews ${fmtDate(m.period_end)}` : ''}
                  </span>
                  {m.source && <span className="wage-chip !text-[10.5px]">{m.source}</span>}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {/* ── trail ── */}
        {d.history.length > 0 && (
          <Panel title="What has been done to this account">
            <ul className="grid gap-1">
              {d.history.map((h, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-2.5 font-mono text-[11.5px] text-wage-muted-2">
                  <span className="text-wage-paper">{h.action}</span>
                  <span>{h.actor}</span>
                  <span>{fmtWhen(h.at)}</span>
                  {Boolean(h.detail?.from && h.detail?.to) && (
                    <span className="text-wage-amber-2">{String(h.detail.from)} → {String(h.detail.to)}</span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );

  /* ── actions that are more than one call ─────────────────────────────── */

  async function saveHandle(_u: any, handle: string) {
    setMsg(null);
    const { data, error } = await supabase.rpc('ws_admin_set_username', { p_user_id: d!.id, p_username: handle });
    if (error) { setMsg({ tone: 'error', text: error.message }); return false; }
    const r = data as { ok: boolean; reason?: string; username?: string; previous?: string };
    if (!r.ok) { setMsg({ tone: 'error', text: handleMessage(r.reason) }); return false; }
    setMsg({ tone: 'ok', text: `@${r.previous} is now @${r.username}.` });
    await load(); onChanged();
    return true;
  }

  /**
   * A tier change has a Discord side, and it is worth saying which half worked. Calling
   * the bot for someone with no Discord linked is a guaranteed no-op, so it is skipped.
   */
  async function setTier(tier: string) {
    setBusy('tier'); setMsg(null);
    const { error } = await supabase.rpc('ws_admin_set_tier', { p_user_id: d!.id, p_tier: tier });
    setBusy(null);
    if (error) return setMsg({ tone: 'error', text: error.message });
    setMsg({ tone: 'ok', text: `Tier set to ${tier}.` });
    await load(); onChanged();
    if (d!.discord) {
      apiFetch('discord-sync-user', { method: 'POST', body: JSON.stringify({ user_id: d!.id }) })
        .then(() => setMsg({ tone: 'ok', text: `Tier set to ${tier}. Discord role synced.` }))
        .catch(() => setMsg({ tone: 'error', text: `Tier set to ${tier}, but the Discord role did not sync.` }));
    }
  }

  /**
   * Mirror a badge onto its Discord role. Best effort on purpose: the website holds the
   * badge, so a Discord hiccup must not make the grant look like it failed.
   */
  async function pushBadgeRole(roleId: string, add: boolean, label: string) {
    try {
      await apiFetch('discord-staff-sync', {
        method: 'POST',
        body: JSON.stringify({ action: 'badge_role', user_id: d!.id, role_id: roleId, add }),
      });
    } catch {
      setMsg({
        tone: 'error',
        text: `${label} ${add ? 'granted' : 'revoked'} on the website, but the Discord role did not change.`,
      });
    }
  }

  /** Pull this one person's staff role back out of Discord. */
  async function syncDiscord() {
    setBusy('dsync'); setMsg(null);
    try {
      const r = await apiFetch<any>('discord-staff-sync', {
        method: 'POST', body: JSON.stringify({ action: 'user', user_id: d!.id }),
      });
      const c = r.changes?.[0];
      setMsg({
        tone: 'ok',
        text: r.note ? r.note
          : !c || c.action === 'none' ? 'Discord already agrees with the website.'
          : c.action === 'skip' ? `No change: ${explain(c.reason)}`
          : `${c.action === 'promote' ? 'Promoted' : 'Moved'} from ${c.from} to ${c.to}.`,
      });
      await load(); onChanged();
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }
}

/* ── the list ────────────────────────────────────────────────────────────── */

export function UsersTab({ viewerRole }: { viewerRole: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.rpc('ws_admin_list_users', { p_search: q || null });
    setReady(true);
    if (error) setErr(error.message);
    else { setErr(null); setRows((data as any[]) ?? []); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="mb-5 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Search email, handle or name"
          className="input max-w-sm"
        />
        <button className="wage-btn wage-btn-ghost" onClick={load}>Search</button>
      </div>

      {err && <Notice tone="error">{err}</Notice>}

      {openId && (
        <div className="mb-6">
          <UserDetail
            userId={openId}
            viewerRole={viewerRole}
            onClose={() => setOpenId(null)}
            onChanged={load}
          />
        </div>
      )}

      <div className="space-y-2.5">
        {rows.map((u) => (
          <button
            key={u.id}
            onClick={() => setOpenId(openId === u.id ? null : u.id)}
            className={`wage-card wage-card-sm flex w-full flex-wrap items-center gap-3 p-4 text-left transition-colors hover:border-wage-amber/50 ${
              openId === u.id ? 'border-wage-amber/60' : ''
            }`}
          >
            <Avatar name={u.display_name || u.username || u.email} src={u.avatar_url} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-semibold">{u.display_name || u.username || u.email}</span>
                <ProfileBadges badges={u.badges} size={15} />
                {u.suspended && <span className="wage-chip border-wage-error/50 text-wage-error">suspended</span>}
                {u.discord_linked && <span className="wage-chip">discord</span>}
              </div>
              <div className="mt-1 truncate font-mono text-[11.5px] text-wage-muted-2">
                {u.email} / {u.role}
                {u.role_source === 'discord' ? ' (from discord)' : ''} / {u.tier} /{' '}
                <span className="wage-num">{u.points ?? 0}</span> pts
                {u.membership ? ` / ${u.membership}` : ''}
              </div>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-wage-muted-2">
              {openId === u.id ? 'Close' : 'Manage'}
            </span>
          </button>
        ))}
        {ready && rows.length === 0 && !err && (
          <EmptyState>{q ? `Nobody matches "${q}".` : 'No members yet.'}</EmptyState>
        )}
      </div>
    </div>
  );
}
