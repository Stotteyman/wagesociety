# Polsia Task Readiness — Secrets Fix + Discord Bot Full Update

Updated: 2026-06-21

## Purpose

This document prepares the repository for the Polsia task named `Secrets Fix + Discord Bot Full Update`.

Target repo: `Stotteyman/wagesociety2.0` only.

Do not scan or modify unrelated repositories.

## Required First Step

Before coding, the agent must scan the repo and build to match the repository documentation.

Read in this order:

1. `README.md`
2. `docs/AGENT_NOTES.md`
3. `docs/discord-bot-setup.md`
4. `docs/discord-admin-control-center.md`
5. `docs/discord-multi-server-architecture.md`
6. `docs/discord-database-and-api-contract.md`
7. `docs/discord-implementation-checklist.md`
8. Existing code comments and TODO/FIXME references related to Discord
9. Bot and Discord files under `bot/`, `lib/`, `db/`, `routes/`, `views/`, and `public/js/`

## Secrets Rule

Secrets must be stored in Neon DB only and read at runtime.

Never commit real secrets into:

- `.env`
- markdown docs
- migration seed files
- JavaScript files
- EJS files
- logs
- reports
- tests
- screenshots

Do not include real secret values in GitHub commits, Polsia docs, product docs, tech notes, or admin UI output.

## Required Secret Tables

### `discord_credentials`

Stores Discord bot credential values.

Suggested columns:

```sql
key varchar primary key,
value text not null,
updated_at timestamptz not null default now()
```

Minimum key:

- `bot_token`

Optional future keys:

- `public_key`
- `webhook_secret`

### `oauth_credentials`

Stores OAuth provider credentials.

Suggested columns:

```sql
provider varchar primary key,
client_id text not null,
client_secret text not null,
updated_at timestamptz not null default now()
```

Minimum provider for this task:

- `google`

## Runtime Behavior

### Discord Bot Token

- Bot startup must fetch Discord bot token from Neon.
- If DB token is missing, startup should fail safely with a clear error.
- Do not fall back to a committed token.
- A temporary env fallback may be acceptable only for local development if no real secret is committed and the code clearly documents the fallback.

### Google OAuth Credentials

- Google OAuth client ID and client secret must be fetched from Neon at runtime.
- If credentials are missing, Google login should be disabled with a safe operational error.
- Do not leak credential values in logs or responses.

## Hardcoded Secret Removal

The agent must scan the entire repo for:

- Discord bot tokens
- Google OAuth client secrets
- OAuth client IDs if sensitive by context
- API keys
- database URLs
- session secrets
- webhook secrets
- private credentials in docs, logs, reports, or comments

If any are found:

1. Remove the secret from the committed file.
2. Replace with a placeholder like `<stored-in-neon>`.
3. Add runtime DB lookup.
4. Verify the secret value no longer appears anywhere in the repo.

## Discord Bot Functional Audit

After secrets are fixed, audit and repair the Discord bot against the current docs.

Required areas:

- Bot startup
- Discord gateway connection
- Official WAGE Society guild connection
- Connected outside guild tracking
- Member join handling
- Auto role on join
- WAGE tier-to-role mapping
- Role sync
- Member sync where allowed
- Channel/category sync
- Channel CRUD via bot
- Permission overwrite management
- Admin `/admin/discord` real metrics
- Other Servers tab
- Logs tab
- Troubleshooting buttons
- Safe errors and audit logging

## Documentation Update Requirement

Every task run must update project documentation after changes.

Required docs/resources to update:

- Polsia `tech_notes`
- Polsia `product_overview`
- Relevant repo markdown docs under `docs/`
- Any changed setup instructions in `README.md` if needed

Each update must state:

- What was found during scan
- What was changed
- What now works
- What is still pending
- Any migration/env/runtime steps required

## Verification Checklist

- [ ] Only `Stotteyman/wagesociety2.0` was scanned/modified.
- [ ] No unrelated repo was scanned or modified.
- [ ] No real secrets appear in any committed file.
- [ ] Discord token is read from Neon at startup.
- [ ] Google OAuth credentials are read from Neon at runtime.
- [ ] Bot starts successfully with DB credentials.
- [ ] Official server sync works.
- [ ] Connected server tracking works.
- [ ] Member role assignment works.
- [ ] Channel/category CRUD works through bot and admin UI.
- [ ] Permission management works safely.
- [ ] Admin metrics are real.
- [ ] Logs and audit actions work.
- [ ] Polsia `tech_notes` updated.
- [ ] Polsia `product_overview` updated.
- [ ] Repo docs updated.

## Security Note

If any real Discord token or Google OAuth secret has been exposed in a task description, chat, screenshot, markdown file, log, or any other location outside the protected secrets table, rotate that credential after the DB-backed implementation is complete.
