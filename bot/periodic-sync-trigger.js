// bot/periodic-sync-trigger.js — Triggered by Blaxe cron every 30 minutes.
// Calls the /api/discord/sync-all endpoint to refresh all connected guild metadata.
// Uses node's built-in fetch (Node 18+).

const APP_URL = process.env.APP_URL || 'https://wagesociety.com';
const WEBHOOK_SECRET = process.env.DISCORD_WEBHOOK_SECRET || '';

async function main() {
  try {
    const res = await fetch(`${APP_URL}/api/discord/sync-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(WEBHOOK_SECRET ? { 'x-webhook-secret': WEBHOOK_SECRET } : {}),
      },
    });
    const data = await res.json();
    console.log(JSON.stringify({ event: 'sync_triggered', status: res.status, response: data }));
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({ event: 'sync_trigger_failed', error: err.message }));
    process.exit(1);
  }
}

main();