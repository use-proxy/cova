"""
Marble Plus pano test — fetches most recent redesign_pano_url from Supabase
and runs it through Marble Plus with is_pano: true.

Run: python modal_pipeline/test_marble_pano_plus.py
Requires: MARBLE_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


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

def http_get(url, headers=None, timeout=30):
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
        print(f"   HTTP {e.code}: {body[:300].decode(errors='replace')}")
        raise


def http_put_raw(url, data, headers=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="PUT")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


# ---------------------------------------------------------------------------
# Supabase — fetch most recent room with redesign_pano_url
# ---------------------------------------------------------------------------

def fetch_latest_pano_url(env):
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        print("ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing")
        sys.exit(1)

    # Query rooms table — latest row where redesign_pano_url is not null
    params = urllib.parse.urlencode({
        "select": "id,redesign_pano_url,created_at",
        "redesign_pano_url": "not.is.null",
        "order": "created_at.desc",
        "limit": "1",
    })
    url = f"{supabase_url}/rest/v1/rooms?{params}"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }

    print("Querying Supabase for most recent room with redesign_pano_url...")
    try:
        _, rows = http_get_json(url, headers=headers, timeout=15)
    except Exception as e:
        print(f"ERROR querying Supabase: {e}")
        sys.exit(1)

    if not rows:
        print("ERROR: No rooms found with a non-null redesign_pano_url")
        print("Run a redesign pipeline first to generate one.")
        sys.exit(1)

    room = rows[0]
    pano_url = room["redesign_pano_url"]
    print(f"   Room ID:     {room['id']}")
    print(f"   Created at:  {room['created_at']}")
    print(f"   Pano URL:    {pano_url[:80]}...")
    return pano_url


# ---------------------------------------------------------------------------
# Marble Plus pipeline
# ---------------------------------------------------------------------------

def run_marble_plus(pano_url, env):
    marble_key = env.get("MARBLE_API_KEY", "")
    if not marble_key:
        print("ERROR: MARBLE_API_KEY not set in .env.local")
        sys.exit(1)

    BASE = "https://api.worldlabs.ai/marble/v1"
    auth = {"WLT-Api-Key": marble_key}

    print("\n=== Marble Plus Pipeline ===")

    # 1. Download pano
    print("\n1. Downloading panorama...")
    _, pano_bytes = http_get(pano_url, timeout=120)
    print(f"   Downloaded: {len(pano_bytes) / 1e6:.1f} MB")

    # 2. Prepare upload
    print("\n2. Preparing Marble media asset upload...")
    _, prep = http_post_json(
        f"{BASE}/media-assets:prepare_upload",
        {"file_name": "redesigned_pano.png", "kind": "image", "extension": "png"},
        headers=auth,
    )
    media_asset_id = prep["media_asset"]["media_asset_id"]
    upload_url = prep["upload_info"]["upload_url"]
    size_limit = prep["upload_info"]["required_headers"]["x-goog-content-length-range"]
    print(f"   Media asset ID: {media_asset_id}")

    # 3. Upload to GCS
    print("\n3. Uploading to GCS...")
    status, _ = http_put_raw(
        upload_url, pano_bytes,
        headers={"x-goog-content-length-range": size_limit},
    )
    if status not in (200, 204):
        print(f"   FAILED: HTTP {status}")
        sys.exit(1)
    print(f"   Upload OK (HTTP {status})")

    # 4. Generate Marble Plus world
    print("\n4. Submitting Marble Plus generation (is_pano=true)...")
    _, gen = http_post_json(
        f"{BASE}/worlds:generate",
        {
            "model": "Marble 0.1-plus",
            "display_name": "Cova pano plus test",
            "world_prompt": {
                "type": "image",
                "image_prompt": {
                    "source": "media_asset",
                    "media_asset_id": media_asset_id,
                    "is_pano": True,
                },
            },
            "permission": {"public": False},
        },
        headers=auth,
    )
    operation_id = gen["operation_id"]
    print(f"   Operation ID: {operation_id}")

    # 5. Poll operation
    print("\n5. Polling (Marble Plus typically ~5-6 min)...")
    start = time.time()
    world_id = None
    while time.time() - start < 660:
        elapsed = time.time() - start
        _, result = http_get_json(
            f"{BASE}/operations/{operation_id}", headers=auth, timeout=15
        )
        if result.get("done"):
            if result.get("error"):
                print(f"   FAILED: {result['error']}")
                sys.exit(1)
            world_id = (
                result.get("metadata", {}).get("world_id")
                or result.get("response", {}).get("world_id")
            )
            print(f"   Complete! World ID: {world_id}  ({elapsed:.0f}s)")
            break
        print(f"   Processing... {elapsed:.0f}s")
        time.sleep(15)

    if not world_id:
        print("   TIMED OUT after 660s")
        sys.exit(1)

    # 6. Fetch world assets
    print("\n6. Fetching world assets...")
    spz_urls = {}
    world_url = None
    thumbnail = None
    for attempt in range(10):
        _, w = http_get_json(f"{BASE}/worlds/{world_id}", headers=auth, timeout=15)
        spz_urls = w.get("assets", {}).get("splats", {}).get("spz_urls", {})
        world_url = w.get("assets", {}).get("imagery", {}).get("pano_url")
        thumbnail = w.get("assets", {}).get("thumbnail_url")
        if spz_urls.get("full_res"):
            break
        print(f"   SPZ not ready yet, retry {attempt + 1}/10...")
        time.sleep(10)

    total_time = time.time() - start

    print(f"\n=== RESULTS ===")
    print(f"  World ID:      {world_id}")
    print(f"  Marble URL:    https://marble.worldlabs.ai/world/{world_id}")
    print(f"  SPZ 100k:      {spz_urls.get('100k', 'N/A')}")
    print(f"  SPZ 500k:      {spz_urls.get('500k', 'N/A')}")
    print(f"  SPZ full_res:  {spz_urls.get('full_res', 'N/A')}")
    print(f"  World URL:     {world_url or 'N/A'}")
    print(f"  Thumbnail:     {thumbnail or 'N/A'}")
    print(f"  Total time:    {total_time:.0f}s")

    return {
        "world_id": world_id,
        "marble_url": f"https://marble.worldlabs.ai/world/{world_id}",
        "spz_urls": spz_urls,
        "world_url": world_url,
        "thumbnail_url": thumbnail,
        "source_pano_url": pano_url,
        "total_time_seconds": round(total_time),
    }


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    env = load_env()
    pano_url = fetch_latest_pano_url(env)
    results = run_marble_plus(pano_url, env)

    out_path = Path(__file__).parent / "test_pano_plus_results.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\nResults saved to: {out_path}")
    print(f"View in Marble:   {results['marble_url']}")

    success = bool(results["spz_urls"].get("full_res"))
    print(f"\n{'PASS' if success else 'FAIL (no SPZ full_res)'}")
    sys.exit(0 if success else 1)
