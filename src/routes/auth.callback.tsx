import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { getSupabaseBrowserClient } from '../lib/supabaseBrowser'

type CallbackState =
  | { status: 'processing'; message: string }
  | { status: 'error'; message: string }

function getPostAuthPath(metadata: Record<string, unknown> | undefined) {
  return '/dashboard'
}

function normalizeProviderKey(provider: string) {
  const normalized = String(provider || '').trim().toLowerCase()
  return normalized === 'custom:kick' ? 'kick' : normalized
}

export const Route = createFileRoute('/auth/callback')({
  head: () => ({
    meta: [
      { title: 'Signing in - W.A.G.E. Society' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AuthCallbackPage,
})

function AuthCallbackPage() {
  const navigate = useNavigate()
  const [state, setState] = useState<CallbackState>({
    status: 'processing',
    message: 'Completing secure sign-in...',
  })

  const callbackParams = useMemo(() => {
    if (typeof window === 'undefined') return { code: null, hash: '', linkedProvider: null }
    const params = new URLSearchParams(window.location.search)
    return {
      code: params.get('code'),
      hash: window.location.hash.slice(1),
      linkedProvider: params.get('linked'),
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    let active = true

    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        const searchParams = new URLSearchParams(window.location.search)
        const oauthError = searchParams.get('error_description') || searchParams.get('error')
        const linkedProvider = callbackParams.linkedProvider

        if (oauthError) {
          if (linkedProvider) {
            const redirectUrl = `/settings?linked=${encodeURIComponent(linkedProvider)}&error_description=${encodeURIComponent(oauthError)}`

            if (window.opener && !window.opener.closed) {
              window.opener.postMessage(
                {
                  type: 'oauth-link-complete',
                  status: 'error',
                  provider: linkedProvider,
                  message: oauthError,
                },
                window.location.origin,
              )
              window.close()
              return
            }

            window.location.assign(redirectUrl)
            return
          }

          throw new Error(oauthError)
        }

        const hashParams = new URLSearchParams(callbackParams.hash)
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (error) throw error
        } else if (callbackParams.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(callbackParams.code)
          if (error) throw error
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        let user = sessionData.session?.user || null

        if (!user) {
          // On some browsers the auth session event can lag briefly after redirect.
          user = await new Promise<typeof user>((resolve) => {
            const timeoutId = window.setTimeout(() => {
              subscription?.unsubscribe()
              resolve(null)
            }, 3000)

            let subscription: ReturnType<typeof supabase.auth.onAuthStateChange>['data']['subscription'] | null = null
            const listener = supabase.auth.onAuthStateChange((_event, nextSession) => {
              if (nextSession?.user) {
                window.clearTimeout(timeoutId)
                subscription?.unsubscribe()
                resolve(nextSession.user)
              }
            })

            subscription = listener.data.subscription
          })
        }

        if (!user) {
          throw new Error('Sign-in did not complete. Please try again.')
        }

        if (linkedProvider) {
          const normalizedTarget = normalizeProviderKey(linkedProvider)
          const linkedNow = (user.identities || []).some((identity) => {
            return normalizeProviderKey(String(identity.provider || '')) === normalizedTarget
          })

          if (!linkedNow) {
            throw new Error('OAuth callback completed, but the provider was not linked.')
          }

          const settingsUrl = `/settings?linked=${encodeURIComponent(linkedProvider)}`

          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(
              {
                type: 'oauth-link-complete',
                status: 'success',
                provider: linkedProvider,
              },
              window.location.origin,
            )
            window.close()
            return
          }

          window.location.assign(settingsUrl)
          return
        }

        // Remove callback query/hash tokens before moving on.
        window.history.replaceState({}, '', window.location.pathname)

        const target = getPostAuthPath(user.user_metadata as Record<string, unknown> | undefined)
        if (!active) return
        void navigate({ to: target as '/dashboard' | '/onboarding', replace: true })
      } catch (error) {
        if (!active) return
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not complete sign-in.',
        })
      }
    })()

    return () => {
      active = false
    }
  }, [callbackParams.code, callbackParams.hash, navigate])

  return (
    <main className="min-h-screen px-4 py-24 text-zinc-100">
      <section className="mx-auto max-w-xl rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Authentication</p>
        <h1 className="mt-4 text-2xl font-bold text-zinc-50">
          {state.status === 'processing' ? 'Signing you in...' : 'Sign-in issue'}
        </h1>
        <p className="mt-3 text-sm text-zinc-300">{state.message}</p>

        {state.status === 'error' ? (
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              to="/login"
              className="rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100"
            >
              Return to login
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  )
}
