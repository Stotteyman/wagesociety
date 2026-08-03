/**
 * Profile emblems.
 *
 * These behave like a verified checkmark rather than a chip: a small mark that sits
 * against the name itself, everywhere the name appears.
 *
 * An emblem is three independent choices — **shape**, **glyph**, **colour** — and any
 * combination is legal. They used to be welded together (a shield always got a star, a
 * hex always got a check), which meant sixteen possible badges and no way to make a new
 * one look like anything but an existing one.
 *
 * Every badge still carries its own silhouette as well as its own colour, so it survives
 * both colour blindness and a 16px render — see docs/BRAND_GUIDE.md §4, hue is never the
 * only carrier. That is why `shape` is not optional and 'circle' is a deliberate choice
 * rather than a default.
 *
 * Appearance is data, not code: a badge arrives as {slug, label, color, shape, glyph}
 * from wagesociety.badges, so one created in /admin renders immediately. The keys in
 * SHAPES and GLYPHS are mirrored by badges_shape_check and badges_glyph_check, so the
 * database can never hold a look this file cannot draw.
 */

const INK = '#06090B';

/* ── shapes: the outer silhouette ────────────────────────────────────────── */

type Shape = {
  path: string;
  /** Fits the glyph to this shape's optical centre. Applied to the glyph only. */
  glyph?: string;
};

const SHAPES: Record<string, Shape> = {
  circle: { path: 'M12 2 A10 10 0 1 1 11.99 2 Z' },
  shield: {
    path: 'M12 2 20.5 5.2 20.5 12 C20.5 17.2 16.9 20.6 12 22 C7.1 20.6 3.5 17.2 3.5 12 L3.5 5.2 Z',
    glyph: 'translate(0,-0.6)',
  },
  hex: { path: 'M12 1.8 20.8 6.9 20.8 17.1 12 22.2 3.2 17.1 3.2 6.9 Z' },
  hex_flat: { path: 'M6.9 3.2 17.1 3.2 22.2 12 17.1 20.8 6.9 20.8 1.8 12 Z' },
  square: { path: 'M3.6 3.6 20.4 3.6 20.4 20.4 3.6 20.4 Z' },
  rounded: {
    path: 'M7.4 3.2 16.6 3.2 A4.2 4.2 0 0 1 20.8 7.4 L20.8 16.6 A4.2 4.2 0 0 1 16.6 20.8 '
      + 'L7.4 20.8 A4.2 4.2 0 0 1 3.2 16.6 L3.2 7.4 A4.2 4.2 0 0 1 7.4 3.2 Z',
  },
  diamond: { path: 'M12 1.6 22.4 12 12 22.4 1.6 12 Z' },
  burst: {
    path: 'M12 2 14.76 5.35 19.07 4.93 18.65 9.24 22 12 18.65 14.76 19.07 19.07 14.76 18.65 '
      + '12 22 9.24 18.65 4.93 19.07 5.35 14.76 2 12 5.35 9.24 4.93 4.93 9.24 5.35 Z',
  },
  seal: {
    // Twelve-lobed rosette — reads as a wax seal at small sizes.
    path: 'M12 1.4 14.2 3.5 17.2 2.8 18.3 5.7 21.2 6.8 20.5 9.8 22.6 12 20.5 14.2 21.2 17.2 '
      + '18.3 18.3 17.2 21.2 14.2 20.5 12 22.6 9.8 20.5 6.8 21.2 5.7 18.3 2.8 17.2 3.5 14.2 '
      + '1.4 12 3.5 9.8 2.8 6.8 5.7 5.7 6.8 2.8 9.8 3.5 Z',
  },
  medal: {
    // Ribbon tails first, then the disc over them, so the seam never shows.
    path: 'M8.7 15.4 6.2 22.4 12 20.1 17.8 22.4 15.3 15.4 Z M12 1.9 A7.3 7.3 0 1 1 11.99 1.9 Z',
    glyph: 'translate(0,-2.2) scale(0.86) translate(1.7,1.7)',
  },
  chevron: { path: 'M12 1.8 21.5 7.2 21.5 14 12 22.2 2.5 14 2.5 7.2 Z', glyph: 'translate(0,-0.7)' },
  bolt: {
    path: 'M13.6 1.8 4.4 13.4 10.6 13.4 9.4 22.2 19.4 10.2 12.7 10.2 Z',
    glyph: 'translate(0,0) scale(0.62) translate(7.3,7.3)',
  },
  crown: { path: 'M2.6 7.4 7 11.4 12 3.4 17 11.4 21.4 7.4 19.6 19.4 4.4 19.4 Z', glyph: 'translate(0,2.2) scale(0.82) translate(2.2,2.2)' },
  ribbon: {
    path: 'M4.6 2.4 19.4 2.4 19.4 21.8 12 17.2 4.6 21.8 Z',
    glyph: 'translate(0,-1.6) scale(0.88) translate(1.4,1.4)',
  },
  banner: { path: 'M3.2 3.4 20.8 3.4 20.8 15.4 12 21.4 3.2 15.4 Z', glyph: 'translate(0,-1.2)' },
  flame: {
    path: 'M12 1.6 C15.4 6.2 19.6 8.4 19.6 13.4 A7.6 7.6 0 0 1 4.4 13.4 C4.4 9.6 7.2 8.4 8.6 5.6 '
      + 'C9.4 8.2 10.6 9 11.2 9.6 C11.4 7 11.2 4.2 12 1.6 Z',
    glyph: 'translate(0,1.6) scale(0.8) translate(2.4,2.4)',
  },
  star: {
    path: 'M12 1.4 14.9 8.2 22.3 8.9 16.7 13.8 18.4 21.1 12 17.2 5.6 21.1 7.3 13.8 1.7 8.9 9.1 8.2 Z',
    glyph: 'translate(0,0.4) scale(0.66) translate(6.1,6.1)',
  },
  tag: {
    path: 'M2.6 2.6 13.4 2.6 21.4 10.6 11.4 20.6 2.6 11.8 Z',
    glyph: 'translate(-1.2,-1.2) scale(0.78) translate(2.6,2.6)',
  },
};

/* ── glyphs: the mark knocked out of the shape ───────────────────────────── */

type Glyph = { d: string; stroked?: boolean };

/** Drawn to sit inside a roughly 12-unit box centred on 12,12. */
const GLYPHS: Record<string, Glyph | null> = {
  none: null,
  star: {
    d: 'M12 6.6 13.12 9.66 16.38 9.78 13.81 11.79 14.70 14.92 12 13.1 9.30 14.92 '
      + '10.19 11.79 7.62 9.78 10.88 9.66 Z',
  },
  check: { d: 'M8 12.2 11 15.2 16.2 9.4', stroked: true },
  crown: { d: 'M6.6 15.4 6.6 9.4 9.3 11.6 12 7.6 14.7 11.6 17.4 9.4 17.4 15.4 Z' },
  bolt: { d: 'M13.4 6.2 8.2 12.8 11.6 12.8 10.8 17.8 15.8 11.2 12.2 11.2 Z' },
  heart: {
    d: 'M12 17.2 C8.4 14.6 6.6 12.8 6.6 10.6 A2.9 2.9 0 0 1 12 9.1 A2.9 2.9 0 0 1 17.4 10.6 '
      + 'C17.4 12.8 15.6 14.6 12 17.2 Z',
  },
  flame: {
    d: 'M12 6.4 C13.9 9.1 16.2 10.4 16.2 13.2 A4.2 4.2 0 0 1 7.8 13.2 C7.8 11.1 9.4 10.4 '
      + '10.2 8.8 C10.6 10.3 11.3 10.8 11.6 11.1 C11.7 9.6 11.6 7.9 12 6.4 Z',
  },
  diamond: { d: 'M12 6.6 17.4 12 12 17.4 6.6 12 Z' },
  plus: { d: 'M10.7 6.8 13.3 6.8 13.3 10.7 17.2 10.7 17.2 13.3 13.3 13.3 13.3 17.2 10.7 17.2 10.7 13.3 6.8 13.3 6.8 10.7 10.7 10.7 Z' },
  dollar: { d: 'M12 6 L12 18 M15 8.6 A3 2.2 0 0 0 9.4 9.6 C9.4 12.6 15 11.6 15 14.6 A3 2.2 0 0 1 9 15.2', stroked: true },
  play: { d: 'M9.6 7.4 17.2 12 9.6 16.6 Z' },
  mic: {
    d: 'M12 6.4 A2.1 2.1 0 0 1 14.1 8.5 L14.1 11.6 A2.1 2.1 0 0 1 9.9 11.6 L9.9 8.5 '
      + 'A2.1 2.1 0 0 1 12 6.4 Z M7.9 11.6 A4.1 4.1 0 0 0 16.1 11.6 M12 15.7 L12 17.9',
    stroked: true,
  },
  camera: {
    d: 'M7 9.2 L9.2 9.2 10 7.8 14 7.8 14.8 9.2 17 9.2 17 16.2 7 16.2 Z M12 12.7 m-2.1 0 a2.1 2.1 0 1 0 4.2 0 a2.1 2.1 0 1 0 -4.2 0',
    stroked: true,
  },
  code: { d: 'M9.6 9 6.6 12 9.6 15 M14.4 9 17.4 12 14.4 15', stroked: true },
  sparkle: {
    d: 'M12 6.2 13.1 10.3 17.2 11.4 13.1 12.5 12 16.6 10.9 12.5 6.8 11.4 10.9 10.3 Z',
  },
  eye: { d: 'M6.2 12 C8.4 8.8 15.6 8.8 17.8 12 C15.6 15.2 8.4 15.2 6.2 12 Z M12 12 m-1.6 0 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0' },
  key: {
    d: 'M14.4 9.6 m-2.4 0 a2.4 2.4 0 1 0 4.8 0 a2.4 2.4 0 1 0 -4.8 0 M12.7 11.3 7.4 16.6 M9.2 14.8 10.6 16.2',
    stroked: true,
  },
  leaf: { d: 'M17.4 6.6 C11 6.6 6.6 9 6.6 14 C6.6 15.6 7.2 16.8 7.2 16.8 C10.4 11.4 13.6 10.6 13.6 10.6 C11 12.2 8.8 14.6 8.4 17.4 C13.4 18.6 17.4 14.2 17.4 6.6 Z' },
  anchor: {
    d: 'M12 7.2 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0 M12 8.7 L12 17.6 M8.6 11.2 15.4 11.2 M6.8 13.6 C6.8 16.6 9.2 17.9 12 17.9 C14.8 17.9 17.2 16.6 17.2 13.6',
    stroked: true,
  },
  shield: { d: 'M12 6.6 16.6 8.4 16.6 12 C16.6 14.6 14.6 16.4 12 17.4 C9.4 16.4 7.4 14.6 7.4 12 L7.4 8.4 Z' },
  trophy: {
    d: 'M9 7 15 7 15 11.2 A3 3 0 0 1 9 11.2 Z M9 8.4 7 8.4 7 10 A2 2 0 0 0 9 11.4 '
      + 'M15 8.4 17 8.4 17 10 A2 2 0 0 1 15 11.4 M12 14.2 12 16.4 M9.6 17.2 14.4 17.2',
    stroked: true,
  },
};

/* ── data ────────────────────────────────────────────────────────────────── */

export type Badge = {
  slug: string;
  label: string;
  description?: string | null;
  color: string;
  shape: string;
  glyph?: string | null;
};

/** Older callers passed slugs; accept both so nothing blanks on a stale cache. */
export type BadgeInput = Badge | string;

const LEGACY: Record<string, Omit<Badge, 'slug'>> = {
  founder: { label: 'Founder', color: '#FC9000', shape: 'shield', glyph: 'star' },
  staff: { label: 'Staff', color: '#E4E4E8', shape: 'hex', glyph: 'check' },
  verified: { label: 'Verified', color: '#FFAA33', shape: 'burst', glyph: 'check' },
  og: { label: 'OG', color: '#E43000', shape: 'medal', glyph: 'star' },
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
    glyph: input.glyph && input.glyph in GLYPHS ? input.glyph : 'none',
  };
}

const clean = (badges: BadgeInput[] | null | undefined): Badge[] =>
  (badges ?? []).map(normalise).filter((b): b is Badge => b !== null);

/* ── render ──────────────────────────────────────────────────────────────── */

export function Emblem({ badge, size }: { badge: Badge; size: number }) {
  const shape = SHAPES[badge.shape] ?? SHAPES.shield;
  const glyph = badge.glyph ? GLYPHS[badge.glyph] : null;
  const title = badge.description ? `${badge.label} — ${badge.description}` : badge.label;

  return (
    <svg role="img" aria-label={badge.label} width={size} height={size} viewBox="0 0 24 24" className="shrink-0">
      <title>{title}</title>
      <path d={shape.path} fill={safeColor(badge.color)} fillRule="evenodd" />
      {glyph && (
        <g transform={shape.glyph}>
          {glyph.stroked ? (
            <path
              d={glyph.d}
              fill="none"
              stroke={INK}
              strokeWidth={2.1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path d={glyph.d} fill={INK} fillRule="evenodd" />
          )}
        </g>
      )}
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

export { SHAPES, GLYPHS };
