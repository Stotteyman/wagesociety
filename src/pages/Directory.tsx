import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, supabaseConfigured } from '../lib/supabase';
import TierChip, { LiveChip } from '../components/ui/TierChip';
import EmptyState from '../components/ui/EmptyState';
import Avatar from '../components/ui/Avatar';
import PageHeader from '../components/ui/PageHeader';
import ProfileBadges, { type Badge } from '../components/ui/ProfileBadges';

type Creator = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  tier: string;
  is_live: boolean;
  badges: Badge[] | null;
};

const tiers = ['all', 'free', 'creator', 'pro', 'elite'] as const;
type Tier = (typeof tiers)[number];

export default function Directory() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [tier, setTier] = useState<Tier>('all');

  useEffect(() => {
    if (!supabaseConfigured) { setLoading(false); return; }
    supabase.from('wagesociety_creators').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setCreators((data as Creator[]) ?? []); setLoading(false); });
  }, []);

  const matchesQuery = (c: Creator) =>
    !q || (c.username + (c.display_name ?? '') + (c.bio ?? '')).toLowerCase().includes(q.toLowerCase());
  const matchesTier = (c: Creator) => tier === 'all' || (c.tier ?? 'free').toLowerCase() === tier;
  const filtered = creators.filter((c) => matchesQuery(c) && matchesTier(c));

  const countFor = (t: Tier) =>
    t === 'all' ? creators.length : creators.filter((c) => (c.tier ?? 'free').toLowerCase() === t).length;

  const isFiltered = Boolean(q) || tier !== 'all';

  return (
    <section className="mx-auto max-w-6xl px-5 py-14">
      <PageHeader
        eyebrow="Public directory"
        title="WAGE Creators"
        lede={
          creators.length > 0
            ? `${creators.length} independent ${creators.length === 1 ? 'creator' : 'creators'} owning their audience and income.`
            : 'Independent creators owning their audience and income.'
        }
        action={<Link to="/login" className="wage-btn wage-btn-primary">Claim your handle</Link>}
      />

      <div className="mt-8 flex gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, handle, or what they make"
          aria-label="Search creators"
          className="input !py-3"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {tiers.map((t) => {
          const active = tier === t;
          return (
            <button
              key={t}
              onClick={() => setTier(t)}
              className={`wage-chip capitalize transition-colors ${
                active ? '!border-wage-amber !bg-wage-amber !font-bold !text-wage-ink' : 'hover:border-wage-line-hi'
              }`}
            >
              {t === 'all' ? 'All' : t} · {countFor(t)}
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="wage-card h-[186px] animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          isFiltered ? (
            <EmptyState
              title="No creators match that search."
              detail={`Try a different name, or clear the filters to see all ${creators.length}.`}
              action={
                <button className="wage-btn wage-btn-ghost" onClick={() => { setQ(''); setTier('all'); }}>
                  Clear filters
                </button>
              }
            />
          ) : (
            <EmptyState
              title="The directory is empty."
              detail="Claim a handle and your public creator profile shows up here in two minutes."
              action={<Link to="/login" className="wage-btn wage-btn-primary">Claim your handle</Link>}
            />
          )
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filtered.map((c) => (
              <Link
                key={c.username}
                to={`/creators/${c.username}`}
                className="wage-card wage-card-hover flex flex-col gap-3.5 p-5"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={c.display_name || c.username} src={c.avatar_url} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] font-bold">{c.display_name || c.username}</span>
                      <ProfileBadges badges={c.badges} size={15} />
                    </div>
                    <div className="truncate font-mono text-[12px] text-wage-muted-2">@{c.username}</div>
                  </div>
                </div>
                <p className="line-clamp-2 min-h-[42px] text-sm text-wage-muted">{c.bio || ''}</p>
                <div className="flex items-center justify-between border-t border-wage-line pt-3">
                  {c.is_live ? <LiveChip /> : <TierChip tier={c.tier} />}
                  <span className="text-sm text-wage-muted">View profile</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
