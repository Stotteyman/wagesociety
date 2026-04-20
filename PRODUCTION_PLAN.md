# W.A.G.E. Society — Production Readiness Plan

> **Status:** In progress  
> **Build:** ✅ Passing (`vite build` — client + SSR)  
> **Last updated:** April 16, 2026

---

## 1. Environment Variables Required

Before deploying, set all of these in Netlify → Site settings → Environment variables:

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase anon key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-side admin access |
| `VITE_STRIPE_PUBLIC_KEY` | ✅ | Stripe publishable key |
| `STRIPE_SECRET_KEY` | ✅ | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Stripe webhook signing secret |
| `KICK_CLIENT_ID` | ✅ (Kick auth) | Kick OAuth app client ID |
| `KICK_CLIENT_SECRET` | ✅ (Kick auth) | Kick OAuth app client secret |
| `KICK_REDIRECT_URI` | ✅ (Kick auth) | `https://yourdomain.com/api/kick-callback` |

---

## 2. Supabase Setup

### 2a. OAuth Providers — Supabase Dashboard
Go to **Supabase → Authentication → Providers** and enable:

#### Google
1. Create OAuth app at https://console.cloud.google.com/apis/credentials
2. Authorized redirect URI: `https://<supabase-project>.supabase.co/auth/v1/callback`
3. Add Client ID + Secret to Supabase provider settings
4. Set "Redirect URL" in Supabase to `https://yourdomain.com/dashboard`

#### Discord
1. Create app at https://discord.com/developers/applications → OAuth2
2. Redirect URI: `https://<supabase-project>.supabase.co/auth/v1/callback`
3. Add Client ID + Secret to Supabase provider settings

#### Apple
1. Create App ID + Service ID at https://developer.apple.com/account/resources
2. Configure Sign In with Apple capability
3. Redirect URI: `https://<supabase-project>.supabase.co/auth/v1/callback`
4. Add Service ID + Team ID + Key ID + Private Key to Supabase provider settings

### 2b. Kick OAuth (Custom)
1. Register app at https://kick.com/settings/developer
2. Set redirect URI to: `https://yourdomain.com/api/kick-callback`
3. Add `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET`, `KICK_REDIRECT_URI` to Netlify env vars
4. Flow: `/api/kick-login` → Kick OAuth → `/api/kick-callback` → Supabase user → magic link → `/dashboard`

### 2c. Supabase Database Tables Required
Ensure these tables/RPCs exist in your Supabase project:

```sql
-- org_user_roles (members)
-- org_dashboard_tool_entries (creator tools)
-- org_shop_membership_plans (pricing tiers)
-- org_shop_merch_items (store items)
-- org_livestreams (stream channels)
-- org_shop_orders (payment fulfillment — NEW, created by stripe-webhook handler)

-- RPCs needed:
ensure_org_member_role(p_email, p_role)
set_org_member_role(p_email, p_role)
list_org_member_roles()
list_org_permissions_for_role(p_role)
list_org_permission_matrix()
set_org_role_permission(p_role, p_permission, p_allowed)
list_org_livestreams()
add_org_livestream(p_url, p_title, p_platform, p_stream_key)
delete_org_livestream(p_id)
```

Create the `org_shop_orders` table if it doesn't exist:
```sql
CREATE TABLE IF NOT EXISTS org_shop_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  customer_email TEXT NOT NULL,
  plan_slug TEXT,
  amount_cents INTEGER,
  currency TEXT DEFAULT 'usd',
  status TEXT DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2d. Supabase Auth Settings
- **Site URL**: `https://yourdomain.com`
- **Redirect URLs** (allowed list):
  - `https://yourdomain.com/dashboard`
  - `https://yourdomain.com/api/kick-callback`
- **Email Templates**: Customize confirmation and magic-link emails with W.A.G.E. Society branding

---

## 3. Stripe Setup

### 3a. Products & Prices
Create matching Stripe products for each membership tier, then sync `price_cents` in `org_shop_membership_plans`.

### 3b. Webhook
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/api/stripe-webhook`
3. Events to subscribe:
   - `payment_intent.succeeded`
   - `customer.subscription.deleted` (if you add recurring billing)
4. Copy webhook signing secret → `STRIPE_WEBHOOK_SECRET` env var

### 3c. Test Cards
Use in test mode:
- `4242 4242 4242 4242` — successful payment
- `4000 0000 0000 0002` — card declined

---

## 4. Domain & SEO

### 4a. Update Canonical URL
In `src/routes/__root.tsx` and `src/routes/index.tsx`, replace:
```
https://playful-torte-0c9af1.netlify.app
```
with your real domain (e.g. `https://wagesociety.com`).

Also update:
- `src/routes/__root.tsx` → `SITE_URL` constant
- `src/routes/index.tsx` → `og:url` meta tag and `canonical` link
- `src/routes/__root.tsx` → JSON-LD `"url"` field

### 4b. Add `_redirects` for Netlify
Create `public/_redirects`:
```
/dashboard/*  /.netlify/functions/server  200
/api/*        /.netlify/functions/server  200
```
(The Netlify Vite plugin usually handles this, but verify in Netlify dashboard.)

### 4c. robots.txt
Create `public/robots.txt`:
```
User-agent: *
Allow: /
Allow: /faq
Allow: /merch
Disallow: /dashboard
Disallow: /admin
Disallow: /checkout
Disallow: /appeals
Disallow: /api

Sitemap: https://yourdomain.com/sitemap.xml
```

### 4d. sitemap.xml
Create `public/sitemap.xml` with public routes:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://yourdomain.com/</loc><priority>1.0</priority></url>
  <url><loc>https://yourdomain.com/faq</loc><priority>0.8</priority></url>
  <url><loc>https://yourdomain.com/merch</loc><priority>0.7</priority></url>
</urlset>
```

### 4e. favicon.svg
Ensure `public/favicon.svg` exists with brand colors (orange on dark).

---

## 5. Navigation & Linking Audit

### 5a. Missing Nav Links
Add links to these pages from visible navigation:
- `/faq` — currently only linked from admin hub
- `/merch` — currently only linked from admin hub and live page
- `/live` — not linked from homepage or dashboard nav
- `/appeals` — only linked from banned/restricted dashboard state

Recommended: add a footer links section to `src/routes/index.tsx`:
```
Home | FAQ | Merch | Live | Dashboard | Checkout
```

### 5b. Dashboard Breadcrumb
Dashboard tools (`/dashboard/tools/$tool`) need a back-to-dashboard breadcrumb.
Current state: `<Link to="/dashboard">← Back to Dashboard</Link>` — ✅ present.

### 5c. Error State on OAuth Redirect
The dashboard URL may receive `?error=kick_oauth_denied` etc. from Kick OAuth callback.
Add error param handling in `dashboard.tsx` to show a user-facing error message.

---

## 6. Functional Completeness

### ✅ Already Working
- All 6 creator tools: Bulletin Board, Content Calendar, Revenue Tracker, Creator Task Board, Collaboration Hub, Knowledge Vault
- Admin: user roles, permissions matrix, shop CRUD
- Live streams: Twitch/YouTube/Kick status tracking
- Membership checkout: Stripe card payment (now wired to real backend)
- Marketing proof API: live member/win counts
- Email/password auth + OAuth (Google, Discord, Apple via Supabase)
- Kick OAuth (custom flow via `/api/kick-login` → `/api/kick-callback`)

### ⚠️ Needs Completion (Pre-launch)
| Item | File | Status |
|---|---|---|
| Merch "Add to Cart" / "Buy" button | `src/routes/merch.tsx` | "Coming Soon" placeholder |
| Live stream platform API keys | env vars | Twitch/YouTube/Kick API tokens needed |
| FAQ content | `src/routes/faq.tsx` | Appears to have generic SaaS Q&A — update to W.A.G.E.-specific |
| Member signup email confirmation | Supabase email templates | Default Supabase templates |
| Password reset flow | No dedicated UI | Add "Forgot password?" link to dashboard login |

---

## 7. Testing Checklist

### Auth & Access
- [ ] Email/password login and signup
- [ ] Google OAuth → redirects to `/dashboard` with session
- [ ] Discord OAuth → redirects to `/dashboard` with session
- [ ] Apple OAuth → redirects to `/dashboard` with session
- [ ] Kick OAuth → `/api/kick-login` → Kick consent → `/api/kick-callback` → `/dashboard` with session
- [ ] Logout clears session
- [ ] Banned user sees `BannedDashboard` and is redirected to `/appeals`
- [ ] "View As" role selector works for superadmin

### Dashboard Tools
- [ ] Create entry in each of the 6 tools
- [ ] Edit entry (in-place status/title update)
- [ ] Delete entry
- [ ] URL `/dashboard/tools/invalid-tool` shows 404

### Checkout & Payments
- [ ] Free tier (Backstage) — no Stripe required, success state
- [ ] Paid tier — Stripe card form loads, payment intent created, card confirmed
- [ ] Post-payment: `org_shop_orders` row created via webhook
- [ ] Stripe webhook signature verification works

### Admin
- [ ] `/admin` — accessible to superadmin only
- [ ] User role management
- [ ] Permission matrix read/write
- [ ] Shop plan CRUD
- [ ] Merch CRUD
- [ ] Live stream add/remove

### SEO / Performance
- [ ] Lighthouse score ≥ 90 on homepage (Mobile + Desktop)
- [ ] LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1
- [ ] OG image renders correctly in Twitter/Facebook card preview
- [ ] Canonical URL correct on all public pages
- [ ] robots.txt and sitemap.xml accessible
- [ ] JSON-LD valid (test at https://validator.schema.org/)

---

## 8. Pre-launch Final Steps (Ordered)

1. **Set all env vars** in Netlify dashboard
2. **Create Supabase OAuth apps** (Google, Discord, Apple) and configure in Supabase
3. **Register Kick OAuth app** and set redirect URI
4. **Create Stripe products** matching membership plan slugs
5. **Register Stripe webhook** (`/api/stripe-webhook`)
6. **Create `org_shop_orders` table** in Supabase
7. **Update canonical URL** from Netlify subdomain to real domain
8. **Create `public/robots.txt`** and **`public/sitemap.xml`**
9. **Update FAQ content** to W.A.G.E.-specific questions
10. **Add password reset UI** to dashboard login form
11. **Add footer navigation** to homepage with links to `/faq`, `/merch`, `/live`
12. **Run full test checklist** above
13. **DNS cutover** to production domain
14. **Submit to Google Search Console** and verify sitemap

---

## 9. Nice-to-have (Post-launch)

- Funnel analytics: instrument CTA clicks with privacy-first analytics (Plausible, Fathom, or PostHog)
- Recurring billing: Stripe subscriptions instead of one-time payments
- Member directory or profile pages
- Email sequence: onboarding drip via Supabase edge function + Resend/Postmark
- Merch store integration with Printful/Shopify for physical goods
- Discord server auto-role on membership purchase
