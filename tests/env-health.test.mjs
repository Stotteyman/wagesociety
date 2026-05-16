import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

const repoRoot = process.cwd()
const scriptPath = path.join(repoRoot, 'scripts', 'check-env.mjs')

function runCheckEnv(extraArgs = [], extraEnv = {}) {
  return spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd: repoRoot,
    env: {
      ...process.env,
      SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      ...extraEnv,
    },
    encoding: 'utf8',
  })
}

test('check-env passes without admin key when not strict', () => {
  const result = runCheckEnv()
  assert.equal(result.status, 0)
  assert.match(result.stdout, /Environment check passed/)
})

test('check-env fails fast when admin key is required', () => {
  const result = runCheckEnv(['--require-admin'], {
    SUPABASE_SERVICE_ROLE_KEY: '',
    SUPABASE_SERVICE_KEY: '',
    SUPABASE_SECRET_KEY: '',
    SUPABASE_SERVICE_ROLE: '',
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /Missing service role key/)
})
