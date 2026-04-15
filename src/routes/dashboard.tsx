import { createFileRoute, Link } from '@tanstack/react-router'
import { getUser, login, logout, onAuthChange, signup, type User } from '@netlify/identity'
import { useEffect, useState } from 'react'
import { ArrowLeft, BadgeCheck, CalendarDays, ClipboardList, DollarSign, Megaphone, NotebookPen, Users } from 'lucide-react'

export const Route = createFileRoute('/dashboard')({
  component: DashboardGate,
})

type PlanName = 'Backstage' | 'All Access' | 'Creator Circle'

const membershipPlans: Array<{
  name: PlanName
  price: string
  description: string
  highlights: string[]
}> = [
  {
    name: 'Backstage',
    price: '$0',
    description: 'For guests exploring the community vibe.',
    highlights: ['Public highlights feed', 'Monthly open stream', 'Limited chat preview'],
  },
  {
    name: 'All Access',
    price: '$19/mo',
    description: 'For active members who never miss a drop.',
    highlights: [
      'Full member authentication',
      'Community chat + link channels',
      'Weekly live-stream sessions',
      'Early event announcements',
    ],
  },
  {
    name: 'Creator Circle',
    price: '$49/mo',
    description: 'For hosts and collaborators building shows.',
    highlights: [
      'Host tools + stream highlights',
      'Priority promotion placements',
      'Private creator war room',
      'Audience analytics snapshots',
    ],
  },
]

function DashboardGate() {
  const [member, setMember] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<PlanName>('All Access')
  const [busyAction, setBusyAction] = useState<'login' | 'signup' | null>(null)

  useEffect(() => {
    let mounted = true

    getUser()
      .then((user) => {
        if (!mounted) return
        setMember(user ?? null)
        setReady(true)
      })
      .catch(() => {
        if (!mounted) return
        setReady(true)
      })

    const unsubscribe = onAuthChange((user) => {
      setMember(user ?? null)
      setReady(true)
      setError('')
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const handleLogin = async () => {
    try {
      setError('')
      setBusyAction('login')
      await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in. Please try again.')
    } finally {
      setBusyAction(null)
    }
  }

  const handleSignup = async () => {
    try {
      setError('')
      setBusyAction('signup')
      await signup(email, password, {
        full_name: name,
        membership_plan: selectedPlan,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account. Please try again.')
    } finally {
      setBusyAction(null)
    }
  }

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      setError('Could not log out. Please refresh and try again.')
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen px-4 py-24 text-zinc-100">
        <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">Checking membership status</p>
          <h1 className="mt-4 text-3xl font-bold text-zinc-50">Preparing your access...</h1>
        </div>
      </div>
    )
  }

  if (!member) {
    return (
      <div className="min-h-screen px-4 py-12 text-zinc-100">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-3xl font-black text-zinc-50 md:text-4xl">Member Access</h1>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100"
            >
              <ArrowLeft size={16} /> Back to Home
            </Link>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
            <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Membership Pricing</p>
              <h2 className="mt-3 text-3xl font-bold text-zinc-50">Pick the plan that matches your goals</h2>
              <div className="mt-8 grid gap-5 md:grid-cols-3">
                {membershipPlans.map((plan) => (
                  <article
                    key={plan.name}
                    className={`rounded-xl border p-5 ${
                      plan.name === selectedPlan
                        ? 'border-orange-200/70 bg-orange-200/10'
                        : 'border-zinc-200/15 bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold text-zinc-50">{plan.name}</h3>
                      {plan.name === selectedPlan && <BadgeCheck size={18} className="text-orange-200" />}
                    </div>
                    <p className="mt-2 text-2xl font-black text-orange-200">{plan.price}</p>
                    <p className="mt-2 text-sm text-zinc-300">{plan.description}</p>
                    <ul className="mt-4 space-y-2 text-sm text-zinc-200">
                      {plan.highlights.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span className="text-orange-200">*</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => setSelectedPlan(plan.name)}
                      className="mt-5 w-full rounded-lg border border-zinc-100/25 py-2 text-sm font-semibold text-zinc-50 transition hover:border-orange-200/70 hover:text-orange-100"
                    >
                      Select {plan.name}
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Already a member?</p>
              <h2 className="mt-3 text-2xl font-bold text-zinc-50">Log in or create your member profile</h2>
              <div className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-200">Name (for new accounts)</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                    placeholder="Your name"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-200">Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                    placeholder="member@email.com"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-200">Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                    placeholder="********"
                  />
                </label>
                <div>
                  <span className="mb-2 block text-sm font-medium text-zinc-200">Selected membership</span>
                  <p className="rounded-lg border border-zinc-200/15 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200">
                    {selectedPlan}
                  </p>
                </div>
              </div>

              {error ? (
                <p className="mt-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {error}
                </p>
              ) : null}

              <div className="mt-6 grid gap-3">
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={busyAction !== null}
                  className="rounded-lg bg-orange-300 px-4 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {busyAction === 'login' ? 'Logging in...' : 'Login to Dashboard'}
                </button>
                <button
                  type="button"
                  onClick={handleSignup}
                  disabled={busyAction !== null}
                  className="rounded-lg border border-zinc-100/30 px-4 py-2.5 font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {busyAction === 'signup' ? 'Creating account...' : 'Sign up for Membership'}
                </button>
              </div>
              <p className="mt-4 text-xs text-zinc-400">
                Netlify Identity auth is active on deployed environments. If you are testing locally, auth actions may not fully complete until deployed.
              </p>
            </section>
          </div>
        </div>
      </div>
    )
  }

  return <CreatorDashboard member={member} onLogout={handleLogout} />
}

function CreatorDashboard({
  member,
  onLogout,
}: {
  member: User
  onLogout: () => Promise<void>
}) {
  return (
    <div className="min-h-screen px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Member Dashboard</p>
              <h1 className="mt-2 text-3xl font-black text-zinc-50 md:text-4xl">
                Welcome back, {member.name || member.email || 'Member'}
              </h1>
              <p className="mt-3 max-w-2xl text-zinc-300">
                Track your content pipeline, coordinate launches, and stay plugged into community opportunities.
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                to="/"
                className="rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
              >
                Home
              </Link>
              <button
                type="button"
                onClick={() => {
                  void onLogout()
                }}
                className="rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <section className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <ResourceCard
            icon={<Megaphone size={18} />}
            title="Bulletin Board"
            description="Post launches, promotions, and collaboration requests to keep your audience and peers aligned."
            items={['Announcement drafts', 'Pinned opportunities', 'Deadline reminders']}
          />
          <ResourceCard
            icon={<CalendarDays size={18} />}
            title="Content Calendar"
            description="Plan videos, streams, newsletters, and social drops across a consistent weekly cadence."
            items={['Publishing cadence', 'Campaign timeline', 'Cross-platform sync']}
          />
          <ResourceCard
            icon={<DollarSign size={18} />}
            title="Revenue Tracker"
            description="Organize recurring income streams and monitor which offers convert best each month."
            items={['Membership revenue', 'Sponsor deliverables', 'Offer performance']}
          />
          <ResourceCard
            icon={<ClipboardList size={18} />}
            title="Creator Task Board"
            description="Break bigger goals into weekly sprint tasks and keep momentum with clear priorities."
            items={['This-week priorities', 'Pending reviews', 'Automation backlog']}
          />
          <ResourceCard
            icon={<Users size={18} />}
            title="Collaboration Hub"
            description="Coordinate partner campaigns, co-host streams, and joint audience growth plans."
            items={['Partner shortlist', 'Co-host prep notes', 'Shared asset links']}
          />
          <ResourceCard
            icon={<NotebookPen size={18} />}
            title="Knowledge Vault"
            description="Store swipe files, scripts, hooks, and reusable frameworks for repeatable execution."
            items={['Best-performing hooks', 'Offer scripts', 'Template library']}
          />
        </section>
      </div>
    </div>
  )
}

function ResourceCard({
  icon,
  title,
  description,
  items,
}: {
  icon: React.ReactNode
  title: string
  description: string
  items: string[]
}) {
  return (
    <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5">
      <div className="mb-3 inline-flex rounded-md border border-zinc-200/20 bg-zinc-950/70 p-2 text-orange-200">
        {icon}
      </div>
      <h2 className="text-xl font-bold text-zinc-50">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">{description}</p>
      <ul className="mt-4 space-y-2 text-sm text-zinc-200">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-orange-200">*</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}
