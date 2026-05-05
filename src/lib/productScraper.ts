/**
 * Server-side product data extractor.
 * Parses JSON-LD, Open Graph, and meta tags from any HTML product page.
 * No external dependencies — pure string / regex parsing.
 */

export type ImportedProduct = {
  name: string
  price: string
  description: string
  imageUrl: string | null
  images: string[]
  sourceUrl: string
  brand: string | null
  availability: string | null
  currency: string | null
  rating: number | null
  reviewCount: number | null
  sku: string | null
  confidence: 'high' | 'medium' | 'low'
  signals: string[]
}

// ---------------------------------------------------------------------------
// HTML utilities
// ---------------------------------------------------------------------------

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decode(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .trim()
}

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractMeta(html: string, property: string): string | null {
  const escaped = escapeRegex(property)
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
    'i',
  )
  const m1 = html.match(re1)
  if (m1) return decode(m1[1])

  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
    'i',
  )
  const m2 = html.match(re2)
  return m2 ? decode(m2[1]) : null
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m ? decode(m[1]) : null
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

function extractJsonLd(html: string): unknown[] {
  const results: unknown[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed: unknown = JSON.parse(m[1])
      if (Array.isArray(parsed)) results.push(...parsed)
      else results.push(parsed)
    } catch {
      // skip malformed JSON-LD
    }
  }
  return results
}

function findProductNode(nodes: unknown[]): Record<string, unknown> | null {
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    const obj = node as Record<string, unknown>

    if (Array.isArray(obj['@graph'])) {
      const found = findProductNode(obj['@graph'] as unknown[])
      if (found) return found
    }

    const type = obj['@type']
    const types = Array.isArray(type) ? type : [type]
    if (types.some((t) => typeof t === 'string' && t.toLowerCase() === 'product')) return obj
  }
  return null
}

function getStr(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key]
  if (typeof v === 'string') return v.trim() || null
  if (Array.isArray(v) && typeof v[0] === 'string') return (v[0] as string).trim() || null
  return null
}

function formatPrice(amount: number, currency: string): string {
  const symbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : `${currency} `
  return `${symbol}${amount.toFixed(2)}`
}

type Partial_ = Partial<ImportedProduct> & { signals: string[] }

function parseProductFromJsonLd(product: Record<string, unknown>): Partial_ {
  const out: Partial_ = { signals: [] }

  const name = getStr(product, 'name')
  if (name) { out.name = name; out.signals.push('JSON-LD name') }

  const description = getStr(product, 'description')
  if (description) { out.description = stripHtml(description).slice(0, 600); out.signals.push('JSON-LD description') }

  const brand = product['brand']
  if (brand && typeof brand === 'object') {
    const bn = getStr(brand as Record<string, unknown>, 'name')
    if (bn) { out.brand = bn; out.signals.push('JSON-LD brand') }
  } else if (typeof brand === 'string' && brand) {
    out.brand = brand
  }

  const sku = getStr(product, 'sku') || getStr(product, 'mpn')
  if (sku) { out.sku = sku; out.signals.push('JSON-LD sku') }

  // images
  const imageRaw = product['image']
  const imgs: string[] = []
  if (typeof imageRaw === 'string') {
    imgs.push(imageRaw)
  } else if (Array.isArray(imageRaw)) {
    for (const img of imageRaw) {
      if (typeof img === 'string') imgs.push(img)
      else if (img && typeof img === 'object') {
        const u = getStr(img as Record<string, unknown>, 'url') || getStr(img as Record<string, unknown>, 'contentUrl')
        if (u) imgs.push(u)
      }
    }
  } else if (imageRaw && typeof imageRaw === 'object') {
    const u = getStr(imageRaw as Record<string, unknown>, 'url') || getStr(imageRaw as Record<string, unknown>, 'contentUrl')
    if (u) imgs.push(u)
  }
  if (imgs.length > 0) { out.images = imgs; out.imageUrl = imgs[0]; out.signals.push('JSON-LD image') }

  // offers → price
  const offersRaw = product['offers']
  const offers: Record<string, unknown>[] = []
  if (Array.isArray(offersRaw)) {
    for (const o of offersRaw) { if (o && typeof o === 'object') offers.push(o as Record<string, unknown>) }
  } else if (offersRaw && typeof offersRaw === 'object') {
    offers.push(offersRaw as Record<string, unknown>)
  }

  if (offers.length > 0) {
    const offer = offers[0]
    const priceVal = offer['price'] ?? offer['lowPrice']
    const currency = getStr(offer, 'priceCurrency') || 'USD'
    const avail = getStr(offer, 'availability')

    if (avail) out.availability = avail.replace('https://schema.org/', '').replace('http://schema.org/', '')
    out.currency = currency

    if (priceVal !== null && priceVal !== undefined) {
      const num = parseFloat(String(priceVal))
      if (!isNaN(num)) { out.price = formatPrice(num, currency); out.signals.push('JSON-LD price') }
    }
  }

  // rating
  const aggRating = product['aggregateRating']
  if (aggRating && typeof aggRating === 'object') {
    const r = aggRating as Record<string, unknown>
    const rv = r['ratingValue'] ?? r['bestRating']
    const rc = r['reviewCount'] ?? r['ratingCount']
    if (rv !== undefined) out.rating = parseFloat(String(rv))
    if (rc !== undefined) out.reviewCount = parseInt(String(rc), 10)
  }

  return out
}

function parseFromOpenGraph(html: string): Partial_ {
  const out: Partial_ = { signals: [] }

  const title = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title')
  if (title) { out.name = title; out.signals.push('OG title') }

  const description = extractMeta(html, 'og:description') || extractMeta(html, 'twitter:description')
  if (description) { out.description = description.slice(0, 600); out.signals.push('OG description') }

  const image = extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image')
  if (image) { out.imageUrl = image; out.images = [image]; out.signals.push('OG image') }

  const priceAmount =
    extractMeta(html, 'og:price:amount') ||
    extractMeta(html, 'product:price:amount') ||
    extractMeta(html, 'twitter:data1')
  const priceCurrency = extractMeta(html, 'og:price:currency') || extractMeta(html, 'product:price:currency') || 'USD'

  if (priceAmount) {
    const num = parseFloat(priceAmount.replace(/[^0-9.]/g, ''))
    if (!isNaN(num)) { out.price = formatPrice(num, priceCurrency); out.currency = priceCurrency; out.signals.push('OG price') }
  }

  return out
}

function parseFallback(html: string): Partial_ {
  const out: Partial_ = { signals: [] }

  const title = extractTitle(html)
  if (title) { out.name = title; out.signals.push('page title') }

  const description = extractMeta(html, 'description')
  if (description) { out.description = description.slice(0, 600); out.signals.push('meta description') }

  return out
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function scrapeProductFromHtml(html: string, sourceUrl: string): ImportedProduct {
  const jsonLdNodes = extractJsonLd(html)
  const productNode = findProductNode(jsonLdNodes)
  const jsonLd = productNode ? parseProductFromJsonLd(productNode) : { signals: [] as string[] }
  const og = parseFromOpenGraph(html)
  const fallback = parseFallback(html)

  const allSignals = [...jsonLd.signals, ...og.signals, ...fallback.signals]

  return {
    name: jsonLd.name || og.name || fallback.name || '',
    price: jsonLd.price || og.price || '',
    description: jsonLd.description || og.description || fallback.description || '',
    imageUrl: jsonLd.imageUrl || og.imageUrl || null,
    images: jsonLd.images || og.images || [],
    sourceUrl,
    brand: jsonLd.brand || null,
    availability: jsonLd.availability || null,
    currency: jsonLd.currency || og.currency || 'USD',
    rating: jsonLd.rating ?? null,
    reviewCount: jsonLd.reviewCount ?? null,
    sku: jsonLd.sku || null,
    signals: allSignals,
    confidence:
      jsonLd.signals.length >= 3
        ? 'high'
        : og.signals.length >= 2 || jsonLd.signals.length >= 1
        ? 'medium'
        : 'low',
  }
}
