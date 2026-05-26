# Auth Cleanup Report — 2026-05-24

## Summary

Removed all custom admin email+password login artifacts. Supabase magic-link auth is now
the only login path. stotteyman@gmail.com is superadmin via the Supabase-native
`member_profiles.role` mechanism plus a server-side-only promotion script.

---

## Files Removed

| File | Reason |
|------|--------|
| `routes/admin-login.js` | bcrypt email+password bypass route — fully removed |
| `views/pages/admin-login.ejs` | Admin login form view — fully removed |
| `hash-gen-temp.js` | Temp bcrypt hash generator script — fully removed |

---

## Files Modified

| File | Change |
|------|--------|
| `server.js` | Removed `app.use('/admin-login', ...)` mount; removed `/admin-login` from AUTH_PATHS redirect list |
| `routes/api/auth.js` | Removed bcrypt-based `/register` and `/login` endpoints; kept `/logout` and `/me` only |
| `views/pages/login.ejs` | Removed "Admin access" link pointing to `/admin-login` |
| `package.json` | Removed `bcrypt` dependency |

---

## Files Added

| File | Purpose |
|------|---------|
| `scripts/promote-superadmin.js` | Server-side-only script: looks up Supabase auth.users UUID, upserts member_profiles with external_auth_id + role=superadmin |
| `migrations/20260524100000_add_external_auth_id_to_profiles.sql` | Adds `external_auth_id` column to member_profiles for Supabase identity linking |

---

## Current Login Surfaces

| Surface | Path | Method |
|---------|------|--------|
| Magic link request | `/login` → `POST /auth/magic-link` | Supabase OTP |
| Magic link callback | `GET /auth/verify?code=` | Supabase PKCE exchange |
| Logout | `GET /auth/logout` | Session destroy |

There is **no** custom credential login path. Zero password fields, zero bcrypt calls, zero
`/admin-login` route. The only session write happens after Supabase validates an OTP code.

---

## Superadmin: stotteyman@gmail.com

**How it works:**
1. `lib/auth.js` defines `SUPERADMIN_EMAILS = new Set(['stotteyman@gmail.com'])`.
2. On every magic-link login, `onFirstOAuthLogin()` is called from `routes/auth.js`.
3. If the email is in `SUPERADMIN_EMAILS`, it sets `role='superadmin'` in `member_profiles`.
4. `scripts/promote-superadmin.js` is a one-shot server-side script that additionally
   sets `external_auth_id` to the Supabase auth.users UUID — run with:
   ```
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... \
     node scripts/promote-superadmin.js stotteyman@gmail.com
   ```
   This script is never bundled, deployed, or accessible via any HTTP route.

---

## No Custom Credential Flow Checklist

- [x] No `bcrypt` imports anywhere in `routes/` or `lib/`
- [x] No `password_hash` column written to by any runtime route
- [x] No `/admin-login` route mounted in `server.js`
- [x] No link to `/admin-login` in any EJS template
- [x] No `hash-gen-temp.js` or other password utility scripts
- [x] `package.json` does not list `bcrypt` as a dependency
- [x] `routes/api/auth.js` contains only `/logout` and `/me` — no `/login` or `/register`
- [x] Login page (`/login`) submits only to Supabase magic-link endpoint
- [x] Superadmin promotion uses Supabase service role key server-side only
