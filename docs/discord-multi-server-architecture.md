# Discord Multi-Server Architecture

Updated: 2026-06-21

## Purpose

This document explains how the WAGE Society Discord bot should manage:

1. The official WAGE Society Discord server.
2. Any outside/partner/community Discord server that installs the WAGE Society bot.
3. Discord-linked WAGE Society website users across all connected servers.
4. Real website admin data for `/admin/discord`.

## Architecture Summary

The Discord system has four parts:

| Part | Responsibility |
|---|---|
| Website | Login, Discord account linking, admin UI, server management UI, settings, logs. |
| Backend API | Validates admins, reads/writes Neon records, calls safe bot/service functions. |
| Bot Worker | Maintains Discord gateway connection, receives guild/member/channel events, syncs live Discord state. |
| Neon PostgreSQL | Stores linked users, connected guilds, roles, channels, mappings, settings, logs, and health state. |

The browser must never talk to Discord with the bot token. The browser talks to the WAGE Society backend. The backend talks to Discord and/or bot worker functions.

## Identity Model

### WAGE Website User

The website user is stored in the existing WAGE Society auth/member tables.

### Discord User Link

A user becomes Discord-linked when they complete OAuth.

The trusted key is `discord_user_id`, not username.

Required stored fields:

- WAGE user ID
- Discord user ID
- Discord username/global name
- Avatar URL
- OAuth token status
- Linked date
- Last verified date
- Status: active, disconnected, revoked, needs_reconnect

## Guild Model

Every server where the bot is installed is a guild record.

Required guild types:

| Guild Type | Meaning |
|---|---|
| official | The main WAGE Society Discord server. |
| connected | Any outside server using the WAGE Society bot. |
| disabled | Server connection intentionally disabled. |
| removed | Bot was removed or integration revoked. |

## Official Server Rules

The official WAGE Society server is the primary community server.

Required behavior:

- Linked WAGE users should receive the right official server role.
- Unverified/new users should receive the configured auto role on join, normally `Unverified`.
- Paid/free tier changes should cause role reconciliation.
- Role assignment must respect Discord hierarchy. The bot cannot assign roles higher than its own role.
- If role assignment fails, the admin UI must show a useful reason.

## Connected Server Rules

Outside servers can install the WAGE Society bot.

Required behavior:

- The bot records the server in `discord_guilds`.
- The bot syncs server name, icon, owner, member count, roles, channels, and permissions when possible.
- Admins can see the server under `/admin/discord` → Other Servers.
- Server-specific settings can be stored separately from official server settings.
- WAGE-linked users can be recognized in connected servers by Discord user ID.
- Role mappings can be per-guild, not global-only.

## Role Mapping Model

Role mapping connects a WAGE tier to a Discord role in a specific guild.

Example:

| Guild | WAGE Tier | Discord Role |
|---|---|---|
| Official WAGE Society | Free | Member |
| Official WAGE Society | Pro | Pro Creator |
| Partner Server A | Pro | Verified WAGE Pro |

Rules:

- WAGE tiers come from the WAGE tier database.
- Discord roles come from synced Discord roles.
- Do not hardcode new mappings in env vars.
- Deleted Discord roles should show warnings.
- Disabled WAGE tiers should not continue assigning new roles unless explicitly configured.

## Channel/Permission Model

The website should store synced channel state so the admin UI can show and edit it.

Required records:

- Guild
- Category/channel ID
- Parent category ID
- Channel type
- Name
- Topic
- NSFW flag
- Slowmode
- Position
- Permission overwrites
- Last synced date
- Deleted flag

Permission overwrites must support three states:

- Allow
- Deny
- Inherit

## Bot Worker Responsibilities

The bot worker should:

- Connect to Discord gateway.
- Record heartbeat status.
- Detect guild join/remove events.
- Sync guild metadata.
- Sync roles.
- Sync channels and permission overwrites.
- Sync member data where intent/permission allows.
- Assign roles based on mappings.
- Log failures safely.
- Recover from Discord API rate limits.

## Backend API Responsibilities

The backend API should:

- Authenticate admins.
- Authorize every action.
- Read/write Neon records.
- Call Discord API or bot service functions safely.
- Return clear UI-safe error messages.
- Write audit logs for every admin change.

## Website UI Responsibilities

The UI should:

- Show real data only.
- Use loading/success/error states.
- Disable controls when permissions are missing.
- Use live dropdowns for roles/channels/tiers.
- Confirm dangerous actions.
- Show repair steps when something fails.

## Health State Model

Guild health should be calculated from:

- Bot gateway status.
- Last heartbeat.
- Last successful Discord API test.
- Required permission checks.
- Last sync success/failure.
- Rate limit state if relevant.

Health labels:

| State | Meaning |
|---|---|
| healthy | Bot connected, permissions okay, recent sync successful. |
| warning | Bot connected but missing optional permissions or older sync. |
| degraded | Bot connected but missing required permissions or recent sync failures. |
| disconnected | Bot removed, token invalid, gateway down, or guild inaccessible. |

## Failure Handling

Good error examples:

- `Cannot assign Pro Creator role because the bot role is below it in Discord role hierarchy.`
- `Channel sync failed because the bot is missing Manage Channels permission.`
- `Member count unavailable because Server Members Intent is disabled.`

Bad error examples:

- `500 error`
- `Unknown failure`
- Raw stack trace

## Build Order

1. Database migration.
2. DB access layer.
3. Discord service layer.
4. Bot worker health/events.
5. Admin API endpoints.
6. Admin UI real data replacement.
7. Channel/permission manager.
8. Other servers management.
9. Troubleshooting buttons.
10. Three.js visualization after the normal UI works.
