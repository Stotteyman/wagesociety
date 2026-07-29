import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

/**
 * Member software on the dashboard, shown against what this account actually has.
 *
 * Entitlement is not inferred from the tier held in the browser — the same endpoint
 * that issues the download decides, so what is shown here and what the server will
 * allow cannot disagree.
 */

type ToolMeta = { version: string; filename: string; size: number; published_at: string | null; url?: string };
type State = 'loading' | 'entitled' | 'upgrade' | 'unavailable';

const TOOLS = [
  {
    slug: 'clip-studio',
    name: 'Clip Studio',
    minTier: 'Creator',
    tagline: 'Hooks, captions, voiceover and Kick branding.',
  },
];

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

function ToolRow({ tool }: { tool: (typeof TOOLS)[number] }) {
  const [state, setState] = useState<State>('loading');
  const [meta, setMeta] = useState<ToolMeta | null>(null);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ToolMeta>(`tool-download?tool=${tool.slug}&info=1`)
      .then((data) => { if (!cancelled) { setMeta(data); setState('entitled'); } })
      .catch((e: Error) => {
        if (cancelled) return;
        // A 403 is the ordinary answer for a free member, not a fault.
        if (/upgrade|Creator/i.test(e.message)) setState('upgrade');
        else setState('unavailable');
      });
    return () => { cancelled = true; };
  }, [tool.slug]);

  async function download() {
    setStarting(true); setProblem(null);
    try {
      const data = await apiFetch<ToolMeta>(`tool-download?tool=${tool.slug}`);
      if (!data.url) throw new Error('No download link came back.');
      window.location.href = data.url;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'The download could not start.');
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="border-t border-wage-line px-5 py-4 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="font-body text-[15.5px] font-bold">{tool.name}</span>
            {state === 'entitled' && meta && (
              <span className="wage-num text-[11.5px] text-wage-muted-2">
                {meta.version} · {megabytes(meta.size)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[13.5px] text-wage-muted">{tool.tagline}</p>
        </div>

        {state === 'loading' && <div className="h-8 w-32 animate-pulse rounded bg-wage-ink-2" />}

        {state === 'entitled' && (
          <button onClick={download} disabled={starting} className="wage-btn wage-btn-primary !px-3.5 !py-1.5 text-[13.5px]">
            {starting ? 'Starting...' : 'Download'}
          </button>
        )}

        {state === 'upgrade' && (
          <div className="flex items-center gap-2.5">
            <span className="text-[12.5px] text-wage-muted-2">{tool.minTier} and above</span>
            <Link to="/plans" className="wage-btn wage-btn-ghost !px-3.5 !py-1.5 text-[13.5px]">Upgrade</Link>
          </div>
        )}

        {state === 'unavailable' && (
          <span className="text-[12.5px] text-wage-muted-2">Briefly unavailable</span>
        )}
      </div>

      {problem && (
        <p role="status" className="mt-2 border border-wage-error/40 bg-wage-error/[0.08] px-3 py-2 text-[13px] text-wage-error">
          {problem}
        </p>
      )}
    </div>
  );
}

export default function DashboardTools() {
  return (
    <div className="wage-card mt-5 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">Your tools</div>
        <Link to="/tools" className="text-[13px] text-wage-muted hover:text-wage-paper">Details</Link>
      </div>
      {TOOLS.map((t) => <ToolRow key={t.slug} tool={t} />)}
    </div>
  );
}
