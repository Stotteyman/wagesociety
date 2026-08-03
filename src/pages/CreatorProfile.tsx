import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import TierChip, { LiveChip } from '../components/ui/TierChip';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import SocialIcon, { SOCIAL_PLATFORMS, socialHref, type SocialKey } from '../components/SocialIcon';
import ProfileBadges, { BadgeLegend, type Badge } from '../components/ui/ProfileBadges';

type Creator = {
  username: string; display_name: string | null; avatar_url: string | null; bio: string | null;
  skills: string[] | null; primary_platform: string | null; tier: string; referral_tier: string;
  youtube_channel_name: string | null; youtube_channel_avatar: string | null;
  featured_youtube_channel_id: string | null;
  social_links: Partial<Record<SocialKey, string>> | null;
  is_live: boolean; badges: Badge[] | null;
};

export default function CreatorProfile() {
  const { username } = useParams();
  const [c, setC] = useState<Creator | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase.from('wagesociety_creators').select('*').eq('username', username).maybeSingle()
      .then(({ data }) => { setC(data as Creator | null); setLoading(false); });
  }, [username]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-16">
        <div className="wage-card h-[220px] animate-pulse" />
      </div>
    );
  }

  if (!c) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20">
        <EmptyState
          title={`No creator goes by @${username}.`}
          detail="The handle may have changed, or the profile isn't public yet."
          action={<Link to="/creators" className="wage-btn wage-btn-ghost">Browse the directory</Link>}
        />
      </div>
    );
  }

  const name = c.display_name || c.username;

  // Only the platforms this creator actually filled in, in a stable order.
  const socials = SOCIAL_PLATFORMS.flatMap((p) => {
    const value = c.social_links?.[p.key];
    if (!value) return [];
    return [{ key: p.key, label: p.label, value, href: socialHref(p.key, value) }];
  });

  return (
    <>
      {/* Cover — brand-art language: warm core, violet edge, faint vertical grid */}
      <div className="relative h-[200px] overflow-hidden border-b border-wage-line sm:h-[240px]">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 120% at 22% 110%, rgba(245,165,36,0.34), transparent 62%),' +
              'radial-gradient(ellipse 50% 120% at 78% 120%, rgba(139,92,246,0.28), transparent 60%),' +
              'linear-gradient(180deg, #0B0910, #100C16)',
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '46px 46px',
            maskImage: 'linear-gradient(180deg, transparent, #000 85%)',
            WebkitMaskImage: 'linear-gradient(180deg, transparent, #000 85%)',
          }}
        />
      </div>

      <section className="mx-auto max-w-5xl px-5 pb-20">
        <div className="relative -mt-14 flex flex-wrap items-end gap-5 sm:-mt-[58px]">
          <div className="rounded-[26px] border-[3px] border-wage-ink shadow-[0_20px_50px_-22px_rgba(245,165,36,0.7)]">
            <Avatar name={name} src={c.avatar_url} size={126} className="!rounded-[23px]" />
          </div>
          <div className="flex-1 pb-2">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <TierChip tier={c.tier} />
              {c.is_live && <LiveChip label={c.primary_platform ? `Live on ${c.primary_platform}` : 'Live'} />}
            </div>
            <h1 className="flex flex-wrap items-center gap-2.5 text-[clamp(28px,4vw,38px)] normal-case">
              {name}
              <ProfileBadges badges={c.badges} size={24} />
            </h1>
            <p className="mt-1 font-mono text-[13.5px] text-wage-muted-2">@{c.username}</p>
          </div>
          <div className="flex gap-2.5 pb-2.5">
            <Link to="/creators" className="wage-btn wage-btn-ghost !py-2 text-sm">Back to directory</Link>
          </div>
        </div>

        <div className="mt-9 grid gap-6 lg:grid-cols-[1.55fr_1fr]">
          <div className="grid content-start gap-5">
            <div className="wage-card p-6">
              <span className="wage-eyebrow wage-eyebrow-mute">About</span>
              {c.bio ? (
                <p className="mt-3 text-[16.5px] leading-relaxed text-[#CFC9D8]">{c.bio}</p>
              ) : (
                <p className="mt-3 text-[15px] text-wage-muted-2">
                  {name} hasn't written a bio yet.
                </p>
              )}
              {c.skills && c.skills.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {c.skills.map((s) => <span key={s} className="wage-chip">{s}</span>)}
                </div>
              )}
            </div>
          </div>

          <aside className="grid content-start gap-4">
            <div className="wage-card p-5">
              <span className="wage-eyebrow wage-eyebrow-mute">Where to find them</span>
              {socials.length === 0 && !c.youtube_channel_name ? (
                <p className="mt-3.5 text-[14px] text-wage-muted-2">
                  {name} hasn't added any links yet.
                </p>
              ) : (
                <>
                  {c.youtube_channel_name && (
                    <a
                      href={
                        c.featured_youtube_channel_id
                          ? `https://www.youtube.com/channel/${c.featured_youtube_channel_id}`
                          : undefined
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3.5 flex items-center gap-3 border border-wage-line px-3 py-2.5 transition-colors hover:border-wage-amber"
                    >
                      {c.youtube_channel_avatar
                        ? <img src={c.youtube_channel_avatar} alt="" className="h-7 w-7 rounded-full" />
                        : <span className="h-7 w-7 bg-wage-panel-2" />}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{c.youtube_channel_name}</span>
                        <span className="block font-mono text-[10.5px] uppercase tracking-[0.14em] text-wage-muted-2">
                          YouTube
                        </span>
                      </span>
                    </a>
                  )}

                  {socials.length > 0 && (
                    <ul className="mt-3.5 flex flex-wrap gap-2">
                      {socials.map(({ key, label, value, href }) => {
                        const inner = (
                          <>
                            <SocialIcon name={key} size={18} />
                            <span className="sr-only">{label}</span>
                          </>
                        );
                        return (
                          <li key={key}>
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                title={`${label}: ${value}`}
                                className="grid h-10 w-10 place-items-center border border-wage-line text-wage-muted transition-colors hover:border-wage-amber hover:text-wage-amber-2"
                              >
                                {inner}
                              </a>
                            ) : (
                              <span
                                title={`${label}: ${value}`}
                                className="grid h-10 w-10 place-items-center border border-wage-line text-wage-muted"
                              >
                                {inner}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>

            <div className="wage-card p-5">
              <span className="wage-eyebrow wage-eyebrow-mute">Network</span>
              <dl className="mt-3.5 grid gap-2.5">
                <div className="flex items-baseline justify-between">
                  <dt className="text-sm text-wage-muted">Membership</dt>
                  <dd><TierChip tier={c.tier} /></dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-sm text-wage-muted">Referral tier</dt>
                  <dd className="wage-num text-[15px] capitalize text-wage-amber-2">{c.referral_tier || '—'}</dd>
                </div>
              </dl>
              {c.badges && c.badges.length > 0 && (
                <div className="mt-4 border-t border-wage-line pt-4">
                  <BadgeLegend badges={c.badges} />
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
