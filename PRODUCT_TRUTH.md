# PRODUCT_TRUTH.md — Cova Feature Source of Truth
# "tinder for your home" | AI Interior Design App
# Daksh Parikh & Pranav Goel | hellocova@gmail.com
#
# ⚠️ READ THIS FILE alongside CLAUDE.md at the start of every session.
# This file defines the exact expected behavior of every feature.
# A deviation from PRODUCT TRUTH is a bug even if the code runs without errors.
# Architectural rules, version constraints, and forbidden patterns live in CLAUDE.md.

---

## HOW TO USE THIS FILE

For every item marked with ✓ TRUTH, the audit agent must:
1. Read the relevant source file
2. Verify the implementation matches the truth exactly
3. If it does not match — flag it as a PRODUCT DEVIATION
4. A PRODUCT DEVIATION is treated with the same priority as a code error
5. Report every deviation with: what the truth requires, what the code currently
   does, and the exact fix needed

---

## FEATURE 1 — Splash Screen

✓ TRUTH: Dark forest green background (#0A1628 or similar)
✓ TRUTH: Cova logo fades in over exactly 2 seconds using Animated API
✓ TRUTH: Sign In and Create Account buttons appear only AFTER fade completes — not before
✓ TRUTH: Returning signed-in users skip splash entirely and go straight to dashboard
✓ TRUTH: New users see splash → auth → dashboard

DEVIATION FLAGS:
- Logo appears instantly = DEVIATION
- Buttons visible during fade = DEVIATION
- Signed-in user sees splash = DEVIATION

---

## FEATURE 2 — Authentication

✓ TRUTH: Exactly 3 sign-in options: Apple ID (top), Google (middle), Email+Password (bottom)
✓ TRUTH: Apple Sign In is always the topmost option — required by App Store
✓ TRUTH: After any successful auth → straight to dashboard
✓ TRUTH: No other screens between auth and dashboard

DEVIATION FLAGS:
- Apple Sign In not at top = DEVIATION
- Any screen between auth and dashboard = DEVIATION
- Fewer than 3 auth options = DEVIATION

---

## FEATURE 3 — Style Fingerprint Quiz

✓ TRUTH: Instruction screen appears FIRST before any cards
✓ TRUTH: Instruction screen shows exactly: "Swipe right if you love it, swipe left
  if you don't, tap neutral if you're unsure"
✓ TRUTH: Skip button appears ONLY on the instruction screen — never during swiping
✓ TRUTH: Cards show AI-generated room images specific to the user's selected room type
✓ TRUTH: ZERO style names ever shown to user anywhere in this flow
  (no "Japandi", "Coastal", etc.)
✓ TRUTH: Exactly 3 interactions: swipe right (like), swipe left (dislike), neutral button tap
✓ TRUTH: One card is visible and swipeable at a time — never two cards side by side
✓ TRUTH: Cards must be physically swipeable with a finger gesture — not just tappable
✓ TRUTH: Algorithm adapts in real time — subsequent cards shift toward liked aesthetics
  while still exploring
✓ TRUTH: Quiz ends at whichever comes first: confidence threshold reached OR 3 minutes elapsed
✓ TRUTH: Style fingerprint saved as style_blend JSON
  (e.g. {coastal: 0.6, japandi: 0.3, bohemian: 0.1})
✓ TRUTH: After quiz → straight to room capture, no intermediate screens
✓ TRUTH: Future rooms prompt: "Use previous style or discover new one?"

DEVIATION FLAGS:
- Two cards visible simultaneously = CRITICAL DEVIATION
- Cards not swipeable with finger gesture = CRITICAL DEVIATION
- Style names visible to user = DEVIATION
- Skip button visible during swiping = DEVIATION
- Quiz ends without saving style_blend = DEVIATION
- Any screen between quiz completion and room capture = DEVIATION
- Style blend not adapting based on swipes = DEVIATION

---

## FEATURE 4 — Room Capture

✓ TRUTH: Camera permission prompt shown FIRST before anything else
✓ TRUTH: Three capture options presented:
  1. Scan Room (LiDAR only, hidden on non-LiDAR devices)
  2. Take Photo (in-app camera)
  3. Upload from Library
✓ TRUTH: LiDAR scan option is completely hidden on non-LiDAR devices —
  not greyed out, not visible
✓ TRUTH: Photo and Upload paths show 4-corner drag calibration tool as overlay
✓ TRUTH: All images compressed to 1024px wide, 0.8 quality JPEG before pipeline
✓ TRUTH: After capture → loading screen with stages:
  "Analyzing your room → Applying your style → Generating → Done"
✓ TRUTH: Loading screen → straight into render view
✓ TRUTH: Depth estimation must succeed — if it fails, retry once before showing error

DEVIATION FLAGS:
- Depth estimation fails without retry = CRITICAL DEVIATION
- LiDAR option visible on non-LiDAR device = DEVIATION
- No loading stages shown = DEVIATION
- Image sent uncompressed = CRITICAL DEVIATION
- Any path that results in capturedImageUri being null when render pipeline runs = CRITICAL DEVIATION

---

## FEATURE 5 — 3D Room Viewer

✓ TRUTH: Camera starts at doorway/entrance, eye level, looking into room
✓ TRUTH: ZERO white space ever visible — room fills 100% of screen at all times
✓ TRUTH: Camera always clamped inside room — cannot zoom out past walls
✓ TRUTH: One finger swipe = look left/right/up/down
✓ TRUTH: Two finger pinch = zoom in/out, clamped so user never exits room
✓ TRUTH: Tap furniture = selects it, shows move/rotate/delete panel
✓ TRUTH: Drag selected furniture = moves along floor, clamped to room bounds,
  cannot pass through walls
✓ TRUTH: Long press furniture = product info sheet slides up
  (name, price, dimensions, retailer)
✓ TRUTH: Style change preserves ALL furniture positions — only materials/colors change
✓ TRUTH: 2D floor plan toggle switches between first-person 3D and top-down 2D
✓ TRUTH: PBR textures on all surfaces
✓ TRUTH: HDRI environment lighting per style
✓ TRUTH: SSAO ambient occlusion active
✓ TRUTH: Crown molding, baseboards, door frame present
✓ TRUTH: PanResponder is ALWAYS a sibling of Canvas — never a parent or child

DEVIATION FLAGS:
- Any white space visible = CRITICAL DEVIATION
- Style change resets furniture positions = CRITICAL DEVIATION
- PanResponder wraps Canvas = CRITICAL DEVIATION
- Camera can exit room bounds = DEVIATION
- No SSAO = DEVIATION
- No PBR textures = DEVIATION

---

## FEATURE 6 — AI Render

✓ TRUTH: After room capture → automatic first render generated immediately, no button needed
✓ TRUTH: Progress stages shown in exact order:
  "Analyzing your room → Applying your style → Generating → Done"
✓ TRUTH: User lands in photorealistic FIRST-PERSON walkthrough — not a flat image viewer
✓ TRUTH: Swipe left/right/up/down = look around room
✓ TRUTH: Pinch = zoom in/out, min 1x, max 2.5x
✓ TRUTH: Pan is clamped — user can NEVER see outside the room or see white space
✓ TRUTH: NOTHING in the render view is tappable, selectable, or draggable
  except the 4 action buttons
✓ TRUTH: 4 action buttons only: Regenerate, Save, Share, Open Chatbot
✓ TRUTH: Regenerate produces new render using same style fingerprint and room geometry
✓ TRUTH: All renders auto-saved to gallery
✓ TRUTH: Before/after slider: LEFT = original room photo, RIGHT = AI render —
  never the same image on both sides
✓ TRUTH: FLUX ControlNet Union Pro 2.0 + Depth Pro + Canny edge map pipeline
✓ TRUTH: First render is free — tokens only charged on regeneration
  (999 tokens in V1, never decrements)

DEVIATION FLAGS:
- Render never appears after room capture = CRITICAL DEVIATION
- Depth estimation fails = CRITICAL DEVIATION
- White space visible in render view = CRITICAL DEVIATION
- Both sides of before/after slider show same image = DEVIATION
- Pinch zoom missing or non-functional = DEVIATION
- Progress stages not shown = DEVIATION
- Render charged tokens in V1 = DEVIATION

---

## FEATURE 7 — AI Chatbot

✓ TRUTH: Floating chat bubble in bottom RIGHT corner of render view
✓ TRUTH: Tap bubble → chat panel slides up from bottom, 60% screen height
✓ TRUTH: Render still visible behind chat panel
✓ TRUTH: User can tap anywhere on render image to reference that area —
  tap coordinates sent to Claude
✓ TRUTH: If no tap — Claude listens to text only
✓ TRUTH: Claude receives: render image (vision), room dimensions, style fingerprint,
  full session history
✓ TRUTH: Chat is completely FREE — tokens only on Regenerate
✓ TRUTH: Chat history persists entire room session
✓ TRUTH: No auto-regeneration in V1 — user chats freely then manually taps Regenerate

DEVIATION FLAGS:
- Chat bubble not in bottom right = DEVIATION
- Chat panel covers entire screen (not 60%) = DEVIATION
- Render not visible behind panel = DEVIATION
- Claude does not receive render image = DEVIATION
- Chat costs tokens = CRITICAL DEVIATION

---

## FEATURE 8 — Product Shopping & CLIP Matching

✓ TRUTH: Pull tab on LEFT edge of render view
✓ TRUTH: Product panel slides in from left over render
✓ TRUTH: Every product shows: photo, name, price, retailer badge, Add to Cart, View Similar
✓ TRUTH: "Add All to Cart" button at top of panel
✓ TRUTH: Cart checkout opens retailer affiliate URL in in-app browser (SFSafariViewController)
✓ TRUTH: Budget slider appears BEFORE first render
✓ TRUTH: Budget change re-sorts products in real time
✓ TRUTH: CLIP matching is visual — not keyword based
✓ TRUTH: 500-1000 products minimum in V1 database
✓ TRUTH: Products span all 7 room types, 5 styles, all price tiers

DEVIATION FLAGS:
- Pull tab not on left edge = DEVIATION
- Checkout does not use affiliate URL = DEVIATION
- Budget slider appears after render = DEVIATION
- Keyword matching instead of CLIP = DEVIATION
- Fewer than 500 products = DEVIATION

---

## FEATURE 9 — Dashboard & Home Screen

✓ TRUTH: Full-width room cards with latest AI render as card background photo
✓ TRUTH: Each card shows: room name, room type, date last edited
✓ TRUTH: Tap card → straight into that room's render view
✓ TRUTH: "+" card at end of list → starts new room flow
✓ TRUTH: "Suggested For You" section below room cards
✓ TRUTH: Suggested section shows AI-generated inspiration rooms based on style fingerprint
✓ TRUTH: Inspiration cards are VIEW ONLY in V1 — no interaction except browsing
✓ TRUTH: "Recreate this room" button shows "Coming Soon" in V1
✓ TRUTH: Bottom tabs: Rooms, Shop, Profile (exactly 3)
✓ TRUTH: Token balance always visible top right — gold coin icon + "999"
✓ TRUTH: Tapping token balance → token shop screen

DEVIATION FLAGS:
- Room cards don't show render as background = DEVIATION
- More or fewer than 3 bottom tabs = DEVIATION
- Token balance not visible = DEVIATION
- Suggested section missing = DEVIATION

---

## FEATURE 10 — Token Economy (V1)

✓ TRUTH: ALL features free and unlimited in V1
✓ TRUTH: Token balance always shows 999
✓ TRUTH: Token balance NEVER decrements in V1
✓ TRUTH: No paywalls, no IAP prompts, no token gates anywhere in V1

DEVIATION FLAGS:
- Any feature blocked by tokens = CRITICAL DEVIATION
- Token balance decrements = CRITICAL DEVIATION
- Any IAP prompt shown = CRITICAL DEVIATION

---

## FEATURE 12 — Profile & Settings

✓ TRUTH: Profile shows: photo, name, email, edit, sign out, delete account
✓ TRUTH: Delete account removes ALL data — rooms, renders, fingerprint, purchase history
✓ TRUTH: Style fingerprint visualized as blend percentages
  (e.g. 60% Coastal, 30% Japandi)
✓ TRUTH: Retake quiz button updates fingerprint and affects future suggestions
✓ TRUTH: All data encrypted, RLS on all tables
✓ TRUTH: No user data ever used to train AI models
✓ TRUTH: ATT prompt shown on first launch

DEVIATION FLAGS:
- Delete account leaves orphaned data = CRITICAL DEVIATION
- Style blend not visualized = DEVIATION
- No ATT prompt on first launch = DEVIATION

---

## GLOBAL RULES — Apply to Every Screen

✓ TRUTH: App color is deep navy (#0A1628)
✓ TRUTH: Cova logo used consistently — the arch mark + "cova" wordmark + tagline
✓ TRUTH: Style names NEVER shown to user (no Japandi, Coastal, Bohemian, etc.)
✓ TRUTH: Token balance (999) visible on every screen
✓ TRUTH: No white space ever visible in any room view
✓ TRUTH: All API keys in environment variables — never in client code
✓ TRUTH: No OrbitControls anywhere — crashes expo-gl
✓ TRUTH: No useState for camera state — useRef only

---

## AUDIT AGENT INSTRUCTIONS

At the start of every Claude Code session, run this audit:

1. Read CLAUDE.md and PRODUCT_TRUTH.md fully
2. Read every source file in apps/mobile/src/screens/
3. For every TRUTH item above, verify the implementation matches
4. For every DEVIATION FLAG, check if that condition exists
5. Run the full test suite
6. Produce a report with three sections:
   - CRITICAL DEVIATIONS (fix immediately)
   - HIGH DEVIATIONS (fix this session)
   - PASSING (matches PRODUCT TRUTH)
7. Do not fix anything — report only, then wait for instruction

A technically working feature that does not match PRODUCT TRUTH is still a bug.
