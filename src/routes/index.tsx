import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Info, Sparkles, X } from 'lucide-react'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'W.A.G.E. Society — Creator Growth Organization' },
      {
        name: 'description',
        content:
          'Join W.A.G.E. Society, an organization for content creators, online marketers, and entrepreneurs building modern digital businesses together.',
      },
      { property: 'og:title', content: 'W.A.G.E. Society — Creator Growth Organization' },
      {
        property: 'og:description',
        content:
          'An organization for content creators, online marketers, and entrepreneurs who want tools, strategy, and community to grow.',
      },
      { property: 'og:url', content: 'https://playful-torte-0c9af1.netlify.app/' },
    ],
    links: [{ rel: 'canonical', href: 'https://playful-torte-0c9af1.netlify.app/' }],
  }),
  component: Home,
})

type MembershipTier = {
  id: string
  slug: string
  name: string
  price: string
  description: string
  features: string[]
}

type MarketingProofResponse = {
  activeMembers: number
  memberWinsThisQuarter: number
  averageTimeToFirstActionHours: number | null
  sampleSize: number
  asOf: string
}

const fallbackMembershipTiers: MembershipTier[] = [
  {
    id: 'fallback-backstage',
    slug: 'backstage',
    name: 'Backstage',
    price: '$0',
    description: 'For new builders exploring the organization.',
    features: ['Public knowledge feed', 'Monthly orientation workshop', 'Limited mastermind preview'],
  },
  {
    id: 'fallback-all-access',
    slug: 'all-access',
    name: 'All Access',
    price: '$19/mo',
    description: 'For active members building weekly momentum.',
    features: [
      'Full member authentication',
      'Mastermind channels + resource library',
      'Weekly live growth sessions',
      'Campaign and launch announcements',
    ],
  },
  {
    id: 'fallback-creator-circle',
    slug: 'creator-circle',
    name: 'Creator Circle',
    price: '$49/mo',
    description: 'For founders and operators scaling digital revenue.',
    features: [
      'Advanced creator and marketing systems',
      'Priority partner and promotion access',
      'Private strategy war room',
      'Performance and revenue snapshots',
    ],
  },
]

const proofItems = [
  'Role-based access and secure member accounts',
  'Structured weekly execution rhythms',
  'Focused creator and operator network',
]

function formatMetricNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatHoursToAction(hours: number | null) {
  if (hours === null) return 'Not enough completed entries yet'
  if (hours < 1) return '< 1 hour'
  if (hours < 24) return `${Math.round(hours)} hours`

  const days = hours / 24
  if (days < 10) return `${days.toFixed(1)} days`
  return `${Math.round(days)} days`
}

function formatAsOfDate(isoString: string | null) {
  if (!isoString) return 'Updating as data arrives.'

  const asDate = new Date(isoString)
  if (!Number.isFinite(asDate.getTime())) return 'Updating as data arrives.'

  return `Live snapshot: ${asDate.toLocaleDateString()}`
}

const outcomeItems = [
  {
    title: 'Execution Accountability',
    description: 'Turn goals into weekly actions with clear milestones and owner visibility.',
  },
  {
    title: 'Proven Growth Systems',
    description: 'Use practical marketing and creator workflows built for repeatable results.',
  },
  {
    title: 'Private Peer Network',
    description: 'Collaborate with serious builders on launches, offers, and campaign strategy.',
  },
]

const objectionItems = [
  {
    question: 'Who is this for?',
    answer: 'Creators, marketers, and founders who want practical execution support, not just inspiration.',
  },
  {
    question: 'How fast can I start?',
    answer: 'Immediately after signup. You can access your dashboard and begin using member tools right away.',
  },
  {
    question: 'Can I change plans later?',
    answer: 'Yes. Start with the plan that fits today and upgrade as your operation scales.',
  },
]

function Home() {
  const [membershipTiers, setMembershipTiers] = useState<MembershipTier[]>(fallbackMembershipTiers)
  const [proofMetrics, setProofMetrics] = useState<MarketingProofResponse | null>(null)
  const [activeModal, setActiveModal] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/shop')
        if (!response.ok) return

        const data = (await response.json()) as {
          membershipPlans?: Array<{
            id: string
            slug: string
            name: string
            display_price: string
            description: string
            features: string[]
          }>
        }

        const plans = (data.membershipPlans || []).map((plan) => ({
          id: plan.id,
          slug: plan.slug,
          name: plan.name,
          price: plan.display_price,
          description: plan.description,
          features: plan.features,
        }))

        if (plans.length) setMembershipTiers(plans)
      } catch {
        // Keep fallback tiers.
      }
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/marketing-proof')
        if (!response.ok) return

        const data = (await response.json()) as MarketingProofResponse
        setProofMetrics(data)
      } catch {
        // Keep null state; UI shows graceful defaults.
      }
    })()
  }, [])

  const credibilitySlots = [
    {
      title: 'Active Members',
      value: proofMetrics ? formatMetricNumber(proofMetrics.activeMembers) : 'Loading...',
      note: formatAsOfDate(proofMetrics?.asOf || null),
      howCalculated: 'Counted from org_user_roles where the member role is not banned. Updated in real time as memberships are confirmed or revoked.',
    },
    {
      title: 'Member Wins This Quarter',
      value: proofMetrics ? formatMetricNumber(proofMetrics.memberWinsThisQuarter) : 'Loading...',
      note: 'Completed dashboard entries in the current quarter.',
      howCalculated: 'Counts all org_dashboard_tool_entries with status = "done" and updated_at within the current calendar quarter (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec).',
    },
    {
      title: 'Average Time to First Action',
      value: formatHoursToAction(proofMetrics?.averageTimeToFirstActionHours ?? null),
      note: proofMetrics
        ? `Based on ${formatMetricNumber(proofMetrics.sampleSize)} completed entries.`
        : 'Calculated from member execution activity.',
      howCalculated: 'Measures the mean time from entry creation to status = "done" across up to 1 000 recent completed entries. Outliers over 90 days are excluded to keep the average meaningful.',
    },
  ]

  return (
    <div className="min-h-screen text-zinc-100">
      <section className="relative overflow-hidden px-4 pb-16 pt-20 md:pb-20">
        <div className="pointer-events-none absolute -left-20 top-20 h-72 w-72 rounded-full bg-orange-300/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-amber-200/10 blur-3xl" />
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-orange-300/40 bg-orange-200/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-100">
            <Sparkles size={14} /> Creator Organization and Growth Network
          </div>
          <div className="max-w-3xl">
            <h1 className="text-balance text-4xl font-black leading-[0.95] sm:text-5xl md:text-7xl">
              Build Faster With a High-Signal Creator Community
            </h1>
            <p className="mt-6 max-w-2xl text-base text-zinc-200 sm:text-lg md:text-xl">
              W.A.G.E. Society gives creators, marketers, and founders the systems, accountability, and peer network to execute consistently and grow revenue.
            </p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
              <a
                href="#membership"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-300 px-7 py-3 font-semibold text-zinc-950 transition hover:bg-orange-200 sm:w-auto"
              >
                Start Membership <ArrowRight size={18} />
              </a>
              <Link
                to="/dashboard"
                search={{ view: 'login' }}
                className="inline-flex w-full items-center justify-center rounded-xl border border-orange-300/55 px-7 py-3 font-semibold text-orange-100 transition hover:border-orange-200 hover:text-orange-50 sm:w-auto"
              >
                Member Login
              </Link>
            </div>
            <p className="mt-4 text-sm text-zinc-400">Secure member access. Clear onboarding. Immediate dashboard entry.</p>
          </div>
        </div>
      </section>

      <section className="px-4 pb-12">
        <div className="mx-auto grid max-w-6xl gap-3 rounded-2xl border border-zinc-200/15 bg-zinc-900/55 p-4 sm:grid-cols-3 sm:p-6">
          {proofItems.map((item) => (
            <p key={item} className="rounded-lg border border-zinc-200/15 bg-zinc-950/45 px-4 py-3 text-sm text-zinc-200">
              {item}
            </p>
          ))}
        </div>
      </section>

      <section className="px-4 pb-16">
        <div className="mx-auto max-w-6xl rounded-2xl border border-zinc-200/15 bg-zinc-900/55 p-6 md:p-8">
          <div className="mb-5 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Proof and Credibility</p>
            <h2 className="mt-2 text-2xl font-bold text-zinc-50 md:text-3xl">Live numbers from the organization</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {credibilitySlots.map((slot) => (
              <article key={slot.title} className="rounded-xl border border-zinc-200/15 bg-zinc-950/45 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{slot.title}</p>
                <p className="mt-2 text-lg font-semibold text-orange-100">{slot.value}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-zinc-400">{slot.note}</p>
                  <button
                    type="button"
                    onClick={() => setActiveModal(slot.title)}
                    className="flex-shrink-0 rounded p-0.5 text-zinc-500 transition hover:text-zinc-200"
                    aria-label={`How ${slot.title} is calculated`}
                  >
                    <Info size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {activeModal && (() => {
        const slot = credibilitySlots.find((s) => s.title === activeModal)
        if (!slot) return null
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 px-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={`How ${slot.title} is calculated`}
            onClick={(e) => { if (e.target === e.currentTarget) setActiveModal(null) }}
          >
            <div ref={modalRef} className="w-full max-w-md rounded-2xl border border-zinc-200/20 bg-zinc-900 p-6 shadow-xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">How this is calculated</p>
                  <h3 className="mt-1 text-lg font-bold text-zinc-50">{slot.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="rounded p-1 text-zinc-400 transition hover:text-zinc-100"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="text-sm leading-relaxed text-zinc-300">{slot.howCalculated}</p>
              <div className="mt-4 rounded-lg border border-zinc-200/10 bg-zinc-950/50 px-4 py-3">
                <p className="text-xs font-semibold text-zinc-400">Current value</p>
                <p className="mt-1 text-xl font-bold text-orange-200">{slot.value}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{slot.note}</p>
              </div>
            </div>
          </div>
        )
      })()}

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">What Members Get</p>
            <h2 className="mt-3 text-3xl font-bold text-zinc-50 md:text-4xl">A focused operating system for growth</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {outcomeItems.map((item) => (
              <article key={item.title} className="rounded-2xl border border-zinc-200/15 bg-zinc-900/65 p-6">
                <h3 className="text-xl font-semibold text-zinc-50">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-300">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="membership" className="scroll-mt-24 px-4 pb-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 max-w-2xl">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Membership Tracks
              </p>
              <h2 className="mt-3 text-4xl font-bold text-zinc-50 md:text-5xl">
                Choose your plan and join
              </h2>
              <p className="mt-3 text-zinc-300">Pick your tier, check out in under a minute, and start inside the dashboard.</p>
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {membershipTiers.map((tier) => (
              <MembershipCard key={tier.id} {...tier} highlighted={tier.slug === 'all-access'} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16">
        <div className="mx-auto max-w-6xl rounded-2xl border border-zinc-200/15 bg-zinc-900/55 p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Before You Join</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {objectionItems.map((item) => (
              <article key={item.question} className="rounded-xl border border-zinc-200/15 bg-zinc-950/45 p-4">
                <h3 className="text-base font-semibold text-zinc-100">{item.question}</h3>
                <p className="mt-2 text-sm text-zinc-300">{item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-6xl rounded-3xl border border-orange-300/40 bg-orange-200/10 p-8 text-center md:p-10">
          <h2 className="text-3xl font-black text-zinc-50 md:text-4xl">Ready to build with the right people?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-zinc-200">
            Join W.A.G.E. Society today and start executing with a structured community behind you.
          </p>
          <a
            href="#membership"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-300 px-7 py-3 font-semibold text-zinc-950 transition hover:bg-orange-200 sm:w-auto"
          >
            Start Membership <ArrowRight size={18} />
          </a>
        </div>
      </section>

      <footer className="border-t border-zinc-200/15 px-4 py-10 text-center text-sm text-zinc-400">
        &copy; 2026 W.A.G.E. Society. Built for content creators, marketers, and entrepreneurs.
      </footer>
    </div>
  )
}

function MembershipCard({
  slug,
  name,
  price,
  description,
  features,
  highlighted,
}: {
  slug: string
  name: string
  price: string
  description: string
  features: string[]
  highlighted?: boolean
}) {
  return (
    <div
      className={`flex h-full w-full flex-col rounded-2xl border p-6 ${
        highlighted
          ? 'border-orange-200/70 bg-orange-200/10 shadow-[0_0_0_1px_rgba(255,220,180,0.2)]'
          : 'border-zinc-200/15 bg-zinc-900/65'
      }`}
    >
      {highlighted ? (
        <p className="mb-3 inline-flex w-fit rounded-full border border-orange-300/60 bg-orange-100/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-100">
          Recommended
        </p>
      ) : null}
      <h3 className="text-xl font-bold text-zinc-50">{name}</h3>
      <p className="mt-3 text-4xl font-black text-orange-200">{price}</p>
      <p className="mt-2 text-sm text-zinc-300">{description}</p>
      <ul className="mt-6 flex-1 space-y-3 text-sm text-zinc-200">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <span className="mt-[2px] text-orange-200">&#10003;</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/checkout"
        search={{ plan: slug }}
        className="mt-8 block w-full rounded-xl border border-zinc-100/25 py-2.5 text-center font-semibold text-zinc-50 transition hover:border-orange-200/60 hover:text-orange-100"
      >
        Start Membership
      </Link>
    </div>
  )
}
