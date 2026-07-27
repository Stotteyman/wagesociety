import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export type Notice = {
  tone: 'ok' | 'info' | 'error';
  title: string;
  body?: string;
};

const SKIN: Record<Notice['tone'], string> = {
  ok: 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success',
  info: 'border-wage-amber/40 bg-wage-amber/[0.07] text-wage-amber-2',
  error: 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error',
};

/**
 * Banner for the query strings Stripe sends people back with.
 *
 * Coming back from a cancelled checkout used to land on a page that said
 * nothing at all, which reads like the payment silently failed. Anything that
 * bounces a user back to the app should say what happened to their money.
 *
 * The parameters are stripped from the URL once read, so a refresh or a shared
 * link does not replay a stale message.
 */
export default function ReturnNotice({
  resolve,
  params,
}: {
  resolve: (p: URLSearchParams) => Notice | null;
  /** Query keys to clear once handled. */
  params: string[];
}) {
  const { search } = useLocation();
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(search);
    const found = resolve(p);
    if (!found) return;
    setNotice(found);

    params.forEach((k) => p.delete(k));
    const rest = p.toString();
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
    // resolve/params are declared inline by callers, so depending on them would
    // re-run this on every render and wipe the notice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  if (!notice) return null;

  return (
    <div role="status" className={`mb-6 flex items-start justify-between gap-4 border px-4 py-3.5 ${SKIN[notice.tone]}`}>
      <div>
        <div className="text-[14.5px] font-bold">{notice.title}</div>
        {notice.body && <p className="mt-1 text-[13.5px] leading-relaxed opacity-90">{notice.body}</p>}
      </div>
      <button
        onClick={() => setNotice(null)}
        aria-label="Dismiss"
        className="shrink-0 px-1 font-mono text-[15px] leading-none opacity-70 transition-opacity hover:opacity-100"
      >
        x
      </button>
    </div>
  );
}
