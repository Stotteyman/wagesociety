import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, CheckCircle, ChevronDown, ChevronUp, ExternalLink, ImageOff, Link2, Loader2, RefreshCcw, ShoppingBag, Store, Trash2, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { authedFetch } from '../lib/supabaseBrowser'
import { requireAuthenticatedRoute } from '../lib/routeAuth'

type ImportedProduct = {
  name: string
  price: string
  description: string
  imageUrl: string | null
  images: string[]
  sourceUrl: string
  brand: string | null
  availability: string | null
  currency: string | null
  rating: number | null
  reviewCount: number | null
  sku: string | null
  confidence: 'high' | 'medium' | 'low'
  signals: string[]
}

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

// ---------------------------------------------------------------------------
// URL Import Panel
// ---------------------------------------------------------------------------

function ConfidenceBadge({ confidence }: { confidence: ImportedProduct['confidence'] }) {
  const map = {
    high: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-300',
    medium: 'border-amber-400/50 bg-amber-500/10 text-amber-300',
    low: 'border-rose-400/50 bg-rose-500/10 text-rose-300',
  } as const
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${map[confidence]}`}>
      {confidence === 'high' ? <CheckCircle size={11} /> : confidence === 'low' ? <XCircle size={11} /> : null}
      {confidence.toUpperCase()} confidence
    </span>
  )
}

function ImportPanel({
  onApplyToMerch,
}: {
  onApplyToMerch: (data: { name: string; price: string; description: string }) => void
}) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [product, setProduct] = useState<ImportedProduct | null>(null)
  const [showSignals, setShowSignals] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleImport = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')
    setProduct(null)

    try {
      const res = await authedFetch('/api/admin/shop/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      const data = (await res.json()) as { product?: ImportedProduct; error?: string }
      if (!res.ok || !data.product) {
        setError(data.error || 'Could not extract product data.')
        return
      }
      setProduct(data.product)
      setEditName(data.product.name)
      setEditPrice(data.product.price)
      setEditDescription(data.product.description)
      setSelectedImage(data.product.imageUrl)
    } catch {
      setError('Request failed. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setProduct(null)
    setError('')
    setUrl('')
    setEditName('')
    setEditPrice('')
    setEditDescription('')
    setSelectedImage(null)
    inputRef.current?.focus()
  }

  return (
    <section className="rounded-2xl border border-indigo-400/20 bg-indigo-950/30 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Link2 size={18} className="text-indigo-300" />
        <h2 className="text-xl font-bold text-zinc-50">Import from URL</h2>
        <span className="ml-2 rounded-full border border-indigo-400/40 px-2 py-0.5 text-xs font-semibold text-indigo-300">BETA</span>
      </div>
      <p className="mb-4 text-sm text-zinc-400">Paste any product listing URL (Amazon, Shopify, Etsy, etc.) and we'll extract the title, price, and description automatically.</p>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleImport() }}
          placeholder="https://www.amazon.com/dp/..."
          className="flex-1 rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={loading || !url.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
          {loading ? 'Extracting...' : 'Extract'}
        </button>
        {product ? (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg border border-zinc-200/20 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100"
          >
            Clear
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
      ) : null}

      {product ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_280px]">
          {/* Editable fields */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <ConfidenceBadge confidence={product.confidence} />
              {product.brand ? <span className="text-xs text-zinc-400">Brand: <strong className="text-zinc-200">{product.brand}</strong></span> : null}
              {product.availability ? <span className="text-xs text-zinc-400">Availability: <strong className="text-zinc-200">{product.availability}</strong></span> : null}
              {product.rating ? <span className="text-xs text-zinc-400">⭐ {product.rating} {product.reviewCount ? `(${product.reviewCount.toLocaleString()} reviews)` : ''}</span> : null}
              <a
                href={product.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs text-indigo-400 hover:underline"
              >
                <ExternalLink size={11} /> View source
              </a>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Product Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Price</label>
              <input
                type="text"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                placeholder="e.g. $29.99"
                className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Description <span className="text-zinc-500">(editable before saving)</span></label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowSignals((s) => !s)}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
            >
              {showSignals ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showSignals ? 'Hide' : 'Show'} extraction signals ({product.signals.length})
            </button>
            {showSignals ? (
              <div className="rounded-lg border border-zinc-200/10 bg-zinc-950/40 px-3 py-2">
                <ul className="space-y-0.5">
                  {product.signals.map((s, i) => (
                    <li key={i} className="text-xs text-zinc-400">✓ {s}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                onClick={() => onApplyToMerch({ name: editName, price: editPrice, description: editDescription })}
                className="rounded-lg bg-orange-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200"
              >
                → Fill Merch Form
              </button>
              <p className="self-center text-xs text-zinc-500">Review and save in the Merch Items form below.</p>
            </div>
          </div>

          {/* Image picker */}
          <div>
            <label className="mb-2 block text-xs font-medium text-zinc-400">Product Images</label>
            {product.images.length === 0 ? (
              <div className="flex h-40 items-center justify-center rounded-lg border border-zinc-200/10 bg-zinc-950/40">
                <div className="text-center text-zinc-600">
                  <ImageOff size={24} className="mx-auto mb-1" />
                  <p className="text-xs">No images found</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedImage ? (
                  <div className="overflow-hidden rounded-lg border border-zinc-200/15">
                    <img
                      src={selectedImage}
                      alt="Selected product"
                      className="h-48 w-full object-contain bg-zinc-950"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  </div>
                ) : null}
                {product.images.length > 1 ? (
                  <div className="grid grid-cols-4 gap-1">
                    {product.images.slice(0, 8).map((img, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedImage(img)}
                        className={`overflow-hidden rounded border-2 transition ${
                          selectedImage === img ? 'border-indigo-400' : 'border-zinc-200/10 hover:border-zinc-200/30'
                        }`}
                      >
                        <img
                          src={img}
                          alt={`Product image ${i + 1}`}
                          className="h-12 w-full object-cover bg-zinc-950"
                          onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
                {selectedImage ? (
                  <p className="break-all text-xs text-zinc-500">{selectedImage}</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

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

        <ImportPanel
          onApplyToMerch={({ name, price, description }) => {
            setMerchForm((prev) => ({ ...prev, id: '', name, price, description }))
            // Scroll to merch form
            document.getElementById('merch-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        />

        <section className="grid gap-6 lg:grid-cols-2">
          <article id="merch-form-section" className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6">
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

        <section className="grid gap-5">
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
        </section>
      </div>
    </div>
  )
}
