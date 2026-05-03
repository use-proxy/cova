Cova — CLAUDE.md
What this is
AI interior design web app. User uploads room photo → style quiz → AI render → shoppable products.
Stack: Next.js 14 App Router, TypeScript, Supabase, Modal A10G, fal.ai.
Monorepo: apps/web is active. apps/mobile is FROZEN — never touch.
Supabase project: xdeacbmkdwqrwxonqaqh. Deployment: Vercel, root apps/web.
User flow (V3 — active as of 2026-04-23)
/auth → step-1 (welcome) → step-2 (pick 2 style anchors) → step-3 (12-pair quiz → writes users.style_fingerprint) → step-4 (fingerprint reveal) → step-5 (budget) → step-6 (photo upload → creates rooms row) → step-7 (pre-detect) → step-7p (unified personalization — manifest v2.0 with 6 slots: art, smart_products, specific_items, lighting, identity_objects, freetext → "Generate my room" fires redesign) → step-8a (render reveal + before/after slider) → step-8b (tap-to-refine + chips + chat bar) → step-9 (shoppable hotspots + Smart Home Upgrades).

Retired V1 steps (step-7b/c/d/e/f/g/h) are preserved under apps/web/app/design/_future/ for V4. Do not reintroduce unless the product owner signals V4.

V3 render pipeline — 3-pass (modal_pipeline/redesign.py rewrite 2026-04-23)

Pass 0: Claude Sonnet Vision layout planner — scene-spec JSON with pass1_hero_placement, pass2_surfaces, personalization_placements, life_objects, pass3_lighting_preset.
Pass 1: FLUX general i2i — hero furniture lock, strength 0.92, 28 steps, guidance 3.5, LoRA stack (primary style + add-details), depth ControlNet 0.80.
Pass 2: Per-surface decor loop — FLUX general i2i with surface masks, strength 0.55, 22 steps, preserves Pass 1 hero.
Pass 3: IC-Light v2 — lowres_denoise=0.88, highres_denoise=0.45 (non-default; critical for quality).
Editorial post-process: warm WB + s-curve + desat 8% + film grain + corner vignette (PIL+numpy, in-process).
QA: Claude Sonnet Vision 10-dim scorecard + 3 suggested_chips for refinement UI.
Art compositing: separate cova-composite-art Modal app (SAM-3 wall detect + homography + Poisson blend + masked IC-Light harmonize).

Legacy V1 note: the old "professionalization → main gen → upscale" single-pass flow and its parameters (strength=0.85, guidance=3.5) are retired. apps/web/lib/ai/design-director.ts continues to generate scenario briefs for refinement continuity but is no longer the primary prompt source.

V1 render pipeline (retired — kept for reference)

Unsplash refs — fires at step-3, stores 3-5 style-matched reference URLs in rooms.unsplash_references
Preprocessing — DarkIR if brightness<80, then OpenCV (white balance LAB, CLAHE clipLimit=3, gamma, unsharp, resize max 1536px)
Parallel: depth map (fal-ai/imageutils/depth, depth-anything-v2, $0.005) + soft edges (OpenCV low-canny 30/90 + blur) + Grounded-SAM2 masks via Modal endpoint (GROUNDED_SAM2_URL, Grounding DINO + SAM2, ~$0.01/room). Falls back to per-item fal-ai/sam2/image with bbox from estimated_bbox_pct if Modal endpoint unavailable.
Professionalization pass — fal-ai/flux-general/image-to-image, strength=0.55, depth ControlNet=0.70. Same room, same layout. Only fix: lighting, clutter, textiles. Never redesign.
Design Director Call 1 — Claude Sonnet + vision → staging JSON (room type, weaknesses, 6-12 objects with positions, 60-30-10 palette, lighting, depth layers). Stored in rooms.design_brief.
Design Director Call 2 — staging JSON → explicit FLUX staging script 80-120 words with spatial choreography. Stored in rooms.flux_prompt.
Main generation — fal-ai/flux-general/image-to-image: strength=0.85, steps=28, guidance=3.5, depth ControlNet=0.60, edge ControlNet=0.40, style LoRA scale=0.8, IP-Adapter Unsplash refs scale=0.45. If keep items: differential diffusion with change map (white=change, black=preserve).
Post-processing — teal-orange LAB grade, vignette, film grain, unsharp, micro-contrast CLAHE, sRGB normalize
Upscale — fal-ai/esrgan 2x
Quality gate — LAION Aesthetic Predictor V2, threshold 5.0. On fail: Claude Vision identifies what's missing → targeted retry. Max 3 attempts.
Product matching — Claude Vision extracts items → Serper Google Shopping + SearchAPI Google Lens per item. Tech tab preferences → same pipeline (style-matched smart tech queries). Affiliate links applied.

Key parameters
Professionalization: strength=0.55, depth=0.70 | Main gen: strength=0.85, depth=0.60, edges=0.40, guidance=3.5, steps=28, LoRA=0.8, IP-Adapter=0.45 | Quality threshold: 5.0 | Target COGS ≤$0.20/render
Style LoRAs
Trained via fal-ai/flux-lora-fast-training ($2/run, 1000 steps, is_style=true, dual captions).
Table: style_loras (style_name, trigger_word, lora_url, recommended_scale).
Triggers: cvwmn (Japandi), cvscn (Scandi), cvmcm (MCM), cvind (Industrial), cvlux (Luxury), cvmax (Maximalist), cvcst (Coastal), cvdco (Art Deco), cvboh (Boho).
Fallback if untrained: fal-ai/flux-2-lora-gallery/apartment-staging.
Design director aesthetic rules (non-negotiable)

60-30-10 color rule always. Three depth layers always populated. 6-12 named objects.
Material tension: one warm + one cool/contrasting material always.
Accessory groupings: 3 or 5 only. Vary height + texture + material simultaneously.
Fingerprint mapping: density>0.7→10-12 objects, warmth>0.7→2700K Edison, naturalism>0.7→3+ plants.
Room weaknesses always identified and compensated (low ceiling→vertical elements, dark→light materials+mirrors).
Forbidden words: beautiful, stunning, modern, contemporary, cozy, luxurious, nice.
Material specificity: never "wood"→walnut/oak/teak, never "fabric"→bouclé/linen/velvet.
7d integration: Art tab→wall art in staging, Tech tab→smart tech in render+product search, Products tab→material quality language, Budget→IKEA/West Elm/designer tier.

Locked decisions — never change

apps/mobile/ FROZEN. Never touch.
Auth: HTTP-only cookies via @supabase/ssr only. No localStorage/sessionStorage.
SUPABASE*SERVICE_ROLE_KEY never in NEXT_PUBLIC*\*.
products table frozen (768-dim CLIP). Do not alter schema.
Modal GPU: A10G only. fetch() only for Modal calls.
Output: single flat 2D image only. No 3D, no panorama, no video.
fal.ai is the generation provider. Do not add new Replicate calls (being deprecated).
Next.js 14.2.x, THREE.js 0.155.0, SparkJS 0.1.10 — versions frozen.
No OrbitControls. No useState for camera state.
rooms.redesign_pano_url stores flat 2D image (legacy name).
Never a static smart tech database — use live Serper search.
Style names: always route through toDisplayName() and sanitizeForbiddenStyleNames().

Disabled — do not re-enable
Marble API, depth video pipeline, panorama rendering, AnySplat, InstantStyle, SUPIR upscaling, hardcoded step-7c furniture items.

Note (2026-04-23): IC-Light v2 was previously in this list but is now an intentional part of V3 Pass 3. Keep V3's non-default denoise params (lowres 0.88, highres 0.45) and don't use default IC-Light values.

V3 personalization stack
apps/web/lib/types/personalization.ts — PersonalizationManifest v2.0 (schema_version 2).
apps/web/lib/ai/personalization-compiler.ts — SLOT_HANDLERS for every slot; produces pass1_additions / pass2_additions / pass3_lighting / art_compositing_required.
apps/web/app/api/personalization/{save,generate-art-preview,lighting-previews}/route.ts — backend routes, all require auth.
apps/web/app/design/step-7p/page.tsx — single-screen unified personalization.

V3 refinement stack
apps/web/app/api/render/refinement/detect/route.ts — SAM-3 tap to mask + Claude Haiku Vision label.
apps/web/app/api/render/refinement/apply/route.ts — Claude Haiku classifier into 4 tiers (fingerprint_delta, kontext_global, region_inpaint, escape) + Vision chips + render_sessions insert. SOFT_CAP 10 / HARD_CAP 20.
apps/web/app/design/step-8b/page.tsx — tap-to-select + chat refinement UI (rewritten 2026-04-23, legacy slider flow retired).

V3 deployed Modal apps (2026-04-23)
cova-redesign-v3: https://cova-interior--cova-redesign-v3-redesign-api.modal.run
  — new app; Phase 5 cova-redesign kept as fallback (COVA_REDESIGN_PHASE5_URL).
cova-composite-art: https://cova-interior--cova-composite-art-compositeart-api.modal.run
  — SAM-3 wall detect + homography + Poisson blend + masked IC-Light.
cova-pre-detection and cova-segmentation stopped 2026-04-23 to free Modal slots.
Consumers retired to app/design/_future/. Restore with modal deploy if ever needed.

V3 tunables (modal_pipeline/redesign.py 2026-04-23)
Pass 1: strength 0.92, 28 steps, guidance 3.5, LoRA primary + add-details@0.40, depth CN 0.80→0.85%.
Pass 2: strength 0.55, 22 steps, guidance 3.5, per-surface masks (max 4 surfaces).
Pass 3: IC-Light v2 lowres_denoise=0.88, highres_denoise=0.45 (non-default), guidance 5.
Editorial post: warm WB 1.03/0.97, gentle tanh contrast, 3% desat, tiny grain, subtle corner vignette.
fal-general "Could not load pipeline" handled: 4-retry loop drops ControlNet on final attempt.
pass2_surfaces coercion: handles Claude returning list[dict] / list[str] / dict.
Key files
apps/web/lib/ai/design-director.ts — VLM design director
apps/web/lib/ai/prompt-compiler.ts — FLUX prompt compilation
apps/web/lib/ai/lora-registry.ts — LoRA selection by style
apps/web/lib/unsplash.ts — Unsplash reference fetching
apps/web/app/api/fal/proxy/route.ts — fal.ai proxy (createRouteHandler)
modal_pipeline/redesign_pipeline.py — main pipeline orchestrator
modal_pipeline/preprocessing.py — DarkIR + OpenCV
modal_pipeline/professionalization.py — cleanup pass
modal_pipeline/generation.py — FLUX generation
modal_pipeline/postprocessing.py — color grade + grain + vignette
modal_pipeline/quality_gate.py — aesthetic scorer + retry logic
modal_pipeline/grounded_sam2_pipeline.py — Grounded-SAM2 whole-room segmentation endpoint
New DB columns (rooms table)
preprocessed_image_url, professionalized_image_url, design_brief (JSONB), flux_prompt, aesthetic_score, unsplash_references (JSONB)
New tables
style_loras: id, style_name, trigger_word, lora_url, recommended_scale, quality_score, trained_at
Required env vars
FAL_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SERPER_API_KEY, SEARCHAPI_KEY, UNSPLASH_ACCESS_KEY, COVA_REDESIGN_URL, AMAZON_ASSOCIATE_TAG, REPLICATE_API_TOKEN (legacy)
Session continuity
Read SESSION_NOTES.md at project root before every session.
Append after every session: files changed, pipeline stage status (✅/❌/⏳), decisions made, known issues, env vars added.
