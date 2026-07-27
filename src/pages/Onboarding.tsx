import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Onboarding() {
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [avail, setAvail] = useState<boolean | null>(null);

  // Prefill from existing profile
  useEffect(() => {
    supabase.rpc('ws_my_profile').then(({ data }) => {
      const p = data as { username?: string; display_name?: string; bio?: string } | null;
      if (p) { setUsername(p.username || ''); setDisplayName(p.display_name || ''); setBio(p.bio || ''); }
    });
  }, []);

  // Live username availability
  useEffect(() => {
    if (!/^[a-z0-9_]{3,30}$/.test(username)) { setAvail(null); return; }
    let active = true;
    const t = setTimeout(() => {
      supabase.rpc('ws_check_username', { p_username: username })
        .then(({ data }) => { if (active) setAvail(Boolean(data)); });
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [username]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc('ws_update_profile', {
      p_username: username, p_display_name: displayName || username, p_bio: bio,
    });
    setBusy(false);
    if (error) { setErr(mapErr(error.message)); return; }
    nav('/dashboard');
  }

  return (
    <section className="relative overflow-hidden px-5 py-20">
      <div
        aria-hidden="true"
        className="wage-portal-glow pointer-events-none absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full"
      />
      <div className="relative mx-auto max-w-[480px]">
        <span className="wage-eyebrow">Step 1 of 1</span>
        <h1 className="mt-3 text-[clamp(30px,5vw,44px)]">Claim your handle</h1>
        <p className="mt-3 text-[16px] text-wage-muted">
          Your handle is your public address on WAGE. Pick carefully — changing it later breaks your links.
        </p>

        <form onSubmit={save} className="wage-card mt-8 grid gap-4 p-6">
          <label className="grid gap-1.5">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">Handle</span>
            <div className="flex items-center rounded-[10px] border border-wage-line bg-wage-ink-2 px-3.5 focus-within:border-wage-amber">
              <span className="font-mono text-sm text-wage-muted-2">wagesociety.com/creators/</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                required
                pattern="[a-z0-9_]{3,30}"
                placeholder="yourname"
                aria-describedby="handle-hint"
                className="min-w-0 flex-1 bg-transparent px-1 py-2.5 font-mono text-sm outline-none"
              />
              {avail === true && (
                <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-wage-success">Free</span>
              )}
              {avail === false && (
                <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-wage-error">Taken</span>
              )}
            </div>
            <span id="handle-hint" className="text-[12.5px] text-wage-muted-2">
              3—30 characters: lowercase letters, numbers, underscore.
            </span>
          </label>

          <label className="grid gap-1.5">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">Display name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How your name appears on your profile"
              className="input"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">Bio</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="What do you make, and who's it for?"
              className="input"
            />
          </label>

          <button className="wage-btn wage-btn-primary mt-1" disabled={busy || avail === false}>
            {busy ? 'Saving...' : 'Save and continue'}
          </button>

          {err && (
            <p role="alert" className="rounded-[10px] border border-wage-error/40 bg-wage-error/[0.08] px-4 py-3 text-sm text-wage-error">
              {err}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}

function mapErr(m: string): string {
  if (m.includes('username_taken')) return 'That handle is already taken. Try another.';
  if (m.includes('invalid_username')) return 'Handles are 3—30 characters: lowercase letters, numbers, underscore.';
  if (m.includes('not_authenticated')) return 'Your session expired. Sign in again to continue.';
  return m;
}
