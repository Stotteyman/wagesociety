# Agent Notes — WageOS (WAGE Society)

**Read this first. Before touching any file.**

---

## Stack Reality

This is **Express.js + EJS + PostgreSQL (Neon via DATABASE_URL) + @supabase/supabase-js**.

- Entry: `server.js` (Express)
- Templates: EJS in `views/`
- CSS: Vanilla CSS in `public/css/`
- No Vite. No React. No TanStack Router. No `src/routes/`. No `src/` directory at all.
- If you see older notes referencing Vite or React: those are wrong. Ignore them.

---

## Auth (Mandated — Do Not Change)

**Supabase Auth only.** Providers: email magic link, Google OAuth, Discord OAuth.

- Magic link: `POST /auth/magic-link` → Supabase sends OTP → user clicks → `GET /auth/verify?code=` → PKCE exchange → session created
- Google/Discord: client-side Supabase JS SDK (CDN) calls `signInWithOAuth` → redirect → `GET /auth/verify` handles PKCE exchange generically
- Session: `express-session` + `connect-pg-simple` (Postgres-backed), 30-day cookie, secure+sameSite=lax
- Superadmin: `lib/auth.js` `SUPERADMIN_EMAILS` set promotes `member_profiles.role = 'superadmin'` on login
- `scripts/promote-superadmin.js` — server-side only, never HTTP-accessible

**Do NOT add:** custom email/password tables, bcrypt, `/register`, `/login`, parallel admin auth, or any auth bypass.

---

## Database (Mandated — Do Not Split)

**Supabase Postgres only**, accessed via `pg` Pool using `DATABASE_URL` (Neon connection string).

- Pool singleton: `db/index.js` — only file allowed to call `new Pool()`
- All queries: named functions in `db/<entity>.js`
- Schema changes: `migrations/<timestamp>_<name>.sql` only — no DDL in runtime files
- `@supabase/supabase-js` is used for Auth only, not for DB queries

**Do NOT:** use Supabase client for data queries, create a second Pool anywhere, write inline SQL outside `db/`.

---

## Env Vars Required on Render

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `SESSION_SECRET` | express-session signing key |
| `SUPABASE_URL` | Supabase project URL (auth) |
| `SUPABASE_ANON_KEY` | Supabase public anon key (auth) |
| `STRIPE_SECRET_KEY` | Stripe server-side secret |
| `STRIPE_PRICE_CREATOR` | Stripe Price ID for creator tier |
| `STRIPE_PRICE_PRO` | Stripe Price ID for pro tier |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `DISCORD_CLIENT_ID` | Discord app client ID |
| `DISCORD_CLIENT_SECRET` | Discord app client secret |
| `DISCORD_BOT_TOKEN` | Discord bot token for role sync |
| `DISCORD_REDIRECT_URI` | `https://ai.wagesociety.com/auth/discord/callback` |
| `DISCORD_GUILD_ID` | Guild snowflake for role sync |
| `DISCORD_ROLE_FREE_ID` | Snowflake for free tier role |
| `DISCORD_ROLE_CREATOR_ID` | Snowflake for creator tier role |
| `DISCORD_ROLE_PRO_ID` | Snowflake for pro tier role |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — scripts only, never VITE_ prefixed |

Google/Discord/Kick OAuth client secrets live in the **Supabase Auth dashboard**, not Render.

---

## Route Map

| File | Purpose |
|---|---|
| `routes/auth.js` | Magic link send + PKCE verify + logout |
| `routes/discord.js` | Discord OAuth link/unlink + role sync trigger |
| `routes/pages.js` | All server-rendered EJS pages (/, /login, /join, /dashboard, /memberships, etc.) |
| `routes/admin/discord-resync.js` | `POST /admin/discord/resync-all` — superadmin bulk Discord role re-sync |
| `routes/api/auth.js` | `/api/auth/logout` + `/api/auth/me` (session helpers only) |
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
| `routes/api/stripe.js` | Membership checkout + Stripe webhook (fires Discord sync on tier change) |
| `routes/api/stripe-handler.js` | Additional Stripe handler (portal, cancellation) |
| `routes/api/health-supabase.js` | `GET /health/supabase` connectivity check |
| `routes/api/admin-users.js` | Admin user management API |
| `routes/api/admin-shop.js` | Admin shop management API |

---

## Critical DOs and DON'Ts

**DO:**
- Read `CLAUDE.md` before every task — it's the canonical project map
- Read `/reports/` before re-investigating anything — diagnostics are already there
- Keep `server.js` under 300 lines (currently 135 — stay there)
- Put all new routes in `routes/<name>.js` and mount via `app.use()`
- Put all DB queries in `db/<entity>.js` as named functions
- Put all DDL in `migrations/<timestamp>_<name>.sql`

**DO NOT:**
- Introduce Express to a project that doesn't use it — this project already uses Express, that's fine
- Add custom auth (bcrypt, sessions beyond Supabase, parallel login paths)
- Query data via `@supabase/supabase-js` client (auth only)
- Write inline SQL in routes or lib files
- Hardcode `COOKIE_DOMAIN` or any auth domain
- Commit secrets (`.env` is gitignored — keep it that way)
- Reference or build for Vite, React, TanStack Router — wrong project

---

## Where Prior Diagnostic Reports Live

`/reports/` — read before re-investigating. Current reports:

- `AUTH_CLEANUP_2026-05-24.md` — custom admin-login removal, what was deleted, what replaced it
- `OAUTH_PROVIDERS_2026-05-24.md` — which OAuth providers are supported and why (Kick excluded)
- `PROJECT_STATUS_2026-05-24.md` — current working/broken state snapshot

---

*Last updated: 2026-05-24*
