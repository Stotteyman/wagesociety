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
- Bulk-edit source with PowerShell `Get-Content`/`Set-Content` (it corrupts UTF-8; use Node)
- Assume a push deploys anything — it does not
