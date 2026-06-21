# W.A.G.E. Society Bot — Setup Guide

Updated: 2026-06-21

This guide is the current setup and implementation reference for the WAGE Society Discord bot, Discord OAuth linking, role sync, server integrations, and `/admin/discord` control center.

## Product Goal

The Discord bot is the main controller for the WAGE Society Discord ecosystem. It must manage the official WAGE Society Discord server and any outside Discord server that installs the WAGE Society bot.

Users should be able to:

1. Log into WAGE Society.
2. Connect their Discord account.
3. Receive the correct official Discord server roles.
4. Keep that Discord identity linked across all servers using the WAGE Society bot.

Admins should be able to:

1. See real bot/server status with no placeholder numbers.
2. Configure bot settings.
3. Map WAGE Society tiers to live Discord roles.
4. Manage connected outside servers.
5. Sync roles, members, channels, permissions, and settings.
6. Troubleshoot the bot from the website without needing to touch code.

---

## Discord Developer Portal Setup

1. Go to Discord Developer Portal.
2. Create an Application named `W.A.G.E. Society`.
3. Add a Bot user to the application.
4. Configure OAuth2 redirects for the live site and local development.
5. Configure the bot invite URL with the required scopes and permissions.

### Required OAuth2 Scopes

Use only the scopes actually needed for the flow being performed.

| Scope | Purpose |
|---|---|
| `identify` | Read the user’s Discord ID, username, avatar, and profile identity. |
| `guilds` | Read the user’s guild list when needed for server claim/install flows. |
| `guilds.join` | Optional; only use if the app will automatically add linked users to the official WAGE Society server. |
| `bot` | Required for installing the bot into a Discord server. |
| `applications.commands` | Required if slash commands are supported. |

### Bot Permissions

Do not depend on placeholder permissions or silent failure. The admin UI must detect missing permissions before showing actions as available.

Recommended production permissions:

| Permission | Purpose |
|---|---|
| View Channels | Read channel structure. |
| Send Messages | Send status/test messages where configured. |
| Read Message History | Support logs/moderation tools where applicable. |
| Manage Roles | Assign/unassign tier roles and unverified/member roles. |
| Manage Channels | Create/edit categories, channels, and permission overwrites. |
| View Audit Log | Support diagnostics where allowed. |

`ADMINISTRATOR` can be used during early development, but production should move toward least-privilege permissions with clear admin warnings when permissions are missing.

### Required Intents

| Intent | Purpose |
|---|---|
| Guilds | Server, role, and channel sync. |
| Guild Members | Member sync and role assignment checks. Required for accurate member-level role reconciliation. |
| Guild Messages / Message Content | Only enable if moderation or content-reading features actually need message content. Do not enable without a clear feature need. |

---

## Required Environment Variables

| Variable | Description |
|---|---|
| `DISCORD_CLIENT_ID` | Discord application client ID. |
| `DISCORD_CLIENT_SECRET` | Discord OAuth client secret. |
| `DISCORD_BOT_TOKEN` | Discord bot token. Never expose this to the browser. |
| `DISCORD_PUBLIC_KEY` | Discord application public key for interactions endpoint verification. |
| `DISCORD_REDIRECT_URI` | User account Discord link callback, for example `https://wagesociety.com/auth/discord/callback`. |
| `DISCORD_BOT_REDIRECT_URI` | Bot install/server authorization callback. |
| `DISCORD_GUILD_ID` | Official WAGE Society server ID. |
| `DISCORD_WEBHOOK_SECRET` | Secret for bot join/webhook verification if webhooks are used. |
| `APP_URL` | Public app URL. |
| `DATABASE_URL` | Neon PostgreSQL connection string. |
| `SESSION_SECRET` | Express session secret. |

Never commit `.env` values. Never show token values in the admin UI or logs.

---

## Database Tables Needed

The admin area needs real data from the database and Discord API. These records support accurate metrics and safe admin controls.

| Table | Purpose |
|---|---|
| `discord_user_links` | Website users linked to Discord user IDs, OAuth token status, linked date, and reconnect state. |
| `discord_guilds` | Every server using the bot, including official server flag, member count, role count, channel count, health, and last sync. |
| `discord_roles` | Synced Discord roles for each guild. Used for dropdowns and role mapping. |
| `discord_channels` | Synced Discord channel/category tree. Used for channel manager UI. |
| `discord_permission_overwrites` | Channel permission overwrites by role/user. |
| `wage_tiers` | WAGE Society tier/subscription records. Tier dropdowns must come from here, not hardcoded values. |
| `discord_tier_role_mappings` | Maps WAGE tiers to Discord roles per guild. |
| `discord_bot_settings` | Per-guild bot settings such as auto role on join, sync frequency, and auto assignment. |
| `discord_admin_actions` | Audit log of every admin action. |
| `discord_bot_events` | Bot events, sync failures, gateway events, and security alerts. |

Existing tables such as `discord_servers`, `discord_server_configs`, and `discord_links` should either be migrated into this structure or extended carefully without breaking current flows.

---

## Bot Install Flow

1. User visits the bot install/connect route.
2. User authorizes WAGE Society in Discord.
3. Callback exchanges code for token and validates state.
4. Backend fetches Discord user and guild data.
5. Backend records or updates the guild connection.
6. Bot joins the server.
7. Backend performs initial server sync: guild, roles, channels, permission overwrites, and member count when available.
8. Admin can manage the server from `/admin/discord` or user-facing server tools if allowed.

---

## User Discord Link Flow

1. User logs into WAGE Society.
2. User clicks Connect Discord.
3. Discord OAuth returns a verified Discord user ID.
4. Website stores the link in `discord_user_links`.
5. Backend checks official server membership.
6. Backend applies official server roles based on WAGE tier and mappings.
7. If the same Discord user is seen in another connected guild, the system can recognize the linked WAGE Society identity and apply allowed partner-server mapping rules.

Discord username is never the trusted identifier. Discord user ID is the trusted identifier.

---

## `/admin/discord` Control Center Requirements

### Main Server

Must show real values for:

- Connection status.
- Official server name.
- Member count.
- Role count.
- Linked users.
- Verification level.
- Bot uptime.
- Last heartbeat.
- Last successful sync.
- Last error.

If a value cannot be fetched, show `Unavailable` with the reason and a repair action. Do not show fake values.

### Bot Settings

Required settings:

- Role sync frequency.
- Member sync frequency.
- Channel sync frequency.
- Auto-connect enabled/disabled.
- Auto-assign roles enabled/disabled.
- Auto role on join.
- Log level.

`Auto role on join` must be a live role dropdown populated from synced Discord roles. Default recommendation: `Unverified`.

### Tier-to-Role Mapping

- WAGE tier dropdown must come from the live WAGE tier database.
- Discord role dropdown must come from synced guild roles.
- If tiers are added, removed, renamed, or disabled, the UI must update automatically.
- If roles are deleted in Discord, the mapping should show a warning and require remapping.

### Other Servers

Must list every Discord server using the WAGE Society bot.

Show:

- Server name and icon.
- Discord guild ID.
- Owner/admin.
- Member count.
- Role count.
- Channel count.
- Linked WAGE users.
- Install date.
- Last heartbeat.
- Last sync.
- Connection health.
- Missing permissions.

Actions:

- View server.
- Resync server.
- Resync roles.
- Resync channels.
- Resync members.
- Disconnect integration.
- Bot leave server.

Dangerous actions require confirmation text and audit logging.

### Channels & Permissions

This tab must become a real server manager.

Required features:

- Sync full category/channel tree.
- Show categories and nested channels in a left-side tree.
- Select a channel to open an editor panel.
- Edit name, category, topic, slowmode, NSFW, and order where allowed.
- Manage permission overwrites with Allow, Deny, and Inherit states.
- Warn before changes that could lock out admins, members, or the bot.
- Support Create Channel and Create Category flows.
- Log every change.

### Role Settings

Required features:

- List live Discord roles.
- Edit color, hoist, and mentionable if bot has permission.
- Show role hierarchy position as read-only unless safe reordering is implemented.
- Provide Sync All Roles.
- Show mappings and deleted/missing role warnings.

### Logs

Must include:

- Admin actions.
- OAuth link/unlink events.
- Bot install/remove events.
- Role assignment attempts.
- Sync start/success/failure events.
- Channel and permission changes.
- Security alerts.
- Troubleshooting button results.

---

## Troubleshooting Buttons

Each button needs confirmation where appropriate, progress state, success/failure result, and audit log entry.

| Button | Purpose |
|---|---|
| Test Bot Connection | Checks token, gateway, bot identity, and official guild access. |
| Test Permissions | Checks Manage Roles, Manage Channels, View Audit Log, Send Messages, and required intents. |
| Resync Server | Pulls guild summary, counts, and config. |
| Resync Roles | Pulls roles and updates role table. |
| Resync Channels | Pulls channel tree and permission overwrites. |
| Resync Members | Pulls member data where allowed. |
| Re-run Role Assignments | Applies current tier mappings to linked users. |
| Clear Bot Cache | Clears cached guild/role/channel data. |
| Restart Worker | Restarts bot/queue worker if hosting supports it. |
| View Last Error | Shows safe error summary and suggested fix. |
| Send Test Message | Sends a controlled test message to a selected channel. |

---

## API Endpoint Plan

| Endpoint | Purpose |
|---|---|
| `GET /api/admin/discord/summary` | Dashboard summary. |
| `GET /api/admin/discord/guilds` | Connected server list. |
| `GET /api/admin/discord/guilds/:guildId` | Single server details. |
| `POST /api/admin/discord/guilds/:guildId/test` | Test bot connection/permissions. |
| `POST /api/admin/discord/guilds/:guildId/sync/roles` | Sync roles. |
| `POST /api/admin/discord/guilds/:guildId/sync/channels` | Sync channels and overwrites. |
| `POST /api/admin/discord/guilds/:guildId/sync/members` | Sync members where allowed. |
| `POST /api/admin/discord/guilds/:guildId/roles/sync-all` | Sync all roles and preserve mappings. |
| `GET /api/admin/discord/guilds/:guildId/roles` | Role dropdown/list data. |
| `GET /api/admin/discord/guilds/:guildId/channels` | Channel tree data. |
| `PATCH /api/admin/discord/guilds/:guildId/settings` | Bot settings update. |
| `PATCH /api/admin/discord/guilds/:guildId/tier-role-mappings` | Tier mapping update. |
| `PATCH /api/admin/discord/channels/:channelId` | Channel setting update. |
| `PATCH /api/admin/discord/channels/:channelId/permissions` | Permission overwrite update. |
| `POST /api/admin/discord/bot/restart-worker` | Restart worker. |
| `POST /api/admin/discord/bot/clear-cache` | Clear cache. |
| `GET /api/admin/discord/logs` | Logs and audit events. |

---

## Security Rules

- Browser never receives the bot token.
- Every admin endpoint checks server-side permissions.
- Read-only admins cannot mutate Discord state.
- Dangerous actions require confirmation text.
- OAuth tokens are encrypted at rest.
- Logs must not expose tokens, raw secrets, environment variables, stack traces, or private headers.
- All admin changes must write an audit record with old value, new value, actor, target, result, and timestamp.

---

## Three.js Future Feature

The normal admin UI must stay table/form based and accessible. Three.js can be added as an optional visual layer.

Ideas:

- WAGE Society official server as the central hub.
- Connected Discord servers as orbiting nodes.
- Green/yellow/red node health states.
- Click a node to open server details.
- Channel architecture view where categories are platforms and channels are connected nodes.

Do not use the 3D layer as the only way to control the bot.

---

## Definition of Done

The Discord bot admin system is done only when:

- All metrics are real.
- All dropdowns are live data.
- All buttons hit working backend endpoints.
- All actions have loading/success/error states.
- All admin changes are logged.
- Missing permissions are detected before changes fail.
- Role mappings update when WAGE tiers change.
- Channel and permission editing is safe and reversible where possible.
- A non-technical admin can diagnose and repair common bot problems from the website.
