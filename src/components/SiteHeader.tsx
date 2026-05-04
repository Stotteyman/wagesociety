import { Link, useNavigate } from '@tanstack/react-router'
import { LogOut, Menu, UserCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { endLocalRootSession, getLocalRootUser, isLocalRootSessionActive } from '../lib/localRootSession'
import { getSupabaseBrowserClient } from '../lib/supabaseBrowser'

const navLinks = [
  { label: 'Shop', to: '/merch' as const },
  { label: 'Livestream', to: '/live' as const },
  { label: 'Directory', to: '/directory' as const },
  { label: 'Blog', to: '/news' as const },
]

export function SiteHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    const checkAuth = async () => {
      if (isLocalRootSessionActive()) {
        setUser(getLocalRootUser())
        setAuthLoading(false)
        return
      }

      try {
        const { data } = await supabase.auth.getSession()
        setUser(data.session?.user || null)
      } catch {
        setUser(null)
      } finally {
        setAuthLoading(false)
      }
    }

    void checkAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isLocalRootSessionActive()) {
        setUser(getLocalRootUser())
        setAuthLoading(false)
        return
      }

      setUser(session?.user || null)
      setAuthLoading(false)
    })

    const handleResume = () => {
      void checkAuth()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleResume)
      document.addEventListener('visibilitychange', handleResume)
    }

    return () => {
      subscription.unsubscribe()
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleResume)
        document.removeEventListener('visibilitychange', handleResume)
      }
    }
  }, [])

  const handleLogout = async () => {
    try {
      if (isLocalRootSessionActive()) {
        endLocalRootSession()
        setUser(null)
        setMobileMenuOpen(false)
        await navigate({ to: '/' })
        return
      }

      const supabase = getSupabaseBrowserClient()
      await supabase.auth.signOut()
      setUser(null)
      setMobileMenuOpen(false)
      await navigate({ to: '/' })
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  return (
    <header className="sticky top-3 z-20 rounded-2xl border border-zinc-200/15 bg-zinc-900/90 p-3 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="text-sm font-black tracking-[0.16em] text-orange-200 sm:text-base">
          W.A.G.E. SOCIETY
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {navLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {authLoading ? (
            <div className="h-8 w-32 animate-pulse rounded-lg bg-zinc-800" />
          ) : user ? (
            <>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800"
              >
                <UserCircle size={15} /> Profile
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-300 px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200"
              >
                <LogOut size={15} /> Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-lg border border-zinc-100/20 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:border-orange-200/70"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="rounded-lg bg-orange-300 px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen((value) => !value)}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-100/20 p-2 text-zinc-100 md:hidden"
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {mobileMenuOpen ? (
        <div className="mt-3 grid gap-2 border-t border-zinc-200/15 pt-3 md:hidden">
          {navLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg bg-zinc-800/80 px-3 py-2 text-sm font-medium text-zinc-100"
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-1 grid grid-cols-2 gap-2">
            {authLoading ? (
              <div className="col-span-2 h-9 animate-pulse rounded-lg bg-zinc-800" />
            ) : user ? (
              <>
                <Link
                  to="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg bg-zinc-800/80 px-3 py-2 text-center text-sm font-semibold text-zinc-100"
                >
                  Profile
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg bg-orange-300 px-3 py-2 text-center text-sm font-semibold text-zinc-950"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg border border-zinc-100/20 px-3 py-2 text-center text-sm font-semibold text-zinc-100"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg bg-orange-300 px-3 py-2 text-center text-sm font-semibold text-zinc-950"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  )
}
