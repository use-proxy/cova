# Cova Sprint Log
# Updated after every sprint — read at session start

## Spec Completion: 20% (Sprint 3 — panoramic render view)

---

## Sprint 1 — COMPLETE
Target: Auth on real device + style blend pipeline

- [x] Supabase email verification confirmed DISABLED
- [x] Apple Sign In — code fixed, needs physical device verification
- [x] Google Sign In — code correct, needs GOOGLE_CLIENT_ID + physical device verification
- [x] Email/password — confirmed working
- [x] Style blend weighted correctly in FLUX prompt
- [x] Anchor render using true cosine similarity
- [x] Pinned products in FLUX prompt
- [x] npx tsc --noEmit passes

---

## Sprint 2 — COMPLETE (code-only, needs device tests for LiDAR)
Target: Room capture all 3 paths

- [x] LiDAR Sub-sprint A: Xcode registration, iOS 16.0, 60s timeout, auto-fallback
- [x] 3-Photo guided capture: intro → 3 photos with sensor checks → summary
- [x] Single photo + upload paths with compression
- [x] Loading screen: pulsing arch + 8 design tips every 8s
- [ ] LiDAR Sub-sprint B/C: BLOCKED on physical device

---

## Sprint 3 — COMPLETE (code-only, needs REPLICATE_API_TOKEN for LoRA training)
Target: Panoramic render view + custom 360° LoRA

### Item 1 — Custom indoor 360° LoRA training pipeline
- [x] Training script created: scripts/lora-training/train-cova-360.ts
- [x] Poly Haven API integration for equirectangular interior HDRIs
- [x] Auto-filtering: 2:1 aspect ratio, indoor rooms, min 2048px
- [x] Replicate ostris/flux-dev-lora-trainer config: 2000 steps, lr 0.0004, lora_rank 16, trigger "COVAINTERIOR360"
- [x] 5-test inference validation pipeline
- [ ] BLOCKED: Actual training run requires REPLICATE_API_TOKEN (run: npx ts-node scripts/lora-training/train-cova-360.ts)
- [ ] BLOCKED: LoRA model ID needs to be saved as REPLICATE_LORA_MODEL_ID in Supabase secrets
- Training cost estimate: ~$5-15 depending on dataset size and GPU time

### Item 2 — Two-stage render pipeline
- [x] render-room/index.ts: Added is_panoramic flag on render insert
- [x] get-render-status/index.ts: Complete rewrite for two-stage pipeline
  - Stage 1: FLUX ControlNet (existing) → flat render → image_url
  - Stage 2: Custom LoRA (COVAINTERIOR360) → equirectangular 360° → panoramic_url
  - Fallback: if REPLICATE_LORA_MODEL_ID not set or Stage 2 fails → flat render only, silent
- [x] Shared types: Render interface updated with panoramic_url field
- [x] useRender hook: passes panoramic_url through to store

### Item 3 — Panoramic viewer on sphere
- [x] PanoramaViewer.tsx already correct: camera [0,0,0], sphere radius 500, scale [-1,1,1]
- [x] Eye-level camera, PanResponder touch drag, pinch FOV 40°–90°
- [x] NO OrbitControls — uses custom PanResponder + useFrame
- [x] Momentum decay, vertical clamp, texture loading pipeline
- [x] RenderViewScreen uses panoramic_url when available, falls back to image_url

### Item 4 — Render View HUD and interactions
- [x] Back arrow → Dashboard with navigation stack cleared (reset to RoomsTab)
- [x] Token balance: static 999, no decrement
- [x] HUD: auto-hides after 3s, reappears on tap
- [x] Regenerate confirmation modal: "This will use 1 token" + Regenerate/Cancel
- [x] Save: saves to Cova profile (Supabase), no camera roll
- [x] First render celebration: "Your first design is ready" overlay, one-time per user, auto-dismisses 2s
- [x] "..." More menu: Share + 2D Floorplan (Coming Soon placeholder)
- [x] Panoramic/Flat toggle when panoramic_url available
- [x] Floating chat button: always visible (existing)

### Item 5 — Previous renders row
- [x] Horizontal FlatList at bottom showing previous renders for room
- [x] Active render has gold border indicator
- [x] Tap to swap displayed render (no API call, no token cost)
- [x] Most recent render = primary

### Verification
- [x] npx tsc --noEmit passes (zero app errors)
- [ ] Maestro smoke tests (requires app running on simulator)

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
- [x] Sprint 1: auth + style blend pipeline
- [x] Sprint 2: room capture all 3 paths + loading screen
- [x] Sprint 3: panoramic render view + custom 360° LoRA pipeline

---

## Pending Device Tests
- Apple Sign In: code fixed, needs physical device verification
- Google Sign In: code fixed, needs GOOGLE_CLIENT_ID in .env + physical device verification
- LiDAR Sub-sprint B: 6 scenarios on physical LiDAR device
- LiDAR Sub-sprint C: polish + fallback verification — blocked on Sub-sprint B

## Pending Manual Steps
- Run LoRA training: REPLICATE_API_TOKEN=xxx npx ts-node scripts/lora-training/train-cova-360.ts
- Save trained model ID: supabase secrets set REPLICATE_LORA_MODEL_ID=xxx
- Verify LoRA quality: check scripts/lora-training/test-outputs/ for 4/5 pass rate

---

## Skipped Items
None yet
