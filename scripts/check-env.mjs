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

const serverUrlKeys = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']
const browserUrlKeys = ['VITE_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']
const browserPublishableKeys = [
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
]

const hasAny = (keys) => keys.some((key) => Boolean(getValue(key)))

const hasServerUrl = hasAny(serverUrlKeys)
const hasBrowserUrl = hasAny(browserUrlKeys)
const hasBrowserPublishable = hasAny(browserPublishableKeys)
const hasServiceRole = Boolean(getValue('SUPABASE_SERVICE_ROLE_KEY'))

if (hasServerUrl && hasBrowserUrl && hasBrowserPublishable) {
  console.log('Environment check passed: Supabase URL and browser publishable key are configured.')
  if (!hasServiceRole) {
    console.warn(
      'Warning: SUPABASE_SERVICE_ROLE_KEY is missing. Public/auth flows work, but privileged admin DB operations will be limited.',
    )
  }
  process.exit(0)
}

console.error('Environment check failed.')
if (!hasServerUrl) {
  console.error(`Missing Supabase URL. Set one of: ${serverUrlKeys.join(', ')}`)
}
if (!hasBrowserUrl) {
  console.error(`Missing browser Supabase URL. Set one of: ${browserUrlKeys.join(', ')}`)
}
if (!hasBrowserPublishable) {
  console.error(`Missing browser publishable key. Set one of: ${browserPublishableKeys.join(', ')}`)
}

console.error('Set missing values in .env.local (localhost) or in your deployment environment variables (production).')
process.exit(1)
