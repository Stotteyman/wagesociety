# WAGE Society — Codebase Assessment

## What this app does

Creator OS for the W.A.G.E. Society community — a platform where creators manage profiles, go live, sell memberships and merch, blog, and build audiences without platform middlemen taking a cut.

## Stack

Express.js + EJS templates + PostgreSQL (Neon) + @supabase/supabase-js + vanilla CSS + Node.js 20. Session auth via `express-session` + `connect-pg-simple`. Login via Supabase — email magic link, Google OAuth, and Discord OAuth (all routed through Supabase `signInWithOAuth`). No custom credential auth.

## Directory map

```
server.js         — Express entry point; wires routes, sessions, static, view engine
migrate.js        — DB migration runner (runs on every deploy via npm run build)
                    supports both .js (module.exports.up) and .sql migration files
lib/
  auth.js         — User provisioning helpers (onFirstOAuthLogin, getSessionUser, ensureUser)
  middleware.js   — Auth/membership middleware (requireAuth, requireMembership)
  landing-context.js  — builds EJS render context for the landing page
  discord-sync.js — Discord guild role sync (syncDiscordRole, removeDiscordRoles, syncRolesFromDb via bot API)
  ensure-discord-roles.js — Auto-creates @member/@WAGE Creator/@WAGE Pro roles on server startup; persists IDs to discord_roles table
  stripe-config.js — Stripe payment/subscription link URLs (NO direct Stripe API)
db/
  index.js       — Pool singleton (only file that creates new Pool())
  profiles.js    — Member profile queries (getProfileByEmail, upsertProfile, getPublicDirectory)
  livestreams.js — Livestream CRUD (getAllStreams, upsertStream)
  blog.js        — Blog post queries (getPublishedPosts, createPost)
  merch.js       — Merch item queries (getActiveItems)
  subscriptions.js — Newsletter subscription (subscribe)
  autoclipper.js — Clip job queue (getJobs, createJob, updateJobStatus)
  memberships.js — Paid membership queries (getUserMembership, upsertMembership, cancelMembership)
  orgAccess.js   — Org roles and permissions (getMemberRole, getMemberAccess, banMember)
  admin.js       — Admin panel DB utilities: listTables, getTableRows, executeSql, logAdminAction, getRecentAdminLogs
  diagnostic.js  — Supabase diagnostic counts: countMemberProfiles, countUserMemberships, writeAndRollbackDiagnosticLog
  faq.js         — FAQ entries (getActiveFaqs)
  discord.js     — Discord link queries (getUserIdByEmail, getDiscordLinkByUserId, upsertDiscordLink, deleteDiscordLinkByUserId, updateDiscordLink)
  donations.js   — Donation records: createDonation, completeDonation, getDonationTotal, getRecentDonations, getDonationByStripeSession, getDonationById
routes/
  auth.js        — Auth routes: POST /auth/magic-link, POST /auth/signup, POST /auth/signin, GET /auth/verify, GET /auth/callback, GET /auth/v1/callback, POST /auth/session, POST /auth/exchange, POST /auth/token-session, GET /auth/logout
  discord.js     — Discord OAuth linking + role sync trigger
  pages.js       — All rendered page routes (/, /login, /join, /dashboard, /memberships, etc.)
  admin/
    discord-resync.js — POST /admin/discord/resync-all (superadmin bulk re-sync)
    debug.js         — /admin/debug panel: 11 diagnostic sections (Supabase, OAuth, Sessions, DB browser, Stripe, Email, Error Logs, Webhooks, Cache, Route Health, Server Status)
  api/
    auth.js       — Session helpers: POST /api/auth/logout, GET /api/auth/me
    live.js       — Livestream list + autoclipper queue
    shop.js       — Merch items
    news.js       — Blog posts
    public-directory.js — Creator directory
    me.js         — Profile access + update
    marketing.js  — Newsletter subscription
    check-username.js — Username availability
    collab.js     — Collaboration requests
    chatbot.js    — Chat bot integration
    donate.js     — Donation payment links and totals via Stripe
    webhooks.js   — Stripe webhook handler: POST /webhook/stripe for donations and subscription lifecycle (billing_cycle inference from price ID)
    admin-users.js — Admin user management
    admin-shop.js — Admin shop management
    health-supabase.js — GET /health/supabase connectivity check
    test-supabase.js  — GET /api/test-supabase full 9-check Supabase diagnostic (JSON)
views/
  layout.ejs           — Landing page (hero, manifesto, features, how, closing)
  partials/            — nav, hero, manifesto, features, how, closing, footer
  pages/               — faq, directory, live, merch, news, login, join, dashboard,
                          settings, onboarding, terms, privacy, subscriptions, appeals,
                          tool, admin-users, admin-shop, profile, profile-not-found,
                          memberships, supabase-test (diagnostic UI), donate, donate-success
  admin/
    debug.ejs    — /admin/debug full panel (11 sections, JS-powered, DEBUG_PASSWORD-gated)
public/css/
  theme.css      — Full design system (warm cream/editorial palette)
  pages.css      — Page-specific styles (auth, directory, live, news, merch, faq, dashboard)
migrations/      — SQL or JS migrations (timestamp_name.sql/js)
scripts/         — Server-side-only admin scripts (never HTTP-accessible)
  promote-superadmin.js — Set member_profiles.role=superadmin + external_auth_id via Supabase service role
reports/         — Diagnostic and audit reports (markdown)
```

## Database

```
users               — Subscription table (managed by hosting platform)
_migrations         — migration tracker
member_profiles     — Creator profiles (username, display_name, bio, avatar_url, role, permissions)
newsletter_subscriptions — Email alert subscriptions
member_livestreams  — Linked stream profiles (youtube/twitch/kick) per member
blog_posts          — Blog posts with image/video/embed support
collab_requests     — Collaboration request postings
collab_applications — Applications to collab requests
dashboard_tool_entries — Tool bookmarks
autoclipper_jobs    — Clip job queue for chat bot integration
merch_items         — Shop items (name, description, price, image_url)
membership_plans    — Membership tiers (free/creator/pro) with price and features
org_roles           — Role hierarchy (superadmin/admin/manager/staff/moderator/helper/user/banned)
org_permissions     — Permission definitions
org_role_permissions — Role→permission mappings
org_user_roles      — Per-user role overrides
org_ban_records     — Ban records by email
user_memberships    — Paid tier subscriptions (email, plan_slug, stripe fields, period dates, billing_cycle)
faq_entries         — FAQ questions/answers (question, answer, sort_order, is_active)
discord_links       — Discord OAuth account links per user (discord_id, username, avatar, tokens, expiry)
discord_roles        — Discord guild role IDs for tier sync (slug → role_id, created by lib/ensure-discord-roles.js on startup)
diagnostic_log       — Ephemeral write-path test rows (inserted + deleted during /api/test-supabase; always empty)
donations            — One-time Stripe donations: amount_cents, donor_name, donor_message, status
```

## External integrations

- **Stripe**: All payments via Stripe's hosted payment links — NO direct Stripe API calls, NO STRIPE_SECRET_KEY. Both monthly and annual subscription links (annual = monthly×10, 2 months free). Revenue tracked in Stripe Dashboard. Links stored in lib/stripe-config.js as SUBSCRIPTION_LINKS_MONTHLY and SUBSCRIPTION_LINKS_ANNUAL.
- **Supabase**: Email magic link auth via @supabase/supabase-js (SUPABASE_URL, SUPABASE_ANON_KEY)
- **Discord**: OAuth linking + guild role sync via bot (DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN, DISCORD_REDIRECT_URI, DISCORD_GUILD_ID, DISCORD_ROLE_FREE_ID, DISCORD_ROLE_CREATOR_ID, DISCORD_ROLE_PRO_ID)
- **OpenAI**: installed as dependency, not yet used
- **R2/S3**: not yet configured — file uploads not built
- **Email**: Zoho SMTP configured (env vars ZOHO_SMTP_*); not yet wired to templates

## Recent changes

1. 2026-05-25 — Annual subscription tiers added (billing_cycle: monthly/annual)
   - Stripe annual links: Creator $290/yr (link 95683), Pro $790/yr (link 95684) — 2 months free vs monthly
   - Added `billing_cycle` column to `user_memberships` via migration (default 'monthly')
   - `db/memberships.js`: upsertMembership now accepts `billingCycle` param; routes pass SUBSCRIPTION_LINKS_MONTHLY/ANNUAL
   - `routes/api/webhooks.js`: handles customer.subscription.created/updated/deleted with billing_cycle inference
   - `/memberships` page: monthly/annual toggle, JS-driven price updates, "2 months free" badge, annual price display
2. 2026-05-25 — Auth: magic link now redirects to /auth/callback with token_hash handling
   - Magic link: Supabase → /auth/callback?token_hash=xxx&type=magiclink → client-side verifyOtp() → POST to /auth/session → Express session → /dashboard
   - OAuth PKCE: code_verifier from localStorage → POST to /auth/exchange → tokens → session → /dashboard
   - Fixed /auth/exchange error extraction (was returning generic "PKCE exchange failed" instead of Supabase error msg on HTTP 400)
3. 2026-05-25 — OAuth PKCE fix: client-side code exchange via Supabase JS SDK
   - Root cause: manual PKCE stored code_verifier in sessionStorage; server callback couldn't access it
   - Fix: Supabase JS SDK `signInWithOAuth()` handles PKCE internally (localStorage); new `auth-callback.ejs` does client-side `exchangeCodeForSession()`; tokens posted to `POST /auth/session` for Express session creation
   - Google, Discord, Kick all use unified PKCE flow; Kick uses direct authorize URL (custom OIDC provider)
4. 2026-05-25 — Auth broken: SUPABASE_ANON_KEY was `sb_publishable_*` format (wrong)
   - Fixed: updated SUPABASE_ANON_KEY env var to JWT format (eyJhbGci...) on Render
5. 2026-05-25 — Security + code quality audit (recurring upkeep)
   - Fixed Stripe webhook header typo; moved webhook DB update into db/donations.js; removed hardcoded superadmin email