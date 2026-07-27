# WAGE Society — Full Diagnostic Report

**Date:** 2026-07-17
**Scope:** Production health, database, Discord bot architecture, local working-tree state, module integrity
**Method:** Live HTTP probes (production), module-graph smoke test, static code + config audit. Direct DB/bot/Stripe checks could **not** run locally — `.env` holds only placeholder credentials; real secrets live in Render.

---

## TL;DR

- **Production is healthy.** `wagesociety.com` and `wage-society.polsia.app` both serve every probed route (200), the DB is reachable, response times are 0.45–0.9s.
- **The uncommitted local working tree has a broken WageWorld feature.** Four wiring regressions (dead `/play` route, missing `/wageworld`, unmounted rewards API, removed live WebSocket). It still **boots** (51/51 modules load) — the breaks are behavioral, not crashes. **None of this is deployed**, so production is unaffected.
- **One committed bug in production:** the admin diagnostics Console SQL runner crashes (`pool` not imported).
- **One structural risk:** the repo has **no migration/schema files** — schema exists only in the live database.

---

## 1. Production — HEALTHY ✅

HTTP probes (2026-07-17):

| Endpoint | Status | Latency |
|---|---|---|
| `https://wagesociety.com/health` | 200 | 0.59s |
| `https://wagesociety.com/` | 200 | 0.89s |
| `https://wagesociety.com/login` | 200 | 0.50s |
| `https://wagesociety.com/creators` | 200 | 0.50s |
| `https://wagesociety.com/play` | 200 | 0.46s |
| `https://wagesociety.com/api/homepage-stats` | 200 | 0.51s |
| `https://wage-society.polsia.app/health` | 200 | 0.62s |

Homepage renders real content ("WE ALL GOTTA EAT.", full nav, membership tiers). No errors/stack traces.

**Live platform stats** (`/api/homepage-stats`, DB-backed → confirms Neon is reachable in prod):
- `creators_joined`: **9**
- `community_members` (online now): **1**
- `total_earned_cents`: 0 · `products_launched`: 0 · `live_streams_today`: 0

> Note: production runs the **last committed code** (`db30579`), which still contains the working `/play` route. That is why `/play` returns 200 in prod despite being broken in the local tree (see §2).

---

## 2. WageWorld refactor — BROKEN in the local working tree 🔴 (uncommitted, NOT deployed)

The in-progress WageWorld work has four wiring regressions. The module graph still loads (smoke test: **51 ok, 0 failed**), so the app boots — but the game's entry points and integrations are dead.

| # | Issue | Evidence | Effect |
|---|---|---|---|
| 2.1 | **`/play` route handler deleted** — replaced by a dangling comment | `routes/pages.js:992-993`: `// GET /play …` immediately followed by `module.exports = router;` | `/play` falls through to the `/:username` catch-all → renders `profile-not-found` (404). The homepage portal fly-through lands on a dead page. |
| 2.2 | **`/wageworld` route removed** | Still listed in the `RESERVED` array (`routes/pages.js:972`) → returns hard 404 | Client redirect `window.location.href = '/login?next=/wageworld'` (`public/js/wageworld.js:2129`) 404s after login. |
| 2.3 | **Rewards API not mounted** | `routes/api/wageworld-rewards.js` (untracked) defines `/balance` + `/claim`, but nothing in `server.js` mounts it at `/api/wageworld/rewards` | Client calls `fetch('/api/wageworld/rewards/balance')` / `…/claim` (`public/js/wageworld.js:1304,1341`) → 404. Token pickups don't persist to the point ledger. |
| 2.4 | **Live WebSocket server removed** | `server.js` diff dropped `initWageWorldLive(httpServer)`; `lib/wageworld-live.js` still exists but is never started | Client opens `ws://…/wageworld-live` (`public/js/wageworld.js:1717`) → connection fails. Multiplayer/presence dead. |

**To restore WageWorld**, the refactor needs: a real `/play` (and `/wageworld`) page handler, `app.use('/api/wageworld/rewards', require('./routes/api/wageworld-rewards'))`, and either re-adding `initWageWorldLive` or removing the client WS code. Also removed in this tree: the `/vendor/lil-gui` static mount (`server.js`) — verify no client code still requests it (grep shows none currently, but `lil-gui` remains a dependency).

---

## 3. Committed bug in production 🟠

**`routes/admin/diagnostics.js:231` — `pool` is not imported.**
The read-only SQL runner (`POST /api/admin/diagnostics/api/query`, the Console tab) calls `pool.connect()`, but the file never does `const { pool } = require('../../db/index')`. → `ReferenceError: pool is not defined` on every query.

- **Blast radius:** only the Console SQL query tab. The rest of `/admin/diagnostics` (System Stats, Audit Log, Changelog, log viewer, system-info, quick-queries) delegates to `db/diagnostics.js` (which imports its own pool) and works.
- **Fix:** add the `pool` import at the top of the file.

---

## 4. Database & migrations — STRUCTURAL RISK 🟠

- **The repo contains no migration or schema files.** No `migrations/` directory, no `*.sql` (outside `node_modules`), no `schema.sql`. Both `README.md` and `CLAUDE.md` claim DDL lives in `migrations/` — it does not.
- `migrate.js` only creates `_migrations` and a legacy `users` table inline, then `runFolderMigrations()` silently no-ops because the folder is absent (`migrate.js:54`: `if (!fs.existsSync(migrationsDir)) return;`).
- **Consequence:** the ~40 tables the app relies on (`auth_users`, `member_profiles`, `membership_tiers`, `discord_*`, `point_transactions`, …) exist **only in the live Neon database**. A deploy to a fresh/empty DB would create essentially nothing and the app would break. This is a disaster-recovery / new-environment reproducibility gap.
- Minor: the inline `users` table in `migrate.js` is legacy — real auth is `auth_users`.

**Recommendation:** dump the live Neon schema (`pg_dump --schema-only`) into a committed `migrations/0000_baseline.sql` (or `db/schema.sql`) so the database is reproducible and future changes are tracked as ordered migrations.

---

## 5. Discord bot & background jobs

Could not verify **live** bot status — `DISCORD_BOT_TOKEN` / `DISCORD_GUILD_ID` are empty locally. Code + wiring are intact:

- Bot modules present and load cleanly: `bot/discord-bot.js`, `bot/periodic-sync.js`, `bot/rate-limiter.js`, `bot/periodic-sync-trigger.js`, `jobs/discord-role-sync.js`, `lib/start-bot.js`, `lib/ensure-discord-roles.js`, `lib/discord-sync.js`.
- Cron schedule (`polsia.toml`): guild sync `*/30 * * * *`, role sync `*/15 * * * *`.
- `server.js` skips role management gracefully when the token/guild aren't set.

**To verify the live bot:** use `/admin/discord` (4-tab control center) or the `/api/discord/*` stats endpoints on production, where the token is present.

---

## 6. Integrations not verifiable locally (placeholder creds)

All confirmed empty in local `.env` — status must be checked on production:

- **Neon Postgres** — indirectly confirmed alive via `/api/homepage-stats`.
- **Stripe** — hosted payment links; no local keys.
- **R2 (avatars)** — falls back to base64 when unconfigured.
- **Zoho SMTP** — smoke test warned: `No ZOHO_SMTP credentials — magic link emails will NOT be sent`. Confirm this is actually configured in Render, or password reset / magic-link login is silently broken.

---

## 7. Housekeeping / drift 🟡

- **Dead code:** `routes/admin/debug.js` (the full older diagnostic panel with Discord/Stripe/email/OAuth checks) is no longer mounted — `server.js` redirects `/admin/debug → /admin/diagnostics`. Either delete it or salvage its extra checks into the new panel.
- **Docs drift:** `CLAUDE.md` route map omits ~12 mounted routers (`public-profile`, `account`, `points-buy`, `search`, `checkout`, `stats`, `trial`, `subscriptions`, `referrals`, `admin/diagnostics`, …) and still references the removed `migrations/` and `/admin/debug`. `README.md` likewise references `migrations/`.
- `reports/wageworld-black-debug.png` suggests a prior "black screen" WageWorld debugging session — consistent with the in-flight refactor.

---

## Prioritized next actions

1. **(prod bug)** Fix `pool` import in `routes/admin/diagnostics.js` so the admin SQL Console works.
2. **(DR risk)** Commit a baseline schema dump from Neon; reinstate a real migrations flow.
3. **(feature)** Finish or revert the WageWorld wiring (§2) before committing/deploying that tree — currently it ships a dead `/play`, `/wageworld`, rewards API, and live socket.
4. **(verify on prod)** Confirm Discord bot is online (`/admin/discord`) and Zoho SMTP is configured (magic-link/password-reset depend on it).
5. **(hygiene)** Refresh `CLAUDE.md` / `README.md`; remove or fold in `routes/admin/debug.js`.

---
*Generated by an automated code + live-endpoint audit. Live DB/bot/Stripe/SMTP internals require the production `/admin/diagnostics` and `/admin/discord` panels (production secrets are not present in this local checkout).*
