# Agent Notes — W.A.G.E. Society

**Read this first. Before touching any file.**

> Rewritten 2026-07-28. The previous version of this file described an Express + EJS +
> Neon + bcrypt stack and instructed agents *not* to use React, Vite, or Supabase. That
> stack has been retired and the instructions in it were actively harmful — following them
> would mean building against a backend that no longer exists. If you find other notes in
> this repo saying "no Supabase" or "no React", they are stale in the same way.

---

## Stack Reality

**Vite + React (TypeScript) SPA + Netlify Functions + Supabase (Postgres, Auth, RLS).**

- Entry: `src/main.tsx` → `src/App.tsx` (React Router)
- Pages: `src/pages/`, shared UI in `src/components/`
- Styling: Tailwind, with the design tokens described in `docs/BRAND_GUIDE.md`
- Serverless API: `netlify/functions/*.js`, exposed at `/api/*` via a redirect in `netlify.toml`
- Database: Supabase project `pqngaffhjqadrsntsvlp`, schema **`wagesociety`** (not `public`)
- Business logic lives in **Postgres RPCs** named `ws_*`, which sit in the `public` schema
  and read/write `wagesociety.*` tables

The legacy Express app still exists in this repo (`server.js`, `routes/`, `views/`, `db/`,
`bot/`, `lib/`, `jobs/`). **It is dead code.** It is no longer deployed anywhere and its
Neon database is unreachable. Do not extend it, and do not use it as a reference for how
things currently work.

## Hosting

- Netlify project `wagesociety` (`ce36dea1-e565-45c2-a93b-8cbdc11da67d`)
- `wagesociety.com` cut over from Render to Netlify on 2026-07-28
- DNS is at **GoDaddy** (`ns29/ns30.domaincontrol.com`) — apex `A` → `75.2.60.5`,
  `www` `CNAME` → `wagesociety.netlify.app`. Zoho `MX`/SPF/DMARC live in the same zone;
  never sweep those away.
- **Auto-builds are off** (`stop_builds: true`). Pushing to GitHub deploys nothing.
  Publishing is always explicit:
  `npm run build:web && npx netlify deploy --prod --dir dist --functions netlify/functions --no-build`
- Staging: same command with `--alias staging` instead of `--prod`.

## Auth

Supabase Auth. Discord and Google OAuth plus email; Kick is registered as a **custom**
provider under the identifier `custom:kick`. Do not build a hand-rolled OAuth flow — one
existed for Kick and was deleted because the redirect URI belongs to Supabase, not us.

**The Supabase project is shared across the whole org** (Pink Halo, Orange Duck, Frydaze,
FuriousPvP and others live in it under their own schemas). `SITE_URL`, the redirect
allow-list and SMTP are single global values. Any auth-config change has blast radius
beyond this site.

## Permissions

- `ws_current_role()` returns `guest | member | staff | manager | admin | superadmin`.
  `stotteyman@gmail.com` and `gggiddings@yahoo.com` are hardcoded to `superadmin` so the
  owner can never be locked out.
- `ws_is_staff('<role>')` is the ladder check used to gate admin RPCs.
- `ws_has_permission('<key>')` checks the finer-grained matrix in
  `wagesociety.role_permissions`. Superadmin bypasses the matrix by design.
- Every admin RPC must gate server-side. UI-level hiding is presentation only, never the
  security boundary.

## Admin Control Center

`/admin`, in `src/pages/Admin.tsx` with the operational tabs in `src/pages/admin/AdminOps.tsx`.

| Tab | Source of truth |
|---|---|
| Metrics | `ws_admin_metrics()` — live row counts, MRR normalised from real plan prices |
| Monitors | `/api/admin-health` — real probes: Supabase, Discord, Stripe, TLS cert, the gate itself |
| Discord | `ws_admin_discord_status()` + `/api/admin-discord-ops` |
| Roles | `ws_admin_rbac()` + `ws_admin_set_role_permission()` |
| Audit | `ws_admin_audit_log()`, written by `ws_audit()` |

**The rule that matters: no fake numbers.** Every figure must come from a database row,
the Discord API, or Stripe. A metric that cannot be fetched must render as an error, not
as a zero — a confident wrong number is worse than a visible failure.

## Discord verification gate

The Discord server is closed to anyone who has not linked Discord to a website account.
See the `discord-*` docs in this folder for the original spec, but note those were written
for the Neon stack and name tables that do not exist here.

**Ordering rule, do not reorder:** join the guild *before* syncing roles. Discord rejects a
role write for a user who is not yet a member, so syncing first leaves a brand-new member
in a locked server with no roles and therefore no visible channels. `runProvisioning()` in
`src/lib/provision.ts` does link → join → sync.

**Rate limits:** Discord's role endpoints 429 aggressively. Honour `retry_after` from the
response body; a fixed delay silently drops writes and leaves the database claiming work
that never happened.

## Netlify Functions die on Node 20 without a WebSocket

Netlify bundles Functions for **nodejs20.x**, and `globalThis.WebSocket` only arrived in
Node 22. `createClient()` always builds a RealtimeClient, and realtime-js **throws** from
that constructor when it finds none rather than degrading — so every function in
`netlify/functions/` dies before running a line of its own logic, even though none of them
use realtime.

It never reproduces locally, because dev runs Node 22+. It surfaces as a **502** with
"Node.js detected but native WebSocket not found", attributed to whatever the caller
happened to be doing — it was found by posting a correctly-signed event to the live Stripe
webhook, which meant no subscription event could ever have been recorded.

`_auth.js` now passes `realtime: { transport }` on every `createClient` call, falling back to
the `ws` package. Keep it that way, and keep every function's Supabase client coming from
`_auth.js` — a `createClient` anywhere else reintroduces this. Passing the transport is
preferred over pinning the runtime: it works on every Node version and does not depend on
a host default that can change under us.

To reproduce or re-test, `delete globalThis.WebSocket` before requiring the bundle.

## Kick

- Kick is a **custom** Supabase provider, `custom:kick` — not a built-in one. Both sign-in
  and account linking go through `src/lib/kick.ts` so there is one description of how it
  works. Never send a `redirect_uri` of our own; the address registered on the Kick app is
  Supabase's callback.
- Kick may not release an email address, so a Kick-only account can have none. Nothing
  downstream may assume one.
- **Verification is not in the official API.** See CLAUDE.md → "Platform verification on
  stream listings". The short version: only kick.com's v2 endpoint knows, it is behind
  Cloudflare, it answers from Supabase Edge, and its `verified` field is a **boolean** —
  testing it with `!= null` marks every channel verified.

## Migrations exist now

`supabase/migrations/` was created 2026-08-02. Schema changes go in a file there **and**
get applied; the two must not drift. Everything older than that date still lives only in
the live database, so the folder is a partial record, not a rebuild. `migrate.js` is the
retired Express migrator and does not read this folder.

## Two ways this codebase has failed open

Both found on 2026-08-03 while auditing before a deploy. Neither was exploitable at the
time; both were one environment variable or one missing word away from being so.

**`revoke ... from public` does not revoke from `anon`.** Supabase grants EXECUTE to the
`anon` role *explicitly*, and revoking the PUBLIC pseudo-role leaves that grant untouched.
Every `ws_admin_*` function was therefore callable with the anon key — the one that ships
inside the browser bundle — with nothing but the in-function gate behind it. Name `anon`
in the revoke. There is a loop in `20260803060000_harden_admin_grants.sql` that does this
for the whole prefix; re-run its shape after adding privileged functions, and check with:

```sql
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'ws\_admin\_%'
   and has_function_privilege('anon', p.oid, 'execute');   -- must return nothing
```

**The Stripe webhook accepted unsigned events when its secret was missing.**
`verifySignature` opened with `if (!SIGNING_SECRET) return true`, commented "dev/staging
only" — but it is the same code in production and the difference is one variable. Lose it
and the endpoint activates memberships, sets tiers and pushes Discord roles for whatever
email a forged body names, with nothing erroring anywhere. It now returns 500 when the
secret is absent (a 500 makes Stripe retry, so nothing is lost once it is restored) and
400 when a signature is wrong.

The general rule: **a security check with no key available must refuse, not permit.** If
you find yourself writing "accept when unconfigured", the comment is telling you it is
wrong.

## Critical DOs and DON'Ts

**DO:**
- Put database logic in `ws_*` RPCs (`SECURITY DEFINER`, explicit `search_path`, gated)
- Keep secrets server-side — bot token, service key and Stripe secret never reach the browser
- Write an audit record for every admin mutation, via `ws_audit()`
- Use the `wagesociety` schema explicitly; PostgREST needs it in `pgrst.db_schemas`
- Check `docs/BRAND_GUIDE.md` before any visual work

**DO NOT:**
- Build against Express, EJS, Neon, or bcrypt auth — all retired
- Add an auth system outside Supabase Auth
- Show a placeholder metric in the admin UI
- Let a missing secret or key turn a check into a pass — refuse instead
- Assume `revoke ... from public` covered `anon`; it does not
- Write a `false` because a check failed — "not verified" and "not checked" are different
  states, and so are "offline" and "status unknown"
- Let the Discord role sync overwrite a role a person granted by hand
- Bulk-edit source with PowerShell `Get-Content`/`Set-Content` (it corrupts UTF-8; use Node)
- Assume a push deploys anything — it does not
