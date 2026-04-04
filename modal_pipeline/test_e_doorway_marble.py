"""
Test E — FLUX redesign of front/doorway photo, then two Marble Plus jobs in parallel:
  Job 1: single-image Plus from redesigned front
  Job 2: multi-image Plus (reconstruct) with redesigned front + 3 original angles
Run: python modal_pipeline/test_e_doorway_marble.py
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Load .env.local into os.environ
_env_path = Path(__file__).parent.parent / "apps" / "web" / ".env.local"
for _line in _env_path.read_text().splitlines():
    _line = _line.strip()
    if not _line or _line.startswith("#"):
        continue
    _k, _, _v = _line.partition("=")
    if _k and _v and _k.strip() not in os.environ:
        os.environ[_k.strip()] = _v.strip()

REPLICATE_TOKEN = os.environ["REPLICATE_API_TOKEN"]
MARBLE_API_KEY = os.environ["MARBLE_API_KEY"]
SUPABASE_URL = "https://xdeacbmkdwqrwxonqaqh.supabase.co"
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

FRONT_PHOTO = (
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads"
    "/IMG_9864.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy"
    "1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29"
    "tLXVwbG9hZHMvSU1HXzk4NjQuanBlZyIsImlhdCI6MTc3NTA5MjU0OCwiZXhwIjoxNzc1Njk3Mz"
    "Q4fQ.U9ZaG_T8A0Lel6hvji7hjK1XbA7fYPBZzF9XDwIggug"
)
RIGHT_PHOTO = (
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads"
    "/IMG_9866.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy"
    "1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29"
    "tLXVwbG9hZHMvSU1HXzk4NjYuanBlZyIsImlhdCI6MTc3NTA5MjU1OCwiZXhwIjoxNzc1Njk3Mz"
    "U4fQ.78pu7tu-f_0yx8Fh0s7mSKRh-EE4XKtZwJ0H22yWnFQ"
)
BACK_PHOTO = (
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads"
    "/IMG_9868.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy"
    "1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29"
    "tLXVwbG9hZHMvSU1HXzk4NjguanBlZyIsImlhdCI6MTc3NTA5MjU3MCwiZXhwIjoxNzc1Njk3Mz"
    "cwfQ.-fzLLvlIbOfwL_Vu_qI8fJKHlAtY2H74zem_mcRuPHY"
)
LEFT_PHOTO = (
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads"
    "/IMG_9870.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy"
    "1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29"
    "tLXVwbG9hZHMvSU1HXzk4NzAuanBlZyIsImlhdCI6MTc3NTA5MjU4MSwiZXhwIjoxNzc1Njk3Mz"
    "gxfQ.84C_gZCtl0znaD5eOznpKqFOxPHXjhZMfqEhrPN_hHs"
)

STRONG_JAPANDI_PROMPT = (
    "Transform this college dorm room completely into a luxury Japandi interior design. "
    "Replace the beds with two low natural solid oak platform beds with clean white linen bedding and no headboard. "
    "Replace all office chairs with minimalist Wegner-style solid walnut dining chairs. "
    "Remove all clutter, jackets, bags and items from the floor completely. "
    "Add a large handwoven jute area rug covering most of the floor. "
    "Replace the carpet with warm light oak hardwood flooring. "
    "Add a tall dried pampas grass arrangement in a wabi-sabi ceramic vase in the corner. "
    "Add warm Edison bulb pendant lights above each desk. "
    "Add small potted snake plants on each desk. "
    "Keep the exact room dimensions, window positions, door position, and ceiling height unchanged. "
    "Photorealistic interior design magazine photograph, Canon 24mm lens, soft natural daylight, "
    "warm ambient lighting, professional interior photography, ultra high quality."
)

MARBLE_BASE = "https://api.worldlabs.ai/marble/v1"
MARBLE_TEXT_PROMPT = (
    "Luxury Japandi interior, natural oak furniture, linen textiles, "
    "warm ambient lighting, photorealistic"
)


# ---------------------------------------------------------------------------
# urllib helpers
# ---------------------------------------------------------------------------

def http_get(url, headers=None, timeout=60):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


def http_get_json(url, headers=None, timeout=30):
    status, body = http_get(url, headers=headers, timeout=timeout)
    return status, json.loads(body)


def http_post_json(url, payload, headers=None, timeout=60):
    data = json.dumps(payload).encode()
    h = {"Content-Type": "application/json", **(headers or {})}
    req = urllib.request.Request(url, data=data, headers=h, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read()
        print(f"   HTTP {e.code}: {body[:400].decode(errors='replace')}")
        raise


def http_put_raw(url, data, headers=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="PUT")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def http_post_raw(url, data, headers=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        body = e.read()
        print(f"   HTTP {e.code}: {body[:400].decode(errors='replace')}")
        raise


# ---------------------------------------------------------------------------
# FLUX helper
# ---------------------------------------------------------------------------

def run_flux(input_url, label="flux"):
    rep_url = "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions"
    _, resp = http_post_json(rep_url, {
        "input": {
            "prompt": STRONG_JAPANDI_PROMPT,
            "input_image": input_url,
            "aspect_ratio": "match_input_image",
            "output_format": "jpg",
            "safety_tolerance": 5,
        }
    }, headers={"Authorization": f"Bearer {REPLICATE_TOKEN}", "Prefer": "respond-async"})

    pred_id = resp["id"]
    poll_url = resp["urls"]["get"]
    print(f"[{label}] Submitted: {pred_id}")

    rep_headers = {"Authorization": f"Bearer {REPLICATE_TOKEN}"}
    start = time.time()
    while time.time() - start < 300:
        elapsed = time.time() - start
        _, result = http_get_json(poll_url, headers=rep_headers, timeout=15)
        status = result.get("status")
        if status == "succeeded":
            output = result["output"]
            out_url = output[0] if isinstance(output, list) else output
            print(f"[{label}] Succeeded ({elapsed:.0f}s): {out_url}")
            return out_url
        if status in ("failed", "canceled"):
            print(f"[{label}] {status}: {result.get('error')}")
            return None
        print(f"[{label}] {status}... {elapsed:.0f}s")
        time.sleep(5)
    print(f"[{label}] TIMED OUT")
    return None


# ---------------------------------------------------------------------------
# Marble helpers
# ---------------------------------------------------------------------------

def upload_image_to_marble(img_bytes, filename="image.jpg"):
    marble_headers = {"WLT-Api-Key": MARBLE_API_KEY}
    _, prep = http_post_json(
        f"{MARBLE_BASE}/media-assets:prepare_upload",
        {"file_name": filename, "kind": "image", "extension": "jpg"},
        headers=marble_headers,
    )
    asset_id = prep["media_asset"]["media_asset_id"]
    upload_url = prep["upload_info"]["upload_url"]
    size_limit = prep["upload_info"]["required_headers"]["x-goog-content-length-range"]

    status, _ = http_put_raw(upload_url, img_bytes,
                              headers={"x-goog-content-length-range": size_limit})
    if status not in (200, 204):
        raise RuntimeError(f"GCS upload failed: HTTP {status}")
    return asset_id


def poll_marble_operation(operation_id, label="marble", timeout=720):
    marble_headers = {"WLT-Api-Key": MARBLE_API_KEY}
    start = time.time()
    while time.time() - start < timeout:
        elapsed = time.time() - start
        _, result = http_get_json(
            f"{MARBLE_BASE}/operations/{operation_id}",
            headers=marble_headers, timeout=15,
        )
        if result.get("done"):
            if result.get("error"):
                raise RuntimeError(f"Marble operation failed: {result['error']}")
            world_id = (result.get("metadata", {}).get("world_id")
                        or result.get("response", {}).get("world_id"))
            print(f"[{label}] Complete! World: {world_id} ({elapsed:.0f}s)")
            return world_id
        print(f"[{label}] Processing... {elapsed:.0f}s")
        time.sleep(15)
    raise RuntimeError(f"Marble timed out after {timeout}s")


def fetch_marble_assets(world_id, label="marble"):
    marble_headers = {"WLT-Api-Key": MARBLE_API_KEY}
    for attempt in range(10):
        _, w = http_get_json(f"{MARBLE_BASE}/worlds/{world_id}",
                              headers=marble_headers, timeout=15)
        spz_urls = w.get("assets", {}).get("splats", {}).get("spz_urls", {})
        pano = w.get("assets", {}).get("imagery", {}).get("pano_url")
        thumb = w.get("assets", {}).get("thumbnail_url")
        if spz_urls.get("full_res"):
            return spz_urls, pano, thumb
        print(f"[{label}] SPZ not ready, retry {attempt+1}/10...")
        time.sleep(10)
    return {}, None, None


# ---------------------------------------------------------------------------
# Two Marble jobs
# ---------------------------------------------------------------------------

def marble_single_job(redesigned_img_bytes):
    """Job 1: Single-image Marble Plus from redesigned front."""
    label = "marble-single"
    print(f"\n[{label}] Uploading redesigned front to Marble...")
    asset_id = upload_image_to_marble(redesigned_img_bytes, "redesigned_front.jpg")
    print(f"[{label}] Asset: {asset_id}")

    _, gen = http_post_json(
        f"{MARBLE_BASE}/worlds:generate",
        {
            "model": "Marble 0.1-plus",
            "display_name": "Cova Test E — single image",
            "world_prompt": {
                "type": "image",
                "image_prompt": {
                    "source": "media_asset",
                    "media_asset_id": asset_id,
                },
                "text_prompt": MARBLE_TEXT_PROMPT,
            },
            "permission": {"public": False},
        },
        headers={"WLT-Api-Key": MARBLE_API_KEY},
    )
    operation_id = gen["operation_id"]
    print(f"[{label}] Operation: {operation_id}")

    world_id = poll_marble_operation(operation_id, label=label)
    spz_urls, pano_url, thumb = fetch_marble_assets(world_id, label=label)

    return {
        "job": "single_image",
        "world_id": world_id,
        "marble_url": f"https://marble.worldlabs.ai/world/{world_id}",
        "spz_urls": spz_urls,
        "pano_url": pano_url,
        "thumbnail_url": thumb,
    }


def marble_multi_job(redesigned_img_bytes):
    """Job 2: Multi-image Marble Plus with redesigned front + 3 original angles."""
    label = "marble-multi"
    marble_headers = {"WLT-Api-Key": MARBLE_API_KEY}

    # Upload redesigned front to Marble
    print(f"\n[{label}] Uploading redesigned front...")
    redesigned_asset_id = upload_image_to_marble(redesigned_img_bytes, "redesigned_front_multi.jpg")

    # Upload 3 original angle photos to Marble
    originals = [
        (RIGHT_PHOTO, "original_right.jpg"),
        (BACK_PHOTO,  "original_back.jpg"),
        (LEFT_PHOTO,  "original_left.jpg"),
    ]
    asset_ids = [redesigned_asset_id]
    for orig_url, fname in originals:
        print(f"[{label}] Uploading {fname}...")
        _, img_bytes = http_get(orig_url, timeout=60)
        asset_id = upload_image_to_marble(img_bytes, fname)
        asset_ids.append(asset_id)
        print(f"[{label}] Asset: {asset_id}")

    # Build multi-image prompt: redesigned front first, then originals
    multi_image_prompt = [
        {
            "azimuth": None,
            "content": {"source": "media_asset", "media_asset_id": aid},
        }
        for aid in asset_ids
    ]

    print(f"[{label}] Submitting Marble Plus multi-image (reconstruct)...")
    _, gen = http_post_json(
        f"{MARBLE_BASE}/worlds:generate",
        {
            "model": "Marble 0.1-plus",
            "display_name": "Cova Test E — multi-image reconstruct",
            "world_prompt": {
                "type": "multi-image",
                "multi_image_prompt": multi_image_prompt,
                "reconstruct_images": True,
                "text_prompt": MARBLE_TEXT_PROMPT,
                "disable_recaption": True,
            },
            "permission": {"public": False},
        },
        headers=marble_headers,
    )
    operation_id = gen["operation_id"]
    print(f"[{label}] Operation: {operation_id}")

    world_id = poll_marble_operation(operation_id, label=label, timeout=780)
    spz_urls, pano_url, thumb = fetch_marble_assets(world_id, label=label)

    return {
        "job": "multi_image_reconstruct",
        "world_id": world_id,
        "marble_url": f"https://marble.worldlabs.ai/world/{world_id}",
        "spz_urls": spz_urls,
        "pano_url": pano_url,
        "thumbnail_url": thumb,
        "num_images": len(asset_ids),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=== Test E: FLUX doorway redesign → two Marble Plus jobs in parallel ===")
    total_start = time.time()

    # Step 1: FLUX redesign of front photo
    print("\n--- Step 1: FLUX Kontext Pro on FRONT_PHOTO ---")
    redesigned_url = run_flux(FRONT_PHOTO, label="flux-doorway")
    if not redesigned_url:
        print("FATAL: FLUX redesign failed")
        sys.exit(1)

    print(f"\n[download] Fetching redesigned image...")
    _, redesigned_bytes = http_get(redesigned_url, timeout=120)
    print(f"[download] {len(redesigned_bytes)/1e6:.1f} MB")

    # Step 2: Run both Marble Plus jobs in parallel
    print("\n--- Step 2: Two Marble Plus jobs in parallel ---")
    job_results = {}
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {
            executor.submit(marble_single_job, redesigned_bytes): "single",
            executor.submit(marble_multi_job,  redesigned_bytes): "multi",
        }
        for future in as_completed(futures):
            job_key = futures[future]
            try:
                job_results[job_key] = future.result()
            except Exception as e:
                print(f"[{job_key}] Exception: {e}")
                job_results[job_key] = {"job": job_key, "error": str(e)}

    total_time = time.time() - total_start

    print(f"\n=== RESULTS ===")
    print(f"  FLUX redesigned URL: {redesigned_url}")
    for job_key, data in job_results.items():
        print(f"  {job_key} Marble URL: {data.get('marble_url', 'FAILED')}")
        print(f"  {job_key} SPZ full:   {data.get('spz_urls', {}).get('full_res', 'N/A')}")
    print(f"  Total time: {total_time:.0f}s")

    results = {
        "flux_redesigned_url": redesigned_url,
        "marble_single": job_results.get("single"),
        "marble_multi": job_results.get("multi"),
        "total_time_seconds": round(total_time),
    }
    out_path = Path(__file__).parent / "test_results_e.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\nSaved: {out_path}")

    single_ok = bool(job_results.get("single", {}).get("marble_url"))
    multi_ok = bool(job_results.get("multi", {}).get("marble_url"))
    print(f"Single: {'PASS' if single_ok else 'FAIL'}  |  Multi: {'PASS' if multi_ok else 'FAIL'}")
