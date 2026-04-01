"""
Cova M7 Session 1 — Marble Video Processing Pipeline
Takes a room video from Supabase Storage, processes through Marble Mini,
returns panorama URL and stores everything in Supabase.
"""

import os
import json
import time
import tempfile
import subprocess

import modal

# Modal setup
image = (
    modal.Image.from_registry(
        "pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime",
        add_python="3.10",
    )
    .apt_install("ffmpeg", "libgl1-mesa-glx", "libglib2.0-0")
    .pip_install("supabase", "requests", "Pillow", "fastapi[standard]")
)

app = modal.App("cova-marble-pipeline", image=image)

MARBLE_BASE_URL = "https://api.worldlabs.ai/marble/v1"
MAX_DURATION_SECONDS = 55  # Buffer below Marble's 60s limit
MAX_FILE_SIZE_BYTES = 95 * 1024 * 1024  # 95MB buffer below 100MB limit


def compress_and_trim_video(input_path: str, output_path: str) -> dict:
    """Compress and trim video to meet Marble constraints (<60s, <100MB)."""
    probe = subprocess.run(
        [
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_streams", "-show_format", input_path,
        ],
        capture_output=True, text=True,
    )
    probe_data = json.loads(probe.stdout)
    duration = float(probe_data["format"].get("duration", 0))
    file_size = os.path.getsize(input_path)
    print(f"[marble] Input video: {duration:.1f}s, {file_size / 1e6:.1f}MB")

    cmd = ["ffmpeg", "-i", input_path]
    if duration > MAX_DURATION_SECONDS:
        cmd.extend(["-t", str(MAX_DURATION_SECONDS)])
        print(f"[marble] Trimming to {MAX_DURATION_SECONDS}s")

    cmd.extend([
        "-vcodec", "libx264", "-crf", "28", "-preset", "fast",
        "-movflags", "+faststart", "-an", output_path, "-y",
    ])
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr}")

    output_size = os.path.getsize(output_path)
    print(f"[marble] Compressed: {output_size / 1e6:.1f}MB")

    if output_size > MAX_FILE_SIZE_BYTES:
        print("[marble] Still too large, increasing compression...")
        subprocess.run([
            "ffmpeg", "-i", input_path,
            "-t", str(MAX_DURATION_SECONDS),
            "-vcodec", "libx264", "-crf", "32", "-preset", "fast",
            "-movflags", "+faststart", "-an",
            "-vf", "scale=1280:-2",
            output_path, "-y",
        ], capture_output=True)
        output_size = os.path.getsize(output_path)
        print(f"[marble] Recompressed: {output_size / 1e6:.1f}MB")

    if output_size > MAX_FILE_SIZE_BYTES:
        raise RuntimeError(
            f"Video too large after compression: {output_size / 1e6:.1f}MB"
        )

    probe2 = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", output_path],
        capture_output=True, text=True,
    )
    output_duration = float(json.loads(probe2.stdout)["format"].get("duration", 0))

    return {"file_size_bytes": output_size, "duration_seconds": output_duration}


def upload_to_marble(video_bytes: bytes, marble_key: str) -> str:
    """Upload video to Marble. Returns media_asset_id."""
    import requests
    headers = {"WLT-Api-Key": marble_key, "Content-Type": "application/json"}

    resp = requests.post(
        f"{MARBLE_BASE_URL}/media-assets:prepare_upload",
        headers=headers,
        json={"file_name": "room.mp4", "kind": "video", "extension": "mp4"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    media_asset_id = data["media_asset"]["media_asset_id"]
    upload_url = data["upload_info"]["upload_url"]
    size_limit = data["upload_info"]["required_headers"]["x-goog-content-length-range"]
    print(f"[marble] Media asset ID: {media_asset_id}")

    # ONLY x-goog-content-length-range — no other headers
    upload_resp = requests.put(
        upload_url,
        data=video_bytes,
        headers={"x-goog-content-length-range": size_limit},
        timeout=300,
    )
    if upload_resp.status_code not in (200, 204):
        raise RuntimeError(f"GCS upload failed: {upload_resp.status_code} {upload_resp.text[:500]}")

    print("[marble] Upload successful")
    return media_asset_id


def generate_marble_world(media_asset_id: str, marble_key: str, model: str = "Marble 0.1-mini") -> str:
    """Trigger Marble world generation. Returns operation_id."""
    import requests
    resp = requests.post(
        f"{MARBLE_BASE_URL}/worlds:generate",
        headers={"WLT-Api-Key": marble_key, "Content-Type": "application/json"},
        json={
            "model": model,
            "display_name": "Cova Room",
            "world_prompt": {
                "type": "video",
                "video_prompt": {"source": "media_asset", "media_asset_id": media_asset_id},
            },
            "permission": {"public": False},
        },
        timeout=30,
    )
    resp.raise_for_status()
    operation_id = resp.json()["operation_id"]
    print(f"[marble] Operation ID: {operation_id}")
    return operation_id


def poll_marble_operation(operation_id: str, marble_key: str, max_wait: int = 600, poll_interval: int = 10) -> str:
    """Poll Marble operation until complete. Returns world_id."""
    import requests
    start = time.time()
    while time.time() - start < max_wait:
        resp = requests.get(
            f"{MARBLE_BASE_URL}/operations/{operation_id}",
            headers={"WLT-Api-Key": marble_key},
            timeout=30,
        )
        resp.raise_for_status()
        result = resp.json()

        if result.get("done"):
            if result.get("error"):
                desc = result.get("metadata", {}).get("progress", {}).get("description", "")
                raise RuntimeError(f"Marble failed: {result['error']} | {desc}")
            world_id = result.get("metadata", {}).get("world_id") or result.get("response", {}).get("world_id")
            if not world_id:
                raise RuntimeError("Operation complete but no world_id")
            print(f"[marble] World ID: {world_id}")
            return world_id

        elapsed = time.time() - start
        print(f"[marble] Processing... {elapsed:.0f}s elapsed")
        time.sleep(poll_interval)

    raise RuntimeError(f"Marble timed out after {max_wait}s")


def fetch_marble_world(world_id: str, marble_key: str, max_retries: int = 8, retry_delay: int = 5) -> dict:
    """Fetch completed world assets. Retries until pano_url is populated."""
    import requests
    spz_urls = {}
    thumbnail_url = None
    caption = None

    for attempt in range(max_retries):
        resp = requests.get(
            f"{MARBLE_BASE_URL}/worlds/{world_id}",
            headers={"WLT-Api-Key": marble_key},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        pano_url = data.get("assets", {}).get("imagery", {}).get("pano_url")
        spz_urls = data.get("assets", {}).get("splats", {}).get("spz_urls", {})
        thumbnail_url = data.get("assets", {}).get("thumbnail_url")
        caption = data.get("assets", {}).get("caption")

        if pano_url:
            print(f"[marble] pano_url obtained on attempt {attempt + 1}")
            return {
                "world_id": world_id,
                "pano_url": pano_url,
                "spz_url_100k": spz_urls.get("100k", ""),
                "spz_url_500k": spz_urls.get("500k", ""),
                "spz_url_full_res": spz_urls.get("full_res", ""),
                "thumbnail_url": thumbnail_url,
                "caption": caption,
                "marble_url": f"https://marble.worldlabs.ai/world/{world_id}",
            }

        if attempt < max_retries - 1:
            print(f"[marble] pano_url null, retry {attempt + 1}/{max_retries}...")
            time.sleep(retry_delay)

    print(f"[marble] WARNING: pano_url still null after {max_retries} attempts")
    return {
        "world_id": world_id,
        "pano_url": None,
        "spz_url_100k": spz_urls.get("100k", ""),
        "spz_url_500k": spz_urls.get("500k", ""),
        "spz_url_full_res": spz_urls.get("full_res", ""),
        "thumbnail_url": thumbnail_url,
        "caption": caption,
        "marble_url": f"https://marble.worldlabs.ai/world/{world_id}",
    }


def download_and_store_pano(pano_url: str, room_id: str, user_id: str, supabase_client) -> str:
    """Download panorama from Marble CDN and store in Supabase Storage."""
    import requests
    print("[marble] Downloading panorama...")
    pano_resp = requests.get(pano_url, timeout=60)
    pano_resp.raise_for_status()
    pano_bytes = pano_resp.content
    print(f"[marble] Panorama: {len(pano_bytes) / 1e6:.1f}MB")

    storage_path = f"{user_id}/{room_id}/room_pano.png"
    try:
        supabase_client.storage.from_("room-videos").upload(
            path=storage_path,
            file=pano_bytes,
            file_options={"content-type": "image/png"},
        )
    except Exception:
        supabase_client.storage.from_("room-videos").update(
            path=storage_path,
            file=pano_bytes,
            file_options={"content-type": "image/png"},
        )

    print(f"[marble] Panorama stored: {storage_path}")
    return storage_path


@app.function(
    timeout=600,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("marble-credentials"),
    ],
)
def process_room_video(room_id: str, user_id: str) -> dict:
    """
    Main pipeline: download video from Supabase → compress → upload to Marble →
    generate Mini world → poll → fetch pano → store pano → update DB.
    """
    from supabase import create_client

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    marble_key = os.environ["MARBLE_API_KEY"]
    client = create_client(supabase_url, supabase_key)

    client.table("rooms").update({
        "status": "processing",
        "redesign_status": "video_processing",
    }).eq("id", room_id).execute()

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            # Download video from Supabase Storage
            video_storage_path = f"{user_id}/{room_id}/video.webm"
            print(f"[marble] Downloading video: {video_storage_path}")

            try:
                video_bytes = client.storage.from_("room-videos").download(video_storage_path)
            except Exception:
                alt_path = f"{user_id}/{room_id}/room_video.mp4"
                print(f"[marble] Trying alternate path: {alt_path}")
                video_bytes = client.storage.from_("room-videos").download(alt_path)

            print(f"[marble] Downloaded: {len(video_bytes) / 1e6:.1f}MB")

            input_path = os.path.join(tmpdir, "input.webm")
            output_path = os.path.join(tmpdir, "processed.mp4")
            with open(input_path, "wb") as f:
                f.write(video_bytes)

            video_info = compress_and_trim_video(input_path, output_path)
            with open(output_path, "rb") as f:
                processed_bytes = f.read()

            media_asset_id = upload_to_marble(processed_bytes, marble_key)

            client.table("rooms").update({
                "redesign_status": "marble_generating",
            }).eq("id", room_id).execute()

            operation_id = generate_marble_world(media_asset_id, marble_key, "Marble 0.1-mini")
            world_id = poll_marble_operation(operation_id, marble_key)
            world = fetch_marble_world(world_id, marble_key)

            if not world["pano_url"]:
                raise RuntimeError("Marble did not return pano_url after retries")

            pano_storage_path = download_and_store_pano(
                world["pano_url"], room_id, user_id, client
            )

            signed = client.storage.from_("room-videos").create_signed_url(
                pano_storage_path, 86400
            )
            pano_signed_url = signed.get("signedURL", world["pano_url"])

            client.table("rooms").update({
                "marble_world_id": world_id,
                "marble_pano_url": world["pano_url"],
                "marble_spz_url": world["spz_url_full_res"],
                "marble_mini_world_id": world_id,
                "status": "reconstruction_complete",
                "redesign_status": "pano_ready",
                "modal_job_id": f"marble_mini_{world_id}",
            }).eq("id", room_id).execute()

            print(f"[marble] Complete! World: {world['marble_url']}")
            return {
                "room_id": room_id,
                "world_id": world_id,
                "marble_url": world["marble_url"],
                "pano_url": world["pano_url"],
                "pano_storage_path": pano_storage_path,
                "pano_signed_url": pano_signed_url,
                "spz_url_full_res": world["spz_url_full_res"],
                "caption": world["caption"],
                "video_duration_seconds": video_info["duration_seconds"],
                "video_size_bytes": video_info["file_size_bytes"],
            }

    except Exception as e:
        print(f"[marble] ERROR: {e}")
        client.table("rooms").update({
            "status": "error",
            "redesign_status": "error",
        }).eq("id", room_id).execute()
        raise


@app.function(
    timeout=600,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("marble-credentials"),
    ],
)
@modal.fastapi_endpoint(method="POST")
def marble_process_webhook(item: dict):
    """HTTP webhook for triggering Marble processing from Next.js."""
    room_id = item.get("room_id")
    user_id = item.get("user_id", "test-user")

    if not room_id:
        return {"error": "room_id required"}

    try:
        result = process_room_video.local(room_id, user_id)
        return {"status": "complete", **result}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.local_entrypoint()
def test_local(room_id: str = "", user_id: str = "test-user"):
    """Usage: modal run modal_pipeline/marble_pipeline.py --room-id <id>"""
    import uuid

    if not room_id:
        room_id = str(uuid.uuid4())
        print(f"Generated room_id: {room_id}")

    print(f"Testing Marble pipeline for room {room_id}...")
    result = process_room_video.remote(room_id, user_id)

    print("\n=== RESULT ===")
    for k, v in result.items():
        print(f"  {k}: {v}")
