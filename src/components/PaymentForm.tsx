import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useState } from 'react'
import { AlertCircle, Loader } from 'lucide-react'

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
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [cardName, setCardName] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      setError('Payment system not ready. Please refresh and try again.')
      return
    }

    if (!email || !cardName) {
      setError('Please enter email and cardholder name.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const cardElement = elements.getElement(CardElement)

      if (!cardElement) {
        setError('Card element not found. Please refresh.')
        setLoading(false)
        return
      }

      // Create a payment intent on the server
      const intentResponse = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planSlug: plan.slug,
          email,
          name: cardName,
        }),
      })

      const intentData = (await intentResponse.json()) as {
        clientSecret?: string
        free?: boolean
        error?: string
      }

      if (!intentResponse.ok || intentData.error) {
        setError(intentData.error || 'Could not create payment. Please try again.')
        setLoading(false)
        return
      }

      // Free plan — skip card confirmation
      if (intentData.free) {
        onSuccess()
        return
      }

      if (!intentData.clientSecret) {
        setError('Missing payment client secret. Please try again.')
        setLoading(false)
        return
      }

      const result = await stripe.confirmCardPayment(intentData.clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: { name: cardName, email },
        },
      })

      if (result.error) {
        setError(result.error.message || 'Payment failed. Please try again.')
        return
      }

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-200">Email</label>
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
        <label className="mb-2 block text-sm font-medium text-zinc-200">Cardholder Name</label>
        <input
          type="text"
          value={cardName}
          onChange={(e) => setCardName(e.target.value)}
          required
          className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-4 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
          placeholder="Full Name"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-200">Card Details</label>
        <div className="rounded-lg border border-zinc-200/20 bg-zinc-950/60 p-4">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#f4f4f5',
                  '::placeholder': {
                    color: '#71717a',
                  },
                },
                invalid: {
                  color: '#fca5a5',
                },
              },
            }}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 flex gap-2 text-sm text-rose-200">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !stripe}
        className="w-full rounded-lg bg-orange-300 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-70 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader size={18} className="animate-spin" /> Processing...
          </>
        ) : (
          `Pay ${plan.displayPrice}`
        )}
      </button>

      <p className="text-xs text-zinc-400">
        Payments are securely processed by Stripe. Your card details are never stored on our servers.
      </p>
    </form>
  )
}
