import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import Avatar from '../components/ui/Avatar';

type Row = {
  username: string; display_name: string | null; avatar_url: string | null;
  referral_tier: string; total_referrals: number; monthly_referrals: number;
};

const tierColor: Record<string, string> = {
  bronze: 'text-[#C68A4B]',
  silver: 'text-[#B6BCC8]',
  gold: 'text-wage-amber-2',
  diamond: 'text-wage-silver',
};

export default function Leaderboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('wagesociety_leaderboard').select('*')
      .then(({ data }) => { setRows((data as Row[]) ?? []); setLoading(false); });
  }, []);

  return (
    <section className="mx-auto max-w-3xl px-5 py-14">
      <PageHeader
        eyebrow="Referrals"
        title="Leaderboard"
        lede="Creators who brought the most people into the network this month."
      />

      <div className="mt-9">
        {loading ? (
          <div className="grid gap-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="wage-card h-[66px] animate-pulse" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No referrals yet this month."
            detail="Share your referral link and you'll be first on this board."
            action={<Link to="/referrals" className="wage-btn wage-btn-ghost">Get your link</Link>}
          />
        ) : (
          <>
            <div className="grid grid-cols-[36px_1fr_auto_auto] gap-4 border-b border-wage-line px-4 pb-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-wage-muted-2">
              <span>#</span><span>Creator</span><span>Tier</span><span className="text-right">This month</span>
            </div>
            <ol>
              {rows.map((r, i) => (
                <li key={r.username}>
                  <Link
                    to={`/creators/${r.username}`}
                    className="grid grid-cols-[36px_1fr_auto_auto] items-center gap-4 border-b border-wage-line px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
                  >
                    <span className={`wage-num text-[15px] ${i === 0 ? 'text-wage-amber-2' : 'text-wage-muted-2'}`}>
                      {i + 1}
                    </span>
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar name={r.display_name || r.username} src={r.avatar_url} size={34} />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold">
                          {r.display_name || r.username}
                        </span>
                        <span className="block truncate font-mono text-[11.5px] text-wage-muted-2">
                          {r.total_referrals} all time
                        </span>
                      </span>
                    </span>
                    <span className={`font-mono text-[10.5px] uppercase tracking-[0.14em] ${tierColor[r.referral_tier?.toLowerCase()] ?? 'text-wage-muted-2'}`}>
                      {r.referral_tier}
                    </span>
                    <span className="wage-num text-right text-[18px] text-wage-amber-2">{r.monthly_referrals}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
