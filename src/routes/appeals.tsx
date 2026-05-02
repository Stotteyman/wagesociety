import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/appeals')({
  head: () => ({
    meta: [
      { title: 'Appeals — W.A.G.E. Society' },
      {
        name: 'description',
        content: 'Submit an access appeal for a restricted W.A.G.E. Society account.',
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AppealsPage,
})

function AppealsPage() {
  return (
    <div className="min-h-screen px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Access Appeal</p>
        <h1 className="mt-3 text-3xl font-black text-zinc-50 md:text-4xl">Request a ban review</h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-300">
          If you believe your restriction was issued in error, send an appeal with your account email, the context behind the incident,
          and any supporting evidence. Appeals should be reviewed by an administrator or superadmin.
        </p>

        <div className="mt-6 rounded-xl border border-zinc-200/10 bg-zinc-950/50 p-5">
          <p className="text-sm font-semibold text-zinc-100">Recommended appeal details</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            <li>Your account email</li>
            <li>The date of the restriction</li>
            <li>A concise explanation of what happened</li>
            <li>Any evidence or context an admin should review</li>
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="mailto:appeals@wagesociety.com?subject=W.A.G.E.%20Society%20Appeal"
            className="rounded-lg bg-orange-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200"
          >
            Email Appeals Team
          </a>
          <Link
            to="/dashboard"
            className="rounded-lg border border-zinc-100/25 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  )
}