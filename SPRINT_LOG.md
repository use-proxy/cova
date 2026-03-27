# Cova Sprint Log
# Updated after every sprint — read at session start

## Spec Completion: 5% (Sprint 1 — auth + style blend pipeline)

---

## Sprint 1 — IN PROGRESS
Target: Auth on real device + style blend pipeline

- [x] Supabase email verification confirmed DISABLED (config.toml + dashboard comment)
- [x] Apple Sign In — code fixed, needs physical device verification (added explicit setUser/setSession after signInWithIdToken)
- [x] Google Sign In — code correct, needs physical device verification (requires EXPO_PUBLIC_GOOGLE_CLIENT_ID in .env)
- [x] Email/password — code confirmed working, no email verification required
- [x] Style blend weighted correctly in FLUX prompt (proportional descriptor allocation: 60% coastal = 6/10 coastal descriptors)
- [x] Anchor render already using true cosine similarity of style_weights vectors (verified existing implementation)
- [x] Pinned products included in FLUX prompt with "must include [description]" language
- [x] npx tsc --noEmit passes (zero new errors; pre-existing Deno/scripts errors unchanged)
- [ ] All 5 Maestro smoke flows pass (requires app running on simulator — skipped for autonomous mode)

---

## Sprint 2 — NOT STARTED
Target: Room capture all 3 paths

- [ ] LiDAR: read project.pbxproj + Swift files → fix 4 failure points → rebuild
- [ ] LiDAR: photo guidance tips screen (3 tips, cannot skip)
- [ ] LiDAR: bulletproof try/catch fallback to 3-photo
- [ ] 3-photo: introduction screen
- [ ] 3-photo: Photo 1 doorway (light + horizontal checks)
- [ ] 3-photo: Photo 2 left corner (escape hatch)
- [ ] 3-photo: Photo 3 right corner (escape hatch)
- [ ] 3-photo: summary screen
- [ ] 3-photo: depth map merge server-side
- [ ] Upload: single photo picker + confirmation + validation
- [ ] All photos: 1024px / 0.8 JPEG compression before upload
- [ ] Loading screen: pulsing arch animation
- [ ] Loading screen: design tips rotating every 8 seconds

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

---

## Skipped Items
None yet
