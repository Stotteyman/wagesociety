// db/discord-structure.js — Discord server structure snapshot + inheritance audit.
// Owns: discord_server_structure writes/reads, discord_permission_audit logs.
// Does NOT own: Discord API calls (done in routes/api/admin-discord.js).
const { pool } = require('./index');

// ── Constants ────────────────────────────────────────────────────────────────

// Discord permission bitfield values
const PERM = {
  VIEW_CHANNEL:          1 << 0,   // 1024
  SEND_MESSAGES:         1 << 1,   // 2048
  READ_MESSAGE_HISTORY:  1 << 10,  // 65536
  MANAGE_CHANNELS:       1 << 4,   // 16384
  MANAGE_MESSAGES:       1 << 12,  // 262144
  KICK_MEMBERS:          1 << 1,   // 2
  BAN_MEMBERS:           1 << 2,   // 4
  ADMINISTRATOR:         1 << 3,   // 8
  MANAGE_ROLES:          1 << 28,  // 268435456
};

// Canonical tier order — higher index = more privileged
const TIER_ORDER = [
  'member',
  'creator',
  'pro',
  'elite',
  'unlimited',
  'founder',
  'ambassador',
  'staff',
  'helper',
  'moderator',
  'admin',
  'director',
];

// Channel visibility tiers — which role tier should see which category
const CATEGORY_TIER_ACCESS = {
  'information':  'member',
  'general':      'member',
  'creators':     'creator',
  'vip':          'pro',       // opens at Pro, includes Pro / Elite / Unlimited
  'streams':      'creator',
  'staff':        'staff',     // staff+ only
  'bot':          'member',
};

// ── Upsert helpers ────────────────────────────────────────────────────────────

async function upsertEntity({ entityType, discordId, name, position, parentId, permissionOverwrites, metadata }) {
  const { rows } = await pool.query(
    `INSERT INTO discord_server_structure
       (entity_type, discord_id, name, position, parent_id, permission_overwrites, metadata, last_synced_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT (discord_id) DO UPDATE SET
       name            = EXCLUDED.name,
       position        = EXCLUDED.position,
       parent_id       = EXCLUDED.parent_id,
       permission_overwrites = EXCLUDED.permission_overwrites,
       metadata        = EXCLUDED.metadata,
       last_synced_at  = NOW(),
       updated_at      = NOW()
     RETURNING id`,
    [entityType, discordId, name, position, parentId || null,
     JSON.stringify(permissionOverwrites || []), JSON.stringify(metadata || {})]
  );
  return rows[0];
}

// ── Sync full structure from Discord API response ────────────────────────────

async function syncStructure(guildId, { roles, channels }) {
  const client = await pool.connect();
  const diff = { roles: { created: 0, updated: 0 }, channels: { created: 0, updated: 0 }, categories: { created: 0, updated: 0 } };

  try {
    await client.query('BEGIN');

    for (const role of roles) {
      // Determine tier from name
      const tier = _roleNameToTier(role.name);
      const metadata = {
        tier,
        color: role.color,
        colorHex: '#' + (role.color || 0).toString(16).padStart(6, '0'),
        hoist: role.hoist || false,
        mentionable: role.mentionable || false,
        managed: role.managed || false,
        permissions: role.permissions || 0,
        position: role.position,
      };
      const { rows } = await client.query(
        `INSERT INTO discord_server_structure
           (entity_type, discord_id, name, position, permission_overwrites, metadata, last_synced_at, updated_at)
         VALUES ('role', $1, $2, $3, '[]'::jsonb, $4, NOW(), NOW())
         ON CONFLICT (discord_id) DO UPDATE SET
           name = EXCLUDED.name, position = EXCLUDED.position, metadata = EXCLUDED.metadata,
           last_synced_at = NOW(), updated_at = NOW()
         RETURNING id`,
        [role.id, role.name, role.position, JSON.stringify(metadata)]
      );
      const wasNew = rows[0]?.id; // not useful here; we diff by checking last_synced_at threshold
      diff.roles.updated++;
    }

    const catMap = new Map(); // discordId → name for category resolution

    for (const channel of channels) {
      const entityType = channel.type === 4 ? 'category' : 'channel';
      const metadata = {
        channelType: channel.type,
        topic: channel.topic || null,
        nsfw: channel.nsfw || false,
        bitrate: channel.bitrate || null,
        user_limit: channel.user_limit || null,
      };
      // If this is a channel (not category), check its parent
      const parentId = channel.parent_id || null;
      const { rows } = await client.query(
        `INSERT INTO discord_server_structure
           (entity_type, discord_id, name, position, parent_id, permission_overwrites, metadata, last_synced_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (discord_id) DO UPDATE SET
           name = EXCLUDED.name, position = EXCLUDED.position, parent_id = EXCLUDED.parent_id,
           permission_overwrites = EXCLUDED.permission_overwrites, metadata = EXCLUDED.metadata,
           last_synced_at = NOW(), updated_at = NOW()
         RETURNING id`,
        [entityType, channel.id, channel.name, channel.position, parentId,
         JSON.stringify(channel.permission_overwrites || []), JSON.stringify(metadata)]
      );

      if (entityType === 'category') {
        catMap.set(channel.id, channel.name.toLowerCase());
        diff.categories.updated++;
      } else {
        diff.channels.updated++;
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return diff;
}

// ── Get current structure from DB ──────────────────────────────────────────

async function getStoredStructure(guildId) {
  const { rows } = await pool.query(
    `SELECT entity_type, discord_id, name, position, parent_id,
            permission_overwrites, metadata, last_synced_at
     FROM discord_server_structure
     ORDER BY position ASC`
  );
  return rows;
}

// ── Permission bitfield utilities ────────────────────────────────────────────

function parseAllowDeny(overwrite) {
  return {
    allow: typeof overwrite.allow === 'string' ? BigInt(overwrite.allow) : BigInt(overwrite.allow || 0),
    deny:  typeof overwrite.deny  === 'string' ? BigInt(overwrite.deny)  : BigInt(overwrite.deny  || 0),
    type:  overwrite.type,
    id:    overwrite.id,
  };
}

function hasBit(bigint, bit) {
  return (bigint & BigInt(bit)) !== BigInt(0);
}

// ── Audit: check inheritance chain ──────────────────────────────────────────

async function auditInheritance(guildId) {
  const stored = await getStoredStructure(guildId);

  const roles = stored.filter(e => e.entity_type === 'role');
  const channels = stored.filter(e => e.entity_type === 'channel');
  const categories = stored.filter(e => e.entity_type === 'category');

  // Build role maps by name and by tier
  const roleById = new Map(roles.map(r => [r.discord_id, r]));
  const roleByName = new Map(roles.map(r => [r.name.toLowerCase(), r]));
  const roleByTier = new Map();

  for (const r of roles) {
    const meta = r.metadata || {};
    const tier = meta.tier || _roleNameToTier(r.name);
    if (!roleByTier.has(tier)) roleByTier.set(tier, []);
    roleByTier.get(tier).push(r);
  }

  const violations = [];

  // Check 1: @everyone baseline — should have no explicit allow bits (DENY is ok)
  const everyoneRole = roles.find(r => r.name === '@everyone') || roles.find(r => r.name.toLowerCase() === '@everyone');
  if (everyoneRole) {
    const meta = everyoneRole.metadata || {};
    const basePerms = BigInt(meta.permissions || 0);
    if (basePerms !== BigInt(0)) {
      violations.push({
        type: 'baseline',
        role: '@everyone',
        issue: 'base_permissions_not_zero',
        detail: `permissions bitfield = ${meta.permissions} (expected 0)`,
      });
    }
  } else {
    violations.push({ type: 'missing', role: '@everyone', issue: 'role_not_found' });
  }

  // Check 2: Per-channel inheritance — for each channel, check that roles below
  // a given tier don't have more allow bits than roles above them.
  for (const channel of channels) {
    const overwrites = channel.permission_overwrites || [];
    const catId = channel.parent_id;
    const cat = categories.find(c => c.discord_id === catId);
    const catName = cat ? cat.name.toLowerCase() : 'uncategorized';

    // What tier of role should be able to view this channel?
    const requiredTier = CATEGORY_TIER_ACCESS[catName] || 'member';
    const requiredTierIndex = TIER_ORDER.indexOf(requiredTier);

    const tierRoleAllow = new Map(); // tier → Set of allowed bits from overwrites

    for (const tier of TIER_ORDER) {
      const tierRoles = roleByTier.get(tier) || [];
      let hasChannelAccess = false;
      let allowBits = BigInt(0);

      for (const role of tierRoles) {
        // Look up overwrite for this role on this channel
        const ow = overwrites.find(o => o.id === role.discord_id);
        if (ow) {
          const { allow, deny } = parseAllowDeny(ow);
          if (!hasBit(deny, PERM.VIEW_CHANNEL)) {
            hasChannelAccess = true;
          }
          allowBits |= allow;
        } else {
          // No explicit overwrite — role inherits @everyone base
          // If @everyone has VIEW_CHANNEL denied, and no overwrite, the role can't see it
          hasChannelAccess = false;
        }
      }

      tierRoleAllow.set(tier, { hasAccess: hasChannelAccess, allowBits });
    }

    // Verify: for each pair of tiers, if higher tier is accessible, lower tier should also be accessible
    for (let i = 0; i < TIER_ORDER.length; i++) {
      const higherTier = TIER_ORDER[i];
      for (let j = i - 1; j >= 0; j--) {
        const lowerTier = TIER_ORDER[j];
        const higher = tierRoleAllow.get(higherTier);
        const lower = tierRoleAllow.get(lowerTier);

        if (!higher || !lower) continue;

        // If higher tier can access, lower tier should also be able to access
        // (by inheriting from category-level permissions)
        if (higher.hasAccess && !lower.hasAccess) {
          const lowerRoles = roleByTier.get(lowerTier) || [];
          const higherRoles = roleByTier.get(higherTier) || [];
          violations.push({
            type: 'inheritance_violation',
            channel: channel.name,
            channel_id: channel.discord_id,
            category: catName,
            issue: 'lower_tier_cannot_access_where_higher_can',
            detail: `${lowerTier} role has no access to #${channel.name} but ${higherTier} does — inheritance broken`,
            higher_role: higherRoles.map(r => r.name),
            lower_role: lowerRoles.map(r => r.name),
          });
        }
      }
    }

    // Check 3: For channel categories gated at 'pro' or above, verify only applicable tiers can access
    if (catName === 'vip') {
      // VIP should be accessible to pro, elite, unlimited but not creator or member
      const accessibleTiers = new Set(['pro', 'elite', 'unlimited', 'founder', 'ambassador', 'staff', 'helper', 'moderator', 'admin', 'director']);
      const blockedTiers = new Set(['member', 'creator']);

      for (const tier of blockedTiers) {
        const roles_t = roleByTier.get(tier) || [];
        for (const role of roles_t) {
          const ow = overwrites.find(o => o.id === role.discord_id);
          if (ow) {
            const { allow, deny } = parseAllowDeny(ow);
            const hasAllow = hasBit(allow, PERM.VIEW_CHANNEL);
            const notDenied = !hasBit(deny, PERM.VIEW_CHANNEL);
            if (hasAllow && notDenied) {
              violations.push({
                type: 'access_control',
                role: role.name,
                channel: channel.name,
                issue: 'tier_should_not_access_channel',
                detail: `${role.name} (tier: ${tier}) should not have VIEW_CHANNEL access to VIP channel #${channel.name}`,
              });
            }
          }
        }
      }
    }
  }

  // Store audit result
  const status = violations.length === 0 ? 'ok' : 'violations_found';
  await pool.query(
    `INSERT INTO discord_permission_audit
       (guild_id, violations, total_roles, total_channels, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [guildId, JSON.stringify(violations), roles.length, channels.length, status]
  );

  return { violations, totalRoles: roles.length, totalChannels: channels.length, status };
}

// ── Apply permission fixes ────────────────────────────────────────────────────
// Takes violations array and the Discord API req function, applies fixes to Discord.
async function applyPermissionFixes(violations, discordReq, guildId) {
  const results = [];
  const fixLog = [];

  for (const v of violations) {
    if (v.type === 'baseline' && v.issue === 'base_permissions_not_zero') {
      // Re-apply @everyone lock by setting permissions to 0
      const res = await discordReq('PATCH', `/guilds/${guildId}/roles/${v.role}`, { permissions: '0' });
      fixLog.push({ violation: v, attempted: true, success: res.status === 200, detail: res.body });
    }

    // Inheritance violations require manual review — log but don't auto-fix
    if (v.type === 'inheritance_violation') {
      fixLog.push({
        violation: v,
        attempted: false,
        skipped: true,
        reason: 'inheritance violations require manual channel permission review',
      });
    }

    // Access control violations
    if (v.type === 'access_control') {
      // Need to deny VIEW_CHANNEL for the violating role on this channel
      // But we don't have channel Discord ID in all cases — log for manual fix
      fixLog.push({
        violation: v,
        attempted: false,
        skipped: true,
        reason: 'access control fix requires channel Discord ID — manual review needed',
      });
    }
  }

  return fixLog;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _roleNameToTier(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('unlimited')) return 'unlimited';
  if (n.includes('elite'))     return 'elite';
  if (n.includes('pro'))       return 'pro';
  if (n.includes('creator'))   return 'creator';
  if (n.includes('founder'))   return 'founder';
  if (n.includes('ambassador')) return 'ambassador';
  if (n.includes('staff'))    return 'staff';
  if (n.includes('moderator')) return 'moderator';
  if (n.includes('helper'))   return 'helper';
  if (n.includes('admin'))     return 'admin';
  if (n.includes('director')) return 'director';
  if (n.includes('@member') || n === 'member') return 'member';
  return null;
}

async function getLatestAudit(guildId) {
  const { rows } = await pool.query(
    `SELECT id, checked_at, violations, total_roles, total_channels, status
     FROM discord_permission_audit
     WHERE guild_id = $1
     ORDER BY checked_at DESC
     LIMIT 1`,
    [guildId]
  );
  return rows[0] || null;
}

module.exports = {
  syncStructure,
  getStoredStructure,
  auditInheritance,
  applyPermissionFixes,
  getLatestAudit,
  TIER_ORDER,
  PERM,
  _roleNameToTier,
};