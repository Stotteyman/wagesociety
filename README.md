# wagesociety2.0

Minimal instructions to build and deploy this Vite + React + TanStack project.

Prereqs
- Node.js (>=18 recommended) and npm installed
- GitHub account and Git installed locally

Local
1. Install deps: `npm install`
2. Validate env vars: `npm run check:env`
3. Dev server: `npm run dev` (runs a strict startup env check first)
4. Local online-like dev: `npm run dev:local` (skips Netlify extension lookup and keeps full Supabase-backed auth/app flows)
4. Build: `npm run build` (runs the same strict env check first and outputs to `dist/` and `.netlify/v1/functions/server.mjs`)
5. Security regression tests: `npm run test:security`

Example `.env.local` for real account login in local mode
```
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

Supabase Auth URL settings for local OAuth
- Site URL: `http://localhost:3000`
- Additional Redirect URLs: `http://localhost:3000/auth/callback`

Required Env Vars
- URL (required):
	- `SUPABASE_URL` or `VITE_SUPABASE_URL` (either works)
- Browser key (required for client auth/session):
	- `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY`
	- server-side fallbacks also support: `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Admin key (required for full privileged admin DB operations):
	- `SUPABASE_SERVICE_ROLE_KEY`

Notes
- Do not use anon/publishable keys for `SUPABASE_SERVICE_ROLE_KEY`.
- `npm run dev` and `npm run build` fail fast if `SUPABASE_SERVICE_ROLE_KEY` is missing.
- If `SUPABASE_SERVICE_ROLE_KEY` is missing, public/auth flows still work, but privileged admin operations are limited in non-strict checks.

CI / GitHub
- A sample GitHub Actions workflow is included to run `npm ci` and `npm run build` on pushes and PRs.

Netlify
1. Create a new site from Git -> select the repo
2. Build command: `npm run build`
3. Publish directory: `dist/client`
4. Functions directory: Leave default; this repo writes Netlify serverless entry to `.netlify/v1/functions` during build.
