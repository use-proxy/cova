"""
DepthFlow parallax video renderer on Modal.

Generates a cinematic parallax MP4 from a room render image + depth map,
then uploads the result to Supabase Storage at room-videos/{room_id}/parallax.mp4.

Usage (after deployment):
  modal run modal_pipeline/depthflow_render.py --render-url <url> --depth-url <url> --room-id <id>

To deploy:
  modal deploy modal_pipeline/depthflow_render.py

The deployed function URL can then be called from the Next.js /api/parallax route.
"""

import modal
import os

app = modal.App("cova-depthflow")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "depthflow==0.9.1",
        "requests",
        "supabase",
    )
)


@app.function(
    image=image,
    gpu="t4",
    timeout=120,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
    ],
)
def generate_parallax(render_url: str, depth_map_url: str, room_id: str) -> str:
    """
    Generate a parallax MP4 video from a render image and its depth map.

    Args:
        render_url: Public URL of the FLUX redesigned render image.
        depth_map_url: Public URL of the depth map (grayscale PNG).
        room_id: Room ID used to construct the Supabase Storage path.

    Returns:
        Public URL of the uploaded parallax.mp4 in Supabase Storage.
    """
    import requests
    import subprocess
    from supabase import create_client

    render_path = "/tmp/render.jpg"
    depth_path = "/tmp/depth.png"
    output_path = "/tmp/parallax.mp4"

    # Download render and depth map
    for url, path in [(render_url, render_path), (depth_map_url, depth_path)]:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        with open(path, "wb") as f:
            f.write(r.content)

    # Run DepthFlow CLI — dolly animation, 3s at 30fps, 1080×1920
    result = subprocess.run(
        [
            "depthflow",
            "dolly",
            "main",
            "--image", render_path,
            "--depth", depth_path,
            "--output", output_path,
            "--time", "3",
            "--fps", "30",
            "--width", "1080",
            "--height", "1920",
        ],
        capture_output=True,
        text=True,
        timeout=90,
    )

    if result.returncode != 0:
        raise RuntimeError(f"DepthFlow failed:\nstdout: {result.stdout}\nstderr: {result.stderr}")

    # Upload to Supabase Storage
    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_KEY"]
    sb = create_client(supabase_url, supabase_key)

    with open(output_path, "rb") as f:
        video_bytes = f.read()

    storage_path = f"room-videos/{room_id}/parallax.mp4"
    sb.storage.from_("room-videos").upload(
        storage_path,
        video_bytes,
        {"content-type": "video/mp4", "upsert": "true"},
    )

    video_url: str = sb.storage.from_("room-videos").get_public_url(storage_path)
    return video_url


@app.local_entrypoint()
def main(render_url: str, depth_url: str, room_id: str) -> None:
    result = generate_parallax.remote(render_url, depth_url, room_id)
    print(f"Parallax video URL: {result}")
