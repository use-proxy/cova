# Cova Session Memory
# Read this FIRST at the start of every Claude Code session

## Last Updated
2026-03-27 — Sprint 2 complete (code-only, needs device tests for LiDAR)

## Current Sprint
Sprint 2 — COMPLETE (code-only). Next: Sprint 3 (Render view panoramic).

## What Was Done This Session
- Read COVA_MVP_SPEC_v1.1.docx fully (converted to .md via pandoc)
- Updated CLAUDE.md to reference COVA_MVP_SPEC_v1.1.docx as primary spec authority
- Sprint 2 Item 1 — LiDAR Sub-sprint A:
  - Registered RoomPlanModule.swift + .m in project.pbxproj (Sources + Group)
  - Copied files to ios/cova/ directory
  - Set iOS deployment target to 16.0 (Podfile.properties.json + project.pbxproj 4 configs)
  - Reduced scan timeout from 5min to 60s per spec
  - LiDAR error auto-fallback to 3-photo (not Alert)
- Sprint 2 Item 2 — 3-Photo Guided Capture:
  - Built complete 3-photo flow: intro → Photo 1 (doorway) → Photo 2 (left) → Photo 3 (right) → summary
  - Light level check + horizontal check (Accelerometer ±15°) on camera screens
  - Escape hatch on Photos 2/3: "Use single photo instead" uses Photo 1 only
  - Removed CalibrationOverlay and corner-drag code (approach failed per spec)
- Sprint 2 Item 3 — Single photo + upload:
  - Confirmed working with light/horizontal checks + 1024px/0.8 compression
  - Upload review: "Use This Photo" / "Choose a Different Photo" per spec
- Sprint 2 Item 4 — Loading screen:
  - 8 design tips rotating every 8 seconds
  - Pulsing arch animation (existing, confirmed working)
- npx tsc --noEmit passes (zero app errors)

## What's Working
- Auth flow: Apple/Google/email code all correct
- Style quiz Bayesian algorithm
- FLUX prompt: weighted by style blend with proportional descriptors
- Anchor render: true cosine similarity selection
- Room capture: all 3 paths (LiDAR → 3-photo → single/upload)
- 3-photo guided capture with sensor checks
- LiDAR auto-fallback to 3-photo on any error
- Loading screen with design tips
- Image compression (1024px/0.8) on all capture paths

## What's NOT Working / Pending Device Tests
- Apple Sign In: code fixed, needs physical device verification
- Google Sign In: needs EXPO_PUBLIC_GOOGLE_CLIENT_ID in .env + physical device test
- LiDAR Sub-sprint B: 6 physical device test scenarios (normal, low light, mirrors, cancelled, two scans, non-LiDAR)
- LiDAR Sub-sprint C: polish + fallback verification — blocked on Sub-sprint B
- AI render: flat FLUX, not panoramic — needs model switch (Sprint 3)
- 3D viewer: furniture hardcoded positions (Sprint 5)
- Product matching: not sorted by style blend (Sprint 6)
- Chatbot: system prompt missing full room context (Sprint 7)
- Maestro tests: require app running on simulator to pass

## Approaches That Failed — Do Not Retry
- Corner drag calibration for room capture — removed, replaced with 3-photo guided capture
- Fixed phase quiz algorithm — replaced with Bayesian
- Calling handleComplete from render function — fixed with isFetchingRefinementRef
- npm install in GitHub Actions — fixed to pnpm

## Key Architecture Decisions — Locked
- Panoramic FLUX: try equirectangular model first, fallback to improved sphere projection
- Furniture in render: baked into image (not 3D GLB overlay)
- Arrange screen: 3D viewer IS the preview (Option A), ViewShot snapshot fallback (Option C)
- Token economy: static 999, no payments for MVP
- Maestro: 5 smoke flows only (01, 02, 04, 05, 14) — rest archived
- V0: use for all new screens and UI components
- COVA_MVP_SPEC_v1.1.docx: primary spec authority, wins over CLAUDE.md
- FLUX prompt: 10 descriptor slots allocated proportionally to style blend ratios
- LiDAR timeout: 60s, auto-fallback to 3-photo
- Photo 1 = BEFORE image and primary render reference throughout app

## Test Credentials
- New user: test.newuser@hellocova.com / CovaTest123!
- Returning user: test.returning@hellocova.com / CovaTest123!
- Returning user ID: aa19e895-0582-4947-bf65-5ca06ab65a89
- Returning room ID: e1269ec5
