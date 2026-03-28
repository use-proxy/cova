# Cova Session Memory
# Read this FIRST at the start of every Claude Code session

## Last Updated
2026-03-28 — Sprint 8 COMPLETE (Dashboard V0 UI)

## Current Sprint
Sprint 8 — COMPLETE. Next: Sprint 9 (TBD).

## What Was Done This Session (Sprint 8 — Gap Fixes)
Pranav built the core Sprint 8 dashboard UI (HomeScreen, PastStylesScreen, MainNavigator tabs, HomeStack nav). This session fixed spec gaps:
- Greeting text: removed extra phrases — now exactly "Good morning/afternoon/evening, [name]"
- Empty state button: "Design Your First Room" → "Start Designing" (spec match)
- Hero card: "Continue →" → "Continue Designing", only shown for incomplete rooms (no render)
- Hero gradient: improved from flat overlay to two-layer gradient simulation (dark bottom, transparent top)
- Masonry grid: now filters to rooms with AI renders only (spec: "AI renders only, NOT original photos")
- PastStylesScreen: added pull-to-refresh (RefreshControl)

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

## What's NOT Working / Pending
- Apple Sign In: code fixed, needs physical device verification
- Google Sign In: needs EXPO_PUBLIC_GOOGLE_CLIENT_ID in .env + physical device test
- LiDAR Sub-sprint B/C: blocked on physical device
- expo-sensors Accelerometer: conditional require workaround — needs native rebuild for full function
- Products: 5,581 total (3,052 with CLIP embeddings, 2,529 with placeholder images)
- 3D models: 665 total (Poly Haven 149, Sketchfab 216, Poly Pizza 300)
- Swipe cards: 950 total (exceeds 923 target)
- Flow 02 (style quiz): pre-existing "Budget" step failure — not a regression

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
