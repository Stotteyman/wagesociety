import fs from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()
const envLocalPath = path.join(cwd, '.env.local')

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  const values = {}

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    values[key] = value
  }

  return values
}

const fileEnv = parseEnvFile(envLocalPath)
const getValue = (key) => process.env[key] || fileEnv[key] || ''

const requiredServer = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
const requiredBrowser = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']

const missingServer = requiredServer.filter((key) => !getValue(key))
const missingBrowser = requiredBrowser.filter((key) => !getValue(key))

if (!missingServer.length && !missingBrowser.length) {
  console.log('Environment check passed: Supabase server and browser keys are configured.')
  process.exit(0)
}

console.error('Environment check failed.')
if (missingServer.length) {
  console.error(`Missing server keys: ${missingServer.join(', ')}`)
}
if (missingBrowser.length) {
  console.error(`Missing browser keys: ${missingBrowser.join(', ')}`)
}

console.error('Set missing values in .env.local or your deployment environment variables.')
process.exit(1)
