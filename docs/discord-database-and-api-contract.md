# Discord Database and API Contract

Updated: 2026-06-21

## Purpose

This document gives builders enough detail to implement the database migration, DB functions, backend API routes, and admin UI data contracts for the fully functional WAGE Society Discord bot control center.

## Naming Rules

- Use Neon PostgreSQL.
- Put schema changes in `migrations/<timestamp>_<name>.sql`.
- Put queries in `db/discord-admin.js`, `db/discord.js`, or a clearly named `db/discord-*.js` file.
- Do not put inline SQL in route files.
- Do not expose bot/OAuth tokens in API responses.

## Tables

### `discord_user_links`

Links WAGE website users to Discord users.

Suggested columns:

```sql
id uuid primary key default gen_random_uuid(),
user_id uuid not null,
discord_user_id text not null unique,
discord_username text,
discord_global_name text,
discord_avatar_url text,
access_token_encrypted text,
refresh_token_encrypted text,
token_expires_at timestamptz,
linked_at timestamptz not null default now(),
last_verified_at timestamptz,
status text not null default 'active',
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
```

### `discord_guilds`

Stores every server where the WAGE Society bot is installed.

```sql
id uuid primary key default gen_random_uuid(),
discord_guild_id text not null unique,
name text not null,
icon_url text,
owner_discord_user_id text,
is_official boolean not null default false,
member_count integer,
role_count integer,
channel_count integer,
verification_level text,
bot_joined_at timestamptz,
last_heartbeat_at timestamptz,
last_synced_at timestamptz,
connection_status text not null default 'unknown',
health_status text not null default 'unknown',
bot_permissions_bitfield text,
sync_error text,
is_removed boolean not null default false,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
```

### `discord_roles`

```sql
id uuid primary key default gen_random_uuid(),
guild_id uuid not null references discord_guilds(id) on delete cascade,
discord_role_id text not null,
name text not null,
color integer,
position integer,
hoist boolean,
mentionable boolean,
managed boolean,
permissions_bitfield text,
is_deleted boolean not null default false,
last_synced_at timestamptz,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
unique(guild_id, discord_role_id)
```

### `discord_channels`

```sql
id uuid primary key default gen_random_uuid(),
guild_id uuid not null references discord_guilds(id) on delete cascade,
discord_channel_id text not null,
parent_discord_channel_id text,
name text not null,
type text not null,
topic text,
nsfw boolean,
position integer,
rate_limit_per_user integer,
permission_locked boolean,
is_deleted boolean not null default false,
last_synced_at timestamptz,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
unique(guild_id, discord_channel_id)
```

### `discord_permission_overwrites`

```sql
id uuid primary key default gen_random_uuid(),
guild_id uuid not null references discord_guilds(id) on delete cascade,
channel_id uuid not null references discord_channels(id) on delete cascade,
target_type text not null, -- role or member
target_discord_id text not null,
allow_bitfield text not null default '0',
deny_bitfield text not null default '0',
last_synced_at timestamptz,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
unique(channel_id, target_type, target_discord_id)
```

### `discord_tier_role_mappings`

```sql
id uuid primary key default gen_random_uuid(),
guild_id uuid not null references discord_guilds(id) on delete cascade,
wage_tier_id uuid not null,
discord_role_id uuid not null references discord_roles(id),
apply_mode text not null default 'assign_and_remove_old',
is_enabled boolean not null default true,
created_by uuid,
updated_by uuid,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
unique(guild_id, wage_tier_id)
```

### `discord_bot_settings`

```sql
id uuid primary key default gen_random_uuid(),
guild_id uuid not null unique references discord_guilds(id) on delete cascade,
auto_connect_enabled boolean not null default true,
auto_assign_roles_enabled boolean not null default true,
auto_role_on_join_role_id uuid references discord_roles(id),
role_sync_frequency_minutes integer not null default 30,
member_sync_frequency_minutes integer not null default 60,
channel_sync_frequency_minutes integer not null default 60,
log_level text not null default 'info',
updated_by uuid,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
```

### `discord_admin_actions`

```sql
id uuid primary key default gen_random_uuid(),
actor_user_id uuid,
guild_id uuid references discord_guilds(id) on delete set null,
action_type text not null,
target_type text,
target_id text,
request_payload_json jsonb,
old_value_json jsonb,
new_value_json jsonb,
result_status text not null,
result_message text,
created_at timestamptz not null default now()
```

### `discord_bot_events`

```sql
id uuid primary key default gen_random_uuid(),
guild_id uuid references discord_guilds(id) on delete set null,
event_type text not null,
severity text not null default 'info',
message text not null,
metadata_json jsonb,
created_at timestamptz not null default now()
```

## API Response Contracts

### `GET /api/admin/discord/summary`

Returns:

```json
{
  "officialGuild": {
    "id": "uuid",
    "discordGuildId": "string",
    "name": "We All Gotta Eat",
    "connectionStatus": "connected",
    "healthStatus": "healthy",
    "memberCount": 42,
    "roleCount": 49,
    "linkedUserCount": 1,
    "verificationLevel": "Low",
    "channelCount": 12,
    "lastHeartbeatAt": "ISO date",
    "lastSyncedAt": "ISO date",
    "lastError": null
  },
  "bot": {
    "uptimeSeconds": 12345,
    "lastGatewayStatus": "ready",
    "version": "optional"
  }
}
```

### `GET /api/admin/discord/guilds`

Returns connected guilds:

```json
{
  "guilds": [
    {
      "id": "uuid",
      "discordGuildId": "string",
      "name": "Server Name",
      "iconUrl": "url or null",
      "isOfficial": false,
      "memberCount": 100,
      "roleCount": 20,
      "channelCount": 15,
      "linkedUserCount": 10,
      "healthStatus": "healthy",
      "connectionStatus": "connected",
      "lastHeartbeatAt": "ISO date",
      "lastSyncedAt": "ISO date",
      "missingPermissions": []
    }
  ]
}
```

### `GET /api/admin/discord/guilds/:guildId/roles`

Returns roles for dropdowns and management.

```json
{
  "roles": [
    {
      "id": "uuid",
      "discordRoleId": "string",
      "name": "Unverified",
      "color": 0,
      "position": 1,
      "hoist": false,
      "mentionable": false,
      "managed": false,
      "canBotManage": true,
      "isDeleted": false
    }
  ]
}
```

### `GET /api/admin/discord/guilds/:guildId/channels`

Returns a full channel tree.

```json
{
  "categories": [
    {
      "id": "uuid",
      "discordChannelId": "string",
      "name": "Category",
      "position": 0,
      "channels": [
        {
          "id": "uuid",
          "discordChannelId": "string",
          "name": "general",
          "type": "text",
          "topic": "optional",
          "position": 1,
          "nsfw": false,
          "rateLimitPerUser": 0,
          "canBotManage": true
        }
      ]
    }
  ],
  "uncategorized": []
}
```

### `GET /api/admin/discord/logs`

Returns safe logs only.

```json
{
  "logs": [
    {
      "id": "uuid",
      "createdAt": "ISO date",
      "type": "role_sync_failed",
      "severity": "warning",
      "message": "Role sync failed because bot lacks Manage Roles.",
      "guildName": "We All Gotta Eat",
      "actorName": "Admin Name or null"
    }
  ]
}
```

## Mutation Contract Rules

Every mutation returns:

```json
{
  "ok": true,
  "message": "Human-readable result.",
  "auditId": "uuid",
  "data": {}
}
```

Every failed mutation returns:

```json
{
  "ok": false,
  "message": "Safe human-readable reason.",
  "code": "MISSING_PERMISSION",
  "repairAction": "Move the bot role above the target role in Discord, then run Sync All Roles again."
}
```

## Admin Permission Middleware

All `/api/admin/discord/*` routes must require:

1. Logged-in user.
2. WAGE admin/superadmin role.
3. Specific Discord admin permission for mutation routes.
4. CSRF protection if the app uses CSRF on admin mutation routes.

## Audit Logging Requirement

Write `discord_admin_actions` for:

- Settings updates
- Tier mapping updates
- Role sync
- Channel sync
- Member sync
- Channel changes
- Permission changes
- Bot restart/clear cache
- Server disconnect/leave
- Test message

## Data Safety

Do not return:

- Bot token
- OAuth access token
- OAuth refresh token
- Database URL
- Raw stack trace
- Raw request headers
- Private env variables
