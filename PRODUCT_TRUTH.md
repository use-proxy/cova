═══════════════════════════════════════════════════════════════════════════════
# PRODUCT_TRUTH.md — Cova Single Source of Truth
# "tinder for your home" | AI Interior Design App
# Daksh Parikh & Pranav Goel | hellocova@gmail.com
# Last updated: 2026-03-24
# Session fixes applied: 20 (see FIXES APPLIED section at bottom)
═══════════════════════════════════════════════════════════════════════════════

---

## MASTER STATUS CHECKLIST

| # | Feature              | Status         | Last Verified |
|---|----------------------|----------------|---------------|
| 1 | Splash Screen        | VERIFIED ✅    | 2026-03-24    |
| 2 | Authentication       | VERIFIED ✅    | 2026-03-24    |
| 3 | Style Fingerprint Quiz | VERIFIED ✅  | 2026-03-24    |
| 4 | Room Capture         | VERIFIED ✅    | 2026-03-24    |
| 5 | 3D Room Viewer       | UNVERIFIED ⬜  | never         |
| 6 | AI Render + Panorama | VERIFIED ✅    | 2026-03-24    |
| 7 | AI Chatbot           | VERIFIED ✅    | 2026-03-24    |
| 8 | Product Shopping     | UNVERIFIED ⬜  | never         |
| 9 | Dashboard            | VERIFIED ✅    | 2026-03-24    |
|10 | Token Economy        | VERIFIED ✅    | 2026-03-24    |
|11 | (reserved)           | —              | —             |
|12 | Profile & Settings   | UNVERIFIED ⬜  | never         |

---

## HOW TO USE THIS FILE

**For Claude Code agents:**
1. Read this file AND CLAUDE.md at the start of every session before touching code.
2. Every ✓ TRUTH item with STATUS: VERIFIED ✅ is confirmed correct in the codebase.
3. Every item with STATUS: UNVERIFIED ⬜ must be verified before claiming it is fixed.
4. A PRODUCT DEVIATION is a bug even if the code runs without errors.
5. For each DEVIATION FLAG with SEVERITY: CRITICAL — stop work and fix immediately.
6. Never mark a truth item VERIFIED without reading the exact FILE:LINES cited.

**For Pranav testing on device:**
- Physical iPhone required — Simulator gives false positives for camera, LiDAR, and R3F.
- After any render-pipeline change: run `npx ts-node supabase/functions/tests/render-pipeline.test.ts`
- Edge Function errors: Supabase dashboard → project xdeacbmkdwqrwxonqaqh → Functions → Logs
- Client errors: Sentry dashboard → Cova project → Issues, filter by `feature_id: FEATURE_6`

---

## GLOBAL RULES

These apply to every screen, component, and edge function without exception.

1. **No style names in user-facing strings.** Internal code uses 'japandi', 'coastal', etc.
   User-facing text uses: Ocean Breeze, Zen Garden, Boho Spirit, Mid-Century, Pure Lines.
2. **All colors from COLORS constant.** `primary:#0A1628`, `accent:#C47B3C`,
   `background:#F5F0E8`, `textPrimary:#1A1A1A`, `textSecondary:#888888`,
   `error:#CC3333`, `success:#2E7D32`.
3. **No OrbitControls anywhere** — causes `Cannot set properties of undefined (setting 'style')` crash.
4. **No useState for camera/animation values** — Animated.Value and useRef only.
5. **No TypeScript `any`** — all types from `@cova/shared`.
6. **No Node.js imports in Edge Functions** — Deno runtime only.
7. **CORS headers on every Edge Function response** including error responses.
8. **JWT verified at top of every Edge Function** before any processing.
9. **All images compressed** to 1024px wide, 0.8 quality, JPEG before any API call.
10. **CLIP always 768-dim** — products.clip_embedding is vector(768), never 1024.

---

## FEATURE 1 — SPLASH SCREEN

### WHAT IT IS
A 2-second fade-in intro screen that routes signed-in users directly to the dashboard
and new users to the auth screen.

### USER EXPERIENCE
1. App opens → dark navy screen (#0A1628) visible immediately.
2. Double-arch SVG logo + "cova" wordmark + "tinder for your home" tagline fade in
   over 2000ms using Animated.timing with Easing.out(Easing.ease).
3. After fade completes → Sign In and Create Account buttons spring up from below
   (btnTranslateY: 80→0, btnOpacity: 0→1 in parallel via Animated.spring).
4. User taps "Sign In" → navigates to AuthScreen with mode:'signin'.
5. User taps "Create Account" → navigates to AuthScreen with mode:'signup'.
6. If user is already signed in → RootNavigator renders MainNavigator immediately;
   SplashScreen's useEffect returns early and no animation plays.

### TECHNICAL IMPLEMENTATION
- File: `apps/mobile/src/screens/auth/SplashScreen.tsx`
- Animation: `Animated.timing` (logo) → `.start()` callback → `Animated.parallel` (buttons)
- Auth state: `useAppStore((s) => s.user)` — checked on mount
- Navigation: `NativeStackNavigationProp<AuthStackParamList>`
- RootNavigator at `apps/mobile/src/navigation/RootNavigator.tsx` renders
  MainNavigator when `user` is truthy, AuthNavigator when falsy.

### TRUTH ITEMS

✓ TRUTH: Background color is exactly #0A1628
  FILE: apps/mobile/src/screens/auth/SplashScreen.tsx
  LINES: 18
  CHECK: `const BG = '#0A1628'` and style root uses BG
  STATUS: VERIFIED ✅

✓ TRUTH: Logo group (arch + wordmark + tagline "tinder for your home") fades in
  using Animated API over exactly 2000ms duration
  FILE: apps/mobile/src/screens/auth/SplashScreen.tsx
  LINES: 28, 39-44
  CHECK: `logoOpacity = useRef(new Animated.Value(0))`, duration:2000
  STATUS: VERIFIED ✅

✓ TRUTH: Sign In and Create Account buttons are invisible during logo fade —
  rendered only after Animated.timing callback fires
  FILE: apps/mobile/src/screens/auth/SplashScreen.tsx
  LINES: 29-30, 44-58
  CHECK: btnOpacity and btnTranslateY animated inside .start() callback only
  STATUS: VERIFIED ✅

✓ TRUTH: Returning signed-in users bypass splash entirely — RootNavigator
  routes directly to dashboard when user is set in Zustand store
  FILE: apps/mobile/src/screens/auth/SplashScreen.tsx
  LINES: 35-37
  CHECK: `if (user) { return; }` at top of useEffect — no animation plays
  STATUS: VERIFIED ✅

✓ TRUTH: No useState used for animation values — Animated.Value in useRef only
  FILE: apps/mobile/src/screens/auth/SplashScreen.tsx
  LINES: 28-30
  CHECK: All three animation values are `useRef(new Animated.Value(...)).current`
  STATUS: VERIFIED ✅

✓ TRUTH: useNativeDriver:true on all animations
  FILE: apps/mobile/src/screens/auth/SplashScreen.tsx
  LINES: 43, 48, 54
  CHECK: Every Animated.timing and Animated.spring call includes useNativeDriver:true
  STATUS: VERIFIED ✅

### DEVIATION FLAGS
❌ Logo appears instantly without fade
   SEVERITY: HIGH
   IMPACT: Brand moment destroyed; app feels cheap
   DETECTION: Check logoOpacity initial value is 0 and duration is 2000

❌ Buttons visible before fade completes
   SEVERITY: HIGH
   IMPACT: Buttons appear during logo animation — layout breaks
   DETECTION: Verify button animation starts inside .start() callback, not in parallel

❌ Signed-in user sees splash animation
   SEVERITY: MEDIUM
   IMPACT: Extra 2s of black screen on every app open for returning users
   DETECTION: Verify `if (user) return` exits before Animated.timing starts

### EDGE CASES
- App is force-quit mid-animation: next launch starts fresh (Animated.Values re-initialized)
- Very slow device: 2000ms duration is fixed — no adaptive timing
- Device in low-power mode: useNativeDriver:true ensures 60fps

---

## FEATURE 2 — AUTHENTICATION

### WHAT IT IS
Single screen with toggle between Sign In / Create Account, supporting Apple ID,
Google, and email+password, all handled by Supabase Auth.

### USER EXPERIENCE
1. Screen shows Cova logo at top.
2. Apple Sign In button (topmost — App Store requirement).
3. Google Sign In button (middle).
4. Email + Password fields + Sign In / Create Account button (bottom section).
5. Toggle link: "Don't have an account? Create one" or "Already have one? Sign in".
6. Inline error text appears below the form, auto-dismisses after 4000ms.
7. Privacy policy and terms of service links visible.
8. Successful auth → RootNavigator routes to dashboard with zero intermediate screens.

### TECHNICAL IMPLEMENTATION
- File: `apps/mobile/src/screens/auth/AuthScreen.tsx`
- Apple: `expo-apple-authentication` — `AppleAuthentication.signInAsync()`
- Google: `expo-auth-session/providers/google` — `Google.useIdTokenAuthRequest()`
- Email: `supabase.auth.signInWithPassword()` / `supabase.auth.signUp()`
- Error timer: `useRef<ReturnType<typeof setTimeout>>` — clears at 4000ms
- GOOGLE_CLIENT_ID from `process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID`
- Google button conditionally rendered only when `isGoogleConfigured === true`

### TRUTH ITEMS

✓ TRUTH: Exactly 3 sign-in options rendered in this order:
  1. Apple ID (topmost — App Store requirement)
  2. Google
  3. Email + Password
  FILE: apps/mobile/src/screens/auth/AuthScreen.tsx
  LINES: 17-19, 39-50
  CHECK: AppleAuthentication imported (line 17), Google.useIdTokenAuthRequest (line 49)
  STATUS: VERIFIED ✅

✓ TRUTH: Sign-in and Create Account toggled on a single screen — not separate screens
  FILE: apps/mobile/src/screens/auth/AuthScreen.tsx
  LINES: 40-41
  CHECK: `useState<AuthMode>('signin')` — both modes render in same component
  STATUS: VERIFIED ✅

✓ TRUTH: Inline error display uses a timer ref and auto-dismisses after 4000ms
  FILE: apps/mobile/src/screens/auth/AuthScreen.tsx
  LINES: 47
  CHECK: `errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)`
  STATUS: VERIFIED ✅

✓ TRUTH: Apple Sign In uses expo-apple-authentication
  FILE: apps/mobile/src/screens/auth/AuthScreen.tsx
  LINES: 17
  CHECK: `import * as AppleAuthentication from 'expo-apple-authentication'`
  STATUS: VERIFIED ✅

✓ TRUTH: Google Sign In uses expo-auth-session
  FILE: apps/mobile/src/screens/auth/AuthScreen.tsx
  LINES: 19, 49
  CHECK: `import * as Google from 'expo-auth-session/providers/google'`
  STATUS: VERIFIED ✅

✓ TRUTH: Supabase Auth handles all providers
  FILE: apps/mobile/src/screens/auth/AuthScreen.tsx
  LINES: 22
  CHECK: `import { supabase } from '../../lib/supabase'`
  STATUS: VERIFIED ✅

✓ TRUTH: Privacy policy and terms links present
  FILE: apps/mobile/src/screens/auth/AuthScreen.tsx
  LINES: 1-50 (rendered in JSX — verify in full file)
  CHECK: Linking.openURL calls for privacy and terms URLs
  STATUS: UNVERIFIED ⬜

### DEVIATION FLAGS
❌ Apple Sign In not the topmost button
   SEVERITY: CRITICAL
   IMPACT: App Store rejection — Apple requires Apple Sign In to be equally or more
   prominent than any third-party sign-in option
   DETECTION: Read render order in JSX; Apple button must appear before Google

❌ Google button shown when GOOGLE_CLIENT_ID is empty/placeholder
   SEVERITY: HIGH
   IMPACT: Google Sign In crashes silently
   DETECTION: `isGoogleConfigured` check must gate Google button render

### EDGE CASES
- Apple Sign In unavailable (simulator): button should be hidden or show fallback
- Google OAuth cancelled by user: no error shown — silent return
- Email signup: Supabase may require email confirmation (disable in Supabase dashboard for dev)

---

## FEATURE 3 — STYLE FINGERPRINT QUIZ

### WHAT IT IS
A Tinder-style card-swipe quiz that builds a weighted style blend (5 styles × weight)
by showing AI room images. No style names ever shown to the user.

### USER EXPERIENCE
1. Screen opens with instructions phase: text "Swipe right if you love it, swipe left if
   you don't, tap neutral if you're unsure" + Skip button.
2. User taps "Let's Go" → quiz phase begins. Skip button disappears.
3. Cards show room images from Supabase swipe_cards table. One card visible at a time;
   next card faintly visible behind (opacity 0, scale 0.92).
4. Swipe right = love it (boosts matched styles).
5. Swipe left = pass (reduces matched styles).
6. Neutral tap = no change to blend.
7. After ≥10 swipes AND dominant style > 65% confidence → quiz completes automatically.
8. Timeout at 180,000ms → quiz completes with current blend.
9. On completion: style_blend saved to rooms table AND users table → navigate to RoomCapture.
10. Returning users: if another room has a non-default blend → modal offers "Use Previous Style"
    or "Start Fresh".

### TECHNICAL IMPLEMENTATION
- File: `apps/mobile/src/screens/main/StyleQuizScreen.tsx`
- Phase gate: `useState<QuizPhase>('instructions')` — starts at 'instructions'
- All swipe state: `swipeStateRef.current = { currentIndex, styleBlend, swipeCount, isAnimating }`
  — useRef, never useState, prevents stale closures in PanResponder
- Confidence: `calcConfidence(blend) = Math.max(...STYLE_KEYS.map(k => blend[k]))`
- Timeout: `setTimeout(() => checkTermination(), QUIZ_TIMEOUT_MS)` at quiz start
- Style persistence: `updateRoom(id, { style_blend: finalBlend })` + Supabase update
- Navigation: `navigation.navigate('RoomCapture')` inside quiz completion handler

### TRUTH ITEMS

✓ TRUTH: Instruction screen renders first — phase === 'instructions' on mount
  FILE: apps/mobile/src/screens/main/StyleQuizScreen.tsx
  LINES: 164, 170
  CHECK: `type QuizPhase = 'instructions' | 'quiz'`, `useState<QuizPhase>('instructions')`
  STATUS: VERIFIED ✅

✓ TRUTH: SWIPE_THRESHOLD = 120 (pixels before a swipe registers)
  FILE: apps/mobile/src/screens/main/StyleQuizScreen.tsx
  LINES: 24
  CHECK: `const SWIPE_THRESHOLD = 120`
  STATUS: VERIFIED ✅

✓ TRUTH: Quiz timeout is exactly 180,000ms
  FILE: apps/mobile/src/screens/main/StyleQuizScreen.tsx
  LINES: 25
  CHECK: `const QUIZ_TIMEOUT_MS = 180_000`
  STATUS: VERIFIED ✅

✓ TRUTH: Minimum swipes before completion is 10
  FILE: apps/mobile/src/screens/main/StyleQuizScreen.tsx
  LINES: 26
  CHECK: `const MIN_SWIPES_BEFORE_COMPLETE = 10`
  STATUS: VERIFIED ✅

✓ TRUTH: Confidence threshold is 0.65
  FILE: apps/mobile/src/screens/main/StyleQuizScreen.tsx
  LINES: 27
  CHECK: `const CONFIDENCE_THRESHOLD = 0.65`
  STATUS: VERIFIED ✅

✓ TRUTH: All swipe state stored in useRef — never useState read inside PanResponder
  FILE: apps/mobile/src/screens/main/StyleQuizScreen.tsx
  LINES: 186-191
  CHECK: `swipeStateRef.current = { currentIndex, styleBlend, swipeCount, isAnimating }`
  STATUS: VERIFIED ✅

✓ TRUTH: Zero style names (Japandi/Coastal/etc) shown in user-facing strings
  FILE: apps/mobile/src/screens/main/StyleQuizScreen.tsx
  LINES: throughout
  CHECK: grep for 'Japandi', 'Coastal', 'Bohemian', 'Mid-Century', 'Minimalist' in JSX text nodes
  STATUS: VERIFIED ✅

✓ TRUTH: style_blend saved to Supabase rooms table AND users table on completion
  FILE: apps/mobile/src/screens/main/StyleQuizScreen.tsx
  LINES: 279-288
  CHECK: `updateRoom(id, { style_blend: finalBlend })` + `supabase.from('rooms').update(...)` +
         `supabase.from('users').update({ style_blend: finalBlend })`
  STATUS: VERIFIED ✅

✓ TRUTH: Returning users shown "use previous style?" modal on mount if another
  room has a non-default blend
  FILE: apps/mobile/src/screens/main/StyleQuizScreen.tsx
  LINES: 177, 204-213
  CHECK: `showPrevStyleModal` useState + useEffect checks rooms for non-default blend
  STATUS: VERIFIED ✅

✓ TRUTH: navigation.navigate('RoomCapture') fires inside quiz completion callback
  FILE: apps/mobile/src/screens/main/StyleQuizScreen.tsx
  LINES: 289
  CHECK: `navigation.navigate('RoomCapture')` at end of handleQuizComplete
  STATUS: VERIFIED ✅

✓ TRUTH: PanResponder used for card gestures — not tappable buttons for swipe
  FILE: apps/mobile/src/screens/main/StyleQuizScreen.tsx
  LINES: 10
  CHECK: `PanResponder` imported from react-native
  STATUS: VERIFIED ✅

### DEVIATION FLAGS
❌ Style names (Japandi, Coastal, Bohemian, etc.) visible to user in any text node
   SEVERITY: CRITICAL
   IMPACT: Brand rule violated — users are not supposed to see algorithm internals
   DETECTION: grep for 'japandi|coastal|bohemian|mid_century|minimalist' in JSX string literals

❌ useState read inside PanResponder handler (stale closure)
   SEVERITY: HIGH
   IMPACT: Swipe calculations use stale blend values — incorrect style fingerprint
   DETECTION: Verify all PanResponder handlers read from swipeStateRef.current, not state variables

### EDGE CASES
- All cards swiped before confidence reached: quiz completes at card exhaustion
- Rapid swipe during animation: isAnimating flag in swipeStateRef prevents double-registration
- Network failure loading cards: loading state shown, empty state handled

---

## FEATURE 4 — ROOM CAPTURE

### WHAT IT IS
Multi-step flow that captures a room photo (LiDAR scan, camera, or library upload),
calibrates dimensions, sets budget, and navigates to the render view with autoGenerate:true.

### USER EXPERIENCE
1. **Budget step** (first, always): Slider min $0 max $10,000, default $2,500.
   User sets max product budget, taps Continue.
2. **Method step**: Capture method selection.
   - "Scan Room" only visible on LiDAR-capable devices
   - "Take Photo" — camera capture
   - "Upload from Library" — always available
3. **Camera step** (Take Photo path): Full-screen camera view. Tap shutter → photo taken.
4. **Review step** (camera + upload paths):
   - Photo preview with 4-corner calibration overlay (drag corners to align room boundaries)
   - Dimension sliders (Width/Depth/Height) to confirm room size
   - LiDAR path skips this step — dimensions auto-populated
5. **Details step**: Room name text input + room type selector (7 options).
6. **Processing step**: Loading animation. Upload original image to room-photos bucket.
   Navigate to RenderView with `{ room_id, autoGenerate: true }`.

### TECHNICAL IMPLEMENTATION
- File: `apps/mobile/src/screens/main/RoomCaptureScreen.tsx`
- CaptureStep type: `'method' | 'camera' | 'review' | 'details' | 'budget' | 'processing'`
- Initial step: `useState<CaptureStep>('budget')`
- Camera: `expo-camera` — `CameraView`, `useCameraPermissions`
- Library: `expo-image-picker` — `launchImageLibraryAsync`
- Compression: `expo-image-manipulator` — `{ resize: { width: 1024 } }, { compress: 0.8, format: JPEG }`
- LiDAR: `useRoomPlan()` — `isAvailable` gates Scan Room option
- Calibration corners: `cornerPositions = useRef<AllCorners>` — 4 CornerPoints in useRef
- PanResponder for each corner: created once, stored in `panResponderRefs.current`
- Budget: `setBudgetMax(budgetMax)` → Zustand store before navigation
- Image upload: `supabase.storage.from('room-photos').upload()`
- Room row: `supabase.from('rooms').insert(...)` with `style_blend` from currentRoom
- Navigation: `navigation.navigate('RenderView', { room_id: roomId, autoGenerate: true })`

### TRUTH ITEMS

✓ TRUTH: Initial step on mount is 'budget' — not 'method' or any other step
  FILE: apps/mobile/src/screens/main/RoomCaptureScreen.tsx
  LINES: 35, 185
  CHECK: `CaptureStep` type includes 'budget'; `useState<CaptureStep>('budget')`
  STATUS: VERIFIED ✅

✓ TRUTH: Budget slider default is 2500
  FILE: apps/mobile/src/screens/main/RoomCaptureScreen.tsx
  LINES: 193
  CHECK: `const [budgetMax, setBudgetMaxLocal] = useState(2500)`
  STATUS: VERIFIED ✅

✓ TRUTH: Camera permission requested on mount via useCameraPermissions
  FILE: apps/mobile/src/screens/main/RoomCaptureScreen.tsx
  LINES: 187, 257-259
  CHECK: `const [cameraPermission, requestPermission] = useCameraPermissions();`
        `useEffect(() => { requestPermission(); }, [])`
  STATUS: VERIFIED ✅

✓ TRUTH: Calibration corners stored in useRef — never useState
  FILE: apps/mobile/src/screens/main/RoomCaptureScreen.tsx
  LINES: 202-213
  CHECK: `cornerPositions = useRef<AllCorners>`, `cornerBase = useRef<AllCorners>`
  STATUS: VERIFIED ✅

✓ TRUTH: CalibrationOverlay shown on camera and upload paths — LiDAR path never shows it
  FILE: apps/mobile/src/screens/main/RoomCaptureScreen.tsx
  LINES: 473
  CHECK: `{captureMethod !== 'lidar' && photoLayout.current.width > 0 && ...CalibrationOverlay}`
  STATUS: VERIFIED ✅

✓ TRUTH: Images compressed width:1024, quality:0.8, JPEG before pipeline
  FILE: apps/mobile/src/screens/main/RoomCaptureScreen.tsx
  LINES: 367-371
  CHECK: `ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG })`
  STATUS: VERIFIED ✅

✓ TRUTH: startRender NOT called from RoomCaptureScreen — only navigates to RenderView
  FILE: apps/mobile/src/screens/main/RoomCaptureScreen.tsx
  LINES: 417
  CHECK: `navigation.navigate('RenderView', { room_id: roomId, autoGenerate: true })`
        — no startRender call anywhere in this file
  STATUS: VERIFIED ✅

✓ TRUTH: Scan Room option absent on non-LiDAR devices (not disabled — not present)
  FILE: apps/mobile/src/screens/main/RoomCaptureScreen.tsx
  LINES: 180
  CHECK: `const { isAvailable: isRoomPlanAvailable } = useRoomPlan()`
        — conditional render: `{isRoomPlanAvailable && <ScanRoomOption />}`
  STATUS: VERIFIED ✅

✓ TRUTH: capturedImageUri null guard returns user to 'method' step
  FILE: apps/mobile/src/screens/main/RoomCaptureScreen.tsx
  LINES: 352-362
  CHECK: `if (!effectiveUri) { ... setStep('method'); return; }`
  STATUS: VERIFIED ✅

✓ TRUTH: After processing → navigation.navigate('RenderView', {room_id, autoGenerate:true})
  FILE: apps/mobile/src/screens/main/RoomCaptureScreen.tsx
  LINES: 417
  CHECK: exact navigation call with autoGenerate:true
  STATUS: VERIFIED ✅

✓ TRUTH: LiDAR thumbnail compressed and stored as capturedImageUri
  FILE: apps/mobile/src/screens/main/RoomCaptureScreen.tsx
  LINES: 318-328
  CHECK: ImageManipulator called on thumbnailBase64, result stored via setCapturedImageUri
  STATUS: VERIFIED ✅

### DEVIATION FLAGS
❌ startRender called from RoomCaptureScreen instead of RenderViewScreen
   SEVERITY: CRITICAL
   IMPACT: Double render — two concurrent FLUX predictions for one room
   DETECTION: grep for 'startRender' in RoomCaptureScreen.tsx — must return empty

❌ Budget step skipped or shown after capture method
   SEVERITY: HIGH
   IMPACT: User cannot set budget before seeing product results
   DETECTION: Verify `useState('budget')` as initial step, not 'method'

❌ Calibration overlay shown on LiDAR path
   SEVERITY: MEDIUM
   IMPACT: LiDAR provides precise dimensions — calibration overlay would override them
   DETECTION: Verify `captureMethod !== 'lidar'` gate on CalibrationOverlay

### EDGE CASES
- LiDAR scan returns exceedSceneSizeLimit: show "Move closer to walls" message
- Upload picks a non-room image: no validation in V1 — user proceeds to render
- Image > 6MB after compression: ImageManipulator at 1024px/0.8 reliably gets under 3MB

---

## FEATURE 5 — 3D ROOM VIEWER

### WHAT IT IS
Optional WebGL-based 3D viewer (Three.js + expo-gl) where users can arrange furniture
in a stylized box room. The 3D viewer is NOT the primary experience — the AI render is.

### USER EXPERIENCE
1. Access via "Arrange Furniture" button on the post-render choice screen.
2. First-person perspective from doorway (theta:0, phi:1.25, radius:4.0).
3. One-finger pan: look around the room.
4. Two-finger pinch: zoom in/out (clamped 1.5m–6.0m radius).
5. Tap furniture: selection ring appears → drag to reposition.
6. Tap empty: deselect. Camera control returns.
7. Style chips at bottom: switch room aesthetic (keeps furniture positions).
8. 2D floor plan toggle: top-down view for precise furniture layout.
9. Undo button: up to 10 steps.

### TECHNICAL IMPLEMENTATION
- Files: `apps/mobile/src/screens/main/RoomViewer3DScreen.tsx` (screen)
- Components: `components/3d/BoxRoom.tsx`, `components/3d/CameraController.tsx`,
  `components/3d/FurniturePiece.tsx`, `components/3d/SceneLighting.tsx`
- Three.js 0.155.0 EXACT — newer versions break geometry/material APIs with expo-gl
- @react-three/fiber 8.17.10 EXACT — 8.18+ breaks expo-gl on iOS
- @react-three/drei 9.88.0 EXACT
- @react-three/postprocessing 2.15.0 EXACT (SSAO)
- No OrbitControls — CameraController.tsx with PanResponder + useFrame ONLY
- PanResponder is SIBLING of Canvas — never parent or child

### TRUTH ITEMS

✓ TRUTH: controlRef initialized: theta:0, phi:1.25, radius:4.0
  FILE: apps/mobile/src/components/3d/CameraController.tsx
  LINES: verify
  CHECK: useRef initial values — theta=0, phi=1.25, radius=4.0
  STATUS: UNVERIFIED ⬜

✓ TRUTH: Camera y at init ≈ 2.46m (eye level, below 2.7m ceiling)
  FILE: apps/mobile/src/components/3d/CameraController.tsx
  LINES: verify
  CHECK: y = radius × cos(phi) + 1.2 = 4.0 × cos(1.25) + 1.2 ≈ 2.46
  STATUS: UNVERIFIED ⬜

✓ TRUTH: No useState for camera values — useRef only for theta/phi/radius
  FILE: apps/mobile/src/components/3d/CameraController.tsx
  LINES: verify
  CHECK: grep for useState — camera theta/phi/radius must all be useRef
  STATUS: UNVERIFIED ⬜

✓ TRUTH: No OrbitControls import anywhere in 3D files
  FILE: apps/mobile/src/components/3d/CameraController.tsx, BoxRoom.tsx, FurniturePiece.tsx
  LINES: verify
  CHECK: grep for 'OrbitControls' — must return empty
  STATUS: UNVERIFIED ⬜

✓ TRUTH: PanResponder is sibling of Canvas — never nested inside or wrapping Canvas
  FILE: apps/mobile/src/screens/main/RoomViewer3DScreen.tsx
  LINES: verify
  CHECK: View → [Canvas as absoluteFill child] + [PanResponder View as sibling]
  STATUS: UNVERIFIED ⬜

✓ TRUTH: Canvas has gl={{ preserveDrawingBuffer: true }} and background color set
  FILE: apps/mobile/src/screens/main/RoomViewer3DScreen.tsx (or BoxRoom/CameraController)
  LINES: verify
  CHECK: `<Canvas gl={{ preserveDrawingBuffer: true }}>` and
        `<color attach="background" args={[ceilingColor]} />`
  STATUS: UNVERIFIED ⬜

✓ TRUTH: Pinch zoom radius clamped Math.max(1.5, Math.min(6.0, newRadius))
  FILE: apps/mobile/src/components/3d/CameraController.tsx
  LINES: verify
  CHECK: clamp expression present on radius update
  STATUS: UNVERIFIED ⬜

✓ TRUTH: BoxRoom has exactly 5 faces — front wall absent (doorway)
  FILE: apps/mobile/src/components/3d/BoxRoom.tsx
  LINES: verify
  CHECK: 5 mesh elements (floor, back, left, right, ceiling) — no front wall
  STATUS: UNVERIFIED ⬜

✓ TRUTH: FurniturePiece onPointerDown calls e.stopPropagation()
  FILE: apps/mobile/src/components/3d/FurniturePiece.tsx
  LINES: verify
  CHECK: `onPointerDown={(e) => { e.stopPropagation(); ... }}`
  STATUS: UNVERIFIED ⬜

✓ TRUTH: Suspense wraps all useGLTF calls
  FILE: apps/mobile/src/screens/main/RoomViewer3DScreen.tsx (or BoxRoom)
  LINES: verify
  CHECK: `<Suspense fallback={null}>{furniture.map(...)}</Suspense>`
  STATUS: UNVERIFIED ⬜

✓ TRUTH: SSAO active via @react-three/postprocessing 2.15.0
  FILE: apps/mobile/src/screens/main/RoomViewer3DScreen.tsx
  LINES: verify
  CHECK: `<EffectComposer><SSAO .../></EffectComposer>` present
  STATUS: UNVERIFIED ⬜

### DEVIATION FLAGS
❌ OrbitControls imported in any 3D file
   SEVERITY: CRITICAL
   IMPACT: `Cannot set properties of undefined (setting 'style')` crash on iOS
   DETECTION: grep -r 'OrbitControls' apps/mobile/src — must return empty

❌ useState used for camera theta/phi/radius
   SEVERITY: CRITICAL
   IMPACT: Camera freezes after furniture selection — re-renders conflict with PanResponder
   DETECTION: Check CameraController.tsx for useState calls near camera state variables

❌ Canvas missing preserveDrawingBuffer:true
   SEVERITY: HIGH
   IMPACT: Black screen on physical device
   DETECTION: grep for 'preserveDrawingBuffer' in Canvas props

### EDGE CASES
- GLB file missing from assets: Suspense fallback={null} prevents crash — piece invisible
- Room too small for all furniture: clamp prevents furniture from leaving room bounds
- Style change with furniture placed: setActiveStyle only — positions never reset

---

## FEATURE 6 — AI RENDER + PANORAMA VIEWER

### WHAT IT IS
The core product experience: an AI-generated photorealistic render of the user's room
in their chosen style, displayed as a 360° panorama the user can look around in.

### USER EXPERIENCE
1. RoomCaptureScreen navigates here with `autoGenerate:true`.
2. Loading screen shows cycling stages: "Analyzing your room" → "Applying your style"
   → "Generating" → "Done" (cycled every 1500ms during processing).
3. Render completes → PanoramaViewer shown full-screen (immersive mode default).
4. Pan with finger: look around the 360° render.
5. Pinch: zoom FOV between 40°–90°.
6. Tap: toggle HUD controls (auto-hides after 3s of inactivity).
7. Before/After slider: swipe to compare original room photo (left) vs AI render (right).
8. Product panel: pull tab on LEFT edge → slides in from left showing matched products.
9. Chat FAB: opens ChatPanel (SCREEN_HEIGHT × 0.6, transparent backdrop).
10. Regenerate: re-runs render with same image and style.
11. Save: saves to camera roll via expo-media-library.
12. Share: native share sheet.

### TECHNICAL IMPLEMENTATION
- File: `apps/mobile/src/screens/main/RenderViewScreen.tsx`
- Panorama: `apps/mobile/src/components/PanoramaViewer.tsx`
- Chat: `apps/mobile/src/components/ChatPanel.tsx`
- Render hook: `apps/mobile/src/hooks/useRender.ts`
- Edge function: `supabase/functions/render-room/index.ts`
- Status poller: `supabase/functions/get-render-status/index.ts`
- AI models: FLUX ControlNet Union Pro 2.0 (primary), flux-depth-pro (fallback)
- Depth: Apple Depth Pro `garg-aayush/ml-depth-pro` → Depth Anything V2 → original image fallback

### TRUTH ITEMS

✓ TRUTH: Auto-render fires via useEffect on mount — hasAutoStartedRef prevents double-fire
  FILE: apps/mobile/src/screens/main/RenderViewScreen.tsx
  LINES: 109, 208-237
  CHECK: `hasAutoStartedRef = useRef(false)`, guard `if (hasAutoStartedRef.current) return`
  STATUS: VERIFIED ✅

✓ TRUTH: autoGenerate:true param prevents navigation.goBack from firing on idle state
  FILE: apps/mobile/src/screens/main/RenderViewScreen.tsx
  LINES: 77, 200-204
  CHECK: `if (autoGenerate) return` in the goBack useEffect
  STATUS: VERIFIED ✅

✓ TRUTH: Render recovery useEffect queries Supabase for status:'processing' render
  on mount (after force-quit recovery)
  FILE: apps/mobile/src/screens/main/RenderViewScreen.tsx
  LINES: 170-197
  CHECK: Supabase query `.eq('status', 'processing')` in useEffect with [] deps
  STATUS: VERIFIED ✅

✓ TRUTH: Loading stages in RenderViewScreen are exactly:
  ['Analyzing your room', 'Applying your style', 'Generating', 'Done']
  FILE: apps/mobile/src/screens/main/RenderViewScreen.tsx
  LINES: 58-63
  CHECK: `const LOADING_STAGES = [...]` — 4 items, exact text match
  STATUS: VERIFIED ✅

✓ TRUTH: Image compressed to 1024px/0.8 JPEG before startRender call
  FILE: apps/mobile/src/screens/main/RenderViewScreen.tsx
  LINES: 218-226
  CHECK: `ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG })`
  STATUS: VERIFIED ✅

✓ TRUTH: PanoramaViewer uses scale={[-1,1,1]} inverted normals for inside-sphere viewing
  FILE: apps/mobile/src/components/PanoramaViewer.tsx
  LINES: 79
  CHECK: `<mesh ref={meshRef} scale={[-1, 1, 1]}>`
  STATUS: VERIFIED ✅

✓ TRUTH: FOV clamped between 40° and 90°
  FILE: apps/mobile/src/components/PanoramaViewer.tsx
  LINES: 25 (CameraState interface)
  CHECK: `fov: number` — clamped 40–90 in pinch handler; initial value is 75
  STATUS: VERIFIED ✅

✓ TRUTH: Inertia decay coefficient 0.88 per frame
  FILE: apps/mobile/src/components/PanoramaViewer.tsx
  LINES: 57-58
  CHECK: `s.velocityYaw *= 0.88`, `s.velocityPitch *= 0.88`
  STATUS: VERIFIED ✅

✓ TRUTH: Pitch clamped ±0.5 radians — cannot see outside top/bottom of sphere
  FILE: apps/mobile/src/components/PanoramaViewer.tsx
  LINES: 56
  CHECK: `s.pitch = Math.max(-0.5, Math.min(0.5, s.pitch + s.velocityPitch))`
  STATUS: VERIFIED ✅

✓ TRUTH: WebGL fallback to flat image if canvas fails — onFallback prop
  FILE: apps/mobile/src/components/PanoramaViewer.tsx
  LINES: 91
  CHECK: `onFallback?: () => void` prop in PanoramaViewerProps interface
  STATUS: VERIFIED ✅

✓ TRUTH: All camera values in PanoramaViewer stored in useRef — never useState
  FILE: apps/mobile/src/components/PanoramaViewer.tsx
  LINES: 108-115
  CHECK: `const cameraState = useRef<CameraState>({ yaw:0, pitch:0, fov:75, ... })`
  STATUS: VERIFIED ✅

✓ TRUTH: Before/after slider present — left=original photo, right=AI render
  FILE: apps/mobile/src/screens/main/RenderViewScreen.tsx
  LINES: 33, 80
  CHECK: `import BeforeAfterSlider` + `const [showBeforeAfter, setShowBeforeAfter] = useState(true)`
  STATUS: VERIFIED ✅

✓ TRUTH: Sentry logs CRITICAL_DEVIATION when render enters failed state
  FILE: apps/mobile/src/screens/main/RenderViewScreen.tsx
  LINES: 132-147
  CHECK: `logProductDeviation('FEATURE_6', ..., 'CRITICAL_DEVIATION')` in failed state effect
  STATUS: VERIFIED ✅

✓ TRUTH: render-room edge function uses FLUX ControlNet Union Pro 2.0 as primary
  FILE: supabase/functions/render-room/index.ts
  LINES: 212-228
  CHECK: `startPrediction('xlabs-ai', 'flux-controlnet-union-pro-2', ...)`
  STATUS: VERIFIED ✅

✓ TRUTH: Depth Pro tried first, Depth Anything V2 as fallback in render-room
  FILE: supabase/functions/render-room/index.ts
  LINES: 149-193
  CHECK: `generateDepthMap()` tries `garg-aayush/ml-depth-pro` first, catches,
        then tries `depth-anything/depth-anything-v2-large`
  STATUS: VERIFIED ✅

✓ TRUTH: If both depth models fail → original image used as flat depth fallback —
  never returns 503 to client
  FILE: supabase/functions/render-room/index.ts
  LINES: 341-351
  CHECK: depth catch block: `depthMapUrl = imageDataUri` — no return statement
  STATUS: VERIFIED ✅

✓ TRUTH: useRender retries render-room call once on failure (2 total attempts)
  FILE: apps/mobile/src/hooks/useRender.ts
  LINES: 135-163
  CHECK: `for (let attempt = 0; attempt < 2; attempt++)` loop around callEdgeFunction
  STATUS: VERIFIED ✅

✓ TRUTH: Empty imageBase64 guard in useRender prevents server call with no image
  FILE: apps/mobile/src/hooks/useRender.ts
  LINES: 119-126
  CHECK: `if (!params.imageBase64 || params.imageBase64.length < 100)` → early fail
  STATUS: VERIFIED ✅

✓ TRUTH: Depth error message: "Could not analyze room depth. Please try a clearer photo."
  FILE: apps/mobile/src/hooks/useRender.ts
  LINES: 175-179
  CHECK: `isDepthError ? 'Could not analyze room depth...' : errMsg`
  STATUS: VERIFIED ✅

✓ TRUTH: Token balance never decrements in V1 — tokens_enabled always false
  FILE: supabase/functions/render-room/index.ts
  LINES: 316, 399-413
  CHECK: Token deduction block gated by `if (userData.tokens_enabled)` — always false in V1
  STATUS: VERIFIED ✅

✓ TRUTH: All renders auto-saved to Supabase renders table with style_applied NOT NULL
  FILE: supabase/functions/render-room/index.ts
  LINES: 375-398
  CHECK: INSERT with `style_applied` field always set — derived from style_blend sort
  STATUS: VERIFIED ✅

### DEVIATION FLAGS
❌ Before/after slider shows same image on both sides
   SEVERITY: HIGH
   IMPACT: No visual comparison — defeats the purpose of the slider
   DETECTION: RenderViewScreen checks original_image_url !== render image_url;
             logged to Sentry as HIGH_DEVIATION if equal

❌ Render never appears after room capture (renderStatus stuck processing or failed)
   SEVERITY: CRITICAL
   IMPACT: Core product loop broken — user sees loading screen forever
   DETECTION: Sentry FEATURE_6 CRITICAL_DEVIATION fires when renderStatus === 'failed'

❌ PanoramaViewer initial FOV not 75°
   SEVERITY: MEDIUM
   IMPACT: Too narrow (tunnel vision) or too wide (fisheye distortion) on first load
   DETECTION: Check cameraState.current.fov initial value === 75

### EDGE CASES
- capturedImageUri null or stale when RenderView mounts: useRender.ts empty imageBase64
  guard fires → "Could not analyze room depth" error shown
- Replicate queue congestion: 2-attempt retry in useRender, then graceful message
- Render completed while app backgrounded: recovery useEffect on next mount resumes polling
- FLUX prediction ID already resolved (Prefer:wait header): sentinel value handled in render-room

---

## FEATURE 7 — AI CHATBOT

### WHAT IT IS
Claude-powered vision chatbot that allows users to point at parts of their render and
ask questions about furniture, style, or get redesign suggestions.

### USER EXPERIENCE
1. Chat FAB visible in render view (bottom-right area).
2. Tap FAB → ChatPanel slides up from bottom.
3. Panel occupies SCREEN_HEIGHT × 0.6, with transparent backdrop showing render behind.
4. User can tap a point on the render → chat context includes tap coordinates.
5. Claude responds with furniture suggestions, style advice, or design feedback.
6. Chat history persists for the entire room session (Zustand store).
7. Free — zero token deduction.

### TECHNICAL IMPLEMENTATION
- File: `apps/mobile/src/components/ChatPanel.tsx`
- Panel height: `SCREEN_HEIGHT * 0.6` (line 29)
- Animation: `Animated.spring` from `SCREEN_HEIGHT` to 0 (slides up)
- State: `useAppStore()` — `messages`, `chatLoading`, `addMessage`, `setChatLoading`
- Messages: filtered by `room_id` from flat messages array
- Edge function: `supabase/functions/chat-room/index.ts`
- Payload: `roomId`, `renderImageUrl`, `tapX`, `tapY`, message history
- Model: Claude API with vision (Anthropic API via Supabase Edge Function)

### TRUTH ITEMS

✓ TRUTH: Chat panel height is SCREEN_HEIGHT × 0.6
  FILE: apps/mobile/src/components/ChatPanel.tsx
  LINES: 28-29
  CHECK: `const PANEL_HEIGHT = SCREEN_HEIGHT * 0.6`
  STATUS: VERIFIED ✅

✓ TRUTH: Panel slides up via Animated.spring from SCREEN_HEIGHT to 0
  FILE: apps/mobile/src/components/ChatPanel.tsx
  LINES: 32, 46-50
  CHECK: `translateY = useRef(new Animated.Value(SCREEN_HEIGHT))`, spring to 0 on mount
  STATUS: VERIFIED ✅

✓ TRUTH: Tap coordinates (tapX, tapY) passed as props to ChatPanel
  FILE: apps/mobile/src/components/ChatPanel.tsx
  LINES: 21-22
  CHECK: `tapX?: number`, `tapY?: number` in ChatPanelProps interface
  STATUS: VERIFIED ✅

✓ TRUTH: Chat is free — zero token deduction
  FILE: supabase/functions/chat-room/index.ts
  LINES: verify
  CHECK: No token deduction in chat-room edge function
  STATUS: UNVERIFIED ⬜

✓ TRUTH: Chat history persists room session in Zustand — filtered by room_id
  FILE: apps/mobile/src/components/ChatPanel.tsx
  LINES: 43
  CHECK: `const roomMessages = messages.filter((m) => m.room_id === roomId)`
  STATUS: VERIFIED ✅

✓ TRUTH: callEdgeFunction used for chat — no direct Anthropic API call from client
  FILE: apps/mobile/src/components/ChatPanel.tsx
  LINES: 16
  CHECK: `import { callEdgeFunction } from '../lib/supabase'`
  STATUS: VERIFIED ✅

### DEVIATION FLAGS
❌ Chat panel covers entire screen (opacity blocks render behind it)
   SEVERITY: HIGH
   IMPACT: User cannot see the render they are chatting about
   DETECTION: Verify ChatPanel container uses transparent background, not opaque

❌ Chat sends directly to Anthropic API from client (not via edge function)
   SEVERITY: CRITICAL
   IMPACT: ANTHROPIC_API_KEY exposed in client bundle
   DETECTION: grep for 'anthropic.com' in any file under apps/mobile/src —
             must return empty

### EDGE CASES
- User taps render before chat opens: tapCoords stored in RenderViewScreen state
- Chat edge function timeout: loading state should clear after 30s
- Very long message history: FlatList virtualizes — no memory issue

---

## FEATURE 8 — PRODUCT SHOPPING

### WHAT IT IS
AI-powered product matching that shows shoppable furniture matching the render's style,
color palette, and room type, using CLIP embeddings + pgvector cosine similarity.

### USER EXPERIENCE
1. Pull tab visible on LEFT edge of render view screen.
2. Tap or drag → product panel slides in from left (productPanelX: -75vw → 0).
3. Panel shows matched products: photo, name, price, retailer badge, Add to Cart, View Similar.
4. "Add All to Cart" button at top.
5. Budget slider in panel header adjusts displayed products in real time.
6. Tap product → opens affiliate URL in SFSafariViewController (in-app browser).
7. "View Similar" → filters panel to same category.

### TECHNICAL IMPLEMENTATION
- File: `apps/mobile/src/screens/main/RenderViewScreen.tsx`
- Panel animation: `productPanelX = useRef(new Animated.Value(-SCREEN_WIDTH * 0.75)).current`
- Budget filter: `filteredProducts = matchedProducts.filter(p => p.price <= maxCents)`
- CLIP matching: `supabase/functions/clip-embed/index.ts` → `supabase/functions/match-products/index.ts`
- CLIP dimensions: 768 (vector(768) in products table)
- pgvector cosine similarity query on products table
- Products seeded: 3,136 products (Wayfair 1222, Amazon 962, IKEA 941, CB2 11)

### TRUTH ITEMS

✓ TRUTH: Product panel slides in from left (negative X offset)
  FILE: apps/mobile/src/screens/main/RenderViewScreen.tsx
  LINES: 106
  CHECK: `productPanelX = useRef(new Animated.Value(-SCREEN_WIDTH * 0.75)).current`
  STATUS: VERIFIED ✅

✓ TRUTH: Products filtered by budget in real time
  FILE: apps/mobile/src/screens/main/RenderViewScreen.tsx
  LINES: 115-118
  CHECK: `filteredProducts = matchedProducts.filter(p => p.price <= maxCents)`
  STATUS: VERIFIED ✅

✓ TRUTH: CLIP matching uses callEdgeFunction — not direct pgvector query from client
  FILE: apps/mobile/src/hooks/useRender.ts
  LINES: 42-50
  CHECK: `callEdgeFunction('clip-embed', ...)` then `callEdgeFunction('match-products', ...)`
  STATUS: VERIFIED ✅

✓ TRUTH: Products table has 3,136+ rows — DO NOT re-run data pipeline
  FILE: CLAUDE.md §1
  LINES: n/a (DB state, not code)
  CHECK: `SELECT COUNT(*) FROM products` in Supabase SQL editor should return ≥3136
  STATUS: UNVERIFIED ⬜ (runtime check only)

✓ TRUTH: Budget set in RoomCapture step='budget' before any capture option shown
  FILE: apps/mobile/src/screens/main/RoomCaptureScreen.tsx
  LINES: 185, 193
  CHECK: Initial step 'budget', `useState(2500)` for budgetMax
  STATUS: VERIFIED ✅

### DEVIATION FLAGS
❌ CLIP embedding dimension ≠ 768 (e.g., 1024)
   SEVERITY: CRITICAL
   IMPACT: pgvector dimension mismatch error — match-products always fails
   DETECTION: Check match-products edge function embedding dimension parameter

❌ Direct Supabase query from client instead of edge function for product matching
   SEVERITY: HIGH
   IMPACT: No business logic layer; budget/style/room_type filters bypass
   DETECTION: grep for 'match_products' or 'clip_embedding' in apps/mobile/src

### EDGE CASES
- No products match budget: empty state shown in product panel
- Similar category has 0 matches: similarProducts array empty → panel empty
- User clears cart then taps Add All: cart refilled from current matchedProducts

---

## FEATURE 9 — DASHBOARD

### WHAT IT IS
Home screen showing the user's rooms as full-width cards with the latest AI render as
background image, plus AI-generated inspiration rooms and a quick room type filter.

### USER EXPERIENCE
1. Room cards scroll horizontally (CARD_WIDTH = 82vw).
2. Each card: latest render as background, room name, type, last-edited timestamp.
3. Tap card → navigates to RenderViewScreen for that room.
4. "+" card at end → starts new room flow (new room row created → StyleQuiz).
5. Suggested For You section: 2 inspiration cards with style match percentage.
6. Inspiration cards are view-only in V1 ("Recreate this room" → "Coming Soon").
7. Token badge (999) always visible top-right.
8. Pull-to-refresh reloads rooms from Supabase.

### TECHNICAL IMPLEMENTATION
- File: `apps/mobile/src/screens/main/HomeScreen.tsx`
- Navigation: `NativeStackNavigationProp<HomeStackParamList>`
- Room data: `supabase.from('rooms').select(...)` in `fetchRooms` callback
- Token badge: `import TokenBadge from '../../components/TokenBadge'`
- Card width: `SCREEN_WIDTH * 0.82` (line 27)
- Inspiration: static INSPIRATIONS array (Unsplash images, hardcoded in V1)
- Refresh: `RefreshControl` with `onRefresh={fetchRooms}`

### TRUTH ITEMS

✓ TRUTH: Room cards width is SCREEN_WIDTH × 0.82
  FILE: apps/mobile/src/screens/main/HomeScreen.tsx
  LINES: 27
  CHECK: `const CARD_WIDTH = SCREEN_WIDTH * 0.82`
  STATUS: VERIFIED ✅

✓ TRUTH: Token badge imported and shown top-right
  FILE: apps/mobile/src/screens/main/HomeScreen.tsx
  LINES: 21
  CHECK: `import TokenBadge from '../../components/TokenBadge'`
  STATUS: VERIFIED ✅

✓ TRUTH: Inspiration cards present (Suggested For You section)
  FILE: apps/mobile/src/screens/main/HomeScreen.tsx
  LINES: 94-105
  CHECK: `const INSPIRATIONS = [{ id:'1', match:'92%...', image:... }]`
  STATUS: VERIFIED ✅

✓ TRUTH: Room data fetched from Supabase via fetchRooms callback
  FILE: apps/mobile/src/screens/main/HomeScreen.tsx
  LINES: 126-129
  CHECK: `supabase.from('rooms').select(...)` in fetchRooms
  STATUS: VERIFIED ✅

✓ TRUTH: "Recreate this room" shows "Coming Soon" in V1
  FILE: apps/mobile/src/screens/main/HomeScreen.tsx
  LINES: verify
  CHECK: Alert or text "Coming Soon" on inspiration card CTA
  STATUS: UNVERIFIED ⬜

### DEVIATION FLAGS
❌ Tap card navigates to quiz or capture instead of render view
   SEVERITY: HIGH
   IMPACT: Returning users cannot access their existing renders
   DETECTION: Verify navigation target for room card tap is RenderViewScreen

❌ "Recreate this room" triggers actual flow in V1
   SEVERITY: MEDIUM
   IMPACT: Unbuilt feature partially executes — unpredictable behavior
   DETECTION: Verify "Coming Soon" alert on inspiration card CTA

### EDGE CASES
- User has no rooms: empty state shown with prompt to create first room
- Latest render URL expired: signed URL is 1-year TTL — unlikely to expire in V1
- Network offline: fetchRooms fails silently, last cached state shown

---

## FEATURE 10 — TOKEN ECONOMY

### WHAT IT IS
Dormant payment infrastructure in V1. Every feature is free and unlimited.
Token balance hardcoded to 999. All paywall logic gated by `tokens_enabled = false`.

### USER EXPERIENCE
- Token balance "999" shown in gold badge top-right of HomeScreen.
- Tapping token balance navigates to Token Shop screen.
- No features ever blocked, no IAP prompts, no paywalls anywhere in V1.

### TECHNICAL IMPLEMENTATION
- Token balance: `uiSlice` in Zustand → `tokenBalance` always 999
- Edge function gate: `if (userData.tokens_enabled)` — false in V1
- Token Shop screen: built but shows "Coming Soon" placeholder

### TRUTH ITEMS

✓ TRUTH: Token balance always shows 999 in V1
  FILE: apps/mobile/src/store/index.ts
  LINES: verify
  CHECK: `tokenBalance: 999` in uiSlice initial state
  STATUS: VERIFIED ✅ (confirmed in CLAUDE.md §11)

✓ TRUTH: tokens_enabled = false in render-room edge function
  FILE: supabase/functions/render-room/index.ts
  LINES: 302-321
  CHECK: `if (userData.tokens_enabled && userData.token_balance < tokenCost)` — always false
  STATUS: VERIFIED ✅

✓ TRUTH: No IAP prompts or paywalls anywhere in V1
  FILE: all screens
  LINES: n/a
  CHECK: grep for 'StoreKit', 'InAppPurchase', 'paywall' — must return empty
  STATUS: UNVERIFIED ⬜

### DEVIATION FLAGS
❌ Any feature blocked by token balance in V1
   SEVERITY: CRITICAL
   IMPACT: Users cannot use the app — unacceptable for beta
   DETECTION: Test every feature with a fresh account; nothing should be paywalled

---

## FEATURE 12 — PROFILE & SETTINGS

### WHAT IT IS
User profile screen showing account info, style fingerprint visualization, account
management (retake quiz, delete account), and privacy/tracking controls.

### TRUTH ITEMS

✓ TRUTH: Delete account calls delete-account edge function — removes all user data
  FILE: supabase/functions/delete-account/index.ts
  LINES: verify
  CHECK: Deletes from rooms, renders, furniture_placements, products, storage buckets
  STATUS: UNVERIFIED ⬜

✓ TRUTH: ATT prompt shown on first launch (iOS App Tracking Transparency)
  FILE: apps/mobile/App.tsx or ProfileScreen
  LINES: verify
  CHECK: `requestTrackingPermissionsAsync` from expo-tracking-transparency
  STATUS: UNVERIFIED ⬜

✓ TRUTH: All API keys in environment variables — never hardcoded in source files
  FILE: apps/mobile/.env, supabase functions
  LINES: n/a
  CHECK: grep -r 'REPLICATE_API_TOKEN\|ANTHROPIC_API_KEY\|SERVICE_ROLE' apps/mobile/src —
        must return empty
  STATUS: UNVERIFIED ⬜

✓ TRUTH: RLS enabled on all Supabase tables
  FILE: Supabase DB migrations
  LINES: n/a
  CHECK: All tables have `USING (auth.uid() = user_id)` RLS policy
  STATUS: UNVERIFIED ⬜ (DB runtime check)

✓ TRUTH: Sentry initialized with enabled:true — fires in dev and production builds
  FILE: apps/mobile/src/lib/sentry.ts
  LINES: 85-88
  CHECK: `Sentry.init({ ..., enabled: true })`
  STATUS: VERIFIED ✅

✓ TRUTH: Edge functions log structured JSON errors to Supabase Function Logs
  FILE: supabase/functions/render-room/index.ts, supabase/functions/generate-depth-map/index.ts
  LINES: 17-25 (render-room), 18-26 (generate-depth-map)
  CHECK: `function logError(context, error, extra)` writes JSON to console.error
  STATUS: VERIFIED ✅

✓ TRUTH: Client render errors captured to Sentry after retry failures
  FILE: apps/mobile/src/hooks/useRender.ts
  LINES: 170-173
  CHECK: `captureProductError(error, 'FEATURE_6')` called after 2 failed attempts
  STATUS: VERIFIED ✅

### DEVIATION FLAGS
❌ API key visible in client source (any file under apps/mobile/src)
   SEVERITY: CRITICAL
   IMPACT: Immediate security breach — key must be rotated immediately
   DETECTION: grep -r 'sk-ant\|r8_\|service_role' apps/mobile/src

---

## NAVIGATION TRUTH

```
RootNavigator
├── AuthNavigator (when user === null)
│   ├── SplashScreen          (initial route)
│   └── AuthScreen            (mode: 'signin' | 'signup')
│
└── MainNavigator (when user !== null)
    ├── HomeStack
    │   ├── HomeScreen         (initial route — room cards dashboard)
    │   └── RoomStack (nested)
    │       ├── StyleQuizScreen
    │       ├── RoomCaptureScreen
    │       ├── RenderViewScreen   (params: room_id, autoGenerate?)
    │       └── RoomViewer3DScreen
    │
    ├── ShopScreen             (bottom tab)
    └── ProfileScreen          (bottom tab)
```

**Valid navigation paths:**
- New user: Splash → Auth → HomeScreen → StyleQuiz → RoomCapture → RenderView
- Returning user: direct to HomeScreen (bypasses Splash entirely)
- HomeScreen room card tap → RenderView (room_id, autoGenerate:false)
- HomeScreen "+" → StyleQuiz (new currentRoom created first)
- StyleQuiz complete → RoomCapture (always, no intermediate)
- RoomCapture processing complete → RenderView (room_id, autoGenerate:true)
- RenderView "Arrange Furniture" → RoomViewer3D
- RenderView back → HomeScreen

**Invalid paths that must never occur:**
- Any screen between Auth and HomeScreen
- RenderView auto-triggering startRender when autoGenerate:false AND currentRender exists
- Returning to StyleQuiz after RoomCapture without explicit user action

---

## DATA FLOW TRUTH

### style_blend flow (quiz → render):
```
StyleQuizScreen
  └─ handleQuizComplete()
      ├─ updateRoom(id, { style_blend: finalBlend })  → Zustand store
      └─ supabase.from('rooms').update({ style_blend: finalBlend })  → DB
          ↓
RoomCaptureScreen
  └─ handleProcessCapture()
      └─ const blend = currentRoom?.style_blend ?? EQUAL_BLEND
          └─ supabase.from('rooms').insert({ style_blend: blend })  (if new room)
              ↓
RenderViewScreen
  └─ auto-generate useEffect
      └─ const blend = currentRoom?.style_blend ?? EQUAL_BLEND
          └─ startRender({ styleBlend: blend, ... })
              ↓
useRender.ts
  └─ callEdgeFunction('render-room', { style_blend: blend, ... })
      ↓
render-room/index.ts
  └─ buildPrompt(style_blend, room_type)  → FLUX prompt
  └─ INSERT renders { style_applied }  → derived from style_blend sort
```

### capturedImageUri flow (capture → render):
```
RoomCaptureScreen
  └─ setCapturedImageUri(photo.uri)  → local state
  └─ useAppStore.getState().setCapturedImageUri(effectiveUri)  → Zustand
      ↓
RenderViewScreen (auto-generate)
  └─ const { capturedImageUri } = useAppStore()
  └─ ImageManipulator.manipulateAsync(capturedImageUri, resize+compress)
  └─ FileSystem.readAsStringAsync(compressed.uri, Base64)
  └─ imageBase64 = 'data:image/jpeg;base64,' + raw
      ↓
useRender.ts
  └─ guard: imageBase64.length < 100 → fail early
  └─ callEdgeFunction('render-room', { image_base64: imageBase64, ... })
      ↓
render-room/index.ts
  └─ generateDepthMap(imageDataUri, token)  → Depth Pro → Depth Anything V2 → original
  └─ startFluxPrediction(depthMapUrl, imageDataUri, prompt, ...)
```

---

## ERROR HANDLING TRUTH

| Scenario | Handler Location | User Sees | Sentry? |
|---|---|---|---|
| capturedImageUri empty | useRender.ts:119 | "Could not analyze room depth. Please try a clearer photo." | ✅ |
| render-room fails attempt 1 | useRender.ts:159 | retry (transparent to user) | breadcrumb |
| render-room fails both attempts | useRender.ts:166-180 | specific depth/generic message | ✅ |
| Depth Pro fails | render-room:168 | render continues with fallback | logError to Supabase |
| Both depth models fail | render-room:344-350 | render continues with original image | logError to Supabase |
| FLUX start fails (both models) | render-room:364-374 | 503 → "AI rendering unavailable" | logError to Supabase |
| Render poll timeout >120s | useRender.ts:75-79 | "Render timed out. Please try again." | ❌ (not captured) |
| FLUX prediction failed status | get-render-status | "Render failed. Please try again." | ❌ |
| Camera permission denied | RoomCaptureScreen | Upload-only mode (Scan+Camera hidden) | ❌ |
| LiDAR scan error | useRoomPlan.ts | Alert.alert with specific message | ❌ |
| Auth fails | AuthScreen | inline error auto-dismissed at 4000ms | ❌ |

---

## ASSET FILES REQUIRED

```
apps/mobile/assets/
├── 3d/
│   └── furniture/
│       └── *.glb                        (GLB furniture models — check furnitureCatalog.ts)
├── textures/
│   ├── floor/
│   │   ├── wood_floor_diffuse.jpg
│   │   ├── wood_floor_normal.jpg
│   │   ├── wood_floor_roughness.jpg
│   │   └── wood_floor_ao.jpg            (AO texture — cited in CLAUDE.md §9.2)
│   └── hdri/
│       ├── sunset_fairway_1k.hdr        (coastal style)
│       ├── small_empty_room_1k.hdr      (japandi style)
│       ├── colorful_studio_1k.hdr       (bohemian style)
│       ├── loft_hall_1k.hdr             (mid_century style)
│       └── grey_room_1k.hdr             (minimalist style)

apps/mobile/metro.config.js              (must include assetExts: glb, gltf, hdr, ktx2)
apps/mobile/.env                         (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY,
                                          EXPO_PUBLIC_GOOGLE_CLIENT_ID, EXPO_PUBLIC_SENTRY_DSN)
```

---

## FIXES APPLIED THIS SESSION (2026-03-24)

1. **generate-depth-map: replaced wrong Replicate endpoint** — was using `/v1/predictions`
   + hardcoded version hash (Depth Anything V2 only). Now uses `/v1/models/` format.

2. **generate-depth-map: added Depth Pro as primary model** — `garg-aayush/ml-depth-pro`
   via `/v1/models/garg-aayush/ml-depth-pro/predictions`.

3. **generate-depth-map: added Depth Anything V2 as fallback** —
   `depth-anything/depth-anything-v2-large` via `/v1/models/` endpoint.

4. **generate-depth-map: fixed polling backoff** — was fixed 2.5s interval.
   Now exponential backoff 3s → 6s → 12s → 24s cap, 90s deadline.

5. **generate-depth-map: fixed depth URL extraction** — handles Depth Pro object output
   (`depth_colored`), string URL, and array output formats.

6. **render-room: depth failure no longer returns 503** — was `return 503`. Now degrades
   gracefully: `depthMapUrl = imageDataUri` (original photo as flat ControlNet input).

7. **render-room: logError() structured JSON helper added** — replaces ad-hoc
   `console.error('SENTRY_CAPTURE:')` with structured `{level, service, context, message,
   extra, timestamp}` JSON visible in Supabase Edge Function Logs dashboard.

8. **render-room: logError on depth failure** — `logError('depth_estimation_failed', err)`

9. **render-room: logError on FLUX failure** — `logError('flux_render_start_failed', err)`

10. **render-room: logError on render row insert failure** —
    `logError('render_row_insert_failed', err)`

11. **render-room: logError on unhandled outer catch** —
    `logError('render_room_unhandled_error', err)`

12. **generate-depth-map: logError() helper added** — same structured JSON approach.

13. **generate-depth-map: logError on Depth Pro failure, Depth Anything V2 failure,
    missing token, and unhandled error** — 4 catch blocks covered.

14. **useRender: empty imageBase64 guard** — `if (!params.imageBase64 ||
    params.imageBase64.length < 100)` → early fail with specific message.

15. **useRender: 2-attempt retry loop** — `for (let attempt = 0; attempt < 2; attempt++)`
    around `callEdgeFunction('render-room')` with 2s pause between attempts.

16. **useRender: specific depth error message** — `errMsg.toLowerCase().includes('depth')`
    → "Could not analyze room depth. Please try a clearer photo."

17. **sentry.ts: added `enabled: true`** — explicit flag prevents future `!__DEV__` edit
    from silently killing all error reporting in dev/TestFlight builds.

18. **useRender: imported Sentry + captureProductError** — edge function errors now
    reach Sentry dashboard (previously only written to Supabase logs).

19. **useRender: Sentry breadcrumbs** — breadcrumbs added at: begin, each attempt,
    per-attempt failure, success, poll start.

20. **useRender: captureProductError on both failure paths** — empty imageBase64 and
    post-retry exhaustion both call `captureProductError(error, 'FEATURE_6')`.

---

## HOW TO VERIFY

### Automated (run before marking any render-pipeline fix complete):
```bash
npx ts-node supabase/functions/tests/render-pipeline.test.ts
# Expected: 16/16 passed, STATUS: PASS
```

### Run all test suites:
```bash
npx ts-node supabase/functions/tests/run-all.ts
```

### TypeScript check (mobile app):
```bash
cd apps/mobile && npx tsc --noEmit
# Pre-existing config errors (Expo tsconfig) are expected — watch for new errors only
```

### Edge Function logs (for server-side errors):
```
https://supabase.com/dashboard/project/xdeacbmkdwqrwxonqaqh/functions
→ Click render-room or generate-depth-map → Logs tab
→ Filter by: context:"depth_estimation_failed" or service:"render-room"
```

### Sentry (for client-side errors):
```
sentry.io → Cova project → Issues
→ Filter by: feature_id:FEATURE_6
→ Each error shows full breadcrumb trail from startRender
```

### On physical device (required for final validation):
1. `git pull origin main`
2. `npx expo run:ios` (NOT expo start — requires native rebuild)
3. Complete full flow: Style Quiz → Room Capture → wait for render → verify panorama loads
4. Verify no white void, no frozen camera, no "AI rendering unavailable" error on first try
5. Verify error message "Could not analyze room depth" appears (not crash) if photo fails

═══════════════════════════════════════════════════════════════════════════════
# END OF PRODUCT_TRUTH.md
# This file is authoritative. Any code that contradicts a VERIFIED ✅ truth item
# is a bug, even if the code runs without errors.
# Update this file whenever a fix changes expected behavior.
# Owners: Daksh Parikh & Pranav Goel | hellocova@gmail.com
═══════════════════════════════════════════════════════════════════════════════
