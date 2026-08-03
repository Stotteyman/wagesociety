import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import ProfileBadges, { Emblem, SHAPES, GLYPHS, type Badge } from '../../components/ui/ProfileBadges';

/**
 * Launch day, and what it costs.
 *
 * While this is unset every early member pays nothing on any tier. Setting it starts
 * the clock: from that moment an OG keeps Creator free and pays the difference on
 * anything above it. Leaving it blank is the safe state, which is why it ships blank —
 * nobody starts being charged because a date was forgotten.
 */
function LaunchDate() {
  const [info, setInfo] = useState<{ launch_at: string | null; launched: boolean } | null>(null);
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.rpc('ws_launch_info');
    const i = data as { launch_at: string | null; launched: boolean };
    setInfo(i);
    setDraft(i?.launch_at ? String(i.launch_at).slice(0, 10) : '');
  }
  useEffect(() => { load(); }, []);

  async function save(value: string | null) {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc('ws_admin_set_launch_date', {
      p_launch_at: value ? new Date(value + 'T00:00:00').toISOString() : null,
    });
    setBusy(false);
    if (error) return setMsg({ tone: 'error', text: error.message });
    if (data?.ok === false) return setMsg({ tone: 'error', text: String(data.reason) });
    setMsg({
      tone: 'ok',
      text: value
        ? 'Launch set. Early members keep Creator free and pay the difference above it from then on.'
        : 'Launch cleared. Early members are free on every tier again.',
    });
    load();
  }

  return (
    <div className="wage-card mb-6 p-5">
      <div className="wage-eyebrow-mute font-mono text-[10.5px] uppercase tracking-[0.16em]">Launch day</div>
      <p className="mt-2 max-w-[74ch] text-[13.5px] text-wage-muted">
        {info?.launch_at
          ? info.launched
            ? 'Launched. Early members now pay the tier price minus a Creator membership; Creator itself stays free for them.'
            : 'Set. Until this date every early member pays nothing on any tier.'
          : 'Not set. Every early member is free on every tier, indefinitely, until you set a date.'}
      </p>
      {msg && (
        <p role="status" className={
          'mt-3 border px-4 py-2.5 text-sm ' + (msg.tone === 'error'
            ? 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'
            : 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success')
        }>{msg.text}</p>
      )}
      <div className="mt-3.5 flex flex-wrap items-end gap-2.5">
        <label className="grid gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">Date</span>
          <input
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="input !w-auto !py-1.5 text-sm"
          />
        </label>
        <button disabled={busy || !draft} onClick={() => save(draft)} className="wage-btn wage-btn-primary !px-3.5 !py-1.5 text-sm">
          {busy ? 'Saving...' : 'Set launch day'}
        </button>
        {info?.launch_at && (
          <button disabled={busy} onClick={() => save(null)} className="wage-btn wage-btn-ghost !px-3.5 !py-1.5 text-sm">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The badge catalog.
 *
 * A badge is colour plus silhouette, both stored on the row, so one invented here
 * renders on profiles without a deploy. The shape list is the one the component can
 * draw and the database constrains to — see the badges_shape_check constraint.
 *
 * Built-in badges cannot be deleted. `staff` is written by the Discord role sync and
 * `og` by a trigger on profiles; removing either would break a writer that has no idea
 * this screen exists. They can still be recoloured and renamed.
 */

type Row = Badge & {
  description: string; sort_order: number; is_active: boolean; is_builtin: boolean; holders: number;
  glyph: string;
  floor_tier: string | null; discount_tier: string | null; discord_role_id: string | null;
};

const SHAPE_KEYS = Object.keys(SHAPES);
const GLYPH_KEYS = Object.keys(GLYPHS);

/**
 * House colours first, then a broad spread so a new badge can be told apart at a
 * glance. The picker below also takes any hex, so this is a starting point rather
 * than a limit — but reaching for a swatch keeps the set looking related.
 */
const PRESETS = [
  '#FFAA33', '#FC9000', '#E43000', '#E4E4E8', '#06090B',
  '#4FB477', '#2E9E6B', '#5B8DEF', '#3A6BD6', '#B478E4',
  '#8B5CF6', '#D8C25A', '#E86AA6', '#FF5C7A', '#20C3C3',
  '#12A2A2', '#A0AEC0', '#7A8794', '#C97B3C', '#8B5E34',
];

function Notice({ tone, children }: { tone: 'error' | 'ok'; children: React.ReactNode }) {
  const skin = tone === 'error'
    ? 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'
    : 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success';
  return <p role="status" className={`mb-4 border px-4 py-2.5 text-sm ${skin}`}>{children}</p>;
}

const EMPTY = {
  slug: '', label: '', description: '', color: '#FFAA33', shape: 'shield',
  glyph: 'star', sort_order: 100, is_active: true,
};

export function BadgesTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [f, setF] = useState<typeof EMPTY | null>(null);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.rpc('ws_admin_list_badges');
    setReady(true);
    if (error) setErr(error.message);
    else { setErr(null); setRows((data as Row[]) ?? []); }
  }
  useEffect(() => { load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f) return;
    setBusy(true); setErr(null); setMsg(null);
    const { data, error } = await supabase.rpc('ws_admin_save_badge', {
      p_slug: f.slug, p_label: f.label, p_description: f.description,
      p_color: f.color, p_shape: f.shape, p_glyph: f.glyph,
      p_sort_order: f.sort_order, p_is_active: f.is_active,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    if (data?.ok === false) {
      return setErr(data.reason === 'bad_slug'
        ? 'A slug is lowercase letters, numbers and underscores, starting with a letter.'
        : String(data.reason));
    }
    setF(null); setMsg(`${f.label} saved.`); load();
  }

  async function remove(slug: string) {
    const { data, error } = await supabase.rpc('ws_admin_delete_badge', { p_slug: slug });
    if (error) return setErr(error.message);
    if (data?.ok === false) {
      return setErr(data.reason === 'builtin'
        ? 'Built-in badges cannot be deleted — they are written by the role sync and by a trigger.'
        : String(data.reason));
    }
    setMsg(`Badge deleted${data.holders_cleared ? `, taken from ${data.holders_cleared} profiles` : ''}.`);
    load();
  }

  return (
    <div>
      <p className="mb-5 max-w-[74ch] text-[13.5px] text-wage-muted">
        Badges sit against a member's name everywhere it appears. Give one out from{' '}
        <span className="text-wage-paper">Users</span> — open somebody and use the Badges panel — or
        attach one to a Discord role in <span className="text-wage-paper">Staff</span> so it is handed
        out automatically.
      </p>

      <LaunchDate />

      <button className="wage-btn wage-btn-primary mb-5" onClick={() => setF({ ...EMPTY })}>New badge</button>

      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}

      {f && (
        <form onSubmit={save} className="wage-card mb-6 grid gap-3.5 p-5">
          <div className="flex items-center gap-4">
            {/* The preview is the point of the form: colour and silhouette are the whole
                design decision, and neither reads from a hex code in a text field. */}
            {/* Shown at the three sizes it actually renders at, because a mark that
                reads at 44px can turn to mud at 15px next to a name. */}
            <div className="flex items-end gap-3">
              <Emblem badge={{ slug: f.slug || 'preview', label: f.label || 'Preview', color: f.color, shape: f.shape, glyph: f.glyph }} size={44} />
              <Emblem badge={{ slug: f.slug || 'preview', label: f.label || 'Preview', color: f.color, shape: f.shape, glyph: f.glyph }} size={24} />
              <Emblem badge={{ slug: f.slug || 'preview', label: f.label || 'Preview', color: f.color, shape: f.shape, glyph: f.glyph }} size={15} />
            </div>
            <div className="text-[13px] text-wage-muted">
              {f.label || 'Preview'}
              <div className="font-mono text-[11.5px] text-wage-muted-2">
                {f.color} · {f.shape} · {f.glyph}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">Slug</span>
              <input
                required
                value={f.slug}
                onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                placeholder="early_supporter"
                className="input font-mono text-sm"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">Label</span>
              <input
                required
                value={f.label}
                onChange={(e) => setF({ ...f, label: e.target.value })}
                placeholder="Early Supporter"
                className="input"
              />
            </label>
          </div>

          <label className="grid gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">
              What it means — shown on hover and in the profile legend
            </span>
            <input
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
              placeholder="Backed the platform before it launched."
              className="input"
            />
          </label>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">
                Shape — {SHAPE_KEYS.length} to choose from
              </span>
              <div className="flex flex-wrap gap-2">
                {SHAPE_KEYS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    title={s}
                    aria-label={s}
                    aria-pressed={f.shape === s}
                    onClick={() => setF({ ...f, shape: s })}
                    className={`grid h-11 w-11 place-items-center border ${
                      f.shape === s ? 'border-wage-amber' : 'border-wage-line-hi hover:border-wage-amber/60'
                    }`}
                  >
                    <Emblem badge={{ slug: s, label: s, color: f.color, shape: s, glyph: f.glyph }} size={26} />
                  </button>
                ))}
              </div>
            </div>

            {/* Independent of shape — every mark works inside every silhouette. */}
            <div className="grid gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">
                Inner mark — {GLYPH_KEYS.length} to choose from
              </span>
              <div className="flex flex-wrap gap-2">
                {GLYPH_KEYS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    title={g}
                    aria-label={g}
                    aria-pressed={f.glyph === g}
                    onClick={() => setF({ ...f, glyph: g })}
                    className={`grid h-11 w-11 place-items-center border ${
                      f.glyph === g ? 'border-wage-amber' : 'border-wage-line-hi hover:border-wage-amber/60'
                    }`}
                  >
                    <Emblem badge={{ slug: g, label: g, color: f.color, shape: f.shape, glyph: g }} size={26} />
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">Colour</span>
              <div className="flex flex-wrap items-center gap-2">
                {PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    aria-pressed={f.color.toUpperCase() === c}
                    onClick={() => setF({ ...f, color: c })}
                    style={{ background: c }}
                    className={`h-8 w-8 border ${
                      f.color.toUpperCase() === c ? 'border-wage-paper' : 'border-transparent'
                    }`}
                  />
                ))}
                {/* Any colour, not just the swatches — the native picker is the only
                    way to match a Discord role exactly. */}
                <input
                  type="color"
                  aria-label="Pick any colour"
                  value={/^#[0-9a-f]{6}$/i.test(f.color) ? f.color : '#FFAA33'}
                  onChange={(e) => setF({ ...f, color: e.target.value.toUpperCase() })}
                  className="h-8 w-10 cursor-pointer border border-wage-line-hi bg-transparent p-0"
                />
                <input
                  value={f.color}
                  onChange={(e) => setF({ ...f, color: e.target.value.toUpperCase() })}
                  spellCheck={false}
                  className="input !w-28 !py-1.5 font-mono text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="grid gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">Sort order</span>
              <input
                value={f.sort_order}
                onChange={(e) => setF({ ...f, sort_order: parseInt(e.target.value || '100', 10) || 100 })}
                className="input !w-24 !py-1.5 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-[13.5px]">
              <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
              Visible on profiles
            </label>
          </div>

          <div className="flex gap-2">
            <button disabled={busy} className="wage-btn wage-btn-primary">{busy ? 'Saving...' : 'Save'}</button>
            <button type="button" className="wage-btn wage-btn-ghost" onClick={() => setF(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-2.5">
        {rows.map((b) => (
          <div key={b.slug} className="wage-card wage-card-sm flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <ProfileBadges badges={[b]} size={26} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{b.label}</span>
                  <span className="font-mono text-[11px] text-wage-muted-2">{b.slug}</span>
                  {b.is_builtin && <span className="wage-chip !text-[10.5px]">built in</span>}
                  {!b.is_active && <span className="wage-chip !text-[10.5px] text-wage-muted-2">hidden</span>}
                  {/* What the badge is worth, not just what it looks like. */}
                  {b.floor_tier && (
                    <span className="wage-chip !text-[10.5px] border-wage-success/50 text-wage-success">
                      {b.floor_tier} free
                    </span>
                  )}
                  {b.discount_tier && (
                    <span className="wage-chip !text-[10.5px] border-wage-success/50 text-wage-success">
                      {b.discount_tier} credit
                    </span>
                  )}
                  {b.discord_role_id && <span className="wage-chip !text-[10.5px]">discord role</span>}
                </div>
                <p className="mt-0.5 max-w-[68ch] truncate text-[12.5px] text-wage-muted">{b.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="wage-num text-[13px] text-wage-amber-2">{b.holders}</span>
              <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-wage-muted-2">
                {b.holders === 1 ? 'holder' : 'holders'}
              </span>
              <button
                className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm"
                onClick={() => setF({
                  slug: b.slug, label: b.label, description: b.description || '',
                  color: b.color, shape: b.shape, glyph: b.glyph || 'none',
                  sort_order: b.sort_order, is_active: b.is_active,
                })}
              >
                Edit
              </button>
              {!b.is_builtin && (
                // Two-step: the first click arms, the second commits. Deleting a badge
                // takes it off every profile that has it.
                <button
                  onClick={() => (armed === b.slug ? (setArmed(null), remove(b.slug)) : setArmed(b.slug))}
                  onBlur={() => setArmed((a) => (a === b.slug ? null : a))}
                  className={`wage-btn !px-3 !py-1 text-sm ${
                    armed === b.slug ? 'wage-btn-primary !bg-wage-error !border-wage-error' : 'wage-btn-ghost'
                  }`}
                >
                  {armed === b.slug ? `Take from ${b.holders}?` : 'Delete'}
                </button>
              )}
            </div>
          </div>
        ))}
        {ready && rows.length === 0 && (
          <div className="wage-card wage-card-sm px-5 py-10 text-center text-[15px] text-wage-muted">
            No badges yet.
          </div>
        )}
      </div>
    </div>
  );
}
