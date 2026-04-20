"""
Quick test: fire generate_redesign_phase4b with correct params from DB.
Tests the area-based composite fix.
"""
import json
import os
import sys
from pathlib import Path

import modal


def load_env():
    env = {}
    env_path = Path(__file__).parent.parent / "apps" / "web" / ".env.local"
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        k, _, v = line.partition("=")
        if k and v:
            env[k.strip()] = v.strip()
    return env


def main():
    env = load_env()

    # Room cb2e7047 — the test room with full pipeline data
    room_id = "cb2e7047-c7ae-4253-bf2b-cc42a6f3a727"
    original_photo = "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/344b5705-61e3-4cc0-915d-b1f32bb99cd9/1776152283994.jpg"

    # Read render_context from DB
    from supabase import create_client
    client = create_client(
        env["NEXT_PUBLIC_SUPABASE_URL"],
        env["SUPABASE_SERVICE_ROLE_KEY"],
    )
    row = client.table("rooms").select(
        "professionalized_image_url, render_context, keep_remove_decisions, flux_prompt, pre_detection_result"
    ).eq("id", room_id).single().execute()
    data = row.data

    prof_url = data.get("professionalized_image_url") or original_photo
    flux_prompt = data.get("flux_prompt") or ""
    render_context = data.get("render_context") or {}
    if isinstance(render_context, str):
        render_context = json.loads(render_context)

    # Merge keep_remove_decisions into render_context
    krd = data.get("keep_remove_decisions") or []
    if krd and "keep_remove_decisions" not in render_context:
        render_context["keep_remove_decisions"] = krd

    # Merge detected_items from pre_detection_result if missing
    if "detected_items" not in render_context:
        pdr = data.get("pre_detection_result")
        if isinstance(pdr, str):
            pdr = json.loads(pdr)
        if isinstance(pdr, list):
            render_context["detected_items"] = pdr
        elif isinstance(pdr, dict):
            render_context["detected_items"] = pdr.get("detected_items", [])

    print(f"Room: {room_id}")
    print(f"Original: {original_photo[:80]}")
    print(f"Prof: {prof_url[:80]}")
    print(f"Prompt ({len(flux_prompt.split())} words): {flux_prompt[:150]}...")
    print(f"render_context keys: {list(render_context.keys())}")
    masks = render_context.get("itemMasks", {})
    print(f"itemMasks: {list(masks.keys())}")
    det = render_context.get("detected_items", [])
    print(f"detected_items: {[d.get('label') for d in det]}")
    print(f"masksReady: {render_context.get('masksReady')}")

    # Call generate_redesign_phase4b with CORRECT params:
    # wall_change_requested=False (preserve blue walls)
    # floor_change_requested=False (preserve carpet)
    gen_fn = modal.Function.from_name("cova-generation", "generate_redesign_phase4b")

    result = gen_fn.remote(
        room_id=room_id,
        user_id="test-composite-fix",
        original_photo_url=original_photo,
        professionalized_photo_url=prof_url,
        style_prompt=flux_prompt,
        render_context=render_context,
        wall_change_requested=False,   # PRESERVE blue walls
        floor_change_requested=False,  # PRESERVE carpet
        seed=42,
        remove_count=0,  # Kontext route (no masks available)
    )

    print(f"\n=== RESULT ===")
    print(f"Route: {result.get('route_used')}")
    print(f"Composite: {result.get('composite_applied')}")
    print(f"Final URL: {result.get('final_url')}")
    print(f"Raw FAL URL: {result.get('raw_fal_url')}")


if __name__ == "__main__":
    main()
