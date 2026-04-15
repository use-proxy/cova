# SESSION NOTES

## Session 5 — 2026-04-13

### Tasks completed
- TASK 1: `modal_pipeline/generation.py` created with `generate_redesign` function (fal.ai FLUX img2img + ControlNet + LoRA + IP-Adapter)
- TASK 2: `redesign_room_v3` in `redesign_pipeline.py` wired to call `generate_redesign` via `modal.Function.from_name`
- TASK 3: Full validation — all 8 checks pass, `tsc --noEmit` clean

### Files changed
- `modal_pipeline/generation.py` — new file, deployed as Modal app `cova-generation`
- `modal_pipeline/redesign_pipeline.py` — wired `redesign_room_v3` to call `generate_redesign`; added `lora_scale_used`/`lora_url_used` to `render_context` before generation
- `apps/web/.env.local` — updated `SUPABASE_SERVICE_ROLE_KEY` to new `sb_secret_...` format (legacy JWT disabled 2026-03-14)
- `supabase/migrations/20260413_generation_seed.sql` — adds `generation_seed INTEGER` column (user ran this)
- `supabase/migrations/20260413_v3_schema.sql` — adds all v3 columns + `style_loras` table (user ran this)

### Critical fal.ai findings (locked decisions)

**ControlNet format:** Both depth + canny controls MUST go in a **single** `controlnet_unions` entry with both in the `controls` array. Two separate entries cause "Could not load pipeline" (422).

```python
# CORRECT
controlnet_unions = [{"path": "InstantX/FLUX.1-dev-Controlnet-Union", "controls": [depth, canny]}]

# WRONG — causes 422
controlnet_unions = [
    {"path": "...", "controls": [depth]},
    {"path": "...", "controls": [canny]},
]
```

**negative_prompt incompatible with ControlNets:** `fal-ai/flux-general/image-to-image` does NOT accept `negative_prompt` when `controlnet_unions` is present — causes "Could not load pipeline" (422). The negative_prompt from the design director is logged at line 138 of generation.py but never sent to fal.ai. Do not add it back.

**IP-Adapter format:** Use `ip_adapter_image_url` (string) + `ip_adapter_scale` (float). NOT `ip_adapters[]` array.

**LoRA URL validation:** Fallback `fal-ai/flux-2-lora-gallery/apartment-staging` is not a downloadable URL — skip when not starting with `http`.

**Modal SDK:** Use `modal.Function.from_name(app_name, fn_name)` — `Function.lookup()` is removed in current SDK.

### Supabase key format
Supabase disabled legacy JWT keys 2026-03-14. Use new format:
- Service role: `sb_secret_...`
- Anon: `sb_publishable_...`

### Pipeline stage status
- Preprocessing (OpenCV): ✅ active
- Structural extraction (depth + edges): ✅ active  
- Professionalization: ❌ DISABLED (removed Session 3)
- Design Director (Claude Vision): ✅ active — generates flux_prompt + negative_prompt + design_brief
- Main generation (FLUX + ControlNet + LoRA + IP-Adapter): ✅ active — validated end-to-end
- Post-processing: ✅ active (not yet wired in v3 orchestrator)
- Quality gate: ✅ defined, not yet wired
- Product matching: ⏳ M8

### Known issues / next session
- `professionalized_image_url` is null for test room — pipeline falls back to `original_photo_url`. Need professionalization step to run before generation, or skip the concept entirely (high-strength FLUX overwrites clutter).
- Post-processing (color grade, vignette, grain) not yet wired into `redesign_room_v3`.
- Quality gate not yet wired into `redesign_room_v3`.

---

## 2026-04-13

### Decision: Professionalization pass removed permanently

**What changed:**
- `modal_pipeline/redesign_pipeline.py` (v1 `redesign_room`): removed `professionalize_room` call and `"professionalizing"` status update. Depth map + HED edge extraction still run in parallel and are reused downstream. `pano_url` stays as the raw preprocessed (OpenCV) image throughout.
- `apps/web/app/api/pipeline/redesign/route.ts`: removed `PREPROCESS_PIPELINE_WEBHOOK_URL` block. Route now dispatches the original photo URL directly to Modal.
- `modal_pipeline/professionalization.py`: kept in repo, disabled comment added at top.

**Why:** FLUX img2img at strength=0.55 cannot reliably remove surface clutter without degrading image quality (lighting artifacts, geometry drift). Clutter is handled implicitly by the main generation pass at strength=0.85 — the high strength overwrites clutter naturally without a separate cleanup step. Removing the pass saves ~30–60s and ~$0.05/render in fal.ai cost.

**Pipeline stage status:**
- Preprocessing (OpenCV): ✅ still active (run by web route via PREPROCESS_PIPELINE_WEBHOOK_URL was already removed; preprocessing.py handles DarkIR+OpenCV)
- Structural extraction (depth + edges): ✅ still active
- Professionalization: ❌ DISABLED
- Main generation (FLUX): ✅ active
- Post-processing: ✅ active

**Env vars removed:** `PREPROCESS_PIPELINE_WEBHOOK_URL` no longer read in route.ts (can be removed from .env.local)

---

## Session 3 Complete

Session 3 complete. Depth extraction and edge extraction working perfectly (10/10 test pass). Professionalization FLUX pass removed — wrong tool for the job. Professional quality will be achieved through design director prompting and IP-Adapter Unsplash references in Sessions 4-5. The main generation at strength 0.85 implicitly removes clutter by redesigning the room.
