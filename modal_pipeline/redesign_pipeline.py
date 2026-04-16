"""
Cova v3 — Redesign Pipeline Orchestrator (rewritten 2026-04-13)

Single entry point for the complete v3 redesign pipeline.
App name kept as "cova-redesign-pipeline" so REDESIGN_PIPELINE_WEBHOOK_URL
in .env.local continues to work without changes.

Pipeline stages (run in order, with idempotency skipping):
  1. Preprocessing    — cova-preprocessing-pipeline / preprocess_room_photo
  2. Professionalize  — cova-professionalization / professionalize_room  (moved before depth)
  3. Structural       — cova-structural-extraction / extract_depth_map + extract_canny_edges (parallel, from professionalized image)
  4. Generation       — cova-generation / generate_redesign_phase4b  ← always re-runs (Phase 4b selective inpainting)

Stage 3 skip: only if depth_map_url + edge_map_url exist AND render_context.professionalized_before_depth == True.
  Old runs (depth extracted before professionalization) are forced to re-extract.

webhook entry point: redesign_webhook (POST)
  - Returns {"status": "queued", "room_id": ..., "pipeline": "v4"} immediately
  - Spawns orchestrate_pipeline to run all stages asynchronously

Stages 1-3 are skipped on refinement runs if their output already exists in the
rooms table / render_context. Stage 4 (generation) always re-runs.
"""

import os

import modal

# ---------------------------------------------------------------------------
# Modal image — orchestrator only needs supabase + requests + fastapi
# ---------------------------------------------------------------------------

pipeline_image = (
    modal.Image.debian_slim(python_version="3.10")
    # Cache bust: 2026-04-13
    .pip_install("supabase", "requests", "fastapi[standard]")
)

app = modal.App("cova-redesign-pipeline", image=pipeline_image)


# ---------------------------------------------------------------------------
# Orchestrator — runs all 4 stages in order
# ---------------------------------------------------------------------------

@app.function(
    timeout=600,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
    ],
)
def orchestrate_pipeline(
    room_id: str,
    user_id: str,
    compiled_prompt: str,
    unsplash_references: list,
    seed: int,
    image_url: str,
    remove_count: int = 0,
    # Stacked LoRA stack — JSON array of {url, scale, name}
    loras_json: str = None,
    # Legacy single-LoRA params — kept for backwards compat
    lora_url: str = None,
    lora_scale: float = 0.75,
    # Differential diffusion — change map for floor/wall/kept-item preservation
    change_map_url: str = None,
    kept_item_mask_urls: list = None,
    wall_change_requested: bool = True,
    floor_change_requested: bool = False,
) -> dict:
    """
    Full pipeline orchestrator.

    Runs preprocessing → structural extraction → professionalization → generation
    in order. Stages 1-3 are skipped if their output already exists in Supabase
    (idempotent for refinement runs). Stage 4 always re-runs.

    All final DB writes (redesign_pano_url, redesign_status = complete) are
    performed by generate_redesign in cova-generation. This function handles
    status transitions for the earlier stages.
    """
    import modal as _modal
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from supabase import create_client

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(supabase_url, supabase_key)

    print(f"[orchestrator] ── Pipeline START for room {room_id} ──")
    print(f"[orchestrator] image_url: {(image_url or '')[:80]}...")
    print(f"[orchestrator] prompt ({len((compiled_prompt or '').split())} words): {(compiled_prompt or '')[:100]}...")
    print(f"[orchestrator] loras_json: {(loras_json or '')[:120]}")
    print(f"[orchestrator] unsplash_refs: {len(unsplash_references or [])}")
    print(f"[orchestrator] seed: {seed}")
    print(f"[orchestrator] remove_count: {remove_count}")

    # Mark processing
    try:
        client.table("rooms").update(
            {"redesign_status": "processing"}
        ).eq("id", room_id).execute()
    except Exception as e:
        print(f"[orchestrator] Warning: could not set redesign_status=processing: {e}")

    # ── Read current DB state ─────────────────────────────────────────────────
    try:
        row_result = client.table("rooms").select(
            "preprocessed_image_url, professionalized_image_url, render_context, keep_remove_decisions, pre_detection_result"
        ).eq("id", room_id).single().execute()
        row = row_result.data or {}
    except Exception as e:
        print(f"[orchestrator] Warning: DB read failed, treating as empty: {e}")
        row = {}

    render_context = row.get("render_context") or {}
    if isinstance(render_context, str):
        import json as _json
        try:
            render_context = _json.loads(render_context)
        except Exception:
            render_context = {}

    # Merge keep_remove_decisions into render_context for Phase 4b mask building
    # Normalize from DB array format [{id, name, category, decision}, ...] to dict format
    db_decisions = row.get("keep_remove_decisions") or []
    if db_decisions and "keep_remove_decisions" not in render_context:
        # Inline normalization (utils.py not available in orchestrator image)
        if isinstance(db_decisions, list):
            normalized = {}
            for item in db_decisions:
                if isinstance(item, dict):
                    label = item.get('name') or item.get('label', '')
                    decision = item.get('decision', 'keep')
                    if label:
                        key = label.lower().strip().replace(" ", "_").replace("-", "_")
                        normalized[key] = decision
        elif isinstance(db_decisions, dict):
            normalized = {k.lower().strip().replace(" ", "_").replace("-", "_"): v
                          for k, v in db_decisions.items()}
        else:
            normalized = {}
        render_context["keep_remove_decisions"] = normalized
        print(f"[orchestrator] Merged + normalized {len(normalized)} keep_remove_decisions into render_context: {normalized}")

    # Fix B: Thread detected_items from pre_detection_result into render_context
    # so generation.py can do category-based mask logic and prompt building.
    if "detected_items" not in render_context:
        pre_detection = row.get("pre_detection_result")
        if isinstance(pre_detection, str):
            import json as _json2
            try:
                pre_detection = _json2.loads(pre_detection)
            except Exception:
                pre_detection = None

        det_items = []
        if isinstance(pre_detection, list):
            # pre_detection_result is the detected_items array directly
            det_items = pre_detection
        elif isinstance(pre_detection, dict):
            det_items = pre_detection.get("detected_items") or pre_detection.get("items") or []

        if det_items:
            render_context["detected_items"] = det_items
            print(f"[orchestrator] Merged {len(det_items)} detected_items from pre_detection_result into render_context")
        else:
            print(f"[orchestrator] WARNING: No detected_items found in pre_detection_result — category matching will be degraded")

    # ── STAGE 1: Preprocessing ────────────────────────────────────────────────
    # Check: rooms.preprocessed_image_url
    preprocessed_url: str = row.get("preprocessed_image_url") or ""
    if preprocessed_url:
        print(f"[orchestrator] Stage 1 SKIP — preprocessed_image_url already set")
    else:
        print(f"[orchestrator] Stage 1 START — preprocessing for room {room_id}")
        client.table("rooms").update(
            {"redesign_status": "preprocessing"}
        ).eq("id", room_id).execute()

        try:
            preprocess_fn = _modal.Function.from_name(
                "cova-preprocessing-pipeline", "preprocess_room_photo"
            )
            preprocessed_url = preprocess_fn.remote(image_url, room_id)
            print(f"[orchestrator] Stage 1 DONE: {preprocessed_url[:80]}...")

            # Persist
            try:
                client.table("rooms").update(
                    {"preprocessed_image_url": preprocessed_url}
                ).eq("id", room_id).execute()
            except Exception as e:
                print(f"[orchestrator] Warning: could not persist preprocessed_image_url: {e}")

        except Exception as prep_err:
            print(f"[orchestrator] Stage 1 FAILED — using raw image_url as fallback: {prep_err}")
            preprocessed_url = image_url  # non-critical, continue

    # ── STAGE 2: Professionalization (runs BEFORE depth extraction) ───────────
    # Moved before structural extraction so depth is computed from cleaned image.
    # Check: rooms.professionalized_image_url
    professionalized_url: str = row.get("professionalized_image_url") or ""
    if professionalized_url:
        print(f"[orchestrator] Stage 2 SKIP — professionalized_image_url already set")
    else:
        print(f"[orchestrator] Stage 2 START — professionalization for room {room_id}")
        client.table("rooms").update(
            {"redesign_status": "professionalizing"}
        ).eq("id", room_id).execute()

        try:
            prof_fn = _modal.Function.from_name(
                "cova-professionalization", "professionalize_room"
            )
            # Depth and edge not yet available at this stage — pass preprocessed_url as fallback.
            # professionalize_room uses them for ControlNet; preprocessed image is a safe proxy.
            professionalized_url = prof_fn.remote(
                preprocessed_url,
                preprocessed_url,   # depth fallback
                preprocessed_url,   # edge fallback
                room_id,
                removal_target_count=remove_count,
            )
            print(f"[orchestrator] Stage 2 DONE: {professionalized_url[:80]}...")

            # professionalize_room writes professionalized_image_url to DB internally.
            # We also persist it here for certainty (quality-gate skip path returns
            # preprocessed_url without updating DB).
            try:
                client.table("rooms").update(
                    {"professionalized_image_url": professionalized_url}
                ).eq("id", room_id).execute()
            except Exception as e:
                print(f"[orchestrator] Warning: could not persist professionalized_image_url: {e}")

        except Exception as prof_err:
            print(f"[orchestrator] Stage 2 FAILED — using preprocessed as fallback: {prof_err}")
            professionalized_url = preprocessed_url

    # ── STAGE 3: Structural Extraction (depth + edges from professionalized image) ──
    # Skip only if depth + edge already exist AND they were extracted from the
    # professionalized image (professionalized_before_depth flag in render_context).
    # Old runs (flag missing) are forced to re-extract so depth reflects cleaned geometry.
    depth_map_url: str = render_context.get("depth_map_url") or ""
    edge_map_url: str = render_context.get("edge_map_url") or ""
    professionalized_before_depth: bool = bool(render_context.get("professionalized_before_depth", False))

    if depth_map_url and edge_map_url and professionalized_before_depth:
        print(f"[orchestrator] Stage 3 SKIP — depth + edge maps already in render_context (professionalized_before_depth=True)")
    else:
        if depth_map_url and edge_map_url and not professionalized_before_depth:
            print(f"[orchestrator] Stage 3 FORCE RE-EXTRACT — depth was extracted before professionalization, re-running from professionalized image")
        else:
            print(f"[orchestrator] Stage 3 START — structural extraction from professionalized image for room {room_id}")
        client.table("rooms").update(
            {"redesign_status": "extracting_structure"}
        ).eq("id", room_id).execute()

        try:
            extract_depth_fn = _modal.Function.from_name(
                "cova-structural-extraction", "extract_depth_map"
            )
            extract_edges_fn = _modal.Function.from_name(
                "cova-structural-extraction", "extract_canny_edges"
            )

            _depth_res: list = [None]
            _edges_res: list = [None]
            _depth_err: list = [None]
            _edges_err: list = [None]

            # Source: professionalized image (cleaned geometry, no clutter)
            depth_edge_source = professionalized_url or preprocessed_url

            def _run_depth():
                try:
                    _depth_res[0] = extract_depth_fn.remote(depth_edge_source, room_id)
                except Exception as e:
                    _depth_err[0] = e

            def _run_edges():
                try:
                    _edges_res[0] = extract_edges_fn.remote(depth_edge_source, room_id)
                except Exception as e:
                    _edges_err[0] = e

            with ThreadPoolExecutor(max_workers=2) as ex:
                futs = [ex.submit(_run_depth), ex.submit(_run_edges)]
                for _ in as_completed(futs):
                    pass

            if _depth_err[0]:
                print(f"[orchestrator] Stage 3 depth failed (non-critical): {_depth_err[0]}")
            if _edges_err[0]:
                print(f"[orchestrator] Stage 3 edges failed (non-critical): {_edges_err[0]}")

            if _depth_res[0]:
                depth_map_url = _depth_res[0]
                print(f"[orchestrator] Stage 3 depth DONE: {depth_map_url[:80]}...")
            if _edges_res[0]:
                edge_map_url = _edges_res[0]
                print(f"[orchestrator] Stage 3 edges DONE: {edge_map_url[:80]}...")

            # Persist to render_context — include professionalized_before_depth flag
            try:
                updated_rc: dict = dict(render_context)
                if depth_map_url:
                    updated_rc["depth_map_url"] = depth_map_url
                if edge_map_url:
                    updated_rc["edge_map_url"] = edge_map_url
                updated_rc["professionalized_before_depth"] = True
                client.table("rooms").update(
                    {"render_context": updated_rc}
                ).eq("id", room_id).execute()
                render_context = updated_rc
            except Exception as e:
                print(f"[orchestrator] Warning: could not persist render_context with depth/edge: {e}")

        except Exception as struct_err:
            print(f"[orchestrator] Stage 3 lookup FAILED (non-critical, continuing without): {struct_err}")

    # ── STAGE 4: Generation — Phase 4b selective inpainting (always re-runs) ──
    print(f"[orchestrator] Stage 4 inputs (Phase 4b):")
    print(f"[orchestrator]   wall_change_requested: {wall_change_requested}")
    print(f"[orchestrator]   floor_change_requested: {floor_change_requested}")
    print(f"[orchestrator]   remove_count: {remove_count}")
    print(f"[orchestrator]   render_context keys: {list(render_context.keys())}")
    print(f"[orchestrator] Stage 4 START — Phase 4b generation for room {room_id}")
    client.table("rooms").update(
        {"redesign_status": "rendering"}
    ).eq("id", room_id).execute()

    effective_prompt = compiled_prompt or ""
    if not effective_prompt:
        print(f"[orchestrator] WARNING: no flux_prompt received — trying rooms.flux_prompt fallback")
        try:
            fp_row = client.table("rooms").select("flux_prompt").eq("id", room_id).single().execute()
            effective_prompt = (fp_row.data or {}).get("flux_prompt") or ""
        except Exception:
            pass
        if not effective_prompt:
            print(f"[orchestrator] ERROR: no prompt available for generation — aborting")
            client.table("rooms").update({
                "redesign_status": "failed",
                "redesign_error": "No flux_prompt available. Run Design Director first.",
            }).eq("id", room_id).execute()
            raise RuntimeError(f"Room {room_id}: no flux_prompt. Design Director must run before generation.")

    # Pass render_context with itemMasks and keep_remove_decisions for Phase 4b mask building
    # Merge keep_remove_decisions into render_context if not already there
    if "keep_remove_decisions" not in render_context and kept_item_mask_urls:
        # Build from kept_item_mask_urls — all are "keep" by inference
        render_context["keep_remove_decisions"] = {}

    try:
        gen_fn = _modal.Function.from_name("cova-generation", "generate_redesign_phase4b")
        gen_result = gen_fn.remote(
            room_id=room_id,
            user_id=user_id,
            original_photo_url=image_url,  # Original photo — critical for Fill Pro
            professionalized_photo_url=professionalized_url or image_url,
            style_prompt=effective_prompt,
            render_context=render_context,
            wall_change_requested=wall_change_requested,
            floor_change_requested=floor_change_requested,
            seed=seed,
            remove_count=remove_count,
        )

        final_url = gen_result.get("final_url") or gen_result.get("image_url") or ""
        seed_used = gen_result.get("seed")
        route_used = gen_result.get("route_used", "unknown")
        composite_applied = gen_result.get("composite_applied", False)
        raw_fal_url = gen_result.get("raw_fal_url", "")
        aesthetic_score = gen_result.get("aesthetic_score", 0.0)
        all_scores = gen_result.get("all_scores", [])
        print(f"[orchestrator] Stage 4 DONE — route: {route_used}, composite: {composite_applied}, aesthetic_score: {aesthetic_score:.2f}, final: {final_url[:80]}...")
        print(f"[orchestrator] All candidate scores: {all_scores}")
        print(f"[orchestrator] ── Pipeline COMPLETE for room {room_id} ──")

        # Persist the exact prompt sent to the model for audit/improvement
        # Use whichever prompt was actually used based on route
        actual_prompt = gen_result.get("fill_prompt_used") or gen_result.get("kontext_prompt_used") or effective_prompt
        try:
            client.table("rooms").update({
                "flux_prompt": actual_prompt,
            }).eq("id", room_id).execute()
            print(f"[orchestrator] flux_prompt persisted ({len((actual_prompt or '').split())} words), route={route_used}, seed={seed_used}")
        except Exception as fp_err:
            print(f"[orchestrator] Warning: could not persist flux_prompt: {fp_err}")

        # Store generation metadata in render_context for debugging
        try:
            updated_rc: dict = dict(render_context)
            updated_rc["generation_seed"] = seed_used
            updated_rc["route_used"] = route_used
            updated_rc["composite_applied"] = composite_applied
            updated_rc["raw_fal_url"] = raw_fal_url
            updated_rc["mask_url"] = gen_result.get("mask_url")
            updated_rc["endpoint_used"] = gen_result.get("endpoint_used")
            updated_rc["pipeline_version"] = "v4b"
            updated_rc["aesthetic_score"] = aesthetic_score
            updated_rc["all_scores"] = all_scores
            updated_rc["fill_prompt_used"] = gen_result.get("fill_prompt_used")
            updated_rc["kontext_prompt_used"] = gen_result.get("kontext_prompt_used")
            client.table("rooms").update(
                {"render_context": updated_rc}
            ).eq("id", room_id).execute()
            print(f"[orchestrator] render_context updated with Phase 4b metadata")
        except Exception as rc_err:
            print(f"[orchestrator] Warning: could not persist generation metadata: {rc_err}")

        return {
            "status": "complete",
            "room_id": room_id,
            "redesigned_pano_url": final_url,
            "seed_used": seed_used,
            "route_used": route_used,
            "aesthetic_score": aesthetic_score,
            "all_scores": all_scores,
        }

    except Exception as gen_err:
        print(f"[orchestrator] Stage 4 FAILED: {gen_err}")
        # generate_redesign sets redesign_status=failed in DB on its own errors.
        # Ensure it's set in case the error happened before that write.
        try:
            client.table("rooms").update({
                "redesign_status": "failed",
                "redesign_error": str(gen_err)[:2000],
            }).eq("id", room_id).execute()
        except Exception as db_err:
            print(f"[orchestrator] Could not write failed status: {db_err}")
        raise


# ---------------------------------------------------------------------------
# Webhook — HTTP entry point called by Next.js route
# ---------------------------------------------------------------------------

@app.function(
    timeout=30,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
    ],
)
@modal.fastapi_endpoint(method="POST")
def redesign_webhook(item: dict):
    """
    HTTP entry point for the redesign pipeline.

    Called by apps/web/app/api/pipeline/redesign/route.ts.
    Immediately spawns orchestrate_pipeline and returns {"status": "queued"}.
    The client polls /api/rooms/status every 3s for progress.

    Accepted payload fields:
      room_id          (required)
      user_id
      compiled_prompt  — FLUX staging script from Design Director / fallback compiler
      image_url        — raw or preprocessed room photo URL
      unsplash_references — list of style reference URLs (up to 5)
      lora_url         — style LoRA URL (direct HTTP URL or fal gallery path)
      lora_scale       — float [0.65, 0.95]
      seed             — integer for reproducibility

    Status sequence written to rooms.redesign_status:
      processing → preprocessing → extracting_structure → professionalizing
      → rendering → complete (or failed)
    """
    room_id = item.get("room_id")
    if not room_id:
        return {"error": "room_id required", "status": "error"}

    image_url = item.get("image_url") or ""
    if not image_url:
        return {"error": "image_url required", "status": "error"}

    user_id = item.get("user_id") or "unknown"
    compiled_prompt = item.get("compiled_prompt") or ""
    # Stacked LoRA stack — JSON array preferred; legacy single-LoRA as fallback
    loras_json = item.get("loras_json") or None
    lora_url = item.get("lora_url") or None
    lora_scale = float(item.get("lora_scale") or 0.75)
    seed = item.get("seed")
    unsplash_references = item.get("unsplash_references") or []
    remove_count = int(item.get("remove_count") or 0)
    # Differential diffusion change map
    change_map_url = item.get("change_map_url") or None
    kept_item_mask_urls = item.get("kept_item_mask_urls") or []
    wall_change_requested = bool(item.get("wall_change_requested", True))
    floor_change_requested = bool(item.get("floor_change_requested", False))

    print(
        f"[webhook] Received redesign request — room={room_id} "
        f"prompt_words={len(compiled_prompt.split())} "
        f"loras_json={'yes' if loras_json else 'no'} seed={seed} "
        f"refs={len(unsplash_references)} remove_count={remove_count} "
        f"change_map={'yes' if change_map_url else 'no'} masks={len(kept_item_mask_urls)}"
    )
    print(f"[webhook] loras_json received: {loras_json[:80] if loras_json else 'NONE — fallback will be used by generation.py'}")

    orchestrate_pipeline.spawn(
        room_id=room_id,
        user_id=user_id,
        compiled_prompt=compiled_prompt,
        unsplash_references=unsplash_references,
        seed=seed,
        image_url=image_url,
        remove_count=remove_count,
        loras_json=loras_json,
        lora_url=lora_url,
        lora_scale=lora_scale,
        change_map_url=change_map_url,
        kept_item_mask_urls=kept_item_mask_urls,
        wall_change_requested=wall_change_requested,
        floor_change_requested=floor_change_requested,
    )

    return {"status": "queued", "room_id": room_id, "pipeline": "v4b"}


# ---------------------------------------------------------------------------
# Local dev entry point
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def main(
    room_id: str = "test-room",
    image_url: str = "",
    flux_prompt: str = "Replace furniture with warm natural style pieces. Bright natural daylight, professional interior photography.",
):
    if not image_url:
        print(
            "Usage: modal run modal_pipeline/redesign_pipeline.py "
            "--room-id <ID> --image-url <URL> [--flux-prompt <PROMPT>]"
        )
        return

    import json as _json
    default_loras_json = _json.dumps([
        {"url": "https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-add-details/resolve/main/FLUX-dev-lora-add_details.safetensors", "scale": 0.55, "name": "detail-enhancer"},
        {"url": "https://huggingface.co/XLabs-AI/flux-RealismLora/resolve/main/lora.safetensors", "scale": 0.25, "name": "realism-lora"},
    ])

    result = orchestrate_pipeline.remote(
        room_id=room_id,
        user_id="local-test",
        compiled_prompt=flux_prompt,
        unsplash_references=[],
        seed=None,
        image_url=image_url,
        loras_json=default_loras_json,
    )
    print(f"[main] Result: {result}")
