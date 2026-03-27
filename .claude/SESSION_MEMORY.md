# Cova Session Memory
# Read this FIRST at the start of every Claude Code session

## Last Updated
2026-03-27 — Sprint 3 complete (code-only, LoRA training needs REPLICATE_API_TOKEN)

## Current Sprint
Sprint 3 — COMPLETE (code-only). Next: Sprint 4 (Product catalog expansion).

## What Was Done This Session
- Sprint 3 Item 1 — LoRA Training Pipeline:
  - Created scripts/lora-training/train-cova-360.ts (Poly Haven + Replicate trainer)
  - Config: 2000 steps, lr 0.0004, lora_rank 16, trigger "COVAINTERIOR360"
  - 5-test inference validation included
  - BLOCKED: needs REPLICATE_API_TOKEN to run actual training
- Sprint 3 Item 2 — Two-Stage Render Pipeline:
  - render-room: added is_panoramic flag on render insert
  - get-render-status: complete rewrite for Stage 1 (FLUX flat) → Stage 2 (LoRA 360°)
  - Silent fallback if REPLICATE_LORA_MODEL_ID not set
  - Shared types: Render.panoramic_url added
  - useRender hook: passes panoramic_url through
- Sprint 3 Item 3 — Panoramic Viewer:
  - Already correct: sphere, camera, PanResponder, FOV clamping
  - RenderViewScreen uses panoramic_url when available
- Sprint 3 Item 4 — HUD Improvements:
  - Back → Dashboard with stack cleared
  - Save → Cova profile (Supabase), not camera roll
  - Regenerate confirmation modal with token display
  - First render celebration (one-time, auto-dismiss 2s)
  - "..." More menu: Share + 2D Floorplan (Coming Soon)
  - Panoramic/Flat toggle button
- Sprint 3 Item 5 — Previous Renders Row:
  - Horizontal FlatList, gold border on active, tap to swap
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

## What's NOT Working / Pending
- LoRA training: needs REPLICATE_API_TOKEN to run (scripts/lora-training/train-cova-360.ts)
- LoRA model ID: needs to be set as REPLICATE_LORA_MODEL_ID in Supabase secrets
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
- LoRA trigger word: COVAINTERIOR360
- LoRA training: ostris/flux-dev-lora-trainer, 2000 steps, lora_rank 16
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
