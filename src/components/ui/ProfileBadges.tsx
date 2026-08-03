/**
 * Profile emblems — Founder, Staff, Verified, OG, and anything else the admin console
 * invents.
 *
 * These behave like a verified checkmark rather than a chip: a small mark that sits
 * against the name itself, everywhere the name appears.
 *
 * Every badge carries its own silhouette as well as its own colour, so it survives both
 * colour blindness and a 16px render — see docs/BRAND_GUIDE.md §4, hue is never the only
 * carrier.
 *
 * Appearance is data, not code. A badge arrives as `{slug, label, color, shape}` from
 * wagesociety.badges, so a badge created in /admin renders on profiles immediately.
 * The earlier version kept colour and silhouette in this file keyed by slug, which meant
 * any badge the database learned about rendered as nothing at all. The SHAPES keys here
 * are mirrored by the badges_shape_check constraint, so the database will not store a
 * silhouette this file cannot draw.
 */

const INK = '#06090B';

/** The knocked-out mark. Two of them, chosen per badge by which reads better. */
const STAR =
  'M12 6.6 13.12 9.66 16.38 9.78 13.81 11.79 14.70 14.92 12 13.1 9.30 14.92 ' +
  '10.19 11.79 7.62 9.78 10.88 9.66 Z';
const CHECK = 'M8 12.2 11 15.2 16.2 9.4';

type Shape = {
  /** Outer silhouette — the part that reads first at small sizes. */
  path: string;
  /** Glyph knocked out of it. A check is stroked; a star is filled. */
  glyph: 'check' | 'star';
  /** Nudge, for shells whose visual centre isn't the viewBox centre. */
  shift?: string;
};

/** Mirrored by badges_shape_check in the database. Adding one means adding it there too. */
const SHAPES: Record<string, Shape> = {
  shield: {
    path: 'M12 2 20.5 5.2 20.5 12 C20.5 17.2 16.9 20.6 12 22 C7.1 20.6 3.5 17.2 3.5 12 L3.5 5.2 Z',
    glyph: 'star',
  },
  hex: {
    path: 'M12 1.8 20.8 6.9 20.8 17.1 12 22.2 3.2 17.1 3.2 6.9 Z',
    glyph: 'check',
  },
  burst: {
    path:
      'M12 2 14.76 5.35 19.07 4.93 18.65 9.24 22 12 18.65 14.76 19.07 19.07 14.76 18.65 ' +
      '12 22 9.24 18.65 4.93 19.07 5.35 14.76 2 12 5.35 9.24 4.93 4.93 9.24 5.35 Z',
    glyph: 'check',
  },
  medal: {
    // Ribbon tails first, then the disc over them, so the seam never shows.
    path: 'M8.7 15.4 6.2 22.4 12 20.1 17.8 22.4 15.3 15.4 Z M12 1.9 A7.3 7.3 0 1 1 11.99 1.9 Z',
    glyph: 'star',
    shift: 'translate(0,-2)',
  },
  circle: {
    path: 'M12 2 A10 10 0 1 1 11.99 2 Z',
    glyph: 'check',
  },
  chevron: {
    path: 'M12 1.8 21.5 7.2 21.5 14 12 22.2 2.5 14 2.5 7.2 Z',
    glyph: 'check',
  },
  bolt: {
    path: 'M13.6 1.8 4.4 13.4 10.6 13.4 9.4 22.2 19.4 10.2 12.7 10.2 Z',
    glyph: 'star',
    shift: 'translate(0.4,-0.4) scale(0.72) translate(4.6,5.2)',
  },
  crown: {
    path: 'M2.6 7.4 7 11.4 12 3.4 17 11.4 21.4 7.4 19.6 19.4 4.4 19.4 Z',
    glyph: 'star',
    shift: 'translate(0,1.6)',
  },
};

/** What a badge looks like once it has come out of the database. */
export type Badge = {
  slug: string;
  label: string;
  description?: string | null;
  color: string;
  shape: string;
};

/**
 * Older callers passed slugs. Accept both so a page that has not been updated keeps
 * working, and so the four built-ins survive a cache holding the previous view shape.
 */
export type BadgeInput = Badge | string;

const LEGACY: Record<string, Omit<Badge, 'slug'>> = {
  founder: { label: 'Founder', color: '#FC9000', shape: 'shield', description: 'Built W.A.G.E. Society.' },
  staff: { label: 'Staff', color: '#E4E4E8', shape: 'hex', description: 'Runs the platform day to day.' },
  verified: { label: 'Verified', color: '#FFAA33', shape: 'burst', description: 'Identity confirmed by W.A.G.E. Society.' },
  og: { label: 'OG', color: '#E43000', shape: 'medal', description: 'Here in the first year.' },
};

/** Only `#rrggbb` reaches an SVG fill; anything else falls back to the house amber. */
const safeColor = (c: unknown) =>
  typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : '#FFAA33';

function normalise(input: BadgeInput): Badge | null {
  if (typeof input === 'string') {
    const legacy = LEGACY[input];
    return legacy ? { slug: input, ...legacy } : null;
  }
  if (!input || typeof input.slug !== 'string') return null;
  return {
    slug: input.slug,
    label: input.label || input.slug,
    description: input.description ?? null,
    color: safeColor(input.color),
    shape: SHAPES[input.shape] ? input.shape : 'shield',
  };
}

const clean = (badges: BadgeInput[] | null | undefined): Badge[] =>
  (badges ?? []).map(normalise).filter((b): b is Badge => b !== null);

function Emblem({ badge, size }: { badge: Badge; size: number }) {
  const shape = SHAPES[badge.shape] ?? SHAPES.shield;
  const title = badge.description ? `${badge.label} — ${badge.description}` : badge.label;
  return (
    <svg role="img" aria-label={badge.label} width={size} height={size} viewBox="0 0 24 24" className="shrink-0">
      <title>{title}</title>
      <path d={shape.path} fill={safeColor(badge.color)} />
      <g transform={shape.shift}>
        {shape.glyph === 'check' ? (
          <path d={CHECK} fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d={STAR} fill={INK} />
        )}
      </g>
    </svg>
  );
}

export default function ProfileBadges({
  badges,
  size = 18,
  className = '',
}: {
  badges: BadgeInput[] | null | undefined;
  size?: number;
  className?: string;
}) {
  const known = clean(badges);
  if (known.length === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`}>
      {known.map((b) => <Emblem key={b.slug} badge={b} size={size} />)}
    </span>
  );
}

/**
 * The same badges spelled out, for the one place there is room to explain them —
 * the profile's Network panel. The emblem alone is a hover tooltip, which is no use
 * on a phone.
 */
export function BadgeLegend({ badges }: { badges: BadgeInput[] | null | undefined }) {
  const known = clean(badges);
  if (known.length === 0) return null;
  return (
    <ul className="grid gap-2">
      {known.map((b) => (
        <li key={b.slug} className="flex items-center gap-2.5">
          <Emblem badge={b} size={18} />
          <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-wage-muted">
            {b.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

export { SHAPES };
