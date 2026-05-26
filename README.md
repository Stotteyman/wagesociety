# WAGE Society — Creator OS

Express.js + EJS + PostgreSQL (Neon) + Supabase Auth. A platform where creators
manage profiles, go live, sell memberships and merch, blog, and build audiences
without platform middlemen taking a cut.

## Stack

- **Backend**: Express.js (server.js), EJS templates, express-session + connect-pg-simple
- **Auth**: Supabase Auth (magic link, Google OAuth, Discord OAuth) via @supabase/supabase-js
- **Database**: Supabase Postgres via `pg` Pool (DATABASE_URL from Neon)
- **Payments**: Stripe (membership checkout + webhook)
- **Discord**: Bot-based guild role sync (tier roles)
- **Email**: Zoho SMTP

## Dev Setup

```bash
npm install
# Required env vars:
DATABASE_URL, SESSION_SECRET, SUPABASE_URL, SUPABASE_ANON_KEY, APP_URL
node server.js
```

## Key Files

| Path | Purpose |
|------|---------|
| `server.js` | Express entry — middleware, route mounts, listen |
| `migrate.js` | Migration runner — runs on every `npm run build` |
| `routes/auth.js` | Magic link (send + PKCE verify) + logout |
| `routes/pages.js` | All server-rendered pages |
| `routes/api/stripe.js` | Stripe checkout + webhook |
| `lib/auth.js` | User provisioning on first OAuth login |
| `db/index.js` | `pg` Pool singleton — only file allowed to `new Pool()` |
| `db/*.js` | All DB queries as named functions |
| `migrations/` | All DDL as timestamped `.sql` files |
| `views/` | EJS templates (layout, partials, pages) |

## Auth

- **Magic link**: `POST /auth/magic-link` → Supabase OTP → `GET /auth/verify?code=` → Express session
- **Google/Discord**: Client-side Supabase SDK `signInWithOAuth` → `GET /auth/verify`
- Superadmin: `lib/auth.js` `SUPERADMIN_EMAILS` set promotes on login

## Deployment

Render auto-runs `npm run build` (→ `npm run migrate`) on deploy.
