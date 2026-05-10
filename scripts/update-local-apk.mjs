import fs from 'node:fs/promises'
import path from 'node:path'

const repoRoot = process.cwd()
const inputArg = process.argv[2]
const versionArg = process.argv[3]
const notesArg = process.argv[4]

const defaultApkPath = path.join(
  repoRoot,
  'mobile',
  'android-app',
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk',
)

const sourceApkPath = inputArg
  ? path.resolve(repoRoot, inputArg)
  : defaultApkPath

const targetApkPath = path.join(repoRoot, 'public', 'wagesociety.apk')
const targetMetadataPath = path.join(repoRoot, 'public', 'app-releases', 'android', 'latest.json')

async function main() {
  const sourceStat = await fs.stat(sourceApkPath)
  if (!sourceStat.isFile()) {
    throw new Error(`APK not found at ${sourceApkPath}`)
  }

  await fs.mkdir(path.dirname(targetApkPath), { recursive: true })
  await fs.mkdir(path.dirname(targetMetadataPath), { recursive: true })
  await fs.copyFile(sourceApkPath, targetApkPath)

  const release = {
    version: versionArg || 'local-dev',
    notes: notesArg || 'Local APK update',
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'local-script',
    fileName: 'wagesociety.apk',
    fileSizeBytes: sourceStat.size,
    url: `/wagesociety.apk?v=${Date.now()}`,
  }

  await fs.writeFile(targetMetadataPath, JSON.stringify(release, null, 2), 'utf8')

  console.log('Updated local APK release:')
  console.log(`- Source: ${sourceApkPath}`)
  console.log(`- Target: ${targetApkPath}`)
  console.log(`- Version: ${release.version}`)
  console.log(`- Metadata: ${targetMetadataPath}`)
}

main().catch((error) => {
  console.error('Failed to update local APK:', error)
  process.exit(1)
})
