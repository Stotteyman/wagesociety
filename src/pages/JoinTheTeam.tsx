import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';
import PageHeader from '../components/ui/PageHeader';

/**
 * /join-the-team — the front door for helpers, moderators and anyone else we are
 * recruiting.
 *
 * Positions come from wagesociety.staff_positions, so what is listed here is the same
 * row the admin console hires against. Closing a position in /admin removes it from this
 * page; nothing is written twice.
 *
 * The questions are deliberately few. A long form filters for patience rather than for
 * the qualities the roles actually need, and every extra field is one more thing nobody
 * reads. Answers are stored as a jsonb object keyed by these names, and the console
 * renders whatever keys it finds — so changing the questions needs no migration.
 */

type Position = {
  slug: string; title: string; blurb: string;
  responsibilities: string[]; requirements: string[]; time_commitment: string | null;
};

type Mine = {
  id: string; position: string; title: string; status: string;
  created_at: string; decided_at: string | null; review_note: string | null;
} | null;

const QUESTIONS: { key: string; label: string; hint: string; rows: number }[] = [
  {
    key: 'why',
    label: 'Why this role, and why now?',
    hint: 'A few honest sentences beat a paragraph of enthusiasm.',
    rows: 4,
  },
  {
    key: 'experience',
    label: 'Have you done anything like this before?',
    hint: 'Other servers, other communities, or nothing at all — "nothing yet" is a fine answer.',
    rows: 3,
  },
  {
    key: 'availability',
    label: 'When are you usually around?',
    hint: 'Rough hours and time zone. We are covering gaps, not counting hours.',
    rows: 2,
  },
  {
    key: 'scenario',
    label: 'Two members are arguing in chat and one starts name-calling. What do you do?',
    hint: 'There is no trick here. We want to see how you think.',
    rows: 4,
  },
];

const STATUS_COPY: Record<string, string> = {
  submitted: 'Your application is in. We read every one — expect to hear back within a week or so.',
  reviewing: 'Someone is reading your application now.',
  interview: 'You are through to a chat with a manager. Watch your Discord DMs.',
  hired: 'You are on the team. Your checklist is waiting on your dashboard.',
  rejected: 'Not this time. You can apply again in 60 days.',
  withdrawn: 'You withdrew this application.',
};

const REASONS: Record<string, string> = {
  already_applied: 'You already have an application open. One at a time.',
  cooldown: 'You applied recently and were turned down. You can apply again 60 days after that decision.',
  closed: 'That position closed while you were filling the form in.',
  unknown_position: 'That position no longer exists.',
};

export default function JoinTheTeam() {
  const { session, loading: sessionLoading } = useSession();
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [mine, setMine] = useState<Mine>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc('ws_staff_openings').then(({ data }) => setPositions((data as Position[]) ?? []));
  }, []);

  useEffect(() => {
    if (!session) { setMine(null); return; }
    supabase.rpc('ws_my_staff_application').then(({ data }) => setMine((data as Mine) ?? null));
  }, [session]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc('ws_apply_staff', {
      p_position_slug: chosen, p_answers: answers,
    });
    setBusy(false);
    if (error) return setMsg({ tone: 'error', text: error.message });
    if (data?.ok === false) return setMsg({ tone: 'error', text: REASONS[data.reason] || String(data.reason) });
    setMsg({ tone: 'ok', text: 'Sent. We read every application.' });
    setChosen(null); setAnswers({});
    const { data: fresh } = await supabase.rpc('ws_my_staff_application');
    setMine((fresh as Mine) ?? null);
  }

  const open = mine && ['submitted', 'reviewing', 'interview'].includes(mine.status);
  const picked = positions?.find((p) => p.slug === chosen) ?? null;

  return (
    <section className="mx-auto max-w-5xl px-5 py-14">
      <PageHeader
        eyebrow="Join the team"
        title="Help run this place"
        lede="W.A.G.E. Society is run by the people in it. These are the jobs we are recruiting for — unpaid, real, and the way most of our staff started."
      />

      {/* Where an existing application stands, before anything else on the page: someone
          coming back wants a status, not a second form. */}
      {open && mine && (
        <div className="wage-card mt-9 p-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="wage-eyebrow">Your application</span>
            <span className="wage-chip border-wage-amber/50 text-wage-amber-2">{mine.status}</span>
          </div>
          <p className="mt-3 text-[15px]">
            <span className="font-semibold">{mine.title}</span> — applied{' '}
            {new Date(mine.created_at).toLocaleDateString()}
          </p>
          <p className="mt-1.5 text-[14px] text-wage-muted">{STATUS_COPY[mine.status]}</p>
        </div>
      )}
      {mine && !open && mine.status !== 'hired' && (
        <div className="wage-card mt-9 p-6">
          <p className="text-[14px] text-wage-muted">
            {STATUS_COPY[mine.status]}
            {mine.review_note && <> — <span className="text-wage-paper">{mine.review_note}</span></>}
          </p>
        </div>
      )}
      {mine?.status === 'hired' && (
        <div className="wage-card mt-9 p-6">
          <p className="text-[15px]">
            You are on the team as <span className="font-semibold">{mine.title}</span>.{' '}
            <Link to="/dashboard" className="text-wage-amber-2 underline">Your onboarding checklist</Link> is
            on your dashboard.
          </p>
        </div>
      )}

      {/* ── the openings ── */}
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {positions === null ? (
          <p className="text-wage-muted">Loading...</p>
        ) : positions.length === 0 ? (
          <div className="wage-card px-6 py-10 text-center sm:col-span-2">
            <p className="text-[15px] font-semibold">Nothing open right now.</p>
            <p className="mx-auto mt-2 max-w-[46ch] text-sm text-wage-muted">
              We recruit from the community, so the way in is to be around. Check back, or ask in Discord.
            </p>
          </div>
        ) : (
          positions.map((p) => (
            <article key={p.slug} className="wage-card flex flex-col p-6">
              <h2 className="text-[21px] font-bold">{p.title}</h2>
              {p.time_commitment && (
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-wage-muted-2">
                  {p.time_commitment}
                </p>
              )}
              <p className="mt-3 text-[14px] text-wage-muted">{p.blurb}</p>

              {p.responsibilities.length > 0 && (
                <>
                  <h3 className="mt-5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">
                    What you would do
                  </h3>
                  <ul className="mt-2 grid gap-1.5">
                    {p.responsibilities.map((r) => (
                      <li key={r} className="flex gap-2.5 text-[13.5px]">
                        <span aria-hidden="true" className="text-wage-amber-2">—</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {p.requirements.length > 0 && (
                <>
                  <h3 className="mt-5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">
                    What we ask
                  </h3>
                  <ul className="mt-2 grid gap-1.5">
                    {p.requirements.map((r) => (
                      <li key={r} className="flex gap-2.5 text-[13.5px]">
                        <span aria-hidden="true" className="text-wage-amber-2">—</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="mt-6 pt-1">
                {!sessionLoading && !session ? (
                  <Link to="/login" className="wage-btn wage-btn-ghost">Sign in to apply</Link>
                ) : open ? (
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-wage-muted-2">
                    You already have an application open
                  </span>
                ) : (
                  <button
                    onClick={() => { setChosen(p.slug); setMsg(null); }}
                    className={`wage-btn ${chosen === p.slug ? 'wage-btn-primary' : 'wage-btn-ghost'}`}
                  >
                    {chosen === p.slug ? 'Selected' : `Apply for ${p.title}`}
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      {/* ── the form ── */}
      {picked && session && !open && (
        <form onSubmit={submit} className="wage-card mt-10 grid gap-6 p-6 sm:p-8">
          <div>
            <span className="wage-eyebrow">Applying for</span>
            <h2 className="mt-2 text-[24px] font-bold">{picked.title}</h2>
          </div>

          {QUESTIONS.map((q) => (
            <label key={q.key} className="grid gap-2">
              <span className="text-[14.5px] font-semibold">{q.label}</span>
              <span className="text-[12.5px] text-wage-muted">{q.hint}</span>
              <textarea
                required={q.key === 'why'}
                rows={q.rows}
                value={answers[q.key] ?? ''}
                onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                className="input"
              />
            </label>
          ))}

          <p className="text-[13px] text-wage-muted">
            Staff roles need Discord linked to your account — that is how access is granted.
            If you have not linked it yet, do that in{' '}
            <Link to="/settings" className="text-wage-amber-2 underline">Settings</Link> before you hear back.
          </p>

          {msg && (
            <p
              role="status"
              className={`border px-4 py-3 text-sm ${
                msg.tone === 'error'
                  ? 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'
                  : 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success'
              }`}
            >
              {msg.text}
            </p>
          )}

          <div className="flex flex-wrap gap-2.5">
            <button disabled={busy} className="wage-btn wage-btn-primary">
              {busy ? 'Sending...' : 'Send application'}
            </button>
            <button type="button" onClick={() => setChosen(null)} className="wage-btn wage-btn-ghost">
              Cancel
            </button>
          </div>
        </form>
      )}

      {msg && !picked && (
        <p
          role="status"
          className={`mt-8 border px-4 py-3 text-sm ${
            msg.tone === 'error'
              ? 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'
              : 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success'
          }`}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
