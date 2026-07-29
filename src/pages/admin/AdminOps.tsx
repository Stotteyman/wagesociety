import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { apiFetch } from '../../lib/api';

/**
 * The operational half of the admin area: metrics, access control, live monitors,
 * the Discord verification gate, and the audit trail.
 *
 * Everything on these screens is read from a real source — a database row, the
 * Discord API, or Stripe. Nothing is illustrative. A figure that cannot be
 * fetched renders as an error, never as a zero, because a confident wrong number
 * is worse than a visible failure.
 */

/* ── shared ──────────────────────────────────────────────────────────────── */

function Notice({ tone, children }: { tone: 'error' | 'ok' | 'warn'; children: React.ReactNode }) {
  const skin =
    tone === 'error' ? 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'
    : tone === 'warn' ? 'border-wage-warning/40 bg-wage-warning/[0.08] text-wage-warning'
    : 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success';
  return <p role="status" className={`mb-4 border px-4 py-2.5 text-sm ${skin}`}>{children}</p>;
}

function Tile({ value, label, hint }: { value: React.ReactNode; label: string; hint?: string }) {
  return (
    <div className="wage-card wage-card-sm px-4 py-5">
      <div className="wage-num text-[28px] leading-none text-wage-amber-2">{value}</div>
      <div className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-wage-muted-2">{label}</div>
      {hint && <div className="mt-1 text-[12px] text-wage-muted">{hint}</div>}
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="wage-eyebrow-mute font-mono text-[10.5px] uppercase tracking-[0.16em]">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const when = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

/** Load a Supabase RPC into state, surfacing failures rather than blank data. */
function useRpc<T>(fn: string, args?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const key = JSON.stringify(args ?? {});
  const load = useCallback(() => {
    setBusy(true);
    return supabase.rpc(fn, args as never).then(({ data: d, error }) => {
      setBusy(false);
      if (error) { setErr(error.message); setData(null); }
      else { setErr(null); setData(d as T); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, key]);
  useEffect(() => { load(); }, [load]);
  return { data, err, busy, reload: load };
}

/* ── metrics ─────────────────────────────────────────────────────────────── */

type Metrics = {
  people: Record<string, number>;
  tiers: Record<string, number>;
  money: Record<string, number>;
  content: Record<string, number>;
  community: Record<string, number>;
  signups_14d: { day: string; n: number }[];
  generated_at: string;
};

export function MetricsTab() {
  const { data, err, busy, reload } = useRpc<Metrics>('ws_admin_metrics');
  const [note, setNote] = useState<string | null>(null);

  async function refreshPublicStats() {
    setNote(null);
    const { error } = await supabase.rpc('ws_admin_refresh_platform_stats');
    setNote(error ? `Could not refresh: ${error.message}` : 'Public counters recalculated from live rows.');
  }

  if (err) return <Notice tone="error">{err}</Notice>;
  if (busy || !data) return <p className="text-wage-muted">Loading...</p>;

  const peak = Math.max(1, ...data.signups_14d.map((d) => d.n));

  return (
    <div className="grid gap-8">
      {note && <Notice tone="ok">{note}</Notice>}

      <Section
        title="People"
        action={<button onClick={reload} className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm">Refresh</button>}
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Tile value={data.people.profiles} label="Accounts" />
          <Tile value={data.people.discord_linked} label="Discord verified" hint={`${data.people.profiles - data.people.discord_linked} not linked`} />
          <Tile value={data.people.new_7d} label="New this week" hint={`${data.people.new_30d} in 30 days`} />
          <Tile value={data.people.suspended} label="Suspended" />
        </div>
      </Section>

      <Section title="Revenue">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Tile value={money(data.money.mrr_cents)} label="MRR" hint="annual normalised to monthly" />
          <Tile value={data.money.active_memberships} label="Active" />
          <Tile value={data.money.trialing} label="Trialing" />
          <Tile value={data.money.cancelling} label="Cancelling" />
        </div>
      </Section>

      <Section title="Membership tiers">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {Object.entries(data.tiers).map(([slug, n]) => (
            <Tile key={slug} value={n} label={slug} />
          ))}
        </div>
      </Section>

      <Section title="Signups, last 14 days">
        <div className="wage-card wage-card-sm px-5 py-5">
          <div className="flex h-28 items-end gap-1.5">
            {data.signups_14d.map((d) => (
              <div key={d.day} className="group relative flex-1">
                <div
                  className="w-full bg-wage-amber/70 transition-colors group-hover:bg-wage-amber"
                  style={{ height: `${Math.max(2, (d.n / peak) * 100)}%` }}
                />
                <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap bg-wage-ink px-1.5 py-0.5 font-mono text-[10px] text-wage-paper group-hover:block">
                  {d.day.slice(5)}: {d.n}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-wage-muted-2">
            <span>{data.signups_14d[0]?.day.slice(5)}</span>
            <span>peak {peak}/day</span>
            <span>{data.signups_14d[data.signups_14d.length - 1]?.day.slice(5)}</span>
          </div>
        </div>
      </Section>

      <Section
        title="Content & community"
        action={<button onClick={refreshPublicStats} className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm">Recalculate public counters</button>}
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Tile value={data.content.blog_published} label="Posts live" hint={`${data.content.blog_draft} draft`} />
          <Tile value={data.content.videos} label="Videos" />
          <Tile value={data.content.merch} label="Merch" />
          <Tile value={data.content.streams_live} label="Live now" />
          <Tile value={data.community.referrals} label="Referrals" hint={`${data.community.referrals_flagged} flagged`} />
          <Tile value={data.community.points_issued} label="Points issued" />
          <Tile value={data.people.newsletter} label="Newsletter" />
          <Tile value={data.money.open_checkouts} label="Checkouts 24h" />
        </div>
      </Section>

      <p className="font-mono text-[10.5px] text-wage-muted-2">Generated {when(data.generated_at)}</p>
    </div>
  );
}

/* ── roles & permissions ─────────────────────────────────────────────────── */

type Rbac = {
  roles: { id: number; name: string; priority: number; members: number }[];
  permissions: { id: number; key: string; description: string }[];
  grants: { role_id: number; permission_id: number }[];
};

export function RolesTab() {
  const { data, err, busy, reload } = useRpc<Rbac>('ws_admin_rbac');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  async function toggle(roleId: number, permId: number, enabled: boolean) {
    const cell = `${roleId}:${permId}`;
    setSaving(cell);
    setMsg(null);
    const { error } = await supabase.rpc('ws_admin_set_role_permission', {
      p_role_id: roleId, p_permission_id: permId, p_enabled: enabled,
    });
    setSaving(null);
    if (error) setMsg({ tone: 'error', text: error.message });
    else { await reload(); setMsg({ tone: 'ok', text: 'Permission updated.' }); }
  }

  if (err) return <Notice tone="error">{err}</Notice>;
  if (busy || !data) return <p className="text-wage-muted">Loading...</p>;

  const has = (r: number, p: number) => data.grants.some((g) => g.role_id === r && g.permission_id === p);
  // guest/member hold no admin permissions; showing them adds two dead columns.
  const roles = data.roles.filter((r) => r.priority >= 2);

  return (
    <div className="grid gap-8">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <Section title="Roles">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
          {data.roles.map((r) => (
            <Tile key={r.id} value={r.members} label={r.name} hint={`priority ${r.priority}`} />
          ))}
        </div>
      </Section>

      <Section title="Permission matrix">
        <p className="mb-3 max-w-[70ch] text-[13.5px] text-wage-muted">
          Which staff roles may do what. Superadmin always holds everything and cannot be
          edited — otherwise it would be possible to lock yourself out of this very screen.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-wage-line">
                <th className="py-2.5 pr-4 font-mono text-[10.5px] uppercase tracking-[0.14em] text-wage-muted-2">Permission</th>
                {roles.map((r) => (
                  <th key={r.id} className="px-3 py-2.5 text-center font-mono text-[10.5px] uppercase tracking-[0.14em] text-wage-muted-2">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.permissions.map((p) => (
                <tr key={p.id} className="border-b border-wage-line/50">
                  <td className="py-2.5 pr-4">
                    <div className="font-mono text-[12.5px] text-wage-paper">{p.key}</div>
                    <div className="text-[12px] text-wage-muted">{p.description}</div>
                  </td>
                  {roles.map((r) => {
                    const on = has(r.id, p.id);
                    const locked = r.name === 'superadmin';
                    const cell = `${r.id}:${p.id}`;
                    return (
                      <td key={r.id} className="px-3 py-2.5 text-center">
                        <button
                          disabled={locked || saving === cell}
                          onClick={() => toggle(r.id, p.id, !on)}
                          aria-label={`${on ? 'Revoke' : 'Grant'} ${p.key} for ${r.name}`}
                          className={`grid h-6 w-6 place-items-center border font-mono text-[12px] transition-colors ${
                            on
                              ? 'border-wage-success/50 bg-wage-success/[0.12] text-wage-success'
                              : 'border-wage-line-hi text-wage-muted-2 hover:border-wage-amber'
                          } ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
                        >
                          {saving === cell ? '·' : on ? '+' : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

/* ── monitors ────────────────────────────────────────────────────────────── */

type Check = { name: string; status: 'ok' | 'warn' | 'down' | 'unknown'; ms: number; detail?: string; [k: string]: unknown };
type Health = { overall: string; checked_at: string; checks: Check[] };

const STATUS_SKIN: Record<string, string> = {
  ok: 'border-wage-success/50 bg-wage-success/[0.10] text-wage-success',
  warn: 'border-wage-warning/50 bg-wage-warning/[0.10] text-wage-warning',
  down: 'border-wage-error/50 bg-wage-error/[0.10] text-wage-error',
  unknown: 'border-wage-line-hi text-wage-muted-2',
};

const CHECK_LABEL: Record<string, string> = {
  supabase: 'Database',
  discord_bot: 'Discord bot',
  discord_guild: 'Discord server',
  verification_gate: 'Verification gate',
  stripe: 'Stripe account',
  stripe_webhook: 'Stripe webhook',
  tls_certificate: 'TLS certificate',
};

export function MonitorsTab() {
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try { setHealth(await apiFetch<Health>('admin-health')); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not run the checks.'); }
    setBusy(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="wage-eyebrow-mute font-mono text-[10.5px] uppercase tracking-[0.16em]">
          Live checks{health ? ` — ${when(health.checked_at)}` : ''}
        </div>
        <button onClick={load} disabled={busy} className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm">
          {busy ? 'Checking...' : 'Run checks'}
        </button>
      </div>

      {err && <Notice tone="error">{err}</Notice>}
      {busy && !health && <p className="text-wage-muted">Running checks...</p>}

      {health && (
        <>
          <div className={`border px-4 py-3 text-sm ${STATUS_SKIN[health.overall] || STATUS_SKIN.unknown}`}>
            {health.overall === 'ok'
              ? 'Everything reachable and behaving.'
              : health.overall === 'warn'
                ? 'Running, but something needs attention.'
                : health.overall === 'down'
                  ? 'At least one dependency is failing.'
                  : 'Some checks could not be performed.'}
          </div>

          <div className="grid gap-3">
            {health.checks.map((c) => (
              <div key={c.name} className="wage-card wage-card-sm flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                <span className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${STATUS_SKIN[c.status]}`}>
                  {c.status}
                </span>
                <span className="font-body text-[15px] font-bold">{CHECK_LABEL[c.name] || c.name}</span>
                <span className="min-w-0 flex-1 text-[13.5px] text-wage-muted">{c.detail}</span>
                <span className="font-mono text-[11px] text-wage-muted-2">{c.ms}ms</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── discord gate ────────────────────────────────────────────────────────── */

type DiscordStatus = {
  snapshot: Record<string, number>;
  demotion_risk: { discord_id: string; username: string; roles: string[] }[];
  awaiting_list: { discord_id: string; username: string; had: string[]; stripped_at: string }[];
  tier_role_map: { tier: string; role_id: string; role_name: string }[];
};

export function DiscordTab() {
  const { data, err, busy, reload } = useRpc<DiscordStatus>('ws_admin_discord_status');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  async function op(action: string, extra: Record<string, unknown>, label: string) {
    setWorking(label); setMsg(null);
    try {
      const r = await apiFetch<Record<string, unknown>>('admin-discord-ops', {
        method: 'POST', body: JSON.stringify({ action, ...extra }),
      });
      setMsg({ tone: 'ok', text: `${label}: ${JSON.stringify(r)}` });
      await reload();
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'Action failed.' });
    }
    setWorking(null);
  }

  if (err) return <Notice tone="error">{err}</Notice>;
  if (busy || !data) return <p className="text-wage-muted">Loading...</p>;

  const s = data.snapshot;

  return (
    <div className="grid gap-8">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <Section
        title="Verification gate"
        action={
          <button
            onClick={() => op('resync_all', {}, 'Resync all roles')}
            disabled={Boolean(working)}
            className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm"
          >
            {working === 'Resync all roles' ? 'Syncing...' : 'Resync all roles'}
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Tile value={s.linked} label="Verified" hint="linked to the website" />
          <Tile value={s.awaiting} label="Awaiting" hint="locked out until they verify" />
          <Tile value={s.restored} label="Restored" />
          <Tile value={s.total} label="In snapshot" hint="humans at lockdown" />
        </div>
      </Section>

      {data.demotion_risk.length > 0 && (
        <Section title="Demotion risk">
          <Notice tone="warn">
            These accounts hold a paid-tier Discord role but have no membership import row.
            If they verify as-is they will be dropped to free and silently lose that tier.
          </Notice>
          <div className="grid gap-2">
            {data.demotion_risk.map((d) => (
              <div key={d.discord_id} className="wage-card wage-card-sm flex items-center gap-3 px-4 py-2.5">
                <span className="font-body text-[15px] font-bold">{d.username}</span>
                <span className="text-[13px] text-wage-muted">{d.roles.join(', ')}</span>
                <span className="ml-auto font-mono text-[11px] text-wage-muted-2">{d.discord_id}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Tier → Discord role">
        <div className="grid gap-2">
          {data.tier_role_map.map((m) => (
            <div key={m.tier} className="wage-card wage-card-sm flex items-center gap-3 px-4 py-2.5">
              <span className="font-mono text-[12.5px] uppercase tracking-[0.12em] text-wage-amber-2">{m.tier}</span>
              <span className="text-wage-muted-2">→</span>
              <span className="font-body text-[15px]">{m.role_name}</span>
              <span className="ml-auto font-mono text-[11px] text-wage-muted-2">{m.role_id}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`Awaiting verification (${data.awaiting_list.length})`}>
        {data.awaiting_list.length === 0 ? (
          <div className="wage-card wage-card-sm px-5 py-8 text-center text-[15px] text-wage-muted">
            Everyone who was locked out has verified.
          </div>
        ) : (
          <div className="grid gap-2">
            {data.awaiting_list.map((m) => (
              <div key={m.discord_id} className="wage-card wage-card-sm flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
                <span className="font-body text-[15px] font-bold">{m.username}</span>
                <span className="text-[13px] text-wage-muted">had {m.had.join(', ') || 'no roles'}</span>
                <span className="font-mono text-[11px] text-wage-muted-2">{when(m.stripped_at)}</span>
                <button
                  onClick={() => op('restore_member', { discord_id: m.discord_id }, `Restore ${m.username}`)}
                  disabled={Boolean(working)}
                  className="wage-btn wage-btn-ghost ml-auto !px-3 !py-1 text-sm"
                >
                  {working === `Restore ${m.username}` ? 'Restoring...' : 'Restore now'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ── audit ───────────────────────────────────────────────────────────────── */

type AuditRow = { id: string; actor: string; action: string; detail: Record<string, unknown>; created_at: string };

export function AuditTab() {
  const { data, err, busy, reload } = useRpc<AuditRow[]>('ws_admin_audit_log', { p_limit: 200 });

  if (err) return <Notice tone="error">{err}</Notice>;
  if (busy || !data) return <p className="text-wage-muted">Loading...</p>;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="wage-eyebrow-mute font-mono text-[10.5px] uppercase tracking-[0.16em]">
          {data.length} most recent actions
        </div>
        <button onClick={reload} className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm">Refresh</button>
      </div>

      {data.length === 0 ? (
        <div className="wage-card wage-card-sm px-5 py-10 text-center text-[15px] text-wage-muted">
          Nothing recorded yet. Admin actions from here on will appear in this list.
        </div>
      ) : (
        <div className="grid gap-2">
          {data.map((r) => (
            <div key={r.id} className="wage-card wage-card-sm px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-[11.5px] uppercase tracking-[0.12em] text-wage-amber-2">{r.action}</span>
                <span className="text-[13.5px] text-wage-muted">{r.actor}</span>
                <span className="ml-auto font-mono text-[11px] text-wage-muted-2">{when(r.created_at)}</span>
              </div>
              {r.detail && Object.keys(r.detail).length > 0 && (
                <pre className="mt-1.5 overflow-x-auto font-mono text-[11.5px] text-wage-muted">
                  {JSON.stringify(r.detail)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
