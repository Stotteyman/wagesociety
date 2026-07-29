import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';
import PageHeader from '../components/ui/PageHeader';

/**
 * /link — approve the code a desktop app is showing.
 *
 * The app never handles the member's password or session. It shows a code, this page
 * approves it against the signed-in account, and the app then collects its own token.
 */
export default function LinkDevice() {
  const { session, loading } = useSession();
  const [params] = useSearchParams();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  // Arriving from the app's clickable link pre-fills the code.
  useEffect(() => {
    const c = params.get('code');
    if (c) setCode(c.toUpperCase());
  }, [params]);

  async function approve(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setResult(null);
    const { data, error } = await supabase.rpc('ws_approve_device', { p_user_code: code });
    setBusy(false);

    if (error) { setResult({ tone: 'error', text: error.message }); return; }
    const r = data as { ok: boolean; reason?: string; app?: string; device?: string };
    if (!r.ok) {
      setResult({
        tone: 'error',
        text: r.reason === 'not_found_or_expired'
          ? 'That code is not valid any more. Codes last 15 minutes — start again in the app for a fresh one.'
          : 'That code could not be approved.',
      });
      return;
    }
    setResult({
      tone: 'ok',
      text: `Approved${r.device ? ` for ${r.device}` : ''}. You can go back to the app — it will continue on its own.`,
    });
  }

  if (loading) return null;

  if (!session) {
    return (
      <section className="mx-auto max-w-lg px-5 py-20 text-center">
        <PageHeader eyebrow="Devices" title="Sign in to continue" lede="Approving an app needs your WAGE account." />
        <Link
          to={`/login?next=${encodeURIComponent(`/link${code ? `?code=${code}` : ''}`)}`}
          className="wage-btn wage-btn-primary mt-6"
        >
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-lg px-5 py-16">
      <PageHeader
        eyebrow="Devices"
        title="Connect your app"
        lede="Enter the code shown in Clip Studio to link it to your membership."
      />

      <form onSubmit={approve} className="wage-card mt-8 p-6">
        <label className="grid gap-1.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">Code from the app</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD2345"
            autoFocus
            spellCheck={false}
            autoCapitalize="characters"
            className="input text-center font-mono text-[24px] tracking-[0.3em]"
          />
        </label>

        {result && (
          <p role="status" className={`mt-4 border px-4 py-2.5 text-sm ${
            result.tone === 'ok'
              ? 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success'
              : 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'}`}
          >
            {result.text}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || code.replace(/[^A-Z0-9]/g, '').length < 6}
          className="wage-btn wage-btn-primary mt-5 w-full"
        >
          {busy ? 'Approving...' : 'Approve this device'}
        </button>

        <p className="mt-4 text-[13px] text-wage-muted">
          Only approve a code you are looking at in an app you opened yourself. Anyone with an
          approved code can use your membership until you sign that device out from your{' '}
          <Link to="/settings" className="underline hover:text-wage-paper">settings</Link>.
        </p>
      </form>
    </section>
  );
}
