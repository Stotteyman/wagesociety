# Security and Upgrade Audit (2026-05-02)

## Runtime Validation

- Dev server started successfully on `http://localhost:4173`.
- Core route smoke test in integrated browser:
  - `/` loads
  - `/signup` loads
  - `/login` loads
  - `/admin` loads (client-auth-gated only)
  - `/dashboard` shows auth-gated loading state
- Startup warning from router generation:
  - `src/routes/api/news.ts` does not export `Route`
  - `src/routes/api/news-upload.ts` does not export `Route`

## Critical Findings

1. Localhost auth bypass grants superadmin-equivalent identity
- File: `src/lib/orgAuth.ts`
- Evidence:
  - `resolveRequester()` returns `root-superadmin@localhost` for localhost hosts.
  - Any local request can bypass bearer token validation.
- Risk:
  - Privilege escalation in local/dev environments.
  - Accidental exposure if host checks are misapplied in proxied or preview setups.
- Priority: P0

2. Server admin client can silently use public/anon keys
- File: `src/lib/supabaseAdmin.ts`
- Evidence:
  - `serverKey` falls back from `SUPABASE_SERVICE_ROLE_KEY` to anon/publishable env vars.
- Risk:
  - Authorization model drift and confusing runtime failures.
  - Dangerous to rely on weaker keys for admin code paths.
- Priority: P0

3. Stripe webhook accepts unsigned payloads when secret missing
- File: `src/routes/api/stripe-webhook.ts`
- Evidence:
  - If `STRIPE_WEBHOOK_SECRET` is absent, raw JSON is accepted and processed.
- Risk:
  - Event spoofing and fraudulent order/member updates.
- Priority: P0

## High Findings

4. Marketing metrics endpoint is public
- File: `src/routes/api/marketing-proof.ts`
- Evidence:
  - No auth or permission check on GET handler.
- Risk:
  - Leaks internal KPIs and activity timing data.
- Priority: P1

5. Secrets can be sourced from browser-exposed env prefixes
- File: `src/lib/liveStatus.ts`
- Evidence:
  - Fallbacks include `VITE_YOUTUBE_API_KEY`, `VITE_TWITCH_CLIENT_ID`, `VITE_KICK_CLIENT_SECRET`.
- Risk:
  - Sensitive values can be accidentally exposed to client bundles/config conventions.
- Priority: P1

6. Payment intent endpoint is unauthenticated
- File: `src/routes/api/create-payment-intent.ts`
- Evidence:
  - No call to `requirePermission`/`resolveRequester` in POST path.
- Risk:
  - Abuse/spam of payment-intent creation and customer object creation.
  - Can increase Stripe noise/cost and operational risk.
- Priority: P1

## Medium Findings

7. Legacy/unwired route handlers still present
- Files:
  - `src/routes/api/news.ts`
  - `src/routes/api/news-upload.ts`
- Evidence:
  - Export default handlers, not TanStack `Route` exports.
  - Startup warnings every run.
- Risk:
  - Dead code confusion, hidden tech debt, migration friction.
- Priority: P2

8. Type health issues in API layer block clean upgrades
- Files include:
  - `src/routes/api/create-payment-intent.ts`
  - `src/routes/api/stripe-webhook.ts`
  - `src/routes/api/collab.ts`
  - `src/routes/api/collab/apply.ts`
  - `src/routes/api/collab/applicants.ts`
  - `src/routes/api/me/profile.ts`
  - `src/routes/api/knowledge-vault.ts`
- Evidence:
  - Type errors from `get_errors` including Stripe API version mismatch and Supabase table types collapsing to `never`.
- Risk:
  - Upgrade instability and unsafe refactors.
- Priority: P2

## Dependency and Supply-Chain Status

Command run: `npm audit --omit=dev`

- 6 vulnerabilities reported:
  - High: `vite` (path traversal/file read advisory set)
  - High: `picomatch` (method injection/ReDoS)
  - Moderate: `h3-v2`, `postcss`, `srvx`, `yaml`
- `npm audit fix` indicates available remediations.

Command run: `npm outdated`

- Notable upgrade candidates:
  - `vite` 7.3.1 -> 7.3.2 (latest major 8.0.10)
  - `@tanstack/react-start` 1.166.17 -> 1.167.61
  - `@tanstack/react-router` 1.167.5 -> 1.169.1
  - `@tanstack/router-plugin` 1.166.14 -> 1.167.32
  - `@supabase/supabase-js` 2.103.2 -> 2.105.1
  - `stripe` 22.0.1 -> 22.1.0
  - `@stripe/react-stripe-js` 6.2.0 -> 6.3.0

## Upgrade Plan (Safe Sequence)

### Phase 0: Security hardening first (before dependency upgrades)

1. Remove localhost auth bypass from `resolveRequester()` or gate it behind an explicit env flag that defaults OFF.
2. In `supabaseAdmin`, require `SUPABASE_SERVICE_ROLE_KEY` only for server admin client.
3. In `stripe-webhook`, fail closed (HTTP 400/500) when webhook secret/signature is missing.
4. Add auth/permission check to `/api/marketing-proof`.
5. Decide whether `/api/create-payment-intent` should be public:
   - If public, add rate limiting + anti-abuse controls.
   - If member-only, enforce auth via `requirePermission`.

### Phase 1: Type-system stabilization

1. Fix Stripe API version typing in server routes.
2. Generate and wire Supabase DB types so `.from(...).insert/update/upsert` no longer infer `never`.
3. Remove or migrate legacy `news` handlers to proper TanStack route format.

### Phase 2: Patch upgrades

1. Run targeted patch updates for Vite/TanStack/Supabase/Stripe packages.
2. Re-run `npm audit --omit=dev` and resolve remaining advisories.
3. Re-run dev smoke tests and API contract tests.

### Phase 3: Optional major upgrades

1. Evaluate major jumps (`vite@8`, `@vitejs/plugin-react@6`, `lucide-react@1.x`, `typescript@6`).
2. Upgrade one major at a time with lockfile snapshots and route/API regression tests.

## Suggested Acceptance Gates

- No P0/P1 findings remain.
- `npm audit --omit=dev` has no High vulnerabilities.
- `get_errors` returns zero TypeScript errors in `src/routes/api/**`.
- Browser smoke test passes for `/`, `/login`, `/signup`, `/dashboard`, `/admin`, `/checkout`, `/live`, `/merch`, `/news`.
