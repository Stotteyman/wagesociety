// bot/discord-bot.js — Discord Client + event handlers for WAGE Society bot.
// Owns: bot lifecycle, guild events, member events, message events.
// Does NOT own: periodic sync (bot/periodic-sync.js), stats API (routes/api/discord-stats.js).

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { RateLimiter } = require('./rate-limiter');

const rl = new RateLimiter();

function createClient() {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildModeration,
    ],
    partials: [Partials.GuildMember],
  });
}

function createBot(token, { pool, upsertServer, markServerConnected, createDefaultConfig, updateServerMemberCount, updateWageRoleId, getAllLinkedDiscordIds, getDiscordLinkByDiscordId }) {
  if (!token) {
    console.log(JSON.stringify({ event: 'discord_bot_skip', reason: 'no_bot_token' }));
    return null;
  }

  const client = createClient();
  client.rl = rl;

  // ── client.ready ────────────────────────────────────────────────────────────
  client.once('ready', () => {
    console.log(JSON.stringify({
      event: 'bot_ready',
      user: client.user?.tag,
      guilds: client.guilds.cache.size,
    }));
  });

  // ── guildCreate — bot added to a server ────────────────────────────────────
  client.on('guildCreate', async (guild) => {
    console.log(JSON.stringify({ event: 'guild_create', guild_id: guild.id, name: guild.name }));

    try {
      const iconUrl = guild.iconURL({ size: 256, extension: 'png' }) || null;
      const server = await upsertServer({
        guildId: guild.id,
        name: guild.name,
        iconUrl,
        ownerDiscordId: guild.ownerId || null,
      });

      if (server) {
        await markServerConnected(guild.id, null);
        await createDefaultConfig(server.id);
      }

      // Auto-create "WAGE Society Member" role (orange #ff6600)
      let wageRoleId = null;
      try {
        const existingRoles = await rl.exec(() => guild.roles.fetch());
        const existing = existingRoles.find(r => r.name === 'WAGE Society Member');
        if (existing) {
          wageRoleId = existing.id;
          console.log(JSON.stringify({ event: 'wage_role_reused', guild_id: guild.id, role_id: wageRoleId }));
        } else {
          const newRole = await rl.exec(() => guild.roles.create({
            name: 'WAGE Society Member',
            color: 0xff6600,
            reason: 'WAGE Society bot auto-role for verified members',
          }));
          wageRoleId = newRole.id;
          console.log(JSON.stringify({ event: 'wage_role_created', guild_id: guild.id, role_id: wageRoleId }));
        }
        if (wageRoleId && updateWageRoleId) {
          await updateWageRoleId(guild.id, wageRoleId);
        }
      } catch (roleErr) {
        // Permission error creating role — non-fatal, log warning
        console.error(JSON.stringify({ event: 'wage_role_create_error', guild_id: guild.id, error: roleErr.message }));
      }

      // Bulk assign role to existing linked WAGE users who are in this guild
      if (wageRoleId && getAllLinkedDiscordIds) {
        try {
          const linkedUsers = await getAllLinkedDiscordIds();
          let assigned = 0;
          for (const { discord_id } of linkedUsers) {
            try {
              const member = await rl.exec(() => guild.members.fetch(discord_id).catch(() => null));
              if (member && !member.roles.cache.has(wageRoleId)) {
                await rl.exec(() => member.roles.add(wageRoleId, 'WAGE Society auto-role'));
                assigned++;
              }
            } catch (_) {
              // Member not in guild or role add failed — skip
            }
          }
          console.log(JSON.stringify({ event: 'wage_role_bulk_assign', guild_id: guild.id, assigned, total: linkedUsers.length }));
        } catch (bulkErr) {
          console.error(JSON.stringify({ event: 'wage_role_bulk_error', guild_id: guild.id, error: bulkErr.message }));
        }
      }

      // DM owner if we have their ID
      if (guild.ownerId) {
        try {
          const owner = await rl.exec(() => guild.members.fetch(guild.ownerId));
          if (owner?.user) {
            await owner.user.send(`✅ **${guild.name}** is now connected to W.A.G.E. Society!\nManage your server: https://wagesociety.com/dashboard/discord/servers`);
          }
        } catch (_) {
          // owner may have DMs disabled — non-fatal
        }
      }
    } catch (err) {
      console.error(JSON.stringify({ event: 'guild_create_error', guild_id: guild.id, error: err.message }));
    }
  });

  // ── guildDelete — bot removed from a server ────────────────────────────────
  client.on('guildDelete', async (guild) => {
    console.log(JSON.stringify({ event: 'guild_delete', guild_id: guild.id, name: guild.name }));

    try {
      await pool.query(
        `UPDATE discord_servers SET connected_at = NULL, updated_at = NOW() WHERE guild_id = $1`,
        [guild.id]
      );
    } catch (err) {
      console.error(JSON.stringify({ event: 'guild_delete_error', guild_id: guild.id, error: err.message }));
    }
  });

  // ── guildMemberAdd — new member joins ─────────────────────────────────────
  client.on('guildMemberAdd', async (member) => {
    try {
      // Increment cached member count
      await updateServerMemberCount(member.guild.id, 1);

      // Fetch auto-role config + wage_role_id for this server
      const configRows = await pool.query(
        `SELECT ds.wage_role_id, dsc.auto_role_free, dsc.auto_role_creator, dsc.auto_role_pro, dr.role_id, dr.slug
         FROM discord_servers ds
         JOIN discord_server_configs dsc ON dsc.server_id = ds.id
         LEFT JOIN discord_roles dr ON dr.slug = 'member'
         WHERE ds.guild_id = $1`,
        [member.guild.id]
      );

      const rows = configRows.rows;
      if (!rows.length) return;

      const hasFree = rows[0].auto_role_free;
      const memberRoleId = rows[0].role_id;
      const wageRoleId = rows[0].wage_role_id;

      if (hasFree && memberRoleId) {
        await rl.exec(() =>
          member.guild.roles.fetch(memberRoleId).then(role => {
            if (role) return member.roles.add(role).catch(() => null);
          })
        );
      }

      // Check if this Discord user has a WAGE Society account linked
      if (wageRoleId && getDiscordLinkByDiscordId) {
        try {
          const discordLink = await getDiscordLinkByDiscordId(member.id);
          if (discordLink && !member.roles.cache.has(wageRoleId)) {
            await rl.exec(() => member.roles.add(wageRoleId, 'WAGE Society auto-role on join'));
            console.log(JSON.stringify({ event: 'wage_role_assigned_on_join', guild_id: member.guild.id, discord_id: member.id }));
          }
        } catch (wageErr) {
          console.error(JSON.stringify({ event: 'wage_role_join_error', guild_id: member.guild.id, error: wageErr.message }));
        }
      }
    } catch (err) {
      console.error(JSON.stringify({ event: 'guild_member_add_error', guild_id: member.guild.id, error: err.message }));
    }
  });

  // ── guildMemberRemove — member leaves ───────────────────────────────────────
  client.on('guildMemberRemove', async (member) => {
    try {
      await updateServerMemberCount(member.guild.id, -1);
    } catch (err) {
      console.error(JSON.stringify({ event: 'guild_member_remove_error', guild_id: member.guild.id, error: err.message }));
    }
  });

  // ── messageCreate — anti-spam logging ─────────────────────────────────────
  client.on('messageCreate', async (message) => {
    if (message.author?.bot || !message.guild) return;

    try {
      const rows = await pool.query(
        `SELECT dsc.antispam_enabled FROM discord_servers ds
         JOIN discord_server_configs dsc ON dsc.server_id = ds.id
         WHERE ds.guild_id = $1`,
        [message.guild.id]
      );
      if (!rows.rows[0]?.antispam_enabled) return;
      // TODO: implement actual anti-spam detection + flagging
    } catch (_) {}
  });

  client.login(token).catch(err => {
    console.error(JSON.stringify({ event: 'bot_login_failed', error: err.message }));
  });

  return client;
}

module.exports = { createBot, RateLimiter };