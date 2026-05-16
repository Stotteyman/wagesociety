import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '../../..')
const sourceDir = path.join(repoRoot, 'dist', 'client')
const targetDir = path.resolve(__dirname, '..', 'www')
const fallbackUrl = process.env.MOBILE_APP_FALLBACK_URL || 'https://wagesociety.com'
const blockedMarkers = ['example.supabase.co', 'sb_publishable_test', 'playful-torte-0c9af1.netlify.app']

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

  const assetsDir = path.join(targetDir, 'assets')
  try {
    const assetEntries = await fs.readdir(assetsDir)
    const jsAssets = assetEntries.filter((entry) => entry.endsWith('.js'))

    for (const assetFile of jsAssets) {
      const assetPath = path.join(assetsDir, assetFile)
      const bundledAsset = await fs.readFile(assetPath, 'utf8')
      const marker = blockedMarkers.find((entry) => bundledAsset.includes(entry))
      if (marker) {
        throw new Error(
          `Blocked mobile asset sync: detected placeholder/staging marker "${marker}" in ${assetPath}. Build web assets with real production settings first.`,
        )
      }
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      // If no assets directory exists, the fallback index page is used.
    } else {
      throw error
    }
  }

  console.log(`Copied web assets to ${targetDir}`)
}

copyBuildOutput().catch((error) => {
  console.error('Failed to copy web assets:', error)
  process.exit(1)
})