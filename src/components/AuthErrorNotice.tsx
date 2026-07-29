import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * Surfaces an OAuth failure that came back in the URL, and clears the one piece of
 * state that causes it to repeat.
 *
 * Supabase returns errors on the callback in the query string *and* the hash, and
 * nothing read either — so a failed sign-in left the person on a normal-looking page
 * with the reason only visible in the address bar.
 *
 * pkce_code_verifier_not_found is the case worth handling properly. The verifier is
 * written to local storage when the flow starts and read back on return, so it goes
 * missing when the round trip crosses origins or when the code has already been used.
 * Retrying without clearing it fails the same way, which is what makes it feel broken
 * rather than flaky.
 */
const MESSAGES: Record<string, string> = {
  pkce_code_verifier_not_found:
    "That sign-in link had already been used, or it came back to a different address than it left from. We've cleared the stale sign-in state — try once more and it should go through.",
  'error missing provider id':
    'That platform did not return an account id we could read. Try again, and tell us if it keeps happening.',
  'Error getting user email from external provider':
    'That platform did not share an email address. Sign in with Discord or Google instead, or add an email in Settings first.',
  access_denied: 'You cancelled that sign-in. Nothing changed.',
  server_error: 'The provider returned an error part-way through. Trying again usually works.',
};

/** The verifier only — never the session, which may be perfectly valid. */
function clearStaleVerifier() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-') && key.includes('code-verifier')) localStorage.removeItem(key);
    }
  } catch { /* private mode, nothing to clear */ }
}

export default function AuthErrorNotice() {
  const [problem, setProblem] = useState<{ code: string; text: string } | null>(null);

  useEffect(() => {
    // Supabase puts these in the query string, the hash, or both.
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const code =
      query.get('error_code') || hash.get('error_code') ||
      query.get('error_description') || hash.get('error_description') ||
      query.get('error') || hash.get('error');
    if (!code) return;

    const key = Object.keys(MESSAGES).find((k) => code.includes(k));
    if (key === 'pkce_code_verifier_not_found') clearStaleVerifier();

    setProblem({
      code,
      text: key ? MESSAGES[key] : `Sign-in did not complete (${code}). Trying again usually works.`,
    });

    // Strip the error out of the address bar so a refresh does not replay it, while
    // leaving any other params the page needs.
    for (const k of ['error', 'error_code', 'error_description', 'sb']) query.delete(k);
    const qs = query.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, []);

  if (!problem) return null;

  return (
    <div
      role="alert"
      className="mx-auto mt-6 max-w-3xl border border-wage-error/40 bg-wage-error/[0.08] px-4 py-3 text-sm text-wage-error"
    >
      <div className="font-semibold">Sign-in didn&rsquo;t complete</div>
      <p className="mt-1 text-wage-paper/90">{problem.text}</p>
      <Link to="/login" className="wage-btn wage-btn-ghost mt-3 !px-3 !py-1 text-[13px]">
        Try again
      </Link>
    </div>
  );
}
