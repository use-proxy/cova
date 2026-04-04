# Cova — Build Status
Last updated: 2026-04-03

---

## Current Milestone: M8 (Commerce) — In Progress

The pipeline runs end-to-end. Rooms can be created, captured, processed through full redesign, and viewed in 3D with product hotspots. Chatbot is wired. The focus now is polish, reliability, and commerce (affiliate links live, hotspot UX refined).

---

## Milestone Status

| Milestone | Description | Status |
|---|---|---|
| M0 | Setup — accounts, credentials, CLAUDE.md | ✅ DONE |
| M1 | Pipeline Proof — AnySplat on Modal, 3D viewer | ✅ DONE |
| M2 | Seed Catalog — product scraping, CLIP embeddings | ✅ DONE |
| M3 | Web Foundation — Next.js scaffold, auth | ✅ DONE |
| M4 | Quiz + Capture + UI Pass 1 | ✅ DONE |
| M5 | Processing + Viewer + UI Pass 2 | ✅ DONE |
| M6 | Full Catalog — 12 retailers, ~18k products | ✅ DONE (Amazon active; others pending program approval) |
| M7 | AI Redesign Pipeline — full pipeline end-to-end | ✅ DONE |
| **M8** | **Commerce — hotspots, product panel, affiliate URLs** | **🔄 IN PROGRESS** |
| M9 | Chatbot + Analytics + UI Pass 3 | 🔲 PLANNED |
| M10 | Polish + User Testing | 🔲 PLANNED |
| M11 | Deployment — Vercel, covainterior.com | 🔲 PLANNED |
| M12 | iOS Shell — Expo WebView, TestFlight | 🔲 PLANNED |
| M13 | Final UI Polish + Landing Page | 🔲 PLANNED |
| M14 | VC Prep — example rooms, pitch deck | 🔲 PLANNED |

---

## What's Working (as of 2026-04-03)

### Auth
- [x] Google OAuth sign-in
- [x] Apple OAuth sign-in
- [x] Magic link email
- [x] Auth callback with room-check redirect
- [x] Session middleware (HTTP-only cookies)

### Room Creation + Capture
- [x] `/capture/new` — creates room, redirects
- [x] `/capture/[roomId]` — multi-mode capture (QR, webcam, upload)
- [x] QR capture token (JWT, 1h expiry, validated server-side)
- [x] Mobile camera capture page

### Pipeline
- [x] Multi-image capture → Marble 3D world
- [x] FLUX Kontext redesign
- [x] Marble Plus quality upgrade (async background)
- [x] Depth video pipeline
- [x] Pre-detection pipeline
- [x] Furniture matching (Claude Vision + CLIP + pgvector)
- [x] Product hotspots in room_products table
- [x] Pipeline status polling API (`/api/rooms/status`)
- [x] Multiple pipeline modes (full, mini_both, mini_async_plus, multi_image)

### Viewer
- [x] SparkJS 3D splat viewer
- [x] Real/redesigned toggle
- [x] FurnitureHotspots overlay (azimuth/elevation → screen projection)
- [x] ProductPanel (swipe between 3 matches)
- [x] Chatbot (Claude Sonnet streaming, style-aware)

### Dashboard
- [x] Room list with thumbnails
- [x] Style profile display
- [x] New room CTA

### Commerce
- [x] Affiliate URL builder (all 11 retailers)
- [x] Amazon affiliate tag active (cova03-20)
- [ ] Target, Article, C&B and others: pending program approval

---

## Known Issues

| Issue | Severity | Notes |
|---|---|---|
| `components/ProductPanel.tsx` (root) was orphaned | Fixed in Session 0 | Deleted, `components/product/ProductPanel.tsx` is authoritative |
| 3 direct `@supabase/supabase-js` imports | Fixed in Session 0 | All now use lib wrappers |
| chat-room Edge Function model name | Fixed in Session 0 | Changed to claude-sonnet-4-5 |
| `any` types in RoomChatbot.tsx | Open | Document in Session 1 backlog |
| Hardcoded hex colors in auth/page.tsx, capture/mobile | Open | Schedule for M13 UI polish |
| `.claude/settings.local.json` had keys in bash history | Flagged | File not in git, added to .gitignore |
| Supabase signed URL tokens in modal_pipeline test scripts | Flagged — Low | These are expired, time-limited tokens. Not live credentials. |
| Tailwind color `navy.deep` slightly off (#0B1F3A vs #0A1628) | Open | Fix in UI pass |
| Framer Motion v12 (spec says v11) | Accepted | v12 working, spec updated |
| Zustand v5 (spec said v4) | Accepted | v5 working, spec updated |

---

## Affiliate Program Status

| Retailer | Status | Action Needed |
|---|---|---|
| Amazon | ✅ Active — cova03-20 | None |
| Target | Pending — Impact | Verify covainterior.com on Impact, apply |
| Article | Not applied | Apply at article.com/affiliates |
| Crate & Barrel | Not applied | Apply via Sovrn |
| CB2 | Not applied | Apply via Sovrn (same account as C&B) |
| West Elm | Not applied | Apply via ShareASale |
| Ruggable | CJ account active | Apply for Ruggable program |
| One Kings Lane | CJ account active | Apply for OKL program |
| Pottery Barn | Not applied | Apply via ShareASale |
| Overstock | CJ account active | Apply for Overstock program |
| Etsy | Not applied | Apply via Awin |
| Wayfair | Closed | Check cj.com quarterly |
| IKEA | No program | Direct links only |

---

## Next Session Goals

1. Verify hotspot UX end-to-end on real room
2. Test affiliate links for Amazon products
3. Wire PostHog analytics events (quiz_completed, product_panel_opened, etc.)
4. Fix remaining `any` types in RoomChatbot.tsx
5. Sentry error boundary setup
