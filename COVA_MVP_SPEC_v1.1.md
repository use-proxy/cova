**COVA**

**MVP Product Specification**

The Definitive Build Document \| Version 1.1 \| March 2026

Daksh Parikh & Pranav Goel \| hellocova@gmail.com

github.com/pgoel813/cova \| Bundle ID: ai.cova.app

**CONFIDENTIAL --- DO NOT DISTRIBUTE**

**0. Document Purpose & Authority**

This is the single source of truth for Cova\'s MVP. Supersedes ALL prior documents: PRODUCT_TRUTH.md, BUILDGUIDE.md, any prior spec. Claude Code reads this at the start of EVERY session. This document wins over all other files in the repository without exception.

**North Star**

A user opens Cova, swipes through a personalized style quiz, uploads a photo of their room, and receives a photorealistic AI render of their room redesigned in their personal style --- with real purchasable furniture that matches the render and their taste. Magical, personal, effortless.

**NOT MVP --- Do Not Build**

- Discover/Explore social feed \| Realtor mode \| Designer marketplace

- Real token payments / Apple IAP / Stripe \| Light mode theme \| iPad support

- AR walkthrough scan \| Re-render from furniture arrangement \| Share Cova referral

- Style switching post-render \| Recreate This Room \| Percy visual regression

**1. Global Rules & Architecture**

**Locked Package Versions --- NEVER CHANGE**

  -----------------------------------------------------------------------
  **Package**                         **Version**
  ----------------------------------- -----------------------------------
  Expo                                \~52.0.49

  React                               18.3.1

  React Native                        0.76.x

  Three.js                            0.155.0

  \@react-three/fiber                 8.17.10

  Supabase JS                         2.x

  Zustand                             4.x
  -----------------------------------------------------------------------

**Hard Rules --- Never Violate**

- NO OrbitControls anywhere \| NO API keys in client code \| NO TypeScript \'any\'

- newArchEnabled: false \| userInterfaceStyle: dark \| isTablet: false

- All images: compress to 1024px wide / 0.8 JPEG quality before any upload or API call

- CLIP embeddings: always 768-dimensional \| useRef for camera/animation, not useState

- Only one panel open at a time --- opening chat dismisses product panel and vice versa

- All affiliate links open in SFSafariViewController --- never external browser

- Supabase email verification: DISABLED in Auth settings

**V0 Integration --- Required For All New UI**

Use V0 (v0.dev) for ALL new screens and significant UI components before Claude Code integrates. Always specify in V0 prompts: React Native + Expo + TypeScript + dark navy #0A1628 + gold #B8860B accents. Claude Code handles all Supabase and Zustand integration after V0 generates the component.

**Style Blend --- Single Source of Truth**

The quiz style blend drives EVERYTHING downstream. No exceptions. Never use a default or placeholder blend.

- FLUX prompt: weighted by blend ratio --- 60% coastal = 60% coastal language in prompt

- Anchor render: selected by true cosine similarity of style_weights vectors

- 3D furniture: filtered and ordered by style blend --- dominant style pieces loaded first

- Products: ranked by 70% CLIP similarity + 30% style blend match

- Chatbot: receives full blend in every system prompt, every single call

- Pipeline: quiz → blend → render → furniture → products → chat --- one continuous thread

**PostHog Analytics --- Required**

PostHog free tier integrated. Track these events at minimum:

- quiz_started, quiz_completed (with blend weights), quiz_timeout

- room_capture_completed (with method: lidar/three_photo/single/upload)

- render_generated, render_viewed, render_failed, render_retried

- product_panel_opened, product_pinned, product_unpinned, product_bought

- chat_opened, chat_message_sent, chat_action_triggered (with action type)

- arrange_opened, arrange_saved, arrange_reset

- auth_completed (with method: apple/google/email), auth_failed, account_deleted

**Global Error Handling**

- Supabase: 10s timeout → \'Having trouble connecting --- please try again\' + retry button

- Render fail: \'Something went wrong with your render\' + Try Again (no token cost) + Go Back

- No internet: subtle top banner \'No internet connection --- some features unavailable\', cached content still loads

- Auth fail: specific error message + retry + \'Use email instead\' link below

- Dead affiliate link: HEAD request before SFSafariViewController --- if 404 show \'This product is no longer available\'

- Claude API timeout: 30s → error message in chat thread + retry button

- GLB load fail: grey box placeholder with ! icon --- rest of room loads normally, never crashes

- Background render: AppState API polling continues --- navigate to render view immediately on return if complete

- Supabase down: friendly error screen, retry button

- Unsplash API down during quiz: serve first 50 cards from local device cache --- no blank screen ever

**2. Database & Backend**

**Supabase Config**

- Project ID: xdeacbmkdwqrwxonqaqh

- Email verification: DISABLED for MVP

- RLS: enabled on all tables

- Storage buckets: room-photos, renders, avatars

**Tables**

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Table**            **Key Fields**
  -------------------- --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  users                id, display_name, avatar_url, default_budget, units (metric/imperial), member_since

  rooms                id, user_id, name, type, style_blend jsonb, budget, render_url, render_history jsonb\[\], dimensions jsonb, furniture_positions jsonb, pinned_products jsonb, created_at, updated_at

  quiz_cards           id, image_url, style_weights jsonb, phase (pure/blend), room_type, discriminability_score

  products             id, name, price, retailer, affiliate_url, image_url, clip_embedding vector(768), style_weights jsonb, category, room_types text\[\], price_range

  chat_messages        id, room_id, user_id, role (user/assistant), content, action_trigger jsonb, created_at

  favorites            id, user_id, product_id, created_at

  pinned_products      id, room_id, product_id, glb_model_id, position jsonb

  glb_models           id, filename, style text\[\], room_type text\[\], category, price_range, dimensions jsonb, thumbnail_url, product_id

  token_transactions   id, user_id, action, amount, created_at
  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Edge Functions**

- render-room: photo + depth_map + style_blend + pinned_products → FLUX → render URL stored in Supabase

- match-products: style_blend + room_type + budget → CLIP match → ranked products (min 10 via threshold relaxation)

- chat-room: messages + room_context → Claude API → response + optional action_trigger JSON

- scrape-all: autonomous product catalog + GLB model scraping → logs to SCRAPING_LOG.md

- generate-embeddings: CLIP 768-dim embeddings for new products

**3. Product Catalog & 3D Assets**

**Product Database --- Target: 15,000-20,000**

Current: 3,136. Sources: Wayfair affiliate API, Amazon Product API, IKEA catalog scrape, CB2, West Elm, Article. All CLIP-embedded, style-tagged, room-typed. Total Replicate CLIP cost: \~\$4.50. Paid sources: post-MVP only.

**Autonomous Scraping Pipeline --- Zero Manual Intervention**

Command: npx ts-node scripts/scrape-all.ts & --- runs in background, overnight capable. All results logged to SCRAPING_LOG.md. Failures auto-logged and skipped. Rate limits handled with exponential backoff retry. You review SCRAPING_LOG.md in the morning --- no decisions needed during run.

- Poly Pizza API: 100 furniture GLBs --- no auth required, fully autonomous

- Sketchfab API: 100 furniture GLBs --- one-time free API key in .env, then fully autonomous

- Three.js GitHub examples: all furniture GLBs --- fully autonomous clone + filter

- IKEA AR assets: attempted 3 times --- if fails, logged and skipped, other sources compensate

- Wayfair/Amazon/CB2/West Elm/Article: targeted keyword queries per style per room type per price range --- overnight with auto-retry

**GLB Model Library --- Target: 200-300 Models**

Current: 43. Every GLB tagged with: style\[\], room_type\[\], category, price_range, dimensions (extracted from GLB geometry), thumbnail_url, product_id (linked to real purchasable product in products table).

- Categories: sofa, chair, coffee_table, side_table, dining_table, dining_chair, accent_chair, bed, dresser, nightstand, desk, bookshelf, floor_lamp, pendant_lamp, table_lamp, rug, mirror, plant, artwork

**Quiz Card Library --- Target: 923 Cards**

Current: 423. Audit all 423 first: label each as pure or blend, assign exact style_weights jsonb, remove low quality. Then add 500 new via Unsplash API (free, CC0 license, high quality editorial photography).

- 300 new pure cards: 60 per style (coastal, japandi, bohemian, mid_century, minimalist)

- 200 new blend cards: each labeled with exact blend ratio, e.g. {coastal:0.6, japandi:0.4}

- All cards tagged: image_url, style_weights jsonb, phase (pure/blend), room_type, discriminability_score

- All cards filtered strictly by room type --- bedroom quiz only shows bedrooms

- First 50 cards cached locally on app load as offline fallback for Unsplash API downtime

**4. Sprint System & Claude Code Instructions**

**Required Files --- Read At Start Of Every Session**

- SESSION_MEMORY.md --- location: \~/Desktop/cova/.claude/SESSION_MEMORY.md

- Records: what changed, what was tested, what failed and why, what is next

  - Read FIRST before any other file

- SPRINT_LOG.md --- location: repo root

  - Records: completed items, in-progress, skipped (with reason), spec completion %

- MVP_SPEC.md --- this document --- read after SESSION_MEMORY.md

**Sprint Prompt Template**

Read SESSION_MEMORY.md. Read MVP_SPEC.md. Read SPRINT_LOG.md. YOUR TASK: Fix these specific items from the spec: \[list items with exact acceptance criteria\]. For each item: implement → npx tsc \--noEmit → ./maestro-sim.sh \[relevant flow\] → if PASS: mark done in SPRINT_LOG.md → if FAIL after 3 attempts: log exact error and move on. When all done or wall hit: git add -A → git commit -m \'sprint: \[summary\]\' → git push origin main → update SPRINT_LOG.md and SESSION_MEMORY.md → STOP.

**Sprint Priority Order**

- Sprint 1: Apple/Google/email auth working on real device + style blend → render pipeline correct

- Sprint 2: Room capture (LiDAR 3-sprint plan + 3-photo + upload paths) + loading screen

- Sprint 3: Render view (panoramic FLUX model attempt + fallback + structural preservation tuning)

- Sprint 4: Product catalog expansion (scrape-all script) + CLIP embedding pipeline

- Sprint 5: 3D viewer visual improvements (wall color, floor, lighting, furniture placement Option C)

- Sprint 6: Product panel (full implementation + pin system across 3 spaces)

- Sprint 7: Chatbot (system prompt + all 4 action triggers + inline product cards)

- Sprint 8: Dashboard (masonry grid + hero render + V0 UI + all interactions)

- Sprint 9: Profile screen + style quiz improvements + quiz card library expansion

- Sprint 10: GLB model scraping + tagging + 3D viewer interactions (tap/drag/rotate/collision)

- Sprint 11: Edge cases + error handling + PostHog analytics + all global rules

- Sprint 12: Polish + all 5 Maestro smoke tests passing + final spec audit

**Maestro --- 5 Smoke Tests Only**

Run all 5 after every sprint. If any fail, fix before moving to next sprint. Archive flows 03, 06-15 --- do not run them.

- 01_splash_and_auth.yaml \| 02_style_quiz_precise.yaml \| 04_render_pipeline_precise.yaml

- 05_panorama_viewer_precise.yaml \| 14_returning_user_precise.yaml

**Key Commands**

- Start app: cd \~/Desktop/cova/apps/mobile && npx expo start \--dev-client

- TypeScript check: npx tsc \--noEmit

- Maestro: ./maestro-sim.sh apps/mobile/.maestro/flows/\[flow\].yaml

- Scraper: npx ts-node scripts/scrape-all.ts &

- Commit: git add -A && git commit -m \'sprint: \[description\]\' && git push origin main

**Test Credentials**

- New user: test.newuser@hellocova.com / CovaTest123!

- Returning user: test.returning@hellocova.com / CovaTest123!

- Returning user ID: aa19e895-0582-4947-bf65-5ca06ab65a89

- Returning user room ID: e1269ec5

- Simulator: iPhone 16e --- LiDAR NOT available in Simulator, use physical device for LiDAR testing

**5. Screen 1 --- Splash Screen & App Icon**

**App Icon (iPhone Home Screen)**

- Background: solid dark navy #0A1628

- Content: two gold arches ONLY --- no wordmark, no \'cova\' text, no tagline, nothing else

**Splash Screen**

- Dark navy background #0A1628

- Cova double-arch logo + \'cova\' wordmark + \'tinder for your home\' tagline --- all fade in over 2 seconds

- After fade: \'Create Account\' (gold filled) + \'Sign In\' (outlined) buttons spring up from bottom

- Returning signed-in users: skip splash entirely → Dashboard

**Acceptance Criteria**

- App icon on iPhone home screen: dark navy + two gold arches only, no text

- Splash fades in over 2 seconds --- logo, wordmark, tagline all visible

- Both buttons appear after fade completes

- Returning users never see splash

**6. Screen 2 --- Auth Screen**

**Layout --- Top to Bottom**

- Cova logo at top

- \'Continue with Apple\' button (white background --- App Store required)

- \'Continue with Google\' button (dark background)

- \'--- or ---\' text divider

- Email input field

- Password input field with show/hide toggle

- Gold submit button (label changes: \'Sign In\' or \'Create Account\')

- Link to toggle between Sign In and Create Account modes

**All Three Auth Methods Must Work**

- Apple Sign In: real Apple ID, Supabase OAuth, works end-to-end on physical device

- Google Sign In: real Google account, Supabase OAuth, works end-to-end on physical device

- Email/password: Supabase Auth --- email verification NOT required, disabled in Supabase settings

- Error handling: inline error message below form, specific text per error type, auto-dismisses 4 seconds

**Navigation After Auth**

- Returning users → Dashboard

- New users → Style Quiz directly --- no welcome screen

- No Forgot Password for MVP

- No email verification for MVP

**Acceptance Criteria**

- All 3 auth methods work end-to-end on physical device

- New users land on Style Quiz after auth

- Returning users land on Dashboard after auth

- Specific inline error shown on auth failure --- not generic

**7. Screen 3 --- Style Quiz**

**User Flows**

- New user: Room Entry → Instructions → Quiz → Budget Slider → Room Capture

- Returning user new room: Past Styles Page → pick past style (→ Budget Slider → Room Capture) OR Start Fresh (→ Instructions → Quiz → Budget Slider → Room Capture)

**Room Entry Screen**

- Room name field: OPTIONAL --- if blank auto-generates \'My \[Room Type\]\' e.g. \'My Living Room\'

- Room type selection: large visual tiles --- Living Room, Bedroom, Dining Room, Home Office, Kitchen, Bathroom, Entryway

- No budget slider on this screen --- budget captured separately after quiz

**Past Styles Page --- Returning Users --- Use V0**

- Shows each past room: AI render thumbnail + room name + style blend color bar + dominant style label

- \'Start Fresh\' option clearly available → Instructions → Quiz

- Tapping a past style: copies blend exactly, skips quiz entirely, goes to Budget Slider → Room Capture

- UI: clean, premium, masonry-style --- dark navy background, gold accents

**Instructions Screen**

- Simple explanation: swipe right = love it, swipe left = don\'t like it

- NO skip button --- cannot bypass instructions

- \'Start Swiping\' gold CTA button

**Quiz Algorithm --- Bayesian Preference Learning**

Every style starts at equal probability (0.2 each). After each swipe: Bayesian update using style_weights of the card. Right swipe multiplier: 0.6. Left swipe multiplier: 0.4. Next card selected by maximum information gain --- whichever unseen card most reduces uncertainty about user preferences. Algorithm scales to any number of styles with zero code changes.

- Phase 1 completion threshold: 0.60 confidence

- Phase 2 completion threshold: 0.65 confidence

- Minimum swipes before completion: 10

- Time limit: 2 minutes --- handleComplete(force=true) fires at timeout, bypasses all guards

- After swipe 10: fetch Phase 2 refinement cards targeting top 2 styles from Supabase

- isFetchingRefinementRef: blocks handleComplete while fetch is in-flight --- prevents race condition

- Render guard: if isFetchingRefinementRef is true AND currentIndex \>= cards.length → show loading spinner, NEVER call handleComplete from render function

- 3-second safety timer on fetchRefinementCard: if fetch takes \>3s, release isFetchingRefinementRef lock

**Card Interactions**

- Transitions: instant and clean --- no overlap, no fade, no phase between cards

- Preload next 3 cards in background while current card is displayed

- Back button: go back exactly one card --- new swipe overwrites old completely, blend reverts

- \'I\'m done\' button: appears subtly after minimum 10 swipes --- allows early exit if confident

- All cards filtered strictly by room type --- bedroom quiz shows ONLY bedroom cards

- First 50 cards cached locally on app load as offline fallback

**Budget Slider Screen**

- Separate screen immediately after quiz ends --- before Room Capture

- Single slider: \$500 minimum to \$10,000+ maximum

- Clean navy background, minimal UI, cannot be skipped

- Budget value saved to rooms table in Supabase

**Mid-Quiz App Close Handling**

- If user closes app mid-quiz and reopens: show prompt \'Continue your style quiz?\'

- \'Resume\' button: restores exact card index, blend state, swipe count

- \'Start Over\' button: resets quiz completely for this room

**Acceptance Criteria**

- Style blend shifts meaningfully from equal (0.2 each) based on swipe pattern

- Dominant style in final blend consistent with most right-swiped style

- Quiz never completes before 10 swipes

- Quiz always completes within 2 minutes via timeout

- Back button reverts blend to pre-swipe state correctly

- Cards load with zero visible lag --- preloading working

- Budget slider saves value to Supabase rooms table

- Returning user past style selection skips quiz, copies blend exactly

- Resume after mid-quiz close restores exact state

**8. Screen 4 --- Room Capture**

**Option Selection Screen**

- LiDAR devices (iPhone 12 Pro and above): Scan Room (gold, primary) \| 3-Photo Capture \| Single Photo/Upload

- Non-LiDAR devices: 3-Photo Capture (gold, primary) \| Take Single Photo \| Upload from Library

**Path 1 --- LiDAR Scan**

- Guidance tips screen: 3 tips auto-advancing every 2 seconds --- cannot skip

  - Tip 1: \'Stand in the doorway of your room\'

  - Tip 2: \'Make sure all walls are visible\'

  - Tip 3: \'Good lighting gives the best results\'

  - \'Got it, let\'s scan\' gold button appears after all 3 tips

- RoomPlan scan: Apple RoomPlan framework handles all scan UI --- real-time room outline builds

- Auto-completes when sufficient coverage detected --- user taps confirm

- Preview: full screen capture image, room name label, single gold \'Start Redesign\' button

- Server validation: is it a room? sufficient light? image sharp enough?

- Error messages: exceedSceneSizeLimit → \'Please restart the scan\'; worldTrackingFailed → \'Move to a well-lit area with visible texture\'; low light → \'Turn on more lights\'; mirrors → \'Cover mirrors before scanning\'; 60s timeout → auto-fallback to 3-photo with \'Room scan unavailable --- let us use photos instead\'

**LiDAR Integration --- 3-Sprint Plan**

Sprint 1: Read project.pbxproj + app.json + RoomPlanModule.swift + RoomPlanModule.m fully. Fix all 4 known failure points: (1) Swift files missing from Xcode project --- edit project.pbxproj to register both files; (2) iOS deployment target below 16.0 --- set to 16.0 in Podfile and app.json; (3) New Architecture conflict --- verify newArchEnabled is false; (4) Session not released between scans --- stop() + nil before every new session. Rewrite RoomPlanModule.swift with bulletproof implementation handling all known errors. Rebuild on physical device.

Sprint 2: You test 6 scenarios on physical LiDAR device and report results: (1) normal lit room; (2) low light room; (3) room with mirrors; (4) scan cancelled mid-way; (5) two scans in a row; (6) non-LiDAR device --- LiDAR option hidden. Claude Code fixes any failures.

Sprint 3: Polish + fallback verification + Maestro smoke test on Simulator.

*NOTE: Bulletproof fallback: try/catch around ALL LiDAR code. On any error → auto-fallback to 3-photo with friendly message. App NEVER crashes from LiDAR failure.*

**Path 2 --- 3-Photo Guided Capture**

- Introduction screen: \'We will take 3 quick photos to understand your room.\' + numbered circles 1,2,3 + gold \'Start\' button

- Photo 1 --- Doorway Shot:

  - Static top-down position diagram (simple floor plan sketch showing user standing in doorway)

  - Text: \'Photo 1 of 3 --- Stand in the doorway\' \| Subtext: \'Fit the whole room in frame\'

  - Two real-time checks shown as small indicators: Light level (pixel brightness) + Horizontal (gyroscope 15 degree tolerance)

  - Gold \'Take Photo\' button pulses green when both checks pass

  - Confirmation: \'Looks Good\' (gold) / \'Retake\' (outlined)

- Photo 2 --- Left Corner Shot:

  - Diagram: user moved to left side facing right corner

  - \'Photo 2 of 3 --- Move to the left side\' \| Same two checks

  - \'Use single photo instead\' escape hatch --- uses Photo 1, skips Photo 3, goes to preview

  - Back button → returns to Photo 1 camera for retake

- Photo 3 --- Right Corner Shot: same pattern, same escape hatch

- Summary screen: 3 thumbnails in a row + \'Perfect --- we have everything we need.\' + gold \'Start Redesign\' button

- Server processing: Depth Pro runs independently on each of 3 images → merge 3 depth maps weighted toward Photo 1 → unified depth map → FLUX ControlNet input. Photo 1 = primary render reference AND the BEFORE image. Room dimensions extracted for BoxRoom sizing and 2D floorplan generation.

**Path 3 --- Single Photo / Upload**

- Camera: light + horizontal checks in real-time → gold Take Photo button → full-screen confirm → validation → loading

- Upload: photo picker → full-screen confirm with \'Use This Photo\' (gold) / \'Choose a Different Photo\' → validation → specific error if fails → loading

- Validation errors (specific, not generic): \'This photo is too dark --- turn on more lights\'; \'This does not look like a room --- try again\'; \'This photo is too blurry --- hold steady\'

- No guidance tips for upload path --- confirmation screen handles quality feedback

- ALL photos: compressed to 1024px wide / 0.8 JPEG quality before any upload or API call

**Acceptance Criteria**

- LiDAR option shown only on LiDAR-compatible devices

- LiDAR scan completes and navigates to preview screen

- LiDAR fallback to 3-photo is graceful --- friendly message, app never crashes

- Light and horizontal checks work in real-time on camera screen

- Escape hatch on Photo 2 uses Photo 1 as single photo correctly

- Back button on Photo 2 returns to Photo 1 camera for retake

- Server validation rejects bad photos with specific friendly messages

- All photos compressed to 1024px/0.8 before upload --- verified in code

**9. Screen 5 --- Loading Screen**

- Dark navy background \| Cova arch logo centered \| Nothing else visible initially

- Soft pulsing glow animation behind arch: logo breathes in and out slowly, continuously

- 6 stage text cycles on fixed timer --- text unchanged from current implementation

- Design tips rotate at bottom every 8 seconds: interesting interior design facts --- not quirky, not promotional

- Background render polling: continues via AppState API when app backgrounded

- On app return: if render completed → navigate to render view immediately, skip remaining stages

- Render failure: show retry screen --- \'Something went wrong with your render\' + \'Try Again\' (no token cost) + \'Go Back\'

**Acceptance Criteria**

- Pulsing arch animation runs without frame drops

- Design tips rotate every 8 seconds

- Background polling works --- return to app shows render view if ready

- Render failure shows retry screen --- token NOT deducted on failure

**10. Screen 6 --- Render View**

**Top Bar**

- Back arrow (left) → Dashboard, navigation stack cleared (no back to loading screen)

- Room name (center)

- Token balance: static 999 (right) --- no decrement for MVP

**First Render Celebration --- One-Time Only Per User**

- Fires on the very first render a user ever generates --- never again

- Gold confetti burst: 1 second

- Overlay text: \'Your first design is ready\'

- Auto-dismisses after 2 seconds --- no user interaction needed

**Panoramic View --- Primary Content**

PRIMARY ATTEMPT: Switch render-room edge function to use an equirectangular panoramic FLUX model. Pass original room photo as image-to-image reference (denoising_strength: 0.60) + unified depth map as ControlNet. Model generates true 360 degree equirectangular image (2:1 ratio, e.g. 4096x2048px). PanoramaViewer.tsx loads this onto sphere: camera at \[0,0,0\], radius 500, scale \[-1,1,1\] for inward normals. User placed inside sphere --- drag left/right/up/down to look around 360 degrees. Smooth, immersive, no distortion.

FALLBACK (if no suitable panoramic model found after 2-3 model iterations): Keep current FLUX model but severely improve sphere projection --- higher resolution render, better equirectangular mapping, wider field of view. Must feel significantly more immersive than current implementation.

**Structural Preservation**

- denoising_strength: 0.60 --- balances style application with structural preservation

- Explicit FLUX prompt instruction: \'preserve original wall colors, preserve ceiling height, preserve window positions, preserve door positions, preserve room architecture, do not repaint walls\'

- Expected accuracy: \~70% --- wall colors close but not exact, structure approximately maintained

- Acceptable for MVP --- test and tune denoising value if needed

**Furniture In Render View**

- Furniture is BAKED into the panoramic render by FLUX --- part of the photorealistic image

- Furniture matches the style blend --- heavier weight = more of that style\'s furniture

- Furniture is NOT interactive/tappable in the render view --- baked into flat image

- Pinned products added to FLUX prompt with \'must include\' language --- FLUX generates similar items

**Multiple Renders Per Room**

- Most recent render = primary --- shown on dashboard card and in render view by default

- ALL renders stored in render_history jsonb array in Supabase rooms table

- Previous renders row: horizontal scroll at bottom of render view --- tap to restore (no API call, no token)

**HUD --- 5 Buttons --- Auto-hides After 3 Seconds**

- Tap screen anywhere to reveal HUD --- auto-hides again after 3 more seconds of inactivity

- Arrange → navigates to 3D Viewer / Arrange screen

- Compare → exits panorama → flat Before/After slider (see Compare Feature below)

- Shop → product panel slides up from bottom

- Regenerate → shows confirmation sheet (see Regenerate below)

- Save → saves render URL to Cova profile --- no camera roll, no share sheet for MVP

- \'\...\' More button → Share (iOS share sheet with render image), 2D Floorplan view

**Floating Chat Button --- Always Visible**

- Gold chat bubble icon, bottom right corner, outside HUD --- never hidden by HUD auto-hide

- Only entry point to chatbot --- no chat button in the 5-button HUD bar

- Tapping → chatbot panel slides up

**Compare Feature --- Before/After Slider**

- Exits panorama view entirely

- Full screen flat Before/After slider

- BEFORE side: original room capture photo (Photo 1)

- AFTER side: AI render flat version

- Draggable vertical divider --- drag left/right

- \'BEFORE\' label on left side, \'AFTER\' label on right side

- \'Back to View\' button → returns to panorama

**2D Floorplan View**

- Accessible from \'\...\' more menu

- Top-down room layout generated from depth map data

- Shows approximate room dimensions and furniture positions

- Matches furniture arrangement from 3D viewer if user has arranged furniture

- \'Back to View\' button → returns to panorama

**Regenerate**

- Confirmation sheet slides up: \'Generate a new design? This will use 1 token.\'

- \'Regenerate\' button (gold) + \'Cancel\' button

- Token balance shows 999 --- no decrement for MVP

- Pinned products persist automatically --- no re-pinning needed

- New render replaces current as primary, old render added to render_history

**Acceptance Criteria**

- Panoramic sphere renders without visible stretching --- user feels inside the room

- 360 degree drag works smoothly in all directions

- Wall colors approximately match original room photo

- Room structure (walls, windows, doors) approximately preserved

- HUD auto-hides after 3s --- tap reveals --- auto-hides again

- All 5 HUD buttons function correctly

- Compare slider shows original photo on BEFORE, render on AFTER

- Previous renders row shows and tap restores without new API call

- Save button saves render URL to profile --- no camera roll

- Floating chat button always visible regardless of HUD state

- First render celebration shows only once, auto-dismisses 2s

- Back arrow always navigates to Dashboard with stack cleared

**11. Screen 7 --- 3D Viewer / Arrange**

**Entry & Exit**

- Entered from Arrange button in HUD

- Done button: saves all furniture positions + rotations to Zustand store → navigates back to render view

- Option A (primary): 3D viewer IS the arrangement preview --- user sees their arranged room in 3D

- Option C (fallback): if 3D viewer quality insufficient → ViewShot screenshot from doorway position → shown as \'My Arrangement\' tab alongside original render --- user toggles between \'AI Design\' and \'My Arrangement\'

**Visual Quality --- Close The Gap With FLUX Render**

- Wall color: sample dominant color from FLUX render image → paint BoxRoom walls exact same color → store in Supabase rooms table

- Floor texture per style blend (style-matched assets):

  - Coastal → light bleached wood \| Japandi → warm medium oak

  - Bohemian → dark reclaimed wood \| Mid-Century → warm walnut \| Minimalist → light grey concrete

- Lighting: one point light simulating window (warm, positioned on main wall) + soft ambient fill light + shadows enabled on all furniture pieces

- SSAO (Ambient Occlusion): already exists --- tune for realistic depth without performance impact

- Ceiling plane: simple flat geometry at room height with slight shadow casting

- Baseboards: thin geometry strips along all wall bases

- HDR environment map: attempt for furniture surface reflections --- skip if causing performance issues

- Goal: clearly the same room, clearly same style as FLUX render. Not indistinguishable --- that is acceptable for MVP.

**Furniture Placement --- Option C Hybrid**

- Primary (Option A): send FLUX render image to Claude vision API with prompt asking for furniture positions as relative room coordinates JSON. Convert relative positions to 3D coordinates using room dimensions from depth map. Place closest matching GLB models at those positions.

- Fallback (Option B): if vision API fails or returns low confidence --- load pre-defined smart furniture layout for this room type + style blend combination. Furniture looks reasonable even if it does not exactly match render.

- GLB matching: for each detected furniture item, find closest GLB by: category match → style tag match → CLIP similarity between GLB thumbnail and render crop of that area.

**Camera**

- Eye level locked: 1.6m height constant --- cannot be dragged to floor or ceiling

- FOV limits: 40 degree minimum (zoomed in) / 90 degree maximum (wide angle)

- Pan by dragging, pinch to zoom --- camera stays inside room boundary at all times

- \'View from Doorway\' button (top right corner): resets camera to doorway position at eye level --- same angle as original render

**Furniture Interactions**

- Tap to select: gold outline appears around selected piece

- Product info pop-up slides up from bottom:

  - Product image \| Product name \| Price \| Retailer name

  - \'Buy Now\' button → affiliate link in SFSafariViewController

  - \'Move\' button → enters drag mode \| Dismiss button

- Drag to move: tap Move OR long press → furniture lifts 5% + subtle gold glow → follows finger on floor plane → tap elsewhere to place

- Wall collision: furniture centroid cannot be placed within 10cm of any wall boundary

- Floor boundary: furniture centroid must remain inside room polygon --- snaps to last valid position if dragged outside

- Furniture-to-furniture collision: attempt to implement --- skip if causing performance issues or complexity

- Two-finger rotate: selected furniture rotates on vertical axis --- snaps to 45 degree increments

- Undo button (top left, arrow icon): reverts last furniture move or rotation --- single level only

- Reset button: reverts ALL furniture to original Option C placement --- confirmation required: \'Reset arrangement? / Reset / Cancel\'

- Floor grid: small toggle button --- subtle graph paper grid on floor --- off by default --- helps with spacing

- Ceiling height indicator: subtle horizontal line on all walls at ceiling height --- always visible

- Style chips: REMOVED --- not shown in arrange screen

**Product Swap From Panel**

- User can open product panel from within 3D viewer via \'Browse Similar\' on any furniture pop-up

- Tapping a different product in the panel immediately swaps the GLB model in the 3D viewer

- No need to return to arrange screen --- swap is instant

- Swap is undoable via undo button

**Acceptance Criteria**

- Wall color in 3D viewer matches wall color extracted from FLUX render

- Floor texture matches style blend correctly

- Furniture approximately placed where FLUX render shows furniture

- Tap selects furniture with gold outline + product pop-up with correct data

- Drag moves furniture on floor plane --- respects wall collision and floor boundary

- Two-finger rotate works in 45 degree snaps

- Undo reverts last action correctly

- View from Doorway resets camera to doorway angle at eye level

- Camera stays at 1.6m height, cannot exit room boundary

- Style chips not visible anywhere in this screen

**12. Screen 8 --- Product Panel**

**Entry Points**

- Render view: Shop button in HUD → panel slides up from bottom

- 3D viewer: tap furniture → product pop-up → \'Browse Similar\' → filtered panel

- 3D viewer: product panel open → tap different product → GLB swaps immediately in viewer

**Panel Structure --- Dark Navy Background**

- Search bar at top: real-time filter by keyword, retailer name, price --- instant results

- Price range filter slider: manual price range control independent of budget setting

- Retailer filter chips (horizontal scroll): Wayfair \| Amazon \| IKEA \| CB2 \| West Elm \| Article

- Category tabs (horizontal scroll): All \| Sofas \| Chairs \| Tables \| Beds \| Lighting \| Rugs \| Accessories

- Auto-filter by budget: products over user\'s budget shown last, slightly de-emphasized, \'Over Budget\' tag

- Sort by style match score: highest match score first --- most relevant to user\'s blend at top

- Style match indicator: colored bar under each product card image --- gold = high match, grey = lower

- \'In Your Room\' badge: products currently placed in 3D viewer render

- \'Featured in Design\' badge: pinned products that FLUX included in the render

- Recently Viewed row: last 5 products tapped --- horizontal scroll --- \'Recently Viewed\' label

- Pinned Items section: appears when 1+ items pinned --- horizontal scroll at very top --- gold pin badges

- Progressive threshold relaxation: if 0 products match all filters, relax style threshold until minimum 10 shown --- show \'Showing closest matches to your style\'

- Pagination: 12 products per load --- infinite scroll loads 12 more on reaching bottom

**Product Info Pop-Up**

- Large product image (full width)

- Product name

- Price --- \'Over Budget\' warning label if above user\'s budget setting

- Retailer name

- Style match score as percentage

- \'Buy Now\' gold button → HEAD request check first → SFSafariViewController (never external browser)

- \'Pin to My Room\' button (gold pin icon) --- disabled and greyed if 3 already pinned

- \'Save to Favorites\' button --- saves to persistent favorites list

- \'Browse Similar\' button --- filtered panel: same category, similar style score

- Dismiss button

**Pin System --- Maximum 3 Pins Per Room**

- Product Panel: gold pin badge on card, floats to Pinned Items section at very top

- Render View: pinned items added to FLUX prompt with \'must include \[item description\]\' language --- FLUX generates visually similar item --- \'Featured in Design\' badge in panel after render

- 3D Viewer: closest matching GLB auto-selected via CLIP thumbnail similarity --- gold pin icon floats above piece --- can move and rotate but CANNOT be deleted without unpinning first --- other furniture arranges around pinned items

- Pins persist on every Regenerate automatically --- user never needs to re-pin

- Unpin: tap gold pin badge --- removes from all 3 spaces

**My Favorites --- Persistent**

- Accessible from Profile screen

- Persistent across all rooms and all sessions

- User can pin any favorite directly to a new room from Profile

- Never deleted unless user manually removes

**Acceptance Criteria**

- Products auto-filtered by room type + budget on every open

- Style match score correctly ranks products --- most relevant to user\'s blend appears first

- Category tabs filter list correctly \| Search filters in real-time

- Pin system works across all 3 spaces: panel badges, FLUX prompt, 3D viewer GLB

- Maximum 3 pins enforced --- Pin button disabled when 3 already pinned

- Pins persist automatically on Regenerate --- no re-pinning needed

- Buy Now opens in SFSafariViewController after HEAD request check

- Dead affiliate links show \'product no longer available\' message

- Favorites persist across sessions and across rooms

- Pagination loads 12 more products on scroll to bottom

**13. Screen 9 --- Chatbot**

**Entry & Layout**

- Floating gold chat bubble --- bottom right of render view --- always visible, never hidden

- Only entry point to chatbot --- no HUD chat button

- Panel slides up from bottom: 60% screen height by default --- drag up handle to expand to full screen

- Keyboard handling: input field always remains visible above keyboard when keyboard is open

- 500 character limit on input field --- character counter shown when user reaches 400 characters

- Dark navy background \| User messages: right-aligned, gold bubble \| Claude responses: left-aligned, dark grey bubble

**System Prompt --- Included In Every Single API Call**

You are Cova\'s interior design advisor helping a user redesign their \[room_type\]. Their style blend: \[weighted breakdown e.g. 60% Coastal, 40% Japandi\]. Budget: \[\$budget_range\]. Room dimensions: \[width x depth x height from depth map\]. Current furniture in their 3D viewer: \[list of GLB model names and positions\]. Pinned products: \[list of pinned product names\]. Renders generated for this room: \[count\]. Last render prompt used: \[prompt_text\]. Give specific, actionable interior design advice personalized to THIS exact room. Never give generic advice. Always reference their specific style blend, furniture, and room in your response. Available actions you can trigger: REGENERATE (generates new render), ADJUST_BLEND: \[new_weights\] (adjusts style blend then regenerates), OPEN_SHOP (opens product panel), PIN_PRODUCT: \[product_id\] (pins a specific product).

**Conversation Starters --- First Open Per Room Only**

- 4 tappable suggestion chips shown when chat opens for first time on a room:

  - \'What furniture should I add?\' \| \'Make it feel more cozy\'

  - \'What is my color palette?\' \| \'Show me products under \$500\'

- Disappear immediately after user sends first message --- never shown again for that room

**Persistent Conversation History**

- Every message saved to Supabase chat_messages table with room_id

- Full conversation history loads when user reopens chat for same room

- Scrollable back through entire history

- History persists until room is deleted

**Action Triggers --- All 4 Required**

- REGENERATE: chatbot response includes this → confirmation card appears in chat thread:

  - \'Generate a new design? This will use 1 token.\' \| \'Yes, do it\' / \'Not now\' buttons

  - \'Yes, do it\' → triggers full render pipeline → loading screen → new render

- ADJUST_BLEND: chatbot proposes new style weights → confirmation card in chat thread:

  - Shows proposed new blend e.g. \'Adjust to 70% Coastal, 30% Japandi?\'

  - \'Yes, adjust\' → updates style_blend in Supabase + triggers new render (1 token shown)

  - \'Not now\' → dismissed, blend unchanged

- ADJUST_BLEND behavior: permanently updates style_blend in Supabase rooms table for this room --- not just for this render

- OPEN_SHOP: immediately opens product panel filtered by chatbot\'s suggestion --- no confirmation, no token

- PIN_PRODUCT \[id\]: shows confirmation in chat: \'Pin \[product name\] to your room?\' → Yes / No --- no token

*NOTE: REGENERATE and ADJUST_BLEND ALWAYS require explicit user confirmation before executing. Chatbot NEVER spends tokens without user tapping Yes.*

**Inline Product Cards**

- When chatbot response suggests a specific product type (e.g. \'you should add a jute rug\'):

  - Automatic search runs in background against product catalog

  - Top matching product shown as inline card inside chat thread

  - Card shows: product image, name, price, style match score

  - \'View\' button → opens product info pop-up \| \'Pin\' button → pins directly from chat

  - If no matching product found → chatbot suggests user search manually in Shop

**Typing Indicator & Timeout**

- Three animated gold dots shown while Claude API is processing --- appears immediately on send

- 30 second API timeout: if exceeded → error message in chat thread: \'Having trouble thinking --- please try again\' + retry button

**Acceptance Criteria**

- System prompt includes full room context on every single API call

- Conversation starters disappear after first message --- never shown again

- Full conversation history loads correctly on reopen

- All 4 action triggers parse correctly from response and execute

- REGENERATE and ADJUST_BLEND require explicit user confirmation --- no automatic token spending

- ADJUST_BLEND permanently updates style_blend in Supabase

- Inline product cards appear when chatbot recommends specific product type

- 30 second timeout shows error message with retry button

- 500 character limit enforced --- counter shown at 400

**14. Screen 10 --- Dashboard**

**Tab Bar --- 3 Tabs, Always Visible**

- Home (left) --- rooms and dashboard \| Inspiration (center) --- Coming Soon for MVP \| Profile (right)

**Top Bar**

- Cova logo (left) \| Settings gear icon (right) → navigates to Profile screen

- No notification bell for MVP

**Time-of-Day Greeting --- Below Top Bar**

- 6am-12pm: \'Good morning, \[first name\]. Ready to design?\'

- 12pm-6pm: \'Welcome back, \[first name\].\'

- 6pm-12am: \'Good evening, \[first name\].\'

- Gold text, lightweight font, one line

**Hero Render --- Use V0 --- Most Important Visual**

- Full width, approximately 40% screen height

- Shows most recent room\'s AI render thumbnail --- NOT the original capture photo

- Render image fills edge to edge --- no padding, no border

- Gradient overlay at bottom (dark to transparent) for text readability over image

- Overlaid at bottom: room name (white, bold, left) + style blend color bar + dominant style label

- Gold \'Continue\' button (bottom right of card) → that room\'s render view

- Tapping anywhere on hero card → that room\'s render view

- Empty state if user has no rooms: large Cova arch logo + \'Your first design is waiting\' in gold + gold \'Design Your First Room\' button + subtle animated gradient background

**Quick Style Filter --- Below Hero**

- Horizontal scrollable chips: All \| Coastal \| Japandi \| Bohemian \| Mid-Century \| Minimalist

- \'All\' selected by default --- gold background when selected, outlined when not

- Tapping a chip filters the masonry grid to show only rooms with that dominant style

**New Room Button --- Full Width Gold**

- Label: \'Design a New Room\' with + icon

- Tap → Past Styles Page (returning user flow from Screen 3)

**Continue Designing Prompt --- Conditional**

- Shown only if a room exists with no completed render (capture done, render not generated or failed)

- Full width card with gold border

- Shows original capture photo thumbnail + \'Continue where you left off --- \[room name\]\'

- Gold arrow button → navigates back into render pipeline for that room

- Dismissable with X --- dismissed state persists in session

**Masonry Grid --- Use V0**

- Two-column Pinterest-style layout --- cards of varying heights

- Rooms ordered most recent first

- Pagination: 12 rooms per load --- infinite scroll loads 12 more on reaching bottom

- Each card: AI render thumbnail fills card completely (not original photo) + room name overlaid bottom-left white + style blend color bar at bottom + date bottom-right small + rounded corners + subtle drop shadow

- Staggered entrance animation: cards fade-up with 50ms stagger delay between each card

- Tap card → render view for that room

- Long press card → context menu with 3 options:

  - \'Rename Room\' → inline text field appears on card, pre-filled with current name, save on \'Done\'

  - \'Duplicate Style\' → copies style blend exactly, skips quiz, goes to Budget Slider → Room Capture

  - \'Delete Room\' → confirmation: \'Delete \[room name\]? This cannot be undone.\' → Delete (red) / Cancel

**Pull To Refresh \| Inspiration Tab = Coming Soon**

- Pull down → refreshes room list from Supabase \| Standard iOS pull-to-refresh indicator

- Inspiration tab: navy background, Cova logo, gold \'Coming Soon\' text --- no other functionality for MVP

**Acceptance Criteria**

- Dashboard cards show AI render thumbnails --- NOT original capture photos

- Hero render shows most recent room correctly with correct overlay text

- Empty state shows for users with zero rooms

- Time-of-day greeting correct for user\'s first name and current time

- Style filter chips filter masonry grid in real-time

- Long press: all 3 actions work --- rename (inline), duplicate style (skips quiz), delete (confirmed)

- Continue Designing prompt shows only for incomplete rooms

- Pagination: 12 rooms, infinite scroll loads 12 more

- Pull to refresh updates room list from Supabase

**15. Screen 11 --- Profile Screen**

**Profile Header**

- Circular avatar: shows user initials by default --- tappable to upload photo from camera roll → saved to Supabase avatars bucket

- Display name: tappable to edit inline --- keyboard opens, saves on return/done

- Email address: displayed but not editable, muted grey

- Member since date: small text below email

**My Favorites Section**

- Horizontal scroll row of saved product cards --- same card design as product panel

- \'View All\' button → full screen favorites list with filtering and sorting options

- Empty state: heart icon + \'Save products you love while designing\'

**My Style Section --- Requires Minimum 2 Rooms**

- If fewer than 2 rooms: placeholder text \'Design more rooms to discover your overall style\' + \'Design New Room\' button

- If 2+ rooms: combined style blend bar showing average blend across all rooms

- Headline: \'\[Dominant Style\]-\[Second Style\] Designer\' e.g. \'Coastal-Japandi Designer\'

- Subtext: \'Based on \[N\] rooms designed\'

- Individual style percentage breakdown below bar

- \'Retake Style Quiz\' button: starts a new quiz session that updates their overall style profile blend

**Design History**

- 2x2 stat grid: Rooms Designed \| Renders Generated \| Products Saved \| Styles Explored

- Style chips row below grid: one chip per unique dominant style used across all rooms --- tappable → filters dashboard to that style

**Settings Section**

- Default Budget: shows current value --- tap → slider sheet overlay → save → applies to ALL future new rooms (not retroactive to existing rooms)

- Notifications: toggle switch --- off by default --- cosmetic only for MVP (nothing actually sends)

- Style Preferences: \'Retake Style Quiz\' with chevron → same as My Style retake button

- Units: \'Metric / Imperial\' two-option toggle --- affects room dimension display throughout app

**Token Balance Section**

- Large prominent token count: static 999 for MVP

- Gold token icon next to number

- \'Get More Tokens\' gold button → shows \'Coming Soon --- stay tuned!\' sheet for MVP

- Transaction history list below: action description + date + amount --- most recent first

- Example: \'Welcome bonus --- March 20 --- +5 tokens\' \| \'Room render --- March 26 --- -1 token\'

**Account Management --- Ordered Least to Most Destructive**

- \'Change Password\': shown for email/password accounts only --- NOT shown for Apple/Google auth users

- \'Sign Out\': gold outlined button --- signs out immediately

- \'Delete Account\': small red text at bottom --- tap → confirmation sheet:

  - \'This will permanently delete all your rooms, renders, and designs. This cannot be undone.\'

  - \'Delete My Account\' button (red filled) + \'Cancel\' button

  - On confirm: delete ALL user data from Supabase → sign out → navigate to Splash screen

**App Information --- Bottom of Screen**

- App version: 1.0.0

- \'Privacy Policy\' link → SFSafariViewController (URL to be confirmed before App Store submission)

- \'Terms of Service\' link → SFSafariViewController

- \'Contact Support\' → opens iOS email compose to hellocova@gmail.com

**Acceptance Criteria**

- Avatar upload saves correctly to Supabase and displays

- Display name inline edit saves correctly to Supabase

- My Style section: shows placeholder if \<2 rooms, shows combined blend if 2+ rooms

- Default budget saves and pre-fills budget slider in all future new rooms

- Delete account removes ALL user data from Supabase and returns to splash screen

- Favorites section shows products saved from product panel

- Transaction history shows correct entries

**16. Screen 12 --- Token Economy (MVP: Static)**

- Token balance: static 999 displayed everywhere --- render view top bar, profile screen --- no decrement

- No payment processing --- no StoreKit, no Stripe, no Apple IAP for MVP

- Regenerate confirmation still says \'This will use 1 token\' --- UX pattern correct for future real payments

- \'Get More Tokens\' button → \'Coming Soon --- stay tuned!\' sheet --- no purchase flow

- Post-MVP plan: Model C hybrid --- 5 free tokens on signup + token packs (pay per use) + subscription tiers (\$15/\$29/\$49/month) via Apple In-App Purchase with server-side receipt validation

**17. Edge Cases & Error Handling**

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Edge Case**                   **Handling**
  ------------------------------- -----------------------------------------------------------------------------------------------------------------------------------
  Render fails                    Retry screen: \'Something went wrong\' + \'Try Again\' (no token cost) + \'Go Back\'

  No internet                     Subtle top banner \'No internet connection --- some features unavailable\'. App loads, cached content shows, new renders blocked.

  Apple/Google auth fails         Specific error message + Retry button + \'Use email instead\' link below

  Dead affiliate link             HEAD request before SFSafariViewController --- if 404 show \'This product is no longer available\'

  GLB model fails to load         Grey box + ! icon shown instead --- rest of room loads normally --- never crashes

  App reinstall                   All rooms, renders, favorites restored from Supabase on sign-in --- nothing stored locally only

  Supabase timeout (10s)          Friendly error: \'Having trouble connecting --- please try again\' + retry button

  Claude API timeout (30s)        Error in chat thread: \'Having trouble thinking --- please try again\' + retry button

  Mid-quiz app close              On reopen: \'Continue your style quiz?\' → Resume (restores exact state) / Start Over

  LiDAR scan fails                Auto-fallback to 3-photo capture with friendly message --- app NEVER crashes

  Background render               AppState API polling continues --- navigate to render view immediately on app return if complete

  Zero products match filters     Progressive threshold relaxation until min 10 shown --- \'Showing closest matches to your style\'

  Only 1 room (My Style)          Placeholder: \'Design more rooms to discover your overall style\' + Design New Room button

  Unsplash API down during quiz   Serve cached 50 local cards --- never show blank card or broken quiz

  Room name left blank            Auto-generate: \'My Living Room\', \'My Bedroom\' etc. based on selected room type

  Small room captured             Same handling as large rooms for MVP --- no special case

  Hero render empty (no rooms)    Full empty state: arch logo + \'Your first design is waiting\' + \'Design Your First Room\' button
  -------------------------------------------------------------------------------------------------------------------------------------------------------------------

**18. Implementation Confidence Matrix**

All features at or above 85% are implemented. Features below 85% are attempted with documented fallbacks --- fallback always protects the MVP experience.

  ------------------------------------------------------------------------------------------------------------
  **Feature**                          **Confidence**  **Fallback / Notes**
  ----------------------------------- ---------------- -------------------------------------------------------
  Apple Sign In                           **85%**      Email/password always available as fallback

  Google Sign In                          **85%**      Email/password always available as fallback

  Bayesian quiz algorithm                 **90%**      Fixed phase algorithm as fallback

  Card preloading --- no lag              **90%**      Reduce preload count if memory issues

  LiDAR RoomPlan integration              **70%**      Auto-fallback to 3-photo --- app never crashes

  3-photo depth map merging               **80%**      Single photo Depth Pro only

  Panoramic FLUX model switch             **70%**      Improved sphere projection of flat render

  Structural preservation tuning          **88%**      Iterate denoising value --- best effort 70%

  Vision API furniture placement          **80%**      Smart layout fallback (95% confidence)

  Wall color extraction from render       **85%**      Default style-matched color per blend

  Furniture-to-furniture collision        **75%**      Attempt --- skip if problematic, wall collision stays

  HDR environment map                     **75%**      Attempt --- skip if performance issues

  Pin system across 3 spaces              **88%**      Panel + 3D only if render prompt pin fails

  Inline product cards in chat            **85%**      Text-only product suggestions

  Masonry grid layout                     **88%**      Standard vertical list fallback

  Product catalog 15-20k items            **90%**      Keep current 3,136 if scraping pipeline fails

  GLB models 200-300                      **88%**      Keep current 43 if scraping fails

  2D floorplan generation                 **82%**      Hide 2D view option if not implementable

  All other features                      **90%+**     No fallback needed
  ------------------------------------------------------------------------------------------------------------

**19. CLAUDE.md Rules --- Non-Negotiable**

**Never Do**

- Change any locked package version --- not for any reason

- Add OrbitControls anywhere in the codebase

- Put API keys, secrets, or tokens in client-side code

- Use TypeScript \'any\' type

- Change newArchEnabled to true

- Remove the try/catch LiDAR fallback --- app must never crash from LiDAR

- Skip image compression before upload

- Call handleComplete() from the render function in quiz

- Open affiliate links in external browser --- always SFSafariViewController

- Make product decisions without flagging in SPRINT_LOG.md

**Always Do**

- Read SESSION_MEMORY.md → MVP_SPEC.md → SPRINT_LOG.md at session start --- in that order

- Run npx tsc \--noEmit after every significant code change

- Run relevant Maestro flow after every fix to validate

- Commit with descriptive message after completing each sprint

- Update both SPRINT_LOG.md and SESSION_MEMORY.md when done

- Use V0 for any new screen or significant UI component

- Compress all images: 1024px wide, 0.8 JPEG quality before any upload

- Pass style blend to every downstream system without exception

- Log all scraping activity to SCRAPING_LOG.md

- Keep all secrets in .env --- never commit .env to git

**20. MVP Launch Checklist**

**Core Loop --- Must Pass Before Launch**

- New user: signup → quiz → room capture → AI render --- complete end-to-end on physical device

- Style blend from quiz drives FLUX prompt with correct style weighting

- Render approximately preserves wall colors and room structure

- Product panel shows style-matched, budget-filtered, correctly ranked products

- Chatbot gives room-specific advice with full context in every response

- 3D viewer shows correct wall color and furniture approximately placed

- Pin system works across product panel, render, and 3D viewer

**Auth --- Must Work On Physical Device**

- Apple Sign In: real Apple ID, complete flow, lands on correct screen

- Google Sign In: real Google account, complete flow, lands on correct screen

- Email/password: sign in + create account + sign out all work

- Delete account removes ALL data from Supabase and returns to splash

**Technical**

- TypeScript: zero errors (npx tsc \--noEmit passes)

- All 5 Maestro smoke flows pass on Simulator

- No API keys in client code --- verified by grep

- All images compressed before upload --- verified in code

- userInterfaceStyle: dark in app.json

- isTablet: false in app.json

- Supabase email verification disabled

- newArchEnabled: false

- PostHog analytics firing for all required events --- verified in PostHog dashboard

- Background render polling works --- tested by backgrounding app during render

- All 17 edge cases handled and tested

**Content**

- Product catalog: 15,000+ items with valid CLIP embeddings

- GLB model library: 200+ models, all tagged with style/room_type/category

- Quiz card library: 923+ cards, all labeled pure or blend with style_weights

- Inspiration tab: \'Coming Soon\' screen shows correctly

**App Store Submission**

- App icon: dark navy + two gold arches only --- verified on device

- Privacy policy: URL live and accessible

- Terms of service: URL live and accessible

- Support email working: hellocova@gmail.com

- App Store description written and reviewed

- App Store keywords selected

- Screenshots captured from working app on physical device

- App Store age rating selected

- IDFA/tracking disclosure completed

**END OF DOCUMENT**

Cova MVP Spec v1.1 \| March 2026 \| Confidential
