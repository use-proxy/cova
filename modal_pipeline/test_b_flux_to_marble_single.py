"""
Test B — FLUX Kontext Pro on FRONT_PHOTO → upload result to Marble Plus (single image, no is_pano).
Run: python modal_pipeline/test_b_flux_to_marble_single.py
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
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


# ---------------------------------------------------------------------------
# Step 1 — FLUX Kontext Pro
# ---------------------------------------------------------------------------

def run_flux():
    print("\n[flux] Submitting prediction on FRONT_PHOTO...")
    url = "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions"
    _, resp = http_post_json(url, {
        "input": {
            "prompt": STRONG_JAPANDI_PROMPT,
            "input_image": FRONT_PHOTO,
            "aspect_ratio": "match_input_image",
            "output_format": "jpg",
            "safety_tolerance": 5,
        }
    }, headers={"Authorization": f"Bearer {REPLICATE_TOKEN}", "Prefer": "respond-async"})

    prediction_id = resp["id"]
    poll_url = resp["urls"]["get"]
    print(f"[flux] ID: {prediction_id}")

    headers = {"Authorization": f"Bearer {REPLICATE_TOKEN}"}
    start = time.time()
    while time.time() - start < 300:
        elapsed = time.time() - start
        _, result = http_get_json(poll_url, headers=headers, timeout=15)
        status = result.get("status")
        if status == "succeeded":
            output = result["output"]
            out_url = output[0] if isinstance(output, list) else output
            print(f"[flux] Succeeded ({elapsed:.0f}s): {out_url}")
            return prediction_id, out_url
        if status in ("failed", "canceled"):
            print(f"[flux] {status}: {result.get('error')}")
            sys.exit(1)
        print(f"[flux] {status}... {elapsed:.0f}s")
        time.sleep(5)
    print("[flux] TIMED OUT")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Step 2 — Upload FLUX output to Marble as media asset
# ---------------------------------------------------------------------------

def upload_to_marble(img_bytes):
    marble_headers = {"WLT-Api-Key": MARBLE_API_KEY}

    print("\n[marble] Preparing media asset upload...")
    _, prep = http_post_json(
        f"{MARBLE_BASE}/media-assets:prepare_upload",
        {"file_name": "flux_redesigned.jpg", "kind": "image", "extension": "jpg"},
        headers=marble_headers,
    )
    asset_id = prep["media_asset"]["media_asset_id"]
    upload_url = prep["upload_info"]["upload_url"]
    size_limit = prep["upload_info"]["required_headers"]["x-goog-content-length-range"]
    print(f"[marble] Media asset: {asset_id}")

    print("[marble] Uploading to GCS...")
    status, _ = http_put_raw(upload_url, img_bytes,
                              headers={"x-goog-content-length-range": size_limit})
    if status not in (200, 204):
        print(f"[marble] GCS upload FAILED: HTTP {status}")
        sys.exit(1)
    print(f"[marble] Upload OK (HTTP {status})")
    return asset_id


# ---------------------------------------------------------------------------
# Step 3 — Generate Marble Plus world (single image, no is_pano)
# ---------------------------------------------------------------------------

def generate_marble_world(asset_id):
    marble_headers = {"WLT-Api-Key": MARBLE_API_KEY}

    print("\n[marble] Submitting Marble Plus generation...")
    _, gen = http_post_json(
        f"{MARBLE_BASE}/worlds:generate",
        {
            "model": "Marble 0.1-plus",
            "display_name": "Cova Test B — FLUX to Marble single",
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
        headers=marble_headers,
    )
    operation_id = gen["operation_id"]
    print(f"[marble] Operation: {operation_id}")

    print("[marble] Polling (~5-6 min)...")
    start = time.time()
    world_id = None
    while time.time() - start < 660:
        elapsed = time.time() - start
        _, result = http_get_json(
            f"{MARBLE_BASE}/operations/{operation_id}",
            headers=marble_headers, timeout=15,
        )
        if result.get("done"):
            if result.get("error"):
                print(f"[marble] FAILED: {result['error']}")
                sys.exit(1)
            world_id = (result.get("metadata", {}).get("world_id")
                        or result.get("response", {}).get("world_id"))
            print(f"[marble] Complete! World: {world_id} ({elapsed:.0f}s)")
            break
        print(f"[marble] Processing... {elapsed:.0f}s")
        time.sleep(15)

    if not world_id:
        print("[marble] TIMED OUT")
        sys.exit(1)
    return world_id


def fetch_marble_assets(world_id):
    marble_headers = {"WLT-Api-Key": MARBLE_API_KEY}
    spz_urls = {}
    for attempt in range(10):
        _, w = http_get_json(f"{MARBLE_BASE}/worlds/{world_id}",
                              headers=marble_headers, timeout=15)
        spz_urls = w.get("assets", {}).get("splats", {}).get("spz_urls", {})
        pano = w.get("assets", {}).get("imagery", {}).get("pano_url")
        thumb = w.get("assets", {}).get("thumbnail_url")
        if spz_urls.get("full_res"):
            return spz_urls, pano, thumb
        print(f"[marble] SPZ not ready, retry {attempt+1}/10...")
        time.sleep(10)
    return spz_urls, None, None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=== Test B: FLUX Kontext Pro → Marble Plus (single image) ===")
    total_start = time.time()

    flux_prediction_id, flux_output_url = run_flux()

    print(f"\n[download] Fetching FLUX output...")
    _, img_bytes = http_get(flux_output_url, timeout=120)
    print(f"[download] {len(img_bytes)/1e6:.1f} MB")

    asset_id = upload_to_marble(img_bytes)
    world_id = generate_marble_world(asset_id)
    spz_urls, pano_url, thumbnail_url = fetch_marble_assets(world_id)

    total_time = time.time() - total_start
    marble_url = f"https://marble.worldlabs.ai/world/{world_id}"

    print(f"\n=== RESULTS ===")
    print(f"  FLUX output URL:  {flux_output_url}")
    print(f"  Marble world URL: {marble_url}")
    print(f"  SPZ 100k:         {spz_urls.get('100k', 'N/A')}")
    print(f"  SPZ 500k:         {spz_urls.get('500k', 'N/A')}")
    print(f"  SPZ full_res:     {spz_urls.get('full_res', 'N/A')}")
    print(f"  Total time:       {total_time:.0f}s")

    results = {
        "flux_prediction_id": flux_prediction_id,
        "flux_output_url": flux_output_url,
        "marble_world_id": world_id,
        "marble_url": marble_url,
        "spz_urls": spz_urls,
        "pano_url": pano_url,
        "thumbnail_url": thumbnail_url,
        "total_time_seconds": round(total_time),
    }
    out_path = Path(__file__).parent / "test_results_b.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\nSaved: {out_path}")
    print("PASS" if spz_urls.get("full_res") else "PARTIAL (no SPZ yet)")
