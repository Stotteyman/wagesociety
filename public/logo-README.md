Logo assets for the W.A.G.E. Society site

- `logo.svg`: compact circular mark for headers, favicons, and small placements.
- `logo-full.svg`: full mark + wordmark designed for hero sections, splash screens, and marketing.

Usage
- Place `logo.svg` at the root of `public/` so it is available at `/logo.svg`.
- Use the full logo (`/logo-full.svg`) for larger exposures such as the homepage hero.
- The mark uses an accessible `title` and `desc` inside the SVG — keep these when editing.

To use in React components (example already applied to the header):

```jsx
<Link to="/" className="inline-flex items-center gap-3">
  <img src="/logo.svg" alt="W.A.G.E. Society logo" className="h-8 w-8 rounded-full" />
  <span className="hidden sm:inline">W.A.G.E. SOCIETY</span>
</Link>
```

If you'd like alternative color variants (light/dark), I can generate `logo-dark.svg` and `logo-light.svg` as well.
