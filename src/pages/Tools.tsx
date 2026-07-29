import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { apiFetch } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import TierChip from '../components/ui/TierChip';

/**
 * Member tools.
 *
 * The card is deliberately visible to everyone — a locked tool that nobody can
 * see is a benefit nobody upgrades for. What changes with entitlement is the
 * button, not the page.
 */

type ToolMeta = {
  version: string;
  filename: string;
  size: number;
  published_at: string | null;
  url?: string;
};

type Gate = 'loading' | 'ready' | 'signed-out' | 'upgrade' | 'unavailable';

const TOOL = {
  slug: 'clip-studio',
  name: 'Clip Studio',
  tagline: 'Hooks, captions, voiceover and Kick branding — on your own machine.',
  minTier: 'creator',
  requires: 'Windows 10/11 · 64-bit',
  features: [
    ['Hooks that stop the scroll', 'A headline across the top in three styles, timed to the first few seconds.'],
    ['Word-by-word captions', 'The karaoke highlight short-form lives on. Four styles, any colour, any font you drop in.'],
    ['Your voice, or an AI one', 'Record over the clip, or type a script and have it read — captions come from the script, so names are always spelled right.'],
    ['Kick branding, automatic', "Paste a channel and it pulls the real display name and avatar onto the clip."],
    ['See it before you render', 'A live preview of the finished layout, not a guess — same pipeline as the final export.'],
    ['Built for volume', 'Test several hooks at once, batch a whole folder, or slice a VOD into shorts from a timestamp list.'],
  ],
};

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

export default function Tools() {
  const { session, loading } = useSession();
  const [gate, setGate] = useState<Gate>('loading');
  const [meta, setMeta] = useState<ToolMeta | null>(null);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) { setGate('signed-out'); return; }

    let cancelled = false;
    setGate('loading');

    apiFetch<ToolMeta>(`tool-download?tool=${TOOL.slug}&info=1`)
      .then((data) => {
        if (cancelled) return;
        setMeta(data);
        setGate('ready');
      })
      .catch((e: Error) => {
        if (cancelled) return;
        // A 403 here is the ordinary path for a free member, not a failure.
        if (/upgrade|Creator/i.test(e.message)) setGate('upgrade');
        else if (/sign in/i.test(e.message)) setGate('signed-out');
        else { setProblem(e.message); setGate('unavailable'); }
      });

    return () => { cancelled = true; };
  }, [session, loading]);

  // The signed link is short-lived, so it is fetched at click time rather than
  // held on the page where it would quietly go stale.
  async function download() {
    setStarting(true);
    setProblem(null);
    try {
      const data = await apiFetch<ToolMeta>(`tool-download?tool=${TOOL.slug}`);
      if (!data.url) throw new Error('No download link came back.');
      window.location.href = data.url;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'The download could not start.');
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl px-5 py-14">
      <PageHeader
        eyebrow="Member tools"
        title="Tools we built for you"
        lede="Software included with your membership. Yours to use on your own content, for as long as you're a member."
      />

      <article className="wage-card mt-9 overflow-hidden">
        <div className="border-b border-wage-line p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="font-display text-[26px] leading-none">{TOOL.name}</h2>
                <TierChip tier={TOOL.minTier} />
              </div>
              <p className="mt-2 max-w-xl text-[14.5px] text-wage-muted">{TOOL.tagline}</p>
            </div>

            <div className="text-right">
              {meta && (
                <div className="wage-num text-[13px] text-wage-muted">
                  {meta.version} · {megabytes(meta.size)}
                </div>
              )}
              <div className="mt-0.5 text-[12px] text-wage-muted">{TOOL.requires}</div>
            </div>
          </div>

          <div className="mt-6">
            {gate === 'loading' && (
              <div className="h-11 w-52 animate-pulse rounded-lg bg-wage-ink-2" />
            )}

            {gate === 'signed-out' && (
              <div className="flex flex-wrap items-center gap-3">
                <Link to="/login" className="wage-btn wage-btn-primary">Sign in to download</Link>
                <span className="text-[13px] text-wage-muted">
                  Included with Creator and above.
                </span>
              </div>
            )}

            {gate === 'upgrade' && (
              <div className="flex flex-wrap items-center gap-3">
                <Link to="/plans" className="wage-btn wage-btn-primary">Upgrade to Creator</Link>
                <span className="text-[13px] text-wage-muted">
                  {TOOL.name} unlocks at Creator and stays yours on every tier above it.
                </span>
              </div>
            )}

            {gate === 'ready' && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={download}
                  disabled={starting}
                  className="wage-btn wage-btn-primary disabled:opacity-60"
                >
                  {starting ? 'Starting…' : `Download for Windows`}
                </button>
                <span className="text-[13px] text-wage-muted">
                  Read <b className="text-wage-paper">READ ME FIRST</b> in the zip — there's a
                  one-time setup step.
                </span>
              </div>
            )}

            {gate === 'unavailable' && (
              <div className="text-[13.5px] text-wage-muted">
                Downloads are briefly unavailable. Try again in a minute.
              </div>
            )}

            {problem && (
              <p
                role="status"
                className="mt-3 border border-wage-error/40 bg-wage-error/[0.08] px-4 py-2.5 text-sm text-wage-error"
              >
                {problem}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-x-8 gap-y-5 p-6 sm:grid-cols-2 sm:p-7">
          {TOOL.features.map(([title, detail]) => (
            <div key={title}>
              <div className="text-[14px] font-semibold">{title}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-wage-muted">{detail}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-wage-line bg-wage-ink-2/40 px-6 py-4 sm:px-7">
          <p className="text-[12.5px] leading-relaxed text-wage-muted">
            Runs entirely on your machine — your footage is never uploaded anywhere. Needs
            ffmpeg and Python, both free; the included setup script installs what it needs.
            Licensed to you while your membership is active. Please don't reshare the build
            or your download link.
          </p>
        </div>
      </article>
    </section>
  );
}
