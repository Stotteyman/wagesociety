import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { isLocalRootSessionActive } from '../lib/localRootSession'
import { formatRoleLabel, type OrgRole } from '../lib/orgAccess'
import { getSupabaseBrowserClient } from '../lib/supabaseBrowser'
import { getStoredViewAsRole, setStoredViewAsRole } from '../lib/viewAs'
import { SiteHeader } from '../components/SiteHeader'

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
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
          <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-12 pt-5 sm:px-6 lg:px-8">
            <SiteHeader />
            {children}
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
