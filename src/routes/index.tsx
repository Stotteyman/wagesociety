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
    id: 'fallback-free',
    slug: 'free',
    name: 'FREE',
    price: '$0',
    description: 'Very limited access for account login, linking, and browsing.',
    features: ['Log in and account access', 'Connect social/OAuth accounts', 'Browse public sections'],
  },
  {
    id: 'fallback-standard',
    slug: 'standard',
    name: 'STANDARD',
    price: '$20/mo',
    description: 'Core membership plan for regular creator workflows.',
    features: [
      'Expanded workspace access',
      'Standard member sections',
      'Routine creator tools',
    ],
  },
  {
    id: 'fallback-plus',
    slug: 'plus',
    name: 'PLUS',
    price: '$50/mo',
    description: 'Higher-tier access for serious operators and teams.',
    features: [
      'Broader tool access',
      'Priority support',
      'Advanced workspace options',
    ],
  },
  {
    id: 'fallback-unlimited',
    slug: 'unlimited',
    name: 'UNLIMITED',
    price: '$100/mo',
    description: 'Full platform access for high-output creators and founders.',
    features: ['Complete creator tool access', 'Premium sections and workflows', 'Top-tier performance features'],
  },
  {
    id: 'fallback-vip',
    slug: 'vip',
    name: 'VIP',
    price: '$1000/mo',
    description: 'Elite private tier for highest-priority access and support.',
    features: ['VIP-level access', 'Private insider channels', 'Highest support priority'],
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
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-md p-8 rounded-2xl border border-orange-300/30 bg-zinc-900/80 shadow-xl flex flex-col items-center">
        <h1 className="text-3xl font-bold mb-6 text-orange-200">Welcome to W.A.G.E. Society</h1>
        <p className="mb-8 text-zinc-300 text-center">Sign up or log in to access your account.</p>
        <div className="flex flex-col gap-4 w-full">
          <a
            href="/signup"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-300 px-7 py-3 font-semibold text-zinc-950 transition hover:bg-orange-200 w-full"
          >
            Sign Up
          </a>
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-xl border border-orange-300/55 px-7 py-3 font-semibold text-orange-100 transition hover:border-orange-200 hover:text-orange-50 w-full"
          >
            Log In
          </a>
        </div>
      </div>
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
