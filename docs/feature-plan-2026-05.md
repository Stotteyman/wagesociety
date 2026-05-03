# W.A.G.E. Society — Feature Plan: Alerts, PWA, Email & Autoclipper

> **Created:** May 3, 2026  
> **Inputs:** Livestream alerts, Phone app (PWA), Email subscription, Autoclipper (!clip → queue → TikTok auto-post)

---

## Overview

| Feature | Complexity | Dependencies | Phase |
|---------|-----------|--------------|-------|
| PWA foundation (installable app) | Low | existing webmanifest, service worker | 1 |
| Livestream alerts (push notifications) | Medium | PWA, existing liveStatus.ts | 1 |
| Email subscription (Resend) | Medium | Resend SDK, Supabase | 1 |
| Clip queue DB + dashboard UI | Medium | Supabase | 2 |
| !clip Twitch chat bot | Medium | tmi.js (existing discord.js bot) | 2 |
| Discord clip management | Low | existing bot, clip queue API | 2 |
| Auto-post to TikTok + auto-caption | High | TikTok API, OpenAI Whisper | 3 |

---

## Phase 1 — PWA + Alerts + Email

### 1A. PWA — Installable Web App

**Goal:** Turn the existing site into an installable app on iOS and Android with push notification support.

**What already exists:**
- `public/site.webmanifest` — web app manifest (needs icons + `display: standalone`)
- HTTPS on Netlify — required for service workers

**Work required:**

1. **`public/sw.js`** — Service worker
   - Cache core shell assets for offline resilience
   - Register `push` event listener → show push notification
   - Register `notificationclick` → deep-link to `/live`

2. **`public/site.webmanifest`** — Update with:
   - `"display": "standalone"`
   - `"background_color"` + `"theme_color"` (match brand)
   - PWA icon set: 192×192 and 512×512 maskable icons

3. **`src/lib/pushClient.ts`** — Browser helper
   - `registerServiceWorker()` — register `sw.js`
   - `subscribeToPush()` — request permission + `PushManager.subscribe()`
   - `unsubscribeFromPush()` — remove subscription
   - `syncPushSubscription(subscription)` — POST to `/api/push-subscription`

4. **`src/routes/api/push-subscription.ts`** — API endpoint
   - `POST` — Save/update Web Push subscription object to Supabase `push_subscriptions` table per authenticated user
   - `DELETE` — Remove subscription
   - Requires auth

5. **Supabase table:** `push_subscriptions`
   ```sql
   CREATE TABLE push_subscriptions (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
     endpoint text NOT NULL UNIQUE,
     p256dh text NOT NULL,
     auth text NOT NULL,
     created_at timestamptz DEFAULT now()
   );
   ```

6. **`src/components/PushAlertToggle.tsx`** — Toggle component
   - "Get live alerts" toggle in dashboard sidebar and profile settings
   - Handles permission prompt, subscribe/unsubscribe, syncing to server
   - Shows platform-appropriate message on iOS (requires "Add to Home Screen" first)

**VAPID keys:** Generate with `web-push generate-vapid-keys` and add to Netlify env:
- `VAPID_PUBLIC_KEY` (also `VITE_VAPID_PUBLIC_KEY` for browser)
- `VAPID_PRIVATE_KEY` (server-only)
- `VAPID_CONTACT_EMAIL`

---

### 1B. Livestream Alert Delivery

**Goal:** When any tracked stream goes live, send a Web Push notification to all subscribed users within ~60 seconds.

**Architecture:** Netlify Scheduled Function (runs every 60s) — or use Supabase Edge Function with pg_cron if preferred.

**Work required:**

1. **Supabase table:** `stream_live_status_cache`
   ```sql
   CREATE TABLE stream_live_status_cache (
     stream_id uuid PRIMARY KEY REFERENCES live_streams(id) ON DELETE CASCADE,
     was_live bool NOT NULL DEFAULT false,
     last_checked_at timestamptz DEFAULT now()
   );
   ```

2. **`netlify/functions/check-streams.mts`** — Scheduled function
   - Schedule: `@every 60s` (or `*/1 * * * *` via `netlify.toml`)
   - For each tracked stream: call `checkLivestreamStatus()` from `liveStatus.ts`
   - Compare current status vs cached `was_live`
   - On transition `offline → live`: fetch all `push_subscriptions` from Supabase, send Web Push via `web-push` npm package
   - Update `stream_live_status_cache`

3. **Push payload:**
   ```json
   {
     "title": "🔴 {streamer} is LIVE",
     "body": "{stream title} — Watch now",
     "icon": "/icons/icon-192.png",
     "badge": "/icons/badge-72.png",
     "url": "/live"
   }
   ```

4. **`netlify.toml`** — Add scheduled function declaration:
   ```toml
   [functions."check-streams"]
     schedule = "*/1 * * * *"
   ```

---

### 1C. Email Subscription (Resend)

**Goal:** Users can subscribe to: live alerts, new news posts, and optional weekly digest.

**Environment variables to add:**
- `RESEND_API_KEY` — from resend.com dashboard

**Work required:**

1. **Supabase table:** `email_preferences`
   ```sql
   CREATE TABLE email_preferences (
     user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
     email text NOT NULL,
     live_alerts bool DEFAULT true,
     news_posts bool DEFAULT true,
     weekly_digest bool DEFAULT false,
     unsubscribe_token uuid DEFAULT gen_random_uuid(),
     created_at timestamptz DEFAULT now(),
     updated_at timestamptz DEFAULT now()
   );
   ```

2. **`src/routes/api/me/email-preferences.ts`** — API endpoint
   - `GET` — return current preferences for authed user
   - `POST` — upsert preferences
   - `DELETE /api/email-unsubscribe?token=xxx` — one-click unsubscribe from email link (no auth required)

3. **`src/lib/emailNotify.ts`** — Server utility
   - `sendLiveAlert(streamTitle, streamUrl, recipientEmails[])`
   - `sendNewsAlert(postTitle, postUrl, recipientEmails[])`
   - Uses Resend SDK: `new Resend(process.env.RESEND_API_KEY)`
   - React Email templates or plain HTML

4. **Trigger points:**
   - **Live alert:** `check-streams` Netlify function (same as push) — also batch-email subscribers
   - **News post:** Called from the `POST /api/news` handler after successful insert

5. **`src/components/EmailPreferencesPanel.tsx`** — UI panel in dashboard profile settings
   - Three toggles: Live Alerts / News Posts / Weekly Digest
   - Save button → `POST /api/me/email-preferences`

6. **Resend domain:** Verify `@wagesociety.com` (or whatever domain) in Resend dashboard. Add DNS records.

---

## Phase 2 — Autoclipper (Twitch !clip → Website Queue → Discord Management)

### 2A. Database

```sql
-- Clip queue
CREATE TABLE clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'twitch',
  external_clip_id text NOT NULL,         -- Twitch clip ID
  external_clip_url text NOT NULL,         -- watch URL
  thumbnail_url text,
  download_url text,                       -- CDN .mp4 URL (fetched after clip is ready)
  title text,
  broadcaster_name text,
  duration_seconds int,
  created_by_twitch_user text,             -- who typed !clip
  requested_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | posting | posted | failed
  posted_at timestamptz,
  discord_message_id text,                 -- for editing the Discord approval message
  tiktok_post_id text,
  caption text,                            -- auto-generated caption
  notes text,                              -- manual editor notes
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX ON clips (status);
CREATE INDEX ON clips (created_at DESC);
```

---

### 2B. Twitch Chat Bot (`!clip` command)

**Where it lives:** A new file in the existing discord.js bot project, run as a separate process or a parallel module within the same service.

**Package to add:** `tmi.js` — lightweight Twitch chat client for Node.js.

**Twitch app credentials needed (add to bot .env):**
- `TWITCH_BOT_USERNAME` — Twitch account username for the bot
- `TWITCH_BOT_OAUTH_TOKEN` — OAuth token for that account (`chat:read chat:edit`) via https://twitchtokengenerator.com
- `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` — for Helix API calls (clip creation + download URL lookup)
- `TWITCH_APP_ACCESS_TOKEN` — App OAuth token for Helix API (auto-refreshed)
- `WAGE_API_BASE_URL` — Base URL of the W.A.G.E. site (`https://wagesociety.com`)
- `WAGE_API_SECRET` — Shared secret for bot→API calls (add corresponding `BOT_API_SECRET` env to Netlify)

**⚠️ Twitch clip length caveat:** The Twitch `Create Clip` API (`POST /helix/clips`) creates clips of **30–90 seconds** (configurable, default 30s). True 5-minute clips require pulling a VOD segment via `GET /helix/videos` + time offset download — significantly more complex and slower. **Recommended approach:**
- Default: Twitch native clip = up to 90 seconds
- Phase 3 optional: VOD segment download for longer clips

**Bot module:** `src/clip-bot/twitchClipBot.js`

```
When user types !clip in monitored Twitch channels:
1. Call POST /helix/clips?broadcaster_id={id}&has_delay=false&duration=90
2. Poll GET /helix/clips?id={clip_id} until download_url is populated (up to 30s)
3. POST to /api/bot/clip-created (authenticated with BOT_API_SECRET)
4. Reply in Twitch chat: "✂️ Clip created! Queued for review → wagesociety.com/dashboard"
```

---

### 2C. Bot→Site API Endpoint

**`src/routes/api/bot/clip-created.ts`** — Internal endpoint, not user-facing

- Auth: `Authorization: Bearer {BOT_API_SECRET}` header validation (no Supabase user required)
- Input (JSON body):
  ```ts
  {
    externalClipId: string
    externalClipUrl: string
    thumbnailUrl: string
    downloadUrl: string | null   // null if Twitch hasn't finished processing
    title: string
    broadcasterName: string
    durationSeconds: number
    requestedBy: string          // Twitch username who typed !clip
  }
  ```
- Inserts row into `clips` with `status: 'pending'`
- Posts a Discord embed to the `#clip-review` channel via Discord webhook (stored in `DISCORD_CLIP_WEBHOOK_URL` env)

**Discord embed format:**
```
🎬 New clip queued
Broadcaster: [name]
Duration: 90s
Requested by: @username
[Watch] [Approve ✅] [Reject ❌]
```
Discord button interactions then call back to the site (see 2D).

---

### 2D. Discord Clip Management

**In the existing discord.js bot**, add an interaction handler for the Approve/Reject buttons on clip embeds.

- **Approve:** `PATCH /api/clips/{id}` with `{ status: 'approved' }` → moves clip to TikTok posting queue
- **Reject:** `PATCH /api/clips/{id}` with `{ status: 'rejected' }` + optional `notes`
- Bot edits the original Discord embed to show the new status + who actioned it

**`src/routes/api/clips/[id].ts`** — Clip management endpoint
- `GET` — return clip details (requires `manage_clips` permission)
- `PATCH` — update status / notes (requires `manage_clips` permission OR valid `BOT_API_SECRET`)
- `GET /api/clips` — paginated list, filterable by status

**Dashboard page:** `src/routes/dashboard.clips.tsx`
- Table of clips with status badges, thumbnail previews, approve/reject/re-queue actions
- Filter by: pending / approved / posted / rejected
- Manual "Post to TikTok" button per clip

---

## Phase 3 — Auto-Post to TikTok with Auto-Caption

### 3A. TikTok Developer Setup

1. Apply for **TikTok for Developers** at https://developers.tiktok.com
2. Create an app → request scopes: `video.upload`, `video.publish`
3. Get `TIKTOK_CLIENT_ID` + `TIKTOK_CLIENT_SECRET`
4. OAuth flow: one-time authorization for the W.A.G.E. TikTok account  
   - Store `TIKTOK_ACCESS_TOKEN` + `TIKTOK_REFRESH_TOKEN` securely (in Supabase or Netlify env)

---

### 3B. Auto-Caption via OpenAI Whisper

**New env vars:**
- `OPENAI_API_KEY`

**`src/lib/captionGenerator.ts`** — Server utility
1. Download clip `.mp4` from `downloadUrl` (Twitch CDN)  
   - Buffer it in memory (clips are ≤90s, typically < 50MB)
2. Send audio to `POST https://api.openai.com/v1/audio/transcriptions` (Whisper)
3. Post-process transcript → TikTok caption:
   - Trim to 2200 chars max
   - Append hashtags from config: `#wagesociety #gaming #clip`
   - Prepend streamer name + title
4. Store caption in `clips.caption` column

---

### 3C. TikTok Upload Pipeline

**`src/lib/tiktokUploader.ts`** — Server utility
1. Refresh TikTok access token if needed
2. `POST /v2/post/publish/video/init/` — TikTok direct post (server-side upload)
3. Upload video binary to returned `upload_url`
4. `GET /v2/post/publish/status/fetch/` — poll until `status === 'PUBLISH_COMPLETE'`
5. Update `clips.status = 'posted'`, `clips.tiktok_post_id`, `clips.posted_at`

**`netlify/functions/post-approved-clips.mts`** — Scheduled function
- Schedule: `*/5 * * * *` (every 5 minutes)
- Fetch `clips` where `status = 'approved'` AND `download_url IS NOT NULL`
- For each: run caption generation → TikTok upload → mark posted
- On failure: set `status = 'failed'`, increment retry counter, notify Discord

---

## Environment Variables — Full Updated List

Add these to `PRODUCTION_PLAN.md` and Netlify site settings:

| Variable | Phase | Purpose |
|----------|-------|---------|
| `VITE_VAPID_PUBLIC_KEY` | 1A | Web Push (browser) |
| `VAPID_PRIVATE_KEY` | 1A | Web Push (server) |
| `VAPID_CONTACT_EMAIL` | 1A | Web Push contact |
| `RESEND_API_KEY` | 1C | Email sending |
| `BOT_API_SECRET` | 2B | Bot→API authentication |
| `DISCORD_CLIP_WEBHOOK_URL` | 2C | Post clip embeds to Discord |
| `OPENAI_API_KEY` | 3B | Whisper transcription |
| `TIKTOK_CLIENT_ID` | 3C | TikTok API |
| `TIKTOK_CLIENT_SECRET` | 3C | TikTok API |
| `TIKTOK_ACCESS_TOKEN` | 3C | TikTok posting account |
| `TIKTOK_REFRESH_TOKEN` | 3C | TikTok token refresh |

---

## Supabase Migration Order

Run these migrations in order:

1. `push_subscriptions`
2. `email_preferences`
3. `stream_live_status_cache`
4. `clips`
5. RLS policies:
   - `push_subscriptions`: users can only read/write their own row
   - `email_preferences`: users can only read/write their own row
   - `clips`: staff+ can read all; public can read `status = 'posted'` (optional)

---

## File Creation Summary

### Phase 1
| File | Type |
|------|------|
| `public/sw.js` | Service worker |
| `public/icons/icon-192.png` + `icon-512.png` | PWA icons |
| `src/lib/pushClient.ts` | Browser push helper |
| `src/routes/api/push-subscription.ts` | Push sub API |
| `src/routes/api/email-unsubscribe.ts` | Unsubscribe link handler |
| `src/routes/api/me/email-preferences.ts` | Email prefs API |
| `src/lib/emailNotify.ts` | Resend email utility |
| `src/components/PushAlertToggle.tsx` | Push toggle UI |
| `src/components/EmailPreferencesPanel.tsx` | Email prefs UI |
| `netlify/functions/check-streams.mts` | Scheduled: poll streams + send alerts |

### Phase 2
| File | Type |
|------|------|
| `src/routes/api/bot/clip-created.ts` | Bot ingest endpoint |
| `src/routes/api/clips/[id].ts` | Clip CRUD API |
| `src/routes/api/clips.ts` | Clip list API |
| `src/routes/dashboard.clips.tsx` | Clip queue dashboard page |
| *(in bot repo)* `src/clip-bot/twitchClipBot.js` | tmi.js Twitch chat bot |
| *(in bot repo)* `src/handlers/clipButtons.js` | Discord button interaction handler |

### Phase 3
| File | Type |
|------|------|
| `src/lib/captionGenerator.ts` | Whisper transcription utility |
| `src/lib/tiktokUploader.ts` | TikTok upload utility |
| `netlify/functions/post-approved-clips.mts` | Scheduled: auto-post approved clips |

---

## Open Questions / Decisions Needed Before Building

1. **Twitch clip length:** Max native Twitch clip is 90 seconds. Do you want 90-second clips (fast, simple) or true 5-minute VOD segments (slower, needs FFmpeg)? **Recommendation: start with 90s, upgrade later.**

2. **!clip permissions:** Should any viewer be able to type `!clip`, or only mods/VIPs? Should there be a cooldown?

3. **Clip auto-approval:** Should approved clips auto-post immediately, or always wait for manual Discord approval first?

4. **TikTok account auth:** TikTok requires an interactive OAuth flow the first time. Someone will need to authorize the W.A.G.E. TikTok account through a browser to generate the initial access/refresh tokens.

5. **Email domain:** What sending domain should Resend use? (e.g. `alerts@wagesociety.com`)

6. **PWA brand assets:** Icons (192×192 and 512×512) need to be created or provided.
