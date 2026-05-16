import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

const repoRoot = process.cwd()

const targetFiles = [
  'src/lib/orgAuth.ts',
  'src/lib/supabaseBrowser.ts',
  'src/lib/routeAuth.ts',
  'src/components/AuthPage.tsx',
  'src/components/SiteHeader.tsx',
  'src/routes/__root.tsx',
  'src/routes/index.tsx',
  'src/routes/dashboard.tsx',
  'src/routes/settings.tsx',
  'src/routes/directory.tsx',
  'src/routes/$username.tsx',
  'src/routes/admin.users.tsx',
  'src/routes/api/admin/apk-release.ts',
  'src/routes/api/live/streams.ts',
  'src/routes/api/merch-studio/earnings.ts',
  'src/routes/api/merch-studio/submissions.ts',
  'src/routes/api/merch-studio/upload.ts',
  'src/routes/api/news.ts',
  'src/routes/api/news-upload.ts',
  'src/routes/api/profile-photo-upload.ts',
]

const forbiddenPatterns = [
  /x-local-root-session/i,
  /localhost-bypass/i,
  /root-superadmin@localhost/i,
  /ALLOW_LOCALHOST_SUPERADMIN/i,
  /isLocalRootSessionActive/i,
  /getLocalRootUser/i,
  /startLocalRootSession/i,
  /endLocalRootSession/i,
]

test('privileged source files do not contain local bypass strings', async () => {
  for (const relativePath of targetFiles) {
    const absolutePath = path.join(repoRoot, relativePath)
    const content = await readFile(absolutePath, 'utf8')

    for (const pattern of forbiddenPatterns) {
      assert.equal(
        pattern.test(content),
        false,
        `${relativePath} still contains forbidden bypass pattern ${pattern}`,
      )
    }
  }
})
