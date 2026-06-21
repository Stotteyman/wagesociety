// lib/discord-token.js — Discord OAuth token refresh helper.
// Owns: refreshing expired Discord access tokens using stored refresh_token.
// Does NOT own OAuth flows, link storage, or role sync.
const https = require('https');

/**
 * Refresh a Discord access token if expired. Returns new token set or null.
 * @param {object} link - discord_links row with token_expires_at, refresh_token
 * @returns {Promise<{access_token: string, refresh_token: string, token_expires_at: Date}|null>}
 */
async function refreshDiscordToken(link) {
  if (!link.refresh_token) return null;

  // Check if token is actually expired (with 60s buffer)
  if (link.token_expires_at) {
    const expires = new Date(link.token_expires_at);
    if (expires > new Date(Date.now() + 60000)) return null; // still valid
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('[discord-token] missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET');
    return null;
  }

  return new Promise((resolve) => {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: link.refresh_token,
    }).toString();

    const options = {
      hostname: 'discord.com',
      path: '/api/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) {
            console.log(JSON.stringify({ event: 'discord_token_refreshed' }));
            resolve({
              access_token: parsed.access_token,
              refresh_token: parsed.refresh_token || link.refresh_token,
              token_expires_at: new Date(Date.now() + (parsed.expires_in || 604800) * 1000),
            });
          } else {
            console.error(JSON.stringify({ event: 'discord_token_refresh_failed', error: parsed.error || 'no_access_token' }));
            resolve(null);
          }
        } catch {
          console.error(JSON.stringify({ event: 'discord_token_refresh_parse_error' }));
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.error(JSON.stringify({ event: 'discord_token_refresh_network_error', error: err.message }));
      resolve(null);
    });

    req.write(body);
    req.end();
  });
}

module.exports = { refreshDiscordToken };
