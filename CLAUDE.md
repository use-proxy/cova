# CLAUDE.md — Cova Project Intelligence File
# "tinder for your home" | AI Interior Design App
# Daksh Parikh & Pranav Goel | hellocova@gmail.com
# Bundle ID: ai.cova.app | Supabase Project: xdeacbmkdwqrwxonqaqh
#
# ⚠️ READ THIS FILE AND PRODUCT_TRUTH.md BEFORE WRITING A SINGLE LINE OF CODE.
# This file = architectural rules, version constraints, patterns, known errors.
# PRODUCT_TRUTH.md = exact feature behavior and audit agent instructions.
# Both files are always authoritative over any individual prompt.

---

## 0. MANDATORY EXECUTION PIPELINE

Every fix, feature, or change follows this pipeline. No exceptions. No skipping steps.

**Step 1 — Spec File** (before any code): Create `.claude/specs/[YYYY-MM-DD]-[short-description].md` with:
PROBLEM / FILES IN SCOPE / FILES OUT OF SCOPE / ACCEPTANCE CRITERIA / WHAT NOT TO DO

**Step 2 — Planner Agent**: `Use the planner agent to break this spec into implementation phases.`
Planner reads CLAUDE.md + files in scope + spec. Outputs numbered phase list. Touches ZERO code.

**Step 3 — Executor Agent**: `Use the executor agent to implement phase [N].`
Implements exactly one phase. Only touches FILES IN SCOPE. Stop and reject if out-of-scope file touched.

**Step 4 — Verifier Agent**: `Use the verifier agent to verify phase [N] against the spec.`
Returns PASS / FAIL / PARTIAL with file:line refs. If FAIL/PARTIAL → executor re-implements only that phase.

**Step 5 — Integration Test** (render pipeline only):
`npx ts-node supabase/functions/tests/render-pipeline.test.ts` — must exit 0 before done.

---

## 1. PROJECT OVERVIEW

React Native iOS-only app: style quiz → room capture → AI render → first-person walkthrough → buy products.

**The #1 Product Rule:** THE USER NEVER SEES A CARTOON 3D WIREFRAME AS PRIMARY EXPERIENCE.
The render IS the product. The 3D viewer is an optional furniture arrangement tool only.

**Core user flow:**
```
Splash (2s fade) → Auth → Dashboard → New Room:
  Room Type → Style Quiz → Room Capture → Loading (6 stages) →
  Choice: "View AI Render" | "Arrange Furniture"
```

**V1 / V2 scope:**
- V1 built: Splash, Auth, Quiz, Room Capture, AI Render, 3D Viewer, Chatbot, CLIP Shopping, Dashboard, Token infra
- V2 only: Realtor Mode, Style Switching in render, "Recreate This Room", Retailer API sync

**Do not rebuild (already seeded):**
- 3,136 products (Wayfair 1222, Amazon 962, IKEA 941, CB2 11)
- 423 swipe cards in swipe-cards bucket
- CLIP embeddings 768-dim with IVFFlat index
- Migrations: 20240018000000, 20240019000000, 20240020000000
- DO NOT RE-RUN DATA PIPELINE SCRIPTS — creates duplicates.

---

## 2. MONOREPO STRUCTURE

```
~/Desktop/cova/
├── CLAUDE.md                          ← rules (this file)
├── PRODUCT_TRUTH.md                   ← feature truth + audit instructions
├── package.json                       ← pnpm overrides (critical — see §3)
├── .claude/agents/{planner,executor,verifier}.md
├── .claude/commands/fix.md            ← /fix slash command
├── .claude/specs/                     ← one spec per fix
│
├── apps/mobile/
│   ├── app.json                       ← bundle: ai.cova.app, iOS only
│   ├── metro.config.js                ← MUST include glb/gltf/hdr in assetExts
│   ├── .env                           ← ONLY anon key + URL
│   ├── src/
│   │   ├── screens/auth/{SplashScreen,AuthScreen}.tsx
│   │   ├── screens/main/{HomeScreen,StyleQuizScreen,RoomCaptureScreen,
│   │   │                  RoomViewer3DScreen,RenderViewScreen,ShopScreen,ProfileScreen}.tsx
│   │   ├── components/3d/{BoxRoom,SceneLighting,FurniturePiece,CameraController}.tsx
│   │   ├── components/ui/{TokenBalance,LoadingOverlay,ProductPanel}.tsx
│   │   ├── navigation/RootNavigator.tsx
│   │   ├── store/index.ts             ← Zustand, ALL slices
│   │   ├── hooks/{useRender,useAuth,useRoomPlan}.ts
│   │   ├── lib/supabase.ts            ← single client instance
│   │   └── data/{furnitureCatalog,glbAssets}.ts
│   ├── modules/{RoomPlanModule.swift,RoomPlanModule.m}
│   └── assets/{3d/furniture/*.glb, textures/*.{jpg,hdr}}
│
├── packages/shared/src/{types,index}.ts  ← ALL shared TS types
│
└── supabase/functions/
    ├── render-room/index.ts
    ├── get-render-status/index.ts
    ├── clip-embed/index.ts
    ├── match-products/index.ts
    ├── chat-room/index.ts
    ├── handle-purchase/index.ts
    ├── delete-account/index.ts
    └── tests/render-pipeline.test.ts  ← must always exist
```

---

## 3. LOCKED VERSIONS — NEVER CHANGE

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

Root `package.json` pnpm overrides (must always be present):
```json
{ "pnpm": { "overrides": { "react": "18.3.1", "react-dom": "18.3.1", "three": "0.155.0" } } }
```

Verify: `pnpm why three` → must show `0.155.0`. `pnpm list @react-three/fiber` → `8.17.10`.

---

## 4. SELF-DEBUGGING PROTOCOL

**Layer 1 — Before generating any file:** check against every rule in this file. Rewrite if violated.

**Layer 2 — Per-file checklist (run internally after each file):**
- [ ] No forbidden imports (§5) / No forbidden patterns (§6)
- [ ] All packages at exact pinned versions (§3)
- [ ] All TS types from `@cova/shared` — no local redefinitions
- [ ] All AI/external calls through Supabase Edge Functions only
- [ ] No API keys in client-side code
- [ ] Loading + error + empty states in every UI component
- [ ] No TypeScript `any`
- [ ] OrbitControls absent from all 3D files
- [ ] Camera values in `useRef` only (never `useState`) in 3D components
- [ ] No style names (Japandi/Coastal/etc) in user-facing strings

**Layer 3 — Component-level review:**
- 3D: no OrbitControls, no useState camera, Canvas has `preserveDrawingBuffer:true` + background color, radius clamped
- Edge Functions: no Node.js imports, CORS headers on all responses, JWT verified first
- UI: loading/error/empty states, no style names, colors from COLORS constant

**Layer 4:** Place `// ⚠️ ASSERTION: useRef ONLY — never useState for camera values.` comment in every 3D camera file. Never remove these comments.

---

## 5. FORBIDDEN IMPORTS

### 5.1 OrbitControls — causes `Cannot set properties of undefined (setting 'style')` crash
All of these are forbidden: `OrbitControls`, `MapControls`, `TrackballControls`, `FlyControls`, `PointerLockControls` from `@react-three/drei` or any `three/` path.
Only permitted camera system: `CameraController.tsx` with PanResponder + `useFrame`.

### 5.2 Node.js built-ins in Edge Functions (Deno runtime)
Forbidden: `import fs`, `import path`, `import { Buffer }`, `import crypto`, `import https`
Use instead: `globalThis.crypto.subtle`, global `fetch()`

### 5.3 Service role key in client code
```typescript
// ❌ createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY)
// ✅ createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!)
```

### 5.4 Direct external API calls from client
All Replicate / Anthropic / external calls must go through Supabase Edge Functions. Never call from client.

---

## 6. FORBIDDEN PATTERNS

### 6.1 `useState` for 3D camera values → re-renders freeze camera
```typescript
// ✅ ONLY useRef for camera:
const thetaRef  = useRef(0)    // horizontal: -Math.PI to Math.PI
const phiRef    = useRef(1.25) // vertical: clamped 0.3 → Math.PI/2-0.05
const radiusRef = useRef(4.5)  // zoom: clamped 1.5 → 6.0
```

### 6.2 `useEffect` for data fetching → use Zustand store actions only
```typescript
// ✅ const { rooms, fetchRooms } = useRoomStore(); useEffect(() => { fetchRooms() }, [])
```

### 6.3 Canvas without `preserveDrawingBuffer` → black screen
```typescript
// ✅ <Canvas gl={{ preserveDrawingBuffer: true }} camera={{ fov: 75, near: 0.1, far: 50 }}>
```

### 6.4 Canvas without background color → white void at walls
```typescript
// ✅ First child inside Canvas: <color attach="background" args={[STYLE_PALETTE[activeStyle].ceiling]} />
```

### 6.5 Camera radius without clamping → user exits room
```typescript
// ✅ radiusRef.current = Math.max(1.5, Math.min(6.0, newRadius))
// Rule: maxRadius < min(roomWidth, roomDepth) / 2 - 1.0
```

### 6.6 Metro config without asset extensions
```typescript
// ✅ config.resolver.assetExts.push('glb', 'gltf', 'hdr', 'ktx2')
```

### 6.7 `useGLTF` without parent Suspense → unhandled promise rejection
```typescript
// ✅ <Suspense fallback={null}>{placedFurniture.map(p => <FurniturePiece key={p.id} ... />)}</Suspense>
```

### 6.8 PanResponder inside Canvas → gesture lock (PanResponder must be a SIBLING of Canvas)
```typescript
// ✅
<View style={{ flex: 1 }}>
  <View style={StyleSheet.absoluteFill}><Canvas ...>{/* scene */}</Canvas></View>
  <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} pointerEvents="box-none">
    {/* HUD */}
  </View>
</View>
```

### 6.9 TypeScript `any` → forbidden everywhere
```typescript
// ✅ import type { Room } from '@cova/shared'; const room: Room = data as Room
```

### 6.10 Style names in user-facing UI
Internal code: `'japandi'`, `'coastal'` etc. are fine. User-facing text must use display names:
`coastal→'Ocean Breeze'`, `japandi→'Zen Garden'`, `bohemian→'Boho Spirit'`, `mid_century→'Mid-Century'`, `minimalist→'Pure Lines'`

### 6.11 Missing CORS headers in Edge Functions
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
// Handle OPTIONS: return new Response('ok', { headers: corsHeaders })
// All responses: headers: { ...corsHeaders, 'Content-Type': 'application/json' }
```

### 6.12 Hardcoded room dimensions → always from Zustand store
```typescript
// ✅ const dimensions = useRoomStore(s => s.currentRoom?.dimensions)
// Fallbacks: width 4.9m, depth 4.3m, height 2.7m. Store in meters; convert for display only.
```

### 6.13 CLIP dimension mismatch → always 768, never 1024
`products.clip_embedding` is `vector(768)`. Never insert 1024-dim vectors.

### 6.14 Large image base64 — resize first or stack overflows
```typescript
// ✅ ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }], { compress: 0.8, format: JPEG })
```

---

## 7. ROOM CAPTURE ARCHITECTURE

### 7.1 RoomPlan Swift Module

Output type:
```typescript
type RoomPlanResult = {
  width: number; depth: number; height: number  // meters
  doors: Array<{ x: number; z: number; width: number; wallSide: 'front'|'back'|'left'|'right' }>
  windows: Array<{ x: number; z: number; width: number; height: number; wallSide: 'front'|'back'|'left'|'right' }>
  thumbnailBase64: string
}
```

Files: `modules/RoomPlanModule.swift` (RoomCaptureSession, isLiDARAvailable, startScan, stopScan, delegates),
`modules/RoomPlanModule.m` (ObjC bridge), `src/hooks/useRoomPlan.ts` (TS hook).

Xcode integration: add both `.swift` + `.m` to Cova group, iOS deployment target ≥ 16.0, then `npx expo run:ios`.

### 7.2 Depth Estimation — Apple Depth Pro ONLY
Model: `garg-aayush/ml-depth-pro` on Replicate. Produces metric depth (real meters), no intrinsics needed.
**Never revert to Depth Anything V2.**

### 7.3 Post-Capture Loading Screen Stages
```
Stage 1: "Analyzing your room..."       (0–5s)
Stage 2: "Measuring depth..."           (5–15s)
Stage 3: "Applying your style..."       (15–25s)
Stage 4: "Generating render..."         (25–40s)
Stage 5: "Adding finishing touches..."  (40–55s)
Stage 6: "Done!" → navigate to choice screen
```

---

## 8. AI RENDER PIPELINE

### 8.1 render-room Edge Function Sequence
1. Verify JWT — reject unauthorized
2. Check `tokens_enabled` — if true and balance < cost, return 402
3. Upload photo to `room-photos` bucket
4. Call Depth Pro: `garg-aayush/ml-depth-pro` via Replicate
5. Poll depth map (exponential backoff: 3s, 6s, 12s)
6. Generate Canny edge map server-side
7. Build FLUX prompt via `buildPrompt(styleBlend)`
8. Call FLUX ControlNet Union Pro 2.0: `xlabs-ai/flux-controlnet-union-pro-2` (fallback: `black-forest-labs/flux-depth-pro`) — use `/v1/models/` endpoint
9. Poll render completion (3s/6s/12s/24s backoff, timeout 120s)
10. Upload render to `renders/{user_id}/{room_id}/{timestamp}.jpg`
11. Update `renders`: status=`completed`, `image_url`, `style_applied=styleBlend`
12. Atomic increment: `increment_rooms_render_count(room_id)` RPC
13. Return render ID

### 8.2 Prompt Construction
```typescript
const STYLE_PROMPTS = {
  coastal:     'coastal interior, light blue and white palette, natural linen, driftwood accents, airy and bright',
  japandi:     'japandi interior, warm neutrals, natural wood, minimalist zen, wabi-sabi, serene organic materials',
  bohemian:    'bohemian interior, rich jewel tones, mixed patterns, macrame, plants, eclectic layered textiles',
  mid_century: 'mid-century modern interior, walnut wood, organic curves, bold geometric patterns, warm amber tones',
  minimalist:  'minimalist interior, pure white, clean lines, negative space, monochromatic palette, no clutter',
}
// Sort styleBlend by weight descending, map to prompts, join with ', '
```

### 8.3 Render Status Rules
- `renders.status` CHECK must include: `'pending'|'processing'|'completed'|'failed'`
- FLUX output: handle both string and array when extracting image URL
- Storage failure → mark `failed`, never leave in `processing`
- `config.toml` for every edge function: `verify_jwt = false`

### 8.4 Integration Test
`supabase/functions/tests/render-pipeline.test.ts` — mock Replicate, verify full sequence,
assert status transitions + `image_url` set + `style_applied` not null. Must exit 0.

---

## 9. 3D VIEWER ARCHITECTURE

### 9.1 CameraController.tsx Contract
```typescript
// ⚠️ ASSERTION: ALL values MUST be useRef. NEVER useState.
const thetaRef  = useRef(0)    // horizontal: -Math.PI to Math.PI
const phiRef    = useRef(1.25) // vertical: Math.max(0.3, Math.min(Math.PI/2-0.05, val))
const radiusRef = useRef(4.5)  // zoom: Math.max(1.5, Math.min(6.0, val))
// Start: theta=0, phi=1.25, radius=4.5 — doorway, eye level, looking toward [0, 1.2, 0]
useFrame(() => {
  camera.position.set(
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.cos(theta)
  )
  camera.lookAt(0, 1.2, 0)
})
// Expose handlePan + handleZoom via forwardRef + useImperativeHandle
```

### 9.2 PanResponder Gate
```typescript
onMoveShouldSetPanResponder: (_, gs) =>
  selectedIdRef.current === null && (Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2)
// One allowed useState: forceUpdate for selection ring visibility
```

### 9.3 BoxRoom Style Palette
```typescript
const STYLE_PALETTE = {
  coastal:     { floor: '#C8B89A', walls: '#E8DFD0', ceiling: '#F5F0E8', trim: '#FFFFFF', emissive: '#FFF8F0' },
  japandi:     { floor: '#8B7355', walls: '#D4CAB8', ceiling: '#EDE8DF', trim: '#F0EDE6', emissive: '#FFFAF5' },
  bohemian:    { floor: '#A0785A', walls: '#D4B896', ceiling: '#E8D5B7', trim: '#C8A882', emissive: '#FFF5E8' },
  mid_century: { floor: '#8B6914', walls: '#C8A870', ceiling: '#E8D098', trim: '#5C3D1E', emissive: '#FFF0D0' },
  minimalist:  { floor: '#D0D0D0', walls: '#E8E8E8', ceiling: '#F5F5F5', trim: '#FFFFFF', emissive: '#FFFFFF' },
}
// 5 faces only (no front wall = doorway). Canvas background = ceiling color.
// Required: crown molding, baseboards, door frame, window emissive plane.
```

### 9.4 HDRI Map
```typescript
const HDRI_MAP = {
  coastal:     require('...textures/hdri/sunset_fairway_1k.hdr'),
  japandi:     require('...textures/hdri/small_empty_room_1k.hdr'),
  bohemian:    require('...textures/hdri/colorful_studio_1k.hdr'),
  mid_century: require('...textures/hdri/loft_hall_1k.hdr'),
  minimalist:  require('...textures/hdri/grey_room_1k.hdr'),
}
// 1K resolution only. Wrap Environment in try/catch — fallback to hemisphereLight.
```

### 9.5 FurniturePiece Rules
- `const clonedScene = useMemo(() => scene.clone(true), [scene])` — prevent shared material mutations
- Enable shadow casting on all meshes
- Drag via `THREE.Plane` at y=0, raycaster intersection
- Position clamp: `x ∈ [-(W/2-pw/2), (W/2-pw/2)]`, `z ∈ [-(D/2-pd/2), (D/2-pd/2)]`
- `onPointerDown` MUST call `e.stopPropagation()` — otherwise touch moves camera too
- Selection ring: gold torus at `y=0.01` (NOT y=0 — clips into floor), color `#C47B3C`

### 9.6 SSAO
```typescript
// @react-three/postprocessing 2.15.0 EXACT
<EffectComposer><SSAO radius={0.05} intensity={15} luminanceInfluence={0.6} /></EffectComposer>
```

---

## 10. DATABASE REFERENCE

RLS on all tables: `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`

```
rooms                — id, user_id, name, room_type, style_blend, dimensions_json,
                       budget, latest_render_url, render_count, status('active'|'archived'),
                       original_image_url (nullable)
renders              — id, room_id, user_id, image_url, status('pending'|'processing'|'completed'|'failed'),
                       replicate_prediction_id, prompt_used, tokens_used, style_applied (NOT NULL)
furniture_placements — id, room_id, furniture_catalog_id, position_x, position_y, rotation_y, scale
products             — id, name, price, retailer, affiliate_url, clip_embedding vector(768)
swipe_cards          — id, image_url, room_type, style_weights jsonb, active
```

`dimensions_json`: `{ "width": 4.9, "depth": 4.3, "height": 2.7, "unit": "m" }` — always meters.
Atomic render count: `SELECT increment_rooms_render_count('room-uuid')` — never raw read-modify-write.

---

## 11. ZUSTAND STORE SLICES

```typescript
authSlice:   { user, session, isLoading, signIn(provider), signOut }
roomSlice:   { rooms, currentRoom, currentRoomDimensions, placedFurniture, activeStyle, isLoading,
               fetchRooms, createRoom, setCurrentRoom, setRoomDimensions, setActiveStyle,
               addFurniture, removeFurniture, updateFurniturePosition, updateFurnitureRotation, saveFurniturePlacements }
renderSlice: { currentRender, renderHistory, isRendering, renderProgress, startRender, pollRenderStatus }
quizSlice:   { cards, styleBlend, isComplete, swipeRight, swipeLeft, swipeNeutral, completeQuiz }
cartSlice:   { items, addToCart, removeFromCart, clearCart }
uiSlice:     { tokenBalance(always 999 V1), isHUDVisible, hudTimeout, showHUD, hideHUD }
```

---

## 12. BRAND AND UI CONSTANTS

```typescript
export const COLORS = {
  primary: '#0A1628', accent: '#C47B3C', background: '#F5F0E8',
  textPrimary: '#1A1A1A', textSecondary: '#888888', textOnDark: '#FFFFFF',
  error: '#CC3333', success: '#2E7D32',
}
export const RADIUS = { card: 16, button: 28, modal: 20, input: 12 }
export const SHADOW = { card: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.12, shadowRadius: 12, elevation: 4 } }
// System font only (SF Pro). No custom fonts. No style names in user-facing strings.
```

---

## 13. ENVIRONMENT VARIABLES

```bash
# apps/mobile/.env — only these two
EXPO_PUBLIC_SUPABASE_URL=https://xdeacbmkdwqrwxonqaqh.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=[anon key]

# Supabase Edge Function secrets — never in .env, client code, or git
SUPABASE_SERVICE_ROLE_KEY / REPLICATE_API_TOKEN / ANTHROPIC_API_KEY / APPLE_SHARED_SECRET
```

`app.json` infoPlist (add if missing): `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`

---

## 14. KNOWN ERRORS AND EXACT FIXES

### Three.js / expo-gl / R3F
| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot set properties of undefined (setting 'style')` | OrbitControls | Remove every OrbitControls import |
| White void at walls | Canvas background missing | `<color attach="background" args={[ceilingColor]} />` as first Canvas child |
| Camera freezes after furniture select | `selectedIdRef` not reset | Done handler: `selectedIdRef.current = null; setForceUpdate(n=>n+1)` |
| Furniture drag also rotates camera | PanResponder intercepts during drag | `onMoveShouldSetPanResponder` returns `false` when `selectedIdRef.current !== null` |
| `useGLTF` crash | Missing Suspense | Wrap all FurniturePiece in `<Suspense fallback={null}>` |
| GLB bundling error | Not in metro assetExts | `config.resolver.assetExts.push('glb','gltf','hdr')` |
| HDRI crash / VRAM | HDR too large | 1K resolution only; fallback to lights |
| Furniture floating | GLB origin not at y=0 | `position={[0, yOffset, 0]}` on primitive group |
| SSAO TypeError | Version mismatch | Verify `@react-three/postprocessing` = `2.15.0` |
| Pinch zoom jumpy | pinchStartDistRef not reset | Reset `pinchStartDistRef.current = dist` at end of each move event |
| Selection ring invisible | Ring clips into floor | `position={[0, 0.01, 0]}` on ring group |
| `three is undefined` | Wrong pnpm version hoisted | Verify overrides in root package.json; `pnpm why three` |
| Black screen Canvas | `gl` prop missing | `gl={{ preserveDrawingBuffer: true }}` |

### React Native / Expo
| Error | Cause | Fix |
|-------|-------|-----|
| Metro crash | watchman missing | `brew install watchman` |
| `ExpoModulesCore` not found | Need native rebuild | `npx expo run:ios` (not `expo start`) |
| Camera/library permission never prompts | Missing infoPlist key | Add to `ios.infoPlist` in app.json — rebuild |
| `pnpm install` gets react 19 / three 0.160+ | Missing pnpm overrides | Add overrides block — `pnpm install` again |
| "Duplicate symbol" build fail | Two bridge files registered | Remove one `.m` file |
| `Module AppRegistry not registered` | React version mismatch | Verify react + react-dom both = 18.3.1 |
| EAS "node version" | node 22+ | `nvm use 20` |

### Supabase / Edge Functions
| Error | Cause | Fix |
|-------|-------|-----|
| `Deno is not defined` | Node.js import | Replace with Deno equivalents |
| CORS error | Missing headers | `Access-Control-Allow-Origin: *` on all responses + handle OPTIONS |
| `JWT expired` | Stale session | `supabase.auth.getSession()` — never store JWT string manually |
| RLS violation | Missing policy | Verify `auth.uid() = user_id` policy |
| `relation "renders" does not exist` | Migration not applied | `supabase db push` |
| Vector search wrong | 1024-dim vs 768-dim | Always 768 everywhere |
| Replicate stuck in `starting` | Queue congestion | Exponential backoff 3s/6s/12s/24s, timeout 120s |
| Storage upload fails | Bucket missing | Verify: room-photos, renders, swipe-cards, assets (all private) |
| `style_applied` NOT NULL violation | Not set on INSERT | Always include `style_applied: styleBlend` |
| renders.status CHECK violation | `completed` not in constraint | CHECK must include all 4 statuses |
| FLUX URL 404 | Wrong endpoint | `/v1/models/` not `/v1/predictions` + version |
| render_count race condition | Raw read-modify-write | Use `increment_rooms_render_count(room_id)` RPC |
| Image exceeds 6MB limit | Uncompressed photo | ImageManipulator: 1024px wide, quality 0.8 |

### RoomPlan Swift
| Error | Cause | Fix |
|-------|-------|-----|
| `exceedSceneSizeLimit` | Previous session not released | `session.stop(); session = nil` before new scan |
| `worldTrackingFailed` | Low light / featureless | Show: "Move to well-lit area with visible textures" |
| `No such module 'RoomPlan'` | iOS target < 16.0 | Set deployment target to 16.0 in Xcode |
| `NativeModules.RoomPlanModule` undefined | Swift files not in Xcode | Add both `.swift` + `.m` to Xcode project — rebuild |
| `RCTBridgeModule` not found | New Architecture | `"newArchEnabled": false` in app.json — rebuild |
| Phantom walls | Mirrors/glass | Show: "Cover mirrors before scanning" |
| Empty dimensions | Too dark | Show: "Ensure good lighting and visible surface texture" |

---

## 15. VALIDATION CHECKLISTS (physical iPhone only — Simulator gives false positives)

### Room Capture done when:
- [ ] Camera permission prompts on first visit only; LiDAR option hidden on non-LiDAR devices
- [ ] Depth Pro called server-side; depth map stored in room-photos bucket
- [ ] Loading screen shows all 6 stages; choice screen appears after
- [ ] Integration test passes

### 3D Viewer done when:
- [ ] ZERO white space on physical device; camera at doorway, eye level
- [ ] Swipe/pinch/tap/drag/rotate/delete/undo all working per PRODUCT_TRUTH.md
- [ ] SSAO active; style chips preserve furniture positions; 2D toggle works

### Render View done when:
- [ ] Render fills 100% screen; pan + pinch (1×–2.5×) working
- [ ] HUD auto-hides 3s; Regenerate/Save/Share/Chat/Product panel all functional
- [ ] Before/After slider: left = original photo, right = AI render

---

## 16. SELF-CHECK BEFORE COMPLETING ANY FILE

```
□ Spec file exists; this file is in FILES IN SCOPE; no out-of-scope files touched
□ No OrbitControls; no useState camera; Canvas has preserveDrawingBuffer + background color
□ Camera radius clamped Math.max(1.5, Math.min(6.0, value))
□ No Node.js imports in Edge Functions; CORS headers on all responses; JWT verified first
□ No API keys in client code; all types from @cova/shared; no TypeScript any
□ Loading + error + empty states in all UI; no style names in user-facing strings
□ All packages at exact pinned versions; pnpm overrides block in root package.json
□ Suspense wraps all useGLTF; FurniturePiece onPointerDown calls e.stopPropagation()
□ CLIP = 768 dim always; room dimensions from Zustand store; images compressed 1024px/0.8
□ style_applied in every renders INSERT; renders.status CHECK includes 'completed'
□ Integration test passes if render pipeline touched
```

---

*Owners: Daksh Parikh & Pranav Goel*
*Update §14 (Known Errors) when any new error is encountered and resolved.*
*Update PRODUCT_TRUTH.md when any product decision changes.*
*Both CLAUDE.md and PRODUCT_TRUTH.md are always authoritative over any individual prompt.*

---

## PRODUCT TRUTH

Feature-level truth spec lives in **PRODUCT_TRUTH.md** (repo root).
Read that file alongside this one at the start of every session.
Every ✓ TRUTH item there is enforced with the same authority as every rule here.
