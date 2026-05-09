import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { isLocalRootSessionActive } from '../lib/localRootSession'
import { LEGAL_POLICY_LAST_UPDATED, LEGAL_POLICY_VERSION } from '../lib/legalPolicies'
import { formatRoleLabel, type OrgRole } from '../lib/orgAccess'
import { getSupabaseBrowserClient } from '../lib/supabaseBrowser'
import { getStoredViewAsRole, setStoredViewAsRole } from '../lib/viewAs'
import { SiteHeader } from '../components/SiteHeader'
import { OAuthCallbackHandler } from '../components/OAuthCallbackHandler'
import { useNavigate } from '@tanstack/react-router'

import '../styles.css'

const SITE_URL = 'https://playful-torte-0c9af1.netlify.app'
const SITE_NAME = 'W.A.G.E. Society'
const SITE_DESCRIPTION =
  'A modern organization for content creators, online marketers, and entrepreneurs. Join W.A.G.E. Society for strategy, systems, and community accountability.'
const OG_IMAGE = `${SITE_URL}/og-image.svg`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: SITE_NAME },
      { name: 'description', content: SITE_DESCRIPTION },
      { name: 'robots', content: 'index, follow' },
      { name: 'theme-color', content: '#fb923c' },
      // Open Graph
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:title', content: SITE_NAME },
      { property: 'og:description', content: SITE_DESCRIPTION },
      { property: 'og:image', content: OG_IMAGE },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'W.A.G.E. Society — Creator Growth Organization' },
      { property: 'og:url', content: SITE_URL },
      // Twitter / X
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: SITE_NAME },
      { name: 'twitter:description', content: SITE_DESCRIPTION },
      { name: 'twitter:image', content: OG_IMAGE },
      { name: 'twitter:image:alt', content: 'W.A.G.E. Society — Creator Growth Organization' },
    ],
    links: [
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml', sizes: 'any' },
      { rel: 'apple-touch-icon', href: '/favicon.svg' },
      { rel: 'manifest', href: '/site.webmanifest' },
      { rel: 'canonical', href: SITE_URL },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const [pageReady, setPageReady] = useState(false)
  const [viewingAs, setViewingAs] = useState<OrgRole | null>(null)
  const navigate = useNavigate()

  // Handle OAuth deep link callback from Android (com.wagesociety.android://login-callback#access_token=...)
  useEffect(() => {
    if (typeof window === 'undefined') return

    // @ts-expect-error Capacitor is injected at runtime in native apps.
    const cap = window.Capacitor
    if (!cap?.isNativePlatform?.()) return

    let cleanupFn: (() => void) | null = null

    void (async () => {
      try {
        const { App } = await import('@capacitor/app')
        const { Browser } = await import('@capacitor/browser')

        const listener = await App.addListener('appUrlOpen', async (event: { url: string }) => {
          const url = event.url
          if (!url.startsWith('com.wagesociety.android://login-callback')) return

          // Close the system browser tab.
          await Browser.close().catch(() => {})

          // Supabase embeds tokens in the hash fragment.
          const hash = url.includes('#') ? url.split('#')[1] : ''
          const params = new URLSearchParams(hash)
          const accessToken = params.get('access_token')
          const refreshToken = params.get('refresh_token')

          if (accessToken && refreshToken) {
            const supabase = getSupabaseBrowserClient()
            const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
            if (!error) {
              const { data } = await supabase.auth.getUser()
              const meta = (data?.user?.user_metadata as Record<string, unknown> | undefined) || {}
              const dest = meta.onboarding_completed === true ? '/dashboard' : '/onboarding'
              void navigate({ to: dest as '/dashboard' | '/onboarding' })
            }
          }
        })

        cleanupFn = () => {
          listener.remove().catch(() => {})
        }
      } catch {
        // Not running in Capacitor — safe to ignore.
      }
    })()

    return () => {
      cleanupFn?.()
    }
  }, [navigate])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW registration failure is non-fatal
      })
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const markReady = () => setPageReady(true)

    if (document.readyState === 'complete') {
      markReady()
      return
    }

    window.addEventListener('load', markReady, { once: true })

    return () => {
      window.removeEventListener('load', markReady)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const syncViewAs = () => {
      setViewingAs(getStoredViewAsRole())
    }

    syncViewAs()
    window.addEventListener('storage', syncViewAs)

    return () => {
      window.removeEventListener('storage', syncViewAs)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const host = window.location.hostname
    const pathname = window.location.pathname
    const isLocalhost = host === 'localhost' || host === '127.0.0.1'

    if (!isLocalhost || pathname !== '/') return

    // Redirect immediately if local root session is active
    if (isLocalRootSessionActive()) {
      window.location.replace('/dashboard')
      return
    }

    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()

        if (data.session?.user) {
          window.location.replace('/dashboard')
        }
      } catch {
        // Stay on homepage when local auth is not available.
      }
    })()
  }, [])

  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'W.A.G.E. Society',
              url: 'https://wagesociety.com',
              logo: 'https://wagesociety.com/favicon.svg',
              description:
                'A modern organization for content creators, online marketers, and entrepreneurs. Join W.A.G.E. Society for strategy, systems, and community accountability.',
              sameAs: [],
              contactPoint: {
                '@type': 'ContactPoint',
                contactType: 'customer support',
                email: 'appeals@wagesociety.com',
              },
            }),
          }}
        />
      </head>
      <body>
        <OAuthCallbackHandler />
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
          <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-12 pt-5 sm:px-6 lg:px-8">
            <SiteHeader />
            {children}
            <footer className="mt-10 border-t border-zinc-200/10 pt-5 text-xs text-zinc-400">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>Policy v{LEGAL_POLICY_VERSION} · Updated {LEGAL_POLICY_LAST_UPDATED}</p>
                <div className="flex items-center gap-3">
                  <a href="/privacy" className="transition hover:text-zinc-200">Privacy</a>
                  <span aria-hidden="true">·</span>
                  <a href="/terms" className="transition hover:text-zinc-200">Terms</a>
                </div>
              </div>
            </footer>
          </div>
        </div>
        {viewingAs ? (
          <div className="fixed right-4 top-4 z-[10000] flex items-center gap-3 rounded-lg border border-rose-300/60 bg-rose-600/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-50 shadow-lg shadow-rose-900/40">
            <span>VIEWING AS ({formatRoleLabel(viewingAs)})</span>
            <button
              type="button"
              onClick={() => {
                setStoredViewAsRole(null)
                setViewingAs(null)
                if (typeof window !== 'undefined') {
                  window.location.reload()
                }
              }}
              className="rounded border border-rose-100/50 px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-rose-50 transition hover:border-white"
            >
              Reset
            </button>
          </div>
        ) : null}
        {!pageReady ? (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950/95 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="h-14 w-14 animate-spin rounded-full border-4 border-zinc-600 border-t-orange-300" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">W.A.G.E. Society</p>
                <p className="mt-2 text-lg font-semibold text-zinc-100">Loading your workspace...</p>
              </div>
            </div>
          </div>
        ) : null}
        <Scripts />
      </body>
    </html>
  )
}
