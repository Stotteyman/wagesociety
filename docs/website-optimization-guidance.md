# Website Optimization Guidance

## Purpose
This document is the working guide to move W.A.G.E. Society from the current landing-page implementation to a polished, production-ready product.

## Current Audit Snapshot (April 15, 2026)

### What is working now
- App builds successfully for client and SSR (`npm run build`).
- Route navigation works for:
  - `/` (home)
  - `/faq` (FAQ)
- Home page in-page link works:
  - `Join W.A.G.E. Society` targets `#membership` on the same page.
- Membership CTAs now perform real navigation (to `/faq`) instead of being inert buttons.
- FAQ accordion behavior works and now includes accessibility semantics (`aria-expanded`, `aria-controls`, controlled content IDs).

### Issues fixed during this audit
1. Membership plan CTA controls were not functional UI actions.
2. FAQ accordion controls lacked accessibility state linkage.
3. TypeScript config reported deprecation warning for `baseUrl` behavior.

## Product Direction
The site should communicate a premium members-only entertainment platform while remaining fast, clear, and conversion-focused.

## Optimization Priorities

### Priority 1: Conversion Path Clarity
Goal: Every major CTA should map to an explicit user outcome.

Actions:
- Add a dedicated conversion endpoint route (for example `/join` or `/contact`).
- Replace placeholder CTA behavior with real flows:
  - Backstage/All Access: join flow
  - Creator Circle: creator inquiry flow
- Add top-level navigation visible on all pages (Home, FAQ, Join).

Done when:
- No primary CTA is a dead-end.
- User can complete intended action in <= 2 clicks from homepage hero.

### Priority 2: Performance & Core Web Vitals
Goal: Keep first-load experience snappy on mobile and desktop.

Actions:
- Optimize icon usage:
  - Keep icon imports tree-shakeable and avoid oversized bundles.
- Defer non-critical sections if content grows (lazy loading by section/route).
- Add image assets only with responsive sizes and compression.
- Measure and track:
  - LCP under 2.5s
  - CLS under 0.1
  - INP under 200ms

Done when:
- Lighthouse mobile performance >= 90 on production build.
- No avoidable large JS payload regressions between releases.

### Priority 3: Content & Trust Signals
Goal: Increase credibility and reduce ambiguity for new visitors.

Actions:
- Replace synthetic metrics (e.g., "12.4k") with verified numbers or remove them.
- Add policy/support links in footer (Privacy, Terms, Contact).
- Add concise social proof or creator/member testimonials.

Done when:
- Every trust claim can be verified or is clearly framed as illustrative.

### Priority 4: Accessibility & UX Quality
Goal: Ensure strong keyboard and assistive tech experience.

Actions:
- Keep all interactive controls as semantic links/buttons with clear purpose.
- Add visible focus styles for keyboard navigation.
- Verify heading structure consistency (`h1` -> `h2` hierarchy).
- Ensure color contrast compliance in all key sections.

Done when:
- Keyboard-only user can navigate hero CTA, pricing actions, and FAQ accordion end-to-end.

### Priority 5: Operational Readiness
Goal: Make quality checks repeatable before deployment.

Actions:
- Add scripts:
  - `typecheck` (`tsc --noEmit`)
  - `preview` (`vite preview`)
- Add CI checks for build + typecheck on pull requests.
- Keep this guidance document updated as items are completed.

Done when:
- Every PR passes build/typecheck gates automatically.

## Functional Verification Checklist
Run before each release:

1. `npm run build` succeeds.
2. Route links:
   - `/` loads
   - `/faq` loads
3. Home interactions:
   - Hero `Join` scrolls to `#membership`
   - `View Membership FAQ` opens `/faq`
   - Membership card CTA links open `/faq`
4. FAQ interactions:
   - Each accordion item expands/collapses on click
   - Screen reader state changes announce expanded/collapsed state
5. Netlify build output:
   - `dist/client` generated
   - `.netlify/v1/functions/server.mjs` generated

## Suggested Next Build Sequence
1. Implement dedicated `/join` route and wire membership tier-specific actions.
2. Add persistent header navigation and footer policy/contact links.
3. Add typecheck/preview scripts and CI enforcement.
4. Run Lighthouse and record baseline metrics in this file.
5. Iterate on conversion copy and visual hierarchy using measured outcomes.
