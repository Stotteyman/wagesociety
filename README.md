# WAGE Society — Creator OS

Express.js + EJS + PostgreSQL (Neon) + bcrypt custom auth. A platform where creators
manage profiles, go live, sell memberships and merch, blog, and build audiences
without platform middlemen taking a cut.

## Stack

- **Backend**: Express.js (server.js), EJS templates, express-session + connect-pg-simple
- **Auth**: Custom bcrypt in auth_users table + Discord account linking (Supabase removed)
- **Database**: Neon Postgres via `pg` Pool (DATABASE_URL)
- **Payments**: Stripe (membership checkout + webhook)
- **Discord**: Bot-based guild role sync (tier roles)
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
| `routes/api/webhooks.js` | Stripe webhook handler |
| `lib/auth.js` | User provisioning on login |
| `db/index.js` | `pg` Pool singleton — only file allowed to `new Pool()` |
| `db/*.js` | All DB queries as named functions |
| `migrations/` | All DDL as timestamped `.sql` files |
| `views/` | EJS templates (layout, partials, pages) |

## Auth

- **Email/password**: `POST /auth/signup` / `POST /auth/login` → bcrypt → Express session
- **Magic link**: `POST /auth/magic-link` → email token → `GET /auth/verify?token=` → Express session
- **Discord**: Account linking via Discord OAuth bot

## Deployment

Render auto-runs `npm run build` (→ `npm run migrate`) on deploy.
