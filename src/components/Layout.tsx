import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { useSession } from '../hooks/useSession';
import { useRole } from '../hooks/useRole';
import { captureRef } from '../lib/provision';

const nav = [
  { to: '/creators', label: 'Creators' },
  { to: '/streams', label: 'Streams' },
  { to: '/merch', label: 'Market' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/blog', label: 'Blog' },
  { to: '/faq', label: 'FAQ' },
];

type NetworkStats = { creators?: number; online_now?: number; live_now?: number };

export default function Layout() {
  const { session } = useSession();
  const { atLeast } = useRole();
  const { pathname } = useLocation();
  const [stats, setStats] = useState<NetworkStats>({});

  useEffect(() => { captureRef(); }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.from('wagesociety_home_stats').select('*').maybeSingle()
      .then(({ data }) => setStats((data as NetworkStats) ?? {}));
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-wage-line bg-wage-ink/75 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
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
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  isActive ? 'text-wage-paper' : 'text-wage-muted transition-colors hover:text-wage-paper'
                }
              >
                {n.label}
              </NavLink>
            ))}
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
                  className="wage-btn wage-btn-quiet !px-3 !py-1.5 text-[13.5px]"
                  onClick={() => supabase.auth.signOut()}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="wage-btn wage-btn-quiet !px-3 !py-1.5 text-[13.5px]">Sign in</Link>
                <Link to="/login" className="wage-btn wage-btn-primary !px-3.5 !py-1.5 text-[13.5px]">
                  Claim your handle
                </Link>
              </>
            )}
          </div>
        </div>
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
            We take <b className="text-wage-paper">0%</b>
          </span>
        </div>
      </div>

      <main className="flex-1" key={pathname}>
        <Outlet />
      </main>

      <footer className="border-t border-wage-line py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 text-sm text-wage-muted-2 sm:flex-row sm:justify-between">
          <div>
            <img
              src="/brand/wage-crest.png"
              alt="W.A.G.E. Society"
              width={512}
              height={512}
              className="h-9 w-9 opacity-80"
            />
            <div className="mt-2">We all gotta eat.</div>
          </div>
          <div className="flex gap-4">
            <Link to="/creators" className="hover:text-wage-paper">Directory</Link>
            <Link to="/blog" className="hover:text-wage-paper">Blog</Link>
            <Link to="/faq" className="hover:text-wage-paper">FAQ</Link>
          </div>
          <div>WAGE World built by Orange Duck Studios</div>
        </div>
      </footer>
    </div>
  );
}
