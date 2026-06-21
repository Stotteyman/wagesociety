# W.A.G.E. Society Bot — Setup Guide

## Discord Developer Portal Setup

1. Go to https://discord.com/developers/applications
2. Create Application named "W.A.G.E. Society"
3. Add a Bot user to the application
4. **Required OAuth2 Scopes:** `identify`, `guilds.join`, `guilds`
5. **Bot Permissions:** `8` (ADMINISTRATOR) — enables full server management
6. **Interaction Endpoint URL:** `https://wage-society.polsia.app/api/discord/interactions` (update once deployed)
7. Enable **Message Content Intent** in Bot settings (required for moderation features)

Save: Application ID → `DISCORD_CLIENT_ID`, Public Key → `DISCORD_PUBLIC_KEY`, Bot Token → `DISCORD_BOT_TOKEN`

## Required Environment Variables

| Variable | Description |
|---|---|
| `DISCORD_CLIENT_ID` | Discord application client ID (Snowflake) |
| `DISCORD_CLIENT_SECRET` | Discord OAuth client secret |
| `DISCORD_BOT_TOKEN` | Discord bot token (starts with `Bot `) |
| `DISCORD_PUBLIC_KEY` | Discord application public key (for interactions endpoint verification) |
| `DISCORD_BOT_REDIRECT_URI` | OAuth callback URL, e.g. `https://wage-society.polsia.app/auth/discord-bot/callback` |
| `DISCORD_WEBHOOK_SECRET` | Secret for bot-join webhook verification |

## Database Tables (auto-created via migration)

- `discord_oauth_states` — CSRF states for OAuth flow (10-min TTL, auto-cleaned)
- `discord_servers` — Extended with `member_count` and `last_sync_at`
- `discord_server_configs` — Extended with anti-spam/raid settings + channel IDs
- `discord_links` — Extended with `guild_ids[]` array

## Bot Install Flow

1. User visits `/auth/discord-bot` → redirected to Discord OAuth
2. User authorizes W.A.G.E. Society → redirected to `/auth/discord-bot/callback`
3. Callback: exchanges code for token, fetches user + guilds, upserts `discord_links` with `guild_ids`
4. User then visits `/dashboard/discord/servers` to claim their server