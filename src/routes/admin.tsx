import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Store, Users, RadioTower, ShoppingBag, CreditCard, CircleHelp } from 'lucide-react'
import { requireAuthenticatedRoute } from '../lib/routeAuth'

const adminLinks = [
  {
    title: 'Users & Permissions',
    description: 'Manage member roles, bans, and permission matrix controls.',
    to: '/admin/users' as const,
    icon: Users,
  },
  {
    title: 'Shop CRUD',
    description: 'Create and edit merch items and membership plans.',
    to: '/admin/shop' as const,
    icon: Store,
  },
  {
    title: 'Livestreams',
    description: 'Add/remove stream channels and monitor live status.',
    to: '/live' as const,
    icon: RadioTower,
  },
  {
    title: 'Merch Page',
    description: 'Open the public merch storefront.',
    to: '/merch' as const,
    icon: ShoppingBag,
  },
  {
    title: 'Checkout Page',
    description: 'Open the membership checkout experience.',
    to: '/checkout' as const,
    icon: CreditCard,
  },
  {
    title: 'FAQ Page',
    description: 'Open the FAQ page used by members and visitors.',
    to: '/faq' as const,
    icon: CircleHelp,
  },
]

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    await requireAuthenticatedRoute()
  },
  head: () => ({
    meta: [
      { title: 'Admin Hub — W.A.G.E. Society' },
      {
        name: 'description',
        content: 'Central admin hub for users, shop, streams, and website feature management.',
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminHubPage,
})

function AdminHubPage() {
  return (
    <div className="min-h-screen px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Organization Control Center</p>
              <h1 className="mt-2 text-3xl font-black text-zinc-50 md:text-4xl">Admin Hub</h1>
              <p className="mt-3 max-w-2xl text-zinc-300">
                One button per function. Use this panel to jump directly to each admin operation.
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100"
              >
                <ArrowLeft size={16} /> Dashboard
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {adminLinks.map((item) => {
            const Icon = item.icon

            return (
              <Link
                key={item.title}
                to={item.to}
                className="group rounded-xl border border-zinc-200/15 bg-zinc-900/60 p-5 transition hover:border-orange-300/50"
              >
                <div className="mb-3 inline-flex rounded-md border border-zinc-200/20 bg-zinc-950/70 p-2 text-orange-200 transition group-hover:border-orange-300/40">
                  <Icon size={18} />
                </div>
                <h2 className="text-xl font-bold text-zinc-50">{item.title}</h2>
                <p className="mt-2 text-sm text-zinc-300">{item.description}</p>
                <span className="mt-4 inline-flex rounded-lg border border-zinc-100/25 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-100 transition group-hover:border-orange-300/55 group-hover:text-orange-100">
                  Open
                </span>
              </Link>
            )
          })}
        </section>
      </div>
    </div>
  )
}
