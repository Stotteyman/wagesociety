import { useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { signInWithKick } from '../lib/kick';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const redirectTo = `${window.location.origin}/`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabaseConfigured) {
      setMsg({ tone: 'error', text: 'Sign-in is not configured on this deploy yet.' });
      return;
    }
    setBusy(true); setMsg(null);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        setMsg({ tone: 'ok', text: 'Account created. Check your email to confirm it, then sign in.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = '/dashboard';
      }
    } catch (err) {
      setMsg({ tone: 'error', text: err instanceof Error ? err.message : 'Sign-in failed. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  // 'x' is Supabase's OAuth 2.0 X provider (the legacy 'twitter' one is OAuth 1.0a and
  // is being deprecated). supabase-js types have not caught up, hence the cast.
  //
  // Kick is a *custom* provider ('custom:kick'), not a built-in one, so it goes through
  // src/lib/kick.ts — the same place the account-linking flow lives, so there is one
  // description of how Kick auth works rather than two that can drift.
  async function oauth(provider: 'google' | 'discord' | 'x' | 'kick') {
    if (!supabaseConfigured) {
      setMsg({ tone: 'error', text: 'Sign-in is not configured on this deploy yet.' });
      return;
    }
    if (provider === 'kick') {
      const err = await signInWithKick(redirectTo);
      if (err) setMsg({ tone: 'error', text: err });
      return;
    }
    await supabase.auth.signInWithOAuth({
      provider: provider as 'google' | 'discord',
      options: { redirectTo },
    });
  }

  async function magicLink() {
    if (!email) { setMsg({ tone: 'error', text: 'Enter your email address first.' }); return; }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setMsg(error
      ? { tone: 'error', text: error.message }
      : { tone: 'ok', text: `Link sent to ${email}. It expires in an hour.` });
  }

  return (
    <section className="relative overflow-hidden px-5 py-20">
      <div
        aria-hidden="true"
        className="wage-portal-glow pointer-events-none absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full"
      />
      <div className="relative mx-auto max-w-[440px]">
        <div className="text-center">
          <span className="wage-eyebrow">{mode === 'signin' ? 'Sign in' : 'Create account'}</span>
          <h1 className="mt-3 text-[clamp(30px,5vw,44px)]">
            {mode === 'signin' ? 'Welcome back' : 'Claim your handle'}
          </h1>
          <p className="mt-3 text-[15px] text-wage-muted">
            {mode === 'signin'
              ? 'Your profile, streams, and storefront are where you left them.'
              : 'A public creator profile is free, and takes about two minutes.'}
          </p>
        </div>

        <div className="wage-card mt-8 p-6">
          <div className="grid gap-2.5">
            <button className="wage-btn wage-btn-ghost w-full" onClick={() => oauth('google')}>
              Continue with Google
            </button>
            <button className="wage-btn wage-btn-ghost w-full" onClick={() => oauth('discord')}>
              Continue with Discord
            </button>
            <button className="wage-btn wage-btn-ghost w-full" onClick={() => oauth('kick')}>
              Continue with Kick
            </button>
            <button className="wage-btn wage-btn-ghost w-full" onClick={() => oauth('x')}>
              Continue with X
            </button>
          </div>

          <div className="my-6 flex items-center gap-3">
            <hr className="h-px flex-1 border-0 bg-wage-line" />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-wage-muted-2">or email</span>
            <hr className="h-px flex-1 border-0 bg-wage-line" />
          </div>

          <form onSubmit={submit} className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">Email</span>
              <input
                type="email" required autoComplete="email" placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)} className="input"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">Password</span>
              <input
                type="password" required minLength={8}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder="At least 8 characters"
                value={password} onChange={(e) => setPassword(e.target.value)} className="input"
              />
            </label>
            <button className="wage-btn wage-btn-primary mt-1 w-full" disabled={busy}>
              {busy ? 'Working...' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {msg && (
            <p
              role="status"
              className={`mt-4 rounded-[10px] border px-4 py-3 text-sm ${
                msg.tone === 'error'
                  ? 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'
                  : 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success'
              }`}
            >
              {msg.text}
            </p>
          )}

          <div className="mt-5 flex items-center justify-between border-t border-wage-line pt-4 text-sm">
            <button
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg(null); }}
              className="text-wage-muted transition-colors hover:text-wage-paper"
            >
              {mode === 'signin' ? 'Need an account?' : 'Already have one?'}
            </button>
            <button onClick={magicLink} className="text-wage-muted transition-colors hover:text-wage-paper">
              Email me a link instead
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
