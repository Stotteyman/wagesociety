// POST /api/app-auth — device authorization for the desktop apps.
//
// The desktop app is distributable, so it can hold no secret. The flow is:
//
//   1. app  -> { action: 'start' }        -> { device_code, user_code, verify_url }
//   2. user -> approves user_code on the website while signed in
//   3. app  -> { action: 'poll', device_code } -> { token } once approved
//   4. app  -> /api/app-entitlement with that token, on launch and periodically
//
// Only the SHA-256 of the issued token is stored, so the database never holds anything
// replayable as a licence.
const crypto = require('node:crypto');
const { getServiceClient, isConfigured, json } = require('./_auth');

const APP_URL = process.env.APP_URL || 'https://wagesociety.com';
const CODE_TTL_MINUTES = 15;

// No I/O/0/1 — these are read off a screen and typed by hand.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function userCode() {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!isConfigured()) return json(500, { error: 'Supabase not configured' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad body' }); }

  const svc = getServiceClient();
  const appSlug = String(body.app || 'clip-studio');

  if (body.action === 'start') {
    const deviceCode = crypto.randomBytes(32).toString('hex');
    const code = userCode();
    const expires = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

    const { error } = await svc.from('app_device_codes').insert({
      device_code: deviceCode,
      user_code: code,
      app_slug: appSlug,
      device_name: String(body.device_name || '').slice(0, 80) || null,
      expires_at: expires,
    });
    if (error) return json(500, { error: 'could not start sign-in', detail: error.message });

    return json(200, {
      device_code: deviceCode,
      user_code: code,
      // Shown to the person as something they can read out and type.
      verify_url: `${APP_URL}/link`,
      verify_url_complete: `${APP_URL}/link?code=${code}`,
      expires_in: CODE_TTL_MINUTES * 60,
      interval: 5,
    });
  }

  if (body.action === 'poll') {
    const deviceCode = String(body.device_code || '');
    if (!deviceCode) return json(400, { error: 'device_code required' });

    const { data: rec } = await svc
      .from('app_device_codes')
      .select('device_code, user_id, approved_at, claimed_at, expires_at, app_slug, device_name')
      .eq('device_code', deviceCode)
      .maybeSingle();

    if (!rec) return json(404, { error: 'unknown_device_code' });
    if (new Date(rec.expires_at) < new Date()) return json(400, { error: 'expired' });
    if (!rec.approved_at) return json(200, { status: 'pending' });
    // A code is good for exactly one token; polling again must not mint a second.
    if (rec.claimed_at) return json(400, { error: 'already_claimed' });

    const token = crypto.randomBytes(32).toString('base64url');
    const { error: sErr } = await svc.from('app_sessions').insert({
      token_hash: sha256(token),
      user_id: rec.user_id,
      app_slug: rec.app_slug,
      device_name: rec.device_name,
      last_seen_at: new Date().toISOString(),
    });
    if (sErr) return json(500, { error: 'could not issue token', detail: sErr.message });

    await svc.from('app_device_codes').update({ claimed_at: new Date().toISOString() }).eq('device_code', deviceCode);
    return json(200, { status: 'approved', token });
  }

  return json(400, { error: 'unknown_action' });
};
