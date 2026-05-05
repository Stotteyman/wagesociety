import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/merch')({
  head: () => ({
    meta: [
      { title: 'Merch — W.A.G.E. Society' },
      {
        name: 'description',
        content:
          'Official W.A.G.E. Society merch for creators, marketers, and entrepreneurs building in public.',
      },
    ],
  }),
  component: MerchPage,
})

type MerchItem = {
  id: string
  name: string
  price: string
  description: string
}

function MerchPage() {
  const [items, setItems] = useState<MerchItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/shop')
        const data = (await response.json()) as { merchItems?: MerchItem[] }

        if (!response.ok) {
          setItems([])
          return
        }

        setItems(data.merchItems || [])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="min-h-screen px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Organization Store</p>
              <h1 className="mt-2 text-3xl font-black text-zinc-50 md:text-4xl">W.A.G.E. Society Merch</h1>
              <p className="mt-3 max-w-2xl text-zinc-300">
                Gear for creators, marketers, and entrepreneurs executing daily.
              </p>
            </div>
            <Link
              to="/dashboard"
              className="rounded-lg border border-zinc-100/25 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
            >
              Home
            </Link>
          </div>
        </header>

        {loading ? <p className="text-zinc-300">Loading merch...</p> : null}

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <article key={item.name} className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5">
              <h2 className="text-xl font-bold text-zinc-50">{item.name}</h2>
              <p className="mt-2 text-sm text-zinc-300">{item.description}</p>
              <p className="mt-4 text-2xl font-black text-orange-200">{item.price}</p>
              <button
                type="button"
                className="mt-4 w-full rounded-lg border border-zinc-100/25 py-2 font-semibold text-zinc-100 transition hover:border-orange-200/70 hover:text-orange-100"
              >
                Coming Soon
              </button>
              <p className="mt-3 text-xs text-zinc-400">
                Purchases are governed by our{' '}
                <Link to="/terms" className="font-semibold text-orange-200 hover:text-orange-100">
                  Terms
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="font-semibold text-orange-200 hover:text-orange-100">
                  Privacy Policy
                </Link>
                .
              </p>
            </article>
          ))}

          {!loading && items.length === 0 ? (
            <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 md:col-span-2 xl:col-span-4">
              <h2 className="text-xl font-bold text-zinc-50">Coming soon</h2>
              <p className="mt-2 text-sm text-zinc-300">Merch drops are on the way. Check back soon.</p>
            </article>
          ) : null}
        </section>
      </div>
    </div>
  )
}
