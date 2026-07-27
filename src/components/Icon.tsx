/**
 * W.A.G.E. icon family — 24px grid, 1.5px stroke, round caps, no fills.
 * See docs/BRAND_GUIDE.md §7. Icons never appear without a text label in nav.
 */
import type { SVGProps } from 'react';

export type IconName =
  | 'earn' | 'stream' | 'merch' | 'network'
  | 'stats' | 'profile' | 'discord' | 'live';

const paths: Record<IconName, JSX.Element> = {
  earn: (
    <>
      <line x1="12" y1="1.5" x2="12" y2="22.5" />
      <path d="M17 5.5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </>
  ),
  stream: (
    <>
      <rect x="2.5" y="5.5" width="13" height="13" rx="2.6" />
      <path d="M15.5 10.5 21.5 7v10l-6-3.5z" />
    </>
  ),
  merch: (
    <>
      <path d="M4 7.5h16l-1.3 12a2 2 0 0 1-2 1.8H7.3a2 2 0 0 1-2-1.8z" />
      <path d="M8.5 7.5a3.5 3.5 0 0 1 7 0" />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="5" cy="6" r="1.8" />
      <circle cx="19" cy="6" r="1.8" />
      <circle cx="5" cy="18" r="1.8" />
      <circle cx="19" cy="18" r="1.8" />
      <path d="M10.3 10.7 6.4 7.4M13.7 10.7l3.9-3.3M10.3 13.3l-3.9 3.3M13.7 13.3l3.9 3.3" />
    </>
  ),
  stats: <path d="M4 19V9.5M10 19V4.5M16 19v-7M22 19H2" />,
  profile: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  discord: <path d="M4.5 17.5 3 21l3.8-1.4A9 9 0 1 0 4.5 17.5z" />,
  live: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5l3 2" />
    </>
  ),
};

type Props = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

export default function Icon({ name, size = 20, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
