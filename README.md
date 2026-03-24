# wagesociety2.0

Minimal instructions to build and deploy this Vite + React + TanStack project.

Prereqs
- Node.js (>=18 recommended) and npm installed
- GitHub account and Git installed locally

Local
1. Install deps: `npm install`
2. Dev server: `npm run dev` (localhost:3000)
3. Build: `npm run build` (outputs to `dist/` and `.netlify/v1/functions/server.mjs`)

CI / GitHub
- A sample GitHub Actions workflow is included to run `npm ci` and `npm run build` on pushes and PRs.

Netlify
1. Create a new site from Git -> select the repo
2. Build command: `npm run build`
3. Publish directory: `dist/client`
4. Functions directory: Leave default; this repo writes Netlify serverless entry to `.netlify/v1/functions` during build.
