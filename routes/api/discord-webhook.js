// routes/api/discord-webhook.js — Discord interaction webhook endpoint.
// Handles: slash commands, message components, guildMemberAdd for auto-role.
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { pool } = require('../../db/index');

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// Verify Discord interaction signature using Ed25519 (ED25519=1)
function verifySignature(rawBody, signature, timestamp) {
  if (!PUBLIC_KEY) return false;
  const data = `Discord${timestamp}${rawBody}`;
  const expected = crypto
    .createHash('sha256')
    .update(data)
    .digest();
  const key = Buffer.from(PUBLIC_KEY, 'hex');
  try {
    return crypto.verify(null, expected, key, Buffer.from(signature, 'hex'));
  } catch (_) {
    return false;
  }
}

// ── Raw body needed for signature verification — mounted before express.json ─

// Mount at /api/discord/webhook (body raw, no json middleware)
router.post('/', express.raw({ type: '*/*' }), async (req, res) => {
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];

  if (!signature || !timestamp) {
    return res.status(401).json({ error: 'Missing signature headers' });
  }

  if (!verifySignature(req.body, signature, timestamp)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (_) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // Discord expects acknowledgment within 3 seconds for PING
  if (body.type === 1) {
    return res.json({ type: 1 });
  }

  // Handle interaction types:
  // 2 = ApplicationCommand, 3 = MessageComponent, 4 = ApplicationCommandAutocomplete, 5 = ModalSubmit
  const interactionType = body.type;

  // Always respond immediately to non-ping interactions
  res.json({ type: 5, data: { content: '⚠️ Command processing...', flags: 64 } });

  // Process async (long-running work after response)
  handleInteraction(body, interactionType).catch(err => {
    console.error(JSON.stringify({ event: 'discord_webhook_error', error: err.message }));
  });
});

async function handleInteraction(body, type) {
  switch (type) {
    case 2: // ApplicationCommand (slash command)
      await handleSlashCommand(body);
      break;
    case 3: // MessageComponent (button/select menu)
      await handleMessageComponent(body);
      break;
    case 5: // ModalSubmit
      await handleModalSubmit(body);
      break;
    default:
      console.log(JSON.stringify({ event: 'unhandled_interaction_type', type }));
  }
}

async function handleSlashCommand(body) {
  const { name, options, guild_id } = body.data || {};
  console.log(JSON.stringify({ event: 'slash_command', name, guild_id }));

  // TODO: implement specific slash commands as features are built
  // e.g., /wage status → show user's membership status
}

async function handleMessageComponent(body) {
  const { custom_id, values } = body.data || {};
  console.log(JSON.stringify({ event: 'message_component', custom_id }));

  // TODO: handle button clicks, select menus
}

async function handleModalSubmit(body) {
  const { custom_id } = body.data || {};
  console.log(JSON.stringify({ event: 'modal_submit', custom_id }));

  // TODO: handle modal submissions
}

// ── Guild member add endpoint (used for auto-role from external webhook) ─────
// POST /api/discord/webhook/member-add
// Body: { guild_id, user_id, username, discriminator }
// This is called by external systems that receive Discord webhooks directly
router.post('/member-add', async (req, res) => {
  const secret = process.env.DISCORD_WEBHOOK_SECRET;
  if (secret && req.headers['x-webhook-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { guild_id, user_id, username } = req.body;
  if (!guild_id || !user_id) {
    return res.status(400).json({ error: 'guild_id and user_id required' });
  }

  try {
    const rows = await pool.query(
      `SELECT dsc.auto_role_free, dr.role_id
       FROM discord_servers ds
       JOIN discord_server_configs dsc ON dsc.server_id = ds.id
       LEFT JOIN discord_roles dr ON dr.slug = 'member'
       WHERE ds.guild_id = $1 AND ds.connected_at IS NOT NULL`,
      [guild_id]
    );

    if (!rows.rows.length || !rows.rows[0].auto_role_free || !rows.rows[0].role_id) {
      return res.json({ ok: true, reason: 'auto_role_disabled_or_no_role' });
    }

    // Apply role via Discord API with bot token
    const roleId = rows.rows[0].role_id;
    await fetch(`https://discord.com/api/v10/guilds/${guild_id}/members/${user_id}/roles/${roleId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        'User-Agent': 'WageOSBot/1.0',
        'X-Audit-Log-Reason': 'WAGE Society auto-role: free member',
      },
    });

    console.log(JSON.stringify({ event: 'auto_role_applied', guild_id, user_id, role_id: roleId }));
    res.json({ ok: true });
  } catch (err) {
    console.error(JSON.stringify({ event: 'member_add_webhook_error', error: err.message }));
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;