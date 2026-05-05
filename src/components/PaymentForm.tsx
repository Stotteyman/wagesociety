import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AlertCircle, Loader } from 'lucide-react'
import { LEGAL_POLICY_LAST_UPDATED, LEGAL_POLICY_VERSION, writePolicyAcceptance } from '../lib/legalPolicies'
import { authedFetch, getSupabaseBrowserClient } from '../lib/supabaseBrowser'

interface PlanDetails {
  name: string
  slug: string
  price: number
  displayPrice: string
}

interface PaymentFormProps {
  plan: PlanDetails
  onSuccess: () => void
}

export function PaymentForm({ plan, onSuccess }: PaymentFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [acceptLegal, setAcceptLegal] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getUser()
        const user = data.user
        if (!user) return

        setEmail(user.email || '')

        const metadata = user.user_metadata as { full_name?: string; name?: string; username?: string } | undefined
        setFullName(metadata?.full_name || metadata?.name || metadata?.username || '')
      } catch {
        // Ignore and let user type manually.
      }
    })()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email) {
      setError('Please enter your account email.')
      return
    }

    if (!acceptLegal) {
      setError('Please accept the Terms and Privacy Policy before continuing.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const checkoutResponse = await authedFetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planSlug: plan.slug,
          email,
          name: fullName,
        }),
      })

      const checkoutData = (await checkoutResponse.json()) as {
        checkoutUrl?: string
        successUrl?: string
        updated?: boolean
        free?: boolean
        error?: string
      }

      if (!checkoutResponse.ok || checkoutData.error) {
        setError(checkoutData.error || 'Could not start checkout. Please try again.')
        setLoading(false)
        return
      }

      if (checkoutData.free || checkoutData.updated) {
        writePolicyAcceptance('checkout')
        onSuccess()
        return
      }

      if (checkoutData.checkoutUrl) {
        writePolicyAcceptance('checkout')
        window.location.href = checkoutData.checkoutUrl
        return
      }

      if (checkoutData.successUrl) {
        writePolicyAcceptance('checkout')
        window.location.href = checkoutData.successUrl
        return
      }

      setError('Missing Stripe checkout URL. Please try again.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-200">Account Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-4 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-200">Name (optional)</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-4 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
          placeholder="Your Name"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 flex gap-2 text-sm text-rose-200">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <label className="flex items-start gap-2 rounded-lg border border-zinc-200/15 bg-zinc-900/40 p-3 text-xs text-zinc-300">
        <input
          type="checkbox"
          checked={acceptLegal}
          onChange={(e) => setAcceptLegal(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I agree to the
          {' '}
          <Link to="/terms" className="font-semibold text-orange-200 hover:text-orange-100">
            Terms of Service
          </Link>
          {' '}
          and
          {' '}
          <Link to="/privacy" className="font-semibold text-orange-200 hover:text-orange-100">
            Privacy Policy
          </Link>
          {' '}
          (v{LEGAL_POLICY_VERSION}, updated {LEGAL_POLICY_LAST_UPDATED}).
        </span>
      </label>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-orange-300 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-70 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader size={18} className="animate-spin" /> Redirecting...
          </>
        ) : (
          `Continue to Stripe (${plan.displayPrice})`
        )}
      </button>

      <p className="text-xs text-zinc-400">
        You will complete payment on Stripe. Upgrades and downgrades are managed as recurring subscriptions.
      </p>
    </form>
  )
}
