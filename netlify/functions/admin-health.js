// GET /api/admin-health — live system monitors for the admin control center.
//
// Every check here performs a real request against the real dependency. Nothing is
// cached or assumed: the point of a monitor is to fail when the thing is broken, so
// a check that cannot be performed reports "unknown", never "ok".
//
// Staff-gated, and deliberately server-side: it touches the bot token and the Stripe
// secret key, neither of which may ever reach the browser.
const tls = require('node:tls');
const { getAuthContext, hasRole, json } = require('./_auth');

const BOT = process.env.DISCORD_BOT_TOKEN;
const GUILD = process.env.DISCORD_GUILD_ID;
const STRIPE = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const VERIFY_CHANNEL = '1511423366257578176';
const VIEW_CHANNEL = 1n << 10n;

/** Wrap a probe so one failing dependency never takes the whole page down. */
async function probe(name, fn) {
  const started = Date.now();
  try {
    const r = await fn();
    return { name, status: r.status || 'ok', ms: Date.now() - started, ...r };
  } catch (e) {
    return { name, status: 'down', ms: Date.now() - started, detail: e.message };
  }
}

/** Days until the TLS certificate on a host expires. */
function certExpiry(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert || !cert.valid_to) return reject(new Error('no certificate presented'));
      const expires = new Date(cert.valid_to);
      resolve({
        subject: cert.subject?.CN || '(unknown)',
        issuer: cert.issuer?.O || '(unknown)',
        expires: expires.toISOString(),
        days_left: Math.floor((expires - Date.now()) / 86400000),
      });
    });
    socket.on('error', reject);
    socket.on('timeout', () => { socket.destroy(); reject(new Error('timed out')); });
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});

  const { user, role } = await getAuthContext(event);
  if (!user) return json(401, { error: 'Not authenticated' });
  if (!hasRole(role, 'staff')) return json(403, { error: 'forbidden' });

  const checks = await Promise.all([
    probe('supabase', async () => {
      if (!SUPABASE_URL || !SERVICE) return { status: 'unknown', detail: 'not configured' };
      const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Accept-Profile': 'wagesociety' },
      });
      if (!r.ok) return { status: 'down', detail: `HTTP ${r.status}` };
      return { status: 'ok', detail: 'schema reachable' };
    }),

    probe('discord_bot', async () => {
      if (!BOT) return { status: 'unknown', detail: 'DISCORD_BOT_TOKEN not set' };
      const r = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bot ${BOT}` } });
      if (!r.ok) return { status: 'down', detail: `HTTP ${r.status} — token may be revoked` };
      const me = await r.json();
      return { status: 'ok', detail: `${me.username}#${me.discriminator || '0'}`, bot_id: me.id };
    }),

    probe('discord_guild', async () => {
      if (!BOT || !GUILD) return { status: 'unknown', detail: 'bot token or guild id missing' };
      const [g, roles, channels] = await Promise.all([
        fetch(`https://discord.com/api/v10/guilds/${GUILD}?with_counts=true`, { headers: { Authorization: `Bot ${BOT}` } }).then(r => r.json()),
        fetch(`https://discord.com/api/v10/guilds/${GUILD}/roles`, { headers: { Authorization: `Bot ${BOT}` } }).then(r => r.json()),
        fetch(`https://discord.com/api/v10/guilds/${GUILD}/channels`, { headers: { Authorization: `Bot ${BOT}` } }).then(r => r.json()),
      ]);
      if (!g || g.code) return { status: 'down', detail: g?.message || 'guild unreachable' };
      return {
        status: 'ok',
        detail: `${g.name} — ${g.approximate_member_count ?? '?'} members, `
              + `${g.approximate_presence_count ?? '?'} online, `
              + `${Array.isArray(roles) ? roles.length : '?'} roles, `
              + `${Array.isArray(channels) ? channels.length : '?'} channels`,
        guild_name: g.name,
        members: g.approximate_member_count ?? null,
        online: g.approximate_presence_count ?? null,
        verification_level: g.verification_level,
        roles: Array.isArray(roles) ? roles.length : null,
        channels: Array.isArray(channels) ? channels.length : null,
      };
    }),

    // The gate itself: #verify must be visible to @everyone, and nothing else should be.
    probe('verification_gate', async () => {
      if (!BOT || !GUILD) return { status: 'unknown', detail: 'bot token or guild id missing' };
      const channels = await fetch(`https://discord.com/api/v10/guilds/${GUILD}/channels`, {
        headers: { Authorization: `Bot ${BOT}` },
      }).then(r => r.json());
      if (!Array.isArray(channels)) return { status: 'down', detail: 'could not read channels' };

      const publicChannels = channels.filter(c =>
        (c.permission_overwrites || []).some(o => o.id === GUILD && (BigInt(o.allow) & VIEW_CHANNEL)));
      const verifyOpen = publicChannels.some(c => c.id === VERIFY_CHANNEL);
      const leaks = publicChannels.filter(c => c.id !== VERIFY_CHANNEL).map(c => c.name);

      if (!verifyOpen) return { status: 'down', detail: '#verify is NOT visible to @everyone — new members see nothing' };
      if (leaks.length) return { status: 'warn', detail: `visible without verifying: ${leaks.join(', ')}`, leaks };
      return { status: 'ok', detail: '#verify open, every other channel closed' };
    }),

    probe('stripe', async () => {
      if (!STRIPE) return { status: 'unknown', detail: 'STRIPE_SECRET_KEY not set' };
      const r = await fetch('https://api.stripe.com/v1/account', { headers: { Authorization: `Bearer ${STRIPE}` } });
      if (!r.ok) return { status: 'down', detail: `HTTP ${r.status}` };
      const a = await r.json();
      return {
        status: a.charges_enabled ? 'ok' : 'warn',
        detail: `${a.business_profile?.name || a.id} — charges ${a.charges_enabled ? 'enabled' : 'DISABLED'}`,
        livemode: STRIPE.startsWith('sk_live'),
      };
    }),

    probe('stripe_webhook', async () => {
      if (!STRIPE) return { status: 'unknown', detail: 'STRIPE_SECRET_KEY not set' };
      const r = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=20', { headers: { Authorization: `Bearer ${STRIPE}` } });
      if (!r.ok) return { status: 'down', detail: `HTTP ${r.status}` };
      const { data = [] } = await r.json();
      const ours = data.find(w => (w.url || '').includes('/api/stripe-webhook'));
      if (!ours) return { status: 'down', detail: 'no endpoint points at /api/stripe-webhook — subscription events are being lost' };
      const signing = Boolean(process.env.STRIPE_SIGNING_SECRET);
      return {
        status: ours.status === 'enabled' && signing ? 'ok' : 'warn',
        detail: signing
          ? `${ours.status} → ${ours.url}`
          : `STRIPE_SIGNING_SECRET is unset — forged webhooks would be accepted`,
        events: ours.enabled_events?.length ?? 0,
      };
    }),

    probe('tls_certificate', async () => {
      const c = await certExpiry('wagesociety.com');
      // Let's Encrypt renews with ~30 days to spare; below that something is stuck.
      const status = c.days_left < 10 ? 'down' : c.days_left < 25 ? 'warn' : 'ok';
      return { status, detail: `${c.subject} (${c.issuer}) — ${c.days_left} days left`, ...c };
    }),
  ]);

  const worst = checks.some(c => c.status === 'down') ? 'down'
    : checks.some(c => c.status === 'warn') ? 'warn'
    : checks.some(c => c.status === 'unknown') ? 'unknown' : 'ok';

  return json(200, { overall: worst, checked_at: new Date().toISOString(), checks });
};
