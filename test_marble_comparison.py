"""
Marble API Test E: 8 portrait 1x photos at 45° intervals
Usage: MARBLE_API_KEY=... python3 test_marble_comparison.py
"""

import os
import json
import time
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from concurrent.futures import ThreadPoolExecutor, as_completed

MARBLE_BASE = "https://api.worldlabs.ai/marble/v1"
MARBLE_KEY = os.environ.get("MARBLE_API_KEY", "")

PHOTO_URLS_E = [
    {"url": "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9864.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjQuanBlZyIsImlhdCI6MTc3NTA5MjU0OCwiZXhwIjoxNzc1Njk3MzQ4fQ.U9ZaG_T8A0Lel6hvji7hjK1XbA7fYPBZzF9XDwIggug", "direction": 0},
    {"url": "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9865.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjUuanBlZyIsImlhdCI6MTc3NTA5MjU1MywiZXhwIjoxNzc1Njk3MzUzfQ.9oLEzwm86Phn4Sbak_Gx58M4SkZag2CyGUlC_6rK_6c", "direction": 45},
    {"url": "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9866.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjYuanBlZyIsImlhdCI6MTc3NTA5MjU1OCwiZXhwIjoxNzc1Njk3MzU4fQ.78pu7tu-f_0yx8Fh0s7mSKRh-EE4XKtZwJ0H22yWnFQ", "direction": 90},
    {"url": "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9867.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjcuanBlZyIsImlhdCI6MTc3NTA5MjU2MywiZXhwIjoxNzc1Njk3MzYzfQ.6THWsEfixPQLTX5D2Bt-2Fi5gYI0lJsO2-ZGMWE2WUc", "direction": 135},
    {"url": "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9868.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjguanBlZyIsImlhdCI6MTc3NTA5MjU3MCwiZXhwIjoxNzc1Njk3MzcwfQ.-fzLLvlIbOfwL_Vu_qI8fJKHlAtY2H74zem_mcRuPHY", "direction": 180},
    {"url": "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9869.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NjkuanBlZyIsImlhdCI6MTc3NTA5MjU3NywiZXhwIjoxNzc1Njk3Mzc3fQ.zRNmIdJlLxsoI2iZ9Lxe74m0MwaC39E_gmRcDfkPKIc", "direction": 225},
    {"url": "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9870.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NzAuanBlZyIsImlhdCI6MTc3NTA5MjU4MSwiZXhwIjoxNzc1Njk3MzgxfQ.84C_gZCtl0znaD5eOznpKqFOxPHXjhZMfqEhrPN_hHs", "direction": 270},
    {"url": "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_9871.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzk4NzEuanBlZyIsImlhdCI6MTc3NTA5MjU4OCwiZXhwIjoxNzc1Njk3Mzg4fQ.MoZii0vQ-iGosDkkCMlP96xG0nM2SIzmdMMmsXTBeDg", "direction": 315},
]

POLL_INTERVAL = 5
MAX_POLL_TIME = 600


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
        raise RuntimeError(f"Marble API {method} {path} -> {e.code}: {err_body}")


def download(url):
    req = Request(url)
    with urlopen(req, timeout=120) as resp:
        return resp.read()


def upload_to_marble(file_bytes, file_name):
    prep = api("POST", "/media-assets:prepare_upload", {
        "file_name": file_name, "kind": "image", "extension": "jpg",
    })
    asset_id = prep["media_asset"]["media_asset_id"]
    upload_url = prep["upload_info"]["upload_url"]
    size_limit = prep["upload_info"]["required_headers"]["x-goog-content-length-range"]

    req = Request(upload_url, data=file_bytes, method="PUT")
    req.add_header("x-goog-content-length-range", size_limit)
    with urlopen(req, timeout=120) as resp:
        if resp.status not in (200, 204):
            raise RuntimeError(f"GCS upload failed: {resp.status}")

    print(f"  Uploaded {file_name} ({len(file_bytes)/1e6:.1f}MB) -> {asset_id}")
    return asset_id


def poll_operation(operation_id, label):
    start = time.time()
    while time.time() - start < MAX_POLL_TIME:
        result = api("GET", f"/operations/{operation_id}")
        elapsed = time.time() - start

        if result.get("done"):
            if result.get("error"):
                raise RuntimeError(f"[{label}] Failed: {result['error']}")
            print(f"  [{label}] Complete in {elapsed:.0f}s")
            return result.get("response", {})

        if int(elapsed) % 30 < POLL_INTERVAL:
            print(f"  [{label}] Polling... {elapsed:.0f}s")
        time.sleep(POLL_INTERVAL)

    raise RuntimeError(f"[{label}] Timed out after {MAX_POLL_TIME}s")


def fetch_world_assets(world_id, label, max_retries=10):
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
            time.sleep(8)

    raise RuntimeError(f"[{label}] SPZ never became available")


def run_test_e():
    """Test E: All 8 portrait 1x photos with reconstruct_images mode."""
    print("\n" + "=" * 60)
    print("TEST E: 8 portrait 1x photos — reconstruct_images mode")
    print("  model: marble-1.0, azimuth: null, reconstruct_images: true")
    print("=" * 60)

    n = len(PHOTO_URLS_E)
    print(f"  Sending all {n} photos with azimuth=null")

    t0 = time.time()

    # Upload all 8 photos in parallel
    print(f"\nUploading {n} photos...")
    asset_ids = [None] * n
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {}
        for i, photo in enumerate(PHOTO_URLS_E):
            img_bytes = download(photo["url"])
            fut = pool.submit(upload_to_marble, img_bytes, f"E_photo_{i}.jpg")
            futures[fut] = i
        for fut in as_completed(futures):
            idx = futures[fut]
            asset_ids[idx] = fut.result()

    upload_time = time.time() - t0
    print(f"  All {n} uploads done in {upload_time:.1f}s")

    # Generate world — reconstruct_images with azimuth: null
    print(f"\nGenerating world with {n} images (reconstruct_images=true)...")
    multi_image_prompt = [
        {"azimuth": None, "content": {"source": "media_asset", "media_asset_id": aid}}
        for aid in asset_ids
    ]

    request_body = {
        "model": "marble-1.0",
        "display_name": "Cova Test E — 8 portrait 1x reconstruct",
        "world_prompt": {
            "type": "multi-image",
            "multi_image_prompt": multi_image_prompt,
            "reconstruct_images": True,
            "text_prompt": "photorealistic indoor residential room, accurate spatial geometry",
            "disable_recaption": True,
        },
        "permission": {"public": False},
    }

    print(f"  Request body:")
    print(json.dumps(request_body, indent=2))

    gen = api("POST", "/worlds:generate", request_body)

    operation_id = gen["operation_id"]
    print(f"  Operation: {operation_id}")

    response = poll_operation(operation_id, "test-E")
    world_id = response.get("world_id")
    if not world_id:
        raise RuntimeError(f"No world_id in response: {response}")

    print("\nFetching world assets...")
    assets = fetch_world_assets(world_id, "test-E")
    total_time = time.time() - t0

    assets["method"] = "multi-image-reconstruct"
    assets["label"] = "E-portrait-1x-reconstruct"
    assets["model"] = "marble-1.0"
    assets["photo_count"] = n
    assets["reconstruct_images"] = True
    assets["upload_time_s"] = round(upload_time, 1)
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

    print("Marble API Test E — 8 Portrait 1x Photos (reconstruct_images)")
    print(f"API Key: {MARBLE_KEY[:8]}...")

    results = {}

    try:
        results["test_e"] = run_test_e()
    except Exception as e:
        print(f"\n  ERROR (test-E): {e}")
        results["test_e"] = {"error": str(e)}

    # Summary
    print("\n" + "=" * 60)
    print("RESULT")
    print("=" * 60)

    r = results["test_e"]
    if "error" in r:
        print(f"\n  Test E: FAILED — {r['error'][:120]}")
    else:
        print(f"\n  Test E ({r['label']}):")
        print(f"    World:      {r['world_id']}")
        print(f"    Marble URL: {r['marble_url']}")
        print(f"    SPZ Full:   {r['spz_full']}")
        print(f"    SPZ 500k:   {r['spz_500k']}")
        print(f"    Pano:       {r['pano_url']}")
        print(f"    Model:      {r.get('model', 'n/a')}")
        print(f"    Photos:     {r['photo_count']}, reconstruct={r.get('reconstruct_images', False)}")
        print(f"    Upload:     {r['upload_time_s']}s")
        print(f"    Total:      {r['total_time_s']}s")

    out_path = "marble_comparison_results_e.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    main()
