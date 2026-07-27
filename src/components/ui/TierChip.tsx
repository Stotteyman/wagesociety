/**
 * Membership tier as a chip. Hue AND border carry the tier — never text alone.
 * Colours are the real logo's: silver lettering, beer amber, chevron red.
 * See docs/BRAND_GUIDE.md §4, §10.
 */
const styles: Record<string, string> = {
  free:      'text-wage-muted',
  creator:   'text-wage-silver  border-wage-silver/40  bg-wage-silver/[0.06]',
  pro:       'text-wage-amber-2 border-wage-amber/50   bg-wage-amber/[0.10]',
  elite:     'text-wage-amber-2 border-wage-amber-2/55 bg-wage-amber-2/[0.12]',
  unlimited: 'text-wage-amber-2 border-wage-amber-2/55 bg-wage-amber-2/[0.12]',
};

export default function TierChip({ tier }: { tier: string | null | undefined }) {
  const key = (tier ?? 'free').toLowerCase();
  return <span className={`wage-chip ${styles[key] ?? styles.free}`}>{tier || 'Free'}</span>;
}

/** Live state is the crest's chevron red — the streaming convention, and in the logo. */
export function LiveChip({ label = 'Live' }: { label?: string }) {
  return (
    <span className="wage-chip border-wage-red bg-wage-red font-bold text-white">
      <span aria-hidden="true">●</span>
      {label}
    </span>
  );
}
