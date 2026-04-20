"""
Full pipeline test — doorway interior photo → FLUX Kontext Pro redesign → Marble Plus 3D world.

Steps:
  1. FLUX Kontext Pro via Replicate → redesigned JPEG
  2. Upload redesigned image to Supabase Storage
  3. Upload to Marble media asset
  4. Generate Marble Plus world
  5. Poll until SPZ assets are ready
  6. Save results to test_doorway_results.json

Run:   python modal_pipeline/test_doorway_interior_ai.py
Needs: REPLICATE_API_TOKEN, MARBLE_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
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
    "/IMG_2093.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy"
    "1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29"
    "tLXVwbG9hZHMvSU1HXzIwOTMuanBlZyIsImlhdCI6MTc3NTEyMzE4NSwiZXhwIjoxNzc1NzI3OT"
    "g1fQ.eUqckK1_CONIUgad7y2t8HarDhPrupI98YpWKWhJmLU"
)

REDESIGN_PROMPT = (
    "Transform this bedroom completely into a luxury Japandi interior design. "
    "Replace the bed with a low natural solid oak platform bed with clean white linen "
    "bedding and no headboard. Replace the office chair with a minimalist solid walnut "
    "accent chair. Remove all clutter from the floor completely. Replace the carpet with "
    "warm light oak hardwood flooring. Add a large handwoven jute area rug beside the bed. "
    "Add a tall dried pampas grass arrangement in a wabi-sabi ceramic vase in the corner "
    "near the window. Add a minimal floating oak shelf on the wall with small ceramic objects. "
    "Replace the blue rolling cabinet with a solid oak bedside table with a paper lantern on top. "
    "Keep the exact room dimensions, window position, ceiling fixtures, and door position unchanged. "
    "Keep all wall-mounted decorations on the wall. Photorealistic interior design magazine photograph, "
    "24mm lens, soft natural daylight, warm ambient lighting, ultra high quality."
)

SUPABASE_BUCKET = "room-videos"
SUPABASE_PATH = "test-redesign/doorway_flux_redesigned.jpg"
MARBLE_BASE = "https://api.worldlabs.ai/marble/v1"


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
        print(f"   HTTP {e.code}: {body[:500].decode(errors='replace')}")
        raise


def http_post_raw(url, data, headers=None, timeout=180):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        body = e.read()
        print(f"   HTTP {e.code}: {body[:500].decode(errors='replace')}")
        raise


def http_put_raw(url, data, headers=None, timeout=180):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="PUT")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


# ---------------------------------------------------------------------------
# Step 1 — FLUX Kontext Pro redesign
# ---------------------------------------------------------------------------

def run_flux_redesign(replicate_token):
    print("\n=== Step 1 — FLUX Kontext Pro Redesign ===")

    # Submit prediction
    print("   Submitting prediction...")
    url = "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions"
    headers = {
        "Authorization": f"Bearer {replicate_token}",
        "Prefer": "respond-async",
    }
    payload = {
        "input": {
            "prompt": REDESIGN_PROMPT,
            "input_image": INPUT_IMAGE_URL,
            "aspect_ratio": "match_input_image",
            "output_format": "jpg",
            "safety_tolerance": 5,
        }
    }
    _, resp = http_post_json(url, payload, headers=headers)
    prediction_id = resp["id"]
    poll_url = resp["urls"]["get"]
    print(f"   Prediction ID: {prediction_id}")
    print(f"   Status:        {resp.get('status', 'unknown')}")

    # Poll until complete
    print("   Polling (FLUX Kontext Pro ~30-90s)...")
    auth = {"Authorization": f"Bearer {replicate_token}"}
    start = time.time()
    while time.time() - start < 300:
        elapsed = time.time() - start
        _, result = http_get_json(poll_url, headers=auth, timeout=15)
        status = result.get("status", "unknown")
        if status == "succeeded":
            output = result.get("output")
            output_url = output[0] if isinstance(output, list) else output
            print(f"   Succeeded! ({elapsed:.0f}s)")
            print(f"   Output URL: {output_url}")
            return output_url
        if status in ("failed", "canceled"):
            print(f"   {status.upper()}: {result.get('error', '')}")
            sys.exit(1)
        print(f"   {status}... {elapsed:.0f}s")
        time.sleep(5)

    print("   TIMED OUT after 300s")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Step 2 — Upload redesigned image to Supabase Storage
# ---------------------------------------------------------------------------

def upload_to_supabase(img_bytes, env):
    print("\n=== Step 2 — Upload to Supabase Storage ===")
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
    print(f"   Bucket: {SUPABASE_BUCKET}")
    print(f"   Path:   {SUPABASE_PATH}")
    print(f"   Size:   {len(img_bytes) / 1e6:.1f} MB")

    status, body = http_post_raw(upload_url, img_bytes, headers=headers)
    resp_data = json.loads(body) if body else {}
    if status not in (200, 201):
        print(f"   FAILED: HTTP {status} — {resp_data}")
        sys.exit(1)
    print(f"   Upload OK (HTTP {status})")

    public_url = f"{supabase_url}/storage/v1/object/public/{SUPABASE_BUCKET}/{SUPABASE_PATH}"
    print(f"   Public URL: {public_url}")
    return public_url


# ---------------------------------------------------------------------------
# Step 3 — Upload to Marble media asset
# ---------------------------------------------------------------------------

def upload_to_marble_media_asset(img_bytes, marble_key):
    print("\n=== Step 3 — Marble Media Asset Upload ===")
    auth = {"WLT-Api-Key": marble_key}

    # Create media asset via prepare_upload
    print("   Creating media asset (prepare_upload)...")
    _, resp = http_post_json(
        f"{MARBLE_BASE}/media-assets:prepare_upload",
        {"file_name": "doorway_redesigned.jpg", "kind": "image", "extension": "jpg"},
        headers=auth,
    )
    print(f"   Response keys: {list(resp.keys())}")

    media_asset_id = resp["media_asset"]["media_asset_id"]
    upload_info = resp["upload_info"]
    upload_url = upload_info["upload_url"]
    required_headers = upload_info.get("required_headers", {})

    print(f"   Media asset ID: {media_asset_id}")
    print(f"   Uploading image ({len(img_bytes) / 1e6:.1f} MB) via PUT...")

    put_headers = {**required_headers}

    status, _ = http_put_raw(upload_url, img_bytes, headers=put_headers)
    if status not in (200, 204):
        print(f"   Upload FAILED: HTTP {status}")
        sys.exit(1)
    print(f"   Upload OK (HTTP {status})")
    return media_asset_id


# ---------------------------------------------------------------------------
# Step 4 — Generate Marble Plus world + poll for SPZ
# ---------------------------------------------------------------------------

def generate_marble_world(media_asset_id, marble_key):
    print("\n=== Step 4 — Marble Plus World Generation ===")
    auth = {"WLT-Api-Key": marble_key}

    generate_payload = {
        "model": "Marble 0.1-plus",
        "display_name": "Cova Doorway Test — Japandi",
        "world_prompt": {
            "type": "image",
            "image_prompt": {
                "source": "media_asset",
                "media_asset_id": media_asset_id,
            },
            "text_prompt": (
                "Luxury Japandi bedroom, natural oak platform bed, white linen, "
                "pampas grass, warm oak flooring, paper lantern, ceramic objects, "
                "photorealistic interior design"
            ),
        },
        "permission": {"public": False},
    }

    print("   Submitting worlds:generate (with 429 retry)...")
    gen = None
    for attempt in range(5):
        try:
            _, gen = http_post_json(
                f"{MARBLE_BASE}/worlds:generate",
                generate_payload,
                headers=auth,
            )
            break
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 60 * (attempt + 1)
                print(f"   Rate limited (429), waiting {wait}s before retry {attempt + 1}/5...")
                time.sleep(wait)
            else:
                raise
    if gen is None:
        print("   FAILED: exhausted retries on 429")
        sys.exit(1)
    print(f"   Generate response keys: {list(gen.keys())}")

    # Extract world_id — may come directly or via operation polling
    world_id = gen.get("world_id") or gen.get("id")
    operation_id = gen.get("operation_id")

    if not world_id and operation_id:
        print(f"   Operation ID: {operation_id}")
        print("   Polling operation until world_id is available...")
        op_start = time.time()
        while time.time() - op_start < 900:
            elapsed = time.time() - op_start
            _, op = http_get_json(f"{MARBLE_BASE}/operations/{operation_id}", headers=auth, timeout=15)
            if op.get("done"):
                if op.get("error"):
                    print(f"   Operation FAILED: {op['error']}")
                    sys.exit(1)
                world_id = (
                    op.get("metadata", {}).get("world_id")
                    or op.get("response", {}).get("world_id")
                )
                print(f"   Operation complete ({elapsed:.0f}s), world_id: {world_id}")
                break
            print(f"   Operation in progress... {elapsed:.0f}s")
            time.sleep(15)

    if not world_id:
        print(f"   ERROR: could not determine world_id from response: {json.dumps(gen)[:300]}")
        sys.exit(1)

    print(f"   World ID: {world_id}")
    print(f"   Polling /worlds/{world_id} every 15s until assets.splats is populated (timeout 15 min)...")

    spz_urls = {}
    start = time.time()
    while time.time() - start < 900:
        elapsed = time.time() - start
        try:
            _, w = http_get_json(f"{MARBLE_BASE}/worlds/{world_id}", headers=auth, timeout=15)
        except Exception as e:
            print(f"   Poll error ({elapsed:.0f}s): {e} — retrying...")
            time.sleep(15)
            continue

        spz_urls = w.get("assets", {}).get("splats", {}).get("spz_urls", {})
        if spz_urls.get("full_res") or spz_urls.get("500k"):
            print(f"   SPZ assets ready! ({elapsed:.0f}s)")
            break

        state = w.get("state") or w.get("status") or "processing"
        print(f"   {state}... {elapsed:.0f}s  (splats: {list(spz_urls.keys()) or 'none yet'})")
        time.sleep(15)
    else:
        print("   TIMED OUT waiting for SPZ assets (900s)")
        sys.exit(1)

    marble_world_url = f"https://marble.worldlabs.ai/world/{world_id}"
    print(f"\n   Marble URL:   {marble_world_url}")
    print(f"   SPZ full_res: {spz_urls.get('full_res', 'N/A')}")
    print(f"   SPZ 500k:     {spz_urls.get('500k', 'N/A')}")
    print(f"   SPZ 100k:     {spz_urls.get('100k', 'N/A')}")

    return world_id, marble_world_url, spz_urls


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    env = load_env()

    replicate_token = env.get("REPLICATE_API_TOKEN", "")
    marble_key = env.get("MARBLE_API_KEY", "")
    if not replicate_token:
        print("ERROR: REPLICATE_API_TOKEN not set in .env.local")
        sys.exit(1)
    if not marble_key:
        print("ERROR: MARBLE_API_KEY not set in .env.local")
        sys.exit(1)

    print("=== Cova Doorway Interior AI Test ===")
    print(f"Input: {INPUT_IMAGE_URL[:80]}...")

    total_start = time.time()

    # Step 1 — FLUX redesign
    flux_output_url = run_flux_redesign(replicate_token)

    # Download redesigned image
    print("\n   Downloading redesigned image...")
    _, img_bytes = http_get(flux_output_url, timeout=120)
    print(f"   Downloaded: {len(img_bytes) / 1e6:.1f} MB")

    # Step 2 — Upload to Supabase
    supabase_public_url = upload_to_supabase(img_bytes, env)

    # Step 3 — Upload to Marble media asset
    media_asset_id = upload_to_marble_media_asset(img_bytes, marble_key)

    # Step 4 — Generate Marble Plus world
    world_id, marble_world_url, spz_urls = generate_marble_world(media_asset_id, marble_key)

    total_time = time.time() - total_start

    # Save results
    results = {
        "input_photo": INPUT_IMAGE_URL,
        "flux_redesigned_url": supabase_public_url,
        "marble_world_url": marble_world_url,
        "spz_full": spz_urls.get("full_res", ""),
        "spz_500k": spz_urls.get("500k", ""),
        "total_time_seconds": round(total_time),
    }

    out_path = Path(__file__).parent / "test_doorway_results.json"
    out_path.write_text(json.dumps(results, indent=2))

    print(f"\n=== FINAL RESULTS ===")
    print(f"  Input photo:          {INPUT_IMAGE_URL[:60]}...")
    print(f"  FLUX redesigned URL:  {supabase_public_url}")
    print(f"  Marble world URL:     {marble_world_url}")
    print(f"  SPZ full_res:         {spz_urls.get('full_res', 'N/A')}")
    print(f"  SPZ 500k:             {spz_urls.get('500k', 'N/A')}")
    print(f"  Total time:           {total_time:.0f}s")
    print(f"\nResults saved to: {out_path}")
    print("\nPASS")
    sys.exit(0)
