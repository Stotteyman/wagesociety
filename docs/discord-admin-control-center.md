# Discord Admin Control Center — Implementation Spec

Updated: 2026-06-21

Route: `/admin/discord`

## Mission

Build the WAGE Society Discord bot admin area into a real operating panel for the official WAGE Society Discord server and every outside server that installs the WAGE Society bot.

The system must not use fake numbers, placeholders, broken buttons, or disconnected UI. Every number shown must come from Neon, Discord API, or bot telemetry.

## Core Outcomes

1. A user can connect Discord to their WAGE Society account.
2. The official WAGE Society Discord server can automatically assign the right role based on WAGE Society tier/membership.
3. The same connected Discord identity can be recognized across all servers using the WAGE Society bot.
4. Admins can manage bot settings, role mappings, connected servers, channels, permissions, and logs from the website.
5. Admins can troubleshoot and repair common bot problems with clear buttons and safe error messages.

## Admin Tabs

### Main Server

Show official server status:

- Connection status
- Server name
- Member count
- Role count
- Linked WAGE users
- Verification level
- Channel count
- Bot uptime
- Last heartbeat
- Last successful sync
- Last safe error summary

### Bot Settings

Settings must be real backend settings:

- Role sync frequency
- Member sync frequency
- Channel sync frequency
- Auto-connect enabled
- Auto-assign roles enabled
- Auto role on join
- Log level

Auto role on join must be a Discord role dropdown populated from live synced roles. Default should be `Unverified` when that role exists.

### Other Servers

List every guild where the bot is installed.

Fields:

- Server icon
- Server name
- Discord guild ID
- Owner/admin
- Member count
- Role count
- Channel count
- Linked WAGE users
- Install date
- Bot permissions
- Last heartbeat
- Last sync
- Connection health

Actions:

- View server
- Resync server
- Resync roles
- Resync channels
- Resync members
- Disconnect integration
- Bot leave server

### Channels & Permissions

Required UI:

- Left channel tree grouped by category
- Search/filter channels
- Right selected-channel editor
- General tab: name, category, topic, NSFW, slowmode, position
- Permissions tab: role/user overwrites using Allow, Deny, Inherit
- Advanced tab: IDs, sync data, bot permission warnings

Required actions:

- Sync from Discord
- New Channel
- New Category
- Edit Channel
- Edit Permission Overwrites
- Resync Selected Channel

### Role Settings

Required UI:

- Live role list
- Role metadata
- Tier-to-role mapping
- Auto role on join dropdown
- Sync All Roles button
- Deleted/missing role warnings

Tier mappings must update when WAGE tiers are added, removed, renamed, or disabled.

### Logs

Required log types:

- Admin action log
- Bot event log
- Discord OAuth link/unlink log
- Role assignment log
- Server install/remove log
- Channel/permission change log
- Sync success/failure log
- Security alert log

## Data Model

Core records:

- `discord_user_links`
- `discord_guilds`
- `discord_roles`
- `discord_channels`
- `discord_permission_overwrites`
- `wage_tiers`
- `discord_tier_role_mappings`
- `discord_bot_settings`
- `discord_admin_actions`
- `discord_bot_events`

## API Endpoints

- `GET /api/admin/discord/summary`
- `GET /api/admin/discord/guilds`
- `GET /api/admin/discord/guilds/:guildId`
- `POST /api/admin/discord/guilds/:guildId/test`
- `POST /api/admin/discord/guilds/:guildId/sync/roles`
- `POST /api/admin/discord/guilds/:guildId/sync/channels`
- `POST /api/admin/discord/guilds/:guildId/sync/members`
- `POST /api/admin/discord/guilds/:guildId/roles/sync-all`
- `GET /api/admin/discord/guilds/:guildId/roles`
- `GET /api/admin/discord/guilds/:guildId/channels`
- `PATCH /api/admin/discord/guilds/:guildId/settings`
- `PATCH /api/admin/discord/guilds/:guildId/tier-role-mappings`
- `PATCH /api/admin/discord/channels/:channelId`
- `PATCH /api/admin/discord/channels/:channelId/permissions`
- `POST /api/admin/discord/bot/restart-worker`
- `POST /api/admin/discord/bot/clear-cache`
- `GET /api/admin/discord/logs`

## Safety Rules

- Server-side permission checks on every admin endpoint.
- Never expose bot token to browser.
- Never show raw secrets, env values, stack traces, or private headers in UI.
- Dangerous actions require confirmation.
- Permission edits must warn before bot/admin lockout.
- Every admin action writes an audit record.

## Troubleshooting Buttons

- Test Bot Connection
- Test Permissions
- Resync Server
- Resync Roles
- Resync Channels
- Resync Members
- Re-run Role Assignments
- Clear Bot Cache
- Restart Worker
- View Last Error
- Send Test Message

## Three.js Future Direction

Add optional visual tools after the normal admin UI works:

- 3D server network map
- Official WAGE server as central node
- Connected servers as orbiting nodes
- Green/yellow/red health states
- Click nodes to open server details
- 3D channel architecture planner

The 3D view is optional and must never replace accessible forms/tables.

## Definition of Done

The admin system is complete only when a non-technical admin can connect the bot, verify server health, manage roles, map tiers, inspect outside servers, manage channels/permissions, troubleshoot failures, and trust every displayed number.
