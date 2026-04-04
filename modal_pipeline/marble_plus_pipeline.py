"""
Cova — Marble Plus 3D Lift Pipeline (Reconstruction Mode)
Takes up to 8 capture photos, uploads to Marble Plus with reconstruct_images.
Generates navigable 3D room from the same photos used by Mini.
Cost: 1,500 credits ($1.20) with reconstruct_images.
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


def upload_photo_to_marble(photo_url, index, marble_key):
    """Download photo from URL, upload to Marble GCS. Returns media_asset_id."""
    import requests

    img_resp = requests.get(photo_url, timeout=60)
    img_resp.raise_for_status()
    img_bytes = img_resp.content
    print(f"[marble+] Downloaded photo {index}: {len(img_bytes)/1e6:.1f}MB")

    prep_resp = requests.post(
        f"{MARBLE_BASE_URL}/media-assets:prepare_upload",
        headers={"WLT-Api-Key": marble_key, "Content-Type": "application/json"},
        json={"file_name": f"plus_photo_{index}.jpg", "kind": "image", "extension": "jpg"},
        timeout=30,
    )
    prep_resp.raise_for_status()
    data = prep_resp.json()
    asset_id = data["media_asset"]["media_asset_id"]
    upload_url = data["upload_info"]["upload_url"]
    size_limit = data["upload_info"]["required_headers"]["x-goog-content-length-range"]

    upload_resp = requests.put(
        upload_url, data=img_bytes,
        headers={"x-goog-content-length-range": size_limit},
        timeout=120,
    )
    if upload_resp.status_code not in (200, 204):
        raise RuntimeError(f"GCS upload failed for photo {index}: {upload_resp.status_code}")

    print(f"[marble+] Uploaded photo {index} -> {asset_id}")
    return asset_id


def poll_plus_operation(operation_id, marble_key, max_wait=780, poll_interval=15):
    """Poll Marble Plus operation (~5-10 min for 8-photo reconstruct). Returns world_id."""
    import requests

    start = time.time()
    consecutive_errors = 0
    while time.time() - start < max_wait:
        try:
            resp = requests.get(
                f"{MARBLE_BASE_URL}/operations/{operation_id}",
                headers={"WLT-Api-Key": marble_key}, timeout=30,
            )
            if resp.status_code != 200:
                consecutive_errors += 1
                print(f"[marble+] Poll HTTP {resp.status_code}: {resp.text[:200]} (error {consecutive_errors}/5)")
                if consecutive_errors >= 5:
                    raise RuntimeError(f"Marble Plus polling failed {consecutive_errors} times, last: {resp.status_code}")
                time.sleep(poll_interval)
                continue
            consecutive_errors = 0
            result = resp.json()
        except requests.exceptions.RequestException as e:
            consecutive_errors += 1
            print(f"[marble+] Poll network error: {e} (error {consecutive_errors}/5)")
            if consecutive_errors >= 5:
                raise RuntimeError(f"Marble Plus polling failed {consecutive_errors} times: {e}")
            time.sleep(poll_interval)
            continue

        if result.get("done"):
            if result.get("error"):
                desc = result.get("metadata", {}).get("progress", {}).get("description", "")
                print(f"[marble+] Operation failed. Full response: {json.dumps(result)[:500]}")
                raise RuntimeError(f"Marble Plus failed: {result['error']} | {desc}")
            world_id = (result.get("metadata", {}).get("world_id")
                        or result.get("response", {}).get("world_id"))
            if not world_id:
                print(f"[marble+] No world_id in done response: {json.dumps(result)[:500]}")
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
    Main pipeline: 8 capture photos -> Marble Plus reconstruct -> navigable 3D world.
    Cost: $1.20 (1,500 credits with reconstruct_images).
    """
    from supabase import create_client
    from concurrent.futures import ThreadPoolExecutor, as_completed

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    marble_key = os.environ["MARBLE_API_KEY"]
    client = create_client(supabase_url, supabase_key)

    # Do NOT overwrite redesign_status here — depth-video/furniture may be running
    # Plus runs in background; only set plus_upgrade_ready when done
    try:
        room = client.table("rooms").select(
            "capture_photo_urls, user_id, room_type, style_blend"
        ).eq("id", room_id).single().execute().data

        if not room:
            raise RuntimeError(f"Room {room_id} not found")

        photo_urls = room.get("capture_photo_urls") or []
        if len(photo_urls) < 4:
            raise RuntimeError(f"Room {room_id} has {len(photo_urls)} photos, need at least 4")

        # Limit to 8 photos max
        photo_urls = photo_urls[:8]
        print(f"[marble+] Using {len(photo_urls)} capture photos")

        # Build style text prompt
        style_blend = room.get("style_blend") or {}
        room_type = room.get("room_type", "living room")
        dominant_styles = sorted(style_blend.items(), key=lambda x: x[1], reverse=True)
        dominant_style = dominant_styles[0][0] if dominant_styles else "modern"
        text_prompt = f"photorealistic {room_type} interior in {dominant_style} style, navigable 3D world, accurate room geometry"

        # Upload all photos to Marble in parallel
        print(f"[marble+] Uploading {len(photo_urls)} photos to Marble...")
        asset_ids = [None] * len(photo_urls)
        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = {
                executor.submit(upload_photo_to_marble, url, i, marble_key): i
                for i, url in enumerate(photo_urls)
            }
            for future in as_completed(futures):
                idx = futures[future]
                asset_ids[idx] = future.result()

        print(f"[marble+] All {len(asset_ids)} photos uploaded")

        # Build multi-image prompt with reconstruct_images
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

        import requests
        gen_resp = requests.post(
            f"{MARBLE_BASE_URL}/worlds:generate",
            headers={"WLT-Api-Key": marble_key, "Content-Type": "application/json"},
            json={
                "model": "Marble 0.1-plus",
                "display_name": f"Cova Room {room_id} - Plus",
                "world_prompt": {
                    "type": "multi-image",
                    "multi_image_prompt": multi_image_prompt,
                    "reconstruct_images": True,
                    "text_prompt": text_prompt,
                    "disable_recaption": True,
                },
                "permission": {"public": False},
            },
            timeout=30,
        )
        gen_data = gen_resp.json()
        if "operation_id" not in gen_data:
            raise RuntimeError(f"Marble Plus generate failed ({gen_resp.status_code}): {json.dumps(gen_data)[:500]}")
        operation_id = gen_data["operation_id"]
        print(f"[marble+] Operation: {operation_id}")

        world_id = poll_plus_operation(operation_id, marble_key)
        assets = fetch_plus_assets(world_id, marble_key)

        spz_storage_path = store_spz(
            assets["spz_url_full_res"], room_id, user_id, client, "full_res"
        )
        signed = client.storage.from_("room-videos").create_signed_url(spz_storage_path, 86400)
        spz_signed_url = signed.get("signedURL", assets["spz_url_full_res"])

        import datetime
        # Write Plus data first
        client.table("rooms").update({
            "marble_plus_world_id": world_id,
            "marble_spz_url": assets["spz_url_full_res"],
            "marble_spz_url_500k": assets["spz_url_500k"],
            "marble_spz_url_100k": assets["spz_url_100k"],
            "marble_plus_pano_url": assets.get("pano_url"),
            "marble_plus_thumbnail_url": assets.get("thumbnail_url"),
            "plus_upgrade_ready": True,
            "plus_completed_at": datetime.datetime.utcnow().isoformat(),
        }).eq("id", room_id).execute()
        # Only promote to "complete" if currently video_ready (don't clobber error state)
        current = client.table("rooms").select("redesign_status").eq("id", room_id).single().execute().data
        if current and current.get("redesign_status") in ("video_ready", "marble_plus_processing"):
            client.table("rooms").update({"redesign_status": "complete"}).eq("id", room_id).execute()

        # Notify the web app that Plus is complete (best effort)
        app_url = os.environ.get("NEXT_PUBLIC_APP_URL", "")
        if app_url:
            try:
                callback_resp = requests.get(
                    f"{app_url}/api/pipeline/plus-complete?roomId={room_id}",
                    timeout=10,
                )
                print(f"[marble+] Callback status: {callback_resp.status_code}")
            except Exception as cb_err:
                print(f"[marble+] Callback failed (non-fatal): {cb_err}")

        print(f"[marble+] Complete! World: {assets['marble_url']}")
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
        import traceback
        print(f"[marble+] ERROR: {e}")
        print(f"[marble+] Traceback: {traceback.format_exc()}")
        # Don't clobber redesign_status — Plus is a background upgrade, not critical path
        # Only mark plus as failed, leave video_ready/complete intact
        client.table("rooms").update({
            "plus_upgrade_ready": False,
            "plus_completed_at": None,
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
