import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { useSession } from '../hooks/useSession';
import { useRole } from '../hooks/useRole';
import { captureRef } from '../lib/provision';
import AuthErrorNotice from './AuthErrorNotice';

/**
 * Navigation is split by how often a link is actually used.
 *
 * The header carries only the three places people go repeatedly. Everything else —
 * reference pages, membership, the leaderboard — lives under "More" and is repeated
 * in the footer, so nothing became harder to find by leaving the top bar.
 */
const PRIMARY = [
  { to: '/streams', label: 'Streams' },
  { to: '/merch', label: 'Market' },
];

// Tools is deliberately absent: it is member software, not a public page, and now
// lives on the dashboard where it can reflect what the signed-in person actually has.
const MORE = [
  { to: '/creators', label: 'Creators' },
  { to: '/plans', label: 'Plans' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/blog', label: 'Blog' },
  { to: '/faq', label: 'FAQ' },
  { to: '/why-10-percent', label: 'Why we take 10%' },
];

/** Footer groupings, so every destination has a permanent home. */
const FOOTER: { heading: string; links: { to: string; label: string }[] }[] = [
  {
    heading: 'Explore',
    links: [
      { to: '/creators', label: 'Creators' },
      { to: '/streams', label: 'Streams' },
      { to: '/merch', label: 'Market' },
      { to: '/leaderboard', label: 'Leaderboard' },
    ],
  },
  {
    heading: 'Membership',
    links: [
      { to: '/plans', label: 'Plans' },
      { to: '/verify', label: 'Join the Discord' },
      { to: '/dashboard', label: 'Your dashboard' },
    ],
  },
  {
    heading: 'Learn',
    links: [
      { to: '/blog', label: 'Blog' },
      { to: '/faq', label: 'FAQ' },
      { to: '/why-10-percent', label: 'Why we take 10%' },
      // Staff are recruited from the community, so the way in has to be findable
      // without someone happening to see the right Discord message.
      { to: '/join-the-team', label: 'Join the team' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { to: '/terms', label: 'Terms of service' },
      { to: '/privacy-policy', label: 'Privacy policy' },
    ],
  },
];

type NetworkStats = { creators?: number; online_now?: number; live_now?: number };

const linkSkin = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'text-wage-paper' : 'text-wage-muted transition-colors hover:text-wage-paper';

/** Overflow menu for the links that do not earn a permanent slot in the bar. */
function MoreMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Dismissable the three ways people expect: click away, Escape, or navigate.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex items-center gap-1.5 ${open ? 'text-wage-paper' : 'text-wage-muted transition-colors hover:text-wage-paper'}`}
      >
        More
        <span aria-hidden="true" className={`text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+12px)] min-w-[210px] border border-wage-line-hi bg-wage-ink py-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.5)]">
          {MORE.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `block px-4 py-2 text-[14px] ${
                  isActive ? 'bg-wage-amber/[0.10] text-wage-amber-2' : 'text-wage-muted hover:bg-wage-ink-2 hover:text-wage-paper'
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { session } = useSession();
  const { atLeast } = useRole();
  const { pathname } = useLocation();
  const [stats, setStats] = useState<NetworkStats>({});
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { captureRef(); }, []);

  // Close the mobile panel whenever the route changes, so a tap always lands on the page.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.from('wagesociety_home_stats').select('*').maybeSingle()
      .then(({ data }) => setStats((data as NetworkStats) ?? {}));
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-wage-line bg-wage-ink/75 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <Link to="/" className="flex items-center" aria-label="W.A.G.E. Society — home">
            {/* The crest is a complete lockup — it already carries the name, so
                no wordmark beside it. */}
            <img
              src="/brand/wage-crest.png"
              alt="W.A.G.E. Society"
              width={512}
              height={512}
              className="h-11 w-11"
            />
          </Link>

          <nav className="hidden items-center gap-6 text-[14.5px] lg:flex">
            {PRIMARY.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkSkin}>{n.label}</NavLink>
            ))}
            <MoreMenu />
          </nav>

          <div className="flex items-center gap-3">
            {session ? (
              <>
                {atLeast('staff') && (
                  <Link to="/admin" className="hidden text-sm text-wage-muted hover:text-wage-paper sm:inline">Admin</Link>
                )}
                <Link to="/settings" className="hidden text-sm text-wage-muted hover:text-wage-paper sm:inline">Settings</Link>
                <Link to="/dashboard" className="wage-btn wage-btn-ghost !px-3.5 !py-1.5 text-[13.5px]">Dashboard</Link>
                <button
                  className="wage-btn wage-btn-quiet hidden !px-3 !py-1.5 text-[13.5px] sm:inline-flex"
                  onClick={() => supabase.auth.signOut()}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="wage-btn wage-btn-quiet hidden !px-3 !py-1.5 text-[13.5px] sm:inline-flex">Sign in</Link>
                <Link to="/login" className="wage-btn wage-btn-primary !px-3.5 !py-1.5 text-[13.5px]">
                  Claim your handle
                </Link>
              </>
            )}

            {/* Below lg the nav is hidden, so without this the site has no navigation
                on a phone at all. */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className="grid h-9 w-9 place-items-center border border-wage-line-hi text-wage-muted transition-colors hover:text-wage-paper lg:hidden"
            >
              <span aria-hidden="true" className="text-[15px] leading-none">{menuOpen ? '✕' : '☰'}</span>
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav id="mobile-nav" className="border-t border-wage-line bg-wage-ink lg:hidden">
            <div className="mx-auto max-w-6xl px-5 py-3">
              {[...PRIMARY, ...MORE].map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    `block border-b border-wage-line/60 py-3 text-[15px] ${
                      isActive ? 'text-wage-amber-2' : 'text-wage-muted'
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
              {session ? (
                <div className="flex flex-wrap gap-2.5 pt-4">
                  <Link to="/settings" className="wage-btn wage-btn-ghost !px-3 !py-1.5 text-[13.5px]">Settings</Link>
                  {atLeast('staff') && (
                    <Link to="/admin" className="wage-btn wage-btn-ghost !px-3 !py-1.5 text-[13.5px]">Admin</Link>
                  )}
                  <button
                    className="wage-btn wage-btn-quiet !px-3 !py-1.5 text-[13.5px]"
                    onClick={() => supabase.auth.signOut()}
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="pt-4">
                  <Link to="/login" className="wage-btn wage-btn-quiet !px-3 !py-1.5 text-[13.5px]">Sign in</Link>
                </div>
              )}
            </div>
          </nav>
        )}
      </header>

      {/* Honest network state. Real numbers only — see BRAND_GUIDE §3 rule 3. */}
      <div className="border-b border-wage-line bg-gradient-to-r from-wage-amber/[0.06] to-transparent">
        <div className="mx-auto flex max-w-6xl items-center gap-6 overflow-x-auto px-5 py-2 font-mono text-[11.5px] tracking-[0.06em] text-wage-muted">
          <span className="whitespace-nowrap">
            <span
              className={`mr-2 inline-block h-[7px] w-[7px] rounded-full align-middle ${
                stats.live_now ? 'bg-wage-red shadow-[0_0_10px_#E43000]' : 'bg-wage-muted-2'
              }`}
            />
            {stats.live_now ?? 0} live now
          </span>
          <span className="whitespace-nowrap">Network <b className="text-wage-paper">{stats.creators ?? 0}</b> creators</span>
          <span className="whitespace-nowrap">Online <b className="text-wage-paper">{stats.online_now ?? 0}</b></span>
          <span className="ml-auto hidden whitespace-nowrap sm:inline">
            We take{' '}
            <Link
              to="/why-10-percent"
              title="Why we take 10%"
              className="font-bold text-wage-paper underline decoration-wage-amber decoration-2 underline-offset-4 transition-colors hover:text-wage-amber-2"
            >
              10%
            </Link>
          </span>
        </div>
      </div>

      {/* Catches an OAuth failure wherever the callback lands, not just on /login. */}
      <AuthErrorNotice key={pathname} />

      <main className="flex-1" key={pathname}>
        <Outlet />
      </main>

      <footer className="mt-16 border-t border-wage-line py-12">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <img
                src="/brand/wage-crest.png"
                alt="W.A.G.E. Society"
                width={512}
                height={512}
                className="h-10 w-10 opacity-80"
              />
              <div className="mt-3 text-[15px] text-wage-muted">We all gotta eat.</div>
            </div>

            {FOOTER.map((col) => (
              <div key={col.heading}>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">
                  {col.heading}
                </div>
                <ul className="mt-3 grid gap-2">
                  {col.links.map((l) => (
                    <li key={l.to}>
                      <Link to={l.to} className="text-[14.5px] text-wage-muted transition-colors hover:text-wage-paper">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 border-t border-wage-line pt-5 text-[13px] text-wage-muted-2">
            WAGE World built by Orange Duck Studios
          </div>
        </div>
      </footer>
    </div>
  );
}
