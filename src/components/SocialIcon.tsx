/**
 * Third-party platform marks.
 *
 * Deliberately NOT part of Icon.tsx: our own icon family is a 1.5px stroke system
 * (docs/BRAND_GUIDE.md §7), while these are other companies' logos and must stay
 * filled and recognisable. They render in currentColor so they sit quietly until
 * hovered.
 */
export const SOCIAL_PLATFORMS = [
  { key: 'x',         label: 'X',         placeholder: '@handle',              base: 'https://x.com/' },
  { key: 'instagram', label: 'Instagram', placeholder: '@handle',              base: 'https://instagram.com/' },
  { key: 'tiktok',    label: 'TikTok',    placeholder: '@handle',              base: 'https://tiktok.com/@' },
  { key: 'facebook',  label: 'Facebook',  placeholder: 'Profile or page URL',  base: '' },
  { key: 'linkedin',  label: 'LinkedIn',  placeholder: 'Profile URL',          base: '' },
  { key: 'discord',   label: 'Discord',   placeholder: 'username',             base: '' },
  { key: 'website',   label: 'Website',   placeholder: 'https://yoursite.com', base: '' },
] as const;

export type SocialKey = (typeof SOCIAL_PLATFORMS)[number]['key'];

/** Turn whatever the creator typed into something clickable. */
export function socialHref(key: SocialKey, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const platform = SOCIAL_PLATFORMS.find((p) => p.key === key);
  if (!platform || !platform.base) return null;      // Discord usernames aren't links
  return platform.base + v.replace(/^@/, '');
}

const paths: Record<SocialKey, JSX.Element> = {
  x: <path d="M18.9 2H22l-7.1 8.1L23.2 22h-6.6l-5.2-6.8L5.5 22H2.4l7.6-8.7L1.2 2h6.8l4.7 6.2L18.9 2Zm-1.1 18h1.7L7.3 3.8H5.4L17.8 20Z" />,
  instagram: (
    <>
      <path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.2.05 1.8.25 2.2.42.6.2 1 .47 1.4.9.44.43.7.83.9 1.4.17.4.37 1 .42 2.2.06 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.05 1.2-.25 1.8-.42 2.2-.2.6-.47 1-.9 1.4-.43.44-.83.7-1.4.9-.4.17-1 .37-2.2.42-1.3.06-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.05-1.8-.25-2.2-.42-.6-.2-1-.47-1.4-.9-.44-.43-.7-.83-.9-1.4-.17-.4-.37-1-.42-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.05-1.2.25-1.8.42-2.2.2-.6.47-1 .9-1.4.43-.44.83-.7 1.4-.9.4-.17 1-.37 2.2-.42C8.4 2.2 8.8 2.2 12 2.2Zm0 1.9c-3.1 0-3.5 0-4.7.07-1.1.05-1.7.24-2.1.4-.5.2-.9.44-1.3.83-.4.4-.63.8-.83 1.3-.16.4-.35 1-.4 2.1-.06 1.2-.07 1.6-.07 4.7s0 3.5.07 4.7c.05 1.1.24 1.7.4 2.1.2.5.44.9.83 1.3.4.4.8.63 1.3.83.4.16 1 .35 2.1.4 1.2.06 1.6.07 4.7.07s3.5 0 4.7-.07c1.1-.05 1.7-.24 2.1-.4.5-.2.9-.44 1.3-.83.4-.4.63-.8.83-1.3.16-.4.35-1 .4-2.1.06-1.2.07-1.6.07-4.7s0-3.5-.07-4.7c-.05-1.1-.24-1.7-.4-2.1-.2-.5-.44-.9-.83-1.3-.4-.4-.8-.63-1.3-.83-.4-.16-1-.35-2.1-.4-1.2-.06-1.6-.07-4.7-.07Z" />
      <path d="M12 6.9a5.1 5.1 0 1 0 0 10.2 5.1 5.1 0 0 0 0-10.2Zm0 8.4a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6Z" />
      <circle cx="17.3" cy="6.7" r="1.2" />
    </>
  ),
  tiktok: <path d="M16.6 2h-3.1v13.1a2.6 2.6 0 1 1-2-2.5v-3.2a5.8 5.8 0 1 0 5.1 5.8V8.9a7 7 0 0 0 4.1 1.3V7a4 4 0 0 1-4.1-4Z" />,
  facebook: <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12Z" />,
  linkedin: (
    <>
      <path d="M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM3 9h4v12H3z" />
      <path d="M14.5 8.7c-2 0-3 1.1-3.5 1.9V9H7v12h4v-6.7c0-1.5.9-2.4 2.1-2.4 1.1 0 1.9.8 1.9 2.4V21h4v-7.2c0-3.3-1.8-5.1-4.5-5.1Z" />
    </>
  ),
  discord: <path d="M19.3 5.4A16.9 16.9 0 0 0 15.1 4l-.2.4a15.7 15.7 0 0 1 3.7 1.5 13.4 13.4 0 0 0-11.2 0A15.7 15.7 0 0 1 11.1 4.4L10.9 4a16.9 16.9 0 0 0-4.2 1.4C4 9.3 3.3 13.1 3.6 16.8a17 17 0 0 0 5.2 2.6l1.1-1.6a11 11 0 0 1-1.8-.9l.4-.3a12.1 12.1 0 0 0 10.4 0l.4.3a11 11 0 0 1-1.8.9l1.1 1.6a17 17 0 0 0 5.2-2.6c.4-4.3-.6-8.1-2.5-11.4ZM9.5 14.6c-1 0-1.9-.9-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Zm5 0c-1 0-1.9-.9-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Z" />,
  website: (
    <>
      <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M2.8 12h18.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 2.8c2.6 2.7 4 6 4 9.2s-1.4 6.5-4 9.2c-2.6-2.7-4-6-4-9.2s1.4-6.5 4-9.2Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </>
  ),
};

export default function SocialIcon({ name, size = 20 }: { name: SocialKey; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
