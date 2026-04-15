"""
Cova v3 — Image Restoration Pipeline

Smart square crop of the already-preprocessed image (OpenCV-corrected).
No ESRGAN — preprocessing.py already handles sharpening, white balance, CLAHE.

  Portrait (height > width): crop to square, vertical start at 40% of excess height
  Landscape / square: center crop or direct resize
  Resize to 1024×1024 INTER_LANCZOS4

Entry point: restore_room_photo(image_url, room_id) -> str
Output: room-photos/restored/{room_id}_restored.jpg
"""

import os

import modal

restoration_image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "supabase",
        "requests",
        "opencv-python-headless",
        "numpy",
    )
)

app = modal.App("cova-restoration-pipeline")

STORAGE_BUCKET = "room-photos"


@app.function(
    image=restoration_image,
    secrets=[modal.Secret.from_name("supabase-secrets")],
    cpu=2,
    timeout=120,
)
def restore_room_photo(image_url: str, room_id: str) -> str:
    """
    Download preprocessed image, smart square crop to 1024×1024, upload to Supabase.
    """
    import cv2
    import numpy as np
    import requests
    from supabase import create_client

    print(f"[restoration] Starting for room {room_id}")
    print(f"[restoration] Input: {image_url[:80]}...")

    # Download
    resp = requests.get(image_url, timeout=60)
    resp.raise_for_status()
    nparr = np.frombuffer(resp.content, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise RuntimeError("[restoration] Failed to decode input image")
    print(f"[restoration] Downloaded: {img.shape[1]}×{img.shape[0]}")

    # Smart square crop
    h, w = img.shape[:2]
    if h == w:
        img = cv2.resize(img, (1024, 1024), interpolation=cv2.INTER_LANCZOS4)
        print("[restoration] Already square, resized to 1024×1024")
    elif h > w:
        # Portrait: anchor at 40% of excess height (favours floor)
        top = int((h - w) * 0.4)
        img = img[top:top + w, 0:w]
        img = cv2.resize(img, (1024, 1024), interpolation=cv2.INTER_LANCZOS4)
        print(f"[restoration] Portrait crop y={top}..{top + w}, resized to 1024×1024")
    else:
        # Landscape: center horizontally
        left = int((w - h) * 0.5)
        img = img[0:h, left:left + h]
        img = cv2.resize(img, (1024, 1024), interpolation=cv2.INTER_LANCZOS4)
        print(f"[restoration] Landscape crop x={left}..{left + h}, resized to 1024×1024")

    # Encode + upload
    _, buffer = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    restored_bytes = buffer.tobytes()

    supabase = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    path = f"restored/{room_id}_restored.jpg"
    supabase.storage.from_(STORAGE_BUCKET).upload(
        path,
        restored_bytes,
        {"content-type": "image/jpeg", "upsert": "true"},
    )
    restored_url = supabase.storage.from_(STORAGE_BUCKET).get_public_url(path)

    try:
        supabase.table("rooms").update(
            {"professionalized_image_url": restored_url}
        ).eq("id", room_id).execute()
    except Exception as e:
        print(f"[restoration] rooms update skipped: {e}")

    print(f"[restoration] Complete → {restored_url[:80]}...")
    return restored_url


@app.local_entrypoint()
def main(
    image_url: str = "",
    room_id: str = "test-room",
):
    if not image_url:
        print("Usage: modal run restoration.py --image-url <URL> --room-id <ID>")
        return

    result = restore_room_photo.remote(image_url, room_id)
    print(f"Restored image: {result}")
