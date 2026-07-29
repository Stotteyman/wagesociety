# `users` vs `auth_users` — the split-brain, traced

> **Findings only. Nothing in this document has been changed in code.** It exists so the
> unification can be decided rather than guessed at. Every claim below cites `file:line`
> from the working tree on 2026-07-29 (branch `auto/2026-07-29-user-table-split-brain`).
> No database was contacted — see [What this document cannot tell you](#what-this-document-cannot-tell-you).

**Scope note before you read further:** every file discussed here is in the **legacy
Express tree**, which `docs/AGENT_NOTES.md:25-28` says is dead code on an unreachable Neon
database. Nothing described below is running today. It matters for exactly two reasons: if
that tree is ever revived (backlog **P8**), these are live faults on day one; and the
`bot/` + `lib/` Discord logic is the reference implementation for whatever host the bot
lands on (**P2**), so the bugs would be copied forward. See
[Does this affect the live site?](#does-this-affect-the-live-site) for the Netlify/Supabase
side, which is keyed differently and is not affected.

---

## 1. The two tables

### `auth_users` — the real one

Owned by `db/users.js`, which hard-codes `const TABLE = 'auth_users'` (`db/users.js:6`) and
is the only module that reads or writes it. It holds email, `password_hash`, `display_name`,
`role`, `tier`, `referral_code`, `referred_by`, `last_seen_at` and the magic-link/reset
tokens (`db/users.js:24-36`, `:64-84`, `:125-170`).

`req.session.userId` **is `auth_users.id`**, everywhere, without exception. It is assigned
in exactly four places, all from a `db/users.js` row:

| Site | Login path |
|---|---|
| `routes/auth-custom.js:110` | email + password / magic link |
| `routes/auth-discord-login.js:66` | Discord as a sign-in provider |
| `routes/auth-google.js:68` | Google |
| `routes/auth-kick.js:82` | Kick |

Its `id` is a UUID. There is no DDL in the repo (see §5), so the evidence is circumstantial
but consistent: `db/users.js:24-32` inserts without supplying an `id` and every other table
that references a user declares `uuid` in the one schema sketch the repo does contain
(`docs/discord-database-and-api-contract.md:26-27`, `:135-136`), and no code anywhere ever
treats `session.userId` as a number.

### `users` — the legacy one

Created **inline by the migration runner**, not by any migration file
(`migrate.js:27-43`):

```
id SERIAL PRIMARY KEY, email, name, password_hash, created_at, updated_at,
stripe_subscription_id, subscription_status, subscription_plan,
subscription_expires_at, subscription_updated_at
```

`id` is a `SERIAL` — a 4-byte integer. This is the entire definition; there is no `avatar_url`
column, which matters in a moment.

**Every single reference to it in the codebase, exhaustively:**

| Site | Operation |
|---|---|
| `migrate.js:28`, `:42`, `:43` | `CREATE TABLE IF NOT EXISTS` + two indexes |
| `lib/auth.js:18` | `SELECT id FROM users WHERE email = $1` |
| `lib/auth.js:23` | `INSERT INTO users (email, name, avatar_url)` |
| `lib/auth.js:28` | `UPDATE users SET name = …, avatar_url = …` |
| `db/discord.js:18` | `getUserIdByEmail()` — `SELECT id FROM users WHERE email = $1` |
| `db/discord.js:61` | `getUserEmailById()` — `SELECT email FROM users WHERE id = $1` |
| `db/discord.js:68` | `getAllLinkedUsers()` — `JOIN users u ON u.id = dl.user_id` |

That's four files. Nothing else in the repo touches it.

### The fact that makes the rest of this document make sense

**Nothing writes to `users` any more.** The only writer is `lib/auth.js`'s `ensureUser()`,
called only by `onFirstOAuthLogin()` in the same file — and **neither function has a single
caller.** A repo-wide grep for `ensureUser` and `onFirstOAuthLogin` outside `lib/auth.js`
returns nothing; the only thing anyone imports from that module is the `SUPERADMIN_EMAILS`
set (`routes/api/admin-referrals.js:26`, `routes/api/admin-users.js:28`). The login routes
listed above all provision through `db/users.js` into `auth_users` instead.

So `users` holds whatever rows it had when OAuth provisioning moved to `auth_users`, and has
gained none since. **`getUserIdByEmail()` returns `null` for every account created after that
point.** This is why the type mismatch has never been noticed: the integer path bails out
before it ever reaches a comparison (§3.4).

Two corroborating details, both of which say `lib/auth.js` was orphaned rather than retired:
its `INSERT` writes an `avatar_url` column that `migrate.js:28-41` never creates — that
statement cannot succeed against a table built by this repo's own migration runner — and its
header comment still describes it as "Supabase Auth … user provisioning" (`lib/auth.js:1-3`)
while `README.md:8` says Supabase was removed.

---

## 2. `discord_links.user_id` — the column the two halves fight over

`discord_links` is keyed by `user_id` with a unique constraint on it (implied by
`ON CONFLICT (user_id)` at `db/discord.js:40`). Its type is not knowable from this repo, and
the repo's own comments disagree about it:

| Site | Claims |
|---|---|
| `db/discord.js:6` | "the internal `users.id` (integer)" |
| `routes/api/me.js:344-345` | "an integer FK to the legacy `users` table, **NOT** the UUID from auth_users" |
| `routes/api/discord-servers.js:112` | "an integer FK to `users` table, NOT the UUID from auth_users" |
| `routes/api/auth.js:48` | "a separate table with integer user_id from users table" |
| `db/account-deletion.js:54` | "**FK is to `auth_users.id`** via user_id column" |

Four say integer, one says UUID, and there is no DDL to arbitrate. The four are the majority
and are the ones written next to working lookup code, so the rest of this document assumes
**integer** — but see §5, because that assumption is exactly what needs confirming first.

### The two camps

**Camp INT** — resolves an integer via `db/discord.js`, then queries `discord_links`:

- `db/discord.js` — all ten helpers
- `routes/discord.js:254` (link), `:336` (unlink)
- `routes/api/me.js:274`, `:291`, `:347`, `:380`, `:444` — the five Settings endpoints
- `routes/api/discord-servers.js:116`
- `routes/api/auth.js:51`
- `lib/discord-sync.js:173`, `:388` — via `getUserEmailById()`

**Camp UUID** — passes `req.session.userId` or an `auth_users.id` straight in:

- `jobs/discord-role-sync.js:42` — `JOIN auth_users au ON au.id = dl.user_id`
- `jobs/discord-role-sync.js:129`, `:133`, `:180`
- `lib/discord-sync.js:165` — `SELECT role FROM auth_users WHERE id = $1`
- `lib/middleware.js:173-183` — `requireDiscordLinked` reads `req.session.userId`
- `routes/pages.js:615-619`, `:640-645` — the Discord dashboard pages
- `routes/auth-discord.js:82` → `:168` — **writes** `req.session.userId` into the column
- `db/account-deletion.js:55`, `routes/api/admin-users.js:407` — deletes
- Every caller of `syncRoles()` with an `auth_users` id: `routes/api/admin-roles.js:100`,
  `routes/api/admin-users.js:104`, `:286`, `:372`, and `removeDiscordRoles()` at
  `routes/api/webhooks.js:309`

---

## 3. Where the mismatch actually bites

### 3.1 The 15-minute cron dies on its first query

`jobs/discord-role-sync.js:39-48`:

```sql
SELECT dl.user_id, au.role
  FROM discord_links dl
  JOIN auth_users au ON au.id = dl.user_id
```

`auth_users.id` is a UUID; `dl.user_id` is an integer. Postgres has no implicit cast between
them and answers `operator does not exist: uuid = integer`. This is the **first** statement in
`run()`, outside the per-user `try` (which starts at `:58`), so it propagates to the top-level
handler at `:208-211`: log `discord_role_sync_job_crash`, `process.exit(1)`. The job does
nothing, every 15 minutes, and the only trace is one JSON line on stderr.

This is the failure the backlog item describes, and it is real.

### 3.2 `syncRoles()` cannot work with *either* id — and fails silently both ways

`lib/discord-sync.js:130` is the single worst site, because it uses one `userId` parameter as
both types inside one function body:

| Line | Query | Wants |
|---|---|---|
| `:140` | `getDiscordLinkByUserId(userId)` | integer |
| `:165` | `SELECT role FROM auth_users WHERE id = $1` | UUID |
| `:173` | `getUserEmailById(userId)` → `SELECT email FROM users WHERE id = $1` | integer |

Whichever you pass, one half throws — and **both halves swallow the error**:

- **Called with a UUID** (all five admin paths in Camp UUID): `:140` throws, caught at
  `:139-143`, returns `{ synced: false, reason: 'db_error' }`. Callers `.catch()` and log
  (`routes/api/admin-roles.js:100`, `routes/api/admin-users.js:104`). **An admin changes
  someone's role or tier, the UI reports success, and Discord is never touched.**
- **Called with an integer** (`jobs/discord-role-sync.js:82`, `routes/discord.js:341`):
  `:140` succeeds, but `:165` throws into `catch (_) {}` at `:168` — a bare empty catch — so
  `staffRole` keeps its default of `'member'` (`:162`). The function then computes the
  expected role set from that default and syncs the member to match. **Every admin,
  moderator and helper is stripped to the plain member role in Discord, and the log line
  reports a successful sync.**

The second is the more dangerous of the two: it isn't a no-op, it's an incorrect write
against live Discord state, and `syncRoles()` is what runs on every Discord link —
`routes/discord.js:295` calls the `syncDiscordRole()` alias, which is a straight wrapper
(`lib/discord-sync.js:429-431`).

### 3.3 Two writers put two different types in the same column

The two Discord OAuth callbacks both call `upsertDiscordLink()` and disagree about what
`userId` is:

| Path | Source of `userId` | Type |
|---|---|---|
| `routes/discord.js:254` → `:262` | `getUserIdByEmail(req.session.userEmail)` | integer |
| `routes/auth-discord.js:82` → `:168` | `req.session.userId` | UUID |

The column has one type, so one of these two flows cannot insert — it fails with `22P02`
(invalid input syntax for integer) or `42804` (datatype mismatch) at the `INSERT`. Under the
integer assumption it is `routes/auth-discord.js`, the **bot-install** flow, that is broken:
the callback throws after the token exchange has already succeeded, so the user has granted
Discord permissions and gets an error page.

Note that `routes/discord.js:274-276` gets this exactly right for the *other* table it writes
— its comment explains that `req.session.userId` is the `auth_users` UUID "needed by the FK on
`oauth_connections`" — while resolving the integer for `discord_links` twenty lines earlier.
Someone understood the distinction here and it was not carried into `auth-discord.js`.

### 3.4 …and none of it fires, because the integer lookup returns `null` first

Every Camp INT route guards on the lookup:

```js
const intUserId = await getUserIdByEmail(email);
if (!intUserId) return res.json({ linked: false });     // routes/api/me.js:347-348
```

Same shape at `routes/api/me.js:381`, `:445`, `routes/api/discord-servers.js:117`,
`routes/discord.js:255-259`, and `.catch(() => null)` at `routes/api/auth.js:51` and
`routes/api/me.js:274`, `:291`.

Because `users` gets no new rows (§1), that lookup returns `null` for any account created
after provisioning moved to `auth_users`. So the Settings page reports **"Discord not
linked"** to a user whose `discord_links` row exists and is perfectly valid — a wrong answer
delivered as a successful `200`, with no error anywhere. The type mismatch is real, but this
is what most users would actually have hit.

### 3.5 Deletes are aimed at the wrong table's key

`db/account-deletion.js:55` and `routes/api/admin-users.js:407` both delete
`FROM discord_links WHERE user_id = $1` using an `auth_users` UUID
(`db/account-deletion.js:54` states this explicitly as the FK; `admin-users.js:393` takes it
from `SELECT id FROM auth_users`). Under the integer assumption both throw — and
`admin-users.js:399` wraps every cleanup in `try {} catch (_) {}`, so the delete silently
does nothing while the account deletion reports success. **The Discord link, including the
stored `access_token` and `refresh_token`, survives the deletion of the account it belongs
to.** That is the one item on this list with a privacy dimension.

---

## 4. Two adjacent bugs in the same file, found while tracing

Neither is about the table split; both are in the code path above and would surface the
moment §3.1 was fixed. Recording them here so they aren't rediscovered.

1. **`Set.prototype.difference` needs Node 22; this repo pins Node 20.**
   `jobs/discord-role-sync.js:64` calls `expected.difference(actual)`. That method shipped in
   Node 22 (V8 12.2); `.nvmrc` says `20`. On the pinned runtime it is a `TypeError` on the
   first user, caught by the per-user handler at `:99`, so the job would count every user as
   `failed` and exit 1. (It happens to work on this workstation, which is on v24 — a good
   example of why the pin matters.)

2. **`TIER_CUMULATIVE` has no `free` key, and `free` is the default.**
   `jobs/discord-role-sync.js:168` and `lib/discord-sync.js:188` both do
   `TIER_CUMULATIVE[tier] || TIER_CUMULATIVE.free`, but neither map declares `free`
   (`jobs/discord-role-sync.js:161-167`, `lib/discord-sync.js:47-53`) and both initialise
   `tier = 'free'` (`:135` and `:171` respectively), only overwriting it when an active
   membership row exists. For any user without one, `subRoles` is `undefined` and the very
   next line, `for (const rid of subRoles)`, throws. Worth knowing that `'free'` is also the
   slug `lib/auth.js:52` assigns on signup, so it is the common case rather than an edge one.

---

## 5. What this document cannot tell you

**The actual column type of `discord_links.user_id`.** The repo contains no `migrations/`
folder and no schema file — `migrate.js:52-54` silently returns when the folder is absent —
so the only authority is the live database, and this trace was done under a hard rule against
querying it. `docs/CRON_SCHEDULES.md:73` records that a `migrations/1779621747_discord_links.sql`
was once referenced by `FOR_POLSIA.md`; it is not in the repo. This is backlog item **W2**,
and **W2 is the true blocker on all three options below** — every one of them starts with
knowing the current type.

The one-line check, for whoever has a psql session:

```sql
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE column_name = 'user_id'
   AND table_name IN ('discord_links', 'oauth_connections')
ORDER BY table_name;
```

Also unknown without the database: whether `users` still holds rows, and whether any
`discord_links` row survives that a UUID *would* match — i.e. whether
`routes/auth-discord.js:168` ever succeeded, which would mean the column is UUID and the four
comments are the wrong ones.

---

## 6. Does this affect the live site?

**No.** The Netlify + Supabase stack does not share this code path. `netlify/functions/`
contains no reference to a `users` table and never resolves an integer id: the live Discord
resync reads `discord_links` through the Supabase service client and hands `user_id` straight
to a Postgres RPC (`netlify/functions/admin-discord-ops.js:144-147`,
`ws_svc_discord_sync(p_user_id)`), and `netlify/functions/discord-sync-user.js:26-32` takes a
`user_id` from the request body into the same RPC. Both treat it as an opaque key of one type,
which is what a UUID-keyed table looks like from the outside. Identity on that stack is the
Supabase Auth user, and privileged writes go through the service role (`CLAUDE.md`, Database).

So this is a **legacy-tree defect on a database nobody can reach**. Its cost today is only
that the code exists and reads as authoritative. Its cost tomorrow depends entirely on P8.

---

## 7. Three ways out

### Option A — Delete the legacy tree (cost: nothing, if P8 says yes)

Backlog **P8** already asks whether to delete the Express tree outright. If the answer is
yes, this entire document becomes history: `users`, `discord_links`, `lib/discord-sync.js`
and `jobs/discord-role-sync.js` all go with it, and the live stack is unaffected (§6).

- **Migration cost:** zero. No DDL, no data movement.
- **Catch:** `bot/` and `lib/discord-sync.js` are the reference implementation for the
  re-homed bot (**P2**). Delete them only after that host exists, or port the logic first —
  and port it with these bugs fixed, or they come along for the ride.
- **Recommended** if P8 is a yes. It is the only option that costs nothing and it makes the
  other two moot.

### Option B — Unify onto `auth_users`, drop `users` (the right answer if the tree lives)

Make `discord_links.user_id` a UUID FK to `auth_users(id) ON DELETE CASCADE`, then delete the
`users` table and `lib/auth.js` outright.

- **Data migration:** one backfill — `UPDATE discord_links dl SET user_id = au.id FROM users u
  JOIN auth_users au ON lower(au.email) = lower(u.email) WHERE dl.user_id = u.id` — via a new
  UUID column, then swap. Rows whose email has no `auth_users` match cannot be mapped and must
  be reported before anything is dropped.
- **Code changes:** delete `getUserIdByEmail()` and `getUserEmailById()` from `db/discord.js`
  and inline `auth_users` lookups instead; then all nine Camp INT call sites in §2 lose their
  resolve-then-query dance and simply pass `req.session.userId`. Camp UUID needs no change at
  all — including `jobs/discord-role-sync.js:42`, which becomes correct as written.
- **Cost:** roughly a day, mostly the backfill audit. It is the only option that leaves one
  concept of "a user" in the tree.
- **Prerequisite:** W2. Do not write this migration against a schema nobody has read.

### Option C — Keep the integer, add one resolver (cheap, not a fix)

Leave the column alone and route every Camp UUID site through a single
`resolveLegacyUserId(uuidOrEmail)` helper.

- **Code changes:** ~8 sites, no DDL, no data movement — a couple of hours.
- **Why it is worse than it looks:** it does nothing about §1. `users` still gains no rows, so
  the resolver returns `null` for modern accounts and §3.4 persists unless `ensureUser()` is
  also wired back into all four login routes — at which point you are maintaining two user
  tables on purpose, which is the problem this document is about.
- **Only worth it** as a stopgap if the tree must be revived before there is time for B.

---

## 8. If you only do one thing

Confirm the column type (§5). Every option branches on it, three of the five failure modes in
§3 invert if the answer is UUID, and one repo comment (`db/account-deletion.js:54`) already
says it is. That single query is also most of **W2**, which is blocked on the same missing
schema.

---

### Related backlog items

- **W2** — commit the canonical schema. Blocks all three options.
- **P2** — where the Discord bot lives. Decides whether §4's bugs get ported forward.
- **P8** — delete the legacy Express tree. Decides whether any of this needs fixing at all.
