# Cova Session Memory
# Read this FIRST at the start of every Claude Code session

## Last Updated
2026-03-27 — Sprint 3 FULLY COMPLETE (LoRA trained + wired into pipeline)

## Current Sprint
Sprint 3 — FULLY COMPLETE. Next: Sprint 4 (Product catalog expansion).

## What Was Done This Session
- Sprint 3 Item 1 — LoRA Training Pipeline:
  - Patched scripts/lora-training/train-cova-360.ts with 3 sources:
    1. Poly Haven tonemapped JPGs (flat URL structure, not nested — 290 images found)
    2. Flickr API (CC-licensed equirectangular interiors, needs FLICKR_API_KEY)
    3. Hugging Face datasets (fallback, public indoor-360 datasets)
  - Minimum 50 images enforced, max 150 cap (ZIP under 100MB for Replicate upload)
  - Images resized 8192x4096 → 2048x1024 before packaging
  - Auto-detects Replicate username for model ownership
  - LoRA TRAINED: pgoel813/cova-interior-360-lora version 6082cef9
  - Training: 150 images, 2000 steps, lr 0.0004, lora_rank 16, trigger "COVAINTERIOR360"
- Sprint 3 Item 2 — Two-Stage Render Pipeline FULLY WIRED:
  - render-room: Stage 1 (FLUX depth ControlNet) + is_panoramic flag
  - get-render-status: Stage 2 uses version-based endpoint with REPLICATE_LORA_VERSION
  - Supabase secrets SET: REPLICATE_LORA_MODEL_ID=pgoel813/cova-interior-360-lora, REPLICATE_LORA_VERSION=6082cef9
  - Silent fallback if LoRA unavailable
- Sprint 3 Items 3-5 — unchanged (panoramic viewer, HUD, previous renders)
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
