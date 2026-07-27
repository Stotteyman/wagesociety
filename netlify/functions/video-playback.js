// POST /api/video-playback { videoId } + user JWT.
//
// THE ONLY PLACE the provider video id is ever returned. It is not in
// wagesociety_videos, not in any list response, and not in the initial HTML.
// A caller gets it only after ws_can_watch confirms this specific user owns the
// video, subscribes to its creator, or made it.
//
// Understood limitation, chosen deliberately: the underlying link is an unlisted
// provider URL, so anyone legitimately served the id can still pass it on. This
// endpoint stops it leaking to people who never paid; it cannot stop a paying
// viewer resharing. Do not add the id to any cached or public payload.
const { getAuthContext, getServiceClient, getUserClient, isConfigured, json } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!isConfigured()) return json(500, { error: 'Supabase not configured' });

  const { user, token } = await getAuthContext(event);
  if (!user) return json(401, { error: 'sign_in_required', detail: 'Sign in to watch this.' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad body' }); }
  if (!body.videoId) return json(400, { error: 'videoId required' });

  // Entitlement is evaluated in the database AS THIS USER, so the check cannot be
  // fooled by anything the client sends.
  const asUser = getUserClient(token);
  const { data: canWatch, error: rpcErr } = await asUser.rpc('ws_can_watch', { p_video_id: body.videoId });
  if (rpcErr) return json(500, { error: 'entitlement_check_failed', detail: rpcErr.message });
  if (!canWatch) {
    return json(403, { error: 'not_entitled', detail: 'Buy this video or subscribe to the creator to watch it.' });
  }

  const svc = getServiceClient();
  const { data: video } = await svc
    .from('videos')
    .select('provider, provider_video_id, title')
    .eq('id', body.videoId)
    .maybeSingle();
  if (!video) return json(404, { error: 'Not found' });

  return json(200, {
    ok: true,
    provider: video.provider,
    videoId: video.provider_video_id,
    title: video.title,
  }, { 'Cache-Control': 'no-store, private' });
};
