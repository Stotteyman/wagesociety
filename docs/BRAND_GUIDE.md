# W.A.G.E. Society — Brand Guide

**Version 3.0 · 27 July 2026**
Owner: Gary McCullough (Stotteyman) · Maintained in this repo, not in Drive.

This is the canonical brand reference. Where this document and any other file disagree,
this document wins. Visual version: [`docs/mockups/brand-guide.html`](mockups/brand-guide.html).

## Source of truth for the visual identity

There are **two real logo files** and they are the only authority on colour and form:

## The logo is the crest

**`public/brand/wage-crest.png` is the logo.** There is no second mark.

It is an extruded badge: a black shield with hard diagonal cuts, a **W built from two beer
glasses** — deep red base, amber body, white foam head — over heavy white `W.A.G.E.` lettering,
`SOCIETY` on a band beneath, and a **red chevron** tail. This file is the W.A.G.E. Society
Discord bot's own avatar, pulled from the Discord CDN at 512px with transparency: the cleanest
copy that exists, and the authoritative source for every colour in §4.

**The crest is a complete lockup.** It already contains the name, so it never needs a wordmark
set beside it. In the nav and footer it stands alone.

| File | Use |
|---|---|
| `public/brand/wage-crest.png` | **The logo.** Nav, footer, favicon, hero, share cards, everywhere. |
| `public/brand/wage-crest.gif` | The crest animated (spins on its vertical axis) — streaming overlays only. A **compressed derivative**: never sample colour from it. |

### Retired

The interlocking **WS monogram** (`wage-monogram-light.png`, `wage-monogram-onblack.png`, and
the *WS Logo White/Black* Discord stickers) is **an older mark and is no longer in use.** The
files are kept in `docs/brand-assets/legacy/` for reference only. Do not put them on the site,
in decks, or in new artwork.

**Where these came from.** The brand lives on Discord, not in a folder. The bot is named
**W.A.G.E. Society** (application `1079696291262631966`) and its avatar *is* the crest. The
official server is **"We All Gotta Eat"** (guild `1160158300168527895`) — the server name is
itself confirmation of the canonical tagline. To re-pull any of it, call the Discord API with
`DISCORD_BOT_TOKEN` against `/users/@me` and `/guilds/{id}`.

> ⚠️ `DISCORD_GUILD_ID` is **unset** in the Netlify project settings, and `DISCORD_BOT_TOKEN`
> is present but **blank in `.env.local`**, where it shadows the real value. Both need fixing
> before the Discord work in Phase 5.

> **Correction from v1.0.** The images in `docs/brand-assets/` (`wage-society-brand-cover.png`,
> `wage-society-social-square.png`) are **AI-generated marketing art, not brand assets**. v1.0 of
> this guide derived the palette from them and produced a gold/cyan/violet scheme with a glowing
> portal ring — none of which appears in the actual logo. Every colour in §4 is now sampled
> directly from the crest. **Do not take colour, form, or the "portal" motif from the cover art.**
> It is illustration for decks and social posts, nothing more.

Other sources: the WAGE Society Growth Playbook, the Discord Control Center product spec
(its *No Placeholder Rule* became the voice rule in §3), and the live wagesociety.com.

---

## 1. The name

**W.A.G.E. Society** — "We All Gotta Eat Society."

- **W.A.G.E. expands to "We All Gotta Eat."** This is settled. Any copy reading
  "We All Gonna Eat" is wrong and gets corrected on sight, including the Growth Playbook
  in Drive.
- **Written forms, in order of preference:**
  - `W.A.G.E. Society` — full formal lockup. Headers, legal, first mention.
  - `WAGE Society` — running text, URLs, casual. Never `Wage Society` or `WAGE society`.
  - `WAGE` — internal shorthand, product surfaces (WAGE World, WAGE Creator).
- **Tagline:** *We all gotta eat.* Lowercase in body copy, uppercase in display type.
  Always ends with a period — it's a statement, not a slogan.
- **Never:** "The WAGE", "Wage Soc", or any acronym expansion other than We All Gotta Eat.

### Related brands

WAGE Society sits under Stotteyman Enterprises alongside sibling brands. Keep the lines clean:

| Brand | Job | Appears on WAGE how |
|---|---|---|
| **W.A.G.E. Society** | The platform — the mission | The product itself |
| **Stotteyman** | The creator account that recruits | A creator profile like any other |
| **Orange Duck Studios** | The dev studio that builds it | Credit line on WAGE World only |

Orange Duck gets credited on the `/play` page footer and in the WAGE World credits.
Nowhere else. WAGE Society is not "by Orange Duck Studios" in the header or the About page.

---

## 2. Positioning

**One line:** WAGE Society is where creators own their audience and keep what they earn.

**The problem we name:** platforms rent creators their own audience. Algorithms decide who
gets heard, terms change overnight, and the revenue split leaves crumbs.

**What we actually are:** a creator operating system — profile, streams, memberships, merch,
referrals, and Discord in one place, at 0% platform cut.

**Who we talk to, in priority order:**
1. Small creators (500–5k followers) who already make things and want to sell to their own people.
2. Their audiences, arriving from a creator's profile link.
3. Creators big enough to bring a crowd with them.

**What we are not:** a social network, a feed, an audience-growth hack, or a get-rich scheme.
We don't promise reach. We promise ownership.

---

## 3. Voice

WAGE talks like a creator who has done the work, not like a platform's marketing department.

**Five rules:**

1. **Plain over polished.** "You keep what you earn" beats "creator-first monetization
   infrastructure." If a word wouldn't survive being said out loud on a stream, cut it.
2. **Specific over hype.** Never "revolutionary", "game-changing", "unlock your potential."
   Numbers and nouns instead: "0% platform cut", "Stripe pays you direct", "10 creators."
3. **Say the real number, including zero.** From the Discord spec's *No Placeholder Rule* —
   if a metric is unavailable, say so and say why. Never invent a count to look bigger.
   A zero that explains itself builds more trust than a fake number.
4. **Direct address.** "Your profile", "you keep", "your people." Second person, active voice.
5. **Confident, never bitter.** We name what platforms do wrong once, then move on to what
   we do instead. Punching down or ranting reads as small.

**Tone shifts by surface:**

| Surface | Tone |
|---|---|
| Landing / marketing | Declarative, a little defiant. Short sentences. |
| Dashboard / product UI | Calm and instructive. Tell them what happened and what's next. |
| Empty states | Honest and actionable. Never apologetic, never cute. |
| Errors | What broke, then how to fix it. No "Oops!", no exclamation marks. |
| Discord / social | Loosest register. Still no hype words. |

**Do / don't:**

| Don't | Do |
|---|---|
| "Oops! Something went wrong 😬" | "Couldn't save your profile. Check your connection and try again." |
| "No creators yet!" | "No creators match that search. Try a different name or clear the filters." |
| "Unlock the power of your audience" | "Sell memberships to the people who already follow you." |
| "Join thousands of creators" | "10 creators. You'd be the eleventh." |
| "Revenue: $0" | "Revenue: $0 — no sales yet. Your storefront is live." |

**Punctuation and casing:**
- Sentence case for headings and buttons. Uppercase reserved for the display face and eyebrows.
- Em dashes for asides, no spaces around them in display copy, spaces in body copy.
- No exclamation marks in product UI. One is allowed per landing page, at most.
- Numbers: numerals always (`10 creators`, not `ten creators`) except at the start of a sentence.

---

## 4. Color

**Every value below was sampled from `public/brand/wage-crest.png`** — the official Discord
bot avatar — by quantising its pixels. Nothing here is invented.

> Earlier drafts sampled the **GIF**, which is heavily compressed. That produced a muddy
> `#D87800` amber, a dull `#B42400` red, and a "silver" `#C0C0CC` that turned out to be
> compression artefacts on what is actually **white** lettering. The clean PNG corrects all
> three. **Always sample the PNG.**

### Ground and text

| Token | Hex | Role |
|---|---|---|
| `--wage-ink` | `#06090B` | Page ground. The crest's shield is effectively black; keep it cool and near-black, never pure `#000`. |
| `--wage-ink-2` | `#0B1014` | Recessed surfaces, sidebars, inputs. |
| `--wage-panel` | `#11171C` | Cards and raised surfaces. |
| `--wage-line` | `#212A31` | Hairlines and card borders. |
| `--wage-line-hi` | `#313D47` | Hover borders, secondary button outlines. |
| `--wage-paper` | `#F4F7F9` | Primary text. The crest's lettering is white (`#FCFCFC`). |
| `--wage-muted` | `#8B98A3` | Secondary text. |
| `--wage-muted-2` | `#5C6771` | Labels, captions, disabled. |

### Accents — all of them are in the logo

| Token | Hex | Where it comes from | Role |
|---|---|---|---|
| `--wage-amber` | `#FC9000` | The beer filling the W | **The brand, and the primary action.** Buttons, prices, points, eyebrows. |
| `--wage-amber-2` | `#FFAA33` | Highlight on the same amber | Hover, and amber *text* at small sizes. |
| `--wage-red` | `#E43000` | The chevron under the crest | **Live and urgent.** Live badges, destructive confirmations. |
| `--wage-chrome` | `#E4E4E8` | The bevel under the lettering | Chart bars, rules, supporting marks. |

**Amber is both the brand and the action** — unlike v1.0's invented gold/ember split. It is
the dominant colour in the real logo, so it does both jobs. The discipline is quantity, not
hue: **one amber button per view.** Everything else is a ghost button.

**Red means live.** It is the crest's chevron colour and it matches the universal streaming
convention, so it needs no explanation. Never use red decoratively.

**There is no cyan and no violet in this brand.** Both came from the AI cover art. If you
need a third signal colour, use silver.

**Semantic colors stay separate** from the brand accents:

| State | Hex |
|---|---|
| Success | `#34D399` |
| Warning | `#E8A317` |
| Error | `#E5484D` |

### Rules

- Amber on ink: fine at any size. Amber *text* uses `--wage-amber-2` at 16px+.
- Never place amber and red adjacent as decoration — they carry different meanings
  (money vs. live) and reading them as a gradient destroys that.
- Gradients: card surface washes and the ambient hero warmth only. That warmth is
  **amber-only, single-hue** — no second colour. No gradient text, no gradient buttons.

---

## 5. Typography

Three faces, three jobs. All available on Google Fonts.

| Role | Face | Weights | Used for |
|---|---|---|---|
| **Display** | Archivo Black | 400 | Headlines, section titles, the logotype. Always uppercase, tracking `-0.02em`. |
| **Body** | Instrument Sans | 400 / 500 / 600 / 700 | All running text, buttons, labels, form fields. |
| **Data** | JetBrains Mono | 400 / 500 / 700 | Every number, price, tier chip, referral code, eyebrow, timestamp. |

**Why the mono face matters:** it is the single strongest signal that WAGE is an *operating
system* and not a brochure. Every figure a creator cares about — revenue, points, rank,
member count, their referral code — is set in mono with `font-variant-numeric: tabular-nums`
so columns line up. Do not set numbers in the body face.

**This replaces Space Grotesk + Inter**, which are the defaults the current site inherited.

### Scale

| Name | Size | Face |
|---|---|---|
| Hero | `clamp(56px, 8.4vw, 118px)` | Display |
| H1 | `clamp(34px, 4vw, 54px)` | Display |
| H2 | `clamp(24px, 2.4vw, 32px)` | Display |
| H3 | 17–19px, weight 700 | Body |
| Lede | 19px | Body |
| Body | 16px / 1.6 | Body |
| Small | 14px | Body |
| Eyebrow | 11px, `0.22em` tracking, uppercase | Data |
| Caption | 10.5px | Data |

Running text stays near 65 characters. Headings get `text-wrap: balance`.

---

## 6. The mark, and the system it generates

The crest is not just a logo to place — **it is the spec for every surface on the site.** Four
properties come off it, and each one has a direct counterpart in `src/index.css`:

| In the crest | In the interface |
|---|---|
| Hard diagonal corner cuts on the shield | `.wage-card`, `.wage-btn`, `.wage-chip`, `.input` are **notched**, not rounded — `clip-path` cuts the top-left and bottom-right corners. Radius is 2px, effectively square. |
| Extrusion — the badge has depth and a thick dark edge | Cards sit on a **hard offset shadow** (`5px 5px 0`, no blur). Buttons carry an inset bottom edge and physically **press down 2px** on `:active`. |
| Heavy white lettering on a dark outline | `.wage-cut` puts a hard `0 3px 0` dark edge under display type. Archivo Black without it reads as a generic web headline. |
| The red chevron tail | `.wage-chevron` marks every section eyebrow. |
| Glasses filling with amber under a white head | The homepage animation (`WageHero.tsx`) — columns fill from a red base through amber to a white foam cap. It's the glass, and it doubles as an earnings meter. |

**Placement rules:**
- Clear space on all sides equals the height of the `SOCIETY` band.
- Minimum 32px. Below that the internal lettering stops resolving and it reads as noise.
- **Never set a wordmark beside it** — the crest already contains the name.
- Never flatten the bevel, recolour it, add a glow, place it inside a circle or rounded-square
  container, stretch it, or drop it on a busy photo without a solid scrim.
- Never rebuild it in another typeface. It is artwork, not type.

---

## 7. Iconography

One family, drawn on a 24px grid with a **1.5px stroke**, round caps and joins, no fills.
Gold by default, `--muted-2` when inactive. Icons never appear without a text label in
navigation.

Core set: earn, stream, merch, network, stats, profile, discord, live.
Source: `src/components/Icon.tsx`.

Emoji are not icons. They do not appear in product UI, headings, or section markers.

---

## 8. Imagery

The two approved covers define the look: deep black space, a luminous amber portal, human
silhouettes rimmed in cyan and violet, and thin connection lines between nodes.

- **Always:** near-black ground, one dominant light source, warm core cooled at the edges.
- **People:** silhouettes and rim-light rather than stock-photo faces. WAGE is about the
  creator, not a model.
- **Never:** bright/white backgrounds, business-stock imagery, generic gradient meshes,
  or AI art that doesn't carry the portal motif.

Creator-supplied avatars and merch photos are the exception — those are theirs, shown as-is
on a panel surface.

---

## 9. Motion

Motion belongs to the mark's mirror device, and nothing else.

- **Ambient — the pour.** On the homepage, columns fill and settle beneath the crest. Each one
  is a glass from the logo's W: deep red at the base, amber through the body, a white foam cap
  on top. It reads as an earnings meter at the same time, which is the point. Square edges
  only — the geometry has to match the badge's flat facets.
- **Transitions:** 120–200ms, ease-out. Hover shifts border colour, never size.
- **`prefers-reduced-motion: reduce` renders one static frame** of the ledger and disables
  every transition.
- Paused whenever the tab is hidden.

No glows, no pulsing rings, no parallax on scroll, no bouncing, no auto-playing carousels.
The crest's own spin is the only rotation in the system, and it stays on streaming surfaces.

---

## 10. Components

Every surface is **notched** (top-left and bottom-right corners cut) and sits on a **hard,
unblurred offset shadow**. Nothing on this site is a rounded rectangle.

**Tier chips** encode membership in hue *and* border, never text alone:
Free → muted · Creator → chrome · Pro → amber · Elite/Unlimited → amber-2 · Live → solid red.

**Stat tiles** show the number in mono, the label in a mono eyebrow, and — when the value is
zero — a line explaining why it's zero and what to do about it.

**Empty states** follow the voice rules: state the fact, then give the action. No illustrations,
no apologies, no invented counts.

**Buttons:** one ember primary per view. Ghost buttons for everything secondary. Gold buttons
only for brand moments. Text buttons for tertiary actions.

---

## 11. Accessibility

- Body text meets 4.5:1 against its background; large display text meets 3:1.
- Amber text uses `--wage-amber-2` at 16px minimum. Base amber is for fills, not small type.
- Every interactive element has a visible `:focus-visible` ring in amber at 2px.
- Color never carries meaning alone — tier chips pair hue with a label, live state pairs
  red with a dot and the word "Live."
- The monogram always ships with a real `alt` of "W.A.G.E. Society"; the ledger canvas is
  decorative and carries `aria-hidden`.
- All motion respects `prefers-reduced-motion`.

---

## 12. Where the assets live

| Asset | Path |
|---|---|
| Color + type tokens | `src/index.css`, `tailwind.config.cjs` |
| **Monogram (primary mark)** | `public/brand/wage-monogram-light.png` · `-dark.png` |
| **Crest (streaming surfaces)** | `public/brand/wage-crest.gif` |
| Favicon + PWA icons | `public/images/` |
| Icon family | `src/components/Icon.tsx` |
| Hero ledger animation | `src/components/WageHero.tsx` |
| Shared UI (chips, stat tiles, empty states) | `src/components/ui/` |
| OG share card | `public/og.png` |
| AI cover art — **not** brand assets | `docs/brand-assets/` |
| Visual brand guide | `docs/mockups/brand-guide.html` |

Original delivered logo files live outside the repo at
`F:\Work\Logos & Branding\wage_logo_kick.gif` and
`F:\Work\Projects\…\STOTTEYMAN ENTERPRISES\WAGE SOCIETY\IMAGES\wagesociety black|white.jpg`.

---

## Changelog

**3.0 — 2026-07-27** — **The crest is the logo; the WS monogram is retired.** Rebuilt the whole
interface from the badge's own properties rather than treating it as an image to place: notched
corners on every surface, hard offset shadows instead of soft blur, extruded buttons that press,
`.wage-cut` dark edge under display type, the chevron as a section marker, and a homepage
animation that is the glass from the W filling. Retired monogram files moved to
`docs/brand-assets/legacy/`.

**2.0 — 2026-07-27** — Rebuilt on the real logo files. Replaced the invented portal ring with
the WS monogram as the primary mark and the beer-glass crest as the streaming mark; resampled
the entire palette from the crest (amber `#D87800`, red `#B42400`, silver `#C0C0CC`, blue-black
ground) and **removed the cyan and violet that never existed in the brand**; replaced the
particle/portal hero with the ledger animation derived from the monogram's mirror device.
Flagged `docs/brand-assets/` as AI illustration rather than identity.

**1.0 — 2026-07-27** — First edition. Moved type off Space Grotesk + Inter to Archivo Black /
Instrument Sans / JetBrains Mono, settled "We All Gotta Eat" as the canonical expansion, and
wrote the voice rules from the existing No Placeholder Rule. *Its colour and mark sections were
derived from AI cover art and are superseded by 2.0.*
