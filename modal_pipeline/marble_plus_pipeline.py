"""
Cova M7 Session 3 — Marble Plus 3D Lift Pipeline
Takes redesign_pano_url, uploads to Marble Plus as panoramic image,
generates navigable 3D redesigned room.
Cost: 1,500 credits ($1.20) with is_pano: true.
"""

import os
import json
import time

import modal

image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install("supabase", "requests", "Pillow", "fastapi[standard]")
)

app = modal.App("cova-marble-plus-pipeline", image=image)

MARBLE_BASE_URL = "https://api.worldlabs.ai/marble/v1"


def download_redesigned_pano(redesign_pano_url, room_id, user_id, supabase_client):
    """Download redesigned pano from URL, fallback to Supabase storage."""
    import requests

    print(f"[marble+] Downloading redesigned pano...")
    try:
        resp = requests.get(redesign_pano_url, timeout=60)
        if resp.ok:
            pano_bytes = resp.content
            print(f"[marble+] Downloaded from URL: {len(pano_bytes)/1e6:.1f}MB")
            if "replicate.delivery" in redesign_pano_url:
                storage_path = f"{user_id}/{room_id}/redesigned_pano.png"
                try:
                    supabase_client.storage.from_("room-videos").upload(
                        path=storage_path, file=pano_bytes,
                        file_options={"content-type": "image/png"},
                    )
                except Exception:
                    try:
                        supabase_client.storage.from_("room-videos").update(
                            path=storage_path, file=pano_bytes,
                            file_options={"content-type": "image/png"},
                        )
                    except Exception as e:
                        print(f"[marble+] Warning: could not store copy: {e}")
            return pano_bytes
    except Exception as e:
        print(f"[marble+] Direct URL failed: {e}")

    storage_path = f"{user_id}/{room_id}/redesigned_pano.png"
    print(f"[marble+] Trying Supabase storage: {storage_path}")
    pano_bytes = supabase_client.storage.from_("room-videos").download(storage_path)
    print(f"[marble+] Downloaded from Supabase: {len(pano_bytes)/1e6:.1f}MB")
    return pano_bytes


def upload_pano_to_marble(pano_bytes, marble_key):
    """Upload panorama image to Marble. Returns media_asset_id."""
    import requests

    resp = requests.post(
        f"{MARBLE_BASE_URL}/media-assets:prepare_upload",
        headers={"WLT-Api-Key": marble_key, "Content-Type": "application/json"},
        json={"file_name": "redesigned_room.png", "kind": "image", "extension": "png"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    media_asset_id = data["media_asset"]["media_asset_id"]
    upload_url = data["upload_info"]["upload_url"]
    size_limit = data["upload_info"]["required_headers"]["x-goog-content-length-range"]
    print(f"[marble+] Media asset: {media_asset_id}")

    upload_resp = requests.put(
        upload_url, data=pano_bytes,
        headers={"x-goog-content-length-range": size_limit},
        timeout=120,
    )
    if upload_resp.status_code not in (200, 204):
        raise RuntimeError(f"GCS upload failed: {upload_resp.status_code} {upload_resp.text[:300]}")
    print("[marble+] Upload successful")
    return media_asset_id


def generate_plus_world(media_asset_id, marble_key):
    """Generate Marble Plus world from pano. Returns operation_id."""
    import requests

    resp = requests.post(
        f"{MARBLE_BASE_URL}/worlds:generate",
        headers={"WLT-Api-Key": marble_key, "Content-Type": "application/json"},
        json={
            "model": "Marble 0.1-plus",
            "display_name": "Cova Redesigned Room",
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
        timeout=30,
    )
    resp.raise_for_status()
    operation_id = resp.json()["operation_id"]
    print(f"[marble+] Operation: {operation_id}")
    return operation_id


def poll_plus_operation(operation_id, marble_key, max_wait=600, poll_interval=15):
    """Poll Marble Plus operation (~5-6 min). Returns world_id."""
    import requests

    start = time.time()
    while time.time() - start < max_wait:
        resp = requests.get(
            f"{MARBLE_BASE_URL}/operations/{operation_id}",
            headers={"WLT-Api-Key": marble_key}, timeout=30,
        )
        resp.raise_for_status()
        result = resp.json()
        if result.get("done"):
            if result.get("error"):
                desc = result.get("metadata", {}).get("progress", {}).get("description", "")
                raise RuntimeError(f"Marble Plus failed: {result['error']} | {desc}")
            world_id = (result.get("metadata", {}).get("world_id")
                        or result.get("response", {}).get("world_id"))
            if not world_id:
                raise RuntimeError("Operation complete but no world_id")
            elapsed = time.time() - start
            print(f"[marble+] World: {world_id} ({elapsed:.0f}s)")
            return world_id
        elapsed = time.time() - start
        print(f"[marble+] Processing... {elapsed:.0f}s")
        time.sleep(poll_interval)
    raise RuntimeError(f"Marble Plus timed out after {max_wait}s")


def fetch_plus_assets(world_id, marble_key, max_retries=8, retry_delay=10):
    """Fetch Marble Plus world assets. Retries until SPZ ready."""
    import requests

    for attempt in range(max_retries):
        resp = requests.get(
            f"{MARBLE_BASE_URL}/worlds/{world_id}",
            headers={"WLT-Api-Key": marble_key}, timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        spz_urls = data.get("assets", {}).get("splats", {}).get("spz_urls", {})
        pano_url = data.get("assets", {}).get("imagery", {}).get("pano_url")
        thumbnail_url = data.get("assets", {}).get("thumbnail_url")
        caption = data.get("assets", {}).get("caption")

        if spz_urls.get("full_res"):
            print(f"[marble+] SPZ ready on attempt {attempt + 1}")
            return {
                "world_id": world_id,
                "spz_url_full_res": spz_urls["full_res"],
                "spz_url_500k": spz_urls.get("500k", ""),
                "spz_url_100k": spz_urls.get("100k", ""),
                "pano_url": pano_url,
                "thumbnail_url": thumbnail_url,
                "caption": caption,
                "marble_url": f"https://marble.worldlabs.ai/world/{world_id}",
            }
        if attempt < max_retries - 1:
            print(f"[marble+] SPZ not ready, retry {attempt+1}/{max_retries}...")
            time.sleep(retry_delay)

    raise RuntimeError(f"SPZ not available after {max_retries} attempts")


def store_spz(spz_url, room_id, user_id, supabase_client, resolution="full_res"):
    """Download SPZ from Marble CDN and store in Supabase Storage."""
    import requests

    print(f"[marble+] Downloading {resolution} SPZ...")
    resp = requests.get(spz_url, timeout=120)
    resp.raise_for_status()
    spz_bytes = resp.content
    print(f"[marble+] SPZ size: {len(spz_bytes)/1e6:.1f}MB")

    storage_path = f"{user_id}/{room_id}/redesigned_room_{resolution}.spz"
    try:
        supabase_client.storage.from_("room-videos").upload(
            path=storage_path, file=spz_bytes,
            file_options={"content-type": "application/octet-stream"},
        )
    except Exception:
        supabase_client.storage.from_("room-videos").update(
            path=storage_path, file=spz_bytes,
            file_options={"content-type": "application/octet-stream"},
        )
    print(f"[marble+] Stored SPZ: {storage_path}")
    return storage_path


@app.function(
    timeout=900,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("marble-credentials"),
    ],
)
def generate_redesigned_3d_world(room_id: str, user_id: str) -> dict:
    """
    Main pipeline: redesign_pano_url -> Marble Plus -> navigable 3D world.
    Cost: $1.20 (1,500 credits with is_pano: true).
    """
    from supabase import create_client

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    marble_key = os.environ["MARBLE_API_KEY"]
    client = create_client(supabase_url, supabase_key)

    client.table("rooms").update({
        "redesign_status": "marble_plus_processing",
        "status": "redesign_processing",
    }).eq("id", room_id).execute()

    try:
        room = client.table("rooms").select(
            "redesign_pano_url, user_id, room_type"
        ).eq("id", room_id).single().execute().data

        if not room:
            raise RuntimeError(f"Room {room_id} not found")
        redesign_pano_url = room.get("redesign_pano_url")
        if not redesign_pano_url:
            raise RuntimeError(f"Room {room_id} has no redesign_pano_url")

        print(f"[marble+] Pano: {redesign_pano_url[:80]}...")

        pano_bytes = download_redesigned_pano(redesign_pano_url, room_id, user_id, client)
        media_asset_id = upload_pano_to_marble(pano_bytes, marble_key)
        operation_id = generate_plus_world(media_asset_id, marble_key)
        world_id = poll_plus_operation(operation_id, marble_key)
        assets = fetch_plus_assets(world_id, marble_key)

        spz_storage_path = store_spz(
            assets["spz_url_full_res"], room_id, user_id, client, "full_res"
        )
        signed = client.storage.from_("room-videos").create_signed_url(spz_storage_path, 86400)
        spz_signed_url = signed.get("signedURL", assets["spz_url_full_res"])

        client.table("rooms").update({
            "marble_plus_world_id": world_id,
            "marble_spz_url": assets["spz_url_full_res"],
            "marble_spz_url_500k": assets["spz_url_500k"],
            "marble_spz_url_100k": assets["spz_url_100k"],
            "marble_plus_pano_url": assets.get("pano_url"),
            "marble_plus_thumbnail_url": assets.get("thumbnail_url"),
            "redesign_status": "marble_plus_complete",
            "status": "redesign_complete",
        }).eq("id", room_id).execute()

        print(f"[marble+] Session 3 complete! World: {assets['marble_url']}")
        return {
            "room_id": room_id,
            "world_id": world_id,
            "marble_url": assets["marble_url"],
            "spz_url_full_res": assets["spz_url_full_res"],
            "spz_url_500k": assets["spz_url_500k"],
            "spz_url_100k": assets["spz_url_100k"],
            "spz_storage_path": spz_storage_path,
            "spz_signed_url": spz_signed_url,
            "thumbnail_url": assets.get("thumbnail_url"),
            "caption": assets.get("caption"),
        }

    except Exception as e:
        print(f"[marble+] ERROR: {e}")
        client.table("rooms").update({
            "redesign_status": "error", "status": "error",
        }).eq("id", room_id).execute()
        raise


@app.function(
    timeout=900,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("marble-credentials"),
    ],
)
@modal.fastapi_endpoint(method="POST")
def marble_plus_webhook(item: dict):
    """HTTP webhook for triggering Marble Plus from Next.js."""
    room_id = item.get("room_id")
    user_id = item.get("user_id", "test-user")
    if not room_id:
        return {"error": "room_id required"}
    try:
        result = generate_redesigned_3d_world.local(room_id, user_id)
        return {"status": "complete", **result}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.local_entrypoint()
def test_local(room_id: str = "", user_id: str = "test-user"):
    import uuid
    if not room_id:
        room_id = str(uuid.uuid4())
        print(f"Generated room_id: {room_id}")
    result = generate_redesigned_3d_world.remote(room_id, user_id)
    print("\n=== RESULT ===")
    for k, v in result.items():
        print(f"  {k}: {v}")
