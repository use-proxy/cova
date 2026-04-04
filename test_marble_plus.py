"""
Marble API Test Plus: Marble 0.1-plus with 8 photos + reconstruct_images.
Reuses media asset IDs from marble_comparison_results_f.json (no re-upload).
Usage: MARBLE_API_KEY=... python3 test_marble_plus.py
"""

import os
import json
import time
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError

MARBLE_BASE = "https://api.worldlabs.ai/marble/v1"
MARBLE_KEY = os.environ.get("MARBLE_API_KEY", "")

POLL_INTERVAL = 15  # Plus takes longer, poll less aggressively
MAX_POLL_TIME = 900  # 15 minutes for Plus


def api(method, path, body=None):
    url = f"{MARBLE_BASE}{path}"
    headers = {"WLT-Api-Key": MARBLE_KEY, "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body else None
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        err_body = e.read().decode()
        print(f"\n  API ERROR {e.code}:")
        try:
            print(json.dumps(json.loads(err_body), indent=2))
        except Exception:
            print(err_body)
        raise RuntimeError(f"Marble API {method} {path} -> {e.code}: {err_body}")


def poll_operation(operation_id, label):
    start = time.time()
    while time.time() - start < MAX_POLL_TIME:
        result = api("GET", f"/operations/{operation_id}")
        elapsed = time.time() - start

        if result.get("done"):
            if result.get("error"):
                print(f"\n  [{label}] Operation failed. Full response:")
                print(json.dumps(result, indent=2))
                raise RuntimeError(f"[{label}] Failed: {result['error']}")
            print(f"  [{label}] Complete in {elapsed:.0f}s")
            return result.get("response", {})

        print(f"  [{label}] Polling... {elapsed:.0f}s")
        time.sleep(POLL_INTERVAL)

    raise RuntimeError(f"[{label}] Timed out after {MAX_POLL_TIME}s")


def fetch_world_assets(world_id, label, max_retries=12):
    for attempt in range(max_retries):
        data = api("GET", f"/worlds/{world_id}")
        assets = data.get("assets", {})
        splats = assets.get("splats", {}).get("spz_urls", {})
        pano_url = assets.get("imagery", {}).get("pano_url")
        thumbnail = assets.get("thumbnail_url")

        spz_full = splats.get("full_res") or splats.get("fullres") or splats.get("full")
        if spz_full:
            print(f"  [{label}] Assets ready (attempt {attempt + 1})")
            return {
                "world_id": world_id,
                "marble_url": f"https://marble.worldlabs.ai/world/{world_id}",
                "spz_full": spz_full,
                "spz_500k": splats.get("500k", ""),
                "spz_100k": splats.get("100k", ""),
                "pano_url": pano_url or "",
                "thumbnail_url": thumbnail or "",
            }

        if attempt < max_retries - 1:
            print(f"  [{label}] SPZ not ready, retry {attempt + 1}/{max_retries}...")
            time.sleep(10)

    raise RuntimeError(f"[{label}] SPZ never became available")


def load_asset_ids():
    """Load media asset IDs from Test F results."""
    path = "marble_comparison_results_f.json"
    if not os.path.exists(path):
        print(f"ERROR: {path} not found. Run test_marble_f.py first.")
        sys.exit(1)

    with open(path) as f:
        data = json.load(f)

    test_f = data.get("test_f", {})
    if "error" in test_f:
        print(f"ERROR: Test F failed: {test_f['error'][:100]}")
        sys.exit(1)

    asset_ids = test_f.get("asset_ids", [])
    if len(asset_ids) < 8:
        print(f"ERROR: Expected 8 asset_ids in Test F results, got {len(asset_ids)}")
        sys.exit(1)

    return asset_ids


def run_test_plus(asset_ids):
    """Marble 0.1-plus with 8 photos + reconstruct_images."""
    print("\n" + "=" * 60)
    print("TEST PLUS: 8 portrait 1x — Marble 0.1-plus + reconstruct_images")
    print("  Reusing asset IDs from Test F (no re-upload)")
    print("=" * 60)

    n = len(asset_ids)
    t0 = time.time()

    multi_image_prompt = [
        {
            "azimuth": None,
            "content": {
                "source": "media_asset",
                "media_asset_id": aid,
            },
        }
        for aid in asset_ids
    ]

    request_body = {
        "model": "Marble 0.1-plus",
        "display_name": "Cova Test Plus — 8 portrait reconstruct",
        "world_prompt": {
            "type": "multi-image",
            "multi_image_prompt": multi_image_prompt,
            "reconstruct_images": True,
            "text_prompt": "photorealistic indoor residential room, accurate spatial geometry",
            "disable_recaption": True,
        },
        "permission": {"public": False},
    }

    print(f"\n  Request body:")
    print(json.dumps(request_body, indent=2))

    gen = api("POST", "/worlds:generate", request_body)

    operation_id = gen["operation_id"]
    print(f"\n  Operation: {operation_id}")

    response = poll_operation(operation_id, "plus")
    world_id = response.get("world_id")
    if not world_id:
        raise RuntimeError(f"No world_id in response: {response}")

    print("\nFetching world assets...")
    assets = fetch_world_assets(world_id, "plus")
    total_time = time.time() - t0

    assets["method"] = "multi-image-reconstruct"
    assets["label"] = "Plus-portrait-1x-reconstruct"
    assets["model"] = "Marble 0.1-plus"
    assets["photo_count"] = n
    assets["reconstruct_images"] = True
    assets["asset_ids"] = asset_ids
    assets["total_time_s"] = round(total_time, 1)

    print(f"\n  World ID:  {assets['world_id']}")
    print(f"  Marble:    {assets['marble_url']}")
    print(f"  SPZ Full:  {assets['spz_full']}")
    print(f"  SPZ 500k:  {assets['spz_500k']}")
    print(f"  Pano:      {assets['pano_url']}")
    print(f"  Total:     {total_time:.0f}s")

    return assets


def main():
    if not MARBLE_KEY:
        print("ERROR: Set MARBLE_API_KEY environment variable")
        sys.exit(1)

    print("Marble API Test Plus — Marble 0.1-plus + reconstruct_images")
    print(f"API Key: {MARBLE_KEY[:8]}...")

    print("\nLoading asset IDs from Test F results...")
    asset_ids = load_asset_ids()
    for i, aid in enumerate(asset_ids):
        print(f"  [{i}] {aid}")

    results = {}

    try:
        results["test_plus"] = run_test_plus(asset_ids)
    except Exception as e:
        print(f"\n  ERROR (test-plus): {e}")
        results["test_plus"] = {"error": str(e)}

    # Summary
    print("\n" + "=" * 60)
    print("RESULT")
    print("=" * 60)

    r = results["test_plus"]
    if "error" in r:
        print(f"\n  Test Plus: FAILED — {r['error'][:200]}")
    else:
        print(f"\n  Test Plus ({r['label']}):")
        print(f"    World:      {r['world_id']}")
        print(f"    Marble URL: {r['marble_url']}")
        print(f"    SPZ Full:   {r['spz_full']}")
        print(f"    SPZ 500k:   {r['spz_500k']}")
        print(f"    Pano:       {r['pano_url']}")
        print(f"    Model:      {r.get('model', 'n/a')}")
        print(f"    Photos:     {r['photo_count']}, reconstruct={r.get('reconstruct_images', False)}")
        print(f"    Total:      {r['total_time_s']}s")

    out_path = "marble_comparison_results_plus.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    main()
