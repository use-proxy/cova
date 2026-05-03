"""
Cova v3 — Structural Extraction
Extracts depth map and edge map from a preprocessed room photo.
These are inputs to the professionalization pass and main generation.

Functions:
  extract_depth_map   — calls fal-ai/imageutils/depth (Depth-Anything-V2), returns depth URL
  extract_canny_edges — hard Canny (100/200) for structural edges only, returns edge URL
  extract_hed_edges   — LEGACY soft-edge approximation — kept for A/B testing only
"""

import io
import os

import modal

# ---------------------------------------------------------------------------
# Modal images
# ---------------------------------------------------------------------------

fal_image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install("fal-client", "supabase", "requests", "Pillow")
)

opencv_image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install("opencv-python-headless", "numpy", "supabase", "requests", "Pillow")
)

app = modal.App("cova-structural-extraction")

STORAGE_BUCKET = "room-photos"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _download_bytes(url: str) -> bytes:
    import requests
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return resp.content


def _upload_to_supabase(img_bytes: bytes, path: str, content_type: str = "image/jpeg") -> str:
    """Upload bytes to Supabase Storage and return the public URL."""
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(url, key)

    client.storage.from_(STORAGE_BUCKET).upload(
        path,
        img_bytes,
        {"content-type": content_type, "upsert": "true"},
    )
    public = client.storage.from_(STORAGE_BUCKET).get_public_url(path)
    return public


# ---------------------------------------------------------------------------
# 1. Depth map via fal-ai/imageutils/depth
# ---------------------------------------------------------------------------

@app.function(
    image=fal_image,
    timeout=120,
    secrets=[
        modal.Secret.from_name("supabase-secrets"),
        modal.Secret.from_name("fal-secrets"),
    ],
)
def extract_depth_map(image_url: str, room_id: str) -> str:
    """
    Call fal-ai/imageutils/depth (Depth-Anything-V2) to produce a depth map.

    Cost: ~$0.005 per call.
    Returns: Supabase URL of the depth map JPEG.
    """
    import fal_client  # type: ignore[import]

    print(f"[depth] Submitting {image_url[:80]}... to fal-ai/imageutils/depth")

    result = fal_client.subscribe(
        "fal-ai/imageutils/depth",
        arguments={
            "image_url": image_url,
            "model": "depth-anything-v2",
        },
        with_logs=True,
    )

    depth_url: str = result["image"]["url"]
    print(f"[depth] fal.ai returned: {depth_url[:80]}...")

    # Download and re-upload to Supabase for reuse (avoids ephemeral CDN expiry)
    depth_bytes = _download_bytes(depth_url)
    storage_path = f"depth_maps/{room_id}_depth.jpg"
    supabase_url = _upload_to_supabase(depth_bytes, storage_path, "image/jpeg")
    print(f"[depth] Stored → {supabase_url[:80]}...")
    return supabase_url


# ---------------------------------------------------------------------------
# 2. Structural Canny edge map (replaces HED approximation)
# ---------------------------------------------------------------------------

@app.function(
    cpu=2,
    image=opencv_image,
    timeout=60,
    secrets=[
        modal.Secret.from_name("supabase-secrets"),
    ],
)
def extract_canny_edges(image_url: str, room_id: str) -> str:
    """
    Extract structural Canny edges from the professionalized room photo.

    Thresholds low=100, high=200 capture only major architectural edges:
    wall/floor boundaries, window frames, door outlines.
    Avoids capturing furniture texture and textile detail (those are style elements
    we want FLUX to replace, not preserve).

    Gaussian blur before Canny removes JPEG compression noise that would
    otherwise produce false edge detection.

    Returns: Supabase URL of the edge map PNG.
    """
    import cv2  # type: ignore[import]
    import numpy as np

    print(f"[edges] Downloading {image_url[:80]}...")
    img_bytes = _download_bytes(image_url)

    # Decode
    nparr = np.frombuffer(img_bytes, np.uint8)
    bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError(f"Could not decode image from {image_url}")

    # Resize so max dimension = 1024 (matches generation resolution)
    h, w = bgr.shape[:2]
    if max(h, w) != 1024:
        scale = 1024 / max(h, w)
        bgr = cv2.resize(bgr, (int(w * scale), int(h * scale)))
        h, w = bgr.shape[:2]
        if h != 1024 or w != 1024:
            pad_h = (1024 - h) // 2
            pad_w = (1024 - w) // 2
            bgr = cv2.copyMakeBorder(
                bgr, pad_h, 1024 - h - pad_h, pad_w, 1024 - w - pad_w,
                cv2.BORDER_CONSTANT, value=[0, 0, 0],
            )

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

    # Pre-blur to remove JPEG noise before edge detection.
    # sigma=1.5 is gentle — preserves structural edges while killing compression artifacts.
    blurred = cv2.GaussianBlur(gray, (0, 0), sigmaX=1.5)

    # Conservative thresholds: only major structural edges.
    # DO NOT lower these. Lower values re-introduce furniture texture.
    edges = cv2.Canny(blurred, threshold1=100, threshold2=200)

    # Dilate 1px so edges are thick enough for ControlNet to read.
    kernel = np.ones((2, 2), np.uint8)
    edges_dilated = cv2.dilate(edges, kernel, iterations=1)

    # Convert to 3-channel PNG (fal.ai expects RGB).
    edges_rgb = cv2.cvtColor(edges_dilated, cv2.COLOR_GRAY2RGB)

    ok, encoded = cv2.imencode(".png", edges_rgb)
    if not ok:
        raise RuntimeError("cv2.imencode PNG failed")
    edge_bytes = encoded.tobytes()

    storage_path = f"edge_maps/{room_id}_canny.png"
    supabase_url = _upload_to_supabase(edge_bytes, storage_path, "image/png")
    print(f"[edges] Canny edges stored (low=100, high=200): {supabase_url[:80]}...")
    return supabase_url


# ---------------------------------------------------------------------------
# 2b. LEGACY soft-edge map via OpenCV (HED approximation) — A/B testing only
# ---------------------------------------------------------------------------

@app.function(
    cpu=2,
    image=opencv_image,
    timeout=60,
    secrets=[
        modal.Secret.from_name("supabase-secrets"),
    ],
)
def extract_hed_edges(image_url: str, room_id: str) -> str:
    """
    LEGACY — kept for A/B testing only. Use extract_canny_edges for production.

    Soft Canny at low thresholds (30, 90) + Gaussian blur captures furniture
    texture and textile detail — exactly what we want FLUX to replace.
    This is why it was replaced with extract_canny_edges.

    Returns: Supabase URL of the edge map PNG.
    """
    import cv2  # type: ignore[import]
    import numpy as np

    print(f"[edges-hed-legacy] Downloading {image_url[:80]}...")
    img_bytes = _download_bytes(image_url)

    nparr = np.frombuffer(img_bytes, np.uint8)
    bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError(f"Could not decode image from {image_url}")

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, threshold1=30, threshold2=90)
    soft_edges = cv2.GaussianBlur(edges.astype(np.float32), (0, 0), sigmaX=2.0)
    soft_edges = np.clip(soft_edges, 0, 255).astype(np.uint8)

    ok, encoded = cv2.imencode(".png", soft_edges)
    if not ok:
        raise RuntimeError("cv2.imencode PNG failed")
    edge_bytes = encoded.tobytes()

    storage_path = f"edge_maps/{room_id}_edges.png"
    supabase_url = _upload_to_supabase(edge_bytes, storage_path, "image/png")
    print(f"[edges-hed-legacy] Stored → {supabase_url[:80]}...")
    return supabase_url


# ---------------------------------------------------------------------------
# Local dev entry point
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def main(image_url: str = "", room_id: str = "test-room"):
    if not image_url:
        print("Usage: modal run structural_extraction.py --image-url <URL> --room-id <ID>")
        return

    import asyncio

    async def run():
        depth_fut = extract_depth_map.remote.aio(image_url, room_id)
        edges_fut = extract_hed_edges.remote.aio(image_url, room_id)
        depth_url, edges_url = await asyncio.gather(depth_fut, edges_fut)
        print(f"Depth map : {depth_url}")
        print(f"Edge map  : {edges_url}")

    asyncio.run(run())
