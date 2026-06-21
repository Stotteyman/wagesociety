/**
 * Builds the render context passed to `views/layout.ejs`.
 * Now async — fetches hero creator data + live stats from DB.
 */
const fs = require('fs');
const path = require('path');
const { getHeroCreators, getCreatorCount } = require('../db/profiles');
const { getHomepageStats, getLiveCreators } = require('../db/platform-stats');
const { getLiveViewerCount } = require('../db/livestreams');

const CSS_DIR = path.join(__dirname, '..', 'public', 'css');

function buildThemeCSS() {
  if (!fs.existsSync(CSS_DIR)) return '';
  const files = fs
    .readdirSync(CSS_DIR)
    .filter((f) => f.endsWith('.css'))
    .sort();
  if (files.length === 0) return '';
  return files.map((f) => `<link rel="stylesheet" href="/css/${f}">`).join('\n');
}

function buildAnalyticsSnippet(slug) {
  if (!slug) return '';
  const slugJson = JSON.stringify(slug);
  return `<!-- Wage Society Analytics --><script>(function(){var slug=${slugJson};if(!slug)return;var vid=localStorage.getItem('wage_analytics_vid');if(!vid){vid='xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return (c==='x'?r:(r&0x3|0x8)).toString(16);});localStorage.setItem('wage_analytics_vid',vid);}new Image().src='https://wagesociety.com/api/beacon/pixel?s='+encodeURIComponent(slug)+'&v='+encodeURIComponent(vid);})();</script>`;
}

async function buildLandingContext() {
  const slug = process.env.ANALYTICS_SLUG || 'wagesociety';
  const [stats, heroCreators, creatorCount, liveCreators, liveViewerCount] = await Promise.all([
    getHomepageStats().catch(() => ({
      total_earned_cents: 0,
      creators_joined: 0,
      live_streams_today: 0,
      products_launched: 0,
      community_members: 0,
    })),
    getHeroCreators(6).catch(() => []),
    getCreatorCount().catch(() => 0),
    getLiveCreators(10).catch(() => []),
    getLiveViewerCount().catch(() => 0),
  ]);

  return {
    slug,
    theme: {},
    themeCSS: buildThemeCSS(),
    analyticsSnippet: buildAnalyticsSnippet(slug),
    heroCreators,
    creatorCount,
    liveViewerCount,
    liveStats: {
      total_earned_cents:  stats.total_earned_cents,
      creators_joined:      stats.creators_joined,
      live_streams_today:   stats.live_streams_today,
      products_launched:   stats.products_launched,
      community_online:    stats.community_members,
    },
    liveCreators,
    // HUD overlay (Three.js portal) — also sent to /api/homepage-stats for 30s polling
    live_now:             stats.live_streams_today,
    member_count:         stats.creators_joined,
    active_streams:       stats.live_streams_today,
    // total_earned_display was removed from homepage HUD (task #2801513)
  };
}

module.exports = { buildLandingContext, buildThemeCSS, buildAnalyticsSnippet };
