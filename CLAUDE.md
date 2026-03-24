# CLAUDE.md — Cova Project Intelligence File
# "tinder for your home" | AI Interior Design App
# Daksh Parikh & Pranav Goel | hellocova@gmail.com
# Bundle ID: ai.cova.app | Supabase Project: xdeacbmkdwqrwxonqaqh
#
# ⚠️ READ THIS ENTIRE FILE BEFORE WRITING A SINGLE LINE OF CODE.
# This is the single source of truth for every architectural decision,
# product rule, version constraint, known crash pattern, and self-debugging
# rule in Cova. It is read at the start of every Claude Code session.
# Every generated file must be checked against every rule here before
# it is considered complete. No exceptions. Ever.

---

## 0. MANDATORY EXECUTION PIPELINE
# Every single fix, feature, or change follows this pipeline. No exceptions.
# Do not skip any step. Do not combine steps. Do not proceed if any step fails.

### Step 1 — Spec File (BEFORE any code is written)
Before touching any file, Claude Code must produce a spec file at:
  `.claude/specs/[YYYY-MM-DD]-[short-description].md`

The spec file must contain:
  - PROBLEM: One sentence describing exactly what is broken or missing
  - FILES IN SCOPE: Explicit list of every file that will be touched
  - FILES OUT OF SCOPE: Explicit list of files that must not be touched
  - ACCEPTANCE CRITERIA: Numbered list of exactly what passing looks like
  - WHAT NOT TO DO: Explicit list of changes that are forbidden in this fix

No code is written until the spec file is complete.
If the spec is ambiguous → stop and ask for clarification before proceeding.

### Step 2 — Planner Agent
After the spec is written, invoke the planner subagent:
  `Use the planner agent to break this spec into implementation phases.`

The planner reads: CLAUDE.md + all files in scope + the spec file.
The planner outputs: a numbered phase list with one task per phase.
The planner touches ZERO code files.

### Step 3 — Executor Agent
After the plan is approved, invoke the executor subagent:
  `Use the executor agent to implement phase [N].`

The executor implements exactly one phase at a time.
The executor only touches files listed in FILES IN SCOPE.
If the executor tries to touch a file not in scope → stop, reject, restart.

### Step 4 — Verifier Agent
After each phase is implemented, invoke the verifier subagent:
  `Use the verifier agent to verify phase [N] against the spec.`

The verifier runs: build check + integration test + acceptance criteria check.
The verifier returns: PASS, FAIL, or PARTIAL with file:line references.
If FAIL or PARTIAL → executor re-implements that phase only. Repeat until PASS.
Do not proceed to the next phase until the current phase returns PASS.

### Step 5 — Integration Test (Render Pipeline)
After every fix that touches the render pipeline, run:
  `npx ts-node supabase/functions/tests/render-pipeline.test.ts`

This test must pass before any render-related fix is considered done.
If the test file does not exist yet, create it before writing any other code.

---

## 1. PROJECT OVERVIEW

### What Cova Is
A React Native iOS-only app (V1) that:
1. Learns the user's interior design style through a Tinder-style swipe quiz
2. Captures their actual room via LiDAR scan (iPhone 12 Pro+) or guided photo
3. Generates a photorealistic AI render of their room in their style blend
4. Lets them walk around inside the render first-person
5. Lets them buy every product in the render with one tap via affiliate links

### The Core User Flow
```
Splash Screen (logo fade 2s, dark forest green background)
  → Auth (Apple ID / Google / Email+Password)
  → Dashboard (room cards + Suggested For You)
  → New Room Flow:
      Room Type Selection (7 types — one-time per room)
      → Style Fingerprint Quiz (Tinder swipe, AI-generated images, no style names shown)
      → Room Capture (LiDAR RoomPlan scan OR in-app photo OR library upload)
      → Loading Screen (Depth Pro + FLUX ControlNet render — 6 stages shown)
      → Choice Screen: "View AI Render" | "Arrange Furniture"
          → RenderViewScreen  (photorealistic, first-person pan/zoom, immersive)
          → RoomViewer3DScreen (3D wireframe, furniture arrangement tool)
```

### The #1 Product Rule
THE USER NEVER SEES A CARTOON 3D WIREFRAME AS THEIR PRIMARY EXPERIENCE.
They land in a photorealistic AI render of their actual room.
The 3D wireframe viewer exists ONLY as an optional furniture arrangement tool.
The render IS the product.

### V1 Feature Status
| Feature | Status | Notes |
|---------|--------|-------|
| Splash & Onboarding | V1 | Full flow |
| Auth (Apple/Google/Email) | V1 | Supabase Auth |
| Style Fingerprint Quiz | V1 | Tinder swipe, AI images, no style names |
| Room Capture | V1 | RoomPlan + photo + upload |
| AI Render (FLUX) | V1 | Core product |
| First-Person Render View | V1 | Pan/zoom only, nothing tappable |
| 3D Furniture Viewer | V1 | Optional arrangement tool |
| AI Chatbot | V1 | Free chat, Claude Vision, no auto-regen |
| Product Shopping / CLIP | V1 | 3,136 products seeded, affiliate links |
| Dashboard + Home Screen | V1 | Room cards + Suggested For You |
| Token Economy | V1 | Infrastructure only, all free (999 balance) |
| Realtor Mode | V2 | Not built in V1 |
| Style Switching | V2 | Not in render view V1 |
| "Recreate This Room" | V2 | Inspiration cards view-only in V1 |
| Retailer API sync | V2 | Manual seed only for V1 |

### What Is Already Built (Do Not Rebuild)
- Supabase database with all tables and RLS policies
- 3,136 products seeded (Wayfair 1222, Amazon 962, IKEA 941, CB2 11)
- 423 swipe cards generated and stored in swipe-cards bucket
- CLIP embeddings (768-dim) on all products with IVFFlat vector index
- Migration files: 20240018000000, 20240019000000, 20240020000000
- All scraping and seeding scripts in scripts/ directory
RUNNING THE DATA PIPELINE SCRIPTS AGAIN WILL CREATE DUPLICATES. DO NOT RUN THEM.

---

## 2. MONOREPO STRUCTURE

```
~/Desktop/cova/                              ← monorepo root
├── CLAUDE.md                                ← THIS FILE (always read first)
├── package.json                             ← root with pnpm overrides (critical)
├── pnpm-workspace.yaml
├── .cursorrules                             ← Cursor IDE mirror of this file
├── .cursorignore
├── .claude/
│   ├── agents/
│   │   ├── planner.md                      ← reads files, outputs phases, no code
│   │   ├── executor.md                     ← implements one phase, in-scope only
│   │   └── verifier.md                     ← build check + test + acceptance criteria
│   ├── commands/
│   │   └── fix.md                          ← /fix slash command: runs full pipeline
│   └── specs/                              ← one spec file per fix (auto-created)
│
├── apps/
│   └── mobile/                             ← React Native Expo app
│       ├── app.json                        ← bundle ID: ai.cova.app, iOS only
│       ├── metro.config.js                 ← MUST include glb/gltf/hdr in assetExts
│       ├── .env                            ← ONLY anon key + URL here
│       ├── eas.json
│       │
│       ├── src/
│       │   ├── screens/
│       │   │   ├── auth/
│       │   │   │   ├── SplashScreen.tsx
│       │   │   │   └── AuthScreen.tsx
│       │   │   └── main/
│       │   │       ├── HomeScreen.tsx
│       │   │       ├── StyleQuizScreen.tsx
│       │   │       ├── RoomCaptureScreen.tsx
│       │   │       ├── RoomViewer3DScreen.tsx
│       │   │       ├── RenderViewScreen.tsx
│       │   │       ├── ShopScreen.tsx
│       │   │       └── ProfileScreen.tsx
│       │   │
│       │   ├── components/
│       │   │   ├── 3d/
│       │   │   │   ├── BoxRoom.tsx
│       │   │   │   ├── SceneLighting.tsx
│       │   │   │   ├── FurniturePiece.tsx
│       │   │   │   └── CameraController.tsx
│       │   │   └── ui/
│       │   │       ├── TokenBalance.tsx
│       │   │       ├── LoadingOverlay.tsx
│       │   │       └── ProductPanel.tsx
│       │   │
│       │   ├── navigation/
│       │   │   └── RootNavigator.tsx       ← bottom tabs + stack
│       │   │
│       │   ├── store/
│       │   │   └── index.ts                ← Zustand store, ALL slices here
│       │   │
│       │   ├── hooks/
│       │   │   ├── useRender.ts            ← render polling hook
│       │   │   ├── useAuth.ts
│       │   │   └── useRoomPlan.ts          ← RoomPlan native module bridge
│       │   │
│       │   ├── lib/
│       │   │   └── supabase.ts             ← single Supabase client instance
│       │   │
│       │   └── data/
│       │       ├── furnitureCatalog.ts     ← local GLB catalog metadata
│       │       └── glbAssets.ts            ← static require map for all 43 GLBs
│       │
│       ├── modules/                        ← Native Swift files (drag to Xcode)
│       │   ├── RoomPlanModule.swift
│       │   └── RoomPlanModule.m
│       │
│       └── assets/
│           ├── 3d/furniture/              ← .glb furniture models (43 files)
│           └── textures/                  ← PBR maps (.jpg) + HDRI (.hdr)
│
├── packages/
│   └── shared/
│       └── src/
│           ├── types.ts                   ← ALL shared TypeScript types
│           └── index.ts
│
└── supabase/
    ├── migrations/
    └── functions/
        ├── render-room/index.ts           ← Depth Pro + FLUX ControlNet
        ├── get-render-status/index.ts     ← Replicate prediction polling
        ├── clip-embed/index.ts            ← OpenCLIP 768-dim embedding
        ├── match-products/index.ts        ← pgvector cosine similarity
        ├── chat-room/index.ts             ← Claude Sonnet Vision
        ├── handle-purchase/index.ts       ← StoreKit receipt verification
        ├── delete-account/index.ts        ← GDPR full purge
        └── tests/
            └── render-pipeline.test.ts   ← integration test (must always exist)
```

---

## 3. LOCKED VERSIONS — NEVER CHANGE

These are non-negotiable. Changing any without full regression testing breaks
the build in ways that are extremely hard to diagnose. Always reject pnpm upgrades.

```
expo                         ~52.0.49       (never 53+)
react                        18.3.1 EXACT   (no caret, no tilde)
react-dom                    18.3.1 EXACT   (no caret, no tilde)
@react-three/fiber           8.17.10 EXACT  (8.18+ breaks expo-gl on iOS)
@react-three/drei            9.88.0 EXACT   (later: unresolvable peer deps)
three                        0.155.0 EXACT  (0.156+ breaks geometry/material APIs)
@react-three/postprocessing  2.15.0         (version-tied to R3F 8.17)
node                         20.x           (never 22+ — Expo SDK 52 incompatible)
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

**Verify versions:**
```bash
cd ~/Desktop/cova && pnpm why three
# Must show: three 0.155.0
cd apps/mobile && pnpm list @react-three/fiber
# Must show: @react-three/fiber 8.17.10
```

---

## 4. FOUR-LAYER SELF-DEBUGGING PROTOCOL

All four layers are active for every session, every file, every prompt.

### Layer 1 — Preventative Constraints (this file)
Before generating any file, check it against every rule in CLAUDE.md.
If a rule would be violated → rewrite before outputting.
This file is always authoritative over any individual prompt.

### Layer 2 — Per-File Self-Assertions
After generating each file, run this checklist internally:
- [ ] No forbidden imports present (see Section 5)
- [ ] No forbidden patterns present (see Section 6)
- [ ] All version-locked packages at exact pinned versions (see Section 3)
- [ ] All TypeScript types imported from @cova/shared, not redefined locally
- [ ] All AI/external API calls go through Supabase Edge Functions only
- [ ] No API keys or secrets in any client-side file
- [ ] Loading, error, and empty states handled in every UI component
- [ ] No `any` TypeScript type used anywhere
- [ ] OrbitControls confirmed absent from all 3D files
- [ ] Camera values in useRef, never useState, in all 3D components
- [ ] No style names (Japandi/Coastal/etc) in user-facing strings
If any assertion fails → fix before presenting the file.

### Layer 3 — Targeted Self-Review After Each Major Component
For 3D components: verify no OrbitControls, no useState for camera,
  Canvas has preserveDrawingBuffer:true, background color set, radius clamped.
For Edge Functions: verify no Node.js imports, CORS headers on all responses,
  JWT verified before processing, no secrets in response body.
For UI screens: verify loading/error/empty states, no style names exposed,
  all colors from COLORS constant, TypeScript strict.

### Layer 4 — Runtime Assertion Comments in Critical Files
```typescript
// ⚠️ ASSERTION: useRef ONLY — never useState for camera values.
// useState triggers re-renders that conflict with PanResponder gesture callbacks
// and cause the camera to freeze. This is a permanent architectural constraint.
const thetaRef = useRef(0)
```
These comments are permanent guardrails. Never remove them.

---

## 5. FORBIDDEN IMPORTS — CAUSES IMMEDIATE CRASH

### 5.1 OrbitControls and Related Controls
```typescript
// ❌ ALL FORBIDDEN — crash expo-gl with "Cannot set properties of undefined (setting 'style')"
import { OrbitControls } from '@react-three/drei'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { MapControls } from '@react-three/drei'
import { TrackballControls } from '@react-three/drei'
import { FlyControls } from '@react-three/drei'
import { PointerLockControls } from '@react-three/drei'
```
The ONLY permitted camera system: `apps/mobile/src/components/3d/CameraController.tsx`
with PanResponder + useFrame. No exceptions ever.

### 5.2 Node.js Built-ins in Edge Functions
```typescript
// ❌ FORBIDDEN in supabase/functions/ — Deno runtime, not Node.js
import fs from 'fs'
import path from 'path'
import { Buffer } from 'buffer'
import crypto from 'crypto'     // ✅ use: globalThis.crypto.subtle
import https from 'https'       // ✅ use: fetch() which is global in Deno
```

### 5.3 Service Role Key in Client Code
```typescript
// ❌ FORBIDDEN — exposes full database admin access
const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY)
// ✅ CORRECT
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
)
```

### 5.4 Direct External API Calls from Client
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

## 6. FORBIDDEN PATTERNS — CAUSES SUBTLE BUGS OR CRASHES

### 6.1 useState for 3D Camera Values
```typescript
// ❌ WRONG — every gesture event triggers re-render, freezes camera movement
const [theta, setTheta] = useState(0)
// ✅ CORRECT
// ⚠️ ASSERTION: useRef ONLY for all camera values. Hard architectural rule.
const thetaRef  = useRef(0)      // horizontal: -Math.PI to Math.PI
const phiRef    = useRef(1.25)   // vertical: clamped 0.3 to Math.PI/2 - 0.05
const radiusRef = useRef(4.5)    // zoom: clamped 1.5 to 6.0
```

### 6.2 useEffect for Data Fetching
```typescript
// ❌ WRONG — race conditions, unhandled errors, no loading state
useEffect(() => {
  supabase.from('rooms').select('*').then(data => setRooms(data))
}, [])
// ✅ CORRECT — data fetching through Zustand store actions only
const { rooms, fetchRooms, isLoading, error } = useRoomStore()
useEffect(() => { fetchRooms() }, [])
```

### 6.3 Canvas Without preserveDrawingBuffer
```typescript
// ❌ WRONG
<Canvas style={{ flex: 1 }}>
// ✅ CORRECT
<Canvas style={{ flex: 1 }} gl={{ preserveDrawingBuffer: true }} camera={{ fov: 75, near: 0.1, far: 50 }}>
```

### 6.4 Canvas Without Background Color
```typescript
// ❌ WRONG — user sees grey/white void at walls
<Canvas gl={{ preserveDrawingBuffer: true }}>
// ✅ CORRECT — background MUST match ceiling color of active style
<Canvas gl={{ preserveDrawingBuffer: true }}>
  <color attach="background" args={[STYLE_PALETTE[activeStyle].ceiling]} />
```

### 6.5 Camera Radius Without Proper Clamping
```typescript
// ❌ WRONG — user can zoom out past walls and see void
radiusRef.current = Math.max(0.5, newRadius)
// ✅ CORRECT — max radius must keep camera inside room at all times
// Rule: maxRadius < min(roomWidth, roomDepth) / 2 - 1.0
radiusRef.current = Math.max(1.5, Math.min(6.0, newRadius))
```

### 6.6 Metro Config Without Asset Extensions
```typescript
// ❌ WRONG
module.exports = getDefaultConfig(__dirname)
// ✅ CORRECT
const { getDefaultConfig } = require('expo/metro-config')
const config = getDefaultConfig(__dirname)
config.resolver.assetExts.push('glb', 'gltf', 'hdr', 'ktx2')
module.exports = config
```

### 6.7 FurniturePiece Without Parent Suspense
```typescript
// ❌ WRONG — useGLTF without Suspense throws unhandled promise rejection
// ✅ CORRECT — Suspense wraps ALL furniture pieces at parent level
<Suspense fallback={null}>
  {placedFurniture.map(piece => (
    <FurniturePiece key={piece.id} piece={piece} ... />
  ))}
</Suspense>
```

### 6.8 PanResponder Inside Canvas
```typescript
// ❌ WRONG — PanResponder and Canvas fight for touch events, causes gesture lock
// ✅ CORRECT — PanResponder is absoluteFill View SIBLING to Canvas, not inside it
<View style={{ flex: 1 }}>
  <View style={StyleSheet.absoluteFill}>
    <Canvas gl={{ preserveDrawingBuffer: true }}>{/* 3D scene */}</Canvas>
  </View>
  <View
    style={StyleSheet.absoluteFill}
    {...panResponder.panHandlers}
    pointerEvents="box-none"
  >
    {/* HUD elements here */}
  </View>
</View>
```

### 6.9 TypeScript `any`
```typescript
// ❌ WRONG
const room: any = data
// ✅ CORRECT
import type { Room, Render } from '@cova/shared'
const room: Room = data as Room
```

### 6.10 Style Names in User-Facing UI
```typescript
// ❌ WRONG — users don't know what "Japandi" means
<Text>Your style: Japandi</Text>
// ✅ CORRECT — plain English labels always
const STYLE_DISPLAY_NAMES: Record<StyleName, string> = {
  coastal:     'Ocean Breeze',
  japandi:     'Zen Garden',
  bohemian:    'Boho Spirit',
  mid_century: 'Mid-Century',
  minimalist:  'Pure Lines',
}
// Internal code may use 'japandi', 'coastal' etc. User-facing text: never.
```

### 6.11 Missing CORS Headers in Edge Functions
```typescript
// ❌ WRONG
return new Response(JSON.stringify({ data }), { status: 200 })
// ✅ CORRECT
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
return new Response(JSON.stringify({ data }), {
  status: 200,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
})
```

### 6.12 Hardcoded Room Dimensions
```typescript
// ❌ WRONG
const roomWidth = 16
// ✅ CORRECT — always from Zustand store
const dimensions = useRoomStore(state => state.currentRoom?.dimensions)
const roomWidth  = dimensions?.width  ?? 4.9  // metric fallback
const roomDepth  = dimensions?.depth  ?? 4.3
const roomHeight = dimensions?.height ?? 2.7
// Store in meters. RoomPlan returns meters. Depth Pro returns meters.
// Convert to feet/inches ONLY for display based on Settings → Units preference.
```

### 6.13 CLIP Dimension Mismatch
```typescript
// ❌ WRONG
const embedding = await clipEmbed(imageUrl, { dimensions: 1024 })
// ✅ CORRECT — always 768 in this project, everywhere
const embedding = await clipEmbed(imageUrl, { dimensions: 768 })
// products.clip_embedding column is vector(768) — never insert 1024-dim vectors
```

### 6.14 Large Image Base64 Encoding
```typescript
// ❌ WRONG — btoa(String.fromCharCode(...bytes)) crashes on large images (stack overflow)
// ✅ CORRECT — use ImageManipulator + chunked encoding
// Always resize to 1024px wide, quality 0.8 before encoding
// This keeps base64 payload under 500KB, well within 6MB Edge Function limit
import * as ImageManipulator from 'expo-image-manipulator'
const result = await ImageManipulator.manipulateAsync(
  uri, [{ resize: { width: 1024 } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
)
```

---

## 7. FEATURE SPECIFICATIONS

### 7.1 Splash Screen & Auth
- Dark forest green background (`#0A1628`)
- Cova logo (arch mark + "cova" wordmark + "tinder for your home" tagline) fades in over 2s
- Sign In and Create Account buttons appear after fade
- Returning signed-in users → straight to dashboard (no splash again)
- Signed-out users → full splash every time
- Auth options: Apple ID (primary, required by App Store), Google, Email + Password
- After auth → dashboard

### 7.2 Style Fingerprint Quiz
- Brief instruction screen: "Swipe right if you love it. Swipe left if you don't. Neutral if unsure."
- Skip button shown ONCE on instruction screen only — never during swiping
- Cards: AI-generated room images specific to user's selected room type
- NEVER show style names to user anywhere in this flow
- Right = like, Left = dislike, Neutral button = no preference
- Algorithm adapts in real time — builds style blend, does not just serve one style
- Ends at confidence threshold OR 3 minutes — whichever comes first
- style_blend saved as JSON: e.g. `{ coastal: 0.6, japandi: 0.3, bohemian: 0.1 }`
- For future rooms: "Use your previous style or discover a new one?" prompt
- After quiz → room capture

### 7.3 Room Capture
Three paths, all leading to same output (room dimensions + depth map):

**Path A — RoomPlan LiDAR (iPhone 12 Pro+)**
- Show option ONLY on LiDAR devices — hide entirely on others, no greyed-out
- Guided AR scan, animated overlays, returns exact parametric dimensions
- Output: `RoomPlanResult` — see Section 8.1

**Path B — In-App Camera (all iPhones)**
- Instruction screen: "Stand in the doorway. Capture the entire room."
- Live camera with corner bracket overlay for framing
- Optional "Refine" button reveals 4-corner drag + sliders

**Path C — Library Upload (all iPhones)**
- expo-image-picker
- Same flow as Path B after selection

**After any capture path:**
- Loading screen with 6 progress stages (see Section 8.3)
- Choice screen: "View AI Render" | "Arrange Furniture"

### 7.4 AI Render View (RenderViewScreen)
- 100% of screen, zero letterboxing, zero padding, zero safe-area gaps
- First-person: one-finger swipe to look around, pinch to zoom
- Camera always inside room — cannot zoom out past walls, cannot see white space
- NOTHING is tappable, selectable, or draggable in this view
- Pure immersive walkthrough only
- HUD auto-hides after 3 seconds, tap anywhere to show again
- Available actions: Regenerate (costs tokens, free in V1), Save, Share, Open Chatbot, Product Panel
- Before/After slider: left = original room photo, right = AI render
- All renders auto-saved to render gallery in profile

### 7.5 3D Room Viewer (RoomViewer3DScreen)
- Camera starts at doorway, eye level, looking inward
- Full screen — NO white space ever
- Camera clamped inside room — cannot zoom out past walls
- One-finger swipe: look around. Two-finger pinch: zoom.
- Tap furniture: select (gold ring at y=0.01). Drag: move along floor (clamped to room bounds).
- Hold furniture: product info sheet slides up (name, price, dimensions, retailer)
- Rotate: 45° increments. Delete: with confirmation. Undo: last change.
- Camera does NOT move while furniture is selected and being dragged
- "+" button: catalog bottom sheet (filtered by room type + style fingerprint)
- Category tabs: Seating, Tables, Lighting, Storage, Decor, Plants
- 2D floor plan toggle: overhead layout, furniture draggable in 2D, persists to 3D
- Style chips: switch colors only, preserve all furniture positions
- PBR textures, HDRI lighting, SSAO ambient occlusion, window light plane
- Crown molding, baseboards, door frame at entrance — all required, no shortcuts

### 7.6 AI Chatbot
- Floating chat bubble bottom-right of render view
- Tap → chat panel slides up (60% screen height)
- User can tap anywhere on rendered image to reference specific area (tap coords sent to Claude)
- If no tap → Claude listens to text only
- Claude sees: render image (vision), room dimensions, room type, style fingerprint, full chat history
- Free chat — tokens only charged when user taps Regenerate
- Chat history persists entire room session (Zustand store)
- V1: user chats freely, manually taps Regenerate when ready
- V2: weighted token costs, auto-regen from chat, direct buy links

### 7.7 Product Shopping & CLIP Matching
- Pull tab on left edge of render → product panel slides in
- Shows all CLIP-matched items: photo, name, price, retailer badge, Add to Cart, View Similar
- "Add All to Cart" at top
- Cart checkout: opens retailer affiliate URL in in-app browser (SFSafariViewController)
- Affiliate revenue: Wayfair Partner Network + Amazon Associates
- Budget slider: set before first render, adjusts product results in real time
- 3,136 products seeded (Wayfair, Amazon, IKEA, CB2) — DO NOT RE-RUN SEED SCRIPTS
- CLIP embeddings: 768-dim, pre-generated — vector(768) always
- Post-launch: Wayfair + Amazon APIs auto-sync catalog (V2 feature)

### 7.8 Dashboard & Home Screen
- Full-width room cards: latest render as card background, room name, type, date
- Tap card → back into that room's render view
- "+" card → starts new room creation flow
- "Suggested For You" section below: AI-generated inspiration rooms, view-only in V1
- "Recreate this room" button on inspiration cards → shows "Coming Soon" in V1
- Bottom tabs: Rooms, Shop, Profile (Discover placeholder for V2)
- Token balance always visible top-right: gold coin icon + number (always 999 in V1)

### 7.9 Token Economy
- All features free and unlimited in V1
- Token balance shows 999, never decrements
- Full token infrastructure in codebase but dormant
- `tokens_enabled: false` config flag — flip to true to activate economy
- Never add paywalls, gates, or real deductions until this flag is explicitly set

### 7.10 Profile & Settings
Privacy and security requirements (non-negotiable):
- RLS on every database table: `auth.uid() = user_id` on all reads and writes
- Room photos in private Supabase storage buckets — never publicly accessible
- Renders in private buckets linked only to authenticated user
- Apple Sign In: private email relay by default
- No user data used to train AI models — ever
- No user room photos or renders shared publicly without explicit consent
- Delete account: permanently removes ALL data from all tables and storage buckets
- ATT prompt on first launch (App Store requirement)
- Privacy policy + terms of service shown at signup and linked in settings
- All API keys stored as Supabase secrets — never in client-side code

---

## 8. ROOM CAPTURE ARCHITECTURE

### 8.1 RoomPlan Swift Module

**Output type:**
```typescript
type RoomPlanResult = {
  width: number           // meters
  depth: number           // meters
  height: number          // meters
  doors: Array<{ x: number; z: number; width: number; wallSide: 'front'|'back'|'left'|'right' }>
  windows: Array<{ x: number; z: number; width: number; height: number; wallSide: 'front'|'back'|'left'|'right' }>
  thumbnailBase64: string // JPEG screenshot
}
```

**Files Cursor generates:**
1. `apps/mobile/modules/RoomPlanModule.swift` — RoomCaptureSession setup,
   `isLiDARAvailable()`, `startScan()`, `stopScan()`, delegate methods,
   error handling for `exceedSceneSizeLimit` and `worldTrackingFailed`
2. `apps/mobile/modules/RoomPlanModule.m` — ObjC bridge,
   `RCT_EXTERN_MODULE(RoomPlanModule, NSObject)`, `RCT_EXTERN_METHOD` for each method
3. `apps/mobile/src/hooks/useRoomPlan.ts` — TypeScript hook wrapping NativeModules.RoomPlanModule

**Manual integration (~5 min):**
1. `cd apps/mobile && xed ios/`
2. Project Navigator → right-click Cova group → "Add Files to Cova..."
3. Add both .swift and .m files, check "Copy items if needed"
4. Set iOS deployment target to minimum 16.0
5. Add to app.json: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`
6. `npx expo run:ios` (full rebuild required)

### 8.2 Depth Estimation — Apple Depth Pro (NOT Depth Anything V2)

**IMPORTANT:** Always use Depth Pro. It outperforms Depth Anything V2 because:
- Produces METRIC depth (real meters), not relative depth
- No camera intrinsics needed — estimates focal length automatically
- Replicate model: `garg-aayush/ml-depth-pro`

Never revert to Depth Anything V2 under any circumstances.

### 8.3 Post-Capture Loading Screen Progress Stages
```
Stage 1: "Analyzing your room..."       (0–5s)
Stage 2: "Measuring depth..."           (5–15s)
Stage 3: "Applying your style..."       (15–25s)
Stage 4: "Generating render..."         (25–40s)
Stage 5: "Adding finishing touches..."  (40–55s)
Stage 6: "Done!" → navigate to choice screen
```

---

## 9. AI RENDER PIPELINE (Edge Functions)

### 9.1 render-room Sequence
1. Verify JWT — reject unauthorized immediately
2. Check tokens_enabled — if true and balance < cost, return 402
3. Upload photo to room-photos bucket if not already uploaded
4. Call Depth Pro via Replicate: `garg-aayush/ml-depth-pro`
5. Poll Replicate until depth map ready (exponential backoff: 3s, 6s, 12s)
6. Generate Canny edge map server-side from original photo
7. Build FLUX prompt from style_blend using buildPrompt()
8. Call FLUX ControlNet Union Pro 2.0: `xlabs-ai/flux-controlnet-union-pro-2`
   Fallback: `black-forest-labs/flux-depth-pro`
   Use `/v1/models/` endpoint (NOT `/v1/predictions` + version string)
9. Poll for render completion (same backoff pattern, timeout 120s)
10. Download completed render image
11. Upload to renders bucket: `{user_id}/{room_id}/{timestamp}.jpg`
12. Update renders table: status='completed', image_url=signedUrl, style_applied=styleBlend
13. Increment render count: use `increment_rooms_render_count(room_id)` RPC (atomic)
14. Return render ID to client

### 9.2 Prompt Construction
```typescript
function buildPrompt(styleBlend: Record<string, number>): string {
  const STYLE_PROMPTS = {
    coastal:     'coastal interior, light blue and white palette, natural linen, driftwood accents, airy and bright',
    japandi:     'japandi interior, warm neutrals, natural wood, minimalist zen, wabi-sabi, serene organic materials',
    bohemian:    'bohemian interior, rich jewel tones, mixed patterns, macrame, plants, eclectic layered textiles',
    mid_century: 'mid-century modern interior, walnut wood, organic curves, bold geometric patterns, warm amber tones',
    minimalist:  'minimalist interior, pure white, clean lines, negative space, monochromatic palette, no clutter',
  }
  // Blend by weight: dominant style first in prompt, others appended with weight
  return Object.entries(styleBlend)
    .sort(([,a],[,b]) => b - a)
    .map(([style, weight]) => STYLE_PROMPTS[style])
    .join(', ')
}
```

### 9.3 Render Status Polling — Critical Fixes
- renders.status CHECK constraint must include: 'pending', 'processing', 'completed', 'failed'
- FLUX output: handle both string and array responses when extracting image URL
- Storage upload failures must mark render as 'failed', not leave it in 'processing' forever
- Poll at 3s, 6s, 12s, 24s — timeout after 120s → mark as 'failed'
- config.toml for every edge function must have `verify_jwt = false` or deploy with `--no-verify-jwt`

### 9.4 Integration Test (Required)
File: `supabase/functions/tests/render-pipeline.test.ts`

This test must:
- Mock the Replicate API calls (do not call real Replicate in tests)
- Verify the full sequence: upload → depth → FLUX → storage → DB update
- Assert renders.status transitions correctly: pending → processing → completed
- Assert image_url is set in the DB record after completion
- Assert style_applied is not null (was causing NOT NULL constraint violation)
- Run with: `npx ts-node supabase/functions/tests/render-pipeline.test.ts`
- Must return exit code 0 (PASS) before any render-related fix is considered done

---

## 10. 3D VIEWER ARCHITECTURE

### 10.1 CameraController.tsx — Complete Contract
```typescript
// ⚠️ ASSERTION: ALL values MUST be useRef. NEVER useState.
const thetaRef  = useRef(0)      // horizontal: -Math.PI to Math.PI
const phiRef    = useRef(1.25)   // vertical: Math.max(0.3, Math.min(Math.PI/2-0.05, val))
const radiusRef = useRef(4.5)    // zoom: Math.max(1.5, Math.min(6.0, val))

// Starting position: theta=0, phi=1.25, radius=4.5
// Camera at doorway, eye level, looking toward center [0, 1.2, 0]

useFrame(() => {
  const theta = thetaRef.current; const phi = phiRef.current; const radius = radiusRef.current
  camera.position.x = radius * Math.sin(phi) * Math.sin(theta)
  camera.position.y = radius * Math.cos(phi)
  camera.position.z = radius * Math.sin(phi) * Math.cos(theta)
  camera.lookAt(0, 1.2, 0)
})
// forwardRef + useImperativeHandle exposes handlePan and handleZoom to parent
```

### 10.2 PanResponder Gate Rules
```typescript
onMoveShouldSetPanResponder: (_, gs) => {
  // ONLY intercept for camera when no furniture is selected
  return selectedIdRef.current === null && (Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2)
}
// All camera refs: useRef. The ONE allowed useState: forceUpdate for selection UI.
```

### 10.3 BoxRoom Style Palette
```typescript
const STYLE_PALETTE = {
  coastal:     { floor: '#C8B89A', walls: '#E8DFD0', ceiling: '#F5F0E8', trim: '#FFFFFF', emissive: '#FFF8F0' },
  japandi:     { floor: '#8B7355', walls: '#D4CAB8', ceiling: '#EDE8DF', trim: '#F0EDE6', emissive: '#FFFAF5' },
  bohemian:    { floor: '#A0785A', walls: '#D4B896', ceiling: '#E8D5B7', trim: '#C8A882', emissive: '#FFF5E8' },
  mid_century: { floor: '#8B6914', walls: '#C8A870', ceiling: '#E8D098', trim: '#5C3D1E', emissive: '#FFF0D0' },
  minimalist:  { floor: '#D0D0D0', walls: '#E8E8E8', ceiling: '#F5F5F5', trim: '#FFFFFF', emissive: '#FFFFFF' },
}
// Canvas background MUST always match ceiling color of active style
// 5 faces only (no front wall — that is the doorway)
// Architectural trim required: crown molding, baseboards, door frame — no shortcuts
// Window plane: emissive mesh on back wall paired with directionalLight casting shadows
```

### 10.4 HDRI Map
```typescript
const HDRI_MAP = {
  coastal:     require('../../../assets/textures/hdri/sunset_fairway_1k.hdr'),
  japandi:     require('../../../assets/textures/hdri/small_empty_room_1k.hdr'),
  bohemian:    require('../../../assets/textures/hdri/colorful_studio_1k.hdr'),
  mid_century: require('../../../assets/textures/hdri/loft_hall_1k.hdr'),
  minimalist:  require('../../../assets/textures/hdri/grey_room_1k.hdr'),
}
// Always wrap Environment in try/catch — fallback to hemisphereLight on failure
// 1K resolution only — higher exhausts mobile VRAM
```

### 10.5 FurniturePiece Rules
```typescript
const clonedScene = useMemo(() => scene.clone(true), [scene])  // required: prevent shared material mutations
// Shadow casting required: clonedScene.traverse(child => { if (child.isMesh) child.castShadow = true })
// Drag: THREE.Plane at y=0 (floor), raycaster intersection
// Position clamping: x in [-(roomWidth/2-piece.width/2), (roomWidth/2-piece.width/2)]
//                    z in [-(roomDepth/2-piece.depth/2), (roomDepth/2-piece.depth/2)]
// onPointerDown: MUST call e.stopPropagation() — otherwise touch also moves camera
// Selection ring: gold torus at y=0.01 (NOT y=0 — clips into floor), color: #C47B3C
```

### 10.6 SSAO Setup
```typescript
// Package: @react-three/postprocessing@2.15.0 EXACT
import { EffectComposer, SSAO } from '@react-three/postprocessing'
<EffectComposer><SSAO radius={0.05} intensity={15} luminanceInfluence={0.6} /></EffectComposer>
// Never ship without SSAO — provides critical under-furniture darkening
```

---

## 11. DATABASE REFERENCE

All tables have RLS. Verify before any write. Standard policy:
```sql
CREATE POLICY "{table}_own" ON {table}
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

**Key tables:**
```
rooms                — id, user_id, name, room_type, style_blend, dimensions_json,
                       budget, latest_render_url, render_count, status ('active'|'archived'),
                       original_image_url (nullable)
renders              — id, room_id, user_id, image_url, status ('pending'|'processing'|'completed'|'failed'),
                       replicate_prediction_id, prompt_used, tokens_used, style_applied (NOT NULL)
furniture_placements — id, room_id, furniture_catalog_id, position_x, position_y, rotation_y, scale
products             — id, name, price, retailer, affiliate_url, clip_embedding vector(768)
swipe_cards          — id, image_url, room_type, style_weights jsonb, active
```

**dimensions_json schema:**
```json
{ "width": 4.9, "depth": 4.3, "height": 2.7, "unit": "m" }
```
Always store in meters. Convert to feet ONLY for UI display.

**Atomic render count increment:**
```sql
-- Use this RPC, never raw read-modify-write
SELECT increment_rooms_render_count('room-uuid-here');
```

---

## 12. ZUSTAND STORE SLICES

```typescript
// authSlice
{ user: User|null, session: Session|null, isLoading: boolean,
  signIn: (provider: 'apple'|'google'|'email', ...) => Promise<void>, signOut: () => Promise<void> }

// roomSlice
{ rooms: Room[], currentRoom: Room|null, currentRoomDimensions: RoomDimensions|null,
  placedFurniture: FurniturePiece[], activeStyle: StyleName, isLoading: boolean,
  fetchRooms, createRoom, setCurrentRoom, setRoomDimensions, setActiveStyle,
  addFurniture, removeFurniture, updateFurniturePosition, updateFurnitureRotation, saveFurniturePlacements }

// renderSlice
{ currentRender: Render|null, renderHistory: Render[], isRendering: boolean, renderProgress: string,
  startRender: (roomId: string) => Promise<void>, pollRenderStatus: (renderId: string) => Promise<void> }

// quizSlice
{ cards: SwipeCard[], styleBlend: StyleBlend, isComplete: boolean,
  swipeRight, swipeLeft, swipeNeutral, completeQuiz }

// cartSlice
{ items: CartItem[], addToCart, removeFromCart, clearCart }

// uiSlice
{ tokenBalance: number,  // always 999 in V1
  isHUDVisible: boolean, hudTimeout: NodeJS.Timeout|null, showHUD, hideHUD }
```

---

## 13. BRAND AND UI CONSTANTS

```typescript
export const COLORS = {
  primary:       '#0A1628',  // dark forest green
  accent:        '#C47B3C',  // copper gold
  background:    '#F5F0E8',  // warm cream
  textPrimary:   '#1A1A1A',
  textSecondary: '#888888',
  textOnDark:    '#FFFFFF',
  error:         '#CC3333',
  success:       '#2E7D32',
}

export const RADIUS = { card: 16, button: 28, modal: 20, input: 12 }

export const SHADOW = {
  card: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12, shadowRadius: 12, elevation: 4 }
}

// Never import custom fonts — use system font (SF Pro on iOS) throughout
// Never use style names in user-facing strings: Japandi, Coastal, Bohemian, Mid-Century, Minimalist
```

---

## 14. ENVIRONMENT VARIABLES

```bash
# apps/mobile/.env — ONLY these two keys
EXPO_PUBLIC_SUPABASE_URL=https://xdeacbmkdwqrwxonqaqh.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=[anon public key from Supabase dashboard]

# Supabase Edge Function Secrets — NEVER in .env, NEVER in client code, NEVER in git
SUPABASE_SERVICE_ROLE_KEY=[service_role key]
REPLICATE_API_TOKEN=[from replicate.com/account/api-tokens]
ANTHROPIC_API_KEY=[from console.anthropic.com]
APPLE_SHARED_SECRET=[from App Store Connect]
```

**app.json infoPlist (add if missing):**
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

## 15. KNOWN ERRORS AND EXACT FIXES

### 15.1 Three.js / expo-gl / R3F Errors
| Error | Root Cause | Exact Fix |
|-------|-----------|-----------|
| `Cannot set properties of undefined (setting 'style')` | OrbitControls anywhere | `grep -r "OrbitControls" apps/mobile/src` — remove every reference |
| White void visible outside room walls | Canvas background not set | Add `<color attach="background" args={[ceilingColor]} />` as first Canvas child |
| Camera freezes after selecting furniture | `selectedIdRef.current` never reset | In Done handler: `selectedIdRef.current = null; setForceUpdate(n => n+1)` |
| Furniture drag also rotates camera | PanResponder intercepts during drag | `onMoveShouldSetPanResponder` must return `false` when `selectedIdRef.current !== null` |
| `useGLTF` crash / unhandled promise | Missing Suspense boundary | Wrap ALL FurniturePiece in single `<Suspense fallback={null}>` in parent |
| GLB file bundling error | `glb` not in metro assetExts | Add `config.resolver.assetExts.push('glb', 'gltf', 'hdr')` |
| HDRI crashes / VRAM exhausted | HDR file too large | Use 1K resolution only. Fallback to lights if still crashing. |
| Furniture floating or underground | GLB model origin not at y=0 | Add `position={[0, yOffset, 0]}` to primitive group |
| SSAO TypeError on mount | Version mismatch | Verify `@react-three/postprocessing` is exactly `2.15.0` |
| Pinch zoom extremely jumpy | pinchStartDistRef not reset | Reset `pinchStartDistRef.current = dist` at END of each move event |
| Selection ring invisible | Ring y position clips into floor | Set ring group `position={[0, 0.01, 0]}` |
| `three is undefined` at runtime | pnpm hoisted wrong version | Verify pnpm overrides in root package.json. Run `pnpm why three`. |
| Canvas renders as black screen | `gl` prop missing | Ensure `gl={{ preserveDrawingBuffer: true }}` exactly |

### 15.2 React Native / Expo Errors
| Error | Root Cause | Exact Fix |
|-------|-----------|-----------|
| Metro crash on startup | watchman not installed | `brew install watchman` then restart Metro |
| `ExpoModulesCore` not found after Swift module | Needs full native rebuild | `cd apps/mobile && npx expo run:ios` (not `expo start`) |
| Camera permission never prompts | `NSCameraUsageDescription` missing | Add to `ios.infoPlist` in app.json — rebuild |
| Photo library picker crashes | `NSPhotoLibraryUsageDescription` missing | Add to `ios.infoPlist` in app.json — rebuild |
| `pnpm install` installs react 19 or three 0.160+ | Missing pnpm overrides | Add overrides block to root package.json — `pnpm install` again |
| Build fails: "Duplicate symbol" | Two bridge files registered | Remove one `.m` file |
| `[Invariant Violation] Module AppRegistry not registered` | React version mismatch | Verify react AND react-dom are both exactly 18.3.1 |
| EAS build fails: "node version" | node 22+ | `nvm use 20` |

### 15.3 Supabase / Edge Function Errors
| Error | Root Cause | Exact Fix |
|-------|-----------|-----------|
| `Deno is not defined` | Node.js import in Edge Function | Replace with Deno equivalents — no `require()`, no `import fs from 'fs'` |
| CORS error from React Native | Missing CORS headers | Return `Access-Control-Allow-Origin: *` on ALL responses + handle OPTIONS |
| `JWT expired` auth failure | Stale session | Use `supabase.auth.getSession()` — never store JWT string manually |
| `row-level security policy violation` | RLS policy missing | Verify `auth.uid() = user_id` in policy |
| `relation "renders" does not exist` | Migration not applied | Run `supabase db push` |
| `column clip_embedding does not exist` | Migration order wrong | Verify `20240020000000_clip_vector_768.sql` is applied |
| Vector search returns wrong results | 1024-dim vs 768-dim mismatch | Always use 768 everywhere |
| Replicate prediction stuck in `starting` | Queue congestion | Exponential backoff: 3s, 6s, 12s, 24s — timeout after 120s |
| Storage upload fails | Bucket doesn't exist | Verify buckets: room-photos, renders, swipe-cards, assets — all private |
| `style_applied` NOT NULL constraint violation | style_applied not set on INSERT | Always include `style_applied: styleBlend` in renders INSERT |
| renders.status CHECK constraint violation | 'completed' not in constraint | Ensure CHECK includes: 'pending', 'processing', 'completed', 'failed' |
| FLUX URL 404 | Wrong endpoint format | Use `/v1/models/` not `/v1/predictions` + version string |
| render_count race condition | Raw read-modify-write | Use `increment_rooms_render_count(room_id)` RPC (atomic) |
| Large image exceeds 6MB Edge Function limit | iPhone photo at quality 0.9 | Use ImageManipulator: resize to 1024px, quality 0.8 (output ~100-350KB) |

### 15.4 RoomPlan Swift Errors
| Error | Root Cause | Exact Fix |
|-------|-----------|-----------|
| `exceedSceneSizeLimit` | Previous AR session not released | Call `session.stop()` and `session = nil` before starting new scan |
| `worldTrackingFailed` | Low light or featureless surfaces | Show guidance: "Move to a well-lit area with visible textures" |
| `No such module 'RoomPlan'` | iOS deployment target < 16.0 | Set minimum iOS deployment target to 16.0 in Xcode |
| `NativeModules.RoomPlanModule` is undefined | Swift files not in Xcode | Ensure BOTH `.swift` AND `.m` files added to Xcode project — rebuild |
| `RCTBridgeModule` not found | New Architecture conflict | Add `"newArchEnabled": false` in app.json expo object — rebuild |
| Phantom walls detected | Mirrors or glass in room | Add guidance: "Cover mirrors before scanning" |
| Scan completes but empty dimensions | Room too dark | Add guidance: "Ensure good lighting and visible surface texture" |

---

## 16. VALIDATION CHECKLISTS

Do not proceed to next component until all items pass on physical iPhone.
The iOS Simulator gives false positives for expo-gl, camera, and RoomPlan.

### 16.1 Room Capture Done When:
- [ ] Camera permission prompt appears on first visit only
- [ ] LiDAR scan option visible ONLY on LiDAR-capable devices
- [ ] Photo and library upload paths work on all iPhones
- [ ] Depth Pro called server-side (confirmed in Supabase Edge Function logs)
- [ ] Depth map generated and stored (visible in Supabase Storage: room-photos)
- [ ] Room dimensions stored in Zustand store
- [ ] Loading screen shows all 6 progress stages in sequence
- [ ] Choice screen appears after loading: two clear CTA buttons
- [ ] "View AI Render" → renders → navigates to RenderViewScreen
- [ ] "Arrange Furniture" → navigates to RoomViewer3DScreen with correct dimensions
- [ ] Integration test passes: `npx ts-node supabase/functions/tests/render-pipeline.test.ts`

### 16.2 3D Viewer Done When:
- [ ] Room renders with ZERO white space on physical iPhone
- [ ] Camera positioned at doorway, eye level
- [ ] One-finger swipe: smooth look around
- [ ] Two-finger pinch: zoom, camera never exits room
- [ ] Furniture tap: gold ring at y=0.01
- [ ] Drag: moves along floor, cannot pass through walls
- [ ] Camera does NOT move while furniture is dragged
- [ ] Rotate: exactly 45 degrees
- [ ] Delete: confirmation prompt
- [ ] Undo: restores last change
- [ ] SSAO: subtle darkening in corners and under furniture
- [ ] Style chips: update colors, preserve all furniture positions
- [ ] 2D toggle: overhead layout, furniture persists on return to 3D
- [ ] Catalog: filtered by room type and style fingerprint

### 16.3 Render View Done When:
- [ ] Render fills 100% of screen, zero letterboxing
- [ ] Single finger pan: look around
- [ ] Pinch: zooms, hard max 2.5×, min 1×
- [ ] HUD auto-hides after 3 seconds, reappears on tap
- [ ] Regenerate: triggers new render with loading screen
- [ ] Save to camera roll: works, permission prompt if needed
- [ ] Share: iOS share sheet opens
- [ ] Chat bubble: opens panel (60% height, slides up)
- [ ] Product panel: slides in from left edge
- [ ] Before/After slider: draggable divider, left = original, right = render

---

## 17. SELF-CHECK BEFORE COMPLETING ANY FILE

Run this checklist internally before presenting any generated file.
If any item fails → fix before output. No exceptions.

```
□ Spec file exists at .claude/specs/ for this fix
□ This file is listed in the spec's FILES IN SCOPE
□ No changes made to any file in spec's FILES OUT OF SCOPE
□ No OrbitControls import anywhere in this file
□ No useState for camera values (only useRef in 3D files)
□ Canvas has gl={{ preserveDrawingBuffer: true }} if this touches Canvas
□ Canvas has <color attach="background" args={[ceilingColor]} /> if 3D room
□ Camera radius clamped: Math.max(1.5, Math.min(6.0, value))
□ No Node.js imports if this is an Edge Function
□ CORS headers on all Edge Function responses
□ JWT verification at top of Edge Function before any processing
□ No API keys or secrets in client-side code
□ All types from @cova/shared — no local type redefinitions
□ No TypeScript `any`
□ Loading, error, empty states handled in every UI component
□ No style names in user-facing strings (no Japandi/Coastal/etc)
□ All hex colors from COLORS constant
□ All package versions at exact pins from Section 3
□ Suspense boundary wrapping all useGLTF calls
□ FurniturePiece onPointerDown calls e.stopPropagation()
□ CLIP operations use 768 dimensions (never 1024)
□ Room dimensions from Zustand store (never hardcoded)
□ pnpm overrides block present in root package.json
□ style_applied included in every renders INSERT
□ renders.status CHECK constraint includes 'completed'
□ Image compressed to 1024px/0.8 quality before base64 encoding
□ Integration test passes if this touches render pipeline
```

---

*CLAUDE.md Version 2.0 — Combined architecture + full product spec*
*Owners: Daksh Parikh & Pranav Goel*
*Update Section 15 (Known Errors) immediately when any new error is encountered and resolved.*
*Update Section 7 (Feature Specifications) immediately when any product decision changes.*
*This file is always authoritative over any individual prompt. Always.*

---

## PRODUCT TRUTH — Source of Truth for All Features

This section defines the exact expected behavior of every
feature. The audit agent must compare the current
implementation against every item here every session,
even if no crashes or errors are present. A deviation
from PRODUCT TRUTH is a bug even if the code runs
without errors.

---

### HOW TO USE THIS SECTION

For every item marked with ✓ TRUTH, the audit agent must:
1. Read the relevant source file
2. Verify the implementation matches the truth exactly
3. If it does not match — flag it as a PRODUCT DEVIATION
4. A PRODUCT DEVIATION is treated with the same priority
   as a code error
5. Report every deviation with: what the truth requires,
   what the code currently does, and the exact fix needed

---

### FEATURE 1 — Splash Screen

✓ TRUTH: Dark forest green background (#0A1628 or similar)
✓ TRUTH: Cova logo fades in over exactly 2 seconds using
  Animated API
✓ TRUTH: Sign In and Create Account buttons appear only
  AFTER fade completes — not before
✓ TRUTH: Returning signed-in users skip splash entirely
  and go straight to dashboard
✓ TRUTH: New users see splash → auth → dashboard

DEVIATION FLAGS:
- Logo appears instantly = DEVIATION
- Buttons visible during fade = DEVIATION
- Signed-in user sees splash = DEVIATION

---

### FEATURE 2 — Authentication

✓ TRUTH: Exactly 3 sign-in options: Apple ID (top),
  Google (middle), Email+Password (bottom)
✓ TRUTH: Apple Sign In is always the topmost option —
  required by App Store
✓ TRUTH: After any successful auth → straight to dashboard
✓ TRUTH: No other screens between auth and dashboard

DEVIATION FLAGS:
- Apple Sign In not at top = DEVIATION
- Any screen between auth and dashboard = DEVIATION
- Fewer than 3 auth options = DEVIATION

---

### FEATURE 3 — Style Fingerprint Quiz

✓ TRUTH: Instruction screen appears FIRST before any cards
✓ TRUTH: Instruction screen shows exactly: "Swipe right
  if you love it, swipe left if you don't, tap neutral
  if you're unsure"
✓ TRUTH: Skip button appears ONLY on the instruction
  screen — never during swiping
✓ TRUTH: Cards show AI-generated room images specific to
  the user's selected room type
✓ TRUTH: ZERO style names ever shown to user anywhere
  in this flow (no "Japandi", "Coastal", etc.)
✓ TRUTH: Exactly 3 interactions: swipe right (like),
  swipe left (dislike), neutral button tap
✓ TRUTH: One card is visible and swipeable at a time —
  never two cards side by side
✓ TRUTH: Cards must be physically swipeable with a finger
  gesture — not just tappable
✓ TRUTH: Algorithm adapts in real time — subsequent cards
  shift toward liked aesthetics while still exploring
✓ TRUTH: Quiz ends at whichever comes first: confidence
  threshold reached OR 3 minutes elapsed
✓ TRUTH: Style fingerprint saved as style_blend JSON
  (e.g. {coastal: 0.6, japandi: 0.3, bohemian: 0.1})
✓ TRUTH: After quiz → straight to room capture, no
  intermediate screens
✓ TRUTH: Future rooms prompt: "Use previous style or
  discover new one?"

DEVIATION FLAGS:
- Two cards visible simultaneously = CRITICAL DEVIATION
- Cards not swipeable with finger gesture = CRITICAL DEVIATION
- Style names visible to user = DEVIATION
- Skip button visible during swiping = DEVIATION
- Quiz ends without saving style_blend = DEVIATION
- Any screen between quiz completion and room capture = DEVIATION
- Style blend not adapting based on swipes = DEVIATION

---

### FEATURE 4 — Room Capture

✓ TRUTH: Camera permission prompt shown FIRST before
  anything else
✓ TRUTH: Three capture options presented:
  1. Scan Room (LiDAR only, hidden on non-LiDAR devices)
  2. Take Photo (in-app camera)
  3. Upload from Library
✓ TRUTH: LiDAR scan option is completely hidden on
  non-LiDAR devices — not greyed out, not visible
✓ TRUTH: Photo and Upload paths show 4-corner drag
  calibration tool as overlay
✓ TRUTH: All images compressed to 1024px wide, 0.8
  quality JPEG before pipeline
✓ TRUTH: After capture → loading screen with stages:
  "Analyzing your room → Applying your style →
  Generating → Done"
✓ TRUTH: Loading screen → straight into render view
✓ TRUTH: Depth estimation must succeed — if it fails,
  retry once before showing error

DEVIATION FLAGS:
- Depth estimation fails without retry = CRITICAL DEVIATION
- LiDAR option visible on non-LiDAR device = DEVIATION
- No loading stages shown = DEVIATION
- Image sent uncompressed = CRITICAL DEVIATION
- Any path that results in capturedImageUri being null
  when render pipeline runs = CRITICAL DEVIATION

---

### FEATURE 5 — 3D Room Viewer

✓ TRUTH: Camera starts at doorway/entrance, eye level,
  looking into room
✓ TRUTH: ZERO white space ever visible — room fills
  100% of screen at all times
✓ TRUTH: Camera always clamped inside room — cannot
  zoom out past walls
✓ TRUTH: One finger swipe = look left/right/up/down
✓ TRUTH: Two finger pinch = zoom in/out, clamped so
  user never exits room
✓ TRUTH: Tap furniture = selects it, shows
  move/rotate/delete panel
✓ TRUTH: Drag selected furniture = moves along floor,
  clamped to room bounds, cannot pass through walls
✓ TRUTH: Long press furniture = product info sheet
  slides up (name, price, dimensions, retailer)
✓ TRUTH: Style change preserves ALL furniture positions —
  only materials/colors change
✓ TRUTH: 2D floor plan toggle switches between
  first-person 3D and top-down 2D
✓ TRUTH: PBR textures on all surfaces
✓ TRUTH: HDRI environment lighting per style
✓ TRUTH: SSAO ambient occlusion active
✓ TRUTH: Crown molding, baseboards, door frame present
✓ TRUTH: PanResponder is ALWAYS a sibling of Canvas —
  never a parent or child

DEVIATION FLAGS:
- Any white space visible = CRITICAL DEVIATION
- Style change resets furniture positions = CRITICAL DEVIATION
- PanResponder wraps Canvas = CRITICAL DEVIATION
- Camera can exit room bounds = DEVIATION
- No SSAO = DEVIATION
- No PBR textures = DEVIATION

---

### FEATURE 6 — AI Render

✓ TRUTH: After room capture → automatic first render
  generated immediately, no button needed
✓ TRUTH: Progress stages shown in exact order:
  "Analyzing your room → Applying your style →
  Generating → Done"
✓ TRUTH: User lands in photorealistic FIRST-PERSON
  walkthrough — not a flat image viewer
✓ TRUTH: Swipe left/right/up/down = look around room
✓ TRUTH: Pinch = zoom in/out, min 1x, max 2.5x
✓ TRUTH: Pan is clamped — user can NEVER see outside
  the room or see white space
✓ TRUTH: NOTHING in the render view is tappable,
  selectable, or draggable except the 4 action buttons
✓ TRUTH: 4 action buttons only: Regenerate, Save,
  Share, Open Chatbot
✓ TRUTH: Regenerate produces new render using same
  style fingerprint and room geometry
✓ TRUTH: All renders auto-saved to gallery
✓ TRUTH: Before/after slider: LEFT = original room
  photo, RIGHT = AI render — never the same image
  on both sides
✓ TRUTH: FLUX ControlNet Union Pro 2.0 + Depth
  Anything V2 + Canny edge map pipeline
✓ TRUTH: First render is free — tokens only charged
  on regeneration (999 tokens in V1, never decrements)

DEVIATION FLAGS:
- Render never appears after room capture = CRITICAL DEVIATION
- Depth estimation fails = CRITICAL DEVIATION
- White space visible in render view = CRITICAL DEVIATION
- Both sides of before/after slider show same image = DEVIATION
- Pinch zoom missing or non-functional = DEVIATION
- Progress stages not shown = DEVIATION
- Render charged tokens in V1 = DEVIATION

---

### FEATURE 7 — AI Chatbot

✓ TRUTH: Floating chat bubble in bottom RIGHT corner
  of render view
✓ TRUTH: Tap bubble → chat panel slides up from bottom,
  60% screen height
✓ TRUTH: Render still visible behind chat panel
✓ TRUTH: User can tap anywhere on render image to
  reference that area — tap coordinates sent to Claude
✓ TRUTH: If no tap — Claude listens to text only
✓ TRUTH: Claude receives: render image (vision), room
  dimensions, style fingerprint, full session history
✓ TRUTH: Chat is completely FREE — tokens only on
  Regenerate
✓ TRUTH: Chat history persists entire room session
✓ TRUTH: No auto-regeneration in V1 — user chats
  freely then manually taps Regenerate

DEVIATION FLAGS:
- Chat bubble not in bottom right = DEVIATION
- Chat panel covers entire screen (not 60%) = DEVIATION
- Render not visible behind panel = DEVIATION
- Claude does not receive render image = DEVIATION
- Chat costs tokens = CRITICAL DEVIATION

---

### FEATURE 8 — Product Shopping & CLIP Matching

✓ TRUTH: Pull tab on LEFT edge of render view
✓ TRUTH: Product panel slides in from left over render
✓ TRUTH: Every product shows: photo, name, price,
  retailer badge, Add to Cart, View Similar
✓ TRUTH: "Add All to Cart" button at top of panel
✓ TRUTH: Cart checkout opens retailer affiliate URL
  in in-app browser (SFSafariViewController)
✓ TRUTH: Budget slider appears BEFORE first render
✓ TRUTH: Budget change re-sorts products in real time
✓ TRUTH: CLIP matching is visual — not keyword based
✓ TRUTH: 500-1000 products minimum in V1 database
✓ TRUTH: Products span all 7 room types, 5 styles,
  all price tiers

DEVIATION FLAGS:
- Pull tab not on left edge = DEVIATION
- Checkout does not use affiliate URL = DEVIATION
- Budget slider appears after render = DEVIATION
- Keyword matching instead of CLIP = DEVIATION
- Fewer than 500 products = DEVIATION

---

### FEATURE 9 — Dashboard & Home Screen

✓ TRUTH: Full-width room cards with latest AI render
  as card background photo
✓ TRUTH: Each card shows: room name, room type,
  date last edited
✓ TRUTH: Tap card → straight into that room's render view
✓ TRUTH: "+" card at end of list → starts new room flow
✓ TRUTH: "Suggested For You" section below room cards
✓ TRUTH: Suggested section shows AI-generated
  inspiration rooms based on style fingerprint
✓ TRUTH: Inspiration cards are VIEW ONLY in V1 —
  no interaction except browsing
✓ TRUTH: "Recreate this room" button shows
  "Coming Soon" in V1
✓ TRUTH: Bottom tabs: Rooms, Shop, Profile (exactly 3)
✓ TRUTH: Token balance always visible top right —
  gold coin icon + "999"
✓ TRUTH: Tapping token balance → token shop screen

DEVIATION FLAGS:
- Room cards don't show render as background = DEVIATION
- More or fewer than 3 bottom tabs = DEVIATION
- Token balance not visible = DEVIATION
- Suggested section missing = DEVIATION

---

### FEATURE 10 — Token Economy (V1)

✓ TRUTH: ALL features free and unlimited in V1
✓ TRUTH: Token balance always shows 999
✓ TRUTH: Token balance NEVER decrements in V1
✓ TRUTH: No paywalls, no IAP prompts, no token
  gates anywhere in V1

DEVIATION FLAGS:
- Any feature blocked by tokens = CRITICAL DEVIATION
- Token balance decrements = CRITICAL DEVIATION
- Any IAP prompt shown = CRITICAL DEVIATION

---

### FEATURE 12 — Profile & Settings

✓ TRUTH: Profile shows: photo, name, email, edit,
  sign out, delete account
✓ TRUTH: Delete account removes ALL data — rooms,
  renders, fingerprint, purchase history
✓ TRUTH: Style fingerprint visualized as blend
  percentages (e.g. 60% Coastal, 30% Japandi)
✓ TRUTH: Retake quiz button updates fingerprint and
  affects future suggestions
✓ TRUTH: All data encrypted, RLS on all tables
✓ TRUTH: No user data ever used to train AI models
✓ TRUTH: ATT prompt shown on first launch

DEVIATION FLAGS:
- Delete account leaves orphaned data = CRITICAL DEVIATION
- Style blend not visualized = DEVIATION
- No ATT prompt on first launch = DEVIATION

---

### GLOBAL RULES — Apply to Every Screen

✓ TRUTH: App color is deep navy (#0A1628)
✓ TRUTH: Cova logo used consistently — the arch mark
  + "cova" wordmark + tagline
✓ TRUTH: Style names NEVER shown to user
  (no Japandi, Coastal, Bohemian, etc.)
✓ TRUTH: Token balance (999) visible on every screen
✓ TRUTH: No white space ever visible in any room view
✓ TRUTH: All API keys in environment variables —
  never in client code
✓ TRUTH: No OrbitControls anywhere — crashes expo-gl
✓ TRUTH: No useState for camera state — useRef only

---

### AUDIT AGENT INSTRUCTIONS

At the start of every Claude Code session, run this audit:

1. Read CLAUDE.md fully including this PRODUCT TRUTH section
2. Read every source file in apps/mobile/src/screens/
3. For every TRUTH item above, verify the implementation matches
4. For every DEVIATION FLAG, check if that condition exists
5. Run the full test suite
6. Produce a report with three sections:
   - CRITICAL DEVIATIONS (fix immediately)
   - HIGH DEVIATIONS (fix this session)
   - PASSING (matches PRODUCT TRUTH)
7. Do not fix anything — report only, then wait for instruction

A technically working feature that does not match
PRODUCT TRUTH is still a bug.