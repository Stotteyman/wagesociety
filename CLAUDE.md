# WAGE Society — Codebase Guide

> **Verified against source on 2026-07-29.** Every claim below was re-checked against the
> files it describes. The previous version of this file described an Express + EJS + Neon
> stack with "No Supabase" — that was wrong in a way that mis-aims anyone who reads it.
> `docs/AGENT_NOTES.md` (rewritten 2026-07-28) is the other authoritative doc; if the two
> ever disagree, prefer `AGENT_NOTES.md` for hosting/auth/permissions detail and re-check
> the source.

## What this app does

Creator OS for the W.A.G.E. Society community — creators manage profiles, go live, sell
memberships, merch and gated video, blog, and build audiences. The platform takes **10%**
of creator sales and the creator keeps the other 90% (`netlify/functions/_platform.js`,
mirrored for the browser in `src/lib/platform.ts`).

## Stack — the live app

**Vite + React (TypeScript) SPA → Netlify Functions → Supabase (Postgres, Auth, RLS).**

| Layer | Reality |
|---|---|
| Entry | `index.html` → `src/main.tsx` → `src/App.tsx` (React Router) |
| Pages | `src/pages/*.tsx`, shared UI in `src/components/`, primitives in `src/components/ui/` |
| Styling | Tailwind v4 (`tailwind.config.cjs`, `postcss.config.cjs`); tokens in `docs/BRAND_GUIDE.md` |
| API | `netlify/functions/*.js`, exposed at `/api/*` by a redirect in `netlify.toml` |
| Database | Supabase Postgres, schema **`wagesociety`** (`netlify/functions/_auth.js:5`, overridable via `SUPABASE_SCHEMA`) |
| Auth | Supabase Auth — Discord, Google, email; Kick as custom provider `custom:kick` |
| Node | 20 (`.nvmrc`) |

`package.json` scripts — **these are all of them**: `start`, `dev` (both `node server.js`,
legacy), `dev:web` (vite), `build:web` (vite build), `preview`, `typecheck` (`tsc --noEmit`).
There is **no test script**, and **no `build` or `migrate` script** — anything claiming
`npm run build` runs migrations on deploy is stale.

### Legacy Express app — dead code, still in the tree

`server.js`, `routes/`, `views/`, `db/`, `bot/`, `lib/`, `jobs/`, `middleware/`, `migrate.js`
are the retired Express + EJS + Neon + bcrypt application. Per `docs/AGENT_NOTES.md` it is
**no longer deployed and its Neon database is unreachable**. Do not extend it or use it as a
reference for how things work now. It is mapped below only so you can recognise it.

## Hosting and deploy

- Netlify project `wagesociety`; `wagesociety.com` cut over from Render to Netlify 2026-07-28.
- `netlify.toml`: build `npm run build:web`, publish `dist/`, functions `netlify/functions`,
  `/api/*` → `/.netlify/functions/:splat`, then an SPA fallback `/*` → `/index.html` **last**.
- **Auto-builds are off.** Pushing to GitHub deploys nothing; publishing is always explicit
  (see `docs/AGENT_NOTES.md` for the exact deploy command). DNS is at GoDaddy.
- `dist/` is build output and is gitignored — never edit it, never treat it as source.
- `polsia.toml`, `render.yaml` and `FOR_POLSIA.md` at the repo root are **dead config** from
  the Render/Polsia era. They carry the old cron schedules (guild sync `*/30`, role sync
  `*/15`); preserve those somewhere before deleting the files.

## Directory map — live app

```
index.html, vite.config.ts, tsconfig.json, tailwind.config.cjs, postcss.config.cjs
src/
  main.tsx, App.tsx           — router; route table is App.tsx, read it before adding a page
  lib/
    supabase.ts               — browser client; reads public.wagesociety_* views (anon key)
    api.ts                    — fetch wrapper for /api/* functions
    provision.ts              — link → join → sync ordering for Discord onboarding
    platform.ts               — browser mirror of the 10% fee maths
    plans.ts, handles.ts, discord.ts, kick.ts, site.ts
  hooks/useSession.ts, useRole.ts
  components/                 — Layout, RequireAuth, ConnectAccounts, VideoStudio,
                                YouTubeChannelPicker, HandleEditor, Membership, …
  components/ui/              — Avatar, AvatarUpload, StatTile, TierChip, EmptyState,
                                PageHeader, LegalPage, ReturnNotice
  pages/                      — Home, Directory, CreatorProfile, Blog, BlogPost, Faq,
                                Leaderboard, Streams, Merch, Login, Verify, LinkDevice,
                                Watch, Tools, Dashboard, Onboarding, Settings, Referrals,
                                PointShop, Plans, WhyTenPercent, Terms, PrivacyPolicy,
                                Admin, NotFound
  pages/admin/AdminOps.tsx    — operational tabs of the admin control center
netlify/functions/
  _auth.js                    — shared: service/user Supabase clients, role ladder, json()
  _platform.js, _stripe-config.js — shared helpers (not endpoints)
  me.js, profile.js, check-username.js, newsletter.js, health.js
  checkout.js, addon-checkout.js, video-checkout.js, stripe-webhook.js
  connect-onboard.js, connect-status.js          — Stripe Connect for creators
  video-playback.js, tool-download.js            — entitlement-gated signed URLs
  discord-join.js, discord-sync.js, discord-sync-user.js
  youtube-channels.js, youtube-live.js
  app-auth.js, app-entitlement.js                — desktop app device authorization
  admin-health.js, admin-discord-ops.js          — admin monitors + Discord ops
docs/                         — AGENT_NOTES.md (read first), BRAND_GUIDE.md, discord-*.md,
                                wageworld-technical-breakdown.md, member-tools-downloads.md
reports/                      — audits; newest is DIAGNOSTIC_2026-07-17.md (Express-era)
automation/                   — unattended agent: PROMPT.md, AUTOMATION_BACKLOG.md, RUN_LOG.md
scripts/                      — build-brand-assets.mjs, backfill-referral-codes.js, …
```

## Directory map — legacy Express (dead)

`server.js` mounts these routers, in this order. Listed for recognition only:

```
/api/webhooks, /api/discord/webhook            (before body parsers — raw body)
/auth/google, /auth/kick, /auth/discord, /auth/discord-bot, /auth/discord-login, /auth
/api/auth /api/live /api/shop /api/points-shop /point-shop /api/news
/api/public-directory /api/public-profile /api/me /api/account /api/points
/api/marketing /api/check-username /api/search /api/collab /api/chatbot
/api/donate /api/checkout
/api/admin/{users,shop,roles,tiers,discord,referrals}
/admin (routes/admin/index.js), /admin/discord, /admin/diagnostics, /admin/tiers
/admin/debug → 301 redirect to /admin/diagnostics
/api/discord-servers, /api/discord/role-mappings, /api/discord
/api/stats, /api/homepage-stats, /api/trial, /api/subscriptions
/ (routes/referrals.js), / (routes/pages.js — last)
```

Legacy footguns, if you ever do touch this tree:

- `routes/pages.js:968` is a `/:username` catch-all. A new top-level page route that is not
  in its `RESERVED` array renders `profile-not-found` instead of the page.
- That guard renders `pages/404`, and **`views/pages/404.ejs` does not exist** — every
  reserved-path 404 throws instead of rendering.
- `routes/pages.js:992` is a dangling `// GET /play` comment with no handler; `/play` and
  `/wageworld` are dead (see `reports/DIAGNOSTIC_2026-07-17.md` §2).
- `db/index.js` throws at require-time when `DATABASE_URL` is unset, so requiring anything
  in this tree without env fails immediately.
- There are **two user tables** — `auth_users` (UUID, real) and a legacy `users` (integer,
  created inline by `migrate.js:28`) — and `discord_links.user_id` is read as both types by
  different files. Nothing writes `users` any more (`lib/auth.js`'s `ensureUser()` has no
  callers), so the integer lookups return `null` and the Discord paths fail *silently*
  rather than loudly. Traced with file:line evidence in `docs/USER_TABLE_SPLIT_BRAIN.md` —
  read that before touching anything Discord-related in this tree.

## Database

- Supabase Postgres. Application tables live in the **`wagesociety`** schema — *not* `public`,
  and *not* a schema called `wage`.
- The browser reads **`public.wagesociety_*` views** with the anon key: `wagesociety_home_stats`,
  `_creators`, `_blog`, `_plans`, `_addons`, `_faq`, `_leaderboard`, `_merch`, `_shop`,
  `_channels`, `_videos`. All privileged writes go through Netlify Functions with the
  service-role key, never from the browser (`src/lib/supabase.ts:8`).
- Business logic lives in Postgres **RPCs named `ws_*`** in the `public` schema, reading and
  writing `wagesociety.*`: `ws_current_role()`, `ws_is_staff(role)`, `ws_has_permission(key)`,
  `ws_admin_metrics()`, `ws_admin_rbac()`, `ws_admin_audit_log()`, `ws_audit()`, …
- **There is no `migrations/` folder and no schema file in this repo.** `migrate.js`'s
  `runFolderMigrations()` silently returns when the folder is absent (`migrate.js:54`), so
  the schema exists only in the live Supabase database. This is a real
  disaster-recovery gap — see backlog item W2.

## Permissions

Role ladder (`netlify/functions/_auth.js:13`):
`guest 0 · member/customer 1 · staff 2 · manager 3 · admin 4 · superadmin 5`.
`stotteyman@gmail.com` and `gggiddings@yahoo.com` are hardcoded superadmin so the owner
cannot be locked out. Every admin action must be gated **server-side** in the function or
the RPC; hiding UI is presentation, never the security boundary.

## External integrations

- **Stripe** — real API via Netlify Functions: membership + add-on checkout, gated video,
  Stripe Connect payouts, signature-verified webhook. Not hosted payment links any more.
- **Discord** — Supabase OAuth link, guild join, tier role sync, admin ops. Ordering rule:
  **join the guild before syncing roles**, and honour `retry_after` on 429s.
- **Google / Kick / X** — Supabase Auth providers; Kick is `custom:kick`.
- **YouTube** — live status refreshed on a schedule, designed around API quota.
- **Supabase project is shared across the org.** Auth config (`SITE_URL`, redirect
  allow-list, SMTP) is global — changes have blast radius beyond this site.

## Recent changes

From `git log` on `crest-brand-rebuild` (newest first). Older numbered entries that used to
live here described the retired Express app and have been dropped as misleading.

- 2026-07-29 — Live status on a schedule instead of a YouTube API key; YouTube scope only on
  opt-in; X account connect; terms + privacy pages and X sign-in; X/TikTok brand asset sizes;
  real icon/social set generated from the crest; two signup failure modes fixed.
- 2026-07-28 — Desktop app requires a WAGE account; nav thinned to two items; `@handle`
  editing; admin panel rebuilt as an operating console (metrics, access control, monitors);
  Discord gated behind website verification with join-before-role-assign; member tool downloads.
- 2026-07-27 — Stripe Connect gated video with the 10% platform fee; membership checkout moved
  onto our own Stripe account with add-ons; `/why-10-percent`; Admin rebuilt on the crest
  design system; Kick linked through Supabase; YouTube live detection; `/verify` onboarding
  wizard with automatic Discord join; AI-training crawler policy.
