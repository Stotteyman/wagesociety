// POST /api/youtube-channels { provider_token } + user JWT.
// Lists the YouTube channels owned by the signed-in user's linked Google account.
//
// Supabase does not persist the Google provider token, so the browser has to hand
// it over right after the OAuth redirect. We never store it — it is used for this
// one call and discarded.
const { json } = require('./_auth');

const LIST_URL = 'https://www.googleapis.com/youtube/v3/channels'
  + '?part=snippet,statistics&mine=true&maxResults=50';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const jwt = (event.headers.authorization || event.headers.Authorization || '')
    .replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return json(401, { error: 'Not authenticated' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad body' }); }
  const providerToken = body.provider_token;
  if (!providerToken) {
    return json(400, {
      error: 'no_provider_token',
      detail: 'Reconnect Google from Settings — the YouTube permission is only handed over during sign-in.',
    });
  }

  const res = await fetch(LIST_URL, { headers: { Authorization: `Bearer ${providerToken}` } });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const reason = data?.error?.errors?.[0]?.reason;
    if (res.status === 401 || res.status === 403) {
      return json(400, {
        error: 'youtube_permission',
        detail: reason === 'insufficientPermissions' || res.status === 403
          ? 'Google did not grant YouTube access. Reconnect Google and accept the YouTube permission.'
          : 'That Google session expired. Reconnect Google from Settings.',
      });
    }
    return json(400, { error: 'youtube_list_failed', detail: data?.error?.message || `HTTP ${res.status}` });
  }

  const channels = (data.items || []).map((c) => ({
    id: c.id,
    name: c.snippet?.title || 'Untitled channel',
    avatar: c.snippet?.thumbnails?.default?.url || null,
    handle: c.snippet?.customUrl || null,
    subscribers: c.statistics?.hiddenSubscriberCount ? null : Number(c.statistics?.subscriberCount ?? 0),
    url: c.snippet?.customUrl
      ? `https://www.youtube.com/${c.snippet.customUrl}`
      : `https://www.youtube.com/channel/${c.id}`,
  }));

  return json(200, { ok: true, channels });
};
