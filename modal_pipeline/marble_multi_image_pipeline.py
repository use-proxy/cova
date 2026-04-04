"""
Cova — Multi-Image Marble Mini Pipeline (Reconstruction Mode)
Takes up to 8 portrait photos, uses reconstruct_images for automatic layout.
Produces: real room SPZ (for furniture selection) + pano (for FLUX input).

Stage 1 of the new pipeline architecture.
Cost: 250 credits ($0.20) — multi-image Mini input
Time: ~30-90 seconds
"""
import modal
import os
import json
import time

app = modal.App("cova-marble-multi-image")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install("requests", "fastapi[standard]")
)

MARBLE_BASE = "https://api.worldlabs.ai/marble/v1"
POLL_INTERVAL = 3
MAX_POLLS = 40


def upload_photo_to_marble(photo_url, index, room_id, marble_headers):
    """Download from Supabase, upload to Marble GCS. Returns media_asset_id."""
    import requests
    img_resp = requests.get(photo_url, timeout=30)
    img_bytes = img_resp.content
    file_size = len(img_bytes)

    prep_resp = requests.post(
        f"{MARBLE_BASE}/media-assets:prepare_upload",
        headers=marble_headers,
        json={
            "file_name": f"room_{room_id}_photo_{index}.jpg",
            "kind": "image",
            "extension": "jpg",
        },
        timeout=15,
    )
    prep_data = prep_resp.json()
    asset_id = prep_data["media_asset"]["media_asset_id"]
    upload_url = prep_data["upload_info"]["upload_url"]
    size_limit = prep_data["upload_info"]["required_headers"]["x-goog-content-length-range"]

    upload_resp = requests.put(
        upload_url,
        data=img_bytes,
        headers={"x-goog-content-length-range": size_limit},
        timeout=60,
    )

    if upload_resp.status_code not in (200, 204):
        raise Exception(f"GCS upload failed: {upload_resp.status_code}")

    print(f"[multi-image] Uploaded photo {index} -> asset {asset_id}")
    return asset_id


@app.function(
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("marble-credentials"),
    ],
    image=image,
    timeout=300,
    max_containers=5,
)
def process_multi_image(
    room_id: str,
    photo_urls: list,
) -> dict:
    """
    Uploads photos to Marble GCS, generates Mini world with reconstruction mode.
    """
    import requests
    from concurrent.futures import ThreadPoolExecutor, as_completed

    sb_url = os.environ["SUPABASE_URL"]
    sb_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    marble_key = os.environ["MARBLE_API_KEY"]

    sb_headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Content-Type": "application/json",
    }
    marble_headers = {
        "WLT-Api-Key": marble_key,
        "Content-Type": "application/json",
    }

    def update_room(data):
        requests.patch(
            f"{sb_url}/rest/v1/rooms?id=eq.{room_id}",
            headers=sb_headers,
            json=data,
            timeout=10,
        )

    update_room({"redesign_status": "generating_mini_world"})

    # Upload all photos in parallel
    asset_ids = [None] * len(photo_urls)
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(upload_photo_to_marble, url, i, room_id, marble_headers): i
            for i, url in enumerate(photo_urls)
        }
        for future in as_completed(futures):
            idx = futures[future]
            asset_ids[idx] = future.result()

    print(f"[multi-image] All {len(asset_ids)} photos uploaded to Marble")

    # Build multi-image prompt — azimuth null, let Marble reconstruct layout
    multi_image_prompt = [
        {
            "azimuth": None,
            "content": {
                "source": "media_asset",
                "media_asset_id": asset_id,
            },
        }
        for asset_id in asset_ids
    ]

    # Generate Mini world with reconstruction mode
    gen_resp = requests.post(
        f"{MARBLE_BASE}/worlds:generate",
        headers=marble_headers,
        json={
            "model": "Marble 0.1-mini",
            "display_name": f"Cova Room {room_id} - Original",
            "world_prompt": {
                "type": "multi-image",
                "multi_image_prompt": multi_image_prompt,
                "reconstruct_images": True,
                "text_prompt": "photorealistic indoor residential interior, architectural room scan, high detail, accurate spatial geometry",
                "disable_recaption": True,
            },
            "permission": {"public": False},
        },
        timeout=30,
    )

    gen_data = gen_resp.json()
    if "operation_id" not in gen_data:
        raise Exception(f"Marble generate failed ({gen_resp.status_code}): {json.dumps(gen_data)[:500]}")
    operation_id = gen_data["operation_id"]
    print(f"[multi-image] Generation started: operation {operation_id}")

    # Poll for completion
    world_data = None
    for poll_num in range(MAX_POLLS):
        time.sleep(POLL_INTERVAL)
        poll_resp = requests.get(
            f"{MARBLE_BASE}/operations/{operation_id}",
            headers={"WLT-Api-Key": marble_key},
            timeout=15,
        )
        poll_data = poll_resp.json()

        if poll_data.get("done"):
            if poll_data.get("error"):
                raise Exception(f"Marble Mini failed: {poll_data['error']}")
            world_data = poll_data["response"]
            break

        if poll_num % 5 == 0:
            print(f"[multi-image] Still generating... ({poll_num * POLL_INTERVAL}s elapsed)")

    if not world_data:
        raise Exception("Marble Mini timeout after 120 seconds")

    world_id = world_data["world_id"]

    # Fetch world assets (retry for pano_url)
    world_full = None
    pano_url = None
    for attempt in range(8):
        world_resp = requests.get(
            f"{MARBLE_BASE}/worlds/{world_id}",
            headers={"WLT-Api-Key": marble_key},
            timeout=15,
        )
        world_full = world_resp.json()
        pano_url = world_full.get("assets", {}).get("imagery", {}).get("pano_url")
        if pano_url:
            break
        print(f"[multi-image] pano_url not ready, retry {attempt + 1}/8...")
        time.sleep(5)

    if not pano_url:
        raise Exception("pano_url never became available after 8 retries")

    # Extract SPZ URLs
    splats = world_full.get("assets", {}).get("splats", {}).get("spz_urls", {})
    spz_full = splats.get("full_res") or splats.get("fullres") or splats.get("full")
    spz_500k = splats.get("500k") or splats.get("500000")
    spz_100k = splats.get("100k") or splats.get("100000")

    # Download pano and store in Supabase Storage (room-videos bucket)
    pano_resp = requests.get(pano_url, timeout=60)
    pano_storage_path = f"{room_id}/original_pano.jpg"
    requests.post(
        f"{sb_url}/storage/v1/object/room-videos/{pano_storage_path}",
        headers={
            "apikey": sb_key,
            "Authorization": f"Bearer {sb_key}",
            "Content-Type": "image/jpeg",
            "x-upsert": "true",
        },
        data=pano_resp.content,
        timeout=30,
    )

    # Store the Marble CDN pano_url directly (publicly accessible)
    # The Supabase copy in room-videos is just a backup
    # For marble_pano_url, use the Marble CDN URL which is public
    stored_pano_url = pano_url  # Marble CDN URL — publicly accessible

    # Update room
    update_room({
        "redesign_status": "mini_world_ready",
        "marble_world_id": world_id,
        "marble_pano_url": stored_pano_url,
        "marble_mini_spz_url": spz_full,
        "marble_spz_url_500k": spz_500k,
        "marble_spz_url_100k": spz_100k,
        "pipeline_cost_log": {"stage1_mini": 0.20},
    })

    print(f"[multi-image] Complete. World: {world_id}, Pano stored, SPZ: {spz_full}")
    return {
        "world_id": world_id,
        "pano_url": stored_pano_url,
        "spz_full": spz_full,
        "spz_500k": spz_500k,
        "spz_100k": spz_100k,
    }


@app.function(
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("marble-credentials"),
    ],
    image=image,
    timeout=300,
    max_containers=5,
)
@modal.fastapi_endpoint(method="POST")
def marble_multi_image_webhook(item: dict):
    room_id = item.get("room_id")
    photo_urls = item.get("photo_urls", [])
    if not room_id:
        return {"error": "room_id required"}
    if len(photo_urls) < 4:
        return {"error": f"Need at least 4 photos, got {len(photo_urls)}"}
    # Limit to 8 photos max for reconstruction mode
    photo_urls = photo_urls[:8]
    try:
        result = process_multi_image.local(room_id, photo_urls)
        return {"status": "complete", **result}
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[multi-image] ERROR: {tb}")
        return {"status": "error", "error": str(e), "traceback": tb}


@app.local_entrypoint()
def main(room_id: str = "test", photo_urls: str = "[]"):
    urls = json.loads(photo_urls)
    result = process_multi_image.remote(room_id, urls)
    print(json.dumps(result, indent=2))
