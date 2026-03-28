# Cova Session Memory
# Read this FIRST at the start of every Claude Code session

## Last Updated
2026-03-28 — Sprint 4 COMPLETE (product catalog expansion + quiz cards)

## Current Sprint
Sprint 4 — COMPLETE. Next: Sprint 5 (3D viewer visual improvements).

## What Was Done This Session
- Sprint 4 — Product catalog expansion (3 scripts):
  1. scrape-all.ts: Poly Pizza (api.poly.pizza, 25/cat found), Sketchfab (80 CC GLBs), 432 template products
  2. expand-quiz-cards.ts: 367 Unsplash cards (table is swipe_cards, columns: style, active)
  3. close-catalog-gaps.ts: 600 structured products + 135 additional + 150 Pexels cards
- DB schema discoveries:
  - products: external_id NOT NULL, affiliate_url_base NOT NULL, price_tier (not price_range)
  - products: retailer CHECK constraint allows only: wayfair, amazon, cb2, ikea
  - swipe_cards table (not quiz_cards): columns are style, style_weights, phase, room_type, active
  - glb_models table does NOT exist
- Env loading: must use absolute path /Users/daksh/Desktop/cova/.env.local (compiled JS runs from /tmp/)
- API keys confirmed in .env.local: POLY_PIZZA_API_KEY, SKETCHFAB_API_KEY, UNSPLASH_ACCESS_KEY, PEXELS_API_KEY
- npx tsc --noEmit passes (zero app errors)

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

## Trained LoRA Model
- Model: pgoel813/cova-interior-360-lora
- Version: 6082cef9
- Trigger word: COVAINTERIOR360
- Supabase secrets: REPLICATE_LORA_MODEL_ID, REPLICATE_LORA_VERSION (both SET)
- Training data: 150 Poly Haven equirectangular indoor HDRIs (tonemapped JPGs, 2048x1024)

## What's NOT Working / Pending
- Apple Sign In: code fixed, needs physical device verification
- Google Sign In: needs EXPO_PUBLIC_GOOGLE_CLIENT_ID in .env + physical device test
- LiDAR Sub-sprint B/C: blocked on physical device
- glb_models table: does not exist — needs migration; also add 'sketchfab' to products.retailer CHECK
- Products: 4,519 total, 1,467 missing CLIP embeddings (1,383 have placeholder images → CLIP meaningless)
- Swipe cards: 950 total (exceeds 923 target)
- 3D viewer: furniture hardcoded positions (Sprint 5)
- Product matching: not sorted by style blend (Sprint 6)
- Chatbot: system prompt missing full room context (Sprint 7)
- Maestro tests: require app running on simulator

## Approaches That Failed — Do Not Retry
- Corner drag calibration for room capture — removed
- Fixed phase quiz algorithm — replaced with Bayesian
- Calling handleComplete from render function — fixed with isFetchingRefinementRef
- npm install in GitHub Actions — fixed to pnpm

## Key Architecture Decisions — Locked
- Two-stage render: FLUX ControlNet → LoRA 360° conversion (fallback: flat render)
- LoRA model: pgoel813/cova-interior-360-lora version 6082cef9
- LoRA trigger word: COVAINTERIOR360
- LoRA training: ostris/flux-dev-lora-trainer, 150 images, 2000 steps, lora_rank 16
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
