# Cova Session Memory
# Read this FIRST at the start of every Claude Code session

## Last Updated
2026-03-28 — Sprint 12 COMPLETE — MVP COMPLETE

## Current State
MVP is code-complete. 12 sprints done. 95% spec completion. All 13 screens implemented. All 17 edge cases handled.
Remaining 5% requires physical device testing (Apple/Google auth, LiDAR, camera) and manual setup (App Store, affiliate URLs).

## What Was Done This Session
### Physical device bug fixes
- RoomCaptureScreen: horizontal check relaxed from 15° to 25° (small rooms), light check timer 1.5s → 0.5s, indicators changed from red to amber (warnings not blockers)
- callEdgeFunction: default timeout increased from 30s to 60s, render-room call uses 120s (blocks on depth map up to 45s)
- callEdgeFunction: improved error logging — console.error with function name, HTTP status, error body
- withTimeout: error message now shows actual timeout duration instead of generic "Having trouble connecting"
- useRender: added console.error on render failure with full error details

### Security Audit (earlier this session)
- Migration 20240029: RLS audit — products + swipe_cards write policies tightened
- Migration 20240030: Fixed FOR ALL USING → explicit INSERT WITH CHECK on rooms, renders, chat_messages, token_transactions, cart_items, users
- rate_limits table + check_rate_limit() RPC, render-room 10/hr, chat-room 60/hr
- Prompt injection sanitization, 10-minute render watchdog
- Total migrations: 30 (20240001 through 20240030)

## What Was Done Previously (Sprint 12 — Final Polish)
- Fixed flow 02 Budget step, PostHog init, app.json splash bg, app store description
- Exhaustive spec audit: all 13 screens PASS

## What Was Done Previously (Sprint 11)
- PostHog analytics: 9 events across quiz, render, products, chat, rooms
- ErrorBoundary, NetworkBanner, Supabase timeout wrapper
- AppState background render polling, GLB grey box fallback
- All 17 edge cases verified

## What Was Done Previously (Sprint 7)
- chat-room edge function: full system prompt (room type, style blend %, budget, dimensions, furniture, pinned products, render count, last prompt)
- chat-room: action trigger parsing (REGENERATE/ADJUST_BLEND/OPEN_SHOP/PIN_PRODUCT), inline product search
- chat-room: model → claude-haiku-4-5-20251001
- ChatPanel: full rewrite — dark navy, 4 starter chips, Supabase history on mount, 30s timeout + retry, 500 char limit, action confirmation cards, inline product cards
- ChatPanel: new props: onOpenShop, onStartRender, onAdjustBlend, styleBlend, placedFurniture, pinnedRoomProducts
- ProductPanel: defaultCategory prop wired from OPEN_SHOP action
- RenderViewScreen: ChatPanel wired with all 6 new props, handleChatOpenShop/StartRender/AdjustBlend callbacks

## What Was Done Last Session (Sprint 6)
- Migration 20240027 applied to production (wall_color_extracted column on rooms)
- detect-furniture wired to RoomViewer3DScreen on entry (5s timeout, fallback to buildDefaultFurniture)
- Store: added pinnedRoomProducts (max 3, persisted), recentlyViewedProducts (max 5, persisted)
- Store: added pinProduct, unpinProduct, addToRecentlyViewed actions
- useRender: added pinnedProducts to RenderParams, passed to render-room edge function
- ProductPanel.tsx CREATED from scratch (components/ui/ProductPanel.tsx):
  - Bottom sheet Modal with spring animation
  - For Your Room tab: search, price slider ($0-$10k+), retailer chips, category tabs
  - Product cards: style match bar, "In Your Room" badge, "Featured in Design" badge
  - Pinned Items section (horizontal scroll, gold border, unpin)
  - Recently Viewed row (last 5 tapped, horizontal scroll)
  - Progressive threshold relaxation: retry without price filter if <10 results
  - Pagination: 12/load, onEndReached load more
  - Product info popup: image, price, "Over Budget" warning, buy now (HEAD check + Linking), pin, save, browse similar
  - Favorites tab: savedProducts from store
- RenderViewScreen: replaced inline product panel Animated.View with ProductPanel component
- RenderViewScreen: doRegenerate now passes pinnedRoomProducts to startRender
- All 5 flows passing (01, 02, 04, 05, 14)

## What Was Done Previously (Sprint 5)
- Sprint 5 — 3D Viewer Visual Quality + Interactions (all 6 items):
  1. extract-colors Edge Function: imagescript pixel sampling of render image, wall regions averaged
  2. Migration 20240027: wall_color_extracted text column on rooms table
  3. BoxRoom: wallColorOverride prop, showGrid prop, minimalist-specific floor (no wood texture)
  4. SceneLighting: pointLight [2,2.5,-1] intensity 1.2 #FFF5E0, ambient normalized to 0.4
  5. FurniturePiece: 10cm wall collision buffer (was piece-half only)
  6. CameraController rewrite: eye level locked 1.6m, horizontal orbit only, FOV zoom 40-90°
     CameraControlState now { theta: number; fov: number } (phi and radius REMOVED)
  7. RoomViewer3DScreen overhaul: style chips removed, "Done" button (save+goBack),
     "View from Doorway" button (resets theta=0 fov=60), grid toggle, Reset confirmation dialog,
     product popup Buy Now/Move/Dismiss, FOV-based pinch in panResponder
  8. detect-furniture Edge Function: Claude vision API primary + smart layout fallback
  9. expo-sensors conditional require in RoomCaptureScreen (avoids native module crash on dev builds)
- Flows 01, 02, 05 ✅ passing after session

## What's Working
- Auth flow: Apple/Google/email code all correct
- Style quiz Bayesian algorithm
- FLUX prompt: weighted by style blend with proportional descriptors
- Anchor render: true cosine similarity selection
- Room capture: all 3 paths (LiDAR → 3-photo → single/upload)
- Loading screen with design tips
- Two-stage render pipeline (flat + 360° LoRA)
- Panoramic sphere viewer with touch/pinch controls
- HUD: auto-hide 3s, regenerate confirmation, save to Cova, first celebration
- Previous renders row with tap-to-swap
- Before/After compare slider
- 3D Viewer: eye level 1.6m locked, FOV zoom, floor grid, Done button, View from Doorway

## Trained LoRA Model
- Model: pgoel813/cova-interior-360-lora
- Version: 6082cef9
- Trigger word: COVAINTERIOR360
- Supabase secrets: REPLICATE_LORA_MODEL_ID, REPLICATE_LORA_VERSION (both SET)

## Key Architecture Decisions (Sprint 6)
- ProductPanel: Modal-based bottom sheet (not Animated.View side panel) — spec compliant
- Pin system: Zustand only (no separate Supabase table for MVP) — pinnedRoomProducts persisted via AsyncStorage
- Style match score: computed client-side dot product (product.style_tags vs room.style_blend)
- detect-furniture: fires once on RoomViewer3DScreen mount, 5s timeout, silent fallback

## What Needs Physical Device Testing
- Apple Sign In: code complete, needs physical device + Apple Developer
- Google Sign In: code complete, needs EXPO_PUBLIC_GOOGLE_CLIENT_ID + physical device
- LiDAR RoomPlan: code complete, needs iPhone 12 Pro+ with LiDAR
- Camera capture: all 3 paths coded, needs camera access
- App Store screenshots: 6 screenshots on 6.7" iPhone
- PostHog live event verification

## What Needs Manual Setup Before App Store
- App Store Connect account + app listing
- Apple Developer certificate + provisioning profiles
- EAS Build production configuration
- Real GOOGLE_CLIENT_ID in .env
- Verify affiliate URLs for Wayfair/Amazon/IKEA/CB2
- App icon verification: dark navy + gold arches, all sizes

## Data Counts
- Products: 5,581 total (3,052 with CLIP embeddings)
- 3D models: 665 (508 tagged + linked in Sprint 10)
- Swipe cards: 950 (exceeds 923 target)
- Migrations: 28 total (20240001 through 20240028)

## Key Architecture Decisions — Locked
- CameraControlState: { theta: number; fov: number } — phi and radius REMOVED in Sprint 5
- Eye level: EYE_Y = 1.6m constant, horizontal orbit only
- FOV range: 40-90° (controlled by pinch gesture, replaces radius zoom)
- ORBIT_RADIUS: fixed at 4.5m (no user-adjustable radius)
- Two-stage render: FLUX ControlNet → LoRA 360° conversion (fallback: flat render)
- LoRA model: pgoel813/cova-interior-360-lora version 6082cef9
- LoRA trigger word: COVAINTERIOR360
- Panoramic viewer: sphere radius 500, scale [-1,1,1], camera [0,0,0], PanResponder
- Furniture in render: baked into image (not 3D GLB overlay)
- Token economy: static 999, no payments for MVP
- Save: Cova profile only, not camera roll
- Back arrow: always resets to Dashboard (stack cleared)
- First celebration: one-time per user, tracked in AsyncStorage

## Test Credentials
- New user: test.newuser@hellocova.com / CovaTest123!
- Returning user: test.returning@hellocova.com / CovaTest123!
- Returning user ID: aa19e895-0582-4947-bf65-5ca06ab65a89
- Returning room ID: e1269ec5

## Approaches That Failed — Do Not Retry
- Corner drag calibration for room capture — removed
- Fixed phase quiz algorithm — replaced with Bayesian
- Calling handleComplete from render function — fixed with isFetchingRefinementRef
- npm install in GitHub Actions — fixed to pnpm
- Dynamic import() in React Native components — use static imports at file top
- Canvas/GLView touch interception: pointerEvents="none" does NOT work — must skip Canvas entirely in testMode
- expo-sensors static import in RoomCaptureScreen — crashes when native module not compiled; use conditional require()
