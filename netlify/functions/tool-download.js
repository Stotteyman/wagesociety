// GET /api/tool-download?tool=clip-studio        → { url } a short-lived signed link
// GET /api/tool-download?tool=clip-studio&info=1 → { version, size, notes } metadata only
//
// Member tools are published as releases on a PRIVATE GitHub repo. Nothing about
// that repo is public: the asset 404s to anonymous callers, so the only way to
// reach a build is through this function, and only after the caller's tier has
// been checked here.
//
// The link handed back is GitHub's own signed object URL, which expires in a few
// minutes. That is the point — it cannot usefully be pasted into Discord, and a
// lapsed member simply stops being issued new ones. It does NOT stop someone who
// already downloaded a build from passing the file on; nothing server-side can.
//
// We return the URL rather than streaming the bytes because these are ~60 MB and
// a synchronous Netlify function may only return 6 MB.
const { getAuthContext, getServiceClient, isConfigured, json } = require('./_auth');

// Mirrors src/lib/plans.ts. Kept as a literal rather than imported because the
// functions are CommonJS and that file is a TS module.
const TIER_ORDER = ['free', 'creator', 'pro', 'elite', 'unlimited'];
const tierRank = (slug) => TIER_ORDER.indexOf(String(slug || '').toLowerCase());

// Roles that get tools regardless of what they pay.
const STAFF_ROLES = new Set(['staff', 'manager', 'admin', 'superadmin']);

const TOOLS = {
  'clip-studio': {
    name: 'Clip Studio',
    repo: 'Stotteyman/clip-studio-releases',
    minTier: 'creator',
    // Which asset to hand over, when a release carries more than one.
    match: (asset) => /win-x64\.zip$/i.test(asset.name),
  },
};

const GITHUB_TOKEN =
  process.env.GITHUB_RELEASE_TOKEN || process.env.GITHUB_TOKEN || '';

async function github(path, extraHeaders = {}, redirect = 'follow') {
  return fetch(`https://api.github.com${path}`, {
    redirect,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'wagesociety-tools',
      ...extraHeaders,
    },
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  if (!isConfigured()) return json(500, { error: 'Supabase not configured' });

  const slug = (event.queryStringParameters?.tool || '').toLowerCase();
  const tool = TOOLS[slug];
  if (!tool) return json(404, { error: 'unknown_tool' });

  // ---- who is asking -------------------------------------------------
  const { user, role } = await getAuthContext(event);
  if (!user) {
    return json(401, {
      error: 'sign_in_required',
      detail: 'Sign in to download member tools.',
    });
  }

  // Tier is read against the id from the *verified* token, never from anything
  // the client sent, so there is nothing here for a caller to forge.
  const svc = getServiceClient();
  const { data: profile, error } = await svc
    .from('profiles')
    .select('tier')
    .eq('id', user.id)
    .maybeSingle();
  if (error) return json(500, { error: 'tier_lookup_failed', detail: error.message });

  const tier = profile?.tier || 'free';
  const entitled = STAFF_ROLES.has(role) || tierRank(tier) >= tierRank(tool.minTier);

  if (!entitled) {
    return json(403, {
      error: 'upgrade_required',
      detail: `${tool.name} is included with Creator and above.`,
      tier,
      required: tool.minTier,
    });
  }

  if (!GITHUB_TOKEN) {
    return json(503, {
      error: 'downloads_unavailable',
      detail: 'The download service is not configured yet. Try again shortly.',
    });
  }

  // ---- resolve the current build -------------------------------------
  let release;
  try {
    const res = await github(`/repos/${tool.repo}/releases/latest`);
    if (!res.ok) {
      return json(502, {
        error: 'release_lookup_failed',
        detail: `GitHub returned ${res.status}.`,
      });
    }
    release = await res.json();
  } catch (e) {
    return json(502, { error: 'release_lookup_failed', detail: String(e.message || e) });
  }

  const asset = (release.assets || []).find(tool.match) || (release.assets || [])[0];
  if (!asset) return json(404, { error: 'no_build', detail: 'No build is published yet.' });

  const meta = {
    tool: slug,
    name: tool.name,
    version: release.tag_name,
    published_at: release.published_at,
    size: asset.size,
    filename: asset.name,
    notes: release.body || null,
  };

  if (event.queryStringParameters?.info) {
    return json(200, meta, { 'Cache-Control': 'no-store, private' });
  }

  // ---- hand over a signed, expiring link ------------------------------
  // Asking for octet-stream makes GitHub answer with a 302 to a signed S3 URL.
  // `redirect: 'manual'` keeps us from following it so the link can be passed
  // to the browser instead of pulling 60 MB through the function.
  let signed;
  try {
    const res = await github(
      `/repos/${tool.repo}/releases/assets/${asset.id}`,
      { Accept: 'application/octet-stream' },
      'manual',
    );
    signed = res.headers.get('location');
    if (!signed) {
      return json(502, {
        error: 'download_link_failed',
        detail: `GitHub did not return a link (${res.status}).`,
      });
    }
  } catch (e) {
    return json(502, { error: 'download_link_failed', detail: String(e.message || e) });
  }

  return json(200, { ...meta, url: signed }, { 'Cache-Control': 'no-store, private' });
};
