# Project Status — 2026-05-24

## Working

### Core Routes
- `/` — Landing page renders (EJS layout + partials, landing-context.js)
- `/login` — Magic link form + Google/Discord OAuth buttons (Supabase JS SDK CDN)
- `/auth/verify` — PKCE code exchange, generic (handles magic link + all OAuth providers)
- `/auth/logout` — Session destroy
- `/dashboard` — Auth-gated, renders for logged-in users
- `/join` — Membership join page
- `/memberships` — Membership plans page
- `/directory` — Public creator directory
- `/live` — Livestreams page
- `/merch` — Shop/merch page
- `/news` — Blog posts page
- `/faq` — FAQ page
- `/:username` — Public creator profile (via `$username` style route in pages.js)
- `/settings`, `/onboarding`, `/subscriptions`, `/appeals`, `/privacy`, `/terms` — All render

### Auth
- Supabase magic link: fully operational
- Google OAuth: button present, routes through Supabase `signInWithOAuth`
- Discord OAuth: button present, routes through Supabase `signInWithOAuth`
- Session persistence: Postgres-backed via connect-pg-simple, 30-day cookie
- Superadmin auto-promotion: stotteyman@gmail.com via `SUPERADMIN_EMAILS` in lib/auth.js

### Discord Integration
- `routes/discord.js` — Discord account linking OAuth flow (separate from Discord login)
- `lib/discord-sync.js` — Bot API role sync (syncDiscordRole, removeDiscordRoles)
- `lib/ensure-discord-roles.js` — Auto-creates guild roles on startup
- `db/discord.js` — All Discord link DB ops
- `routes/admin/discord-resync.js` — Superadmin bulk resync endpoint

### Stripe
- `routes/api/stripe.js` — Checkout session creation + webhook handler
- Webhook fires Discord role sync on `checkout.session.completed`
- Plans fetched from `membership_plans` table
- Price IDs via `STRIPE_PRICE_CREATOR` + `STRIPE_PRICE_PRO` env vars

### Design System
- `public/css/theme.css` — Warm cream/editorial palette, full design tokens
- `public/css/pages.css` — Page-specific styles
- Space Grotesk + DM Sans fonts

### Database
- All core tables present (see CLAUDE.md for full list)
- Migrations run on every deploy via `npm run build` → `node migrate.js`
- Migration runner supports both `.sql` and `.js` (module.exports.up) files

### Infrastructure
- Deployed on Render at `https://ai.wagesociety.com` (primary)
- `wage-society.polsia.app` redirects to primary at `ai.wagesociety.com` for auth
- `/health` endpoint returns `{"status":"healthy"}`
- `/health/supabase` checks auth + DB connectivity

---

## Broken / Unknown

### Discord env vars — not yet confirmed on Render
The Discord linking flow requires 4 env vars set in the Render dashboard:
`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_REDIRECT_URI`

Also 4 guild snowflakes for role sync:
`DISCORD_GUILD_ID`, `DISCORD_ROLE_FREE_ID`, `DISCORD_ROLE_CREATOR_ID`, `DISCORD_ROLE_PRO_ID`

See `FOR_POLSIA.md` for the full setup checklist. Until these are set, Discord link/unlink and role sync will silently fail (webhook still returns 200).

### Stripe env vars — not confirmed live
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_CREATOR`, `STRIPE_PRICE_PRO` — Stripe SDK is lazy-loaded and won't crash if missing, but checkout won't function.

### Kick OAuth — explicitly not supported
Kick is not a Supabase Auth provider. See `reports/OAUTH_PROVIDERS_2026-05-24.md` for documentation and alternatives.

### Email (Zoho SMTP) — configured, not wired
`ZOHO_SMTP_*` env vars are in env, but no email template calling is implemented. Transactional emails (welcome, confirmation) are pending.

### OpenAI — dependency installed, not used
`openai` package is in `package.json`. No OpenAI calls implemented yet.

### R2/S3 — not configured
File uploads not built. `R2/S3` noted in CLAUDE.md as pending.

### `passport` / `passport-google-oauth20` — installed, not used
These packages appear in package.json but auth runs entirely through Supabase JS SDK. They are dead weight and could be removed.

---

## Recently Reverted

### Custom `/admin-login` (2026-05-24)
Removed bcrypt-based admin email+password login. All details in:
→ `reports/AUTH_CLEANUP_2026-05-24.md`

Files deleted: `routes/admin-login.js`, `views/pages/admin-login.ejs`, `hash-gen-temp.js`
Dependency removed: `bcrypt`
Replacement: Supabase-only login via `lib/auth.js` SUPERADMIN_EMAILS

---

## Open Questions for the Operator

1. **Discord setup complete?** Have you created the Discord application and set the 4 env vars in Render? (See `FOR_POLSIA.md`)
2. **Stripe live keys in Render?** Are `STRIPE_SECRET_KEY` + webhook secret configured in the Render dashboard?
3. **Kick OAuth priority?** Kick is not natively supported by Supabase. Do you want a custom Kick OAuth implementation, or is Google+Discord sufficient?
4. **Email sends needed?** Welcome email / magic link confirmation — should these be wired to Zoho SMTP?
5. **OpenAI / AI features?** The dependency is installed. What features should it power first?
6. **`passport` packages** — these are installed but unused. Safe to remove?

---

*Generated: 2026-05-24 | Instance: 42021 | App: https://ai.wagesociety.com*
