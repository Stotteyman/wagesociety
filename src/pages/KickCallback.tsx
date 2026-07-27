import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { kickRedirectUri } from '../lib/kick';

type Result =
  | { kind: 'working' }
  | { kind: 'ok'; username?: string }
  | { kind: 'cancelled' }
  | { kind: 'redirect-mismatch' }
  | { kind: 'failed'; title: string; detail?: string };

export default function KickCallback() {
  const nav = useNavigate();
  const [result, setResult] = useState<Result>({ kind: 'working' });

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      const errDesc = params.get('error_description');
      const code = params.get('code');
      const state = params.get('state');
      const savedState = sessionStorage.getItem('kick_state');
      const verifier = sessionStorage.getItem('kick_verifier');
      sessionStorage.removeItem('kick_state');
      sessionStorage.removeItem('kick_verifier');

      if (err) {
        const e = err.toLowerCase();
        if (e.includes('access_denied')) { setResult({ kind: 'cancelled' }); return; }
        if (e.includes('redirect')) { setResult({ kind: 'redirect-mismatch' }); return; }
        setResult({ kind: 'failed', title: `Kick refused the request: ${err}`, detail: errDesc ?? undefined });
        return;
      }
      if (!code) {
        setResult({ kind: 'failed', title: 'Kick did not send an authorization code.', detail: 'Start the link again from Settings.' });
        return;
      }
      if (!verifier) {
        setResult({ kind: 'failed', title: 'This link attempt expired.', detail: 'The security code was lost, usually because the tab was reopened. Start again from Settings.' });
        return;
      }
      if (!state || state !== savedState) {
        setResult({ kind: 'failed', title: 'That response did not match the request.', detail: 'Start the link again from Settings. If it keeps happening, clear your cookies for this site.' });
        return;
      }

      try {
        const r = await apiFetch<{ ok: boolean; username?: string }>('kick-link', {
          method: 'POST',
          body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: kickRedirectUri() }),
        });
        setResult({ kind: 'ok', username: r.username });
        setTimeout(() => nav('/settings?linked=kick'), 1400);
      } catch (e) {
        setResult({ kind: 'failed', title: 'Could not finish linking Kick.', detail: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, [nav]);

  return (
    <section className="mx-auto max-w-xl px-5 py-24 text-center">
      {result.kind === 'working' && <p className="text-lg">Linking your Kick account...</p>}

      {result.kind === 'ok' && (
        <>
          <p className="wage-cut font-display text-2xl text-wage-amber-2">Kick linked</p>
          <p className="mt-3 text-wage-muted">
            {result.username ? `Connected as ${result.username}.` : 'Connected.'} Taking you back to Settings.
          </p>
        </>
      )}

      {result.kind === 'cancelled' && (
        <>
          <h1 className="wage-cut text-[28px]">Link cancelled</h1>
          <p className="mt-3 text-wage-muted">You declined on Kick's consent screen. Nothing was connected.</p>
          <Link to="/settings" className="wage-btn wage-btn-primary mt-7">Back to Settings</Link>
        </>
      )}

      {result.kind === 'redirect-mismatch' && (
        <>
          <h1 className="wage-cut text-[28px]">Kick rejected the return address</h1>
          <p className="mx-auto mt-3 max-w-[52ch] text-wage-muted">
            Kick only accepts return addresses that are registered on the WAGE app. Add the address
            below to the Kick developer app, then try again.
          </p>
          <code className="mx-auto mt-5 block max-w-fit border border-wage-amber/50 bg-wage-amber/[0.08] px-4 py-3 font-mono text-sm text-wage-amber-2">
            {kickRedirectUri()}
          </code>
          <p className="mx-auto mt-4 max-w-[52ch] text-[13px] text-wage-muted-2">
            It has to match character for character, including <code className="font-mono">https</code> and
            the absence of a trailing slash.
          </p>
          <Link to="/settings" className="wage-btn wage-btn-ghost mt-7">Back to Settings</Link>
        </>
      )}

      {result.kind === 'failed' && (
        <>
          <h1 className="wage-cut text-[26px]">{result.title}</h1>
          {result.detail && (
            <p className="mx-auto mt-4 max-w-[54ch] border border-wage-line bg-wage-panel px-4 py-3 text-sm text-wage-muted">
              {result.detail}
            </p>
          )}
          <Link to="/settings" className="wage-btn wage-btn-primary mt-7">Back to Settings</Link>
        </>
      )}
    </section>
  );
}
