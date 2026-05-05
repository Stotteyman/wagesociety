import { createFileRoute } from '@tanstack/react-router'
import { Download, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/download')({
  head: () => ({
    meta: [
      { title: 'Download the App — W.A.G.E. Society' },
      {
        name: 'description',
        content: 'Download the W.A.G.E. Society Android APK, and install on iPhone/iPad through Safari Add to Home Screen.',
      },
      { property: 'og:title', content: 'Download the App — W.A.G.E. Society' },
      {
        property: 'og:description',
        content: 'Download the W.A.G.E. Society Android APK, and install on iPhone/iPad through Safari Add to Home Screen.',
      },
      { property: 'og:url', content: 'https://wagesociety.com/download' },
    ],
    links: [{ rel: 'canonical', href: 'https://wagesociety.com/download' }],
  }),
  component: DownloadPage,
})

function DownloadPage() {
  const [apkUrl, setApkUrl] = useState('/wage-society.apk')
  const [apkVersion, setApkVersion] = useState<string | null>(null)
  const [apkUpdatedAt, setApkUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/public-apk')
        const data = (await res.json()) as {
          release?: { url?: string; version?: string; uploadedAt?: string } | null
        }
        const release = data.release
        if (!res.ok || !release?.url) return
        setApkUrl(release.url)
        setApkVersion(release.version || null)
        setApkUpdatedAt(release.uploadedAt || null)
      } catch {
        // Keep fallback static APK URL.
      }
    })()
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        {/* Icon */}
        <div className="mb-6 flex justify-center">
          <div className="rounded-2xl bg-orange-500/10 p-5 ring-1 ring-orange-500/30">
            <Smartphone className="h-12 w-12 text-orange-400" />
          </div>
        </div>

        {/* Heading */}
        <h1 className="mb-3 text-4xl font-bold tracking-tight">W.A.G.E. Society App</h1>
        <p className="mb-12 text-lg text-zinc-400">
          Take the community with you. Access your dashboard, live streams, news, and tools from your mobile device.
        </p>

        {/* Platform cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Android */}
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-zinc-900 p-8 ring-1 ring-zinc-800">
            <AndroidLogo />
            <div>
              <div className="text-xs font-medium uppercase tracking-widest text-zinc-500">Available for</div>
              <div className="text-xl font-bold">Android</div>
            </div>
            <div className="w-full">
              <a
                href={apkUrl}
                download
                className="group flex items-center justify-center gap-2 rounded-xl bg-zinc-800 px-4 py-3 text-sm font-medium text-zinc-300 ring-1 ring-zinc-700 transition hover:bg-zinc-700 hover:text-white"
              >
                <Download className="h-4 w-4" />
                Download APK (sideload)
              </a>
              {apkVersion ? (
                <p className="mt-2 text-xs text-zinc-400">
                  Latest: v{apkVersion}
                  {apkUpdatedAt ? ` · Updated ${new Date(apkUpdatedAt).toLocaleDateString()}` : ''}
                </p>
              ) : null}
            </div>
          </div>

          {/* iOS */}
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-zinc-900 p-8 ring-1 ring-zinc-800">
            <AppleLogo />
            <div>
              <div className="text-xs font-medium uppercase tracking-widest text-zinc-500">Install on</div>
              <div className="text-xl font-bold">iPhone / iPad</div>
            </div>
            <div className="rounded-xl bg-zinc-800 px-4 py-3 ring-1 ring-zinc-700 w-full">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Install via Safari</p>
              <ol className="list-inside list-decimal space-y-1 text-left text-xs text-zinc-400">
                <li>Open <span className="text-zinc-200">wagesociety.com</span> in Safari</li>
                <li>Tap the <span className="text-zinc-200">Share</span> button</li>
                <li>Choose <span className="text-zinc-200">Add to Home Screen</span></li>
              </ol>
            </div>
          </div>
        </div>

        {/* APK sideload note */}
        <div className="mt-8 rounded-xl bg-zinc-900 px-6 py-4 text-left ring-1 ring-zinc-800">
          <p className="mb-1 text-sm font-semibold text-orange-400">APK sideload instructions</p>
          <ol className="list-inside list-decimal space-y-1 text-sm text-zinc-400">
            <li>Tap <span className="font-medium text-white">Download APK</span> above.</li>
            <li>Open the file from your notification bar or file manager.</li>
            <li>
              If prompted, go to{' '}
              <span className="font-medium text-white">Settings → Apps → Special app access → Install unknown apps</span>{' '}
              and allow your browser or file manager.
            </li>
            <li>Tap <span className="font-medium text-white">Install</span> and launch the app.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

function AndroidLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-10 w-10 fill-[#3DDC84]" aria-label="Android">
      <path d="M17.523 15.341a.9.9 0 1 1-.001 1.8.9.9 0 0 1 0-1.8m-11.046 0a.9.9 0 1 1 0 1.801.9.9 0 0 1 0-1.8M17.7 9.3l1.575-2.727a.328.328 0 0 0-.12-.449.328.328 0 0 0-.449.12l-1.595 2.762A9.83 9.83 0 0 0 12 8.1c-1.476 0-2.876.316-4.112.906L6.294 6.244a.328.328 0 0 0-.449-.12.328.328 0 0 0-.12.449L7.3 9.3C4.91 10.664 3.3 13.193 3.3 16.1h17.4c0-2.907-1.61-5.436-3-6.8" />
    </svg>
  )
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-10 w-10 fill-zinc-400" aria-label="Apple">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11" />
    </svg>
  )
}
