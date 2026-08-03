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
  pages/admin/                — the admin control center, one file per area:
                                AdminOps (metrics, roles, monitors, Discord, audit),
                                AdminUsers (people + the management panel),
                                AdminStaff (applications, roster, Discord role map, positions),
                                AdminBadges, AdminChannels, AdminFunding
netlify/functions/
  _auth.js                    — shared: service/user Supabase clients, role ladder, json()
  _platform.js, _stripe-config.js — shared helpers (not endpoints)
  me.js, profile.js, check-username.js, newsletter.js, health.js
  checkout.js, addon-checkout.js, video-checkout.js, stripe-webhook.js
  connect-onboard.js, connect-status.js          — Stripe Connect for creators
  video-playback.js, tool-download.js            — entitlement-gated signed URLs
  discord-join.js, discord-sync.js, discord-sync-user.js
  discord-staff-sync.js                          — Discord staff roles → website roles
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
- **`supabase/migrations/` exists as of 2026-08-02 and is the way to change the schema.**
  Everything before that date lives only in the live database, so the folder is a partial
  record, not a rebuild — backlog item W2 is narrowed, not closed. Anything new goes in a
  migration file *and* is applied; the two must not drift.
- `migrate.js` is the retired Express migrator and does not read this folder
  (`runFolderMigrations()` looks elsewhere and silently returns). Ignore it.

## Permissions

Role ladder (`netlify/functions/_auth.js:13`):
`guest 0 · member/customer 1 · staff 2 · manager 3 · admin 4 · superadmin 5`.
`stotteyman@gmail.com` and `gggiddings@yahoo.com` are hardcoded superadmin so the owner
cannot be locked out. Every admin action must be gated **server-side** in the function or
the RPC; hiding UI is presentation, never the security boundary.

Since 2026-08-03 `ws_admin_set_role` is **manager and up**, not superadmin only, bounded by
three rules it enforces itself — you may not grant a role at or above your own, may not
touch someone who already outranks you, and may not touch the two hardcoded owner
accounts. In practice a manager can create staff and nothing higher. That is what makes
recruiting a helper possible without going through the owner.

`wagesociety.user_roles` carries `source` and `locked`, and both change behaviour:

- `source = 'discord'` — set by the Discord role sync, and the sync may move it again.
- `source = 'manual'` — granted by a person. **The sync never undoes it.**
- `locked = true` — nothing moves it but a superadmin. Set from the user panel.

Where a control is hidden or disabled in `AdminUsers.tsx`, the same rule is also enforced
in the RPC. `ws_admin_user_detail` returns `can_manage` so the ladder is worked out in one
place rather than re-derived, slightly differently, in the browser.

## Three axes, kept apart

Three different things about a member, deliberately separate, each with its own set of
Discord roles:

| | Where it lives | What it decides | Discord roles |
|---|---|---|---|
| **Website role** | `user_roles` | what you may **do** | Director, Admin, Staff, Moderator, Helper |
| **Tier** | `profiles.tier` | what you **get** | member, Creator, Pro, Elite, Unlimited |
| **Badge** | `user_badges` | who you **are**, and what that is worth | Founder, Staff, OG |

**The sets must not overlap, and a trigger enforces it.** Not for tidiness: the tier sync
in `ws_svc_discord_sync` actively *removes* every tier role a member does not currently
qualify for. Point a badge or a staff mapping at a tier role and the next tier sync strips
it back off, silently, on a schedule. `wagesociety.assert_not_a_tier_role()` fires on
`badges.discord_role_id` and `discord_role_map.role_id` and refuses with an explanation.

Staff appears under both role and badge on purpose — holding the Discord Staff role both
grants website access and earns the staff badge. Both directions are **additive** and
never remove, so they converge rather than fight. A tier role in either list would not.

The bot sits at position 14 in the hierarchy, below Director (18) and Admin (17). It can
read those roles but can never assign them. That is fine, because staff sync only reads.

## Entitlements: what a badge is worth

Two columns on `wagesociety.badges` carry real money:

- `floor_tier` — a tier this badge guarantees, free, for as long as it is held.
  `founder → unlimited`, `og → creator`.
- `discount_tier` — every paid plan costs its price minus this tier's price.
  `og → creator`.

Plus `app_settings.launch_at`, set in **/admin → Badges**. **Null means the grace period
is still running**, and that is the shipped default so nobody starts being charged because
a date was forgotten.

```
                    before launch      after launch
founder (any tier)  free               free            (never expires)
og  creator         free               free
og  pro   $24.99    free               $15.00
og  elite $49.99    free               $40.00
og  unlimited       free               $90.00
```

**`ws_svc_price_for(user, plan, cycle)` is the only place a price is decided.**
`checkout.js` charges what it returns and the plans page renders what it returns, so the
figure on screen and the figure charged cannot drift. Never compute a price in the browser
or trust one from a request body.

When the price is zero, checkout does **not** create a $0 Stripe subscription — it calls
`ws_svc_grant_free_membership`, which re-prices the plan itself before granting anything.
That second check matters: without it, it is an endpoint that hands Unlimited to anyone who
calls it.

`user_memberships.never_expires` marks a membership no Stripe subscription backs. Nothing
lapses memberships today (expiry is driven entirely by Stripe webhooks), so this is
intent-recording for the day something does.

## Staff: recruiting, access, onboarding

`/join-the-team` (aliases `/careers`, `/staff`) lists `wagesociety.staff_positions` and takes
applications. `/admin` → Staff works them.

**Hiring is one call.** `ws_admin_staff_decide(id, 'hired')` grants the position's website
role, hands over its badge, and seeds that person's onboarding checklist together. Doing
those three separately is how somebody ends up with moderator access and no onboarding.
It reuses `ws_admin_set_role`, so the ladder applies to hiring too; if the role grant is
refused the status change is rolled back rather than leaving a hire with no access.

Tables: `staff_positions`, `staff_applications` (one open application per person, enforced
by a partial unique index; 60-day cooldown after a rejection), `staff_onboarding_tasks`,
`staff_onboarding_progress`.

## Discord ↔ website roles

Two syncs, opposite directions. Do not confuse them:

- **tier, website → Discord** — `discord-sync.js` / `discord-sync-user.js`, driven by
  `discord_tier_role_map`. This is the original one.
- **staff, Discord → website** — `discord-staff-sync.js`, driven by `discord_role_map`
  (edited in `/admin` → Staff). Discord is where staff are actually appointed, so it is
  treated as the source of truth for the roles listed there.

The staff sync only decides *what Discord says*. `ws_svc_apply_staff_role` decides what that
is allowed to do, in this order: locked → never; owner account → never; role granted by
hand → left alone; otherwise set, and marked `source = 'discord'`. Someone who is not in
the guild is skipped, never demoted — an absence can mean a paging boundary, not a
departure. Run `preview` before `apply`; it computes every change and writes nothing.

Listing guild members needs the **SERVER MEMBERS INTENT** enabled on the bot. Without it
Discord returns a bare 403 that says nothing about what is missing, so the function
translates it into a hint.

## Badges

`wagesociety.badges` is a catalog, not a fixed set of four. A badge carries its own
`color` and `shape`, so one created in `/admin` → Badges renders on profiles immediately.

**The `shape` values in `badges_shape_check` mirror the `SHAPES` map in
`src/components/ui/ProfileBadges.tsx`.** Adding a shape means adding it in both places. The
constraint exists so the database can never hold a silhouette the component cannot draw,
which would render as nothing at all.

`public.wagesociety_creators.badges` is an **array of objects** (`slug, label, description,
color, shape`), not the array of slugs it used to be — that is what lets the browser draw
a badge it has never heard of. `ProfileBadges` still accepts bare slugs for the four
built-ins so a stale cache does not blank someone's profile.

`founder`, `staff`, `verified` and `og` are `is_builtin` and cannot be deleted: `staff` is
written by the Discord role sync and `og` by the `profiles_grant_og` trigger, so dropping
the row would break a writer that never checks whether it still exists.

Granting needs the `manage_badges` permission (manager and admin by default), and every
grant and revoke is audited.

## Platform verification on stream listings

`member_livestreams.is_verified` drives the tick on `/streams`. It is **three-state** and
the third matters: `true` verified, `false` checked and not verified, `null` never
successfully checked. Nothing renders for `null`.

Kick's official API carries no verification field at all — `/public/v1/channels` returns
slug, stream, category and counts; `/public/v1/users` returns four fields. The only source
is kick.com's own `/api/v2/channels/{slug}`, which is behind Cloudflare: it answers from
the Supabase Edge runtime and refuses a plain curl. On that endpoint `verified` is a
**boolean**, not the object-or-null shape Kick uses elsewhere — reading it as
`verified != null` marks every channel verified, which is exactly the bug that shipped for
about ten minutes on 2026-08-03.

The `kick-live` edge function re-checks at most daily, writes nothing at all when the
request is blocked, and never overwrites `verified_source = 'manual'`. Managers set it by
hand in `/admin` → Channels.

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

- 2026-08-03 — Every Netlify Function was 502ing on Node 20 for want of a WebSocket;
  badges became a catalog that can be created and granted; the Users tab became a
  management panel; staff recruiting and onboarding built end to end; Discord staff roles
  now sync **into** the website; Kick sign-in; Kick channel verification detected and shown
  on stream listings.
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
