import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '../../..')
const sourceDir = path.join(repoRoot, 'dist', 'client')
const targetDir = path.resolve(__dirname, '..', 'www')
const fallbackUrl = process.env.MOBILE_APP_FALLBACK_URL || 'https://wagesociety.com'

async function createFallbackIndexHtml() {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WAGE Society</title>
    <meta http-equiv="refresh" content="0;url=${fallbackUrl}" />
  </head>
  <body>
    <p>Redirecting to <a href="${fallbackUrl}">${fallbackUrl}</a>...</p>
  </body>
</html>`
  await fs.writeFile(path.join(targetDir, 'index.html'), html, 'utf8')
}

async function copyBuildOutput() {
  await fs.rm(targetDir, { recursive: true, force: true })
  await fs.mkdir(targetDir, { recursive: true })

  try {
    await fs.access(sourceDir)
    await fs.cp(sourceDir, targetDir, { recursive: true })
  } catch {
    // Dist directory may not exist in some environments; fallback page still allows native build.
  }

  try {
    await fs.access(path.join(targetDir, 'index.html'))
  } catch {
    await createFallbackIndexHtml()
  }

  console.log(`Copied web assets to ${targetDir}`)
}

copyBuildOutput().catch((error) => {
  console.error('Failed to copy web assets:', error)
  process.exit(1)
})