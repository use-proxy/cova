"""
End-to-end pipeline test: 8 photos through the full Cova pipeline.
Calls Modal webhooks directly (bypasses Next.js auth layer).
Usage: python3 test_pipeline_e2e.py
"""

import os
import json
import time
import sys
import uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError

# ── Config ──────────────────────────────────────────────────────────────────

SUPABASE_URL = "https://xdeacbmkdwqrwxonqaqh.supabase.co"
SUPABASE_KEY = "sb_secret_cJ8WZF5uvgwcKnJlZqqOEA_pkQnKsV3"

MULTI_IMAGE_WEBHOOK = "https://cova-interior--cova-marble-multi-image-marble-multi-imag-8e33ed.modal.run"
DEPTH_VIDEO_WEBHOOK = "https://cova-interior--cova-depth-video-depth-video-webhook.modal.run"
FURNITURE_WEBHOOK = "https://cova-interior--cova-furniture-matching-furniture-matchin-f34071.modal.run"
PLUS_WEBHOOK = "https://cova-interior--cova-marble-plus-pipeline-marble-plus-webhook.modal.run"

USER_ID = "863c7799-accd-42e6-bac2-d4697b111542"

PHOTO_URLS = [
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9864.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjQuanBlZyIsImlhdCI6MTc3NTA5MjU0OCwiZXhwIjoxNzc1Njk3MzQ4fQ.U9ZaG_T8A0Lel6hvji7hjK1XbA7fYPBZzF9XDwIggug",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9865.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjUuanBlZyIsImlhdCI6MTc3NTA5MjU1MywiZXhwIjoxNzc1Njk3MzUzfQ.9oLEzwm86Phn4Sbak_Gx58M4SkZag2CyGUlC_6rK_6c",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9866.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjYuanBlZyIsImlhdCI6MTc3NTA5MjU1OCwiZXhwIjoxNzc1Njk3MzU4fQ.78pu7tu-f_0yx8Fh0s7mSKRh-EE4XKtZwJ0H22yWnFQ",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9867.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjcuanBlZyIsImlhdCI6MTc3NTA5MjU2MywiZXhwIjoxNzc1Njk3MzYzfQ.6THWsEfixPQLTX5D2Bt-2Fi5gYI0lJsO2-ZGMWE2WUc",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9868.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjguanBlZyIsImlhdCI6MTc3NTA5MjU3MCwiZXhwIjoxNzc1Njk3MzcwfQ.-fzLLvlIbOfwL_Vu_qI8fJKHlAtY2H74zem_mcRuPHY",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9869.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjkuanBlZyIsImlhdCI6MTc3NTA5MjU3NywiZXhwIjoxNzc1Njk3Mzc3fQ.zRNmIdJlLxsoI2iZ9Lxe74m0MwaC39E_gmRcDfkPKIc",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9870.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NzAuanBlZyIsImlhdCI6MTc3NTA5MjU4MSwiZXhwIjoxNzc1Njk3MzgxfQ.84C_gZCtl0znaD5eOznpKqFOxPHXjhZMfqEhrPN_hHs",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9871.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NzEuanBlZyIsImlhdCI6MTc3NTA5MjU4OCwiZXhwIjoxNzc1Njk3Mzg4fQ.MoZii0vQ-iGosDkkCMlP96xG0nM2SIzmdMMmsXTBeDg",
]

POLL_INTERVAL = 15
MAX_WAIT = 900  # 15 minutes

TERMINAL_STATUSES = {"video_ready", "complete", "error"}

# ── Helpers ─────────────────────────────────────────────────────────────────

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def sb_request(method, path, body=None):
    """Make a Supabase REST API call."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    data = json.dumps(body).encode() if body else None
    headers = dict(SB_HEADERS)
    if method == "POST":
        headers["Prefer"] = "return=representation"
    if method == "PATCH":
        headers["Prefer"] = "return=minimal"
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=30) as resp:
            body_bytes = resp.read()
            return json.loads(body_bytes) if body_bytes else None
    except HTTPError as e:
        err = e.read().decode()
        raise RuntimeError(f"Supabase {method} {path} -> {e.code}: {err}")


def webhook_call(url, body):
    """Fire a Modal webhook. Returns response JSON."""
    data = json.dumps(body).encode()
    req = Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urlopen(req, timeout=600) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        err = e.read().decode()
        print(f"  WEBHOOK ERROR {e.code}: {err[:500]}")
        raise RuntimeError(f"Webhook {url.split('--')[1][:40]} -> {e.code}: {err[:200]}")


def webhook_fire_and_forget(url, body):
    """Fire a webhook without waiting for response (background thread)."""
    import threading

    def _call():
        try:
            result = webhook_call(url, body)
            print(f"  [bg] {url.split('--')[1][:40]} -> {result.get('status', 'unknown')}")
        except Exception as e:
            print(f"  [bg] {url.split('--')[1][:40]} -> ERROR: {e}")

    t = threading.Thread(target=_call, daemon=True)
    t.start()
    return t


def get_room(room_id, fields="*"):
    """Fetch room record."""
    rows = sb_request("GET", f"rooms?id=eq.{room_id}&select={fields}")
    return rows[0] if rows else None


def poll_status(room_id, target_statuses, timeout_s=MAX_WAIT, interval_s=POLL_INTERVAL):
    """Poll redesign_status until it reaches one of target_statuses."""
    start = time.time()
    last_status = None
    while time.time() - start < timeout_s:
        room = get_room(room_id, "redesign_status")
        status = room.get("redesign_status", "unknown") if room else "not_found"
        elapsed = time.time() - start

        if status != last_status:
            ts = time.strftime("%H:%M:%S")
            print(f"  [{ts}] {elapsed:6.0f}s  {last_status or '(start)'} -> {status}")
            last_status = status

        if status in target_statuses:
            return status

        time.sleep(interval_s)

    raise RuntimeError(f"Timeout after {timeout_s}s waiting for {target_statuses}, last={last_status}")


# ── Pipeline Stages ─────────────────────────────────────────────────────────

def stage_create_room():
    """Create a test room with 8 photo URLs."""
    room_id = str(uuid.uuid4())
    print(f"\n{'='*60}")
    print(f"STAGE 0: Create test room")
    print(f"  Room ID: {room_id}")
    print(f"  Photos:  {len(PHOTO_URLS)}")
    print(f"{'='*60}")

    rows = sb_request("POST", "rooms", {
        "id": room_id,
        "user_id": USER_ID,
        "name": "E2E Pipeline Test",
        "room_type": "living_room",
        "status": "processing",
        "redesign_status": "queued",
        "capture_mode": "multi_image",
        "capture_photo_urls": PHOTO_URLS,
        "pipeline_mode": "full",
        "style_blend": {"japandi": 0.7, "minimalist": 0.3, "coastal": 0, "bohemian": 0, "mid_century": 0},
        "budget": 2500,
        "dimensions_json": {"width": 16, "depth": 14, "height": 9, "unit": "ft"},
        "wall_color_extracted": "#F5F0EB",
        "pipeline_cost_log": {"mode": "full", "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")},
    })
    print(f"  Created: {rows[0]['id']}")
    return room_id


def stage_multi_image(room_id):
    """Stage 1: Fire Multi-Image Mini reconstruction."""
    print(f"\n{'='*60}")
    print(f"STAGE 1: Multi-Image Mini (reconstruct_images)")
    print(f"  Webhook: {MULTI_IMAGE_WEBHOOK.split('--')[1][:50]}")
    print(f"  Photos:  {len(PHOTO_URLS)}")
    print(f"{'='*60}")

    t0 = time.time()
    result = webhook_call(MULTI_IMAGE_WEBHOOK, {
        "room_id": room_id,
        "photo_urls": PHOTO_URLS,
    })
    elapsed = time.time() - t0

    status = result.get("status", "unknown")
    print(f"  Result:  {status} in {elapsed:.0f}s")
    if status == "error":
        print(f"  ERROR:   {result.get('error', 'unknown')[:300]}")
        raise RuntimeError(f"Multi-image failed: {result.get('error', '')[:200]}")

    print(f"  World:   {result.get('world_id', 'n/a')}")
    print(f"  Pano:    {result.get('pano_url', 'n/a')[:80]}...")
    print(f"  SPZ:     {result.get('spz_full', 'n/a')[:80]}...")
    return result


def stage_parallel_fires(room_id):
    """Stage 2: Fire depth-video, furniture-matching, and Plus in parallel."""
    print(f"\n{'='*60}")
    print(f"STAGE 2: Parallel fires (depth-video + furniture + Plus)")
    print(f"{'='*60}")

    # Read the room to get pano and style data
    room = get_room(room_id, "redesign_pano_url,marble_pano_url,style_blend")
    pano_url = room.get("redesign_pano_url") or room.get("marble_pano_url")
    style_blend = room.get("style_blend") or {}

    if not pano_url:
        print("  WARNING: No pano URL found, using marble_pano_url from Mini stage")
        room2 = get_room(room_id, "marble_pano_url")
        pano_url = room2.get("marble_pano_url")

    # Set redesign_pano_url if only marble_pano_url exists (skip FLUX for test)
    if pano_url and not room.get("redesign_pano_url"):
        print(f"  Setting redesign_pano_url = marble_pano_url (skipping FLUX for test)")
        sb_request("PATCH", f"rooms?id=eq.{room_id}", {
            "redesign_pano_url": pano_url,
            "redesign_status": "kontext_complete",
        })

    print(f"  Pano:    {(pano_url or 'NONE')[:80]}...")
    print(f"  Style:   {style_blend}")

    # Set plus_started_at
    sb_request("PATCH", f"rooms?id=eq.{room_id}", {
        "plus_started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    })

    # Fire all three in parallel (background threads)
    threads = []

    print(f"\n  Firing depth-video...")
    threads.append(webhook_fire_and_forget(DEPTH_VIDEO_WEBHOOK, {
        "room_id": room_id,
        "pano_url": pano_url,
        "style_blend": style_blend,
        "hotspot_azimuths": [],
    }))

    print(f"  Firing furniture-matching...")
    threads.append(webhook_fire_and_forget(FURNITURE_WEBHOOK, {
        "room_id": room_id,
        "user_id": USER_ID,
        "fixed_furniture": [],
    }))

    print(f"  Firing Plus (background, ~5-8 min)...")
    threads.append(webhook_fire_and_forget(PLUS_WEBHOOK, {
        "room_id": room_id,
        "user_id": USER_ID,
    }))

    return threads


def stage_poll(room_id):
    """Stage 3: Poll until video_ready or complete."""
    print(f"\n{'='*60}")
    print(f"STAGE 3: Polling for completion")
    print(f"  Target:  video_ready | complete | error")
    print(f"  Timeout: {MAX_WAIT}s")
    print(f"{'='*60}")

    final = poll_status(room_id, TERMINAL_STATUSES)
    return final


def stage_final_report(room_id):
    """Stage 4: Print final room state."""
    print(f"\n{'='*60}")
    print(f"FINAL REPORT")
    print(f"{'='*60}")

    room = get_room(room_id)
    if not room:
        print("  ERROR: Room not found")
        return {}

    # Key fields to report
    report_fields = [
        "id", "redesign_status", "pipeline_mode",
        "marble_world_id", "marble_pano_url", "marble_mini_spz_url",
        "marble_spz_url_500k", "marble_spz_url_100k",
        "redesign_pano_url",
        "flythrough_ready", "flythrough_video_url", "flythrough_duration_seconds",
        "plus_upgrade_ready", "plus_started_at", "plus_completed_at",
        "marble_plus_world_id", "marble_spz_url",
        "marble_plus_pano_url", "marble_plus_thumbnail_url",
        "furniture_matches_count", "hotspot_timing",
        "pre_detection_result",
        "pipeline_cost_log",
    ]

    for field in report_fields:
        val = room.get(field)
        if val is None:
            continue
        if isinstance(val, str) and len(val) > 100:
            val = val[:100] + "..."
        if isinstance(val, list) and len(val) > 3:
            val = f"[{len(val)} items]"
        print(f"  {field}: {val}")

    return room


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    print("Cova E2E Pipeline Test — 8 Photos")
    print(f"Started: {time.strftime('%Y-%m-%d %H:%M:%S')}")

    results = {"started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")}
    t0 = time.time()

    try:
        # Create room
        room_id = stage_create_room()
        results["room_id"] = room_id

        # Stage 1: Multi-Image Mini
        t1 = time.time()
        mini_result = stage_multi_image(room_id)
        results["stage1_multi_image"] = {
            "status": mini_result.get("status"),
            "world_id": mini_result.get("world_id"),
            "time_s": round(time.time() - t1, 1),
        }

        # Stage 2: Parallel fires (skip FLUX, use marble_pano_url as redesign_pano_url)
        t2 = time.time()
        threads = stage_parallel_fires(room_id)
        results["stage2_fired_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")

        # Stage 3: Poll
        final_status = stage_poll(room_id)
        results["stage3_final_status"] = final_status
        results["stage3_time_s"] = round(time.time() - t2, 1)

        # Wait a bit for background threads to finish reporting
        print("\n  Waiting 10s for background webhooks to report...")
        time.sleep(10)

        # Stage 4: Final report
        room = stage_final_report(room_id)
        results["final_room"] = {
            "redesign_status": room.get("redesign_status"),
            "flythrough_ready": room.get("flythrough_ready"),
            "flythrough_video_url": room.get("flythrough_video_url"),
            "plus_upgrade_ready": room.get("plus_upgrade_ready"),
            "furniture_matches_count": room.get("furniture_matches_count"),
            "marble_world_id": room.get("marble_world_id"),
            "marble_plus_world_id": room.get("marble_plus_world_id"),
        }

    except Exception as e:
        print(f"\n  PIPELINE ERROR: {e}")
        results["error"] = str(e)

    results["total_time_s"] = round(time.time() - t0, 1)
    results["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")

    # Summary
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"  Total time: {results['total_time_s']}s")
    print(f"  Room ID:    {results.get('room_id', 'n/a')}")
    if "error" in results:
        print(f"  ERROR:      {results['error'][:200]}")
    else:
        fr = results.get("final_room", {})
        print(f"  Status:     {fr.get('redesign_status')}")
        print(f"  Flythrough: {fr.get('flythrough_ready')} ({(fr.get('flythrough_video_url') or 'n/a')[:80]})")
        print(f"  Plus:       {fr.get('plus_upgrade_ready')}")
        print(f"  Matches:    {fr.get('furniture_matches_count')}")

    out_path = "test_pipeline_e2e_results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    main()
