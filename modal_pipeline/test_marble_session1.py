"""
Test script for M7 Session 1 — Marble video processing.
Run: python modal_pipeline/test_marble_session1.py
"""
import json
import sys
import time
from pathlib import Path

import requests


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


def test_marble_api(env: dict):
    """Test Marble API directly with the trimmed test video."""
    marble_key = env.get("MARBLE_API_KEY", "")
    if not marble_key:
        print("ERROR: MARBLE_API_KEY not set")
        return False

    print("=== Testing Marble API directly ===")

    test_video = Path(__file__).parent / "test_trimmed.mp4"
    if not test_video.exists():
        test_video = Path.home() / "Downloads" / "test1_trimmed.mp4"
    if not test_video.exists():
        print(f"ERROR: No test video found at {test_video}")
        print(
            "Run: ffmpeg -i ~/Downloads/test1.mp4 -t 55 -vcodec libx264 "
            "-crf 28 -preset fast modal_pipeline/test_trimmed.mp4"
        )
        return False

    size_mb = test_video.stat().st_size / 1e6
    print(f"Using test video: {test_video} ({size_mb:.1f}MB)")

    BASE_URL = "https://api.worldlabs.ai/marble/v1"
    headers = {"WLT-Api-Key": marble_key, "Content-Type": "application/json"}

    # Upload
    print("\n1. Preparing upload...")
    resp = requests.post(
        f"{BASE_URL}/media-assets:prepare_upload",
        headers=headers,
        json={"file_name": "room.mp4", "kind": "video", "extension": "mp4"},
    )
    resp.raise_for_status()
    data = resp.json()
    media_asset_id = data["media_asset"]["media_asset_id"]
    upload_url = data["upload_info"]["upload_url"]
    size_limit = data["upload_info"]["required_headers"]["x-goog-content-length-range"]
    print(f"   Media asset ID: {media_asset_id}")

    print("2. Uploading video...")
    with open(test_video, "rb") as f:
        video_bytes = f.read()
    upload_resp = requests.put(
        upload_url,
        data=video_bytes,
        headers={"x-goog-content-length-range": size_limit},
    )
    if upload_resp.status_code not in (200, 204):
        print(f"   FAILED: {upload_resp.status_code} {upload_resp.text[:200]}")
        return False
    print(f"   Upload successful ({len(video_bytes) / 1e6:.1f}MB)")

    print("3. Generating Mini world...")
    gen_resp = requests.post(
        f"{BASE_URL}/worlds:generate",
        headers=headers,
        json={
            "model": "Marble 0.1-mini",
            "display_name": "M7 Session 1 Test",
            "world_prompt": {
                "type": "video",
                "video_prompt": {
                    "source": "media_asset",
                    "media_asset_id": media_asset_id,
                },
            },
            "permission": {"public": False},
        },
    )
    gen_resp.raise_for_status()
    operation_id = gen_resp.json()["operation_id"]
    print(f"   Operation ID: {operation_id}")

    print("4. Polling...")
    start = time.time()
    world_id = None
    while time.time() - start < 300:
        poll = requests.get(
            f"{BASE_URL}/operations/{operation_id}",
            headers={"WLT-Api-Key": marble_key},
        )
        result = poll.json()
        if result.get("done"):
            if result.get("error"):
                print(f"   FAILED: {result['error']}")
                desc = (
                    result.get("metadata", {})
                    .get("progress", {})
                    .get("description", "")
                )
                print(f"   Description: {desc}")
                return False
            world_id = result.get("metadata", {}).get("world_id") or result.get(
                "response", {}
            ).get("world_id")
            elapsed = time.time() - start
            print(f"   Complete! World ID: {world_id} ({elapsed:.0f}s)")
            break
        elapsed = time.time() - start
        print(f"   Processing... {elapsed:.0f}s")
        time.sleep(10)

    if not world_id:
        print("   TIMED OUT")
        return False

    print("5. Fetching world assets...")
    pano_url = None
    spz_urls = {}
    for attempt in range(8):
        world_resp = requests.get(
            f"{BASE_URL}/worlds/{world_id}",
            headers={"WLT-Api-Key": marble_key},
        )
        world = world_resp.json()
        pano_url = world.get("assets", {}).get("imagery", {}).get("pano_url")
        spz_urls = world.get("assets", {}).get("splats", {}).get("spz_urls", {})
        if pano_url:
            break
        print(f"   pano_url null, retry {attempt + 1}/8...")
        time.sleep(5)

    print(f"\n=== RESULTS ===")
    print(f"  World ID: {world_id}")
    print(f"  Marble URL: https://marble.worldlabs.ai/world/{world_id}")
    print(f"  pano_url: {pano_url}")
    print(f"  spz 100k: {spz_urls.get('100k', 'N/A')}")
    print(f"  spz 500k: {spz_urls.get('500k', 'N/A')}")
    print(f"  spz full_res: {spz_urls.get('full_res', 'N/A')}")

    results = {
        "world_id": world_id,
        "pano_url": pano_url,
        "spz_urls": spz_urls,
        "marble_url": f"https://marble.worldlabs.ai/world/{world_id}",
    }
    results_path = Path(__file__).parent / "test_session1_results.json"
    results_path.write_text(json.dumps(results, indent=2))
    print(f"\n  Results saved to: {results_path}")

    if pano_url:
        pano_resp = requests.head(pano_url)
        print(f"  Pano accessible: {pano_resp.status_code == 200}")

    return pano_url is not None


if __name__ == "__main__":
    env = load_env()
    success = test_marble_api(env)
    sys.exit(0 if success else 1)
