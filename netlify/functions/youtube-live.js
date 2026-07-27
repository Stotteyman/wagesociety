// POST /api/youtube-live — refresh live status for stale YouTube channels.
//
// Quota is the whole design constraint here. YouTube's search.list costs 100
// units against a 10,000/day default, so this never runs on a timer: it is called
// when someone actually looks at Streams, it only touches channels whose cache has
// expired, and it hard-caps how many it will refresh in one go.
//
// Worst case per call: MAX_PER_CALL * 100 units.
const { json } = require('./_auth');

const API_KEY = process.env.YOUTUBE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const TTL_MINUTES = 10;
const MAX_PER_CALL = 6;

const rest = (path, init = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Accept-Profile': 'wagesociety',
      'Content-Profile': 'wagesociety',
      ...(init.headers || {}),
    },
  });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  // Say so plainly rather than reporting every channel as offline.
  if (!API_KEY) {
    return json(200, {
      ok: true,
      configured: false,
      checked: 0,
      detail: 'YOUTUBE_API_KEY is not set, so live status cannot be determined.',
    });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: 'not_configured', detail: 'Supabase service credentials missing.' });
  }

  const staleBefore = new Date(Date.now() - TTL_MINUTES * 60_000).toISOString();
  const query =
    'member_livestreams?platform=eq.youtube&external_id=not.is.null'
    + `&or=(live_checked_at.is.null,live_checked_at.lt.${staleBefore})`
    + `&select=id,external_id&limit=${MAX_PER_CALL}`;

  const listRes = await rest(query);
  if (!listRes.ok) {
    return json(500, { error: 'db_read_failed', detail: await listRes.text() });
  }
  const rows = await listRes.json();
  if (rows.length === 0) return json(200, { ok: true, configured: true, checked: 0, fresh: true });

  let live = 0;
  for (const row of rows) {
    const url = 'https://www.googleapis.com/youtube/v3/search'
      + `?part=snippet&type=video&eventType=live&maxResults=1`
      + `&channelId=${encodeURIComponent(row.external_id)}&key=${API_KEY}`;

    let patch = { live_checked_at: new Date().toISOString() };
    try {
      const r = await fetch(url);
      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        // Quota exhaustion must not be recorded as "offline" — leave the cache
        // stale so the next call retries instead of publishing a wrong answer.
        const reason = data?.error?.errors?.[0]?.reason;
        if (reason === 'quotaExceeded' || r.status === 403) {
          return json(200, {
            ok: true,
            configured: true,
            checked: live,
            quotaExceeded: true,
            detail: 'YouTube quota is exhausted for today. Live status is stale, not offline.',
          });
        }
        continue;
      }

      const item = (data.items || [])[0];
      if (item) {
        live++;
        patch = {
          ...patch,
          status: 'live',
          title: item.snippet?.title || null,
          thumbnail_url: item.snippet?.thumbnails?.medium?.url || null,
          started_at: item.snippet?.publishedAt || null,
        };
      } else {
        patch = { ...patch, status: 'offline', ended_at: new Date().toISOString() };
      }
    } catch {
      continue; // transient network failure — leave the cache stale, retry later
    }

    await rest(`member_livestreams?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
  }

  return json(200, { ok: true, configured: true, checked: rows.length, live });
};
