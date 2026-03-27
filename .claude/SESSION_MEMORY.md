# Cova Session Memory
# Read this FIRST at the start of every Claude Code session

## Last Updated
March 2026 — post repo cleanup

## Current Sprint
Sprint 1 — NOT STARTED

## What Was Done Last Session
- Wrote COVA_MVP_SPEC_v1.1.docx (full MVP specification)
- Rewrote CLAUDE.md from MVP spec
- Ran repo cleanup:
  - Removed .cursorrules
  - Archived PRODUCT_TRUTH.md
  - Removed old spec files
  - Fixed pre-commit hooks (removed 18s TypeScript + test suite)
  - Fixed GitHub Actions (now uses pnpm, excludes Deno)
  - Removed 7 unused packages
  - Removed dead Zustand quiz actions

## What's Working
- All 5 Maestro smoke flows pass
- Style quiz Bayesian algorithm working (right 0.6, left 0.4)
- Quiz Phase 2 race condition fixed (isFetchingRefinementRef)
- Auth flow functional (needs real device test for Apple/Google)
- Room capture UI exists (LiDAR needs rebuild, 3-photo needs build)

## What's NOT Working / Known Issues
- Apple Sign In: not tested on real device
- Google Sign In: not tested on real device
- AI render: flat FLUX, not panoramic — needs model switch
- Style blend: not fully driving FLUX prompt with correct weighting
- Anchor render: not selected by cosine similarity yet
- 3D viewer: furniture hardcoded positions, not from render
- Product matching: not sorted by style blend yet
- Chatbot: system prompt missing full room context
- LiDAR: needs 3-sprint rebuild

## Sprint 1 Priority (Start Here)
1. Apple Sign In working on real device (Supabase OAuth)
2. Google Sign In working on real device (Supabase OAuth)
3. Style blend weighted correctly in FLUX prompt
4. Anchor render selected by true cosine similarity of style_weights

## Approaches That Failed — Do Not Retry
- Corner drag calibration for room capture — removed, replaced with photo guidance
- Fixed phase quiz algorithm — replaced with Bayesian
- Calling handleComplete from render function — fixed with isFetchingRefinementRef
- npm install in GitHub Actions — fixed to pnpm

## Key Architecture Decisions — Locked
- Panoramic FLUX: try equirectangular model first, fallback to improved sphere projection
- Furniture in render: baked into image (not 3D GLB overlay)
- Arrange screen: 3D viewer IS the preview (Option A), ViewShot snapshot fallback (Option C)
- Token economy: static 999, no payments for MVP
- Maestro: 5 smoke flows only (01, 02, 04, 05, 14) — archive rest
- V0: use for all new screens and UI components
- PRODUCT_TRUTH.md: archived, superseded by MVP_SPEC.md

## Test Credentials
- New user: test.newuser@hellocova.com / CovaTest123!
- Returning user: test.returning@hellocova.com / CovaTest123!
- Returning user ID: aa19e895-0582-4947-bf65-5ca06ab65a89
- Returning room ID: e1269ec5
