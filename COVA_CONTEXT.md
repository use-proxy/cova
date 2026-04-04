# Cova — Project Context
Last updated: 2026-04-03

---

## What is Cova?

Cova is an AI interior design web app. A user takes a short video walkthrough of their room, swipes through a personalized style quiz, and receives a photorealistic AI redesign of their space — with real, purchasable furniture matched to their style, browsable via interactive 3D hotspots.

**North star:** Magical, personal, effortless. The user does almost nothing and gets a professional-quality redesign with real furniture they can buy.

**Founders:** Daksh Parikh + Pranav Goel  
**Repo:** github.com/p-g-o-e-l/813  
**Domain:** covainterior.com  
**Supabase project:** xdeacbmkdwqrwxonqaqh

---

## User Journey (Happy Path)

```
Landing page
    ↓ Sign in (Google / Apple / magic link)
    ↓
Quiz — swipe cards to build style fingerprint
    ↓
Budget selection — 5 tiers ($0–$15k+)
    ↓
Capture — multi-photo or QR-to-phone camera
    ↓
Processing (2–3 min)
  ├── Track 1: Room reconstruction → 3D splat (AnySplat on Modal A10G)
  ├── Track 2: AI redesign (FLUX Kontext via Replicate + Marble 3D lift)
  └── Track 3: Product matching (Claude Vision → CLIP → pgvector → hotspots)
    ↓
Room viewer — SparkJS 3D viewer with gold hotspot pins
    ↓ tap hotspot
Product panel — 3 matching products per furniture item, affiliate links
    ↓ chat bubble
Chatbot — Claude Sonnet, style-aware, can suggest swaps
    ↓
Dashboard — all past rooms, style profile over time
```

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Web framework | Next.js 14 App Router | App Router server components + API routes |
| Auth | Supabase + @supabase/ssr | HTTP-only cookies, no localStorage |
| Database | Supabase (PostgreSQL + pgvector) | 768-dim CLIP embeddings, RLS |
| 3D viewer | SparkJS (@sparkjsdev/spark) | Gaussian splat rendering in browser |
| 3D reconstruction | AnySplat on Modal A10G | Feed-forward, no COLMAP, indoor-trained |
| AI redesign | FLUX Kontext Pro via Replicate | Best-in-class inpainting/outpainting |
| 3D lift | Marble API (primary) + SHARP fallback | Both maintained until M7 evaluation |
| Product embeddings | CLIP via Replicate (768-dim) | Visual similarity + style matching |
| Style AI | Claude Sonnet 4 (claude-sonnet-4-5) | Prompt generation + chatbot |
| Analytics | PostHog | User behavior, funnel analysis |
| Monitoring | Sentry | Error tracking |
| State | Zustand v5 | 3 stores: user, room, camera |
| Animation | Framer Motion v12 | Page transitions, panel animations |
| Styling | Tailwind CSS 3.4 + CSS variables | Design token system in styles/tokens.css |
| GPU infra | Modal | A10G primary, L4/A100 fallback |
| Deployment | Vercel | Production at covainterior.com |

---

## Five Interior Styles (Never Show to Users)

The quiz surfaces these as style fingerprints — never display these names in the UI.
Use descriptive language instead (e.g. "your design style", "your aesthetic").

1. **Japandi** — warm minimalist, natural materials, wabi-sabi
2. **Bohemian** — eclectic, layered textiles, global patterns
3. **Coastal** — airy, natural fibers, soft blues and whites
4. **Mid-Century Modern** — organic forms, warm woods, retro palette
5. **Minimalist** — clean lines, neutral palette, negative space

---

## Active Affiliate Programs

| Retailer | Program | Status | Tag |
|---|---|---|---|
| Amazon | Amazon Associates | ACTIVE | cova03-20 |
| Target | Impact | Pending approval | — |
| Article | AWC direct | Apply | — |
| IKEA | None | Direct links only | — |
| Crate & Barrel | Sovrn | Apply | — |
| CB2 | Sovrn | Apply | — |
| West Elm | ShareASale | Apply | — |
| Ruggable | CJ | Apply | — |
| One Kings Lane | CJ | Apply | — |
| Pottery Barn | ShareASale | Apply | — |
| Overstock | CJ | Apply | — |
| Etsy | Awin | Apply | — |

---

## Pipeline Architecture

### Track 1 — Room Reconstruction (~30s, ~$0.40)
```
Video/photos → AnySplat on Modal A10G
→ Gaussian splat (.spz) + camera poses
→ Supabase Storage
```

### Track 2 — AI Redesign (~2–3 min, ~$1.10)
```
Photos → Marble multi-image pipeline
→ gsplat equirectangular 360° panorama
→ FLUX Kontext Pro (Replicate) — style-guided redesign
→ Marble API — lift 2D redesign back to 3D splat
→ Background Plus upgrade (async, ~5 min)
```

### Track 3 — Product Matching (~26s, ~$0.15)
```
Redesigned panorama
→ Claude Vision — detect all furniture items
→ CLIP text embed (Modal endpoint) — embed each description
→ pgvector cosine search (Supabase RPC)
→ Style vector re-ranking (×1.10 match / ×0.85 miss)
→ Retailer diversity enforcement
→ Top 3 per item → stored in room_products table
→ SparkJS hotspot pins at azimuth/elevation coordinates
```

---

## Pipeline Mode

Controlled by `PIPELINE_MODE` env var. Default: `full`.

| Mode | Description | Cost |
|---|---|---|
| `full` | Multi-image + flythrough + async Plus | ~$1.46 |
| `mini_both` | Mini for capture + Mini for redesign | ~$0.30 |
| `mini_async_plus` | Mini + async Plus upgrade | ~$1.46 |
| `multi_image` | Multi-image, no Plus | ~$0.28 |

---

## CLIP Matching Rules

- Threshold: **0.65** minimum similarity (not 0.70 — maximizes hotspot coverage)
- Detect furniture on **cube face crops**, not equirectangular panorama (distortion issue)
- Fusion embeddings (text+image) preferred over image-only when available
- Category group fallback: if exact category not found, search related categories

---

## Key Decisions (locked)

| Decision | Choice | Reason |
|---|---|---|
| Auth storage | HTTP-only cookies only | No localStorage ever |
| SplatViewer import | Dynamic with `ssr: false` | Three.js requires window object |
| SparkJS import | npm package only | Never CDN |
| Style names in UI | Never shown | Use descriptive language only |
| QR token | JWT validated server-side | Security for video upload |
| Mobile app | FROZEN (apps/mobile) | V0 iOS, V1 is web-first |
| Edge Functions | FROZEN (5 of 6) | Only chat-room model name changeable |
| Font | EB Garamond (heading) + Inter (UI) | Elegant + legible |
| CLIP threshold | 0.65 | More hotspots = better commerce |

---

## Supabase Schema (Frozen Tables)

**Never alter these:**
- `products` — 5,581+ rows with 768-dim CLIP embeddings
- `quiz_cards` — 950 rows
- All existing table columns

**Added columns (via permitted migrations):**
- `renders.splat_url`, `redesign_splat_url`, `style_vector`, `is_public`, `modal_job_id`, `marble_operation_id`

**Active tables (web app reads/writes):**
- `rooms` — one per user capture session
- `room_products` — furniture matches per room (hotspot data)
- `quiz_cards` — quiz swipe cards
- `swipe_history` — per-swipe style signal data
- `chat_messages` — room chat history
- `redesign_feedback` — viewer engagement telemetry
- `profiles` — user profiles
- `user_style_profiles` — aggregated style fingerprint

---

## Environment: What's Present vs Missing

See `apps/web/.env.local` for all current values. Missing items:
- Affiliate IDs for Target, Article, C&B, CB2, West Elm, Ruggable, OKL, Pottery Barn, Overstock, Etsy — all pending program approval
- `MARBLE_MINI_FINAL_WEBHOOK_URL` — deploy pipeline first, then fill in

---

## Current Milestone

See `docs/STATUS.md` for current build state.
