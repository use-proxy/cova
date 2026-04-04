"""
FLUX Kontext Pro redesign test — runs a real capture photo through FLUX Kontext Pro
via Replicate to generate a redesigned perspective view, then uploads to Supabase Storage.

Run: python modal_pipeline/test_flux_redesign.py
Requires: REPLICATE_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

INPUT_IMAGE_URL = (
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads"
    "/IMG_9864.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy"
    "1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29"
    "tLXVwbG9hZHMvSU1HXzk4NjQuanBlZyIsImlhdCI6MTc3NTA5MjU0OCwiZXhwIjoxNzc1Njk3Mz"
    "Q4fQ.U9ZaG_T8A0Lel6hvji7hjK1XbA7fYPBZzF9XDwIggug"
)

REDESIGN_PROMPT = (
    "Transform this college dorm room into a stunning Japandi interior design. "
    "Replace the beds with low-profile platform beds with natural wood frames and clean white linen. "
    "Replace the office chairs with minimalist wooden chairs. "
    "Add a bamboo floor lamp in the corner. "
    "Replace the carpet with light oak hardwood flooring. "
    "Remove all clutter from the floor. "
    "Add small potted plants on the desk. "
    "Keep the same room dimensions, windows, and ceiling. "
    "The result should look like a professional interior design magazine photo in Japandi style."
)

SUPABASE_BUCKET = "room-videos"
SUPABASE_PATH = "test-redesign/flux_redesigned_perspective.jpg"


# ---------------------------------------------------------------------------
# Env loader
# ---------------------------------------------------------------------------

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
# Step 1 — Submit FLUX Kontext Pro prediction
# ---------------------------------------------------------------------------

def submit_flux_prediction(replicate_token):
    print("\n1. Submitting FLUX Kontext Pro prediction...")
    url = "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions"
    headers = {
        "Authorization": f"Bearer {replicate_token}",
        "Prefer": "respond-async",
    }
    payload = {
        "input": {
            "prompt": REDESIGN_PROMPT,
            "input_image": INPUT_IMAGE_URL,
            "aspect_ratio": "4:3",
            "output_format": "jpg",
            "safety_tolerance": 5,
        }
    }
    _, resp = http_post_json(url, payload, headers=headers)
    prediction_id = resp["id"]
    poll_url = resp["urls"]["get"]
    print(f"   Prediction ID: {prediction_id}")
    print(f"   Status:        {resp.get('status', 'unknown')}")
    return prediction_id, poll_url


# ---------------------------------------------------------------------------
# Step 2 — Poll until complete
# ---------------------------------------------------------------------------

def poll_prediction(poll_url, replicate_token):
    print("\n2. Polling prediction (FLUX Kontext Pro ~30-90s)...")
    headers = {"Authorization": f"Bearer {replicate_token}"}
    start = time.time()

    while time.time() - start < 300:
        elapsed = time.time() - start
        _, result = http_get_json(poll_url, headers=headers, timeout=15)
        status = result.get("status", "unknown")

        if status == "succeeded":
            output = result.get("output")
            # output may be a list or a string
            output_url = output[0] if isinstance(output, list) else output
            print(f"   Succeeded! ({elapsed:.0f}s)")
            print(f"   Output URL: {output_url}")
            return output_url

        if status == "failed":
            err = result.get("error", "unknown error")
            print(f"   FAILED: {err}")
            sys.exit(1)

        if status == "canceled":
            print("   CANCELED")
            sys.exit(1)

        print(f"   {status}... {elapsed:.0f}s")
        time.sleep(5)

    print("   TIMED OUT after 300s")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Step 3 — Download the redesigned image
# ---------------------------------------------------------------------------

def download_image(output_url):
    print(f"\n3. Downloading redesigned image...")
    _, img_bytes = http_get(output_url, timeout=120)
    print(f"   Downloaded: {len(img_bytes) / 1e6:.1f} MB")
    return img_bytes


# ---------------------------------------------------------------------------
# Step 4 — Upload to Supabase Storage
# ---------------------------------------------------------------------------

def upload_to_supabase(img_bytes, env):
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        print("ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing")
        sys.exit(1)

    upload_url = f"{supabase_url}/storage/v1/object/{SUPABASE_BUCKET}/{SUPABASE_PATH}"
    headers = {
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
    }

    print(f"\n4. Uploading to Supabase Storage...")
    print(f"   Bucket: {SUPABASE_BUCKET}")
    print(f"   Path:   {SUPABASE_PATH}")

    status, body = http_post_raw(upload_url, img_bytes, headers=headers)
    resp_data = json.loads(body) if body else {}

    if status not in (200, 201):
        print(f"   FAILED: HTTP {status} — {resp_data}")
        sys.exit(1)

    print(f"   Upload OK (HTTP {status})")

    # Build the public URL (uses anon key path; service role confirms bucket exists)
    public_url = f"{supabase_url}/storage/v1/object/public/{SUPABASE_BUCKET}/{SUPABASE_PATH}"
    return public_url


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    env = load_env()

    replicate_token = env.get("REPLICATE_API_TOKEN", "")
    if not replicate_token:
        print("ERROR: REPLICATE_API_TOKEN not set in .env.local")
        sys.exit(1)

    print("=== FLUX Kontext Pro Redesign Test ===")
    print(f"Input image: {INPUT_IMAGE_URL[:80]}...")
    print(f"Style:       Japandi → dorm-to-magazine redesign")

    total_start = time.time()

    prediction_id, poll_url = submit_flux_prediction(replicate_token)
    output_url = poll_prediction(poll_url, replicate_token)
    img_bytes = download_image(output_url)
    supabase_url = upload_to_supabase(img_bytes, env)

    total_time = time.time() - total_start

    print(f"\n=== RESULTS ===")
    print(f"  Replicate output URL: {output_url}")
    print(f"  Supabase URL:         {supabase_url}")
    print(f"  Total time:           {total_time:.0f}s")

    results = {
        "prediction_id": prediction_id,
        "replicate_output_url": output_url,
        "supabase_url": supabase_url,
        "supabase_bucket": SUPABASE_BUCKET,
        "supabase_path": SUPABASE_PATH,
        "source_image_url": INPUT_IMAGE_URL,
        "prompt": REDESIGN_PROMPT,
        "total_time_seconds": round(total_time),
    }

    out_path = Path(__file__).parent / "test_flux_results.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\nResults saved to: {out_path}")
    print("\nPASS")
    sys.exit(0)
