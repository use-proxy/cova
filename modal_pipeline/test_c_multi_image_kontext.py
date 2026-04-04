"""
Test C — FLUX Kontext Pro on FRONT_PHOTO, then multi-image-kontext-pro for
RIGHT, BACK, LEFT using redesigned front as style reference.
Run: python modal_pipeline/test_c_multi_image_kontext.py
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

MULTI_IMAGE_PROMPT = (
    "Redesign this room angle to exactly match the Japandi interior style shown in the reference image. "
    "Keep the same camera angle and room structure. "
    "Same furniture style, same materials, same color palette as the reference."
)

SUPABASE_BUCKET = "room-videos"


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
# Replicate helpers
# ---------------------------------------------------------------------------

def submit_prediction(model_path, input_payload, label=""):
    url = f"https://api.replicate.com/v1/models/{model_path}/predictions"
    _, resp = http_post_json(url, {"input": input_payload},
                              headers={"Authorization": f"Bearer {REPLICATE_TOKEN}",
                                       "Prefer": "respond-async"})
    pred_id = resp["id"]
    poll_url = resp["urls"]["get"]
    print(f"[{label}] Submitted: {pred_id}")
    return pred_id, poll_url


def poll_prediction(poll_url, label="", timeout=300):
    headers = {"Authorization": f"Bearer {REPLICATE_TOKEN}"}
    start = time.time()
    while time.time() - start < timeout:
        elapsed = time.time() - start
        _, result = http_get_json(poll_url, headers=headers, timeout=15)
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
        return None
    return f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{path}"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=== Test C: FLUX front → multi-image-kontext-pro for right/back/left ===")
    total_start = time.time()
    results = {}

    # Step 1: FLUX Kontext Pro on front photo
    print("\n--- Step 1: Redesign front view with FLUX Kontext Pro ---")
    pred_id, poll_url = submit_prediction(
        "black-forest-labs/flux-kontext-pro",
        {
            "prompt": STRONG_JAPANDI_PROMPT,
            "input_image": FRONT_PHOTO,
            "aspect_ratio": "match_input_image",
            "output_format": "jpg",
            "safety_tolerance": 5,
        },
        label="flux-front",
    )
    redesigned_front_url = poll_prediction(poll_url, label="flux-front")
    if not redesigned_front_url:
        print("FATAL: FLUX front redesign failed")
        sys.exit(1)

    print(f"\n[download] Fetching front redesign...")
    _, front_bytes = http_get(redesigned_front_url, timeout=120)
    front_supabase = upload_to_supabase(front_bytes, "test-redesign/test_c_front.jpg")
    results["front"] = {"replicate_url": redesigned_front_url, "supabase_url": front_supabase}
    print(f"[supabase] Front uploaded: {front_supabase}")

    # Step 2: multi-image-kontext-pro for each remaining angle
    angles = [
        ("right", RIGHT_PHOTO, "test-redesign/test_c_right.jpg"),
        ("back",  BACK_PHOTO,  "test-redesign/test_c_back.jpg"),
        ("left",  LEFT_PHOTO,  "test-redesign/test_c_left.jpg"),
    ]

    for angle_name, original_url, supabase_path in angles:
        print(f"\n--- Step 2: multi-image-kontext-pro for {angle_name} ---")
        pred_id, poll_url = submit_prediction(
            "flux-kontext-apps/multi-image-kontext-pro",
            {
                "prompt": MULTI_IMAGE_PROMPT,
                "input_image_1": redesigned_front_url,
                "input_image_2": original_url,
                "aspect_ratio": "4:3",
                "output_format": "jpg",
                "safety_tolerance": 2,
            },
            label=f"multi-{angle_name}",
        )
        out_url = poll_prediction(poll_url, label=f"multi-{angle_name}", timeout=300)
        if out_url:
            _, img_bytes = http_get(out_url, timeout=120)
            sb_url = upload_to_supabase(img_bytes, supabase_path)
            results[angle_name] = {"replicate_url": out_url, "supabase_url": sb_url}
            print(f"[supabase] {angle_name} uploaded: {sb_url}")
        else:
            results[angle_name] = {"replicate_url": None, "supabase_url": None, "error": "failed"}

    total_time = time.time() - total_start

    print(f"\n=== RESULTS ===")
    for angle, data in results.items():
        print(f"  {angle}: {data.get('replicate_url', 'FAILED')}")
    print(f"  Total time: {total_time:.0f}s")

    results["total_time_seconds"] = round(total_time)
    out_path = Path(__file__).parent / "test_results_c.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\nSaved: {out_path}")
    passed = sum(1 for k, v in results.items() if isinstance(v, dict) and v.get("replicate_url"))
    print(f"{'PASS' if passed == 4 else f'PARTIAL ({passed}/4 angles succeeded)'}")
