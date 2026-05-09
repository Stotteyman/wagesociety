# Livestream Detection Fix - Testing & Deployment Guide

## Changes Made

### 1. Database Migration ✅
Created `supabase/migrations/20260505_add_member_livestreams.sql`
- New table: `org_member_livestreams`
- Stores member livestream preferences persistently
- RLS policies for secure read/write/delete
- Auto-updating `updated_at` timestamp

**Status**: Migration applied successfully to Supabase

### 2. Profile API Updates ✅
File: `src/routes/api/me/profile.ts`
- PUT handler now saves selected YouTube channel to database
- Saves: `email`, `platform` ('youtube'), `stream_key`, `stream_url`, `display_name`, `avatar_url`
- Still updates user_metadata for backwards compatibility
- Handles deletion when channel is deselected

**Example data saved**:
```json
{
  "email": "user@example.com",
  "platform": "youtube",
  "stream_key": "handle:stotteyman",
  "stream_url": "https://www.youtube.com/@stotteyman",
  "display_name": "User Name",
  "avatar_url": "https://..."
}
```

### 3. Live Streams API Updates ✅
File: `src/routes/api/live/streams.ts`
- GET handler now fetches livestreams from `org_member_livestreams` table first
- Falls back to user_metadata for backwards compatibility
- Deduplicates users (won't show same person twice)
- All streams check live/offline status via YouTube/Twitch/Kick APIs

**Logic flow**:
1. Query database for all member livestreams
2. For each livestream, fetch live/offline status via API
3. Fall back to user_metadata for users not in database
4. Deduplicate and sort by live status + viewer count

## Testing Checklist

### ✅ Pre-Deployment
- [x] Migration applied to Supabase
- [x] TypeScript types generated
- [x] Project builds without errors
- [x] No lint errors in modified files

### 📋 Post-Deployment Testing

#### 1. **Profile Settings - Save YouTube Channel**
- Login to dashboard
- Go to Settings → Livestreams
- Link Google account (if not linked)
- Select YouTube channel from dropdown (e.g., "stotteyman")
- Click Save
- **Expected**: Green success message "✓ Google account linked successfully!"

#### 2. **Database Verification**
In Supabase:
```sql
SELECT * FROM org_member_livestreams 
WHERE email = 'your-email@example.com';
```
**Expected output**:
- `email`: your-email@example.com
- `platform`: youtube
- `stream_key`: handle:stotteyman
- `stream_url`: https://www.youtube.com/@stotteyman
- `display_name`: Your Name
- `created_at`, `updated_at`: Recent timestamps

#### 3. **Live Page Display**
- Go to `/live` page
- **Expected**: Your YouTube channel should appear in the list
- **Live indicator**: Shows "LIVE" or "OFFLINE" based on YouTube API status
- **Channel name**: Displays as "YOUTUBE · stotteyman"

#### 4. **API Testing**
```bash
# Test livestreams API
curl https://playful-torte-0c9af1.netlify.app/api/live/streams \
  -H "Authorization: Bearer YOUR_TOKEN"
```
**Expected response**:
```json
{
  "streams": [
    {
      "id": "db-UUID",
      "title": "User Name",
      "platform": "youtube",
      "stream_key": "handle:stotteyman",
      "url": "https://www.youtube.com/@stotteyman",
      "status": "offline",
      "viewer_count": null,
      "created_by": "user@example.com"
    }
  ],
  "canManage": true,
  "canUseAutoclipper": true
}
```

#### 5. **Backwards Compatibility**
- Users with only user_metadata (no database entry) should still appear on /live page
- Database entries take priority over metadata
- Each user appears only once (no duplicates)

## Troubleshooting

### ❌ YouTube channel doesn't appear on /live page

**Check 1: Database entry exists**
```sql
SELECT * FROM org_member_livestreams 
WHERE email = 'your-email@example.com' AND platform = 'youtube';
```

**Check 2: YouTube API is configured**
Verify `YOUTUBE_API_KEY` environment variable is set in `.env`:
```bash
echo $YOUTUBE_API_KEY
```

**Check 3: Stream key format**
Your `stream_key` should be one of:
- `handle:stotteyman` (YouTube handle - most common)
- `channel:UCxxxxx` (Channel ID)
- `user:stotteyman` (Legacy username)
- `custom:customname` (Custom URL)

**Check 4: API Logs**
```bash
# Check server logs for YouTube API errors
# Look for "Failed to fetch livestream snapshot" messages
```

### ❌ Data not saving to database

**Check 1: RLS Policies**
```sql
SELECT * FROM pg_policies 
WHERE tablename = 'org_member_livestreams';
```

**Check 2: Auth Token**
Ensure your JWT token contains:
```json
{
  "email": "your-email@example.com",
  "...": "..."
}
```

**Check 3: Profile API Response**
```bash
curl https://playful-torte-0c9af1.netlify.app/api/me/profile \
  -H "Authorization: Bearer YOUR_TOKEN"
```
Should include `stream_accounts.youtube.selected` with your chosen channel

### ❌ Channel appears but shows "OFFLINE" when it's live

**Possible causes**:
1. YouTube API quota exceeded
2. API key doesn't have YouTube API v3 enabled
3. Channel doesn't have any live streams
4. API rate limiting

**Fix**: Check [YouTube Data API quota](https://console.cloud.google.com/apis/dashboard)

## Deployment Steps

1. **Push code to GitHub**
   ```bash
   git add .
   git commit -m "Add database-backed livestream detection for members"
   git push
   ```

2. **Netlify deploys automatically**
   - Function builds SSR server
   - Migrations apply to Supabase
   - New table is ready

3. **Verify deployment**
   - Check Supabase table exists: `SELECT COUNT(*) FROM org_member_livestreams;`
   - Test profile update: Save a YouTube channel in settings
   - Check /live page displays the channel

## Performance Notes

- Database queries optimized with indices on `email` and `(platform, stream_key)`
- Livestream snapshots are fetched on-demand (not cached)
- Each member makes one API call to YouTube/Twitch/Kick per page load
- No N+1 queries - all livestreams fetched in single query

## Files Modified

```
supabase/migrations/20260505_add_member_livestreams.sql  (NEW)
src/routes/api/me/profile.ts                             (UPDATED)
src/routes/api/live/streams.ts                           (UPDATED)
```

## Rollback Plan

If issues occur, you can:

1. **Disable database livestreams** (keep using metadata only):
   - Comment out database query in `/api/live/streams.ts`
   - API will fall back to user_metadata

2. **Drop table** (if needed):
   ```sql
   DROP TABLE IF EXISTS org_member_livestreams;
   ```

3. **Revert to previous deployment**: Use Netlify deploy history

## Next Steps

1. ✅ Test the flow with your "stotteyman" YouTube channel
2. ✅ Verify other members can also set their livestreams
3. ✅ Monitor API logs for any YouTube API errors
4. 📋 Consider adding Twitch/Kick support to the database table (currently only stores YouTube)
