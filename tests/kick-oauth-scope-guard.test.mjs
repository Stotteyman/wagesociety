import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

const repoRoot = process.cwd()

test('kick oauth options do not hardcode or env-override scopes in app code', async () => {
  const filePath = path.join(repoRoot, 'src/lib/supabaseBrowser.ts')
  const content = await readFile(filePath, 'utf8')

  // Scope must be controlled by Supabase provider config, not frontend env or constants.
  assert.equal(
    content.includes('VITE_KICK_OAUTH_SCOPES'),
    false,
    'Do not use VITE_KICK_OAUTH_SCOPES in browser code; keep scope source in Supabase provider config.',
  )

  assert.equal(
    content.includes('options.scopes ='),
    false,
    'Do not set Kick OAuth scopes in browser options; scope must come from Supabase custom provider settings.',
  )
})

test('kick oauth provider candidate list keeps custom provider key first-class', async () => {
  const filePath = path.join(repoRoot, 'src/lib/supabaseBrowser.ts')
  const content = await readFile(filePath, 'utf8')

  assert.match(
    content,
    /return\s*\[\s*'custom:kick'\s*\]/,
    'Kick linking must target the configured custom provider key.',
  )
})
