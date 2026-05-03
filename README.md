# wagesociety2.0

Minimal instructions to build and deploy this Vite + React + TanStack project.

Prereqs
- Node.js (>=18 recommended) and npm installed
- GitHub account and Git installed locally

Local
1. Install deps: `npm install`
2. Validate env vars: `npm run check:env`
2. Dev server: `npm run dev` (localhost:3000)
3. Build: `npm run build` (outputs to `dist/` and `.netlify/v1/functions/server.mjs`)

Required Env Vars
- Server (required for admin APIs and role/permission functions):
	- `SUPABASE_URL`
	- `SUPABASE_SERVICE_ROLE_KEY`
- Browser (required for client auth/session):
	- `VITE_SUPABASE_URL`
	- `VITE_SUPABASE_PUBLISHABLE_KEY`

Notes
- Do not use anon/publishable keys for `SUPABASE_SERVICE_ROLE_KEY`.
- If `SUPABASE_SERVICE_ROLE_KEY` is missing, admin-backed routes will return explicit configuration errors.

CI / GitHub
- A sample GitHub Actions workflow is included to run `npm ci` and `npm run build` on pushes and PRs.

Netlify
1. Create a new site from Git -> select the repo
2. Build command: `npm run build`
3. Publish directory: `dist/client`
4. Functions directory: Leave default; this repo writes Netlify serverless entry to `.netlify/v1/functions` during build.
