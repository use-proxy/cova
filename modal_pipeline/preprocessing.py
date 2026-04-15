"""
Cova v3 — Preprocessing Pipeline
Runs before any AI model.
Steps: White balance (Gray World in LAB) → Resize to max 1536px → upload to Supabase.

All functions are Modal-deployed. Orchestrator: preprocess_room_photo().
"""

import io
import os
import time
import urllib.request

import modal

# ---------------------------------------------------------------------------
# Modal images
# ---------------------------------------------------------------------------

# Lightweight image for OpenCV preprocessing (CPU only)
opencv_image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "supabase",
        "requests",
        "Pillow",
        "opencv-python-headless",
        "numpy",
    )
)


app = modal.App("cova-preprocessing-pipeline")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
STORAGE_BUCKET = "room-photos"


# ---------------------------------------------------------------------------
# Helpers (shared across functions — defined at module level)
# ---------------------------------------------------------------------------

def _download_image_bytes(url: str) -> bytes:
    """Download image from URL and return raw bytes, following CDN redirects."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; CovaBot/1.0)",
            "Accept": "image/jpeg,image/png,image/*",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def _mean_brightness(img_bytes: bytes) -> float:
    """Return mean grayscale brightness (0-255) of an image."""
    import numpy as np
    from PIL import Image

    img = Image.open(io.BytesIO(img_bytes)).convert("L")
    return float(np.array(img).mean())


def _upload_to_supabase(img_bytes: bytes, path: str) -> str:
    """Upload bytes to Supabase Storage and return the public URL."""
    from supabase import create_client  # type: ignore[import]

    url = os.environ.get("SUPABASE_URL") or SUPABASE_URL
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or SUPABASE_SERVICE_ROLE_KEY
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

    client = create_client(url, key)
    # upsert=True so re-runs don't fail with duplicate key errors
    client.storage.from_(STORAGE_BUCKET).upload(
        path,
        img_bytes,
        {"content-type": "image/jpeg", "upsert": "true"},
    )
    public = client.storage.from_(STORAGE_BUCKET).get_public_url(path)
    return public


# ---------------------------------------------------------------------------
# 1. DarkIR enhancement (GPU A10G)
# ------------------------------------------------------------


# ---------------------------------------------------------------------------
# 2. OpenCV preprocessing (CPU)
# ---------------------------------------------------------------------------

@app.function(
    cpu=2,
    image=opencv_image,
    timeout=60,
    secrets=[
        modal.Secret.from_name("supabase-secrets"),
    ],
)
def preprocess_opencv(image_url: str, room_id: str) -> str:
    """
    Apply deterministic OpenCV corrections to a room photo.
    Steps (in order):
      1. White balance  (Gray World in LAB space)
      2. Resize to max 1536px on longest edge

    Returns: Supabase URL of the processed image.
    """
    import cv2  # type: ignore[import]
    import numpy as np

    img_bytes = _download_image_bytes(image_url)

    # Decode to OpenCV BGR
    nparr = np.frombuffer(img_bytes, np.uint8)
    bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError(f"Could not decode image from {image_url}")

    # ------------------------------------------------------------------
    # Step 1 — White balance (Gray World in LAB space)
    # ------------------------------------------------------------------
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    l_chan, a_chan, b_chan = cv2.split(lab)
    a_mean = a_chan.mean()
    b_mean = b_chan.mean()
    a_chan = a_chan - (a_mean - 127.5)
    b_chan = b_chan - (b_mean - 127.5)
    lab_balanced = cv2.merge([l_chan, a_chan, b_chan]).clip(0, 255).astype(np.uint8)
    bgr = cv2.cvtColor(lab_balanced, cv2.COLOR_LAB2BGR)

    # ------------------------------------------------------------------
    # Step 2 — Resize to max 1536px on longest edge
    # ------------------------------------------------------------------
    h, w = bgr.shape[:2]
    max_edge = 1536
    if max(h, w) > max_edge:
        scale = max_edge / max(h, w)
        new_w = int(w * scale)
        new_h = int(h * scale)
        bgr = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)

    # Encode to JPEG
    ok, encoded = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if not ok:
        raise RuntimeError("cv2.imencode failed")
    result_bytes = encoded.tobytes()

    path = f"preprocessed/{room_id}_opencv.jpg"
    url = _upload_to_supabase(result_bytes, path)
    print(f"[opencv] uploaded {path} → {url[:60]}...")
    return url


# ---------------------------------------------------------------------------
# 3. Orchestrator
# ---------------------------------------------------------------------------

@app.function(cpu=2)
def preprocess_room_photo(image_url: str, room_id: str) -> str:
    return preprocess_opencv.remote(image_url, room_id)

# ---------------------------------------------------------------------------
# Local dev entry point
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def main(image_url: str = "", room_id: str = "test-room"):
    if not image_url:
        print("Usage: modal run preprocessing.py --image-url <URL> --room-id <ID>")
        return
    result = preprocess_room_photo.remote(image_url, room_id)
    print(f"Result: {result}")
