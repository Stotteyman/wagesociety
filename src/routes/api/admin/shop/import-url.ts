import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '../../../../lib/orgAuth'
import { scrapeProductFromHtml } from '../../../../lib/productScraper'

const PRIVATE_HOST_PATTERNS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
]

function isPrivateHost(hostname: string) {
  const h = hostname.toLowerCase()
  return (
    PRIVATE_HOST_PATTERNS.includes(h) ||
    h.startsWith('192.168.') ||
    h.startsWith('10.') ||
    h.startsWith('172.16.') ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  )
}

export const Route = createFileRoute('/api/admin/shop/import-url')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await requirePermission(request, 'access_admin_dashboard')

          const body = (await request.json()) as { url?: unknown }
          const rawUrl = String(body.url ?? '').trim()

          if (!rawUrl) {
            return Response.json({ error: 'url is required' }, { status: 400 })
          }

          let parsed: URL
          try {
            parsed = new URL(rawUrl)
          } catch {
            return Response.json({ error: 'Invalid URL format.' }, { status: 400 })
          }

          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return Response.json({ error: 'Only http and https URLs are supported.' }, { status: 400 })
          }

          if (isPrivateHost(parsed.hostname) && process.env.NODE_ENV === 'production') {
            return Response.json({ error: 'Private/internal URLs are not allowed.' }, { status: 400 })
          }

          // Fetch with a realistic browser User-Agent to avoid bot blocks
          let html: string
          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => { controller.abort() }, 15_000)

            const res = await fetch(rawUrl, {
              signal: controller.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
              },
            })
            clearTimeout(timeout)

            if (!res.ok) {
              return Response.json(
                { error: `Page returned HTTP ${res.status}. The site may block automated requests.` },
                { status: 422 },
              )
            }

            const contentType = res.headers.get('content-type') ?? ''
            if (!contentType.includes('html')) {
              return Response.json({ error: 'URL does not point to an HTML page.' }, { status: 422 })
            }

            // Read up to 2 MB
            const buffer = await res.arrayBuffer()
            html = new TextDecoder('utf-8', { fatal: false }).decode(
              buffer.byteLength > 2_000_000 ? buffer.slice(0, 2_000_000) : buffer,
            )
          } catch (err) {
            if ((err as Error).name === 'AbortError') {
              return Response.json(
                { error: 'Request timed out after 15s. The site took too long to respond.' },
                { status: 422 },
              )
            }
            return Response.json(
              { error: `Could not fetch page: ${(err as Error).message}` },
              { status: 422 },
            )
          }

          const product = scrapeProductFromHtml(html, rawUrl)

          if (!product.name) {
            return Response.json(
              { error: 'Could not extract product information from this page. Try a direct product listing URL.' },
              { status: 422 },
            )
          }

          return Response.json({ product })
        } catch (err) {
          if (err instanceof Response) return err
          return Response.json(
            { error: err instanceof Error ? err.message : 'Unexpected server error' },
            { status: 500 },
          )
        }
      },
    },
  },
})

