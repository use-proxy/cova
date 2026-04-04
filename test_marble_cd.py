"""
Marble API Comparison: Test C (landscape 1x) vs Test D (landscape 0.5x)
Both use multi-image Mini with Front/Right/Back/Left layout.
Runs both in parallel.
Usage: MARBLE_API_KEY=... python3 test_marble_cd.py
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

TEST_C_PHOTOS = [
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/testC1.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvdGVzdEMxLmpwZWciLCJpYXQiOjE3NzUwODk3MjYsImV4cCI6MTc3NTY5NDUyNn0.FFc5UaGoA7IHMjoMUEVj1Le408a5ScIjpnU6S4-oBnU",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/testC2.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvdGVzdEMyLmpwZWciLCJpYXQiOjE3NzUwODk3MzYsImV4cCI6MTc3NTY5NDUzNn0.fDt8fqUkHp_Kt1_pC3blWmZwphOvQWntD4yqGjJLWL0",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/testC3.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvdGVzdEMzLmpwZWciLCJpYXQiOjE3NzUwODk3NDUsImV4cCI6MTc3NTY5NDU0NX0.ULpgLdvbqCl7ajIdCypsOwsNd8f0eMJyevgZPTfvS0A",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/testC4.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvdGVzdEM0LmpwZWciLCJpYXQiOjE3NzUwODk3NTAsImV4cCI6MTc3NTY5NDU1MH0.YsN82MptgwYupkbGMr6l_EG6xdbbuP9Y1Mwl-WlYef0",
]

TEST_D_PHOTOS = [
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/testD1.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvdGVzdEQxLmpwZWciLCJpYXQiOjE3NzUwODk3NTgsImV4cCI6MTc3NTY5NDU1OH0._qwydGUnkTGpb1RKr7-Wwi0PIegc8HM3TS2Ns5t1fsg",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/testD2.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvdGVzdEQyLmpwZWciLCJpYXQiOjE3NzUwODk3NjUsImV4cCI6MTc3NTY5NDU2NX0.07x6jaWwVo-Pd70E_cTF4vkFPm08H0p-NEJZqQyB3jg",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/testD3.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvdGVzdEQzLmpwZWciLCJpYXQiOjE3NzUwODk3NzIsImV4cCI6MTc3NTY5NDU3Mn0.91xRgyDhEUTieg8ARQw7xHmfOimHxi3kUn_oTxcM4jk",
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/testD4.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvdGVzdEQ0LmpwZWciLCJpYXQiOjE3NzUwODk3ODAsImV4cCI6MTc3NTY5NDU4MH0.0yKrR_g2QanMSgLWRf0IX4_JL7jGgEZvzELXP_7cL9Y",
]

AZIMUTHS = [0, 90, 180, 270]  # Front, Right, Back, Left
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
        splats = data.get("assets", {}).get("splats", {}).get("spz_urls", {})
        pano_url = data.get("assets", {}).get("imagery", {}).get("pano_url")
        thumbnail = data.get("assets", {}).get("thumbnail_url")
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


def run_test(label, photo_urls):
    """Upload photos, generate world, poll, fetch assets. Returns result dict."""
    print(f"\n  [{label}] Uploading 4 photos...")
    t0 = time.time()

    asset_ids = [None] * 4
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {}
        for i, url in enumerate(photo_urls):
            img_bytes = download(url)
            size_mb = len(img_bytes) / 1e6
            fut = pool.submit(upload_to_marble, img_bytes, f"{label}_photo_{i}.jpg")
            futures[fut] = (i, size_mb)
        for fut in as_completed(futures):
            idx, size_mb = futures[fut]
            asset_ids[idx] = fut.result()
            print(f"    [{label}] Photo {idx} uploaded ({size_mb:.1f}MB) -> {asset_ids[idx][:12]}...")

    upload_time = time.time() - t0
    print(f"  [{label}] All uploads done in {upload_time:.1f}s")

    multi_image_prompt = [
        {"azimuth": az, "content": {"source": "media_asset", "media_asset_id": aid}}
        for aid, az in zip(asset_ids, AZIMUTHS)
    ]

    print(f"  [{label}] Generating Mini world...")
    gen = api("POST", "/worlds:generate", {
        "model": "Marble 0.1-mini",
        "display_name": f"Cova Test {label}",
        "world_prompt": {
            "type": "multi-image",
            "multi_image_prompt": multi_image_prompt,
            "text_prompt": "photorealistic indoor residential room, accurate spatial geometry",
            "disable_recaption": True,
        },
        "permission": {"public": False},
    })
    operation_id = gen["operation_id"]
    print(f"  [{label}] Operation: {operation_id}")

    response = poll_operation(operation_id, label)
    world_id = response.get("world_id")
    if not world_id:
        raise RuntimeError(f"[{label}] No world_id in response: {response}")

    print(f"  [{label}] Fetching assets...")
    assets = fetch_world_assets(world_id, label)
    total_time = time.time() - t0

    assets["label"] = label
    assets["upload_time_s"] = round(upload_time, 1)
    assets["total_time_s"] = round(total_time, 1)
    return assets


def main():
    if not MARBLE_KEY:
        print("ERROR: Set MARBLE_API_KEY environment variable")
        sys.exit(1)

    print("Marble Test C vs D — Landscape 1x vs 0.5x")
    print(f"API Key: {MARBLE_KEY[:8]}...")

    results = {}

    # Run both tests in parallel using threads
    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_c = pool.submit(run_test, "C-landscape-1x", TEST_C_PHOTOS)
        fut_d = pool.submit(run_test, "D-landscape-0.5x", TEST_D_PHOTOS)

        for label_key, fut in [("test_c", fut_c), ("test_d", fut_d)]:
            try:
                results[label_key] = fut.result()
            except Exception as e:
                print(f"\n  ERROR ({label_key}): {e}")
                results[label_key] = {"error": str(e)}

    # Summary
    print("\n" + "=" * 60)
    print("COMPARISON SUMMARY")
    print("=" * 60)

    for key in ["test_c", "test_d"]:
        r = results[key]
        if "error" in r:
            print(f"\n  {key}: FAILED — {r['error'][:120]}")
        else:
            print(f"\n  {r['label']}:")
            print(f"    World:      {r['world_id']}")
            print(f"    Marble URL: {r['marble_url']}")
            print(f"    SPZ Full:   {r['spz_full']}")
            print(f"    SPZ 500k:   {r['spz_500k']}")
            print(f"    Pano:       {r['pano_url']}")
            print(f"    Upload:     {r['upload_time_s']}s")
            print(f"    Total:      {r['total_time_s']}s")

    out_path = "marble_comparison_results_cd.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    main()
