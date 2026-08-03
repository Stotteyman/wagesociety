import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { tierRank } from '../lib/plans';

/**
 * Wraps a panel that only paying members get.
 *
 * Presentation only, and deliberately so — the RPCs behind these panels do their own
 * checking. What this stops is a free member filling in a form that was never going to
 * save, which is worse than not showing the form at all.
 *
 * It names what the panel is rather than hiding it. An upsell that describes the thing
 * you would get converts; a blank space just looks broken.
 */
export default function CreatorOnly({
  tier,
  title,
  blurb,
  children,
  min = 'creator',
}: {
  tier: string;
  title: string;
  blurb: string;
  children: ReactNode;
  min?: string;
}) {
  if (tierRank(tier) >= tierRank(min)) return <>{children}</>;

  return (
    <div className="wage-card p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="font-display text-lg">{title}</h2>
        <span className="wage-chip border-wage-amber/50 text-wage-amber-2">Creator and up</span>
      </div>
      <p className="mt-1.5 max-w-[62ch] text-sm text-wage-muted">{blurb}</p>
      <Link to="/plans" className="wage-btn wage-btn-primary mt-4">See the plans</Link>
    </div>
  );
}
