# OAuth Providers Report — 2026-05-24

## Summary

Added Google and Discord OAuth login buttons to `/login`. Both route through Supabase
`signInWithOAuth()` and share the existing PKCE callback at `GET /auth/verify?code=`.
No provider-specific branching was added — the callback is generic.

Kick is not a Supabase-native provider and cannot be wired via `signInWithOAuth` at
this time (see Kick section below).

---

## Architecture

```
User clicks "Continue with Google/Discord"
  → client-side Supabase JS SDK: supabase.auth.signInWithOAuth({ provider, redirectTo })
  → browser redirects to Supabase OAuth proxy
  → Supabase redirects to provider (Google or Discord)
  → provider redirects back to redirectTo = https://ai.wagesociety.com/auth/verify?code=...
  → GET /auth/verify: exchangeCodeForSession(code) → user object → onFirstOAuthLogin() → session write → /dashboard
```

This is identical to the magic link PKCE path — `/auth/verify` is provider-agnostic.

---

## Files Changed

| File | Change |
|------|--------|
| `routes/pages.js` | `/login` route now passes `supabaseUrl`, `supabaseAnonKey`, `appUrl` to template |
| `views/pages/login.ejs` | Added Google + Discord OAuth buttons above email form; includes Supabase JS CDN client |

---

## Redirect URIs Required

For Supabase Dashboard → Authentication → URL Configuration → Redirect URLs, ensure these are present:

| URI | Environment |
|-----|-------------|
| `https://ai.wagesociety.com/auth/verify` | Production |
| `http://localhost:3000/auth/verify` | Local development |

These cover both magic-link and OAuth callbacks. No separate callback URL is needed per provider — Supabase handles provider-specific OAuth internally.

**Note:** Individual provider OAuth apps (Google Cloud Console, Discord Developer Portal) must
have their redirect URIs pointing at **Supabase's** callback URL
(`https://<project>.supabase.co/auth/v1/callback`), not directly at the app. Supabase acts
as the OAuth intermediary and then bounces back to the configured `redirectTo`.

---

## Env Vars (Render)

Only two frontend env vars are required for OAuth on the frontend. The provider secrets
(Google client_id/secret, Discord client_id/secret) live in the **Supabase dashboard** under
Authentication → Providers — they are **not** set in Render.

| Var | Value |
|-----|-------|
| `SUPABASE_URL` | Your Supabase project URL (already set) |
| `SUPABASE_ANON_KEY` | Supabase publishable anon key (already set) |
| `APP_URL` | `https://ai.wagesociety.com` (already set) |

No new env vars are required.

---

## Provider Status

### Google — ✅ Wired (pending production verification)

- Button added to `/login` with correct Google brand colors
- Calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: APP_URL + '/auth/verify' } })`
- Requires Google OAuth to be enabled in Supabase Dashboard → Authentication → Providers → Google
- User metadata mapped: `user_metadata.full_name` → display_name, `user_metadata.avatar_url` → avatar

**Operator action required:** Confirm Google is enabled in Supabase dashboard.
Previously removed from the app (commit 781301bdc6) — Supabase provider toggle state unknown.

### Discord — ✅ Wired (pending production verification)

- Button added to `/login` with Discord brand color (#5865F2)
- Calls `supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: APP_URL + '/auth/verify' } })`
- Requires Discord OAuth to be enabled in Supabase Dashboard → Authentication → Providers → Discord
- Discord credentials confirmed updated in Supabase dashboard per operator

**Important distinction:** This is SEPARATE from the existing Discord account-linking flow
(`/auth/discord/link`). This flow is for **login** — a user without an account can sign in
with their Discord identity. The account-linking flow is for connecting an existing WAGE
account to a Discord server membership. Both can coexist; they use different OAuth apps if needed.

### Kick — ❌ Not Supported (blocked)

Kick (`kick.com`) is not a Supabase built-in provider. Supabase supports:
- Google, GitHub, Discord, Twitter, Apple, Facebook, Spotify, Slack, LinkedIn, Azure, Bitbucket, GitLab, Notion, Twitch, WorkOS, Zoom
- Custom OIDC providers via `custom_oidc`

**Kick does not implement OIDC/OAuth2 in a standard way.** Attempting to wire it as
`custom_oidc` would require Kick to expose:
- A `.well-known/openid-configuration` endpoint
- Standard authorization + token + userinfo endpoints

Kick does not publish these. There is no official Kick OAuth developer documentation
confirming OIDC compliance.

**Error you would see if attempted:**
```
Provider 'kick' is not supported. Valid providers: ...
```
(Supabase client-side validation rejects unknown providers before making a request.)

**Resolution path:** If Kick login is required, it must be implemented as a custom OAuth flow
(server-side, not Supabase — similar to how the Discord account-linking flow works in
`routes/discord.js`). This is a separate task. Per task instructions, we do NOT fall back
to a custom flow in this PR.

---

## User Provisioning

`/auth/verify` calls `onFirstOAuthLogin()` on every login (idempotent). For OAuth users:
- Supabase user row: created automatically in `auth.users` on first sign-in
- `member_profiles` row: upserted by `onFirstOAuthLogin()` — display_name from OAuth metadata
- `user_memberships` row: free plan auto-assigned if not already present
- Session: `req.session.userEmail` set → user lands on `/dashboard`

---

## Testing Checklist

- [ ] Open https://ai.wagesociety.com/login — confirm Google and Discord buttons render
- [ ] Click "Continue with Google" → confirm redirect to Google consent → confirm `/dashboard` post-callback
- [ ] Click "Continue with Discord" → confirm redirect to Discord consent → confirm `/dashboard` post-callback
- [ ] Confirm `auth.users` row exists in Supabase dashboard after each OAuth login
- [ ] Confirm `member_profiles` row in Neon DB has display_name populated from OAuth metadata
- [ ] Confirm existing magic-link flow still works (regression check)
- [ ] Kick: button NOT present on login page — limitation documented above

---

## What's Not Done

1. **Kick OAuth** — not a Supabase provider, cannot be wired via `signInWithOAuth`. Custom
   OAuth flow would be needed as a separate task.
2. **End-to-end live test** — cannot be automated in this context; requires browser and
   active Supabase provider configuration. Operator must verify in production.
