# Automation backlog — work queue for the hourly agent (wagesociety.com)

This file is the **only** source of work for the unattended agent
(`automation/run-agent.ps1`, hourly). Edit it freely — it's just markdown.

**Rules the agent follows:**

- It takes the **topmost item under `## Queue`** that is not marked `[blocked]`.
- **One item per run.** No chaining.
- Every run happens on its own `auto/<date>-<slug>` branch. Nothing ever lands on
  `main` or on your working branch — you merge, or you don't.
- Empty queue = it does nothing and logs "queue empty". That's the off switch:
  clear the queue and the automation goes quiet without you disabling anything.
- Finished items move to `## Done` with a date, SHA and branch name.
- The agent may only append to `## Proposed`, never to `## Queue`.

**Writing good items:** one item = roughly one focused hour. Say what "done" looks like.
If it needs a human (a secret, a deploy, a design call, a live DB change), say so in the
item — the agent will mark it `[blocked]` rather than guess.

---

## Queue

<!-- Topmost item is taken first. Add new work at the bottom, or move it up to prioritise. -->

- [ ] **W2 — Commit the canonical database schema.** Per the 2026-07-10 audit §3/§9 and
  `DIAGNOSTIC_2026-07-17.md` §4, the ~58-table `wage` schema exists **only in the live
  Supabase database**. There is no `migrations/` folder and `migrate.js`'s
  `runFolderMigrations()` silently no-ops when it's absent, so a deploy against a fresh
  database creates almost nothing. The reconstructed DDL already exists as
  `wage-schema.sql` in Gary's Claude project — **if it is not present in the repo working
  directory, mark this `[blocked] — needs wage-schema.sql dropped into the repo` and stop;
  do not reconstruct it by hand and do not read the schema out of the live database.**
  Done = the DDL committed as `migrations/0000_baseline.sql`, `migrate.js` confirmed to
  pick the folder up (read the code — **do not execute the migration**), and `README.md` +
  `CLAUDE.md` updated to say where the schema now lives. File-only. **Never run DDL
  against Supabase.**

- [ ] **W3 — Fix the admin SQL console crash.** `DIAGNOSTIC_2026-07-17.md` §3 reports
  `routes/admin/diagnostics.js` calling `pool.connect()` without ever importing `pool`, so
  `POST /api/admin/diagnostics/api/query` throws `ReferenceError` on every query while the
  rest of the panel works. **Verify it is still true before changing anything** — the
  report is from 17 July and this branch has moved a long way since. If already fixed, say
  so in `RUN_LOG.md`, move the item to `## Done` as "already fixed", and stop. If real, the
  fix is the missing `require('../../db/index')` import plus a require-smoke test on the
  file. Also check its sibling `routes/admin/debug.js` for the same pattern.

- [ ] **W4 — Finish the Polsia eviction, part 1: dead config files.** The July audit §4
  claimed "zero polsia/neon/blaxel references remain", but that was the
  `migrate-supabase-netlify` branch and it never reached this one: `polsia.toml`,
  `render.yaml` and `FOR_POLSIA.md` are still in the repo root, and `git grep -il polsia`
  currently hits ~22 files. This item is the safe half only: delete the three dead config
  files at the root, and confirm nothing references them (`git grep -n "polsia.toml"`,
  `"render.yaml"`, and check `netlify.toml` + `package.json` scripts). The cron schedules
  documented in `polsia.toml` (guild sync `*/30`, role sync `*/15`) must be preserved
  somewhere before deletion — if there is no `.github/workflows/crons.yml` or Netlify
  scheduled function carrying them, **write the schedules into `docs/` in the same commit**
  so the knowledge isn't lost. Done = files gone, nothing broken, schedules recorded.

- [ ] **W5 — Finish the Polsia eviction, part 2: code and env vars.** The remaining
  ~19 source files that mention polsia — `server.js`, `bot/periodic-sync.js`,
  `jobs/discord-role-sync.js`, `lib/stripe-config.js`, `lib/stripe-sync.js`,
  `lib/upload-r2.js`, `db/referrals.js`, `routes/api/{donate,points-buy,webhooks}.js`,
  `routes/admin/debug.js`, `routes/pages.js`, `netlify/functions/*`, and the views. Per
  audit §4 the intended renames are `POLSIA_IN_PROCESS_CRONS_ENABLED` →
  `ENABLE_IN_PROCESS_CRONS`, `POLSIA_*` Stripe/R2 vars → `STRIPE_*` / `R2_*`, and the
  hard-coded `wage-society.polsia.app` host check → an optional `LEGACY_HOST` env var.
  **Read every var name from `process.env` in code — never from `.env`.** Support the old
  name as a fallback (`process.env.NEW ?? process.env.OLD`) so nothing breaks before Gary
  renames them in Netlify, and list every renamed variable in `RUN_LOG.md` so he knows
  what to change. If this is more than one run, do it file-group by file-group and rewrite
  the queue entry with what's left. Verify gate: require-smoke every file you touch.

- [ ] **W6 — Write up the `users` vs `auth_users` split-brain — findings only, no fix.**
  Audit §6.B: there are two user tables, `auth_users` (UUID, primary) and a legacy `users`
  (integer id) created inline by `migrate.js`. `discord_links.user_id` is an integer FK to
  `users`, but `jobs/discord-role-sync.js` joins it against `auth_users.id`, a UUID — a
  type mismatch that fails at runtime. Trace every reader and writer of both tables and of
  `discord_links.user_id` with file:line evidence, and write
  `docs/USER_TABLE_SPLIT_BRAIN.md`: what each table holds, who reads which, exactly where
  the mismatch bites, and two or three concrete unification options with their migration
  cost. **This needs Gary's decision — do not change a schema or a query.** Doc-only.

---

## Proposed (needs Gary's OK)

<!-- The agent may append here. Nothing in this section is ever worked on until you move it
     into ## Queue yourself. -->

Seeded 2026-07-29 from `WAGE Society Audit and Migration Report.md` (2026-07-10) and
`reports/DIAGNOSTIC_2026-07-17.md`, cross-checked against the current
`crest-brand-rebuild` branch.

- [ ] **P1 — WageWorld wiring: finish or revert.** `DIAGNOSTIC_2026-07-17.md` §2 lists four
  regressions — deleted `/play` handler, removed `/wageworld` route still in `RESERVED`,
  unmounted `routes/api/wageworld-rewards.js`, and `initWageWorldLive(httpServer)` dropped
  from `server.js` while the client still opens `ws://…/wageworld-live`. Those were
  uncommitted in July; commit `9a6e1ec` ("Save the in-progress WageWorld and Express work
  found in the working tree") suggests they are now committed. **Needs Gary's call: finish
  it or revert it** — and the answer changes the item completely, so it isn't queue-ready.

- [ ] **P2 — Decide where the Discord bot lives.** Audit §6.A, the one architectural
  question still open: Netlify cannot hold a persistent discord.js gateway connection or a
  WebSocket server, so the bot needs a separate always-on host (Railway, Fly.io, a Render
  worker, a small VPS). Gary picks the host; the agent can then split the bot into its own
  deployable and write the config. Blocked on a human decision and a hosting account.

- [ ] **P3 — Set real membership prices.** Audit §6.D: `wage.membership_tiers` /
  `membership_plans` are seeded at 0 because prices were Stripe/admin-managed. This is a
  live-DB and pricing decision — human-only. Listed here so it isn't forgotten.

- [ ] **P4 — Retire or fold in `routes/admin/debug.js`.** `DIAGNOSTIC_2026-07-17.md` §7:
  the old diagnostic panel is no longer mounted (`server.js` redirects `/admin/debug` →
  `/admin/diagnostics`) but its extra Discord/Stripe/email/OAuth checks may be worth
  salvaging into the new panel before deleting it. Cheap and safe; promote whenever.

- [ ] **P5 — Flag the RLS gap to whoever owns those tables.** Audit §6.E: Supabase reports
  Row-Level Security **off** on four `public` tables — `org_blog_posts`,
  `org_collab_requests`, `org_collab_applications`, `org_dashboard_tool_entries` — so
  anyone with the anon key can read and write them. They belong to a different business in
  the shared Supabase project, not to WAGE. **Not agent work — a message Gary needs to
  send.** Kept here as a standing reminder.

- [ ] **P6 — `README.md` is stale in exactly the way `CLAUDE.md` was.** Found while doing W1.
  It still says "Express.js + EJS + PostgreSQL (Neon) + bcrypt custom auth", "Database: Neon
  Postgres via `pg` Pool", lists `migrations/` as "All DDL as timestamped `.sql` files", and
  ends with "Render auto-runs `npm run build` (→ `npm run migrate`) on deploy" — there is no
  `build` script and no `migrate` script in `package.json`, and the app deploys to Netlify.
  It is the file a new contributor reads before `CLAUDE.md`. Same treatment: rewrite against
  source, point at `docs/AGENT_NOTES.md`. Doc-only, no verify gate.

- [ ] **P7 — `views/pages/404.ejs` does not exist but is rendered.** `routes/pages.js:974`
  does `res.status(404).render('pages/404', {})` for every path in the `RESERVED` array, and
  there is no `404.ejs` in `views/pages/` — so the guard throws instead of rendering. Legacy
  Express tree, so this is only worth doing if that tree is ever revived rather than deleted;
  the cheap fix is a `404.ejs`, the honest fix is deleting the dead app. Cross-reference: the
  same tree also has the dangling `/play` comment at `routes/pages.js:992`.

- [ ] **P8 — Decide whether to delete the legacy Express tree outright.** `docs/AGENT_NOTES.md`
  says it is dead code, not deployed, on an unreachable Neon database. It is roughly half the
  repo (`server.js`, `routes/`, `views/`, `db/`, `bot/`, `lib/`, `jobs/`, `middleware/`,
  `migrate.js`) and every stale-doc item so far has been caused by someone describing it as
  live. Deleting it would make W4/W5 (the Polsia eviction) mostly moot, since most of the
  remaining `polsia` hits are inside it. **Gary's call — this is a big irreversible delete**,
  and the Discord bot logic in `bot/` + `lib/` may still be the reference implementation for
  whatever host P2 lands on.

---

## Done

<!-- Newest at the top. Format: - [x] <item> — YYYY-MM-DD — <sha> — auto/<branch> -->

- [x] **W1 — Make `CLAUDE.md` true again.** — 2026-07-29 — `8698ae4` — `auto/2026-07-29-claude-md-truth`
  Rewritten against source. Two of the item's own premises were themselves wrong and are
  corrected in the new doc: `db/index.js` does **not** set any `search_path` (it is a plain
  `pg` Pool on `DATABASE_URL`), and the Supabase schema is **`wagesociety`**, not `wage`
  (`netlify/functions/_auth.js:5`). The bigger finding: per `docs/AGENT_NOTES.md` the whole
  Express tree is retired dead code, so the doc now leads with the Vite/React + Netlify
  Functions + Supabase app and keeps the Express router map only for recognition.
