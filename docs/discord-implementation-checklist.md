# Discord Bot Implementation Checklist

Updated: 2026-06-21

Use this checklist to build the fully functional WAGE Society Discord bot/admin system without missing critical pieces.

## Phase 1 — Audit Existing Code

- [ ] Read `docs/AGENT_NOTES.md`.
- [ ] Read `docs/discord-bot-setup.md`.
- [ ] Read `docs/discord-admin-control-center.md`.
- [ ] Read `docs/discord-multi-server-architecture.md`.
- [ ] Read `docs/discord-database-and-api-contract.md`.
- [ ] Inspect `bot/discord-bot.js`.
- [ ] Inspect `lib/start-bot.js`.
- [ ] Inspect `lib/discord-sync.js`.
- [ ] Inspect `db/discord.js`.
- [ ] Inspect `db/discord-servers.js`.
- [ ] Inspect `db/discord-admin.js`.
- [ ] Inspect `routes/api/admin-discord.js`.
- [ ] Inspect `routes/api/discord-servers.js`.
- [ ] Inspect `routes/api/discord-role-mappings.js`.
- [ ] Inspect `views/admin/discord.ejs`.
- [ ] Inspect `public/js/admin-discord.js`.

## Phase 2 — Database Migration

- [ ] Create migration for missing Discord admin tables.
- [ ] Add or normalize `discord_user_links`.
- [ ] Add or normalize `discord_guilds`.
- [ ] Add `discord_roles`.
- [ ] Add `discord_channels`.
- [ ] Add `discord_permission_overwrites`.
- [ ] Add `discord_tier_role_mappings`.
- [ ] Add `discord_bot_settings`.
- [ ] Add `discord_admin_actions`.
- [ ] Add `discord_bot_events`.
- [ ] Add indexes on Discord IDs, guild IDs, user IDs, and timestamps.
- [ ] Ensure migration is idempotent and safe to run on Render build.

## Phase 3 — DB Access Layer

- [ ] Add named functions for guild upsert/list/get.
- [ ] Add named functions for role sync upsert/diff/list.
- [ ] Add named functions for channel sync upsert/diff/tree.
- [ ] Add named functions for permission overwrite sync.
- [ ] Add named functions for tier mappings.
- [ ] Add named functions for bot settings.
- [ ] Add named functions for audit logs.
- [ ] Add named functions for bot events.
- [ ] Do not write inline SQL in route files.

## Phase 4 — Discord Service Layer

- [ ] Create safe Discord API wrapper.
- [ ] Add rate-limit handling.
- [ ] Add token missing/invalid handling.
- [ ] Add permission checking helper.
- [ ] Add role hierarchy checking helper.
- [ ] Add guild metadata fetch.
- [ ] Add role fetch/sync.
- [ ] Add channel fetch/sync.
- [ ] Add permission overwrite fetch/sync.
- [ ] Add member fetch/sync where intent allows.
- [ ] Add role assignment/reconciliation.
- [ ] Add safe error mapping for admin UI.

## Phase 5 — Bot Worker

- [ ] Bot starts only when `DISCORD_BOT_TOKEN` exists.
- [ ] Gateway ready event records heartbeat/ready state.
- [ ] Guild join event records connected server.
- [ ] Guild delete/remove event marks guild removed/disconnected.
- [ ] Guild role create/update/delete events update roles.
- [ ] Channel create/update/delete events update channels.
- [ ] Guild member add event applies auto role on join.
- [ ] Guild member update event can trigger reconciliation if needed.
- [ ] Bot logs safe events to database.
- [ ] Worker can recover after disconnect.

## Phase 6 — Admin API

- [ ] `GET /api/admin/discord/summary`
- [ ] `GET /api/admin/discord/guilds`
- [ ] `GET /api/admin/discord/guilds/:guildId`
- [ ] `POST /api/admin/discord/guilds/:guildId/test`
- [ ] `POST /api/admin/discord/guilds/:guildId/sync/roles`
- [ ] `POST /api/admin/discord/guilds/:guildId/sync/channels`
- [ ] `POST /api/admin/discord/guilds/:guildId/sync/members`
- [ ] `POST /api/admin/discord/guilds/:guildId/roles/sync-all`
- [ ] `GET /api/admin/discord/guilds/:guildId/roles`
- [ ] `GET /api/admin/discord/guilds/:guildId/channels`
- [ ] `PATCH /api/admin/discord/guilds/:guildId/settings`
- [ ] `PATCH /api/admin/discord/guilds/:guildId/tier-role-mappings`
- [ ] `PATCH /api/admin/discord/channels/:channelId`
- [ ] `PATCH /api/admin/discord/channels/:channelId/permissions`
- [ ] `POST /api/admin/discord/bot/restart-worker`
- [ ] `POST /api/admin/discord/bot/clear-cache`
- [ ] `GET /api/admin/discord/logs`

## Phase 7 — Admin UI

- [ ] Main Server tab uses `GET /summary`.
- [ ] Bot Settings tab saves real settings.
- [ ] Auto role on join is a live role dropdown.
- [ ] Tier-to-role mapping uses live WAGE tiers and live Discord roles.
- [ ] Sync All Roles button works and shows result.
- [ ] Other Servers tab lists all connected guilds.
- [ ] Other Servers actions work: view, sync, disconnect, leave.
- [ ] Channels & Permissions tab displays real tree.
- [ ] Channel editor saves real channel changes.
- [ ] Permission editor supports Allow/Deny/Inherit.
- [ ] Role Settings tab shows real role data.
- [ ] Logs tab shows real events/audit logs.
- [ ] Every button has loading, success, warning, and error states.
- [ ] Dangerous actions require confirmation text.

## Phase 8 — User Website Integration

- [ ] User can connect Discord from settings/dashboard.
- [ ] Linked Discord status is visible to user.
- [ ] User can disconnect/reconnect Discord.
- [ ] Discord ID is stored and used as stable identity.
- [ ] Official server roles update after link, membership purchase, tier change, or manual resync.
- [ ] Connected server recognition works for linked users.

## Phase 9 — Testing

- [ ] Test with official guild.
- [ ] Test with second connected guild.
- [ ] Test user link/unlink/relink.
- [ ] Test missing Manage Roles.
- [ ] Test missing Manage Channels.
- [ ] Test role hierarchy failure.
- [ ] Test Discord API rate limit response.
- [ ] Test bot removed from server.
- [ ] Test deleted role mapping warning.
- [ ] Test disabled tier mapping behavior.
- [ ] Test channel permission lockout warning.
- [ ] Test audit logs for every mutation.
- [ ] Confirm no secrets appear in browser, logs, or API responses.

## Phase 10 — Optional Three.js

Only build after the normal admin controls work.

- [ ] 3D server network map.
- [ ] Official guild as central node.
- [ ] Connected guilds as orbiting nodes.
- [ ] Health color states.
- [ ] Click node to open server detail.
- [ ] Keep normal accessible tables/forms.

## Launch Standard

Launch only when the admin can trust every number, every dropdown, every button, and every status message.
