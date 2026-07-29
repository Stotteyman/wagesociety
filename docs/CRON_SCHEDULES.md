# Scheduled jobs — what used to run, and what runs now

**Nothing in this repo currently runs on a schedule.** This file exists so that fact is
deliberate rather than accidental.

The two Discord background jobs used to be scheduled by `polsia.toml`, a Polsia/Blaxel
platform config at the repo root. That platform is gone, the Express app it scheduled is
retired dead code (`docs/AGENT_NOTES.md`), and the file was deleted on 2026-07-29. The
schedules are recorded here so whoever re-homes the Discord bot (backlog item **P2** —
"Decide where the Discord bot lives") does not have to guess at the cadence.

There is no `.github/workflows/`, and no Netlify scheduled function
(`netlify.toml` declares no `[functions."..."] schedule`). Verified 2026-07-29.

---

## The two schedules that were live

| Name | Cron | Command | Source file |
|---|---|---|---|
| `discord-guild-sync` | `*/30 * * * *` (every 30 min) | `node bot/periodic-sync-trigger.js` | `bot/periodic-sync-trigger.js` |
| `discord-role-sync` | `*/15 * * * *` (every 15 min) | `node jobs/discord-role-sync.js` | `jobs/discord-role-sync.js` |

Both were declared with `enabled = true`.

### `discord-guild-sync` — every 30 minutes

`bot/periodic-sync-trigger.js` is a thin one-shot HTTP client: it `POST`s to
`${APP_URL}/api/discord/sync-all` with an `x-webhook-secret` header
(`DISCORD_WEBHOOK_SECRET`) and exits. Refreshing connected-guild metadata is the point;
the work happens server-side.

There is a **second, in-process** implementation of the same 30-minute job:
`bot/periodic-sync.js`'s `startPeriodicSync()` sets a 30-minute `setInterval` inside the
running Express process. The two were mutually exclusive by env var — the in-process timer
returns `null` unless `POLSIA_IN_PROCESS_CRONS_ENABLED === 'true'`, and the platform set
that to `'false'` on the host that ran the external cron. Whichever host takes the bot next
must keep exactly one of the two paths live, or guild sync runs twice every half hour.

### `discord-role-sync` — every 15 minutes

`jobs/discord-role-sync.js` is a drift fix, not the primary sync: it pulls up to 200
Discord-linked users active in the last 30 days, compares expected roles (staff role +
cumulative subscription tier) against the roles Discord actually reports, and calls
`syncRoles()` only where they disagree.

It is guarded by the same env var and exits `0` immediately unless
`POLSIA_IN_PROCESS_CRONS_ENABLED === 'true'` — so re-adding the schedule alone will not
start it. `DISCORD_SYNC_DRY_RUN=true` makes it log intended changes without writing.

> Backlog item **W5** renames `POLSIA_IN_PROCESS_CRONS_ENABLED` to
> `ENABLE_IN_PROCESS_CRONS` (with the old name kept as a fallback). If that has landed,
> read both names here.

## A third schedule that was only ever a TODO

`db/referrals.js` documents a `referral-retention-check` job at `0 8 * * *` running
`node scripts/check-referral-retention.js` (+300 points to a referrer once a referred
account reaches 30 days). **It was never declared in `polsia.toml` and
`scripts/check-referral-retention.js` does not exist.** It is a design note, not a
regression — recorded here only so nobody "restores" a job that never ran.

## Also deleted the same day

- **`render.yaml`** — the Render web-service manifest (`npm install` / `npm start`,
  health check `/health`, `NODE_ENV=production`). Superseded by `netlify.toml`; the site
  cut over from Render to Netlify on 2026-07-28. Nothing in the repo referenced it.
  `server.js:143` still serves `/health`, and `netlify/functions/health.js` is the
  equivalent on the live stack.
- **`FOR_POLSIA.md`** — a one-off 2026-05 checklist for creating the Discord application
  and setting four env vars **in the Render dashboard**. Every step targeted hosts and a
  database that no longer exist (Render, Neon, `ai.wagesociety.com`), and its "what's
  already built" section pointed at `migrations/1779621747_discord_links.sql`, a file that
  is not in the repo. The current Discord setup guide is `docs/discord-bot-setup.md`.
