# CLAUDE.md — Cova Project Intelligence File
# "tinder for your home" | AI Interior Design App
# Daksh Parikh & Pranav Goel | hellocova@gmail.com
# Bundle ID: ai.cova.app | Supabase Project: xdeacbmkdwqrwxonqaqh
#
# ⚠️ READ THIS ENTIRE FILE BEFORE WRITING A SINGLE LINE OF CODE.
# This file is the single source of truth for every architectural decision,
# version constraint, known crash pattern, and self-debugging rule in Cova.
# It is read at the start of every Claude Code session automatically.
# Every generated file must be checked against every rule in this file
# before it is considered complete. No exceptions.

---

## 0. FOUR-LAYER SELF-DEBUGGING PROTOCOL

This project uses a mandatory four-layer self-debugging strategy.
All four layers are active for every session, every file, every prompt.

### Layer 1 — Preventative Constraints (this file)
Before generating any file, check it against every rule in this CLAUDE.md.
If a rule would be violated, rewrite before outputting. Never output code
that violates a known crash pattern even if the prompt requests it.
This file is always authoritative over any individual prompt.

### Layer 2 — Per-File Self-Assertions
After generating each file, run this checklist internally before presenting it:
- [ ] No forbidden imports present (see Section 4)
- [ ] No forbidden patterns present (see Section 5)
- [ ] All version-locked packages at exact pinned versions (see Section 3)
- [ ] All TypeScript types imported from @cova/shared, not redefined locally
- [ ] All AI/external API calls go through Supabase Edge Functions only
- [ ] No API keys, secrets, or service role keys in any client-side file
- [ ] Loading, error, and empty states handled in every UI component
- [ ] No `any` TypeScript type used anywhere
- [ ] OrbitControls confirmed absent from all 3D files
- [ ] Camera values in useRef, never useState, in all 3D components
If any assertion fails → fix it before presenting the file.

### Layer 3 — Targeted /review After Each Major Component
After generating each major component, issue a targeted self-review:
Explicitly check the specific failure modes relevant to that component type.
For 3D components: "Verify no OrbitControls, no useState for camera,
  Canvas has preserveDrawingBuffer:true, background color set, radius clamped."
For Edge Functions: "Verify no Node.js imports, CORS headers on all responses,
  JWT verified before processing, no secrets in response body."
For UI screens: "Verify loading/error/empty states, no style names exposed,
  all colors from brand palette, TypeScript strict."
Fix anything found before moving to the next component.

### Layer 4 — Runtime Assertion Comments in Critical Files
Embed self-documenting assertion comments directly in generated code
at every point where a known crash pattern could be introduced by future edits:

```typescript
// ⚠️ ASSERTION: useRef ONLY — never useState for camera values.
// useState triggers re-renders that conflict with PanResponder gesture callbacks
// and cause the camera to freeze. This is a permanent architectural constraint.
const thetaRef = useRef(0)
```

These comments are permanent guardrails. Never remove them.

---

## 1. PROJECT OVERVIEW

### What Cova Is
A React Native iOS app (V1 iOS only) that:
1. Learns the user's interior design style through a Tinder-style swipe quiz
2. Captures their actual room via LiDAR scan (iPhone 12 Pro+) or guided photo
3. Generates a photorealistic AI render of their room in their style blend
4. Lets them buy every product in the render with one tap via affiliate links

### The Core User Flow
```
Splash Screen
  → Auth (Apple ID / Google / Email)
  → Dashboard (existing rooms + Suggested For You)
  → New Room Flow:
      Room Type Selection (7 types)
      → Style Fingerprint Quiz (Tinder swipe cards, AI-generated images)
      → Room Capture (LiDAR scan OR guided photo OR library upload)
      → Loading Screen (Depth Pro depth estimation + FLUX ControlNet render)
      → Choice Screen: "View AI Render" | "Arrange Furniture"
          → RenderViewScreen (photorealistic, first-person pan/zoom, immersive)
          → RoomViewer3DScreen (3D wireframe, furniture arrangement tool)
```

### The #1 Product Rule
The user NEVER sees a cartoon 3D wireframe as their primary experience.
They land in a photorealistic AI render of their actual room.
The 3D wireframe viewer exists ONLY as an optional furniture arrangement tool.
The render IS the product.

### What Is Already Built (Do Not Rebuild)
The following is complete and working. Do not recreate, modify, or re-run:
- Supabase database with all tables and RLS policies
- 3,136 products seeded (Wayfair 1222, Amazon 962, IKEA 941, CB2 11)
- 423 swipe cards generated and stored in swipe-cards bucket
- CLIP embeddings (768-dim) on all products with IVFFlat vector index
- Migration files: 20240018000000, 20240019000000, 20240020000000
- All scraping and seeding scripts in scripts/ directory
Running the data pipeline scripts again will create duplicates. Do not run them.

---

## 2. MONOREPO STRUCTURE

```
~/Desktop/cova/                              ← monorepo root
├── CLAUDE.md                                ← THIS FILE (read first always)
├── package.json                             ← root with pnpm overrides (critical)
├── pnpm-workspace.yaml                      ← workspace: apps/*, packages/*
├── .cursorrules                             ← Cursor IDE mirror of this file
├── .cursorignore                            ← excludes node_modules, assets, binaries
│
├── apps/
│   └── mobile/                             ← React Native Expo app
│       ├── app.json                        ← bundle ID: ai.cova.app, iOS only
│       ├── metro.config.js                 ← MUST include glb/gltf/hdr in assetExts
│       ├── .env                            ← ONLY anon key + URL here
│       ├── eas.json                        ← EAS build config
│       │
│       ├── src/
│       │   ├── screens/
│       │   │   ├── auth/
│       │   │   │   ├── SplashScreen.tsx
│       │   │   │   └── AuthScreen.tsx
│       │   │   └── main/
│       │   │       ├── HomeScreen.tsx
│       │   │       ├── StyleQuizScreen.tsx
│       │   │       ├── RoomCaptureScreen.tsx    ← BUILD TARGET: Part 1
│       │   │       ├── RoomViewer3DScreen.tsx   ← BUILD TARGET: Part 2
│       │   │       ├── RenderViewScreen.tsx     ← BUILD TARGET: Part 2
│       │   │       ├── ShopScreen.tsx
│       │   │       └── ProfileScreen.tsx
│       │   │
│       │   ├── components/
│       │   │   ├── 3d/
│       │   │   │   ├── BoxRoom.tsx              ← BUILD TARGET: Part 2
│       │   │   │   ├── SceneLighting.tsx        ← BUILD TARGET: Part 2
│       │   │   │   ├── FurniturePiece.tsx       ← BUILD TARGET: Part 2
│       │   │   │   └── CameraController.tsx     ← BUILD TARGET: Part 2
│       │   │   └── ui/
│       │   │       ├── TokenBalance.tsx
│       │   │       ├── LoadingOverlay.tsx
│       │   │       └── ProductPanel.tsx
│       │   │
│       │   ├── navigation/
│       │   │   └── RootNavigator.tsx            ← bottom tabs + stack
│       │   │
│       │   ├── store/
│       │   │   └── index.ts                     ← Zustand store, ALL slices here
│       │   │
│       │   ├── hooks/
│       │   │   ├── useRender.ts                 ← render polling hook
│       │   │   ├── useAuth.ts                   ← auth state hook
│       │   │   └── useRoomPlan.ts               ← RoomPlan native module bridge
│       │   │
│       │   ├── lib/
│       │   │   └── supabase.ts                  ← single Supabase client instance
│       │   │
│       │   └── data/
│       │       └── furnitureCatalog.ts           ← local GLB catalog metadata
│       │
│       ├── modules/                             ← Native Swift files (drag to Xcode)
│       │   ├── RoomPlanModule.swift             ← Cursor-generated Swift module
│       │   └── RoomPlanModule.m                 ← Cursor-generated ObjC bridge
│       │
│       └── assets/
│           ├── 3d/furniture/                    ← .glb furniture models
│           └── textures/                        ← PBR maps (.jpg) + HDRI (.hdr)
│
├── packages/
│   └── shared/
│       └── src/
│           ├── types.ts                         ← ALL shared TypeScript types
│           └── index.ts                         ← re-exports everything
│
└── supabase/
    ├── migrations/                              ← numbered SQL migration files
    └── functions/
        ├── render-room/index.ts                 ← Depth Pro + FLUX ControlNet
        ├── get-render-status/index.ts           ← Replicate prediction polling
        ├── clip-embed/index.ts                  ← OpenCLIP 768-dim embedding
        ├── match-products/index.ts              ← pgvector cosine similarity
        ├── chat-room/index.ts                   ← Claude Sonnet 4 Vision
        ├── handle-purchase/index.ts             ← StoreKit receipt verification
        └── delete-account/index.ts              ← GDPR full purge
```

---

## 3. LOCKED VERSIONS — NEVER CHANGE

These are non-negotiable. Changing any of these without full regression
testing will break the build in ways that are extremely hard to diagnose.
When pnpm tries to auto-upgrade any of these, always reject.

```
expo                    ~52.0.49       (never 53+)
react                   18.3.1 EXACT   (no caret, no tilde)
react-dom               18.3.1 EXACT   (no caret, no tilde)
@react-three/fiber      8.17.10 EXACT  (8.18+ breaks expo-gl on iOS)
@react-three/drei       9.88.0 EXACT   (later versions: unresolvable peer deps)
three                   0.155.0 EXACT  (0.156+ breaks geometry/material APIs)
@react-three/postprocessing  2.15.0    (version-tied to R3F 8.17)
node                    20.x           (never 22+ — Expo SDK 52 incompatible)
```

**Root package.json pnpm overrides block (must always be present):**
```json
{
  "pnpm": {
    "overrides": {
      "react": "18.3.1",
      "react-dom": "18.3.1",
      "three": "0.155.0"
    }
  }
}
```

Without this overrides block, pnpm hoists transitive dependency versions
of react, react-dom, and three that conflict with the locked versions.
The result is a runtime crash that gives no useful error message.

**Self-check command to verify versions:**
```bash
cd ~/Desktop/cova && pnpm why three
# Must show: three 0.155.0 — if it shows 0.156+ something is wrong
cd apps/mobile && pnpm list @react-three/fiber
# Must show: @react-three/fiber 8.17.10
```

---

## 4. FORBIDDEN IMPORTS — CAUSES IMMEDIATE CRASH

The following imports must NEVER appear in any file anywhere in apps/mobile/.
If Claude Code generates any of these, it is a critical error that must be
corrected before the file is presented.

### 4.1 OrbitControls and Related Controls
```typescript
// ❌ ALL OF THESE ARE FORBIDDEN — crash expo-gl with:
// "Cannot set properties of undefined (setting 'style')"
// This happens because these controls call domElement.style
// which does not exist in the expo-gl WebGL implementation.

import { OrbitControls } from '@react-three/drei'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { MapControls } from '@react-three/drei'
import { TrackballControls } from '@react-three/drei'
import { FlyControls } from '@react-three/drei'
import { PointerLockControls } from '@react-three/drei'
```

**The only permitted camera system:**
`apps/mobile/src/components/3d/CameraController.tsx`
with PanResponder + useFrame. No exceptions ever.

### 4.2 Node.js Built-ins in Edge Functions
```typescript
// ❌ FORBIDDEN in supabase/functions/ — Deno runtime, not Node.js
import fs from 'fs'
import path from 'path'
import { Buffer } from 'buffer'
import crypto from 'crypto'          // ✅ use: globalThis.crypto.subtle
import https from 'https'            // ✅ use: fetch() which is global in Deno
```

### 4.3 Service Role Key in Client Code
```typescript
// ❌ FORBIDDEN — exposes full database admin access
// Never construct a Supabase client with service_role key in apps/mobile/
const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ✅ CORRECT — use anon key only in client
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
)
```

### 4.4 Direct External API Calls from Client
```typescript
// ❌ FORBIDDEN — exposes API tokens, bypasses rate limiting and token gating
const res = await fetch('https://api.replicate.com/v1/predictions', {
  headers: { Authorization: `Token ${REPLICATE_TOKEN}` }
})

// ✅ CORRECT — all external API calls go through Edge Functions
const { data, error } = await supabase.functions.invoke('render-room', {
  body: { room_id, photo_base64, style_blend }
})
```

---

## 5. FORBIDDEN PATTERNS — CAUSES SUBTLE BUGS OR CRASHES

### 5.1 useState for 3D Camera Values
```typescript
// ❌ WRONG — every gesture event triggers re-render, freezes camera movement
const [theta, setTheta] = useState(0)
const [phi, setPhi] = useState(1.25)
const [radius, setRadius] = useState(4.5)

// ✅ CORRECT — useRef updates without re-render, safe for gesture callbacks
// ⚠️ ASSERTION: useRef ONLY for all camera values. This is a hard architectural rule.
const thetaRef  = useRef(0)      // horizontal angle: -Math.PI to Math.PI
const phiRef    = useRef(1.25)   // vertical: clamped 0.3 to Math.PI/2 - 0.05
const radiusRef = useRef(4.5)    // zoom: clamped 1.5 to 6.0
```

### 5.2 useEffect for Data Fetching
```typescript
// ❌ WRONG — race conditions, unhandled errors, no loading state
useEffect(() => {
  supabase.from('rooms').select('*').then(data => setRooms(data))
}, [])

// ✅ CORRECT — data fetching through Zustand store actions only
const { rooms, fetchRooms, isLoading, error } = useRoomStore()
useEffect(() => { fetchRooms() }, [])  // only triggers store action
// Loading/error state comes from the store
```

### 5.3 Canvas Without preserveDrawingBuffer
```typescript
// ❌ WRONG — before/after comparison slider and Save to Camera Roll will fail
<Canvas style={{ flex: 1 }}>

// ✅ CORRECT
<Canvas
  style={{ flex: 1 }}
  gl={{ preserveDrawingBuffer: true }}
  camera={{ fov: 75, near: 0.1, far: 50 }}
>
```

### 5.4 Canvas Without Background Color
```typescript
// ❌ WRONG — user sees grey or white void when camera approaches walls
<Canvas gl={{ preserveDrawingBuffer: true }}>
  <SceneLighting />
  <BoxRoom />

// ✅ CORRECT — background MUST match ceiling color of active style
<Canvas gl={{ preserveDrawingBuffer: true }}>
  <color attach="background" args={[STYLE_PALETTE[activeStyle].ceiling]} />
  <SceneLighting style={activeStyle} />
  <BoxRoom style={activeStyle} />
```

### 5.5 Camera Radius Without Proper Clamping
```typescript
// ❌ WRONG — user can zoom out past the walls and see void
radiusRef.current = Math.max(0.5, newRadius)

// ✅ CORRECT — max radius must keep camera inside room at all times
// Rule: maxRadius must be less than min(roomWidth, roomDepth) / 2 - 1.0
// For default room (16ft × 14ft ≈ 4.9m × 4.3m):
// maxRadius = min(4.9, 4.3) / 2 - 1.0 = 1.15m — too small for comfort
// Therefore use: maxRadius = 6.0 BUT verify room is large enough
// Always verify: radiusRef max < (roomDepth / 2) - 0.5
radiusRef.current = Math.max(1.5, Math.min(6.0, newRadius))
```

### 5.6 GLB Files Without metro.config.js Registration
```javascript
// ❌ WRONG — Metro cannot bundle .glb files, useGLTF crashes at load
// apps/mobile/metro.config.js with no assetExts:
module.exports = require('expo/metro-config').getDefaultConfig(__dirname)

// ✅ CORRECT
const { getDefaultConfig } = require('expo/metro-config')
const config = getDefaultConfig(__dirname)
config.resolver.assetExts.push('glb', 'gltf', 'hdr', 'ktx2')
module.exports = config
```

### 5.7 FurniturePiece Without Parent Suspense
```typescript
// ❌ WRONG — each FurniturePiece tries to handle its own loading state
// useGLTF without Suspense throws an unhandled promise rejection
function FurniturePiece({ piece }) {
  const { scene } = useGLTF(piece.glb_path)  // crashes without Suspense
}

// ✅ CORRECT — Suspense wraps ALL furniture pieces at parent level
// In RoomViewer3DScreen:
<Suspense fallback={null}>
  {placedFurniture.map(piece => (
    <FurniturePiece key={piece.id} piece={piece} ... />
  ))}
</Suspense>
```

### 5.8 PanResponder Inside Canvas
```typescript
// ❌ WRONG — PanResponder and Canvas fight for touch events, causes gesture lock
<Canvas>
  <View {...panResponder.panHandlers}>  {/* broken */}

// ✅ CORRECT — PanResponder is an absoluteFill View SIBLING to Canvas, not inside it
<View style={{ flex: 1 }}>
  {/* Canvas underneath */}
  <View style={StyleSheet.absoluteFill}>
    <Canvas gl={{ preserveDrawingBuffer: true }}>
      {/* 3D scene */}
    </Canvas>
  </View>
  {/* PanResponder overlay on top — pointerEvents='box-none' lets touches reach Canvas */}
  <View
    style={StyleSheet.absoluteFill}
    {...panResponder.panHandlers}
    pointerEvents="box-none"
  >
    {/* HUD elements here */}
  </View>
</View>
```

### 5.9 TypeScript `any`
```typescript
// ❌ WRONG — masks type errors that surface as runtime crashes
const room: any = data
const result: any = await fetchRender()

// ✅ CORRECT — always use types from @cova/shared
import type { Room, Render } from '@cova/shared'
const room: Room = data as Room
const result: Render = await fetchRender()
```

### 5.10 Style Names in User-Facing UI
```typescript
// ❌ WRONG — users don't know what "Japandi" means, breaks product principle
<Text>Your style: Japandi</Text>
<Text>Style: Coastal</Text>

// ✅ CORRECT — plain English labels in all user-facing UI
const STYLE_DISPLAY_NAMES: Record<StyleName, string> = {
  coastal:     'Ocean Breeze',
  japandi:     'Zen Garden',
  bohemian:    'Boho Spirit',
  mid_century: 'Mid-Century',
  minimalist:  'Pure Lines',
}
// Internal code may use 'japandi', 'coastal' etc — database, prompts, store
// User-facing Text components must always use STYLE_DISPLAY_NAMES
```

### 5.11 Missing CORS Headers in Edge Functions
```typescript
// ❌ WRONG — React Native fetch fails silently with network error
return new Response(JSON.stringify({ data }), { status: 200 })

// ✅ CORRECT — all Edge Functions must include CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Handle preflight
if (req.method === 'OPTIONS') {
  return new Response('ok', { headers: corsHeaders })
}

// All responses include CORS headers
return new Response(JSON.stringify({ data }), {
  status: 200,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
})
```

### 5.12 Hardcoded Room Dimensions
```typescript
// ❌ WRONG — ignores the user's actual room, defeats the whole product
const roomWidth = 16
const roomDepth = 14
const roomHeight = 9

// ✅ CORRECT — always from Zustand store (populated by room capture)
const dimensions = useRoomStore(state => state.currentRoom?.dimensions)
const roomWidth  = dimensions?.width  ?? 4.9  // metric fallback
const roomDepth  = dimensions?.depth  ?? 4.3
const roomHeight = dimensions?.height ?? 2.7
// Note: RoomPlan returns meters. Photo path also returns meters via Depth Pro.
// Store dimensions in meters. Convert to feet only for display to user.
```

---

## 6. ROOM CAPTURE ARCHITECTURE (Part 1)

### 6.1 Three Capture Paths

**Path A — RoomPlan LiDAR (iPhone 12 Pro, 13 Pro, 14 Pro, 15 Pro, all Pro Max)**
- Detect LiDAR: call `RoomPlanModule.isLiDARAvailable()` before showing option
- Launch: `RoomPlanModule.startScan()` — returns `RoomPlanResult` on completion
- Output: exact room dimensions in meters, door/window positions, thumbnail
- Hide this option entirely on non-LiDAR devices — don't show greyed-out

```typescript
type RoomPlanResult = {
  width: number           // meters
  depth: number           // meters
  height: number          // meters
  doors: Array<{
    x: number             // position along wall in meters
    z: number
    width: number
    wallSide: 'front' | 'back' | 'left' | 'right'
  }>
  windows: Array<{
    x: number
    z: number
    width: number
    height: number
    wallSide: 'front' | 'back' | 'left' | 'right'
  }>
  thumbnailBase64: string // JPEG screenshot of completed scan for storage
}
```

**Path B — Guided Photo Capture (all iPhones)**
- Instruction screen first: "Stand in the doorway. Capture the entire room."
- Live camera with corner bracket guides in overlay (helps user frame properly)
- Single photo taken with expo-camera
- Upload to Supabase room-photos bucket
- Call render-room Edge Function with photo → Depth Pro runs server-side
- Optional "Refine" button reveals 4-corner drag + width/depth/height sliders

**Path C — Library Upload (all iPhones)**
- expo-image-picker for library selection
- Identical depth estimation flow as Path B
- Same optional refinement available

### 6.2 Depth Estimation — Apple Depth Pro (NOT Depth Anything V2)

**IMPORTANT:** The build guide specifies Depth Anything V2. This has been
upgraded to Apple Depth Pro based on research. Depth Pro is better because:
- Produces METRIC depth (real meters) not relative depth
- No camera intrinsics needed — estimates focal length automatically
- Outperforms Depth Anything V2 on indoor benchmarks
- Available on Replicate: `garg-aayush/ml-depth-pro`
- Same API call pattern as Depth Anything V2 — one-line change

**Always use Depth Pro in the render-room Edge Function.**
Never revert to Depth Anything V2.

### 6.3 Post-Capture Loading Screen

Progress stages shown to user (with animated progress indicator):
```
Stage 1: "Analyzing your room..."      (0–5s)
Stage 2: "Measuring depth..."          (5–15s)
Stage 3: "Applying your style..."      (15–25s)
Stage 4: "Generating render..."        (25–40s)
Stage 5: "Adding finishing touches..."  (40–55s)
Stage 6: "Done!" → navigate to choice screen
```

### 6.4 Choice Screen (After Loading)

```
┌────────────────────────────────────────────┐
│  ✨ Your room is ready                     │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │       View AI Render                 │  │  → RenderViewScreen
│  │  See your room reimagined            │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │       Arrange Furniture              │  │  → RoomViewer3DScreen
│  │  Move pieces before rendering        │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

### 6.5 RoomPlan Swift Module — What Cursor Must Generate

Three files:

**1. apps/mobile/modules/RoomPlanModule.swift**
- RoomCaptureSession setup and management
- `isLiDARAvailable()` method using ARWorldTrackingConfiguration
- `startScan()` method launching RoomCaptureView
- `stopScan()` method finalizing and returning RoomPlanResult as JSON
- Delegate methods: `captureSession(_:didAdd:)`, `captureSession(_:didProvide:)`
- Error handling for `exceedSceneSizeLimit`, `worldTrackingFailed`

**2. apps/mobile/modules/RoomPlanModule.m**
- Objective-C bridge exposing Swift methods to React Native
- `RCT_EXTERN_MODULE(RoomPlanModule, NSObject)`
- `RCT_EXTERN_METHOD` for each exported method

**3. apps/mobile/src/hooks/useRoomPlan.ts**
- TypeScript hook wrapping NativeModules.RoomPlanModule
- `isLiDARAvailable(): Promise<boolean>`
- `startScan(): Promise<RoomPlanResult>`
- `stopScan(): Promise<void>`
- Proper error handling and type safety

**Integration steps after Cursor generates (manual — ~5 minutes):**
1. Open Xcode: `cd apps/mobile && xed ios/`
2. Project Navigator → right-click Cova group → "Add Files to Cova..."
3. Select `modules/RoomPlanModule.swift` — check "Copy items if needed"
4. Select `modules/RoomPlanModule.m` — check "Copy items if needed"
5. Build target: Cova (not CovaTodayExtension if present)
6. Set iOS deployment target to minimum 16.0 in project settings
7. Add to app.json ios.infoPlist: `NSCameraUsageDescription` and
   `NSPhotoLibraryUsageDescription` strings
8. `cd apps/mobile && npx expo run:ios` (full rebuild required)

---

## 7. 3D ROOM VIEWER ARCHITECTURE (Part 2)

### 7.1 CameraController.tsx — Complete Contract

This is the most critical file in the 3D system. Get it exactly right.

```typescript
// ⚠️ ASSERTION: ALL values MUST be useRef. NEVER useState.
// State updates cause re-renders that conflict with PanResponder gesture
// callbacks and cause the camera to freeze mid-gesture. This is permanent.

const thetaRef  = useRef(0)      // horizontal rotation: -Math.PI to Math.PI
const phiRef    = useRef(1.25)   // vertical: Math.max(0.3, Math.min(Math.PI/2 - 0.05, val))
const radiusRef = useRef(4.5)    // zoom: Math.max(1.5, Math.min(6.0, val))

// Starting position: theta=0, phi=1.25, radius=4.5
// This places the camera at the doorway, eye level, looking into the room.
// The camera looks toward the center of the room at [0, 1.2, 0] (chest height).

// forwardRef + useImperativeHandle exposes handlePan and handleZoom
// to RoomViewer3DScreen so the PanResponder can call them.

// useFrame runs every animation frame — reads refs, updates camera position
useFrame(() => {
  const theta  = thetaRef.current
  const phi    = phiRef.current
  const radius = radiusRef.current
  camera.position.x = radius * Math.sin(phi) * Math.sin(theta)
  camera.position.y = radius * Math.cos(phi)
  camera.position.z = radius * Math.sin(phi) * Math.cos(theta)
  camera.lookAt(0, 1.2, 0)
})
```

### 7.2 PanResponder Architecture in RoomViewer3DScreen

```
Layout structure (z-order from back to front):
  View flex:1
  └── View StyleSheet.absoluteFill     ← Canvas layer (back)
      └── Canvas                       ← Three.js renders here
  └── View StyleSheet.absoluteFill     ← PanResponder layer (front)
      pointerEvents="box-none"         ← lets touches pass through to Canvas
      {...panResponder.panHandlers}
      └── [HUD elements]               ← buttons, panels, overlays
```

**PanResponder gate rules:**
```typescript
onMoveShouldSetPanResponder: (_, gs) => {
  // ONLY intercept for camera when no furniture is selected
  // When furniture IS selected, PanResponder releases control to
  // the FurniturePiece's onPointerMove handler
  return selectedIdRef.current === null &&
         (Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2)
},
```

**Key refs in RoomViewer3DScreen (ALL must be useRef):**
```typescript
const cameraRef         = useRef<CameraControllerHandle>(null)
const selectedIdRef     = useRef<string | null>(null)  // selected furniture ID
const isDraggingRef     = useRef(false)
const lastTouchRef      = useRef({ x: 0, y: 0 })
const pinchStartDistRef = useRef(0)
// forceUpdate is the ONE allowed useState — only triggers re-render for selection UI
const [forceUpdate, setForceUpdate] = useState(0)
```

### 7.3 BoxRoom Component — Style Palette

```typescript
// ⚠️ Canvas background MUST always match ceiling color of active style
const STYLE_PALETTE = {
  coastal:     { floor: '#C8B89A', walls: '#E8DFD0', ceiling: '#F5F0E8', trim: '#FFFFFF', emissive: '#FFF8F0' },
  japandi:     { floor: '#8B7355', walls: '#D4CAB8', ceiling: '#EDE8DF', trim: '#F0EDE6', emissive: '#FFFAF5' },
  bohemian:    { floor: '#A0785A', walls: '#D4B896', ceiling: '#E8D5B7', trim: '#C8A882', emissive: '#FFF5E8' },
  mid_century: { floor: '#8B6914', walls: '#C8A870', ceiling: '#E8D098', trim: '#5C3D1E', emissive: '#FFF0D0' },
  minimalist:  { floor: '#D0D0D0', walls: '#E8E8E8', ceiling: '#F5F5F5', trim: '#FFFFFF', emissive: '#FFFFFF' },
}

// Surfaces to render (5 faces — no front wall, that's the doorway):
// 1. Floor:     rotation={[-Math.PI/2, 0, 0]},   position={[0, 0, 0]}
// 2. Ceiling:   rotation={[Math.PI/2, 0, 0]},    position={[0, height, 0]}
// 3. BackWall:  position={[0, height/2, -depth/2]}
// 4. LeftWall:  rotation={[0, Math.PI/2, 0]},    position={[-width/2, height/2, 0]}
// 5. RightWall: rotation={[0, -Math.PI/2, 0]},   position={[width/2, height/2, 0]}

// PBR floor textures:
// - repeat = new THREE.Vector2(width/4, depth/4)
// - wrapS = wrapT = THREE.RepeatWrapping
// - Graceful fallback to solid color if texture load fails (try/catch)

// Architectural trim (required — no shortcuts):
// - Crown molding: BoxGeometry at ceiling-wall junctions (4 pieces)
// - Baseboards: BoxGeometry at floor-wall junctions (4 pieces)
// - Door frame at entrance (front center): 2 vertical + 1 horizontal box

// Window plane (required):
// - Emissive mesh on back wall: position={[0, height*0.55, -depth/2+0.01]}
// - Size: 1.5 × 2.5 units, emissiveIntensity: 0.5
// - Paired directionalLight from window position casting shadows
```

### 7.4 SceneLighting Component

```typescript
const HDRI_MAP = {
  coastal:     require('../../../assets/textures/hdri/sunset_fairway_1k.hdr'),
  japandi:     require('../../../assets/textures/hdri/small_empty_room_1k.hdr'),
  bohemian:    require('../../../assets/textures/hdri/colorful_studio_1k.hdr'),
  mid_century: require('../../../assets/textures/hdri/loft_hall_1k.hdr'),
  minimalist:  require('../../../assets/textures/hdri/grey_room_1k.hdr'),
}

// Always wrap Environment in try/catch or error boundary
// If HDRI fails to load, fall back to hemisphereLight — never crash the scene
// Use 1K resolution HDRIs only — higher resolution exhausts mobile VRAM
```

### 7.5 FurniturePiece Component

```typescript
// Scene cloning (required to prevent shared material mutations):
const clonedScene = useMemo(() => scene.clone(true), [scene])

// Shadow casting (required for realism):
clonedScene.traverse(child => {
  if ((child as THREE.Mesh).isMesh) child.castShadow = true
})

// Drag: uses THREE.Plane at y=0 (floor) with raycaster intersection
// Position clamping:
//   x: [-(roomWidth/2  - piece.width/2),  (roomWidth/2  - piece.width/2)]
//   z: [-(roomDepth/2  - piece.depth/2),  (roomDepth/2  - piece.depth/2)]

// onPointerDown: MUST call e.stopPropagation()
// Without this, the touch also triggers camera movement simultaneously

// Selection ring: gold torus at y=0.01 (NOT y=0 — intersects floor plane)
// Color: #C47B3C | radius: max(piece.width, piece.depth) / 2
```

### 7.6 SSAO Setup

```typescript
// Package: @react-three/postprocessing@2.15.0 EXACT
import { EffectComposer, SSAO } from '@react-three/postprocessing'

// Must be inside Canvas:
<EffectComposer>
  <SSAO radius={0.05} intensity={15} luminanceInfluence={0.6} />
</EffectComposer>

// If SSAO causes crash: verify @react-three/postprocessing is exactly 2.15.0
// Temporary diagnosis: remove EffectComposer to confirm SSAO is the cause
// Never ship without SSAO — it provides critical under-furniture darkening
```

---

## 8. AI RENDER PIPELINE (Edge Functions)

### 8.1 render-room Edge Function

**Sequence:**
1. Verify JWT — reject unauthorized requests immediately
2. Check tokens_enabled — if true and balance < cost, return 402
3. Upload photo to room-photos bucket if not already uploaded
4. Call Depth Pro via Replicate: `garg-aayush/ml-depth-pro`
5. Poll Replicate until depth map ready (exponential backoff: 3s, 6s, 12s)
6. Generate Canny edge map server-side from original photo
7. Build FLUX prompt from style_blend using buildPrompt() function
8. Call FLUX ControlNet Union Pro 2.0 via Replicate with depth + Canny
9. Poll for render completion (same backoff pattern)
10. Download completed render image
11. Upload to renders bucket: `{user_id}/{room_id}/{timestamp}.jpg`
12. Update renders table: status='completed', image_url=signedUrl
13. Return render ID to client for polling

**Prompt construction from style_blend:**
```typescript
function buildPrompt(styleBlend: Record<string, number>): string {
  const STYLE_PROMPTS = {
    coastal:     'coastal interior, light blue and white palette, natural linen, driftwood accents, airy and bright',
    japandi:     'japandi interior, warm neutrals, natural wood, minimalist zen, wabi-sabi, serene organic materials',
    bohemian:    'bohemian interior, rich jewel tones, layered textiles, rattan and macrame, warm eclectic lighting',
    mid_century: 'mid-century modern, walnut wood, warm amber, clean lines, retro curves, bold accent colors',
    minimalist:  'minimalist interior, pure white walls, clean lines, maximum natural light, monochromatic palette',
  }
  const base = 'photorealistic interior design render, architectural photography quality, professional staging, 8K resolution, perfect lighting, sharp focus'
  const sorted = Object.entries(styleBlend).sort(([,a],[,b]) => b-a).filter(([,w]) => w > 0.05)
  const styleText = sorted.map(([style, weight]) => {
    const prefix = weight > 0.5 ? '' : weight > 0.25 ? 'hints of ' : 'subtle touches of '
    return prefix + STYLE_PROMPTS[style]
  }).join(', ')
  return `${base}, ${styleText}`
}
```

### 8.2 get-render-status Edge Function

```typescript
// Client polls this endpoint every 3 seconds while showing loading screen
// Returns: { status: 'pending'|'processing'|'completed'|'failed', image_url?: string }
// On 'completed': image_url is a signed URL (1 hour expiry) from renders bucket
// On 'failed': return error message so client can show "Try again" UI
```

### 8.3 CLIP Dimensions — CRITICAL

**The products table uses 768-dimensional CLIP embeddings, NOT 1024.**

The data pipeline used 768-dim OpenCLIP. The build guide says 1024 — this
is wrong. Always use 768 in:
- clip-embed Edge Function (request 768-dim from Replicate)
- match-products Edge Function (pgvector search against 768-dim column)
- Any new product seeding scripts

```typescript
// ❌ WRONG
const embedding = await clipEmbed(imageUrl, { dimensions: 1024 })

// ✅ CORRECT
const embedding = await clipEmbed(imageUrl, { dimensions: 768 })
```

---

## 9. DATABASE REFERENCE

All tables have RLS. Verify before any write. Standard policy pattern:
```sql
CREATE POLICY "{table}_own" ON {table}
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

**Key tables for current build phase:**
```
rooms                — room_id, user_id, name, room_type, style_blend,
                       dimensions_json (stores width/depth/height in meters),
                       budget, latest_render_url, status
renders              — id, room_id, user_id, image_url, status,
                       replicate_prediction_id, prompt_used, tokens_used
furniture_placements — id, room_id, furniture_catalog_id,
                       position_x, position_y, rotation_y, scale
products             — id, name, price, retailer, affiliate_url,
                       clip_embedding vector(768)  ← 768 NOT 1024
swipe_cards          — id, image_url, room_type, style_weights jsonb, active
```

**dimensions_json schema:**
```json
{
  "width": 4.9,
  "depth": 4.3,
  "height": 2.7,
  "unit": "m"
}
```
Always store in meters. RoomPlan returns meters. Depth Pro returns meters.
Convert to feet/inches only for display in UI (Settings → Units preference).

---

## 10. ZUSTAND STORE SLICES

All store slices live in `apps/mobile/src/store/index.ts`.

```typescript
// authSlice
{
  user: User | null
  session: Session | null
  isLoading: boolean
  signIn: (provider: 'apple'|'google'|'email', ...) => Promise<void>
  signOut: () => Promise<void>
}

// roomSlice
{
  rooms: Room[]
  currentRoom: Room | null
  currentRoomDimensions: RoomDimensions | null
  placedFurniture: FurniturePiece[]
  activeStyle: StyleName
  isLoading: boolean
  fetchRooms: () => Promise<void>
  createRoom: (type: RoomType) => Promise<Room>
  setCurrentRoom: (room: Room) => void
  setRoomDimensions: (dims: RoomDimensions) => void
  setActiveStyle: (style: StyleName) => void
  addFurniture: (item: FurnitureCatalogItem) => void
  removeFurniture: (id: string) => void
  updateFurniturePosition: (id: string, x: number, z: number) => void
  updateFurnitureRotation: (id: string, rotY: number) => void
  saveFurniturePlacements: () => Promise<void>
}

// renderSlice
{
  currentRender: Render | null
  renderHistory: Render[]
  isRendering: boolean
  renderProgress: string
  startRender: (roomId: string) => Promise<void>
  pollRenderStatus: (renderId: string) => Promise<void>
}

// quizSlice
{
  cards: SwipeCard[]
  styleBlend: StyleBlend
  isComplete: boolean
  swipeRight: (card: SwipeCard) => void
  swipeLeft: (card: SwipeCard) => void
  swipeNeutral: (card: SwipeCard) => void
  completeQuiz: () => void
}

// cartSlice
{
  items: CartItem[]
  addToCart: (product: Product) => Promise<void>
  removeFromCart: (itemId: string) => Promise<void>
  clearCart: () => Promise<void>
}

// uiSlice
{
  tokenBalance: number    // always 999 in V1
  isHUDVisible: boolean
  hudTimeout: NodeJS.Timeout | null
  showHUD: () => void
  hideHUD: () => void
}
```

---

## 11. BRAND AND UI CONSTANTS

```typescript
// Colors — use these exact hex values everywhere, no approximations
export const COLORS = {
  primary:       '#1B3A2D',  // dark forest green
  accent:        '#C47B3C',  // copper gold
  background:    '#F5F0E8',  // warm cream
  textPrimary:   '#1A1A1A',  // near black
  textSecondary: '#888888',  // mid grey
  textOnDark:    '#FFFFFF',  // white on green
  error:         '#CC3333',
  success:       '#2E7D32',
}

// Border radius
export const RADIUS = {
  card:   16,
  button: 28,   // pill shape
  modal:  20,   // top corners only for bottom sheets
  input:  12,
}

// Shadows (iOS)
export const SHADOW = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,  // Android fallback
  }
}

// Never import custom fonts — use system font (SF Pro on iOS) throughout
// Never use the words: Japandi, Coastal, Bohemian, Mid-Century, Minimalist
// in any user-facing string
```

---

## 12. ENVIRONMENT VARIABLES

```bash
# apps/mobile/.env — ONLY these two keys here
EXPO_PUBLIC_SUPABASE_URL=https://xdeacbmkdwqrwxonqaqh.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=[anon public key from Supabase dashboard]

# Supabase Edge Function Secrets (Dashboard → Settings → Edge Functions → Secrets)
# NEVER in .env, NEVER in client code, NEVER in git
SUPABASE_SERVICE_ROLE_KEY=[service_role key]
REPLICATE_API_TOKEN=[from replicate.com/account/api-tokens]
ANTHROPIC_API_KEY=[from console.anthropic.com]
APPLE_SHARED_SECRET=[from App Store Connect for StoreKit]
```

**app.json infoPlist entries required (add if missing):**
```json
{
  "ios": {
    "infoPlist": {
      "NSCameraUsageDescription": "Cova needs camera access to capture your room.",
      "NSPhotoLibraryUsageDescription": "Cova needs photo library access to upload room photos.",
      "NSPhotoLibraryAddUsageDescription": "Cova saves your AI renders to your photo library."
    }
  }
}
```

---

## 13. KNOWN ERRORS AND EXACT FIXES

This is the permanent error log. Add every new error + fix here immediately.

### 13.1 Three.js / expo-gl / R3F Errors

| Error Message | Root Cause | Exact Fix |
|--------------|-----------|-----------|
| `Cannot set properties of undefined (setting 'style')` | OrbitControls anywhere in codebase | `grep -r "OrbitControls" apps/mobile/src` — remove every reference |
| White void visible outside room walls | Canvas background not set to ceiling color | Add `<color attach="background" args={[ceilingColor]} />` as first child of Canvas |
| Camera freezes permanently after selecting furniture | `selectedIdRef.current` never reset to null | In handleDone button: `selectedIdRef.current = null; setForceUpdate(n => n+1)` |
| Furniture drag also rotates camera | PanResponder intercepts during furniture drag | `onMoveShouldSetPanResponder` must return `false` when `selectedIdRef.current !== null` |
| `Module not found: three/examples/jsm/controls/OrbitControls` | OrbitControls import | Remove import entirely — use CameraController |
| `useGLTF` crash / unhandled promise rejection | Missing Suspense boundary | Wrap ALL FurniturePiece components in single `<Suspense fallback={null}>` in parent |
| GLB file bundling error / "Unable to resolve module" | `glb` not in metro assetExts | Add `config.resolver.assetExts.push('glb', 'gltf', 'hdr')` to metro.config.js |
| HDRI crashes app / VRAM exhausted | HDR file too large | Use 1K resolution only. If still crashing, remove `<Environment>` and use only lights |
| Furniture appears floating or underground | GLB model origin not at y=0 | Add `position={[0, yOffset, 0]}` to primitive group — test each model |
| SSAO `TypeError` on mount | Version mismatch with R3F 8.17 | Verify `@react-three/postprocessing` is `2.15.0` exactly. Pin in package.json. |
| Pinch zoom extremely jumpy | pinchStartDistRef not reset between move events | Reset `pinchStartDistRef.current = dist` at END of each move event |
| Selection ring invisible (floor intersection) | Ring y position = 0 clips into floor | Set ring group `position={[0, 0.01, 0]}` |
| `three is undefined` at runtime | pnpm hoisted wrong version | Verify pnpm overrides in root package.json. Run `pnpm why three`. |
| Canvas renders as black screen | `gl` prop missing or malformed | Ensure `gl={{ preserveDrawingBuffer: true }}` exactly |
| PBR textures not loading | Require path wrong or texture not in assetExts | Check require path is relative. Add jpg to assetExts if needed. |

### 13.2 React Native / Expo Errors

| Error Message | Root Cause | Exact Fix |
|--------------|-----------|-----------|
| Metro crash on startup | watchman not installed | `brew install watchman` then restart Metro |
| `ExpoModulesCore` not found after adding Swift module | Needs full native rebuild | `cd apps/mobile && npx expo run:ios` (not `expo start`) |
| Camera permission never prompts user | `NSCameraUsageDescription` missing from app.json | Add to `ios.infoPlist` in app.json — rebuild |
| Photo library picker crashes | `NSPhotoLibraryUsageDescription` missing | Add to `ios.infoPlist` in app.json — rebuild |
| `pnpm install` installs react 19 or three 0.160+ | Missing pnpm overrides block | Add overrides to root package.json — `pnpm install` again |
| Build fails: "Duplicate symbol _OBJC_CLASS_$_..." | Two bridge files registered | Remove one `.m` file — each module needs exactly one bridge |
| `[Invariant Violation] Module AppRegistry is not registered` | React version mismatch | Verify react AND react-dom are both exactly 18.3.1 |
| EAS build fails: "node version" | node 22+ in environment | `nvm use 20` or set node 20 as default |

### 13.3 Supabase / Edge Function Errors

| Error Message | Root Cause | Exact Fix |
|--------------|-----------|-----------|
| `Deno is not defined` | Node.js import in Edge Function | Replace with Deno equivalents. No `require()`. No `import fs from 'fs'`. |
| CORS error from React Native | Missing CORS headers | Return `Access-Control-Allow-Origin: *` on ALL responses + handle OPTIONS |
| `JWT expired` auth failure | Stale session not refreshed | Use `supabase.auth.getSession()` — it auto-refreshes. Never store JWT string manually. |
| `row-level security policy violation` | RLS policy missing or wrong | Verify `auth.uid() = user_id` in policy. Test with `SET ROLE authenticated` in SQL editor. |
| `relation "renders" does not exist` | Migration not applied | Run `supabase db push` or apply migration in Dashboard SQL Editor |
| `column clip_embedding does not exist` | Migration order wrong | Verify migration `20240020000000_clip_vector_768.sql` is applied |
| Vector similarity search returns wrong results | Using 1024-dim vs 768-dim mismatch | Always use 768 everywhere in this project |
| Replicate prediction stuck in `starting` | Queue congestion | Implement exponential backoff: poll at 3s, 6s, 12s, 24s — timeout after 120s |
| Storage upload fails | Bucket doesn't exist or wrong name | Verify buckets: room-photos, renders, swipe-cards, assets — all must be private |
| `invalid input syntax for type vector` | Embedding dimension mismatch | clip_embedding column is vector(768) — never insert 1024-dim vectors |

### 13.4 RoomPlan Swift Errors

| Error | Root Cause | Exact Fix |
|-------|-----------|-----------|
| `exceedSceneSizeLimit` after first scan | Previous AR session not released | Call `session.stop()` and `session = nil` before starting new scan |
| `worldTrackingFailed` | Low light or featureless surfaces | Show guidance: "Move to a well-lit area with visible textures" |
| `No such module 'RoomPlan'` in Xcode | iOS deployment target < 16.0 | Set minimum iOS deployment target to 16.0 in Xcode project settings |
| React Native `NativeModules.RoomPlanModule` is undefined | Swift files not added to Xcode | Ensure BOTH `.swift` AND `.m` files added to Xcode project — rebuild |
| `RCTBridgeModule` protocol not found | New Architecture conflict with Expo 52 | Add `"newArchEnabled": false` in app.json expo object — rebuild |
| Phantom walls detected | Mirrors or glass surfaces in room | Add user guidance before scan: "Cover mirrors before scanning" |
| Scan completes but returns empty dimensions | Room too dark or plain white walls | Add guidance: "Ensure room has good lighting and visible surface texture" |

---

## 14. VALIDATION CHECKLISTS

Do not proceed to the next component until all items pass on physical iPhone.
The iOS Simulator gives false positives for expo-gl, camera, and RoomPlan.

### 14.1 Room Capture — Part 1 Done When:
- [ ] Camera permission prompt appears on first visit, not on subsequent visits
- [ ] LiDAR scan option visible ONLY on LiDAR-capable devices (iPhone 12 Pro+)
- [ ] Photo capture path works on all iPhones
- [ ] Library upload path works on all iPhones
- [ ] Depth Pro called server-side (confirmed in Supabase Edge Function logs)
- [ ] Depth map generated and stored (visible in Supabase Storage: room-photos)
- [ ] Room dimensions stored in Zustand store (log them to console to verify)
- [ ] Loading screen shows all 6 progress stages in sequence
- [ ] Choice screen appears after loading: two clear CTA buttons
- [ ] "View AI Render" → triggers render → navigates to RenderViewScreen
- [ ] "Arrange Furniture" → navigates to RoomViewer3DScreen with correct dimensions
- [ ] Optional "Refine" button reveals 4-corner drag calibration
- [ ] No crash when navigating away during active capture
- [ ] No crash when camera permission is denied

### 14.2 3D Viewer — Part 2 Done When:
- [ ] Room renders with ZERO white space on physical iPhone
- [ ] Camera positioned at doorway, eye level, looking inward
- [ ] One-finger swipe: look left/right/up/down smoothly
- [ ] Two-finger pinch: zoom in/out, camera never exits room
- [ ] Camera cannot zoom out to show void/exterior — ever
- [ ] Furniture appears at correct positions and heights
- [ ] Tap selects piece — gold ring appears at y=0.01 (not floating, not underground)
- [ ] Drag moves piece along floor — cannot go through walls
- [ ] Camera does NOT move while furniture is selected and being dragged
- [ ] Rotate buttons turn piece exactly 45 degrees
- [ ] Delete with confirmation removes piece
- [ ] Done deselects piece, camera control resumes immediately
- [ ] Undo restores last change
- [ ] SSAO subtle darkening visible in corners and under furniture
- [ ] Style chips switch colors (floor/walls/ceiling update, furniture positions preserved)
- [ ] 2D floor plan toggle shows overhead layout
- [ ] Furniture positions persist across 2D ↔ 3D toggle
- [ ] "+" button opens catalog bottom sheet
- [ ] Catalog filtered by room type and style
- [ ] Tapping catalog item places furniture at room center, immediately selected

### 14.3 Render View — Part 2 Done When:
- [ ] Render fills 100% of screen, no letterboxing, no padding, no safe-area gaps
- [ ] Single finger pan moves the image (look-around simulation)
- [ ] Pinch zooms, hard max at 2.5×
- [ ] Cannot zoom out below 1× (letterboxing not permitted)
- [ ] HUD (buttons) visible on first arrival, auto-hides after 3 seconds
- [ ] Tap anywhere shows HUD again
- [ ] Regenerate triggers new render with loading screen
- [ ] Save to camera roll works, permission prompt shown if needed
- [ ] iOS share sheet opens and works
- [ ] Chat bubble opens chatbot panel (60% screen height, slides up)
- [ ] Product panel slides in from left edge
- [ ] Before/After slider: left = original photo, right = render
- [ ] Before/After divider is draggable left/right with PanResponder

---

## 15. SELF-CHECK BEFORE COMPLETING ANY FILE

Run this checklist internally before presenting any generated file.
If any item fails → fix before output. No exceptions.

```
□ No OrbitControls import anywhere in this file
□ No useState for camera values (only useRef permitted in 3D files)
□ Canvas has gl={{ preserveDrawingBuffer: true }} if this touches Canvas
□ Canvas has <color attach="background" args={[ceilingColor]} /> if 3D room
□ Camera radius clamped: Math.max(1.5, Math.min(6.0, value))
□ No Node.js imports if this is an Edge Function (supabase/functions/)
□ CORS headers on all responses if this is an Edge Function
□ JWT verification at top of Edge Function before any processing
□ No API keys or secrets in client-side code
□ All types from @cova/shared — no local type redefinitions
□ No TypeScript `any` — fix the type properly
□ Loading, error, empty states handled in every UI component
□ No style names (Japandi/Coastal/etc) in user-facing strings
□ All hex colors from COLORS constant — no hardcoded approximations
□ All package versions at exact pins from Section 3
□ Suspense boundary wrapping all useGLTF calls
□ FurniturePiece onPointerDown calls e.stopPropagation()
□ GLB files registered in metro.config.js assetExts
□ CLIP operations use 768 dimensions (never 1024)
□ Room dimensions from Zustand store (never hardcoded)
□ pnpm overrides block present in root package.json
```

---

*CLAUDE.md Version 1.0 — Established at project build start*
*Update Section 13 (Known Errors) immediately when any new error is encountered and resolved.*
*This file is the living source of truth for the Cova build.*
*All four self-debugging layers are always active.*
