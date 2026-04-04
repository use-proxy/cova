import io
import os
import json
import time
import struct
import zlib
import urllib.request
from PIL import Image, ImageDraw

INPUT_PHOTO = "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/sign/room-uploads/IMG_2093.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV84ODk1MjRhNy1iZmE1LTQzYzctYjVlNy0wN2RjMDBkMzIzMTUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJyb29tLXVwbG9hZHMvSU1HXzIwOTMuanBlZyIsImlhdCI6MTc3NTE1OTkwNywiZXhwIjoxNzc1NzY0NzA3fQ.9KHD2_TuPLQV2yh_ZVY-BSOhNU-ARhuweXM629Th6F0"

REPLICATE_TOKEN = os.environ["REPLICATE_API_TOKEN"]
SUPABASE_URL = "https://xdeacbmkdwqrwxonqaqh.supabase.co"
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


def replicate_post(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"https://api.replicate.com/v1/{path}",
        data=data,
        headers={
            "Authorization": f"Bearer {REPLICATE_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def replicate_poll(prediction_id, timeout=300):
    url = f"https://api.replicate.com/v1/predictions/{prediction_id}"
    start = time.time()
    while True:
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {REPLICATE_TOKEN}"},
        )
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
        status = result["status"]
        print(f"  status: {status}")
        if status == "succeeded":
            return result
        if status in ("failed", "canceled"):
            raise RuntimeError(f"Prediction {status}: {result.get('error')}")
        if time.time() - start > timeout:
            raise TimeoutError("Prediction timed out")
        time.sleep(5)


def download_bytes(url):
    with urllib.request.urlopen(url) as resp:
        return resp.read()


def supabase_upload(path, data, content_type="image/jpeg"):
    url = f"{SUPABASE_URL}/storage/v1/object/{path}"
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        resp.read()
    return f"{SUPABASE_URL}/storage/v1/object/public/{path}"


def supabase_sign_url(path, expires_in=3600):
    """Generate a signed URL for a private bucket object."""
    # path format: bucket/object-path
    parts = path.split("/", 1)
    bucket, obj_path = parts[0], parts[1]
    sign_url = f"{SUPABASE_URL}/storage/v1/object/sign/{bucket}/{obj_path}"
    payload = json.dumps({"expiresIn": expires_in}).encode()
    req = urllib.request.Request(
        sign_url,
        data=payload,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
    signed_path = result.get("signedURL") or result.get("signedUrl") or result.get("signed_url")
    if not signed_path:
        raise RuntimeError(f"Could not get signed URL: {result}")
    if signed_path.startswith("http"):
        return signed_path
    # Supabase returns path like "/object/sign/..." — prepend storage API prefix
    if signed_path.startswith("/object/"):
        return f"{SUPABASE_URL}/storage/v1{signed_path}"
    return f"{SUPABASE_URL}{signed_path}"


ANTHROPIC_KEY = os.environ["ANTHROPIC_API_KEY"]


def claude_get_bboxes(image_url):
    """Ask Claude Vision to return bounding boxes for movable items as JSON."""
    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 512,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "url", "url": image_url},
                    },
                    {
                        "type": "text",
                        "text": (
                            "You are a precise object detector. Look at this bedroom photo. "
                            "Identify all MOVABLE items that should be replaced: the office/desk chair, "
                            "any clothes on the floor, any bags on the floor, any clutter on the floor. "
                            "For EACH item found, return a JSON array (and nothing else) where each element is "
                            "{\"label\": str, \"x\": float, \"y\": float, \"w\": float, \"h\": float} "
                            "with coordinates as fractions of image width/height (0.0 to 1.0). "
                            "x,y is top-left corner. Example: [{\"label\":\"chair\",\"x\":0.3,\"y\":0.4,\"w\":0.2,\"h\":0.3}]"
                        ),
                    },
                ],
            }
        ],
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=data,
        headers={
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
    text = result["content"][0]["text"].strip()
    # strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


MAX_SIDE = 1536  # FLUX Fill Pro max safe dimension


def download_image(url):
    """Download image bytes and return PIL Image."""
    with urllib.request.urlopen(url) as resp:
        return Image.open(io.BytesIO(resp.read())).copy()


def resize_to_max(img, max_side=MAX_SIDE):
    """Resize image so longest side <= max_side, preserving aspect ratio."""
    w, h = img.size
    if max(w, h) <= max_side:
        return img
    scale = max_side / max(w, h)
    new_w, new_h = int(w * scale), int(h * scale)
    return img.resize((new_w, new_h), Image.LANCZOS)


def create_mask_png(width, height, bboxes):
    """Create a white-on-black PNG mask (white = inpaint area) using PIL."""
    img = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(img)
    for box in bboxes:
        x0 = int(box["x"] * width)
        y0 = int(box["y"] * height)
        x1 = int((box["x"] + box["w"]) * width)
        y1 = int((box["y"] + box["h"]) * height)
        draw.rectangle([x0, y0, x1, y1], fill=255)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def image_to_jpeg_bytes(img):
    """Convert PIL Image to JPEG bytes."""
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def main():
    print("=== Script 3: Claude Vision Bbox Mask + FLUX Fill Pro — Two-Step Pipeline ===")

    # ── Step 1: Claude Vision → bboxes → programmatic mask ─────────────────
    print("\n--- Step 1: Claude Vision bbox detection + mask generation ---")

    print("Asking Claude to identify movable items and bounding boxes...")
    bboxes = claude_get_bboxes(INPUT_PHOTO)
    print(f"Detected {len(bboxes)} items:")
    for b in bboxes:
        print(f"  {b['label']}: x={b['x']:.2f} y={b['y']:.2f} w={b['w']:.2f} h={b['h']:.2f}")

    print("Downloading and resizing original photo...")
    orig_img = download_image(INPUT_PHOTO)
    resized_img = resize_to_max(orig_img)
    img_w, img_h = resized_img.size
    print(f"Resized to: {img_w}x{img_h}")
    resized_jpeg = image_to_jpeg_bytes(resized_img)

    print("Creating mask PNG at same size...")
    mask_png = create_mask_png(img_w, img_h, bboxes)
    print(f"Mask PNG: {len(mask_png)} bytes")

    print("Uploading resized photo to public bucket...")
    photo_public_url = supabase_upload(
        "product-images/test-redesign/test_3_input_resized.jpg", resized_jpeg, "image/jpeg"
    )
    print(f"Resized photo URL: {photo_public_url}")

    MASK_STORAGE_PATH = "product-images/test-redesign/test_3_mask_1536.png"
    print("Uploading mask to public bucket (product-images)...")
    mask_public_url = supabase_upload(MASK_STORAGE_PATH, mask_png, "image/png")
    print(f"Mask public URL: {mask_public_url}")

    # ── Step 2: FLUX Fill Pro ────────────────────────────────────────────────
    print("\n--- Step 2: FLUX Fill Pro inpainting ---")

    fill_payload = {
        "version": "black-forest-labs/flux-fill-pro",
        "input": {
            "image": photo_public_url,
            "mask": mask_public_url,
            "prompt": (
                "Japandi style interior. Where the office chair was: a minimalist solid oak accent chair with clean lines "
                "and a woven seat cushion in natural linen. Where clothes and items were on the floor: clean visible carpet, "
                "completely empty floor. Photorealistic, natural daylight, interior design magazine quality. "
                "The rest of the room is completely unchanged."
            ),
            "steps": 28,
            "guidance": 30,
            "output_format": "jpg",
            "safety_tolerance": 5,
        },
    }

    print("Starting FLUX Fill Pro prediction...")
    fill_result = replicate_post("predictions", fill_payload)
    fill_id = fill_result["id"]
    print(f"Prediction ID: {fill_id}")

    fill_result = replicate_poll(fill_id)
    output = fill_result["output"]
    if isinstance(output, list):
        output_url = output[0]
    else:
        output_url = output
    print(f"Output URL: {output_url}")

    print("Downloading output image...")
    img_bytes = download_bytes(output_url)

    print("Uploading final image to Supabase...")
    public_url = supabase_upload("room-videos/test-redesign/test_3_fill_pro.jpg", img_bytes)
    print(f"Supabase URL: {public_url}")

    results = {
        "step1_method": "claude_vision_bbox",
        "step1_bboxes": bboxes,
        "mask_public_url": mask_public_url,
        "step2_fill_prediction_id": fill_id,
        "replicate_output_url": output_url,
        "supabase_url": public_url,
        "status": "success",
    }
    with open("modal_pipeline/test_3_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("Saved to test_3_results.json")
    print("=== Script 3 DONE ===\n")


if __name__ == "__main__":
    main()
