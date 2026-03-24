import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowRight,
  BadgeCheck,
  Clapperboard,
  KeyRound,
  Link2,
  MessageCircle,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'

export const Route = createFileRoute('/')({
  component: Home,
})

const experienceCards = [
  {
    icon: <KeyRound size={24} />,
    title: 'Member Login Gateway',
    description:
      'Secure sign in, private profile zones, and members-only access so every room feels exclusive and trusted.',
  },
  {
    icon: <MessageCircle size={24} />,
    title: 'Community Chat Arena',
    description:
      'Real-time lounge chat for watch parties, instant reactions, and creator Q&A during every major stream.',
  },
  {
    icon: <Link2 size={24} />,
    title: 'Curated Link Sharing',
    description:
      'Share clips, trending drops, event pages, and playlists in channel-based threads built for discovery.',
  },
  {
    icon: <Radio size={24} />,
    title: 'Live-Stream Spotlight',
    description:
      'Feature upcoming streams, countdowns, and now-live alerts to keep members in sync with every show.',
  },
  {
    icon: <Clapperboard size={24} />,
    title: 'Entertainment Hubs',
    description:
      'Dedicated spaces for music, gaming, sports, film, and creator culture with always-fresh content.',
  },
  {
    icon: <ShieldCheck size={24} />,
    title: 'Clubhouse Moderation',
    description:
      'Role controls, room permissions, and moderation workflows that protect community quality at scale.',
  },
]

const membershipTiers = [
  {
    name: 'Backstage',
    price: '$0',
    description: 'For guests exploring the community vibe.',
    features: ['Public highlights feed', 'Monthly open stream', 'Limited chat preview'],
  },
  {
    name: 'All Access',
    price: '$19/mo',
    description: 'For active members who never miss a drop.',
    features: [
      'Full member authentication',
      'Community chat + link channels',
      'Weekly live-stream sessions',
      'Early event announcements',
    ],
    highlighted: true,
  },
  {
    name: 'Creator Circle',
    price: '$49/mo',
    description: 'For hosts and collaborators building shows.',
    features: [
      'Host tools + stream highlights',
      'Priority promotion placements',
      'Private creator war room',
      'Audience analytics snapshots',
    ],
  },
]

function Home() {
  return (
    <div className="min-h-screen text-zinc-100">
      <section className="relative overflow-hidden px-4 pb-16 pt-24 md:pb-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-orange-300/40 bg-orange-200/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-100">
            <Sparkles size={14} /> Members-Only Clubhouse Platform
          </div>
          <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h1 className="text-balance text-5xl font-black leading-[0.95] md:text-7xl">
                W.A.G.E. Society
              </h1>
              <p className="mt-6 max-w-2xl text-lg text-zinc-200 md:text-xl">
                The online clubhouse where live-streaming, entertainment, and
                community energy collide. Log in, jump into chat, share the
                next big link, and stay plugged into every live moment.
              </p>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <a
                  href="#membership"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-300 px-7 py-3 font-semibold text-zinc-950 transition hover:bg-orange-200"
                >
                  Join W.A.G.E. Society <ArrowRight size={18} />
                </a>
                <Link
                  to="/faq"
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-300/40 px-7 py-3 font-semibold text-zinc-100 transition hover:border-zinc-100"
                >
                  View Membership FAQ
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200/15 bg-zinc-900/70 p-7 backdrop-blur-xl">
              <p className="text-sm uppercase tracking-[0.2em] text-zinc-300">
                Tonight in the Club
              </p>
              <div className="mt-5 space-y-4">
                <LiveItem title="Headliner stream" time="8:00 PM ET" />
                <LiveItem title="Open chat aftershow" time="9:30 PM ET" />
                <LiveItem title="Clip exchange drop" time="10:00 PM ET" />
              </div>
              <div className="mt-7 flex items-center gap-3 rounded-2xl border border-orange-300/30 bg-orange-100/10 p-4 text-sm">
                <BadgeCheck size={18} className="text-orange-200" />
                Authenticated members unlock private rooms and creator lounges.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Clubhouse Experience
            </p>
            <h2 className="mt-3 text-4xl font-bold text-zinc-50 md:text-5xl">
              Built for real-time entertainment communities
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {experienceCards.map((card) => (
              <FeatureCard
                key={card.title}
                icon={card.icon}
                title={card.title}
                description={card.description}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto grid max-w-6xl gap-6 rounded-3xl border border-zinc-200/15 bg-zinc-900/70 p-8 md:grid-cols-3 md:p-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Live Metrics
            </p>
            <p className="mt-4 text-4xl font-black text-orange-200">12.4k</p>
            <p className="mt-2 text-zinc-300">Monthly active members</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Chat Velocity
            </p>
            <p className="mt-4 text-4xl font-black text-orange-200">48k</p>
            <p className="mt-2 text-zinc-300">Messages per live event</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Shared Links
            </p>
            <p className="mt-4 text-4xl font-black text-orange-200">6.7k</p>
            <p className="mt-2 text-zinc-300">Community discoveries each week</p>
          </div>
        </div>
      </section>

      <section id="membership" className="px-4 pb-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Membership
              </p>
              <h2 className="mt-3 text-4xl font-bold text-zinc-50 md:text-5xl">
                Choose your access level
              </h2>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-zinc-200/20 px-4 py-2 text-sm text-zinc-300 md:flex">
              <Users size={16} /> New rooms weekly
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {membershipTiers.map((tier) => (
              <MembershipCard key={tier.name} {...tier} />
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-200/15 px-4 py-10 text-center text-sm text-zinc-400">
        &copy; 2026 W.A.G.E. Society. Built for live entertainment communities.
      </footer>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="group rounded-2xl border border-zinc-200/15 bg-zinc-900/65 p-6 transition hover:-translate-y-1 hover:border-orange-300/40 hover:bg-zinc-900">
      <div className="mb-4 inline-flex rounded-xl border border-zinc-200/20 bg-zinc-950/70 p-3 text-orange-200">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-zinc-50">{title}</h3>
      <p className="mt-3 leading-relaxed text-zinc-300">{description}</p>
    </div>
  )
}

function MembershipCard({
  name,
  price,
  description,
  features,
  highlighted,
}: {
  name: string
  price: string
  description: string
  features: string[]
  highlighted?: boolean
}) {
  return (
    <div
      className={`flex flex-col rounded-2xl border p-6 ${
        highlighted
          ? 'border-orange-200/70 bg-orange-200/10 shadow-[0_0_0_1px_rgba(255,220,180,0.2)]'
          : 'border-zinc-200/15 bg-zinc-900/65'
      }`}
    >
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
      <button className="mt-8 rounded-xl border border-zinc-100/25 py-2.5 font-semibold text-zinc-50 transition hover:border-orange-200/60 hover:text-orange-100">
        {name === 'Creator Circle' ? 'Contact Team' : 'Start Membership'}
      </button>
    </div>
  )
}

function LiveItem({ title, time }: { title: string; time: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-zinc-200/15 px-4 py-3">
      <p className="font-medium text-zinc-100">{title}</p>
      <p className="text-sm text-orange-200">{time}</p>
    </div>
  )
}
