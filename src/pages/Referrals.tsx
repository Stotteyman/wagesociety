import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import StatTile from '../components/ui/StatTile';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import { referralUrl } from '../lib/site';

type Data = {
  code: string; points: number; total: number; tier: string;
  referrals: { name: string | null; username: string | null; status: string; at: string }[];
  transactions: { amount: number; type: string; description: string; at: string }[];
};

export default function Referrals() {
  const [d, setD] = useState<Data | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { supabase.rpc('ws_my_referrals').then(({ data }) => setD(data as Data)); }, []);

  if (!d) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <div className="wage-card h-[220px] animate-pulse" />
      </div>
    );
  }

  const link = referralUrl(d.code);

  return (
    <section className="mx-auto max-w-3xl px-5 py-14">
      <PageHeader
        eyebrow="Your network"
        title="Referrals"
        lede="Invite creators, earn points, climb the leaderboard."
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Points"
          value={d.points ?? 0}
          tone="gold"
          detail={(d.points ?? 0) === 0 ? 'None earned yet' : 'Spendable in the point store'}
        />
        <StatTile
          label="Creators referred"
          value={d.total ?? 0}
          detail={(d.total ?? 0) === 0 ? 'Nobody has joined through you yet' : 'All time'}
        />
        <StatTile label="Tier" value={(d.tier ?? 'bronze').toUpperCase()} />
      </div>

      <div className="wage-card mt-5 p-6">
        <div className="text-[16px] font-bold">Your referral link</div>
        <p className="mt-1.5 text-sm text-wage-muted">You get 150 points when someone joins through it. They get 200.</p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <code className="min-w-0 flex-1 truncate rounded-[10px] border border-wage-line-hi bg-wage-ink-2 px-4 py-3 font-mono text-sm text-wage-amber-2">
            {link}
          </code>
          <button
            className="wage-btn wage-btn-primary"
            onClick={() => {
              navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      </div>

      <h2 className="mt-12 text-[22px]">People you've referred</h2>
      <div className="mt-4">
        {d.referrals.length === 0 ? (
          <EmptyState
            title="Nobody has joined through your link yet."
            detail="Post it where creators already follow you — a stream title, a bio, a pinned comment."
            action={<Link to="/leaderboard" className="wage-btn wage-btn-ghost">See the leaderboard</Link>}
          />
        ) : (
          <ul className="grid gap-2">
            {d.referrals.map((r, i) => (
              <li key={i} className="wage-card flex items-center justify-between gap-4 px-5 py-3.5">
                <span className="truncate text-[15px] font-semibold">
                  {r.name || r.username || 'New member'}
                </span>
                <span className="wage-chip">{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="mt-12 text-[22px]">Point history</h2>
      <div className="mt-4">
        {d.transactions.length === 0 ? (
          <EmptyState title="No point activity yet." detail="Points appear here as soon as you earn or spend any." />
        ) : (
          <ul>
            {d.transactions.map((t, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-4 border-b border-wage-line py-3 text-sm"
              >
                <span className="text-[#C2BBCE]">{t.description}</span>
                <span className={`wage-num ${t.amount >= 0 ? 'text-wage-success' : 'text-wage-error'}`}>
                  {t.amount >= 0 ? '+' : ''}{t.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
