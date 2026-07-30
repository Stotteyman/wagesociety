# WAGE Society — Creator OS

**Vite + React (TypeScript) SPA → Netlify Functions → Supabase (Postgres, Auth, RLS).**

A platform where creators manage profiles, go live, sell memberships, merch and gated
video, blog, and build audiences, with their Discord identity linked across the WAGE
Society Discord ecosystem. The platform takes **10%** of creator sales and the creator
keeps the other 90% (`netlify/functions/_platform.js:14`, mirrored for the browser in
`src/lib/platform.ts`).

> **Verified against source on 2026-07-30.** The previous version of this file described
> an Express + EJS + Neon + bcrypt stack, said "Supabase removed", listed a `migrations/`
> folder that does not exist, and ended with "Render auto-runs `npm run build`" — there is
> no `build` script, no `migrate` script, and the app deploys to Netlify. If this file and
> the source ever disagree again, the source wins.
>
> Read `docs/AGENT_NOTES.md` first for hosting, auth and permissions detail; `CLAUDE.md`
> for the directory and database map.

## Stack

| Layer | Reality | Source |
|---|---|---|
| Entry | `index.html` → `src/main.tsx` → `src/App.tsx` (React Router) | `vite.config.ts` |
| Pages | `src/pages/*.tsx`; shared UI in `src/components/` | — |
| Styling | Tailwind v4; tokens in `docs/BRAND_GUIDE.md` | `tailwind.config.cjs` |
| API | `netlify/functions/*.js`, served at `/api/*` | `netlify.toml:18-21` |
| Database | Supabase Postgres, schema **`wagesociety`** (not `public`, not `wage`) | `netlify/functions/_auth.js:5` |
| Auth | Supabase Auth — Discord, Google, email; Kick as `custom:kick` | `docs/AGENT_NOTES.md` |
| Payments | Stripe SDK server-side: checkout, add-ons, gated video, Connect payouts, signature-verified webhook | `netlify/functions/checkout.js`, `stripe-webhook.js` |
| Node | 20 | `.nvmrc` |

The browser reads `public.wagesociety_*` views with the anon key. Every privileged write
goes through a Netlify Function with the service-role key — never from the browser
(`src/lib/supabase.ts`). Business logic lives in Postgres RPCs named `ws_*`.

## Dev Setup

```bash
npm install
npm run dev:web    # vite dev server
npm run typecheck  # tsc --noEmit
npm run build:web  # vite build → dist/
```

`package.json` defines exactly these scripts: `start`, `dev` (both `node server.js`,
legacy), `dev:web`, `build:web`, `preview`, `typecheck`. **There is no `test`, `build` or
`migrate` script.** Anything claiming `npm run build` runs migrations on deploy is stale.

Environment variables are configured in Netlify, not in this repo. Never commit a value, and
never read `.env*`.

## Deployment

- Netlify project `wagesociety`; `wagesociety.com` cut over from Render to Netlify
  on 2026-07-28. DNS is at GoDaddy.
- Build `npm run build:web`, publish `dist/`, functions from `netlify/functions`
  (`netlify.toml:3-6`). `/api/*` rewrites to `/.netlify/functions/:splat`, then an SPA
  fallback `/*` → `/index.html` **last**.
- **Auto-builds are off.** Pushing to GitHub deploys nothing; publishing is always
  explicit — see `docs/AGENT_NOTES.md` for the exact command.
- `dist/` is build output and is gitignored. Never edit it, never treat it as source.

## Key Files

| Path | Purpose |
|------|---------|
| `src/App.tsx` | Router — the route table. Read it before adding a page |
| `src/lib/supabase.ts` | Browser client; reads `public.wagesociety_*` views with the anon key |
| `src/lib/api.ts` | fetch wrapper for `/api/*` |
| `src/lib/provision.ts` | Discord onboarding: link → join → sync, in that order |
| `src/lib/platform.ts` | Browser mirror of the 10% fee maths |
| `netlify/functions/_auth.js` | Shared: service/user Supabase clients, role ladder, `json()` |
| `netlify/functions/_platform.js` | The 10% fee, in one place so it cannot drift |
| `netlify/functions/checkout.js`, `addon-checkout.js`, `video-checkout.js` | Stripe Checkout sessions |
| `netlify/functions/stripe-webhook.js` | Stripe webhook (signature verified via `STRIPE_SIGNING_SECRET`) |
| `netlify/functions/connect-onboard.js`, `connect-status.js` | Stripe Connect for creators |
| `netlify/functions/discord-join.js`, `discord-sync.js`, `discord-sync-user.js` | Discord guild join and tier role sync |
| `netlify/functions/admin-health.js`, `admin-discord-ops.js` | Admin monitors and Discord ops |
| `docs/AGENT_NOTES.md` | Hosting, auth, permissions — read first |
| `docs/BRAND_GUIDE.md` | Design tokens; check before any visual work |
| `docs/CRON_SCHEDULES.md` | The cron schedules rescued from the deleted Render/Polsia config |

## Permissions

Role ladder (`netlify/functions/_auth.js:13`):
`guest 0 · member/customer 1 · staff 2 · manager 3 · admin 4 · superadmin 5`.
`stotteyman@gmail.com` and `gggiddings@yahoo.com` are hardcoded superadmin so the owner
cannot be locked out. Every admin action must be gated **server-side** in the function or
the RPC. Hiding UI is presentation, never the security boundary.

## Where the schema lives

**There is no `migrations/` folder and no schema file in this repo.**
`runFolderMigrations()` in `migrate.js:53-55` silently returns when the folder is absent,
so the schema exists only in the live Supabase database. This is a real disaster-recovery
gap, tracked as backlog item W2.

## Discord

The Discord server is closed to anyone who has not linked Discord to a website account.
**Ordering rule, do not reorder:** join the guild *before* syncing roles — Discord rejects
a role write for a user who is not yet a member. Honour `retry_after` on 429s.

The `/admin` control center's standard is **no fake numbers**: every count must come from a
database row, the Discord API or Stripe, and a metric that cannot be fetched must render as
an error rather than a zero. Browser code must never receive the bot token.

The `docs/discord-*.md` files are the original specification, but they were **written for
the retired Neon stack and name tables that do not exist in Supabase**
(`docs/AGENT_NOTES.md`). Treat them as design intent, not as a map of the current database.

*Unverified:* the persistent discord.js gateway bot has no host — Netlify cannot hold a
long-lived gateway connection, and choosing a host is an open decision (backlog item P2).
Whether any bot process is currently running cannot be settled from this repo.

## Legacy Express app — dead code, still in the tree

`server.js`, `routes/`, `views/`, `db/`, `bot/`, `lib/`, `jobs/`, `middleware/` and
`migrate.js` are the retired Express + EJS + Neon + bcrypt application. Per
`docs/AGENT_NOTES.md` it is **no longer deployed and its Neon database is unreachable**.
Do not extend it or use it as a reference for how things work now.

For recognition only, and true only of that tree:

- Sessions are `express-session` + `connect-pg-simple` (`server.js:29-30`); the pool is
  `db/index.js`, which throws at require-time when `DATABASE_URL` is unset.
- Auth is bcrypt against `auth_users`, mounted at `/auth` (`server.js:175`):
  `POST /auth/signup`, `POST /auth/login`, `POST /auth/magic-link` →
  `GET /auth/verify?token=` (`routes/auth-custom.js:140,243,277,330`). Magic-link email is
  Zoho SMTP and no-ops when `ZOHO_SMTP_*` is unset.
- `db/index.js` is **not** the only file that constructs a pool — `migrate.js:123` builds
  its own.
- `routes/pages.js:971` is a `/:username` catch-all: a new top-level route missing from its
  `RESERVED` array (`:972-975`) renders `profile-not-found` instead of the page. And the
  guard itself renders `pages/404` (`:977`) — `views/pages/404.ejs` does not exist, so every
  reserved-path 404 throws instead of rendering.

## WageWorld — not reachable

`docs/wageworld-technical-breakdown.md` describes a Three.js creator world: first-person
spawn house, POV switching, wardrobe/mirror character creation, a settings menu,
keyboard/touch/gamepad controls, proximity chat foundations, guide NPCs, WAGE token pickups
against the point ledger, and a Creator Plaza hub.

**Neither `/wageworld` nor `/play` serves it today.** `routes/pages.js:995` is a dangling
`// GET /play` comment with no handler, `wageworld` appears only in the `RESERVED` array
(`routes/pages.js:975`), `routes/api/wageworld-rewards.js` is not mounted in `server.js`,
and `src/` declares no WageWorld route at all. The design doc is a plan, not a description
of something running. Finishing or reverting it is backlog item P1.
