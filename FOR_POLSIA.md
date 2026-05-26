# Discord Application Setup — Manual Steps Required

These steps must be completed by the owner before the Discord link flow works on production.

## 1. Create Discord Application

1. Go to https://discord.com/developers/applications
2. Click **New Application**
3. Name it: `WAGE Society`
4. Save

## 2. Create a Bot User

1. In the left sidebar → **Bot**
2. Click **Add Bot**
3. Copy the **Bot Token** — you'll need it as `DISCORD_BOT_TOKEN`

## 3. Configure OAuth2

1. In the left sidebar → **OAuth2 → General**
2. Copy the **Client ID** → `DISCORD_CLIENT_ID`
3. Click **Reset Secret**, copy it → `DISCORD_CLIENT_SECRET`
4. Under **Redirects**, click **Add Redirect**, enter:
   ```
   https://ai.wagesociety.com/auth/discord/callback
   ```
5. Save

## 4. Required OAuth Scopes (for the link flow)

The routes/discord.js already requests these:
- `identify` — read Discord username + ID
- `email` — read Discord email
- `guilds.join` — add user to server (used in role-sync follow-up task)

For the future bot scope (role management), you'll also need `bot` with permission `Manage Roles` (268435456).

## 5. Set Env Vars on Render

In the Render dashboard for the WAGE Society service, add these 4 environment variables:

| Key | Value |
|-----|-------|
| `DISCORD_CLIENT_ID` | (from step 3) |
| `DISCORD_CLIENT_SECRET` | (from step 3) |
| `DISCORD_BOT_TOKEN` | (from step 2) |
| `DISCORD_REDIRECT_URI` | `https://ai.wagesociety.com/auth/discord/callback` |

> **Note:** The env var update tool was unavailable during this deployment. Set these manually in the Render dashboard → Environment.

## 6. Test End-to-End

1. Log in as Stotteyman at https://ai.wagesociety.com
2. Navigate to https://ai.wagesociety.com/creators/edit
3. Click **Connect Discord**
4. Complete the Discord consent screen
5. You should land back on `/creators/edit?discord=linked` with the linked state visible
6. Verify a row exists in `discord_links` (check via Neon console or pg query)
7. Click **Unlink** to confirm row deletion

## Agent Reference

**Read `docs/AGENT_NOTES.md` before making changes.** It contains the canonical stack truth, auth mandates, DB rules, env vars, and route map. Prior diagnostic reports live in `/reports/`.

---

## What's Already Built (code-side)

- ✅ `migrations/1779621747_discord_links.sql` — table schema + index
- ✅ `db/discord.js` — all DB query functions
- ✅ `routes/discord.js` — full OAuth flow with CSRF state guard + structured logging
- ✅ `views/pages/profile-edit.ejs` — Discord connect card (both states)
- ✅ `routes/pages.js` — `/creators/edit` passes `discordLink` + `discordFlash` to template
