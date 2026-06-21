# Agent Notes — WageOS (WAGE Society)

**Read this first. Before touching any file.**

---

## Stack Reality

This is **Express.js + EJS + PostgreSQL (Neon via DATABASE_URL) + bcrypt custom auth**. Supabase removed — no longer used.

- Entry: `server.js` (Express)
- Templates: EJS in `views/`
- CSS: Vanilla CSS in `public/css/`
- No Vite. No React. No TanStack Router. No `src/routes/`. No `src/` directory at all.
- If you see older notes referencing Vite or React: those are wrong. Ignore them.

---

## Auth (Mandated — Do Not Change)

**Custom bcrypt auth only.** No Supabase.

- Email/password: `POST /auth/signup` → bcrypt hash in `auth_users` → session
- Magic link: `POST /auth/magic-link` → token in DB → `GET /auth/verify?token=` → session
- Session: `express-session` + `connect-pg-simple` (Postgres-backed), 30-day cookie, secure+sameSite=lax
- Superadmin: `lib/auth.js` `SUPERADMIN_EMAILS` set promotes `member_profiles.role = 'superadmin'` on login
- Routes: `routes/auth-custom.js` — this is the auth system. Do not create parallel auth routes.

**Do NOT add:** Supabase auth, additional OAuth providers, or any auth system outside `auth-custom.js`.

---

## Database (Mandated — Do Not Split)

**Neon Postgres only**, accessed via `pg` Pool using `DATABASE_URL` (Neon connection string). No Supabase.

- Pool singleton: `db/index.js` — only file allowed to call `new Pool()`
- All queries: named functions in `db/<entity>.js`
- Schema changes: `migrations/<timestamp>_<name>.sql` only — no DDL in runtime files

**Do NOT:** create a second Pool anywhere, write inline SQL outside `db/`, use Supabase for anything.

---

## Env Vars Required on Render

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `SESSION_SECRET` | express-session signing key |
| `APP_URL` | Public app URL, e.g. `https://wagesociety.com` |
| `DISCORD_CLIENT_ID` | Discord app client ID |
| `DISCORD_CLIENT_SECRET` | Discord app client secret |
| `DISCORD_BOT_TOKEN` | Discord bot token for role sync and server management |
| `DISCORD_PUBLIC_KEY` | Discord interaction verification key, if interactions are enabled |
| `DISCORD_REDIRECT_URI` | Discord user link callback, e.g. `https://wagesociety.com/auth/discord/callback` |
| `DISCORD_BOT_REDIRECT_URI` | Discord bot install/server authorization callback |
| `DISCORD_GUILD_ID` | Official WAGE Society guild snowflake |
| `DISCORD_WEBHOOK_SECRET` | Optional secret for bot/server webhooks |
| `DISCORD_ROLE_FREE_ID` | Legacy/static free tier role fallback only; live dropdown mappings should replace hardcoding |
| `DISCORD_ROLE_CREATOR_ID` | Legacy/static creator tier role fallback only; live dropdown mappings should replace hardcoding |
| `DISCORD_ROLE_PRO_ID` | Legacy/static pro tier role fallback only; live dropdown mappings should replace hardcoding |
| `STRIPE_LINK_CREATOR` | Stripe payment link URL for creator tier |
| `STRIPE_LINK_PRO` | Stripe payment link URL for pro tier |
| `STRIPE_LINK_DONATION_*` | Stripe payment link URLs for donations |
| `ZOHO_SMTP_HOST` | Zoho SMTP host |
| `ZOHO_SMTP_USER` | Zoho SMTP username |
| `ZOHO_SMTP_PASS` | Zoho SMTP password |

Discord account linking uses the bot/OAuth flow, not Supabase OAuth. No `SUPABASE_URL`, `SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` needed.

Never expose `DISCORD_BOT_TOKEN`, OAuth tokens, database URLs, stack traces, or private headers to the browser or admin UI.

---

## Route Map

| File | Purpose |
|---|---|
| `routes/auth-custom.js` | Custom bcrypt email/password + magic link auth (the auth system) |
| `routes/discord.js` | Discord OAuth link/unlink + role sync trigger |
| `routes/pages.js` | All server-rendered EJS pages (/, /login, /join, /dashboard, /memberships, etc.) |
| `routes/admin/discord-resync.js` | Existing `POST /admin/discord/resync-all` superadmin bulk Discord role re-sync |
| `routes/admin/debug.js` | Internal diagnostic panel (DB health, env, tables, SQL runner, etc.) |
| `routes/api/auth.js` | `/api/auth/logout` + `/api/auth/me` session helpers only |
| `routes/api/live.js` | Livestream list + autoclipper job queue |
| `routes/api/shop.js` | Merch items |
| `routes/api/news.js` | Blog posts |
| `routes/api/public-directory.js` | Creator directory |
| `routes/api/public-profile.js` | Public profile fetch by username |
| `routes/api/me.js` | Profile read + update for authenticated user |
| `routes/api/marketing.js` | Newsletter subscription |
| `routes/api/check-username.js` | Username availability check |
| `routes/api/collab.js` | Collaboration requests |
| `routes/api/chatbot.js` | Chat bot integration |
| `routes/api/donate.js` | Donation payment links |
| `routes/api/webhooks.js` | Stripe webhook handler (donations + subscription lifecycle) |
| `routes/api/admin-users.js` | Admin user management API |
| `routes/api/admin-roles.js` | Admin roles + permissions management API |
| `routes/api/discord-role-mappings.js` | Discord tier/role mapping API |

---

## Discord Bot Admin Control Center Requirements

The `/admin/discord` feature is the website control center for the official WAGE Society Discord server and every outside server using the WAGE Society bot.

### Non-negotiables

- No fake numbers, placeholders, or decorative-only buttons.
- Metrics must come from Discord API, Neon database records, or bot telemetry.
- All dropdowns for roles/channels must use live synced Discord data.
- All WAGE tier dropdowns must use live WAGE tier records.
- Every admin action must call a real backend endpoint, return a clear result, and write an audit log.
- Browser code must never hold the bot token or make privileged Discord API calls directly.
- Missing permissions must be detected before attempting role/channel/permission changes.

### Required Tabs

| Tab | Required behavior |
|---|---|
| Main Server | Official guild health, member count, role count, linked users, verification level, uptime, heartbeat, last sync, last error. |
| Bot Settings | Sync frequencies, auto-connect, auto role assignment, auto role on join dropdown, log level. |
| Other Servers | Every connected guild, member count, owner/admin, linked users, permissions, health, resync/disconnect/leave actions. |
| Channels & Permissions | Synced category/channel tree, channel editor, permission overwrites, safe create/edit flows. |
| Role Settings | Live role list, tier-to-role mapping, role metadata, sync-all roles, deleted/missing role warnings. |
| Logs | Admin changes, bot events, OAuth events, sync results, errors, security warnings. |

### Auto Role and Tier Mapping Rules

- Auto role on join should be a live Discord role dropdown.
- Default recommendation: `Unverified`.
- Tier-to-role mapping should use WAGE tiers on the left and live Discord roles on the right.
- Tier options update when tiers are added, removed, renamed, or disabled.
- Role options update after role sync.
- `Sync All Roles` must fetch Discord roles, diff against database records, preserve manual mappings where possible, and log changes.

### Channel and Permission Manager Rules

- Sync categories, text channels, voice channels, forums, announcements, stages, and supported threads.
- Left panel should show the real category/channel tree.
- Right panel should edit the selected channel.
- Permission editor must use Allow, Deny, Inherit states.
- Warn before blocking `View Channel`, `Send Messages`, admin access, or bot access.
- Dangerous changes require confirmation.

### Troubleshooting Buttons

Required actions include:

- Test Bot Connection
- Test Permissions
- Resync Server
- Resync Roles
- Resync Channels
- Resync Members
- Re-run Role Assignments
- Clear Bot Cache
- Restart Worker
- View Last Error
- Send Test Message

Each needs loading, success, warning, failure, and audit log handling.

### Three.js Direction

Three.js may be added as an optional visual layer, not the only admin flow. Good ideas: 3D connected-server map, health-colored nodes, official server as the central hub, orbiting partner servers, clickable node details, and channel architecture visualization.

---

## Critical DOs and DON'Ts

**DO:**
- Read `CLAUDE.md` before every task — it's the canonical project map
- Read `/reports/` before re-investigating anything — diagnostics are already there
- Read `docs/discord-bot-setup.md` before changing Discord bot/admin features
- Keep `server.js` under 300 lines when possible
- Put all new routes in `routes/<name>.js` or the appropriate existing route group and mount via `app.use()`
- Put all DB queries in `db/<entity>.js` as named functions
- Put all DDL in `migrations/<timestamp>_<name>.sql`
- Add audit logging to Discord admin changes
- Use live database/Discord data for admin screens

**DO NOT:**
- Introduce Express to a project that doesn't use it — this project already uses Express, that's fine
- Add Supabase auth or any auth system outside `routes/auth-custom.js`
- Write inline SQL in routes or lib files
- Hardcode `COOKIE_DOMAIN` or any auth domain
- Commit secrets (`.env` is gitignored — keep it that way)
- Reference or build for Vite, React, TanStack Router — wrong project
- Hardcode Discord roles in new admin UI; use synced live dropdowns
- Show fake dashboard metrics
- Expose bot/OAuth tokens to browser code

---

## Where Prior Diagnostic Reports Live

Diagnostic and status reports live in `/reports/`. Current implementation guidance should be treated as stronger than historical reports. Historical files are useful for context but should not override the current stack and Discord control center requirements above.
