"""
Test D — flux-depth-pro on all 4 room photos in parallel.
Run: python modal_pipeline/test_d_flux_depth_pro.py
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

SUPABASE_BUCKET = "room-videos"

PHOTOS = [
    ("front", FRONT_PHOTO, "test-redesign/test_d_front.jpg"),
    ("right", RIGHT_PHOTO, "test-redesign/test_d_right.jpg"),
    ("back",  BACK_PHOTO,  "test-redesign/test_d_back.jpg"),
    ("left",  LEFT_PHOTO,  "test-redesign/test_d_left.jpg"),
]


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
# Per-photo pipeline
# ---------------------------------------------------------------------------

def process_one(angle_name, photo_url, supabase_path):
    """Submit flux-depth-pro, poll, download, upload. Returns result dict."""
    rep_url = "https://api.replicate.com/v1/models/black-forest-labs/flux-depth-pro/predictions"
    _, resp = http_post_json(rep_url, {
        "input": {
            "control_image": photo_url,
            "prompt": STRONG_JAPANDI_PROMPT,
            "num_inference_steps": 28,
            "guidance_scale": 7.5,
        }
    }, headers={"Authorization": f"Bearer {REPLICATE_TOKEN}", "Prefer": "respond-async"})

    pred_id = resp["id"]
    poll_url = resp["urls"]["get"]
    print(f"[{angle_name}] Submitted: {pred_id}")

    rep_headers = {"Authorization": f"Bearer {REPLICATE_TOKEN}"}
    start = time.time()
    output_url = None
    while time.time() - start < 300:
        elapsed = time.time() - start
        _, result = http_get_json(poll_url, headers=rep_headers, timeout=15)
        status = result.get("status")
        if status == "succeeded":
            output = result["output"]
            output_url = output[0] if isinstance(output, list) else output
            print(f"[{angle_name}] Succeeded ({elapsed:.0f}s)")
            break
        if status in ("failed", "canceled"):
            print(f"[{angle_name}] {status}: {result.get('error')}")
            return {"angle": angle_name, "error": status}
        time.sleep(5)

    if not output_url:
        return {"angle": angle_name, "error": "timeout"}

    _, img_bytes = http_get(output_url, timeout=120)
    print(f"[{angle_name}] Downloaded: {len(img_bytes)/1e6:.1f} MB")

    upload_url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{supabase_path}"
    status, _ = http_post_raw(upload_url, img_bytes, headers={
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "apikey": SUPABASE_KEY,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
    })
    if status not in (200, 201):
        print(f"[{angle_name}] Supabase upload FAILED: HTTP {status}")
        supabase_public = None
    else:
        supabase_public = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{supabase_path}"
        print(f"[{angle_name}] Uploaded: {supabase_public}")

    return {
        "angle": angle_name,
        "prediction_id": pred_id,
        "replicate_url": output_url,
        "supabase_url": supabase_public,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=== Test D: flux-depth-pro on all 4 photos in parallel ===")
    total_start = time.time()

    results = {}
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(process_one, angle, url, path): angle
            for angle, url, path in PHOTOS
        }
        for future in as_completed(futures):
            angle = futures[future]
            try:
                result = future.result()
                results[angle] = result
            except Exception as e:
                print(f"[{angle}] Exception: {e}")
                results[angle] = {"angle": angle, "error": str(e)}

    total_time = time.time() - total_start

    print(f"\n=== RESULTS ===")
    for angle, data in results.items():
        url = data.get("replicate_url", "FAILED")
        print(f"  {angle}: {url}")
    print(f"  Total time: {total_time:.0f}s")

    results["total_time_seconds"] = round(total_time)
    out_path = Path(__file__).parent / "test_results_d.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\nSaved: {out_path}")
    passed = sum(1 for k, v in results.items() if isinstance(v, dict) and v.get("replicate_url"))
    print(f"{'PASS' if passed == 4 else f'PARTIAL ({passed}/4 succeeded)'}")
