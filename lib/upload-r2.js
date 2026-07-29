// lib/upload-r2.js — Resize + upload avatars to R2.
// Owns: image resize + S3 upload. Does NOT own: calling routes, avatar_url assignment.
// Uses AWS S3 SDK with R2 S3-compatible endpoint. Falls back to base64 if R2 creds absent.
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');

// Env vars are read as R2_*; the POLSIA_R2_* names they used to carry are still
// honoured as a fallback so nothing breaks before they are renamed in Netlify.
// `||` not `??` — a blank variable should fall through to the old name.
const R2_BUCKET = process.env.R2_BUCKET || process.env.POLSIA_R2_BUCKET || 'wageos-avatars';
const R2_ENDPOINT = process.env.R2_ENDPOINT || process.env.POLSIA_R2_ENDPOINT; // e.g. https://abc123.r2.cloudflarestorage.com
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID || process.env.POLSIA_R2_ACCESS_KEY_ID;
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY || process.env.POLSIA_R2_SECRET_ACCESS_KEY;

let s3Client = null;
if (R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_KEY,
    },
  });
  console.log('[upload-r2] R2 client initialized — bucket:', R2_BUCKET, 'endpoint:', R2_ENDPOINT);
} else {
  console.warn('[upload-r2] R2 env vars not set — uploads will use base64 fallback. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
}

const BASE_URL = process.env.R2_PUBLIC_URL || process.env.POLSIA_R2_PUBLIC_URL || 'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev';

/**
 * Resize image buffer to square avatar (256x256) and upload to R2.
 * Returns public URL on success, base64 data URL on failure (base64 fallback).
 * @param {Buffer} buffer - Raw image buffer
 * @param {string} userId - auth_users.id for unique filename
 * @returns {Promise<{url: string, base64: boolean}>}
 */
async function uploadAvatar(buffer, userId) {
  const key = `avatars/${userId}/${Date.now()}.webp`;

  // Resize to 256x256 square using sharp
  const resized = await sharp(buffer)
    .resize(256, 256, { fit: 'cover', position: 'center' })
    .webp({ quality: 80 })
    .toBuffer();

  if (s3Client) {
    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: resized,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      }));
      const url = `${BASE_URL}/${key}`;
      console.log('[upload-r2] Uploaded:', url);
      return { url, base64: false };
    } catch (err) {
      console.error('[upload-r2] R2 upload failed, falling back to base64:', err.message);
    }
  }

  // Base64 fallback — works without R2, stored in member_profiles.avatar_url
  const mime = 'image/webp';
  const b64 = resized.toString('base64');
  return { url: `data:${mime};base64,${b64}`, base64: true };
}

module.exports = { uploadAvatar };