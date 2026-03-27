# CLAUDE.md — Cova Project Intelligence File
# "tinder for your home" | AI Interior Design App
# Daksh Parikh & Pranav Goel | hellocova@gmail.com
# Bundle ID: ai.cova.app | Supabase: xdeacbmkdwqrwxonqaqh
#
# ⚠️ READ ORDER AT SESSION START — MANDATORY:
# 1. SESSION_MEMORY.md (~/Desktop/cova/.claude/SESSION_MEMORY.md)
# 2. COVA_MVP_SPEC_v1.1.docx (repo root — THE master spec, overrides everything)
#    → Convert with: pandoc COVA_MVP_SPEC_v1.1.docx -t markdown -o /tmp/spec.md
#    → Or read the pre-converted COVA_MVP_SPEC_v1.1.md if present
# 3. SPRINT_LOG.md (repo root — current progress)
# 4. This file (CLAUDE.md — architecture, rules, known errors)
#
# COVA_MVP_SPEC_v1.1.docx is the PRIMARY SPEC AUTHORITY.
# It wins over this file wherever they conflict.
# This file (CLAUDE.md) wins over individual prompts for architecture rules.
# PRODUCT_TRUTH.md is superseded — do not use it.

---

## 0. MANDATORY SESSION START

Every session begins with this exact sequence. No exceptions.

```
1. Read ~/Desktop/cova/.claude/SESSION_MEMORY.md
2. Read MVP_SPEC.md fully
3. Read SPRINT_LOG.md
4. Read this file
5. Only then write any code
```

Every session ends with:
```
1. Update SESSION_MEMORY.md: what changed, what failed, what's next
2. Update SPRINT_LOG.md: mark completed, note skipped items with reason
3. git add -A && git commit -m "sprint: [description]" && git push origin main
```

---

## 1. SPRINT EXECUTION PIPELINE

Every fix, feature, or change follows this pipeline. No exceptions.

**Step 1 — Read spec**: Identify the exact spec item from MVP_SPEC.md with its acceptance criteria.

**Step 2 — Planner Agent**: `Use the planner agent to break this into implementation phases.`
Planner reads MVP_SPEC.md + CLAUDE.md + files in scope. Outputs numbered phase list. Touches ZERO code.

**Step 3 — Executor Agent**: `Use the executor agent to implement phase [N].`
Implements exactly one phase. Only touches files in scope. Stops if out-of-scope file must be touched.

**Step 4 — Verifier Agent**: `Use the verifier agent to verify phase [N] against the spec.`
Returns PASS / FAIL / PARTIAL with file:line refs. If FAIL/PARTIAL → executor re-implements only that phase.

**Step 5 — TypeScript check**: `npx tsc --noEmit` — must pass with zero errors before marking done.

**Step 6 — Maestro smoke test**: Run relevant flow from the 5 approved flows (see §5).

**Step 7 — Mark done**: Update SPRINT_LOG.md and SESSION_MEMORY.md. Commit.

---

## 2. PROJECT OVERVIEW

React Native iOS-only app. Core loop: Style Quiz → Room Capture → AI Render → 360° Panoramic View → Arrange Furniture → Buy Products.

**The #1 Product Rule:** The AI render IS the product. The panoramic view is the primary experience. The 3D viewer is the furniture arrangement tool only — never the primary experience.

**Core User Flow:**
```
Splash (2s fade) → Auth →
  New User: Room Entry → Instructions → Style Quiz → Budget Slider → Room Capture → Loading → Render View
  Returning User: Dashboard → New Room → Past Styles Page → [pick style or start fresh] → Budget Slider → Room Capture → Loading → Render View
```

**NOT MVP — Never Build These:**
- Discover/Explore social feed, Realtor mode, Designer marketplace
- Real token payments / Apple IAP / Stripe
- Light mode theme, iPad support
- AR walkthrough scan, Re-render from furniture arrangement
- Share Cova referral, Style switching post-render, Recreate This Room

**Already Seeded — Do Not Re-Run Data Pipeline:**
- 3,136 products (Wayfair 1222, Amazon 962, IKEA 941, CB2 11)
- 423 swipe cards in swipe-cards bucket
- CLIP embeddings 768-dim with IVFFlat index
- Migrations: 20240018000000, 20240019000000, 20240020000000
- DO NOT RE-RUN DATA PIPELINE SCRIPTS — creates duplicates

---

## 3. MONOREPO STRUCTURE

```
~/Desktop/cova/
├── CLAUDE.md                           ← this file (architecture rules)
├── MVP_SPEC.md                         ← single source of truth for product
├── SPRINT_LOG.md                       ← sprint progress tracking
├── SCRAPING_LOG.md                     ← product/GLB scraping results
├── package.json                        ← pnpm overrides (critical — see §4)
├── .claude/
│   ├── SESSION_MEMORY.md               ← cross-session memory (read first)
│   └── agents/{planner,executor,verifier}.md
│
├── apps/mobile/
│   ├── app.json                        ← bundle: ai.cova.app, iOS only, newArchEnabled:false, userInterfaceStyle:dark
│   ├── metro.config.js                 ← MUST include glb/gltf/hdr in assetExts
│   ├── .env                            ← ONLY anon key + URL (never secrets)
│   ├── src/
│   │   ├── screens/auth/{SplashScreen,AuthScreen}.tsx
│   │   ├── screens/main/
│   │   │   ├── HomeScreen.tsx          ← Dashboard (masonry grid, hero render, tabs)
│   │   │   ├── StyleQuizScreen.tsx     ← Bayesian algorithm, card swiping
│   │   │   ├── RoomCaptureScreen.tsx   ← LiDAR + 3-photo + single photo/upload
│   │   │   ├── RoomViewer3DScreen.tsx  ← 3D arrange screen (GLB furniture)
│   │   │   ├── RenderViewScreen.tsx    ← panoramic render view, HUD, chat
│   │   │   ├── ShopScreen.tsx          ← product panel
│   │   │   └── ProfileScreen.tsx       ← profile, favorites, settings
│   │   ├── components/3d/{BoxRoom,SceneLighting,FurniturePiece,CameraController,PanoramaViewer}.tsx
│   │   ├── components/ui/{TokenBalance,LoadingOverlay,ProductPanel,ChatPanel}.tsx
│   │   ├── navigation/RootNavigator.tsx
│   │   ├── store/index.ts              ← Zustand, ALL slices
│   │   ├── hooks/{useRender,useAuth,useRoomPlan}.ts
│   │   ├── lib/{supabase,posthog}.ts   ← single instances
│   │   └── data/{furnitureCatalog,glbAssets}.ts
│   ├── modules/{RoomPlanModule.swift,RoomPlanModule.m}
│   └── assets/{3d/furniture/*.glb, textures/*.{jpg,hdr}}
│
├── packages/shared/src/{types,index}.ts   ← ALL shared TS types
│
├── scripts/
│   └── scrape-all.ts                   ← autonomous product + GLB scraper
│
└── supabase/functions/
    ├── render-room/index.ts            ← FLUX render pipeline
    ├── get-render-status/index.ts      ← polling endpoint
    ├── clip-embed/index.ts             ← 768-dim CLIP embeddings
    ├── match-products/index.ts         ← style-matched product ranking
    ├── chat-room/index.ts              ← Claude API chatbot
    ├── delete-account/index.ts         ← full account deletion
    └── tests/render-pipeline.test.ts   ← must always exist
```

---

## 4. LOCKED VERSIONS — NEVER CHANGE FOR ANY REASON

```
expo                         ~52.0.49       (never 53+)
react                        18.3.1 EXACT
react-dom                    18.3.1 EXACT
@react-three/fiber           8.17.10 EXACT  (8.18+ breaks expo-gl on iOS)
@react-three/drei            9.88.0 EXACT
three                        0.155.0 EXACT  (0.156+ breaks geometry/material APIs)
@react-three/postprocessing  2.15.0
node                         20.x           (never 22+)
```

Root `package.json` pnpm overrides — must always be present:
```json
{ "pnpm": { "overrides": { "react": "18.3.1", "react-dom": "18.3.1", "three": "0.155.0" } } }
```

Verify: `pnpm why three` → must show `0.155.0`. `pnpm list @react-three/fiber` → `8.17.10`.

---

## 5. MAESTRO SMOKE TESTS — 5 FLOWS ONLY

Run all 5 after every sprint. Archive flows 03, 06-15 — do not run them.

```bash
./maestro-sim.sh apps/mobile/.maestro/flows/01_splash_and_auth.yaml
./maestro-sim.sh apps/mobile/.maestro/flows/02_style_quiz_precise.yaml
./maestro-sim.sh apps/mobile/.maestro/flows/04_render_pipeline_precise.yaml
./maestro-sim.sh apps/mobile/.maestro/flows/05_panorama_viewer_precise.yaml
./maestro-sim.sh apps/mobile/.maestro/flows/14_returning_user_precise.yaml
```

Test credentials:
- New user: test.newuser@hellocova.com / CovaTest123!
- Returning user: test.returning@hellocova.com / CovaTest123!
- Returning user ID: aa19e895-0582-4947-bf65-5ca06ab65a89
- Returning room ID: e1269ec5
- Simulator: iPhone 16e — LiDAR NOT available in Simulator, use physical device for LiDAR

---

## 6. HARD RULES — NEVER VIOLATE

```
□ NO OrbitControls — causes "Cannot set properties of undefined (setting 'style')" crash
□ NO API keys in client code — all AI calls through Supabase Edge Functions only
□ NO TypeScript 'any' anywhere
□ newArchEnabled: false in app.json — never change
□ userInterfaceStyle: dark in app.json — force dark mode
□ isTablet: false in app.json — iPhone only
□ All images: compress to 1024px wide / 0.8 JPEG quality before any upload or API call
□ CLIP embeddings: always 768-dimensional — never 1024
□ useRef for camera and animation values — never useState in 3D components
□ Only one panel open at a time — opening chat dismisses product panel and vice versa
□ All affiliate links open in SFSafariViewController — never external browser
□ Supabase email verification: DISABLED in Auth settings
□ Camera values: place "⚠️ ASSERTION: useRef ONLY" comment in every 3D camera file
□ No style names (Japandi/Coastal/etc) in user-facing strings
□ No Node.js built-in imports in Edge Functions (Deno runtime)
□ No service role key in client code — only anon key
□ Keep all secrets in .env — never commit .env to git
□ Suspense wraps all useGLTF calls
□ Images compressed before ANY upload: ImageManipulator 1024px wide, quality 0.8
```

---

## 7. STYLE BLEND — SINGLE SOURCE OF TRUTH

The quiz style blend drives EVERYTHING downstream. No exceptions. Never use a default or placeholder blend.

```
FLUX prompt:     weighted by blend ratio — 60% coastal = 60% coastal language in prompt
Anchor render:   selected by true cosine similarity of style_weights vectors
3D furniture:    filtered and ordered by style blend — dominant style pieces loaded first
Products:        ranked 70% CLIP similarity + 30% style blend match
Chatbot:         receives full blend in every system prompt, every single call
Pipeline:        quiz → blend → render → furniture → products → chat
```

---

## 8. V0 INTEGRATION — REQUIRED

Use V0 (v0.dev) for ALL new screens and significant UI components BEFORE Claude Code integrates them.

Always specify in every V0 prompt:
- React Native + Expo
- TypeScript
- Dark navy background #0A1628
- Gold accents #B8860B
- No web-specific APIs

Claude Code handles Supabase + Zustand integration after V0 generates the component.

V0 required for: Past Styles Page, Photo Guidance Overlay, 3-Photo Capture screens, Product Info Pop-up, Masonry Grid, Hero Render card, Inspiration tab, Arrangement Summary view.

---

## 9. POSTHOG ANALYTICS — REQUIRED

PostHog free tier. Add track() call at every critical step.

```typescript
import PostHog from 'posthog-react-native';
// Track these events minimum:
posthog.capture('quiz_started', { room_type });
posthog.capture('quiz_completed', { blend, swipe_count, completion_reason });
posthog.capture('room_capture_completed', { method: 'lidar' | 'three_photo' | 'single' | 'upload' });
posthog.capture('render_generated', { room_id, model_used });
posthog.capture('render_viewed', { room_id });
posthog.capture('render_failed', { room_id, error });
posthog.capture('product_panel_opened', { room_id });
posthog.capture('product_pinned', { product_id, room_id });
posthog.capture('product_bought', { product_id, retailer });
posthog.capture('chat_opened', { room_id });
posthog.capture('chat_message_sent', { room_id });
posthog.capture('chat_action_triggered', { action_type, room_id });
posthog.capture('arrange_opened', { room_id });
posthog.capture('arrange_saved', { furniture_count, room_id });
posthog.capture('auth_completed', { method: 'apple' | 'google' | 'email' });
posthog.capture('auth_failed', { method, error });
posthog.capture('account_deleted');
```

---

## 10. FORBIDDEN IMPORTS

### 10.1 OrbitControls — hard crash on iOS
Forbidden: `OrbitControls`, `MapControls`, `TrackballControls`, `FlyControls`, `PointerLockControls`
From any path: `@react-three/drei` or `three/examples/`
Only permitted camera: `CameraController.tsx` using PanResponder + `useFrame`

### 10.2 Node.js built-ins in Edge Functions (Deno runtime)
```typescript
// ❌ FORBIDDEN
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';
import crypto from 'crypto';

// ✅ USE INSTEAD
globalThis.crypto.subtle  // crypto
const data = await Deno.readFile(path)  // file ops
fetch()  // HTTP
```

### 10.3 Service role key in client code
```typescript
// ❌ NEVER
createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ✅ ALWAYS
createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
)
```

---

## 11. SELF-DEBUGGING PROTOCOL

**Layer 1 — Before generating any file:**
Check every rule in this file. Rewrite plan if any rule violated.

**Layer 2 — Per-file checklist (run internally after each file):**
```
□ No forbidden imports (§10)
□ All packages at exact pinned versions (§4)
□ All TS types from @cova/shared — no local redefinitions
□ All AI/external calls through Supabase Edge Functions only
□ No API keys in client code
□ Loading + error + empty states in every UI component
□ No TypeScript 'any'
□ OrbitControls absent from all 3D files
□ Camera values in useRef only in 3D components
□ No style names in user-facing strings
```

**Layer 3 — Component-level checks:**
- 3D: no OrbitControls, no useState camera, Canvas has `preserveDrawingBuffer:true` + background color set, radius clamped
- Edge Functions: no Node.js imports, CORS headers on all responses, JWT verified first
- UI: loading/error/empty states, no style names, colors from COLORS constant

---

## 12. DATABASE SCHEMA

**Supabase project:** xdeacbmkdwqrwxonqaqh
**Email verification:** DISABLED
**RLS:** enabled on all tables
**Storage buckets:** room-photos, renders, avatars, swipe-cards, assets (all private)

```sql
-- Core tables
users (id, display_name, avatar_url, default_budget, units, member_since)

rooms (
  id, user_id, name, type,
  style_blend jsonb,           -- single source of truth for all downstream
  budget,
  render_url,                  -- most recent render
  render_history jsonb[],      -- all renders stored
  dimensions jsonb,            -- {width, depth, height, unit: "m"}
  furniture_positions jsonb,   -- saved arrange screen positions
  pinned_products jsonb,       -- pinned product IDs
  created_at, updated_at
)

quiz_cards (id, image_url, style_weights jsonb, phase, room_type, discriminability_score)

products (
  id, name, price, retailer, affiliate_url, image_url,
  clip_embedding vector(768),  -- ALWAYS 768-dim
  style_weights jsonb,
  category, room_types text[], price_range
)

chat_messages (id, room_id, user_id, role, content, action_trigger jsonb, created_at)
favorites (id, user_id, product_id, created_at)
pinned_products (id, room_id, product_id, glb_model_id, position jsonb)
glb_models (id, filename, style text[], room_type text[], category, price_range, dimensions jsonb, thumbnail_url, product_id)
token_transactions (id, user_id, action, amount, created_at)

-- Atomic render count — always use this, never raw read-modify-write
SELECT increment_rooms_render_count('room-uuid');

-- dimensions_json always in meters
{ "width": 4.9, "depth": 4.3, "height": 2.7, "unit": "m" }
```

---

## 13. ZUSTAND STORE SLICES

```typescript
authSlice: {
  user, session, isLoading,
  signIn(provider: 'apple' | 'google' | 'email'),
  signOut, deleteAccount
}

roomSlice: {
  rooms, currentRoom, currentRoomDimensions,
  placedFurniture, pinnedProducts, activeStyle,
  isLoading,
  fetchRooms, createRoom, setCurrentRoom,
  setRoomDimensions, setActiveStyle,
  addFurniture, removeFurniture,
  updateFurniturePosition, updateFurnitureRotation,
  saveFurniturePlacements,
  pinProduct, unpinProduct
}

renderSlice: {
  currentRender, renderHistory, isRendering,
  renderProgress, renderError,
  startRender, pollRenderStatus, retryRender
}

quizSlice: {
  cards, styleBlend, swipeCount, phase,
  isComplete, isFetchingRefinement,
  swipeRight, swipeLeft, swipeBack,
  handleComplete, fetchRefinementCards, resetQuiz
}

productSlice: {
  products, favorites, pinnedItems,
  isLoading, searchQuery, activeCategory,
  fetchProducts, addFavorite, removeFavorite,
  pinProduct, unpinProduct
}

chatSlice: {
  messages, isLoading, conversationStarters,
  sendMessage, triggerAction, loadHistory
}

uiSlice: {
  tokenBalance,        // always 999 for MVP
  isHUDVisible, hudTimeout,
  showHUD, hideHUD,
  activePanelType,     // 'chat' | 'shop' | null — only one open at a time
  setActivePanel
}
```

---

## 14. BRAND AND UI CONSTANTS

```typescript
export const COLORS = {
  primary: '#0A1628',      // dark navy — backgrounds
  accent: '#B8860B',       // gold — CTAs, highlights, accents
  background: '#0A1628',   // dark navy throughout (dark mode forced)
  textPrimary: '#FFFFFF',
  textSecondary: '#888888',
  textMuted: '#555555',
  error: '#C62828',
  success: '#2E7D32',
  gold: '#B8860B',
  navy: '#0A1628',
}

export const RADIUS = { card: 16, button: 28, modal: 20, input: 12 }

export const SHADOW = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4
  }
}

// Font: SF Pro system font only. No custom fonts.
// No style names (Coastal/Japandi/etc) in user-facing strings.
```

---

## 15. ENVIRONMENT VARIABLES

```bash
# apps/mobile/.env — ONLY these two
EXPO_PUBLIC_SUPABASE_URL=https://xdeacbmkdwqrwxonqaqh.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=[anon key]

# Supabase Edge Function secrets — NEVER in .env, client code, or git
# Set via: supabase secrets set KEY=value
SUPABASE_SERVICE_ROLE_KEY
REPLICATE_API_TOKEN
ANTHROPIC_API_KEY
APPLE_SHARED_SECRET
POSTHOG_API_KEY
SKETCHFAB_API_KEY  # for GLB scraping only
```

`app.json` infoPlist (add if missing):
```json
"NSCameraUsageDescription": "Cova needs camera access to capture your room",
"NSPhotoLibraryUsageDescription": "Cova needs photo access to upload room photos",
"NSPhotoLibraryAddUsageDescription": "Cova needs to save your room designs"
```

---

## 16. RENDER PIPELINE SPEC

```
Input:  room photo (Photo 1) + unified depth map + style_blend + pinned_products
Model:  PRIMARY — equirectangular panoramic FLUX model (image-to-image, denoising 0.60)
        FALLBACK — current FLUX with improved sphere projection if no good panoramic model
ControlNet: depth map for structural guidance
Prompt: "[weighted style blend language] [room type] interior, preserve original wall colors,
         preserve ceiling height, preserve window positions, preserve door positions,
         preserve room architecture, [pinned items as 'must include'] photorealistic, 8k,
         interior photography, equirectangular panoramic"
Output: equirectangular 360° image (2:1 ratio, min 2048x1024px)
        stored in renders bucket, URL in rooms.render_url
        previous URL added to rooms.render_history array

Denoising strength: 0.60 (balances style vs structural preservation)
Target accuracy: ~70% structural preservation — acceptable for MVP
Polling: every 3s with exponential backoff, 120s timeout
Retry:   3 attempts, no token cost on failure
```

---

## 17. QUIZ ALGORITHM SPEC

```
Algorithm: Bayesian Preference Learning with Maximum Information Gain card selection
Start:     all styles at equal probability (0.2 each for 5 styles)
Right swipe: blend[k] *= (1 + weights[k] * 0.6)
Left swipe:  blend[k] *= (1 - weights[k] * 0.4)
Normalize:   after every swipe — sum always equals 1.0
Card select: maximum information gain — card that most reduces uncertainty about preferences
Phase 1 threshold: 0.60 confidence
Phase 2 threshold: 0.65 confidence (refinement cards for top 2 styles)
Min swipes: 10 before completion
Timeout:    120s — handleComplete(force=true) bypasses all guards
Back button: reverts blend to pre-swipe state, overwrites previous swipe completely
isFetchingRefinementRef: blocks handleComplete while Phase 2 fetch is in-flight
Render guard: NEVER call handleComplete from render function
              show loading spinner if isFetchingRefinementRef && currentIndex >= cards.length
3s safety timer: release isFetchingRefinementRef if fetch takes >3s
```

---

## 18. 3D VIEWER SPEC

```
Room geometry:  BoxRoom sized from depth map dimensions
Wall color:     sampled from FLUX render image, painted on BoxRoom walls
Floor texture:  style-matched (coastal=bleached wood, japandi=warm oak,
                bohemian=reclaimed dark, mid_century=walnut, minimalist=grey concrete)
Lighting:       point light (window simulation) + ambient fill + shadows enabled
SSAO:           active, tuned for depth without performance impact
Camera:         eye level locked at 1.6m, FOV 40°-90°, cannot exit room boundary
Controls:       pan=drag, zoom=pinch, select=tap, move=drag after Move tap, rotate=two-finger
Rotate snaps:   45° increments
Wall collision: furniture centroid cannot be within 10cm of wall boundary
Floor boundary: furniture centroid must stay inside room polygon
Undo:           single level — reverts last move or rotation
GLB placement:  Option C hybrid — vision API primary, smart layout fallback
                Closest GLB: category + style + CLIP thumbnail similarity
```

---

## 19. CHATBOT SYSTEM PROMPT TEMPLATE

Every single Claude API call MUST include this full context:

```
You are Cova's interior design advisor helping a user redesign their [room_type].

Style blend: [weighted breakdown e.g. 60% Coastal, 40% Japandi]
Budget: [$budget_range]
Room dimensions: [width x depth x height from depth map]
Current furniture in 3D viewer: [list of GLB names and approximate positions]
Pinned products: [list of pinned product names]
Renders generated for this room: [count]
Last render prompt used: [prompt_text]

Give specific, actionable interior design advice personalized to THIS exact room.
Never give generic advice. Always reference their specific style blend, furniture,
and room in every response.

Available actions you can trigger (include in response when appropriate):
REGENERATE — generates a new render
ADJUST_BLEND: [new_weights] — adjusts style blend then regenerates (updates Supabase permanently)
OPEN_SHOP — opens product panel
PIN_PRODUCT: [product_id] — pins a specific product

IMPORTANT: REGENERATE and ADJUST_BLEND require explicit user confirmation before executing.
Always present as a confirmation card — never auto-execute.
```

---

## 20. KNOWN ERRORS AND EXACT FIXES

### Three.js / expo-gl / R3F
| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot set properties of undefined (setting 'style')` | OrbitControls | Remove every OrbitControls import immediately |
| White void at walls | Canvas background missing | `<color attach="background" args={[wallColor]} />` as first Canvas child |
| Camera freezes after furniture select | selectedIdRef not reset | Done handler: `selectedIdRef.current = null; setForceUpdate(n=>n+1)` |
| Furniture drag rotates camera | PanResponder conflict | `onMoveShouldSetPanResponder` returns false when `selectedIdRef.current !== null` |
| `useGLTF` crash | Missing Suspense | Wrap all FurniturePiece in `<Suspense fallback={null}>` |
| GLB bundling error | Not in metro assetExts | `config.resolver.assetExts.push('glb','gltf','hdr')` |
| HDRI crash / VRAM | HDR too large | 1K resolution only; fallback to point lights |
| Furniture floating | GLB origin not at y=0 | `position={[0, yOffset, 0]}` on primitive group |
| SSAO TypeError | Version mismatch | Verify `@react-three/postprocessing` === `2.15.0` |
| Pinch zoom jumpy | pinchStartDistRef not reset | Reset `pinchStartDistRef.current = dist` at end of each move |
| Selection ring invisible | Ring clips into floor | `position={[0, 0.01, 0]}` on ring group |
| `three is undefined` | Wrong pnpm version hoisted | Verify overrides in root package.json; `pnpm why three` |
| Black screen Canvas | gl prop missing | `gl={{ preserveDrawingBuffer: true }}` |
| Panorama sphere distorted | Wrong sphere scale | scale={[-1, 1, 1]} for inward normals, camera at [0,0,0] |
| Panorama black on Simulator | GLView intercepts | Use testMode flat image fallback in Simulator |

### React Native / Expo
| Error | Cause | Fix |
|-------|-------|-----|
| Metro crash | Watchman missing | `brew install watchman` |
| `ExpoModulesCore` not found | Need native rebuild | `npx expo run:ios` not `expo start` |
| Camera/library permission never prompts | Missing infoPlist key | Add to `ios.infoPlist` in app.json — rebuild |
| `pnpm install` gets wrong versions | Missing pnpm overrides | Add overrides block — `pnpm install` again |
| Duplicate symbol build fail | Two bridge files registered | Remove one `.m` file |
| `Module AppRegistry not registered` | React version mismatch | Verify react + react-dom both === 18.3.1 |
| EAS node version error | Node 22+ | `nvm use 20` |
| Password toggle fails iOS 26 + Maestro | secureTextEntry + Maestro | Use workaround per existing auth implementation |

### Supabase / Edge Functions
| Error | Cause | Fix |
|-------|-------|-----|
| `Deno is not defined` | Node.js import | Replace with Deno equivalents |
| CORS error | Missing headers | `Access-Control-Allow-Origin: *` + handle OPTIONS |
| `JWT expired` | Stale session | `supabase.auth.getSession()` — never store JWT string manually |
| RLS violation | Missing policy | Verify `auth.uid() = user_id` policy exists |
| `relation does not exist` | Migration not applied | `supabase db push` |
| Vector search wrong | 1024-dim vs 768-dim | Always 768 everywhere — never 1024 |
| Replicate stuck in `starting` | Queue congestion | Exponential backoff 3s/6s/12s/24s, timeout 120s |
| Storage upload fails | Bucket missing | Verify: room-photos, renders, avatars, swipe-cards, assets |
| Image exceeds limit | Uncompressed photo | ImageManipulator: 1024px wide, quality 0.8 — compress BEFORE upload |
| FLUX URL 404 | Wrong endpoint format | `/v1/models/` not `/v1/predictions` + version |
| render_count race condition | Raw read-modify-write | Use `increment_rooms_render_count(room_id)` RPC |

### RoomPlan Swift — Known Failures and Fixes
| Error | Cause | Fix |
|-------|-------|-----|
| `exceedSceneSizeLimit` | Previous session not released | `session.stop(); session = nil` before new scan |
| `worldTrackingFailed` | Low light / featureless surface | Show: "Move to well-lit area with visible textures" |
| `No such module 'RoomPlan'` | iOS target below 16.0 | Set deployment target to 16.0 in Podfile and app.json |
| `NativeModules.RoomPlanModule` undefined | Swift files missing from Xcode | Add both `.swift` + `.m` to Xcode project — rebuild |
| `RCTBridgeModule` not found | New Architecture enabled | `"newArchEnabled": false` in app.json — rebuild |
| Phantom walls in scan | Mirrors or glass in room | Show: "Cover mirrors before scanning" |
| Empty dimensions returned | Too dark | Show: "Ensure good lighting" |
| LiDAR not available | Non-LiDAR device | Hide LiDAR option via device capability check — show 3-photo instead |

**LiDAR Bulletproof Fallback — Always Present:**
```typescript
try {
  const result = await NativeModules.RoomPlanModule.startScan();
  // proceed with LiDAR
} catch (error) {
  // auto-fallback — never crash
  showMessage("Room scan unavailable — let's use photos instead");
  navigateTo3PhotoCapture();
}
```

---

## 21. GLOBAL ERROR HANDLING PATTERNS

```typescript
// Supabase timeout
const withTimeout = async (promise: Promise<any>, ms = 10000) => {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), ms)
  );
  return Promise.race([promise, timeout]);
};

// Render failure
if (renderError) {
  return <RetryScreen
    message="Something went wrong with your render"
    onRetry={() => retryRender(roomId)} // no token cost
    onBack={() => navigation.navigate('Dashboard')}
  />;
}

// Dead affiliate link check
const checkLinkAlive = async (url: string): Promise<boolean> => {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch { return false; }
};

// Product panel empty state
if (products.length === 0) {
  // relax style threshold and retry
  await fetchProducts({ ...params, styleThreshold: params.styleThreshold * 0.7 });
  // show "Showing closest matches to your style"
}

// Claude API timeout in chat
const chatTimeout = setTimeout(() => {
  addMessage({ role: 'assistant', content: 'Having trouble thinking — please try again', isError: true });
}, 30000);
```

---

## 22. SELF-CHECK BEFORE COMPLETING ANY TASK

```
□ MVP_SPEC.md item has acceptance criteria — all criteria met
□ SESSION_MEMORY.md updated with what was done
□ SPRINT_LOG.md updated — item marked complete
□ npx tsc --noEmit passes with zero errors
□ Relevant Maestro flow passes
□ No OrbitControls anywhere
□ No useState for camera values in 3D components — useRef only
□ Canvas has preserveDrawingBuffer:true + background color set
□ No Node.js imports in Edge Functions
□ No API keys in client code
□ All images compressed: 1024px / 0.8 JPEG before any upload
□ CLIP = 768-dim always
□ Style blend passed to ALL downstream systems
□ Supabase email verification still DISABLED
□ newArchEnabled still false
□ All packages still at locked versions
□ git commit and push done
```

---

## 23. KEY COMMANDS

```bash
# Start app
cd ~/Desktop/cova/apps/mobile && npx expo start --dev-client
# Press 'i' for iOS Simulator

# TypeScript check (run after every significant change)
npx tsc --noEmit

# Maestro smoke tests (run all 5 after every sprint)
./maestro-sim.sh apps/mobile/.maestro/flows/01_splash_and_auth.yaml
./maestro-sim.sh apps/mobile/.maestro/flows/02_style_quiz_precise.yaml
./maestro-sim.sh apps/mobile/.maestro/flows/04_render_pipeline_precise.yaml
./maestro-sim.sh apps/mobile/.maestro/flows/05_panorama_viewer_precise.yaml
./maestro-sim.sh apps/mobile/.maestro/flows/14_returning_user_precise.yaml

# Autonomous product + GLB scraper (overnight)
npx ts-node scripts/scrape-all.ts &
# Results in SCRAPING_LOG.md

# Commit sprint
git add -A && git commit -m "sprint: [description]" && git push origin main

# Verify package versions
pnpm why three                    # must show 0.155.0
pnpm list @react-three/fiber      # must show 8.17.10
pnpm list expo                    # must show ~52.0.49
```

---

*Owners: Daksh Parikh & Pranav Goel | hellocova@gmail.com*
*Update §20 (Known Errors) whenever a new error is encountered and resolved.*
*MVP_SPEC.md is the product authority. This file is the architecture authority.*
*PRODUCT_TRUTH.md is superseded — do not use.*
