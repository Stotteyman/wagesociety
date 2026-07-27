# WAGE Society — Creator OS

Express.js + EJS + PostgreSQL (Neon) + bcrypt custom auth. A platform where creators manage profiles, go live, sell memberships and merch, blog, build audiences, and connect their Discord identity across the WAGE Society Discord ecosystem.

## Stack

- **Backend**: Express.js (`server.js`), EJS templates, express-session + connect-pg-simple
- **Auth**: Custom bcrypt in `auth_users` table + Discord account linking (Supabase removed)
- **Database**: Neon Postgres via `pg` Pool (`DATABASE_URL`)
- **Payments**: Stripe (membership checkout + webhook)
- **Discord**: Bot-based guild role sync, account linking, connected-server management, admin control center
- **Email**: Zoho SMTP

## Dev Setup

```bash
npm install
# Required env vars:
DATABASE_URL, SESSION_SECRET, APP_URL
node server.js
```

## Key Files

| Path | Purpose |
|------|---------|
| `server.js` | Express entry — middleware, route mounts, listen |
| `migrate.js` | Migration runner — runs on every `npm run build` |
| `routes/auth-custom.js` | Email/password + magic link auth (bcrypt, custom) |
| `routes/pages.js` | All server-rendered pages |
| `routes/discord.js` | Discord account linking and role sync trigger |
| `routes/admin/discord-resync.js` | Existing Discord resync admin route |
| `routes/api/discord-role-mappings.js` | Discord role mapping API |
| `views/pages/dashboard/discord*.ejs` | User-facing Discord connection/server pages |
| `public/js/admin-discord.js` | Admin Discord UI behavior where applicable |
| `docs/discord-bot-setup.md` | Current Discord bot and admin control center setup guide |
| `routes/api/webhooks.js` | Stripe webhook handler |
| `lib/auth.js` | User provisioning on login |
| `db/index.js` | `pg` Pool singleton — only file allowed to `new Pool()` |
| `db/*.js` | All DB queries as named functions |
| `migrations/` | All DDL as timestamped `.sql` files |
| `views/` | EJS templates (layout, partials, pages) |
| `docs/wageworld-technical-breakdown.md` | WageWorld 3D scene, controls, settings, character creation, and architecture |

## WageWorld

`/wageworld` and `/play` render a Three.js-powered playable creator world. The current prototype starts players in a larger first-person spawn house, includes POV switching, character creation through wardrobe/mirror interactables, a cog-opened settings menu, keyboard/touch/gamepad controls, proximity chat/voice foundations, guide NPCs, WAGE token pickups tied to the website point/token ledger, and a separate Creator Plaza hub map. See `docs/wageworld-technical-breakdown.md` for implementation details and next steps.

## Auth

- **Email/password**: `POST /auth/signup` / `POST /auth/login` → bcrypt → Express session
- **Magic link**: `POST /auth/magic-link` → email token → `GET /auth/verify?token=` → Express session
- **Discord**: Account linking via Discord OAuth bot flow; Discord user ID is the trusted identifier, not username

## Discord Control Center Scope

The `/admin/discord` area should become the full control center for the official WAGE Society server and all other servers using the WAGE Society bot.

Required production standards:

- No placeholder metrics. Counts must come from Discord API, Neon records, or bot telemetry.
- All role dropdowns must use live synced Discord roles.
- Auto role on join must be a live Discord role dropdown, defaulting to `Unverified` when available.
- WAGE tier-to-role mappings must update automatically when WAGE tiers change.
- Other Servers must list every guild using the bot with real health, permissions, member counts, and connection actions.
- Channels & Permissions must sync the full category/channel tree and support safe channel/permission editing from the website.
- Troubleshooting buttons must call real backend actions, show progress, show success/failure, and write audit logs.
- Browser code must never receive the Discord bot token.

See `docs/discord-bot-setup.md` for the current complete Discord bot/admin specification.

## Deployment

Render auto-runs `npm run build` (→ `npm run migrate`) on deploy.
