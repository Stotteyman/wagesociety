# Member tool downloads

How `/tools` serves paid software to members, and what has to be true for it to work.

Built 2026-07-28. First tool: **Clip Studio**.

## The shape of it

```
  member clicks Download
        │
        ▼
  GET /api/tool-download?tool=clip-studio     (Supabase JWT attached)
        │
        ├─ no token           → 401 sign_in_required
        ├─ tier < creator     → 403 upgrade_required
        │
        ▼  entitled
  GitHub API: latest release of a PRIVATE repo
        │
        ▼
  302 → release-assets.githubusercontent.com/<signed, expires in minutes>
        │
        ▼
  browser downloads straight from GitHub
```

The build itself lives in the private repo
[`Stotteyman/clip-studio-releases`](https://github.com/Stotteyman/clip-studio-releases)
— releases only, no source. Anonymous requests to the repo *and* to the asset
both 404, so `/api/tool-download` is the only route to a build.

## Why a redirect rather than streaming the file

Builds are ~60 MB and a synchronous Netlify function may only return 6 MB. The
function hands back GitHub's own signed URL and lets the browser fetch it. That
signed link is unauthenticated but short-lived, which is the useful property: it
is not worth pasting into Discord, and a lapsed member simply stops being issued
new ones.

**What this does not do:** stop someone who already downloaded a build from
passing the zip on. Nothing server-side can. Same understood limitation as
`video-playback.js`.

## Entitlement

`creator` and above, from `wagesociety.profiles.tier`, read against the user id
on the **verified** JWT — never anything the client sent. Staff roles
(`staff`/`manager`/`admin`/`superadmin`) get tools regardless of tier.

The ladder is duplicated as a literal in `tool-download.js` because the functions
are CommonJS and `src/lib/plans.ts` is a TS module. If `TIER_ORDER` ever changes,
change it in both.

## Required setup — NOT yet done

The function needs a GitHub token and there is **no `GITHUB_RELEASE_TOKEN` in the
Netlify env yet**, so downloads will return `503 downloads_unavailable` until
there is one. GitHub does not allow creating tokens through its API, so this step
is manual:

1. <https://github.com/settings/personal-access-tokens/new>
2. **Fine-grained** token, resource owner `Stotteyman`
3. Repository access → *Only select repositories* → `clip-studio-releases`
4. Permissions → Repository → **Contents: Read-only**. Nothing else.
5. Expiry: 1 year, and put a reminder somewhere to rotate it.
6. Set it on the site:

```powershell
netlify env:set GITHUB_RELEASE_TOKEN "github_pat_..." --context production
```

Match how every other real secret on this site is stored — plain, not
`envVarIsSecret: true`. That flag has bitten this project before: the var vanished
from `getAllEnvVars` and the function never saw it at runtime. See
[[wagesociety-migration-state]].

Env changes only reach already-deployed functions after a redeploy.

## Publishing a new build

Nothing on the site changes. The function always resolves `releases/latest`, so
cutting a release *is* the deploy:

```powershell
gh release create v0.2.0 ClipStudio-v0.2.0-win-x64.zip `
  --repo Stotteyman/clip-studio-releases --title "Clip Studio v0.2.0" --latest
```

Zip with forward-slash entry names. Windows' own zip writer (and
`ZipFile.CreateFromDirectory` on PowerShell 5.1) writes **backslashes**, which
Explorer tolerates but 7-Zip and macOS do not — they produce one file literally
named `ClipStudio\ClipStudio.exe` instead of a folder.

## Adding a second tool

`TOOLS` in `tool-download.js` is a map. Add an entry with its repo, minimum tier
and an asset matcher; the page's `TOOL` const then needs the copy. Nothing else
is tool-specific.

## Status

- [x] Private repo + v0.1.0 release published
- [x] `netlify/functions/tool-download.js`
- [x] `/tools` page, route, nav entry
- [x] `npm run typecheck` and `vite build` clean
- [ ] `GITHUB_RELEASE_TOKEN` set in Netlify
- [ ] Deployed — production is still deliberately locked, nothing was shipped
