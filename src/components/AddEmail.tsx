import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';

/**
 * Only appears for accounts that have no email.
 *
 * Discord does not always supply one — an account with no verified email on Discord's
 * side has nothing to share, even though we ask for the scope. Everything that has to
 * reach someone (receipts, and the Stripe webhook that matches a payment back to an
 * account) is keyed on an email, so this is the one gap worth prompting to fill.
 */
export default function AddEmail() {
  const { session } = useSession();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  // Nothing to fix.
  if (!session || session.user.email) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() });
    setBusy(false);
    setMsg(error
      ? { tone: 'error', text: error.message }
      : { tone: 'ok', text: 'Check that inbox — click the link we sent and your address is confirmed.' });
  }

  return (
    <form onSubmit={save} className="wage-card mt-5 border-wage-warning/40 p-6">
      <h2 className="font-body text-[17px] font-bold normal-case tracking-normal">Add an email address</h2>
      <p className="mt-1.5 text-[14px] text-wage-muted">
        Discord didn't give us one, so we have no way to send you a receipt or activate a
        membership. Everything else on your account works without it.
      </p>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="input min-w-0 flex-1"
        />
        <button className="wage-btn wage-btn-primary" disabled={busy || !email.includes('@')}>
          {busy ? 'Sending...' : 'Add email'}
        </button>
      </div>

      {msg && (
        <p role="status" className={`mt-3 border px-3 py-2 text-[13.5px] ${
          msg.tone === 'ok'
            ? 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success'
            : 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'}`}
        >
          {msg.text}
        </p>
      )}
    </form>
  );
}
