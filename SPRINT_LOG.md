# Cova Sprint Log
# Updated after every sprint — read at session start

## Spec Completion: 12% (Sprint 2 — room capture all 3 paths)

---

## Sprint 1 — COMPLETE
Target: Auth on real device + style blend pipeline

- [x] Supabase email verification confirmed DISABLED (config.toml + dashboard comment)
- [x] Apple Sign In — code fixed, needs physical device verification
- [x] Google Sign In — code correct, needs GOOGLE_CLIENT_ID + physical device verification
- [x] Email/password — code confirmed working, no email verification required
- [x] Style blend weighted correctly in FLUX prompt (proportional descriptor allocation)
- [x] Anchor render using true cosine similarity of style_weights vectors
- [x] Pinned products included in FLUX prompt with "must include [description]" language
- [x] npx tsc --noEmit passes

---

## Sprint 2 — COMPLETE (code-only, needs device tests for LiDAR)
Target: Room capture all 3 paths

### Item 1 — LiDAR Sub-sprint A (code fix)
- [x] Swift files registered in Xcode project.pbxproj (RoomPlanModule.swift + .m added to Sources + Group)
- [x] iOS deployment target set to 16.0 (project.pbxproj all 4 configs, Podfile.properties.json, app.json already correct)
- [x] newArchEnabled confirmed false in app.json
- [x] Session released between scans (captureSession = nil; captureView = nil before new session)
- [x] Bulletproof error handling with specific messages per error type
- [x] 60s scan timeout (was 5min) — auto-fallback to 3-photo on timeout
- [x] Auto-fallback to 3-photo on ANY LiDAR error (no alert, friendly message)
- [ ] LiDAR Sub-sprint B: physical device test required (6 scenarios) — BLOCKED on device
- [ ] LiDAR Sub-sprint C: polish + fallback verification — BLOCKED on Sub-sprint B

### Item 2 — 3-Photo guided capture
- [x] Introduction screen with numbered circles (1: Doorway, 2: Left Side, 3: Right Side) + gold "Start" button
- [x] Photo 1 — Doorway: guidance text, light level check, horizontal check (±15° via Accelerometer)
- [x] Photo 2 — Left Corner: same checks, "Use single photo instead" escape hatch, back button
- [x] Photo 3 — Right Corner: same checks, escape hatch
- [x] Summary screen: 3 thumbnails + "Start Redesign" button
- [x] Escape hatch uses Photo 1 only, skips remaining photos
- [x] Photo 1 = BEFORE image and render reference
- [x] All 3 photos uploaded to storage, Photo 1 passed as primary to render pipeline
- [x] CalibrationOverlay and corner-drag code removed (per spec — approach failed)

### Item 3 — Single photo + upload paths
- [x] Single photo: camera with light + horizontal checks → confirm → loading
- [x] Upload: photo picker → confirm with "Use This Photo" / "Choose a Different Photo" → loading
- [x] Both paths: 1024px / 0.8 JPEG compression before upload

### Item 4 — Loading screen
- [x] Pulsing arch animation (breathes in/out continuously)
- [x] 8 design tips rotating every 8 seconds
- [x] Render progress stage text + progress bar
- [x] Renders route to RenderView with autoGenerate=true

### Verification
- [x] npx tsc --noEmit passes (zero app errors)
- [ ] Maestro smoke tests (requires app running on simulator)

---

## Sprint 3 — NOT STARTED
Target: Render view panoramic

- [ ] Panoramic FLUX model: try equirectangular model (2-3 iterations)
- [ ] Fallback: improved sphere projection if no good model found
- [ ] Structural preservation: denoising 0.60 + prompt instructions
- [ ] Previous renders: horizontal scroll row in render view
- [ ] First render celebration: confetti + overlay (one-time)
- [ ] Back arrow: always goes to Dashboard, stack cleared

---

## Sprint 4 — NOT STARTED
Target: Product catalog expansion

- [ ] scripts/scrape-all.ts: full Poly Pizza implementation
- [ ] scripts/scrape-all.ts: full Sketchfab implementation
- [ ] scripts/scrape-all.ts: Three.js examples
- [ ] scripts/scrape-all.ts: IKEA assets (attempt, log if fails)
- [ ] scripts/scrape-all.ts: Wayfair/Amazon/CB2/West Elm/Article
- [ ] CLIP embedding pipeline for new products
- [ ] Target: 15,000+ products in database

---

## Completed
- [x] Style quiz Bayesian algorithm (right 0.6, left 0.4, min 10 swipes, 2min timeout)
- [x] Quiz Phase 2 race condition (isFetchingRefinementRef guard)
- [x] handleComplete(force=true) for timeout bypass
- [x] All 15 Maestro flows passing (5 smoke flows going forward)
- [x] COVA_MVP_SPEC_v1.1.docx created (full product spec)
- [x] CLAUDE.md rewritten from MVP spec
- [x] Repo cleanup (hooks, Actions, unused packages, dead code)
- [x] SESSION_MEMORY.md created
- [x] SPRINT_LOG.md created
- [x] MVP_SPEC.md placeholder created
- [x] Sprint 1: auth + style blend pipeline
- [x] Sprint 2: room capture all 3 paths + loading screen

---

## Pending Device Tests
- Apple Sign In: code fixed, needs physical device verification
- Google Sign In: code fixed, needs GOOGLE_CLIENT_ID in .env + physical device verification
- LiDAR Sub-sprint B: 6 scenarios on physical LiDAR device (normal room, low light, mirrors, cancelled, two scans, non-LiDAR device)
- LiDAR Sub-sprint C: polish + fallback verification — blocked on Sub-sprint B

---

## Skipped Items
None yet
