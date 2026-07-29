import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { HANDLE_MIN, checkHandle, handleMessage, normaliseHandle } from '../lib/handles';

/**
 * Change your public @handle.
 *
 * The handle is the address of a public profile, so changing it breaks any link
 * someone has already shared. That is said plainly rather than discovered later.
 */
export default function HandleEditor({ onChanged }: { onChanged?: (handle: string) => void }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'free' | 'bad'>('idle');
  const [reason, setReason] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    supabase.rpc('ws_my_profile').then(({ data }) => {
      const u = (data as { username?: string } | null)?.username ?? null;
      setCurrent(u);
      setValue(u ?? '');
    });
  }, []);

  // Debounced availability check. Responses are sequence-stamped so a slow reply for
  // an earlier keystroke cannot overwrite the verdict for what is now in the field.
  useEffect(() => {
    if (!current || value === current) { setState('idle'); setReason(null); return; }
    if (value.length < HANDLE_MIN) {
      setState('bad'); setReason(value.length === 0 ? 'empty' : 'too_short');
      return;
    }
    setState('checking');
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const r = await checkHandle(value);
      if (mine !== seq.current) return;
      if (r.ok) { setState('free'); setReason(null); }
      else { setState('bad'); setReason(r.reason); }
    }, 350);
    return () => clearTimeout(t);
  }, [value, current]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    const { data, error } = await supabase.rpc('ws_set_username', { p_username: value });
    setSaving(false);

    if (error) { setMsg({ tone: 'error', text: error.message }); return; }
    const r = data as { ok: boolean; reason?: string; username?: string };
    if (!r.ok) { setMsg({ tone: 'error', text: handleMessage(r.reason) }); return; }

    setCurrent(r.username!);
    setValue(r.username!);
    setState('idle');
    setMsg({ tone: 'ok', text: `You are now @${r.username}.` });
    onChanged?.(r.username!);
  }

  if (current === null) return null;

  const changed = value !== current;
  const canSave = changed && state === 'free' && !saving;

  return (
    <form onSubmit={save} className="wage-card p-6">
      <h2 className="font-body text-[17px] font-bold normal-case tracking-normal">Your handle</h2>
      <p className="mt-1.5 text-[14px] text-wage-muted">
        This is your profile address: <span className="font-mono text-wage-paper">wagesociety.com/creators/{current}</span>
      </p>

      <div className="mt-4 flex items-stretch">
        <span className="grid place-items-center border border-r-0 border-wage-line-hi px-3 font-mono text-[15px] text-wage-muted-2">@</span>
        <input
          value={value}
          onChange={(e) => setValue(normaliseHandle(e.target.value))}
          aria-label="Handle"
          aria-invalid={state === 'bad'}
          spellCheck={false}
          autoCapitalize="none"
          maxLength={30}
          className="wage-input flex-1 font-mono"
        />
      </div>

      <p className="mt-2 min-h-[20px] text-[13px]">
        {state === 'checking' && <span className="text-wage-muted-2">Checking...</span>}
        {state === 'free' && <span className="text-wage-success">@{value} is available.</span>}
        {state === 'bad' && <span className="text-wage-error">{handleMessage(reason ?? undefined)}</span>}
        {state === 'idle' && changed === false && (
          <span className="text-wage-muted-2">At least {HANDLE_MIN} characters: lowercase letters, numbers, underscore.</span>
        )}
      </p>

      {changed && state === 'free' && (
        <p className="mt-1 border border-wage-warning/40 bg-wage-warning/[0.08] px-3 py-2 text-[13px] text-wage-warning">
          Your old link stops working. Anywhere you have shared
          <span className="font-mono"> /creators/{current}</span> will no longer find you.
        </p>
      )}

      {msg && (
        <p role="status" className={`mt-3 border px-3 py-2 text-[13.5px] ${
          msg.tone === 'ok'
            ? 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success'
            : 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'}`}
        >
          {msg.text}
        </p>
      )}

      <div className="mt-4 flex gap-2.5">
        <button type="submit" disabled={!canSave} className="wage-btn wage-btn-primary">
          {saving ? 'Saving...' : 'Change handle'}
        </button>
        {changed && (
          <button type="button" onClick={() => { setValue(current); setMsg(null); }} className="wage-btn wage-btn-ghost">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
