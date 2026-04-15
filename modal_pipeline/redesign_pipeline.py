"""
Cova v3 — Redesign Pipeline Orchestrator (rewritten 2026-04-13)

Single entry point for the complete v3 redesign pipeline.
App name kept as "cova-redesign-pipeline" so REDESIGN_PIPELINE_WEBHOOK_URL
in .env.local continues to work without changes.

Pipeline stages (run in order, with idempotency skipping):
  1. Preprocessing    — cova-preprocessing-pipeline / preprocess_room_photo
  2. Professionalize  — cova-professionalization / professionalize_room  (moved before depth)
  3. Structural       — cova-structural-extraction / extract_depth_map + extract_canny_edges (parallel, from professionalized image)
  4. Generation       — cova-generation / generate_redesign_two_pass  ← always re-runs

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
    negative_prompt: str,
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
            "preprocessed_image_url, professionalized_image_url, render_context"
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

    # ── STAGE 4: Generation (always re-runs) ──────────────────────────────────
    # Log all differential diffusion inputs so any NONE values are immediately visible.
    print(f"[orchestrator] Stage 4 inputs:")
    print(f"[orchestrator]   change_map_url: {change_map_url or 'NONE'}")
    print(f"[orchestrator]   wall_change_requested: {wall_change_requested}")
    print(f"[orchestrator]   kept_item_mask_count: {len(kept_item_mask_urls or [])}")
    print(f"[orchestrator] Stage 4 START — generation for room {room_id} (always re-runs)")
    client.table("rooms").update(
        {"redesign_status": "rendering"}
    ).eq("id", room_id).execute()

    # Use photo as ControlNet fallback if depth/edge extraction failed
    effective_depth_gen = depth_map_url or professionalized_url
    effective_edge_gen = edge_map_url or professionalized_url

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

    try:
        gen_fn = _modal.Function.from_name("cova-generation", "generate_redesign_two_pass")
        gen_result = gen_fn.remote(
            professionalized_image_url=professionalized_url,
            depth_map_url=effective_depth_gen,
            edge_map_url=effective_edge_gen,
            flux_prompt=effective_prompt,
            loras_json=loras_json,
            unsplash_reference_urls=unsplash_references or [],
            room_id=room_id,
            remove_count=remove_count,
            seed=seed,
            change_map_url=change_map_url,
            kept_item_mask_urls=kept_item_mask_urls or [],
            wall_change_requested=wall_change_requested,
        )

        final_url = gen_result.get("final_url") or ""
        seed_used = gen_result.get("seed")
        print(f"[orchestrator] Stage 4 DONE — final: {final_url[:80]}...")
        print(f"[orchestrator] ── Pipeline COMPLETE for room {room_id} ──")

        # Store both pass URLs in render_context for debugging during tuning
        try:
            import json as _json
            updated_rc: dict = dict(render_context)
            updated_rc["pass1_url"] = gen_result.get("pass1_url") or ""
            updated_rc["pass2_url"] = gen_result.get("pass2_url") or ""
            updated_rc["generation_seed"] = seed_used
            updated_rc["pass1_depth_scale"] = gen_result.get("pass1_depth_scale")
            updated_rc["pass2_strength"] = gen_result.get("pass2_strength")
            updated_rc["loras_active"] = gen_result.get("loras_active", False)
            client.table("rooms").update(
                {"render_context": updated_rc}
            ).eq("id", room_id).execute()
            print(f"[orchestrator] render_context updated with pass1/pass2 URLs")
        except Exception as rc_err:
            print(f"[orchestrator] Warning: could not persist pass URLs to render_context: {rc_err}")

        return {
            "status": "complete",
            "room_id": room_id,
            "redesigned_pano_url": final_url,
            "seed_used": seed_used,
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
      negative_prompt
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
    negative_prompt = item.get("negative_prompt") or ""
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
        negative_prompt=negative_prompt,
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
    )

    return {"status": "queued", "room_id": room_id, "pipeline": "v4"}


# ---------------------------------------------------------------------------
# Local dev entry point
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def main(
    room_id: str = "test-room",
    image_url: str = "",
    flux_prompt: str = "A warm minimalist bedroom with natural oak furniture, clean linen textiles.",
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
        negative_prompt="",
        unsplash_references=[],
        seed=None,
        image_url=image_url,
        loras_json=default_loras_json,
    )
    print(f"[main] Result: {result}")
