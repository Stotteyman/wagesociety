# WAGE Society — Codebase Assessment

## What this app does

Creator OS for the W.A.G.E. Society community — a platform where creators manage profiles, go live, sell memberships and merch, blog, and build audiences without platform middlemen taking a cut.

## Stack

Express.js + EJS templates + PostgreSQL (Neon) + vanilla CSS + Node.js 20. Session auth via `express-session` + `connect-pg-simple`. Login via bcrypt email/password + magic link. No Supabase.

## Directory map

```
server.js         — Express entry point; wires routes, sessions, static, view engine
migrate.js        — DB migration runner (runs on every deploy via npm run build)
bot/              — discord-bot.js (event handlers), periodic-sync.js (guarded 30-min sync),
                   rate-limiter.js (10 req/10s queue), periodic-sync-trigger.js (Blaxel cron)
jobs/             — discord-role-sync.js (15-min drift fix, POLSIA_IN_PROCESS_CRONS_ENABLED guard)
lib/
  auth.js         — User provisioning helpers (onFirstOAuthLogin, getSessionUser, ensureUser)
  middleware.js   — Auth/membership/permission middleware (requireAuth, loadUserPermissions,
                    requirePermission, requireRole, requireAdmin)
  referral-codes.js — Referral code generation (WAGE-XXXXXX) and tier calculation (bronze/silver/gold/diamond)
  stripe-sync.js — Sync membership tiers to Stripe via Polsia API (createSubscriptionLink)
  discord-token.js — Discord OAuth token refresh helper (shared by me.js + discord-servers.js)
  upload-r2.js   — Image resize (sharp) + R2/S3 upload for avatar uploads. Falls back to base64 if R2 env vars absent.
  start-bot.js   — Discord bot startup wiring (extracted from server.js for 300-line cap)
middleware/
  referral.js     — Captures ?ref= WAGE-XXXXXX from URL into session + cookie (30-day)
  discord-sync.js — Discord role sync engine: syncRoles(userId) = staff role (non-cumulative) + subscription tier (cumulative, up to Elite/Unlimited bot-created); removeDiscordRoles, syncAllGuildsForUser, syncRolesFromDb
  ensure-discord-roles.js — Bot startup: @everyone lockdown, creates @member/@WAGE Creator/@WAGE Pro, Elite/Unlimited; sets up #verify channel with embed + link button
  stripe-config.js — Stripe payment/subscription link URLs (NO direct Stripe API)
db/
  index.js       — Pool singleton (only file that creates new Pool())
  profiles.js, blog.js, users.js, roles.js, memberships.js, discord.js, discord-servers.js, discord-oauth-states.js, oauth-providers.js, discord-admin.js, discord-structure.js, admin.js — domain query files
  merch.js, subscriptions.js, autoclipper.js, faq.js, donations.js, adminUsers.js, diagnostic.js, membership_tiers.js, admin-referrals.js — domain queries
routes/
  auth-custom.js       — Custom bcrypt email/password + magic link auth (Neon-only, no Supabase)
  discord.js           — Discord OAuth linking + role sync trigger (GET /auth/discord/link, /auth/discord/callback, POST /auth/discord/unlink)
  auth-discord.js      — W.A.G.E. Society bot OAuth flow (GET /auth/discord-bot, /auth/discord-bot/callback)
  auth-google.js       — Google OAuth login + account linking (GET /auth/google, /auth/google/callback, POST /auth/google/unlink)
  auth-kick.js        — Kick OAuth login + account linking (GET /auth/kick, /auth/kick/callback, POST /auth/kick/unlink)
  auth-discord-login.js — Discord OAuth as primary login method (GET /auth/discord-login, /auth/discord-login/callback)
  points-shop.js — Browse + purchase point shop items (GET /point-shop, POST /point-shop/purchase)
  pages.js       — All rendered page routes
  admin/
    discord-resync.js — /admin/discord page + resync + status endpoints
    debug.js     — /admin/debug panel: 11 diagnostic sections
    tiers-page.js — /admin/tiers rendered page
  api/
    auth.js       — Session helpers
    live.js       — Livestream list + autoclipper queue
    shop.js       — Merch items
    news.js       — Blog posts CRUD (permission-gated)
    public-directory.js — Creator directory
    me.js         — Profile access + update; YouTube channel fetch + selection; Discord server selection;
                   avatar upload (POST /api/me/avatar, DELETE /api/me/avatar)
    marketing.js  — Newsletter subscription
    check-username.js — Username availability
    collab.js     — Collaboration requests
    chatbot.js    — Chat bot integration
    donate.js     — Donation payment links via Stripe
    webhooks.js   — Stripe webhook handler (donations + subscription lifecycle)
    admin-users.js — Admin user management (ban, password reset, suspend)
    admin-roles.js — Admin roles + permissions management
    admin-shop.js — Admin shop management
    admin-tiers.js — Admin membership tier CRUD with Stripe sync
    points-shop.js — Admin point shop items CRUD (GET/POST/PUT/DELETE /api/points-shop/items)
    discord-servers.js — Discord server install: generate bot install URL, list servers,
                         handle bot-join webhook, DM owner on connect, server config PATCH
    discord-role-mappings.js — Admin role mapping (tier→Discord role name), guild member list, manual role edit
    discord-stats.js — Server stats/overview/channels/roles endpoints (bot-required)
    admin-discord.js — Discord admin API: server info, roles CRUD, channel setup, bot settings, tier map, logs, sync-structure, audit
    admin-referrals.js — Admin referral attribution: attribute, history, overview, reverse endpoints (users.manage auth)
    discord-webhook.js — Discord interaction webhook (slash commands, components, member-add)
views/
  layout.ejs     — Landing page (hero, manifesto, features, how, closing)
  partials/      — nav, hero, manifesto, features, how, closing, footer
  pages/          — faq, directory, live (→/streams), merch, news, login, join, dashboard, settings,
                    onboarding, terms, privacy, subscriptions, admin-*, profile, donate, play, 403
                    streams/ — streams.ejs (stream listing), [id].ejs (individual embed)
  admin/
    discord.ejs   — /admin/discord 4-tab management page (Main Server, Bot Settings, Other Servers, Logs)
    debug.ejs     — /admin/debug full panel (11 sections, JS-powered, DEBUG_PASSWORD-gated)
public/js/
  wage-three.js  — Three.js particle system + WAGE World portal (camera fly-through, raycaster click detection)
  admin-discord.js — Discord admin page client JS
public/css/
  theme.css      — Full design system (dark theme, #ff6600 orange accents, Space Grotesk)
  pages.css      — Page-specific styles
migrations/      — SQL or JS migrations (timestamp_name.sql/js)
reports/         — Diagnostic and audit reports (markdown)
```

## Database

```
auth_users        — Auth accounts (email, password_hash, display_name, avatar_url, is_suspended, admin_reset_token,
                   referral_code, referred_by, referral_points, total_referrals, referral_tier)
_migrations       — migration tracker
member_profiles   — Creator profiles (username, display_name, bio, avatar_url, role, permissions)
member_livestreams, blog_posts, collab_requests, collab_applications, dashboard_tool_entries, autoclipper_jobs
merch_items       — Shop items (name, description, price, image_url)
membership_plans  — Membership tiers (free/creator/pro) with price and features
user_memberships  — Paid tier subscriptions (email, plan_slug, stripe fields, period dates, billing_cycle)
membership_tiers — Admin-manageable tiers (name, slug, price_cents, stripe_price_id, stripe_product_id, features JSONB)
faq_entries       — FAQ questions/answers (question, answer, sort_order, is_active)
org_roles/org_permissions/org_role_permissions/org_user_roles/org_ban_records — legacy email-keyed role system
referrals         — Referral relationships: referrer_id, referred_user_id, status, reward_given
admin_referral_attributions — Manual referral attributions by admins (referee_id, referrer_id, referral_code_used, attributed_by_admin_id, created_at)
admin_referral_reversals   — Point reversal log for manual attribution reversals
point_transactions — Point ledger: user_id, amount, type, description (referral_signup/verified/purchase/retained/shop_purchase/manual_referral_attribution/referral_reversed)
shop_items        — Redeemable rewards catalog: name, point_cost, item_type (badge/membership_days/profile_frame/username_color/vip_access/role), metadata, active
shop_purchases    — Point redemptions: user_id, item_id
discord_links     — Discord OAuth account links per user (discord_id, username, avatar, tokens, expiry, guild_ids, selected_guild_id, selected_guild_name)
discord_roles, discord_servers, discord_server_configs — Discord bot/guild tracking
discord_managed_roles — Bot-created roles (Elite, Unlimited) per guild, tracked by role_type
discord_oauth_states — Short-lived OAuth CSRF states (state, user_id, redirect_path)
discord_mod_actions — Audit log for bot role changes: guild_id, moderator_id, target_user_id, action, reason
discord_bot_settings, discord_tier_role_map, discord_bot_logs — Admin Discord management (settings, tier→role map, activity log)
discord_server_structure — Full snapshot of Discord server roles/channels/categories with permission overwrites (synced from Discord API)
discord_permission_audit — Inheritance chain audit results: violations, role counts, channel counts, timestamps
diagnostic_log, donations, newsletter_subscriptions
roles/permissions/role_permissions/user_roles — auth_users.id-keyed roles + permissions
oauth_connections — OAuth account links (google/kick/discord) per user
platform_stats    — Aggregate landing page stats (key/value pairs: earnings, creator count, etc.)
```

## External integrations

- **Stripe**: Hosted payment links (no direct API). Monthly/annual subscription links via lib/stripe-config.js.
- **Discord**: OAuth linking + guild role sync via bot (DISCORD_CLIENT_ID/SECRET/BOT_TOKEN).
- **Google + Kick OAuth**: Account linking (Polsia infra env vars).
- **R2**: Avatar uploads via @aws-sdk/client-s3; falls back to base64 if unconfigured.
- **Email**: Zoho SMTP (ZOHO_SMTP_*); not yet wired to templates.

## Recent changes

61. 2026-06-21 — Admin Referral Attribution: new /admin/referrals page with manual referral attribution (admin assigns user→referrer link, awards 100+200pts); new admin_referral_attributions + admin_referral_reversals tables; GET/POST/DELETE API at /api/admin/referrals; autocomplete user search; override + reverse flow; attribution history table; referral overview stats.
60. 2026-06-21 — Phase 5: memberships.ejs glassmorphism polish (wage-badge on current-plan/trial badges, data-tier on plan cards); profile.ejs avatar bumped to 160px with 4rem placeholder; both pages were already built in prior phases with full Three.js integration.
59. 2026-06-21 — Phase 3: glassmorphism auth pages (/login) with portal edge glow effect (radial-gradient), gold border on focus inputs, Inter font added; WAGE Creators directory (/creators) with wage-card glassmorphism cards, Now Live horizontal carousel, tier filter tabs (All/Creator/Pro/Elite) with dedicated ?tier= param; scroll-reveal stagger on member cards (50ms increments, up to 12 cards); getPublicDirectory() now accepts tier filter param; pages.css: auth-page styles removed (inline in login.ejs), member-card updated to wage-card glassmorphism.
58. 2026-06-20 — Phase 6: WAGE World Portal (Three.js camera fly-through, portal ring geometry with raycaster click detection, gold overlay transition→/play), /play page with game container, scroll-reveal system (IntersectionObserver, .scroll-reveal + .scroll-reveal-delay-N classes), WCAG AA accessibility (skip links, :focus-visible gold ring, landmark regions nav/main/footer, aria-labels), skeleton loaders + empty states. theme.css extended with portal-cta, scroll-reveal, skip-link, focus-visible, skeleton, empty-state styles.
57. 2026-06-20 — Phase 1 Three.js overhaul: WAGE design tokens (--wage-* vars), glassmorphism base (.wage-card, .wage-btn), Three.js canvas + wage-three.js particle system (homepage-only, 60-280 particles, mouse parallax, RAF paused on hidden), mobile nav glassmorphism, Inter + JetBrains Mono fonts loaded.
55. 2026-06-18 — Memberships + Pricing mobile pass: plans-grid responsive (1→2→3 cols), price amounts clamp(2rem,5vw,2.5rem), plan-card mobile padding, full-width CTAs. New checkout pages /checkout /checkout/annual /checkout/trial with checkout-container/summary/form styles, centered layout, Stripe redirect flow.
54. 2026-06-16 — Streams mobile pass: streams.ejs platform filter, streams/[id].ejs 16:9 embed, stream embed on profile.ejs, platform filter CSS, live-creators scroll→grid responsive, /streams/:id route, getStreamsByUsername/getStreamById in db/livestreams.js.