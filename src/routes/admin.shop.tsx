import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, CreditCard, RefreshCcw, ShoppingBag, Store, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { authedFetch } from '../lib/supabaseBrowser'
import { requireAuthenticatedRoute } from '../lib/routeAuth'

type MerchItem = {
  id: string
  name: string
  price: string
  description: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

type MembershipPlan = {
  id: string
  slug: string
  name: string
  display_price: string
  price_cents: number
  description: string
  features: string[]
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

const emptyMerchForm = {
  id: '',
  name: '',
  price: '',
  description: '',
  sortOrder: 0,
  isActive: true,
}

const emptyPlanForm = {
  id: '',
  slug: '',
  name: '',
  displayPrice: '',
  priceCents: 0,
  description: '',
  featuresText: '',
  sortOrder: 0,
  isActive: true,
}

export const Route = createFileRoute('/admin/shop')({
  beforeLoad: async () => {
    await requireAuthenticatedRoute()
  },
  head: () => ({
    meta: [
      { title: 'Admin Shop — W.A.G.E. Society' },
      {
        name: 'description',
        content: 'Shop CRUD management center for merch and membership plans.',
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminShopPage,
})

function AdminShopPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [merchItems, setMerchItems] = useState<MerchItem[]>([])
  const [membershipPlans, setMembershipPlans] = useState<MembershipPlan[]>([])

  const [merchForm, setMerchForm] = useState(emptyMerchForm)
  const [planForm, setPlanForm] = useState(emptyPlanForm)

  const [savingMerch, setSavingMerch] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)

  const loadShopData = async () => {
    setError('')

    const [merchRes, plansRes] = await Promise.all([
      authedFetch('/api/admin/shop/merch'),
      authedFetch('/api/admin/shop/plans'),
    ])

    const merchJson = await merchRes.json()
    const plansJson = await plansRes.json()

    if (!merchRes.ok) {
      throw new Error(merchJson.error || 'Failed to load merch items')
    }

    if (!plansRes.ok) {
      throw new Error(plansJson.error || 'Failed to load membership plans')
    }

    setMerchItems(merchJson.items || [])
    setMembershipPlans(plansJson.plans || [])
  }

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true)
        await loadShopData()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load shop data')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleSaveMerch = async (event: React.FormEvent) => {
    event.preventDefault()
    setSavingMerch(true)
    setError('')

    try {
      const method = merchForm.id ? 'PUT' : 'POST'
      const res = await authedFetch('/api/admin/shop/merch', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: merchForm.id || undefined,
          name: merchForm.name,
          price: merchForm.price,
          description: merchForm.description,
          sortOrder: Number(merchForm.sortOrder),
          isActive: merchForm.isActive,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save merch item')

      setMerchForm(emptyMerchForm)
      await loadShopData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save merch item')
    } finally {
      setSavingMerch(false)
    }
  }

  const handleDeleteMerch = async (id: string) => {
    try {
      setError('')
      const res = await authedFetch('/api/admin/shop/merch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to delete merch item')

      if (merchForm.id === id) setMerchForm(emptyMerchForm)
      await loadShopData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete merch item')
    }
  }

  const handleSavePlan = async (event: React.FormEvent) => {
    event.preventDefault()
    setSavingPlan(true)
    setError('')

    try {
      const method = planForm.id ? 'PUT' : 'POST'
      const features = planForm.featuresText
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)

      const res = await authedFetch('/api/admin/shop/plans', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: planForm.id || undefined,
          slug: planForm.slug,
          name: planForm.name,
          displayPrice: planForm.displayPrice,
          priceCents: Number(planForm.priceCents),
          description: planForm.description,
          features,
          sortOrder: Number(planForm.sortOrder),
          isActive: planForm.isActive,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save membership plan')

      setPlanForm(emptyPlanForm)
      await loadShopData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save membership plan')
    } finally {
      setSavingPlan(false)
    }
  }

  const handleDeletePlan = async (id: string) => {
    try {
      setError('')
      const res = await authedFetch('/api/admin/shop/plans', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to delete membership plan')

      if (planForm.id === id) setPlanForm(emptyPlanForm)
      await loadShopData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete membership plan')
    }
  }

  return (
    <div className="min-h-screen px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Admin / Shop</p>
              <h1 className="mt-2 text-3xl font-black text-zinc-50 md:text-4xl">Shop CRUD Management</h1>
              <p className="mt-3 max-w-2xl text-zinc-300">
                Create, edit, and delete merch items and membership plans used across the website.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  void loadShopData()
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100"
              >
                <RefreshCcw size={16} /> Refresh
              </button>
              <Link
                to="/admin"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100"
              >
                <ArrowLeft size={16} /> Admin Hub
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </header>

        {error ? (
          <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
            <div className="mb-4 flex items-center gap-2 text-orange-100">
              <ShoppingBag size={18} />
              <h2 className="text-xl font-bold text-zinc-50">Merch Items</h2>
            </div>

            <form onSubmit={handleSaveMerch} className="space-y-3">
              <input
                type="text"
                value={merchForm.name}
                onChange={(event) => setMerchForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Item name"
                required
                className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100"
              />
              <input
                type="text"
                value={merchForm.price}
                onChange={(event) => setMerchForm((prev) => ({ ...prev, price: event.target.value }))}
                placeholder="$34"
                required
                className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100"
              />
              <textarea
                value={merchForm.description}
                onChange={(event) => setMerchForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Description"
                required
                className="min-h-24 w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="number"
                  min={0}
                  value={merchForm.sortOrder}
                  onChange={(event) => setMerchForm((prev) => ({ ...prev, sortOrder: Number(event.target.value) }))}
                  placeholder="Sort order"
                  className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100"
                />
                <label className="inline-flex items-center gap-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={merchForm.isActive}
                    onChange={(event) => setMerchForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                  />
                  Active
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={savingMerch}
                  className="rounded-lg bg-orange-300 px-4 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70"
                >
                  {savingMerch ? 'Saving...' : merchForm.id ? 'Update Item' : 'Create Item'}
                </button>
                {merchForm.id ? (
                  <button
                    type="button"
                    onClick={() => setMerchForm(emptyMerchForm)}
                    className="rounded-lg border border-zinc-100/30 px-4 py-2.5 font-semibold text-zinc-100"
                  >
                    Cancel Edit
                  </button>
                ) : null}
              </div>
            </form>

            {!loading ? (
              <div className="mt-6 space-y-3">
                {merchItems.map((item) => (
                  <div key={item.id} className="rounded-lg border border-zinc-200/15 bg-zinc-950/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-zinc-50">{item.name}</p>
                        <p className="text-sm text-zinc-300">{item.price}</p>
                        <p className="mt-1 text-xs text-zinc-400">{item.description}</p>
                        <p className="mt-1 text-xs text-zinc-500">Sort: {item.sort_order} · {item.is_active ? 'Active' : 'Inactive'}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setMerchForm({
                              id: item.id,
                              name: item.name,
                              price: item.price,
                              description: item.description,
                              sortOrder: item.sort_order,
                              isActive: item.is_active,
                            })
                          }
                          className="rounded border border-zinc-100/25 px-3 py-1 text-xs font-semibold text-zinc-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleDeleteMerch(item.id)
                          }}
                          className="rounded border border-rose-300/40 px-2 py-1 text-rose-200"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </article>

          <article className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
            <div className="mb-4 flex items-center gap-2 text-orange-100">
              <Store size={18} />
              <h2 className="text-xl font-bold text-zinc-50">Membership Plans</h2>
            </div>

            <form onSubmit={handleSavePlan} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={planForm.slug}
                  onChange={(event) => setPlanForm((prev) => ({ ...prev, slug: event.target.value }))}
                  placeholder="slug (e.g. all-access)"
                  required
                  className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100"
                />
                <input
                  type="text"
                  value={planForm.name}
                  onChange={(event) => setPlanForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Plan name"
                  required
                  className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={planForm.displayPrice}
                  onChange={(event) => setPlanForm((prev) => ({ ...prev, displayPrice: event.target.value }))}
                  placeholder="$19/mo"
                  required
                  className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100"
                />
                <input
                  type="number"
                  min={0}
                  value={planForm.priceCents}
                  onChange={(event) => setPlanForm((prev) => ({ ...prev, priceCents: Number(event.target.value) }))}
                  placeholder="1900"
                  required
                  className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100"
                />
              </div>
              <textarea
                value={planForm.description}
                onChange={(event) => setPlanForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Description"
                required
                className="min-h-24 w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100"
              />
              <textarea
                value={planForm.featuresText}
                onChange={(event) => setPlanForm((prev) => ({ ...prev, featuresText: event.target.value }))}
                placeholder={'Features (one per line)'}
                required
                className="min-h-24 w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="number"
                  min={0}
                  value={planForm.sortOrder}
                  onChange={(event) => setPlanForm((prev) => ({ ...prev, sortOrder: Number(event.target.value) }))}
                  placeholder="Sort order"
                  className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100"
                />
                <label className="inline-flex items-center gap-2 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={planForm.isActive}
                    onChange={(event) => setPlanForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                  />
                  Active
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={savingPlan}
                  className="rounded-lg bg-orange-300 px-4 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:opacity-70"
                >
                  {savingPlan ? 'Saving...' : planForm.id ? 'Update Plan' : 'Create Plan'}
                </button>
                {planForm.id ? (
                  <button
                    type="button"
                    onClick={() => setPlanForm(emptyPlanForm)}
                    className="rounded-lg border border-zinc-100/30 px-4 py-2.5 font-semibold text-zinc-100"
                  >
                    Cancel Edit
                  </button>
                ) : null}
              </div>
            </form>

            {!loading ? (
              <div className="mt-6 space-y-3">
                {membershipPlans.map((plan) => (
                  <div key={plan.id} className="rounded-lg border border-zinc-200/15 bg-zinc-950/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-zinc-50">{plan.name} ({plan.slug})</p>
                        <p className="text-sm text-zinc-300">{plan.display_price} · {plan.price_cents} cents</p>
                        <p className="mt-1 text-xs text-zinc-400">{plan.description}</p>
                        <p className="mt-1 text-xs text-zinc-400">{plan.features.join(' | ')}</p>
                        <p className="mt-1 text-xs text-zinc-500">Sort: {plan.sort_order} · {plan.is_active ? 'Active' : 'Inactive'}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setPlanForm({
                              id: plan.id,
                              slug: plan.slug,
                              name: plan.name,
                              displayPrice: plan.display_price,
                              priceCents: plan.price_cents,
                              description: plan.description,
                              featuresText: plan.features.join('\n'),
                              sortOrder: plan.sort_order,
                              isActive: plan.is_active,
                            })
                          }
                          className="rounded border border-zinc-100/25 px-3 py-1 text-xs font-semibold text-zinc-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleDeletePlan(plan.id)
                          }}
                          className="rounded border border-rose-300/40 px-2 py-1 text-rose-200"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <Link
            to="/merch"
            className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 transition hover:border-orange-300/40"
          >
            <div className="mb-3 inline-flex rounded-md border border-zinc-200/20 bg-zinc-950/70 p-2 text-orange-200">
              <ShoppingBag size={18} />
            </div>
            <h2 className="text-xl font-bold text-zinc-50">Open Merch Page</h2>
            <p className="mt-2 text-sm text-zinc-300">Preview public merch items after saving changes.</p>
          </Link>

          <Link
            to="/checkout"
            className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-5 transition hover:border-orange-300/40"
          >
            <div className="mb-3 inline-flex rounded-md border border-zinc-200/20 bg-zinc-950/70 p-2 text-orange-200">
              <CreditCard size={18} />
            </div>
            <h2 className="text-xl font-bold text-zinc-50">Open Checkout</h2>
            <p className="mt-2 text-sm text-zinc-300">Preview live plan data used in membership checkout.</p>
          </Link>
        </section>
      </div>
    </div>
  )
}
