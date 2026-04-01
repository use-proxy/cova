"""
Test script for M7 Session 3 — Marble Plus 3D lift.
Run: python modal_pipeline/test_marble_plus_session3.py
"""
import json
import sys
import time
from pathlib import Path

import requests

SESSION2_RESULTS_PATH = Path(__file__).parent / "test_session2_results.json"


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


def get_redesigned_pano_url():
    if SESSION2_RESULTS_PATH.exists():
        data = json.loads(SESSION2_RESULTS_PATH.read_text())
        url = data.get("redesigned_pano_url", "")
        if url:
            resp = requests.head(url, timeout=10)
            if resp.status_code == 200:
                print(f"Using Session 2 URL: {url[:80]}...")
                return url
            print(f"Session 2 URL expired (HTTP {resp.status_code})")

    fallback = (
        "https://replicate.delivery/xezq/"
        "kyeJiLsa6dTPD6Tnoi5bUBSvXlCyIfYESSvshIvvsLFkulWWA/"
        "tmpp32g36om.png"
    )
    resp = requests.head(fallback, timeout=10)
    if resp.status_code == 200:
        print("Using hardcoded fallback URL")
        return fallback

    print("ERROR: No accessible redesigned pano URL.")
    print("Re-run: python modal_pipeline/test_redesign_session2.py")
    sys.exit(1)


def test_marble_plus(pano_url, env):
    marble_key = env.get("MARBLE_API_KEY", "")
    if not marble_key:
        print("ERROR: MARBLE_API_KEY not set")
        sys.exit(1)

    BASE = "https://api.worldlabs.ai/marble/v1"
    headers = {"WLT-Api-Key": marble_key, "Content-Type": "application/json"}

    print("=== Testing Marble Plus Pipeline ===")

    # 1. Download pano
    print("\n1. Downloading redesigned panorama...")
    resp = requests.get(pano_url, timeout=60)
    resp.raise_for_status()
    pano_bytes = resp.content
    print(f"   Downloaded: {len(pano_bytes)/1e6:.1f}MB")

    # 2. Prepare upload
    print("\n2. Preparing Marble upload...")
    prep = requests.post(
        f"{BASE}/media-assets:prepare_upload", headers=headers,
        json={"file_name": "redesigned_room.png", "kind": "image", "extension": "png"},
    )
    prep.raise_for_status()
    d = prep.json()
    media_asset_id = d["media_asset"]["media_asset_id"]
    upload_url = d["upload_info"]["upload_url"]
    size_limit = d["upload_info"]["required_headers"]["x-goog-content-length-range"]
    print(f"   Media asset: {media_asset_id}")

    # 3. Upload
    print("\n3. Uploading to GCS...")
    up = requests.put(upload_url, data=pano_bytes,
                      headers={"x-goog-content-length-range": size_limit}, timeout=120)
    if up.status_code not in (200, 204):
        print(f"   FAILED: {up.status_code} {up.text[:200]}")
        sys.exit(1)
    print(f"   Upload OK (HTTP {up.status_code})")

    # 4. Generate Plus world
    print("\n4. Generating Marble Plus world (is_pano=true)...")
    gen = requests.post(f"{BASE}/worlds:generate", headers=headers, json={
        "model": "Marble 0.1-plus",
        "display_name": "Session 3 Test",
        "world_prompt": {
            "type": "image",
            "image_prompt": {
                "source": "media_asset",
                "media_asset_id": media_asset_id,
                "is_pano": True,
            },
        },
        "permission": {"public": False},
    })
    gen.raise_for_status()
    operation_id = gen.json()["operation_id"]
    print(f"   Operation: {operation_id}")

    # 5. Poll
    print("\n5. Polling (Plus takes ~5-6 minutes)...")
    start = time.time()
    world_id = None
    while time.time() - start < 600:
        poll = requests.get(f"{BASE}/operations/{operation_id}",
                            headers={"WLT-Api-Key": marble_key})
        result = poll.json()
        if result.get("done"):
            if result.get("error"):
                print(f"   FAILED: {result['error']}")
                sys.exit(1)
            world_id = (result.get("metadata", {}).get("world_id")
                        or result.get("response", {}).get("world_id"))
            elapsed = time.time() - start
            print(f"   Complete! World: {world_id} ({elapsed:.0f}s)")
            break
        elapsed = time.time() - start
        print(f"   Processing... {elapsed:.0f}s")
        time.sleep(15)

    if not world_id:
        print("   TIMED OUT")
        sys.exit(1)

    # 6. Fetch assets
    print("\n6. Fetching world assets...")
    spz_urls = {}
    pano_out = None
    thumbnail = None
    for attempt in range(8):
        w = requests.get(f"{BASE}/worlds/{world_id}",
                         headers={"WLT-Api-Key": marble_key}).json()
        spz_urls = w.get("assets", {}).get("splats", {}).get("spz_urls", {})
        pano_out = w.get("assets", {}).get("imagery", {}).get("pano_url")
        thumbnail = w.get("assets", {}).get("thumbnail_url")
        if spz_urls.get("full_res"):
            break
        print(f"   SPZ not ready, retry {attempt+1}/8...")
        time.sleep(10)

    print(f"\n=== RESULTS ===")
    print(f"  World ID: {world_id}")
    print(f"  Marble URL: https://marble.worldlabs.ai/world/{world_id}")
    print(f"  SPZ 100k: {spz_urls.get('100k', 'N/A')}")
    print(f"  SPZ 500k: {spz_urls.get('500k', 'N/A')}")
    print(f"  SPZ full_res: {spz_urls.get('full_res', 'N/A')}")
    print(f"  Pano URL: {pano_out or 'N/A'}")
    print(f"  Thumbnail: {thumbnail or 'N/A'}")

    return {
        "world_id": world_id,
        "marble_url": f"https://marble.worldlabs.ai/world/{world_id}",
        "spz_urls": spz_urls,
        "pano_url": pano_out,
        "thumbnail_url": thumbnail,
        "redesigned_pano_url": pano_url,
    }


if __name__ == "__main__":
    env = load_env()
    pano_url = get_redesigned_pano_url()
    results = test_marble_plus(pano_url, env)

    results_path = Path(__file__).parent / "test_session3_results.json"
    results_path.write_text(json.dumps(results, indent=2))
    print(f"\nResults saved to: {results_path}")
    print(f"View in Marble: {results['marble_url']}")

    spz = results["spz_urls"].get("full_res", "")
    if spz:
        check = requests.head(spz, timeout=10)
        print(f"SPZ accessible: {check.status_code == 200}")

    success = bool(results["spz_urls"].get("full_res"))
    print(f"\n{'Session 3 PASS' if success else 'Session 3 FAIL'}")
    sys.exit(0 if success else 1)
