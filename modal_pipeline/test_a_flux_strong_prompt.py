"""
Test A — FLUX Kontext Pro with strong Japandi prompt on FRONT_PHOTO.
Run: python modal_pipeline/test_a_flux_strong_prompt.py
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

SUPABASE_BUCKET = "room-videos"
SUPABASE_PATH = "test-redesign/test_a_flux_strong.jpg"


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
# FLUX helpers
# ---------------------------------------------------------------------------

def run_flux(input_image_url, aspect_ratio="match_input_image"):
    print(f"\n[flux] Submitting prediction...")
    url = "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions"
    _, resp = http_post_json(url, {
        "input": {
            "prompt": STRONG_JAPANDI_PROMPT,
            "input_image": input_image_url,
            "aspect_ratio": aspect_ratio,
            "output_format": "jpg",
            "safety_tolerance": 5,
        }
    }, headers={"Authorization": f"Bearer {REPLICATE_TOKEN}", "Prefer": "respond-async"})

    prediction_id = resp["id"]
    poll_url = resp["urls"]["get"]
    print(f"[flux] Prediction ID: {prediction_id}  Status: {resp.get('status')}")

    headers = {"Authorization": f"Bearer {REPLICATE_TOKEN}"}
    start = time.time()
    while time.time() - start < 300:
        elapsed = time.time() - start
        _, result = http_get_json(poll_url, headers=headers, timeout=15)
        status = result.get("status")
        if status == "succeeded":
            output = result["output"]
            url_out = output[0] if isinstance(output, list) else output
            print(f"[flux] Succeeded ({elapsed:.0f}s): {url_out}")
            return prediction_id, url_out
        if status in ("failed", "canceled"):
            print(f"[flux] {status}: {result.get('error')}")
            sys.exit(1)
        print(f"[flux] {status}... {elapsed:.0f}s")
        time.sleep(5)
    print("[flux] TIMED OUT")
    sys.exit(1)


def upload_to_supabase(img_bytes, path):
    upload_url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{path}"
    status, body = http_post_raw(upload_url, img_bytes, headers={
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "apikey": SUPABASE_KEY,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
    })
    if status not in (200, 201):
        print(f"   Supabase upload FAILED: HTTP {status} — {body[:200]}")
        sys.exit(1)
    return f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{path}"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=== Test A: FLUX Kontext Pro — Strong Japandi Prompt ===")
    total_start = time.time()

    prediction_id, output_url = run_flux(FRONT_PHOTO)

    print(f"\n[download] Fetching image...")
    _, img_bytes = http_get(output_url, timeout=120)
    print(f"[download] {len(img_bytes)/1e6:.1f} MB")

    print(f"\n[supabase] Uploading to {SUPABASE_PATH}...")
    supabase_public_url = upload_to_supabase(img_bytes, SUPABASE_PATH)
    print(f"[supabase] OK")

    total_time = time.time() - total_start

    print(f"\n=== RESULTS ===")
    print(f"  Replicate URL: {output_url}")
    print(f"  Supabase URL:  {supabase_public_url}")
    print(f"  Total time:    {total_time:.0f}s")

    results = {
        "prediction_id": prediction_id,
        "replicate_output_url": output_url,
        "supabase_url": supabase_public_url,
        "total_time_seconds": round(total_time),
    }
    out_path = Path(__file__).parent / "test_results_a.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\nSaved: {out_path}")
    print("PASS")
