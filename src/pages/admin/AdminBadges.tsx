import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import ProfileBadges, { SHAPES, type Badge } from '../../components/ui/ProfileBadges';

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
};

const SHAPE_KEYS = Object.keys(SHAPES);

/** House colours first — a badge in an off-brand hue is worse than one that looks alike. */
const PRESETS = ['#FFAA33', '#FC9000', '#E43000', '#E4E4E8', '#4FB477', '#5B8DEF', '#B478E4', '#D8C25A'];

function Notice({ tone, children }: { tone: 'error' | 'ok'; children: React.ReactNode }) {
  const skin = tone === 'error'
    ? 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'
    : 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success';
  return <p role="status" className={`mb-4 border px-4 py-2.5 text-sm ${skin}`}>{children}</p>;
}

const EMPTY = {
  slug: '', label: '', description: '', color: '#FFAA33', shape: 'shield',
  sort_order: 100, is_active: true,
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
      p_color: f.color, p_shape: f.shape,
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

      <button className="wage-btn wage-btn-primary mb-5" onClick={() => setF({ ...EMPTY })}>New badge</button>

      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}

      {f && (
        <form onSubmit={save} className="wage-card mb-6 grid gap-3.5 p-5">
          <div className="flex items-center gap-4">
            {/* The preview is the point of the form: colour and silhouette are the whole
                design decision, and neither reads from a hex code in a text field. */}
            <ProfileBadges badges={[{ slug: f.slug || 'preview', label: f.label || 'Preview', color: f.color, shape: f.shape }]} size={44} />
            <div className="text-[13px] text-wage-muted">
              {f.label || 'Preview'}
              <div className="font-mono text-[11.5px] text-wage-muted-2">{f.color} · {f.shape}</div>
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
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-wage-muted-2">Shape</span>
              <div className="flex flex-wrap gap-2">
                {SHAPE_KEYS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-label={s}
                    aria-pressed={f.shape === s}
                    onClick={() => setF({ ...f, shape: s })}
                    className={`grid h-11 w-11 place-items-center border ${
                      f.shape === s ? 'border-wage-amber' : 'border-wage-line-hi hover:border-wage-amber/60'
                    }`}
                  >
                    <ProfileBadges badges={[{ slug: s, label: s, color: f.color, shape: s }]} size={26} />
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
                <input
                  value={f.color}
                  onChange={(e) => setF({ ...f, color: e.target.value })}
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
                  color: b.color, shape: b.shape, sort_order: b.sort_order, is_active: b.is_active,
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
