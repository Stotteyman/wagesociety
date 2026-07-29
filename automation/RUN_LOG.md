# Auto-build run log — wagesociety.com

Newest entries at the top. One block per run, written by the agent itself.

```
## <YYYY-MM-DD HH:MM> — <one-line outcome>
- Item: <backlog item taken>
- Result: shipped | partial | blocked | queue-empty
- Branch: auto/<...> (pushed | local only)
- Verify gate: passed (<which checks>) | skipped (doc only) | FAILED (<error>)
- Commit: <sha or "none">
- Notes: <anything Gary needs to know>
```

---

## 2026-07-29 14:30 — CLAUDE.md rewritten against source; it was describing a retired stack

- Item: W1 — Make `CLAUDE.md` true again
- Result: shipped
- Branch: `auto/2026-07-29-claude-md-truth` (see push note below)
- Verify gate: skipped (doc only) — no `.js`/`.ts`/`.ejs`/route/`src/` file was touched,
  so no gate rule in §5 applied. Only `CLAUDE.md` and `automation/*` changed.
- Commit: `8698ae4` (CLAUDE.md) + a second commit for `automation/`
- Notes:

  **The item's own premises were wrong, and the drift is worse than W1 described.**

  1. `db/index.js` does **not** set `search_path` to `wage, public`. It is a plain `pg`
     Pool over `DATABASE_URL` with no schema handling at all (`db/index.js:9-12`). That
     claim should not be carried into any other item.
  2. The Supabase schema is **`wagesociety`**, not `wage` — `netlify/functions/_auth.js:5`
     (`SUPABASE_SCHEMA || 'wagesociety'`), and the browser reads `public.wagesociety_*`
     views. **This matters for W2**, which is written around a "~58-table `wage` schema"
     and a `wage-schema.sql`. Please re-check that item's wording before it gets picked up;
     as written the next run will probably block on the missing file anyway.
  3. The big one: `docs/AGENT_NOTES.md` (rewritten 2026-07-28, and the most current doc in
     the repo) states the **entire Express tree is dead code** — not deployed, Neon
     unreachable. The live app is the Vite + React SPA in `src/` on Netlify Functions +
     Supabase. `CLAUDE.md` described only the Express app, so it was not merely stale on
     details, it was pointed at the wrong application. The rewrite leads with the SPA and
     keeps the Express router map clearly marked as legacy-for-recognition, which still
     satisfies the item's "every mounted router present in the map".

  **Also corrected in the doc:** `package.json` has no `build` and no `migrate` script
  (only `start`, `dev`, `dev:web`, `build:web`, `preview`, `typecheck`), so both
  `CLAUDE.md` and `README.md` were wrong to say migrations run on deploy via
  `npm run build`. Nothing runs DDL on deploy at all.

  **Footguns found and written into `CLAUDE.md`:**
  - `views/pages/404.ejs` does not exist, but `routes/pages.js:974` renders `pages/404`
    for every `RESERVED` path — that guard throws rather than 404s. Logged as **P7**.
  - `routes/pages.js:992` is a dangling `// GET /play` comment with no handler, so
    `DIAGNOSTIC_2026-07-17.md` §2.1 is still true and is now committed, not just local.
  - `db/index.js` throws at require-time without `DATABASE_URL`, which is why a
    require-smoke test over the legacy tree cannot run in this environment without env.

  **Appended to `## Proposed`:** P6 (`README.md` has the identical Neon/`migrations/`/
  `npm run build` drift), P7 (missing `404.ejs`), P8 (decide whether to delete the legacy
  Express tree outright — it is ~half the repo, it is the cause of every stale-doc item so
  far, and deleting it would make W4/W5 mostly moot). No secrets were read; `.env*`,
  `.netlify/` and `supabase/.temp/` were left untouched, so the Supabase project ref in
  `CLAUDE.md` is cited from `docs/AGENT_NOTES.md` rather than from linked-project state.

## 2026-07-29 — automation installed, not yet run

- Item: none — setup only
- Result: n/a
- Branch: n/a (installed directly, nothing committed)
- Verify gate: n/a
- Commit: none
- Notes: Hourly agent installed by Claude on Gary's request, mirroring the FuriousPvP
  setup. Policy is **branch-only**: every run works on `auto/<date>-<slug>` and pushes
  that branch; `main` and the working branch are never touched. Queue seeded W1–W6 from
  the 2026-07-10 audit report and `reports/DIAGNOSTIC_2026-07-17.md`. Repo was on branch
  `crest-brand-rebuild`, clean tree, 13 commits ahead of `origin/crest-brand-rebuild` and
  27 ahead of `origin/main` at install time.
