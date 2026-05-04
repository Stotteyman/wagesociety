import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, BadgeCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getClientAuthRedirectUrl } from '../lib/authRedirect'
import { isLocalhostClient, startLocalRootSession } from '../lib/localRootSession'
import { getSupabaseBrowserClient } from '../lib/supabaseBrowser'

type AuthView = 'login' | 'signup'

function getPostAuthPath(metadata: Record<string, unknown> | undefined) {
  return metadata?.onboarding_completed === true ? '/dashboard' : '/onboarding'
}

export function AuthPage({ view }: { view: AuthView }) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [notice, setNotice] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [usernameMessage, setUsernameMessage] = useState('')
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [busyAction, setBusyAction] = useState<'login' | 'signup' | null>(null)

  const isSignup = view === 'signup'

  useEffect(() => {
    void (async () => {
      if (view === 'login' && isLocalhostClient()) {
        startLocalRootSession()
        void navigate({ to: '/dashboard' })
        return
      }

      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        if (data.session?.user) {
          const userMeta = (data.session.user.user_metadata as Record<string, unknown> | undefined) || undefined
          void navigate({ to: getPostAuthPath(userMeta) as '/dashboard' | '/onboarding' })
        }
      } catch {
        // Ignore and stay on auth screen.
      }
    })()
  }, [navigate, view])

  const handleOAuth = async (provider: 'google' | 'discord' | 'apple') => {
    try {
      setError('')
      setBusyAction('login')
      const supabase = getSupabaseBrowserClient()
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getClientAuthRedirectUrl('/dashboard'),
        },
      })
      if (authError) throw authError
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not sign in with ${provider}.`)
      setBusyAction(null)
    }
  }

  const checkUsername = (value: string) => {
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current)
    const trimmed = value.trim()
    if (!trimmed) {
      setUsernameStatus('idle')
      setUsernameMessage('')
      return
    }
    const valid = /^[a-zA-Z0-9_-]{3,20}$/.test(trimmed)
    if (!valid) {
      setUsernameStatus('invalid')
      setUsernameMessage('3–20 characters. Letters, numbers, underscores, hyphens only.')
      return
    }
    setUsernameStatus('checking')
    setUsernameMessage('')
    usernameDebounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/check-username?username=${encodeURIComponent(trimmed)}`)

          if (!response.ok) {
            setUsernameStatus('idle')
            setUsernameMessage('Could not verify availability right now.')
            return
          }

          const data = (await response.json()) as { available?: boolean; reason?: string }
          if (data.available === true) {
            setUsernameStatus('available')
            setUsernameMessage('Username is available!')
          } else {
            setUsernameStatus('taken')
            setUsernameMessage(data.reason || 'Username is already taken.')
          }
        } catch {
          setUsernameStatus('idle')
          setUsernameMessage('')
        }
      })()
    }, 500)
  }

  const handleSignup = async () => {
    try {
      setError('')
      setNotice('')
      if (!name.trim()) {
        setError('Please enter a username.')
        return
      }
      if (usernameStatus === 'invalid') {
        setError('Username format is invalid. Use 3–20 letters, numbers, underscores, or hyphens.')
        return
      }
      if (usernameStatus === 'taken') {
        setError('That username is already taken. Please choose another.')
        return
      }
      if (usernameStatus !== 'available') {
        const checkResponse = await fetch(`/api/check-username?username=${encodeURIComponent(name.trim())}`)

        if (!checkResponse.ok) {
          // Do not block signup on temporary availability-check issues.
          setUsernameStatus('idle')
        } else {
        const checkData = (await checkResponse.json()) as { available?: boolean; reason?: string }
          if (!checkData.available) {
            setError(checkData.reason || 'That username is already taken. Please choose another.')
            return
          }
        }
      }
      setBusyAction('signup')
      const supabase = getSupabaseBrowserClient()
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: name.trim(),
            preferred_username: name.trim(),
            membership_plan: 'free',
            onboarding_completed: false,
          },
        },
      })
      if (authError) throw authError

      if (data.session?.user) {
        await navigate({ to: '/onboarding' })
      } else {
        setNotice('Account created. Check your email to confirm, then sign in to continue onboarding.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account. Please try again.')
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="min-h-screen px-4 py-12 text-zinc-100">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-black text-zinc-50 md:text-4xl">
            {isSignup ? 'Create Your Membership' : 'Member Login'}
          </h1>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300/35 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-100"
          >
            <ArrowLeft size={16} /> Back Home
          </Link>
        </div>

        <div className={`grid gap-8 ${isSignup ? 'lg:grid-cols-[1.25fr_0.75fr]' : ''}`}>
          {isSignup ? (
            <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">How Signup Works</p>
              <h2 className="mt-3 text-3xl font-bold text-zinc-50">Every new account starts on FREE</h2>
              <div className="mt-6 space-y-3 rounded-2xl border border-zinc-200/15 bg-zinc-950/40 p-5 text-sm text-zinc-300">
                <p className="flex items-start gap-2"><BadgeCheck size={14} className="mt-0.5 text-orange-200" /> Create your account or connect OAuth.</p>
                <p className="flex items-start gap-2"><BadgeCheck size={14} className="mt-0.5 text-orange-200" /> Get instant FREE access by default.</p>
                <p className="flex items-start gap-2"><BadgeCheck size={14} className="mt-0.5 text-orange-200" /> Complete onboarding: username + profile setup.</p>
                <p className="flex items-start gap-2"><BadgeCheck size={14} className="mt-0.5 text-orange-200" /> Choose to upgrade during onboarding if you want paid access.</p>
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-zinc-200/15 bg-zinc-900/60 p-6 md:p-8">
            {isSignup ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">New Account</p>
                <h2 className="mt-3 text-2xl font-bold text-zinc-50">Create your organization profile</h2>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Already a member?</p>
                <h2 className="mt-3 text-2xl font-bold text-zinc-50">Sign in to your dashboard</h2>
              </>
            )}
            <div className="mt-6 space-y-4">
              {isSignup ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-200">Username</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      checkUsername(event.target.value)
                    }}
                    className={`w-full rounded-lg border bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition ${
                      usernameStatus === 'available'
                        ? 'border-emerald-400/60 focus:border-emerald-300'
                        : usernameStatus === 'taken' || usernameStatus === 'invalid'
                        ? 'border-rose-400/60 focus:border-rose-300'
                        : 'border-zinc-200/20 focus:border-orange-200/70'
                    }`}
                    placeholder="your_username"
                    maxLength={20}
                    autoComplete="username"
                  />
                  {usernameMessage ? (
                    <p className={`mt-1 text-xs ${usernameStatus === 'available' ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {usernameStatus === 'checking' ? 'Checking availability...' : usernameMessage}
                    </p>
                  ) : usernameStatus === 'checking' ? (
                    <p className="mt-1 text-xs text-zinc-400">Checking availability...</p>
                  ) : null}
                </label>
              ) : null}
              {isSignup ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-200">Email Address</span>
                  <input
                    type="text"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                    placeholder="you@email.com"
                  />
                </label>
              ) : null}
              {isSignup ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-200">Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-zinc-200/20 bg-zinc-950/60 px-3 py-2 text-zinc-100 outline-none transition focus:border-orange-200/70"
                    placeholder="********"
                  />
                </label>
              ) : null}
            </div>

            {error ? (
              <p className="mt-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {error}
              </p>
            ) : null}

            {notice ? (
              <p className="mt-4 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {notice}
              </p>
            ) : null}

            <div className="mt-6 grid gap-3">
              {isSignup ? (
                <button
                  type="button"
                  onClick={handleSignup}
                  disabled={busyAction !== null || usernameStatus === 'taken' || usernameStatus === 'invalid' || usernameStatus === 'checking'}
                  className="rounded-lg bg-orange-300 px-4 py-2.5 font-semibold text-zinc-950 transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {busyAction === 'signup' ? 'Creating account...' : usernameStatus === 'checking' ? 'Checking username...' : 'Create Account'}
                </button>
              ) : null}
            </div>

            <div className="mt-5">
              <div className="relative flex items-center gap-3">
                <div className="h-px flex-1 bg-zinc-200/15" />
                <span className="text-xs text-zinc-500">or continue with</span>
                <div className="h-px flex-1 bg-zinc-200/15" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleOAuth('google')}
                  disabled={busyAction !== null}
                  className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200/20 bg-zinc-950/40 px-3 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-zinc-100/50 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Sign in with Google"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Google
                </button>
                <button
                  type="button"
                  onClick={() => handleOAuth('discord')}
                  disabled={busyAction !== null}
                  className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200/20 bg-zinc-950/40 px-3 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-zinc-100/50 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Sign in with Discord"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#5865F2" aria-hidden="true"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                  Discord
                </button>
                <button
                  type="button"
                  onClick={() => handleOAuth('apple')}
                  disabled={busyAction !== null}
                  className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200/20 bg-zinc-950/40 px-3 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-zinc-100/50 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Sign in with Apple"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.56-1.701z"/></svg>
                  Apple
                </button>
              </div>
              <div className="mt-2">
                <a
                  href="/api/kick-login"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200/20 bg-zinc-950/40 px-3 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-zinc-100/50"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#53FC18" aria-hidden="true"><path d="M2 2h5v8.5l5-8.5h6l-6 10 6 10h-6l-5-8.5V22H2z"/></svg>
                  Continue with Kick
                </a>
              </div>
            </div>
            {isSignup ? (
              <p className="mt-4 text-xs text-zinc-400">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => void navigate({ to: '/login' })}
                  className="font-semibold text-orange-200 underline underline-offset-4 transition hover:text-orange-100"
                >
                  Sign in instead
                </button>
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}