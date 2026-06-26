# WAGE SOCIETY Drive Index

Updated: 2026-06-25

## Folder structure

- `01 Business Strategy` - company direction, positioning, plans, and business decisions.
- `02 Product & Technology` - product specifications and current technical documentation.
  - `Discord Bot Control Center` - bot product specs, data model, UX, security guidance, backlog, setup, and resource sync audit.
  - `Website Platform` - current repository overview and engineering notes.
  - `WageWorld` - playable 3D world architecture, controls, character creation, and implementation notes.
- `03 Operations & Admin` - operational procedures and project-status records.
  - `Project Status` - dated status reports; historical files are labeled explicitly.
- `04 Security & Compliance` - security, authentication, OAuth, privacy, and compliance material.
  - `Authentication & OAuth` - current and historical authentication documentation.
- `05 Brand & Graphics` - approved visual assets and generated campaign artwork.
  - `Covers & Presentation Art` - landscape covers for presentations and documentation.
  - `Social Media` - square and social-ready artwork.

## Source-of-truth rules

- The GitHub `wagesociety2.0` repository is the source of truth for application code.
- Files prefixed with `Current` describe the active application.
- Files prefixed with `Historical` are retained for context and should not be treated as current implementation guidance.
- New graphics should be named by brand, purpose, orientation, and version when applicable.

## GitHub implementation docs for Discord bot build

The repo now includes the implementation-facing Discord bot resources needed to build the full multi-server control system:

- `docs/discord-bot-setup.md` - complete setup and implementation reference.
- `docs/discord-admin-control-center.md` - `/admin/discord` product and implementation spec.
- `docs/discord-multi-server-architecture.md` - official server, connected servers, members, role sync, bot worker, and website integration architecture.
- `docs/discord-database-and-api-contract.md` - database table plan, API response contracts, mutation rules, audit logging, and safety rules.
- `docs/discord-implementation-checklist.md` - phase-by-phase build checklist for database, bot worker, API, UI, member linking, testing, and optional Three.js visualization.
- `docs/AGENT_NOTES.md` - active project stack and mandatory builder guidance.
- `README.md` - top-level project summary and Discord control center scope.

## GitHub implementation docs for WageWorld

- `docs/wageworld-technical-breakdown.md` - playable 3D village architecture, controls, settings, character creation, verification, and next steps.
