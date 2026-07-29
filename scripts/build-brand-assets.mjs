/**
 * Generates every derived brand image from the one real logo file.
 *
 *   node scripts/build-brand-assets.mjs
 *
 * The only source is public/brand/wage-crest.png — the crest pulled from the Discord
 * bot's own avatar, which BRAND_GUIDE.md names as the sole authority on the mark. Nothing
 * here redraws it; everything is that file placed on brand-coloured ground.
 *
 * There is deliberately no text in any of these. The crest is a complete lockup — it
 * already carries "W.A.G.E. SOCIETY" — and the brand faces (Archivo Black, Instrument
 * Sans) are not installed on this machine, so any text would silently render in a
 * fallback face and ship off-brand. Setting the name in the wrong font next to a logo
 * that already contains it would be worse than leaving it out.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CREST = join(ROOT, 'public/brand/wage-crest.png');
const OUT = join(ROOT, 'public/brand');
const SOCIAL = join(ROOT, 'public/brand/social');

// Sampled from the crest — see BRAND_GUIDE.md §4.
const INK = '#06090B';
const INK_2 = '#0B1014';
const AMBER = '#FC9000';
const RED = '#E43000';
const LINE = '#212A31';

const ink = { r: 6, g: 9, b: 11, alpha: 1 };

/** The crest at a given size, preserving its transparency and aspect. */
const crest = (size) =>
  sharp(CREST).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();

/**
 * Background for the wide pieces: near-black ground, a warm pool of light behind where
 * the crest sits, and the diagonal cut + red chevron the crest itself uses.
 */
function backdrop(w, h) {
  const cx = w / 2;
  return Buffer.from(`
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="46%" r="46%">
      <stop offset="0%"   stop-color="${AMBER}" stop-opacity="0.22"/>
      <stop offset="55%"  stop-color="${AMBER}" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="${AMBER}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="${INK_2}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${INK_2}" stop-opacity="0.9"/>
    </linearGradient>
  </defs>

  <rect width="${w}" height="${h}" fill="${INK}"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <rect y="${h * 0.62}" width="${w}" height="${h * 0.38}" fill="url(#floor)"/>

  <!-- Hard diagonal cuts, echoing the shield's own edges. -->
  <path d="M0 ${h} L${w * 0.30} ${h} L0 ${h * 0.55} Z" fill="${LINE}" opacity="0.55"/>
  <path d="M${w} 0 L${w * 0.70} 0 L${w} ${h * 0.45} Z" fill="${LINE}" opacity="0.55"/>

  <!-- A red keyline above the amber baseline. The crest carries its own chevron, so
       repeating that shape here just read as a stray duplicate of the logo's tail. -->
  <rect y="${h - Math.max(7, h * 0.020)}" width="${w}" height="${Math.max(3, h * 0.008)}" fill="${RED}" opacity="0.85"/>
  <rect y="${h - Math.max(4, h * 0.012)}" width="${w}" height="${Math.max(4, h * 0.012)}" fill="${AMBER}"/>
</svg>`);
  void cx;
}

/**
 * Ground for anything cropped to a circle. Facebook masks page avatars, so every edge
 * treatment — the diagonals, the baseline rule — would be sliced into stray fragments
 * around the rim. Only a centred glow survives a crop of unknown shape.
 */
function avatarBackdrop(size) {
  return Buffer.from(`
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="50%" cy="50%" r="52%">
      <stop offset="0%"   stop-color="${AMBER}" stop-opacity="0.26"/>
      <stop offset="52%"  stop-color="${AMBER}" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="${AMBER}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="${INK}"/>
  <rect width="${size}" height="${size}" fill="url(#g)"/>
</svg>`);
}

/** Flat ground for icons, where a gradient would only muddy things at 16px. */
const solid = (size) =>
  sharp({ create: { width: size, height: size, channels: 4, background: ink } }).png().toBuffer();

async function write(path, buf, note) {
  await writeFile(path, buf);
  // sharp cannot read an ICO container, so callers pass their own label for those.
  let dims = note;
  if (!dims) {
    const { width, height } = await sharp(buf).metadata();
    dims = `${width}x${height}`;
  }
  const rel = path.replace(ROOT + '\\', '').replace(ROOT + '/', '').replace(/\\/g, '/');
  console.log(`  ${rel.padEnd(44)} ${String(dims).padEnd(11)} ${(buf.length / 1024).toFixed(0)}KB`);
}

/**
 * Pack PNGs into a .ico. Browsers still request /favicon.ico by default, and sharp
 * cannot write the container, so it is assembled by hand. Vista onward accepts PNG
 * payloads inside ICO, which keeps the file small and the edges clean.
 */
function ico(pngs) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);          // reserved
  head.writeUInt16LE(1, 2);          // 1 = icon
  head.writeUInt16LE(pngs.length, 4);

  let offset = 6 + pngs.length * 16;
  const entries = [];
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);   // 0 means 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);                         // palette
    e.writeUInt8(0, 3);                         // reserved
    e.writeUInt16LE(1, 4);                      // colour planes
    e.writeUInt16LE(32, 6);                     // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([head, ...entries, ...pngs.map((p) => p.data)]);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(SOCIAL, { recursive: true });

  const meta = await sharp(CREST).metadata();
  console.log(`source: public/brand/wage-crest.png  ${meta.width}x${meta.height}\n`);

  // ── favicons ───────────────────────────────────────────────────────────────
  // Transparent, so the mark sits correctly on light and dark browser chrome.
  console.log('favicons');
  const icoParts = [];
  for (const size of [16, 32, 48, 64, 96, 128, 256]) {
    const buf = await crest(size);
    await write(join(OUT, `favicon-${size}.png`), buf);
    if ([16, 32, 48].includes(size)) icoParts.push({ size, data: buf });
  }
  await write(join(ROOT, 'public/favicon.ico'), ico(icoParts), '16/32/48');

  // ── app icons ──────────────────────────────────────────────────────────────
  // iOS ignores transparency and composites on white, which would leave the black
  // shield floating in a white square. Give these their own ink ground.
  console.log('\napp icons');
  for (const size of [180, 192, 512]) {
    const pad = Math.round(size * 0.10);
    const buf = await sharp(await solid(size))
      .composite([{ input: await crest(size - pad * 2), top: pad, left: pad }])
      .png().toBuffer();
    const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
    await write(join(ROOT, 'public', name), buf);
  }

  // Maskable: Android may crop this to any shape, so the mark stays inside the
  // central 80% the spec guarantees.
  {
    const size = 512;
    const inner = Math.round(size * 0.62);
    const off = Math.round((size - inner) / 2);
    const buf = await sharp(await solid(size))
      .composite([{ input: await crest(inner), top: off, left: off }])
      .png().toBuffer();
    await write(join(ROOT, 'public/icon-maskable-512.png'), buf);
  }

  // ── share card ─────────────────────────────────────────────────────────────
  // index.html already points at /og.png and the file has never existed, so every
  // share has been fetching the SPA's HTML instead of an image.
  console.log('\nshare cards');
  {
    const w = 1200, h = 630;
    const c = Math.round(h * 0.62);
    const buf = await sharp(backdrop(w, h))
      .composite([{ input: await crest(c), top: Math.round((h - c) / 2 - h * 0.03), left: Math.round((w - c) / 2) }])
      .png().toBuffer();
    await write(join(ROOT, 'public/og.png'), buf);
  }

  // Square, for posts and for platforms that crop to 1:1.
  {
    const s = 1080, c = Math.round(s * 0.60);
    const buf = await sharp(backdrop(s, s))
      .composite([{ input: await crest(c), top: Math.round((s - c) / 2 - s * 0.02), left: Math.round((s - c) / 2) }])
      .png().toBuffer();
    await write(join(SOCIAL, 'social-square-1080.png'), buf);
  }

  // ── facebook ───────────────────────────────────────────────────────────────
  console.log('\nfacebook');
  // Page avatar is masked to a circle. A square inscribed in that circle is only ~71%
  // of the width, so the crest is sized to sit inside it and centred exactly — no
  // optical offset, because a circular crop punishes anything off-centre.
  {
    const s = 1080, c = Math.round(s * 0.62);
    const off = Math.round((s - c) / 2);
    const buf = await sharp(avatarBackdrop(s))
      .composite([{ input: await crest(c), top: off, left: off }])
      .png().toBuffer();
    await write(join(SOCIAL, 'facebook-profile-1080.png'), buf);
  }

  // Cover: 1640x624 is exactly 2x the 820x312 desktop slot. Mobile crops to a
  // narrower 16:9 window from the centre, so everything that matters is kept well
  // inside the middle ~1100px.
  {
    const w = 1640, h = 624;
    const c = Math.round(h * 0.72);
    const buf = await sharp(backdrop(w, h))
      .composite([{ input: await crest(c), top: Math.round((h - c) / 2 - h * 0.04), left: Math.round((w - c) / 2) }])
      .png().toBuffer();
    await write(join(SOCIAL, 'facebook-cover-1640x624.png'), buf);
  }

  // A taller variant for the crop mobile actually shows, if the wide one sits badly.
  {
    const w = 1640, h = 924;
    const c = Math.round(h * 0.52);
    const buf = await sharp(backdrop(w, h))
      .composite([{ input: await crest(c), top: Math.round((h - c) / 2 - h * 0.03), left: Math.round((w - c) / 2) }])
      .png().toBuffer();
    await write(join(SOCIAL, 'facebook-cover-1640x924.png'), buf);
  }

  // ── x / twitter ────────────────────────────────────────────────────────────
  console.log('\nx (twitter)');
  // Avatar is masked to a circle, same reasoning as the Facebook one.
  {
    const s = 400, c = Math.round(s * 0.64);
    const off = Math.round((s - c) / 2);
    const buf = await sharp(avatarBackdrop(s))
      .composite([{ input: await crest(c), top: off, left: off }])
      .png().toBuffer();
    await write(join(SOCIAL, 'x-avatar-400.png'), buf);
  }
  // 1500x500 header. The avatar overlaps the lower left and the strip is cropped
  // hard on narrow viewports, so the crest sits centred and high enough to clear it.
  {
    const w = 1500, h = 500;
    const c = Math.round(h * 0.62);
    const buf = await sharp(backdrop(w, h))
      .composite([{ input: await crest(c), top: Math.round((h - c) / 2 - h * 0.06), left: Math.round((w - c) / 2) }])
      .png().toBuffer();
    await write(join(SOCIAL, 'x-header-1500x500.png'), buf);
  }

  // ── tiktok ─────────────────────────────────────────────────────────────────
  console.log('\ntiktok');
  // TikTok has no banner — the avatar is the whole identity, shown as small as
  // ~100px, so it gets slightly tighter padding to keep the lettering readable.
  {
    const s = 1080, c = Math.round(s * 0.70);
    const off = Math.round((s - c) / 2);
    const buf = await sharp(avatarBackdrop(s))
      .composite([{ input: await crest(c), top: off, left: off }])
      .png().toBuffer();
    await write(join(SOCIAL, 'tiktok-avatar-1080.png'), buf);
    await write(join(SOCIAL, 'tiktok-avatar-200.png'), await sharp(buf).resize(200, 200).png().toBuffer());
  }

  // Vertical safe-area template for short-form: 1080x1920 with the mark parked in
  // the upper third, clear of TikTok's caption and button furniture.
  {
    const w = 1080, h = 1920, c = Math.round(w * 0.46);
    const buf = await sharp(backdrop(w, h))
      .composite([{ input: await crest(c), top: Math.round(h * 0.16), left: Math.round((w - c) / 2) }])
      .png().toBuffer();
    await write(join(SOCIAL, 'vertical-1080x1920.png'), buf);
  }

  console.log('\ndone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
