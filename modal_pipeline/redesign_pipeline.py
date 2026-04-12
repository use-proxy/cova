"""
Cova M7/M8 — FLUX Redesign Pipeline with Depth Conditioning
Takes the user's uploaded room photo from rooms.original_photo_url (falling
back to original_image_url / photo_url for legacy rows), generates a style
prompt via Claude (or uses the TS-compiled prompt when provided), and runs
FLUX Kontext Pro + FLUX Depth Pro in parallel. Output is a single flat 2D
image written to rooms.redesign_pano_url (column name is legacy — it now
stores a flat image, not a panorama).

Depth conditioning preserves room geometry (walls, windows, ceiling) while
allowing furniture and decor to be restyled.
"""

import os
import json
import time
import io

import modal

# --- Modal images ---
# Lightweight image for Replicate-based pipeline (no GPU needed)
replicate_image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install("supabase", "requests", "Pillow", "fastapi[standard]")
)

# GPU image for local depth extraction (Depth-Anything-V2)
depth_image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "torch>=2.0.0",
        "torchvision",
        "transformers>=4.35.0",
        "Pillow",
        "numpy",
        "opencv-python-headless",
        "requests",
    )
)

app = modal.App("cova-redesign-pipeline", image=replicate_image)

REPLICATE_API_BASE = "https://api.replicate.com/v1"
ANTHROPIC_API_BASE = "https://api.anthropic.com/v1"
FLUX_KONTEXT_MODEL = "black-forest-labs/flux-kontext-pro"
FLUX_DEPTH_PRO_MODEL = "black-forest-labs/flux-depth-pro"
FLUX_CANNY_PRO_MODEL = "black-forest-labs/flux-canny-pro"


STYLE_NAME_REPLACEMENTS = {
    "warm japandi": "calm warm naturalism with clean lines",
    "pure minimal white": "purposeful bright simplicity",
    "coastal bright": "relaxed sun-drenched natural lightness",
    "biophilic jungle": "lush nature-immersed organic abundance",
    "dark moody glam": "rich dramatic atmosphere with luxe finishes",
    "heritage traditional": "timeless layered craftsmanship",
    "industrial loft": "raw urban materiality with exposed structure",
    "maximalist eclectic": "boldly layered pattern-rich eclecticism",
    "retro mid-century": "warm retro modernism with sculptural furniture",
}


def sanitize_style_names(text: str) -> str:
    result = text
    for forbidden, replacement in STYLE_NAME_REPLACEMENTS.items():
        result = result.replace(forbidden, replacement)
        result = result.replace(forbidden.title(), replacement.title())
    return result


STYLE_VOCABULARY = {
    "warm japandi": {
        "description": "calm warm naturalism with clean lines, wabi-sabi imperfection",
        "materials": "warm oak, raw linen, handmade ceramic",
        "mood": "serene, grounded, intentionally simple",
        "key_elements": "low-profile furniture, natural textures, warm neutrals, minimal decor",
    },
    "pure minimal white": {
        "description": "purposeful bright simplicity, intentional void, maximum light",
        "materials": "white plaster, polished concrete, brushed steel",
        "mood": "crisp, airy, meditative",
        "key_elements": "near-empty surfaces, white palette, geometric forms, abundant daylight",
    },
    "coastal bright": {
        "description": "relaxed sun-drenched natural lightness, beach house ease",
        "materials": "whitewashed wood, natural rattan, linen",
        "mood": "breezy, casual, sun-filled",
        "key_elements": "light wood tones, woven textures, soft blues and whites, open airy feel",
    },
    "biophilic jungle": {
        "description": "lush nature-immersed organic abundance, indoor garden sanctuary",
        "materials": "live-edge wood, terracotta, natural fiber",
        "mood": "verdant, alive, restorative",
        "key_elements": "abundant plants, organic shapes, earthy tones, natural materials throughout",
    },
    "dark moody glam": {
        "description": "rich dramatic atmosphere with luxe finishes, jewel-tone depth",
        "materials": "velvet, marble, brass",
        "mood": "seductive, opulent, theatrical",
        "key_elements": "deep saturated colors, metallic accents, plush textures, dramatic lighting",
    },
    "heritage traditional": {
        "description": "timeless layered craftsmanship, antique-informed elegance",
        "materials": "dark walnut, silk, aged brass",
        "mood": "stately, warm, deeply considered",
        "key_elements": "ornate details, rich wood tones, layered textiles, symmetrical arrangement",
    },
    "industrial loft": {
        "description": "raw urban materiality with exposed structure, factory-converted aesthetic",
        "materials": "exposed concrete, raw steel, reclaimed wood",
        "mood": "edgy, honest, utilitarian-cool",
        "key_elements": "exposed ducts and pipes, concrete surfaces, metal furniture, monochrome palette",
    },
    "maximalist eclectic": {
        "description": "boldly layered pattern-rich eclecticism, collected over time",
        "materials": "mixed global textiles, lacquered wood, colored glass",
        "mood": "exuberant, personal, fearlessly layered",
        "key_elements": "pattern mixing, bold color, abundant objects, global influences",
    },
    "retro mid-century": {
        "description": "warm retro modernism with sculptural furniture, 1950-70s optimism",
        "materials": "teak, bouclé, enameled steel",
        "mood": "nostalgic, optimistic, design-forward",
        "key_elements": "tapered legs, organic curves, warm wood tones, graphic patterns",
    },
}


def get_dominant_styles(blend: dict) -> list:
    normalized = {k.lower(): v for k, v in (blend or {}).items()}
    return [
        style for style, weight
        in sorted(normalized.items(), key=lambda x: x[1], reverse=True)
        if weight > 0.1
    ]


def generate_prompt_with_claude(blend: dict, room_type: str, anthropic_key: str) -> str:
    import requests

    normalized_blend = {k.lower(): v for k, v in (blend or {}).items()}
    dominant = get_dominant_styles(blend)
    style_context_parts = []
    for s in dominant:
        vocab = STYLE_VOCABULARY.get(s, {})
        pct = round(normalized_blend.get(s, 0) * 100)
        desc = vocab.get("description", s)
        mood = vocab.get("mood", "")
        style_context_parts.append(f"{s} ({pct}%): {desc} — {mood}")
    style_context = "\n".join(style_context_parts)

    material_hints = []
    element_hints = []
    for s in dominant:
        vocab = STYLE_VOCABULARY.get(s, {})
        if vocab.get("materials"):
            material_hints.append(vocab["materials"])
        if vocab.get("key_elements"):
            element_hints.append(vocab["key_elements"])

    system_prompt = (
        "You are an expert interior designer creating precise image editing "
        "prompts for FLUX Kontext Pro, an AI image editor.\n\n"
        "FLUX Kontext edits existing images. It excels at replacing furniture "
        "while preserving room architecture.\n\n"
        "CRITICAL: Never use internal anchor style names verbatim. Forbidden "
        "labels: warm japandi, pure minimal white, coastal bright, biophilic "
        "jungle, dark moody glam, heritage traditional, industrial loft, "
        "maximalist eclectic, retro mid-century. Instead describe the visual "
        "qualities — mood, materials, light, forms — never the style label.\n\n"
        "Your prompts must:\n"
        "1. Be extremely specific about furniture pieces with materials and colors\n"
        "2. Explicitly preserve walls, floors, windows, ceiling, doors, and camera angle\n"
        "3. Specify photorealistic result — a flat interior photograph, NOT a panorama\n"
        "4. Stay under 280 words\n"
        "5. Sound like directing a real interior designer, not an AI"
    )

    user_message = (
        f"Create a FLUX Kontext prompt to redesign this {room_type}.\n\n"
        f"Style blend:\n{style_context}\n\n"
        f"Key materials: {'; '.join(material_hints[:3])}\n"
        f"Key elements: {'; '.join(element_hints[:3])}\n\n"
        "Requirements:\n"
        "- Replace ALL existing furniture and soft furnishings\n"
        "- Keep walls, floors, windows, ceiling, doors exactly as they are\n"
        "- Preserve room dimensions, proportions, existing lighting\n"
        "- Photorealistic interior design photograph result\n"
        "- Blend styles naturally\n\n"
        "Output ONLY the prompt text."
    )

    resp = requests.post(
        f"{ANTHROPIC_API_BASE}/messages",
        headers={
            "x-api-key": anthropic_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        json={
            "model": "claude-sonnet-4-6",
            "max_tokens": 512,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_message}],
        },
        timeout=30,
    )
    resp.raise_for_status()
    prompt = resp.json()["content"][0]["text"].strip()
    return sanitize_style_names(prompt)


def generate_prompt_fallback(blend: dict, room_type: str) -> str:
    dominant = get_dominant_styles(blend)
    if not dominant:
        dominant = ["pure minimal white"]
    top = dominant[0]
    vocab = STYLE_VOCABULARY.get(top, STYLE_VOCABULARY["pure minimal white"])
    description = vocab["description"]
    materials = vocab["materials"]
    mood = vocab["mood"]
    elements = vocab["key_elements"]
    prompt = (
        f"Redesign this {room_type} with {description}. "
        f"Mood: {mood}. Key elements: {elements}. "
        f"Use materials: {materials}. "
        f"Replace all furniture and soft furnishings to match this direction. "
        f"Keep all walls, floors, windows, ceiling, doors, and architectural "
        f"features exactly as they are. Preserve all room dimensions, "
        f"proportions, and existing lighting. The result must look like a "
        f"photorealistic interior design photograph."
    )
    return sanitize_style_names(prompt)


def run_flux_kontext(
    pano_url: str,
    prompt: str,
    replicate_token: str,
    timeout: int = 120,
    style_reference_url: str = None,
) -> str:
    import requests
    from PIL import Image as PILImage

    print(f"[kontext] Starting prediction...")
    print(f"[kontext] Prompt: {prompt[:120]}...")

    # Pre-check: detect input image dimensions and warn on non-standard aspect ratios.
    # FLUX may silently crop portrait or unusual ratios even with match_input_image.
    try:
        img_resp = requests.get(pano_url, timeout=15, stream=True)
        img_resp.raise_for_status()
        img = PILImage.open(img_resp.raw)
        w, h = img.size
        ratio = w / h if h else 1.0
        print(f"[kontext] Input image: {w}x{h} (ratio {ratio:.3f})")
        if ratio < 0.5 or ratio > 2.5:
            print(
                f"[kontext] WARNING: non-standard aspect ratio {ratio:.3f} — "
                f"FLUX may crop or reframe despite match_input_image. "
                f"Consider padding to 4:3 or 16:9 before submission."
            )
    except Exception as e:
        print(f"[kontext] WARNING: could not pre-check image dimensions: {e}")

    # FLUX Kontext Pro parameters tuned for maximum preservation fidelity:
    #   - guidance 4.5: more creative, design-forward results while still
    #     respecting anchors. (Raised from 3.5 for production quality.)
    #   - prompt_upsampling False: upsampling rewrites the prompt and strips
    #     our anchor/vacated-zone framing, which destroys preservation.
    #   - aspect_ratio "match_input_image": any other value crops or reframes
    #     the input image and the kept items drift out of the frame.
    #   - output_format "png": avoids downstream content-type detection
    #     issues with Supabase storage that webp occasionally causes.
    KONTEXT_SINGLE = "black-forest-labs/flux-kontext-pro"
    KONTEXT_MULTI = "flux-kontext-apps/multi-image-kontext-pro"

    model = KONTEXT_MULTI if style_reference_url else KONTEXT_SINGLE
    input_params = {
        "input_image": pano_url,
        "prompt": prompt,
        "guidance": 4.5,
        "aspect_ratio": "match_input_image",
        "output_format": "png",
        "output_quality": 100,
        "safety_tolerance": 2,
    }
    if style_reference_url:
        input_params["input_image_2"] = style_reference_url

    create_resp = requests.post(
        f"{REPLICATE_API_BASE}/models/{FLUX_KONTEXT_MODEL}/predictions",
        headers={
            "Authorization": f"Token {replicate_token}",
            "Content-Type": "application/json",
            "Prefer": "wait",
        },
        json={"input": input_params},
        timeout=90,
    )

    if not create_resp.ok:
        raise RuntimeError(
            f"Replicate create failed: {create_resp.status_code} "
            f"{create_resp.text[:300]}"
        )

    prediction = create_resp.json()
    prediction_id = prediction["id"]
    print(f"[kontext] Prediction ID: {prediction_id}")

    if prediction.get("status") == "succeeded":
        output = prediction.get("output", [])
        url = output[0] if isinstance(output, list) else output
        print("[kontext] Succeeded synchronously!")
        return url

    start = time.time()
    while time.time() - start < timeout:
        time.sleep(3)
        poll_resp = requests.get(
            f"{REPLICATE_API_BASE}/predictions/{prediction_id}",
            headers={"Authorization": f"Token {replicate_token}"},
            timeout=30,
        )
        poll_resp.raise_for_status()
        prediction = poll_resp.json()
        status = prediction.get("status")
        print(f"[kontext] Status: {status} ({time.time() - start:.0f}s)")

        if status == "succeeded":
            output = prediction.get("output", [])
            url = output[0] if isinstance(output, list) else output
            if not url:
                raise RuntimeError("Prediction succeeded but no output URL")
            return url

        if status in ("failed", "canceled"):
            raise RuntimeError(
                f"Prediction {status}: {prediction.get('error', 'unknown')}"
            )

    raise RuntimeError(f"FLUX Kontext timed out after {timeout}s")


# ---------------------------------------------------------------------------
# Depth Extraction (Modal GPU) — standalone depth maps for debugging/storage
# ---------------------------------------------------------------------------

@app.cls(gpu="A10G", image=depth_image, timeout=120)
class DepthExtractor:
    """Extracts monocular depth maps using Depth-Anything-V2-Large on Modal GPU."""

    @modal.enter()
    def load_model(self):
        from transformers import pipeline as hf_pipeline
        import torch
        self.depth_pipe = hf_pipeline(
            "depth-estimation",
            model="depth-anything/Depth-Anything-V2-Large-hf",
            device=0 if torch.cuda.is_available() else -1,
        )

    @modal.method()
    def extract_depth(self, image_bytes: bytes) -> bytes:
        """Extract depth map from image bytes. Returns PNG bytes of grayscale depth."""
        import numpy as np
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        result = self.depth_pipe(img)
        depth_array = np.array(result["depth"])

        # Normalize to 0-255
        depth_min, depth_max = depth_array.min(), depth_array.max()
        if depth_max > depth_min:
            normalized = ((depth_array - depth_min) /
                (depth_max - depth_min) * 255).astype(np.uint8)
        else:
            normalized = np.zeros_like(depth_array, dtype=np.uint8)

        # Resize to match original image
        depth_img = Image.fromarray(normalized).resize(img.size, Image.LANCZOS)

        buf = io.BytesIO()
        depth_img.save(buf, format="PNG")
        return buf.getvalue()

    @modal.method()
    def extract_canny(self, image_bytes: bytes,
            low: int = 100, high: int = 200) -> bytes:
        """Extract Canny edge map from image bytes. Returns PNG bytes."""
        import numpy as np
        import cv2
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes)).convert("L")
        img_array = np.array(img)
        edges = cv2.Canny(img_array, low, high)
        edges_rgb = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)
        result = Image.fromarray(edges_rgb).resize(
            Image.open(io.BytesIO(image_bytes)).size, Image.LANCZOS)

        buf = io.BytesIO()
        result.save(buf, format="PNG")
        return buf.getvalue()


# ---------------------------------------------------------------------------
# FLUX Depth Pro (Replicate) — depth-conditioned generation
# ---------------------------------------------------------------------------

def run_flux_depth_pro(
    control_image_url: str, prompt: str, replicate_token: str, timeout: int = 180
) -> str:
    """Run FLUX Depth Pro on Replicate for depth-conditioned generation.

    The model internally extracts a depth map from control_image and uses it
    to condition generation, preserving room geometry while restyling.
    """
    import requests

    print(f"[depth-pro] Starting prediction...")
    print(f"[depth-pro] Prompt: {prompt[:120]}...")

    create_resp = requests.post(
        f"{REPLICATE_API_BASE}/models/{FLUX_DEPTH_PRO_MODEL}/predictions",
        headers={
            "Authorization": f"Token {replicate_token}",
            "Content-Type": "application/json",
            "Prefer": "wait",
        },
        json={
            "input": {
                "control_image": control_image_url,
                "prompt": prompt,
                "num_inference_steps": 50,
                "guidance_scale": 30,
                "output_format": "jpg",
                "safety_tolerance": 2,
            }
        },
        timeout=90,
    )

    if not create_resp.ok:
        raise RuntimeError(
            f"Replicate create failed: {create_resp.status_code} "
            f"{create_resp.text[:300]}"
        )

    prediction = create_resp.json()
    prediction_id = prediction["id"]
    print(f"[depth-pro] Prediction ID: {prediction_id}")

    if prediction.get("status") == "succeeded":
        output = prediction.get("output", [])
        url = output[0] if isinstance(output, list) else output
        print("[depth-pro] Succeeded synchronously!")
        return url

    start = time.time()
    while time.time() - start < timeout:
        time.sleep(3)
        poll_resp = requests.get(
            f"{REPLICATE_API_BASE}/predictions/{prediction_id}",
            headers={"Authorization": f"Token {replicate_token}"},
            timeout=30,
        )
        poll_resp.raise_for_status()
        prediction = poll_resp.json()
        status = prediction.get("status")
        print(f"[depth-pro] Status: {status} ({time.time() - start:.0f}s)")

        if status == "succeeded":
            output = prediction.get("output", [])
            url = output[0] if isinstance(output, list) else output
            if not url:
                raise RuntimeError("Prediction succeeded but no output URL")
            return url

        if status in ("failed", "canceled"):
            raise RuntimeError(
                f"Prediction {status}: {prediction.get('error', 'unknown')}"
            )

    raise RuntimeError(f"FLUX Depth Pro timed out after {timeout}s")

def run_flux_canny_pro(
    control_image_url: str, prompt: str, replicate_token: str, timeout: int = 180
) -> str:
    """Run FLUX Canny Pro on Replicate for edge-conditioned generation.
    Preserves structural features like walls, doors, windows, furniture outlines.
    """
    import requests

    print(f"[canny-pro] Starting prediction...")
    print(f"[canny-pro] Prompt: {prompt[:120]}...")

    create_resp = requests.post(
        f"{REPLICATE_API_BASE}/models/{FLUX_CANNY_PRO_MODEL}/predictions",
        headers={
            "Authorization": f"Token {replicate_token}",
            "Content-Type": "application/json",
            "Prefer": "wait",
        },
        json={
            "input": {
                "control_image": control_image_url,
                "prompt": prompt,
                "num_inference_steps": 50,
                "guidance_scale": 30,
                "output_format": "jpg",
                "safety_tolerance": 2,
            }
        },
        timeout=90,
    )

    if not create_resp.ok:
        raise RuntimeError(
            f"Replicate create failed: {create_resp.status_code} "
            f"{create_resp.text[:300]}"
        )

    prediction = create_resp.json()
    prediction_id = prediction["id"]
    print(f"[canny-pro] Prediction ID: {prediction_id}")

    if prediction.get("status") == "succeeded":
        output = prediction.get("output", [])
        url = output[0] if isinstance(output, list) else output
        print("[canny-pro] Succeeded synchronously!")
        return url

    start = time.time()
    while time.time() - start < timeout:
        time.sleep(3)
        poll_resp = requests.get(
            f"{REPLICATE_API_BASE}/predictions/{prediction_id}",
            headers={"Authorization": f"Token {replicate_token}"},
            timeout=30,
        )
        poll_resp.raise_for_status()
        prediction = poll_resp.json()
        status = prediction.get("status")
        print(f"[canny-pro] Status: {status} ({time.time() - start:.0f}s)")

        if status == "succeeded":
            output = prediction.get("output", [])
            url = output[0] if isinstance(output, list) else output
            if not url:
                raise RuntimeError("Prediction succeeded but no output URL")
            return url

        if status in ("failed", "canceled"):
            raise RuntimeError(
                f"Prediction {status}: {prediction.get('error', 'unknown')}"
            )

    raise RuntimeError(f"FLUX Canny Pro timed out after {timeout}s")

def generate_perspective_prompt(style_blend: dict, compiled_prompt: str = None) -> str:
    """Build the perspective render prompt from style_blend."""
    if compiled_prompt and compiled_prompt.strip():
        base = compiled_prompt
        preserve_idx = base.lower().find('preserve all walls')
        if preserve_idx > 0:
            base = base[:preserve_idx].strip()
        return base + " Wide-angle perspective view. Photorealistic."
    dominant = get_dominant_styles(style_blend)
    style_parts = []
    for s in dominant:
        vocab = STYLE_VOCABULARY.get(s, {})
        style_parts.append(vocab.get("description", s))
    style_description = " and ".join(style_parts) if style_parts else "clean contemporary"
    return (
        f"Architectural interior photography, eye-level perspective, "
        f"{style_description} room, professional real estate photography, "
        f"dramatic moody lighting, warm ambient light, sharp detail, "
        f"ultra realistic, wide angle 24mm lens, no distortion, "
        f"cinematic color grade, deep shadows, photorealistic, 8K"
    )


def store_redesigned_pano(
    image_url: str, room_id: str, user_id: str, supabase_client,
    prompt: str, style_info: dict,
) -> str:
    import requests

    print("[kontext] Downloading redesigned panorama...")
    img_resp = requests.get(image_url, timeout=60)
    img_resp.raise_for_status()
    img_bytes = img_resp.content
    print(f"[kontext] Downloaded: {len(img_bytes) / 1e6:.1f}MB")

    storage_path = f"{user_id}/{room_id}/redesigned_pano.png"
    metadata_path = f"{user_id}/{room_id}/redesign_metadata.json"
    metadata = json.dumps({
        "prompt": prompt,
        "style_info": style_info,
        "source_model": FLUX_KONTEXT_MODEL,
        "timestamp": time.time(),
    }).encode()

    for path, content, ct in [
        (storage_path, img_bytes, "image/png"),
        (metadata_path, metadata, "application/json"),
    ]:
        try:
            supabase_client.storage.from_("room-videos").upload(
                path=path, file=content, file_options={"content-type": ct},
            )
        except Exception:
            supabase_client.storage.from_("room-videos").update(
                path=path, file=content, file_options={"content-type": ct},
            )

    print(f"[kontext] Stored at: {storage_path}")
    return storage_path


def store_perspective_render(image_url: str, room_id: str, supabase_url: str, supabase_key: str) -> str:
    """Download perspective render and store in Supabase room-videos bucket."""
    import requests

    print("[perspective] Downloading perspective render...")
    img_resp = requests.get(image_url, timeout=60)
    img_resp.raise_for_status()
    img_bytes = img_resp.content
    print(f"[perspective] Downloaded: {len(img_bytes) / 1e6:.1f}MB")

    storage_path = f"{room_id}/perspective_render.jpg"
    requests.post(
        f"{supabase_url}/storage/v1/object/room-videos/{storage_path}",
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "image/jpeg",
            "x-upsert": "true",
        },
        data=img_bytes,
        timeout=30,
    )

    # Generate signed URL
    sign_resp = requests.post(
        f"{supabase_url}/storage/v1/object/sign/room-videos/{storage_path}",
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
        },
        json={"expiresIn": 604800},
        timeout=10,
    )
    if sign_resp.ok:
        signed_path = sign_resp.json().get("signedURL", "")
        if signed_path.startswith("/object/"):
            return f"{supabase_url}/storage/v1{signed_path}"
        return f"{supabase_url}{signed_path}"
    return f"{supabase_url}/storage/v1/object/room-videos/{storage_path}"


def infer_room_type_from_detection(pre_detection_result):
    """Infer room type from detected furniture labels in pre_detection_result.

    pre_detection_result is a list of dicts, e.g.:
      [{"label": "bed", "category": "bed", "is_fixed": false, ...}, ...]
    """
    if not pre_detection_result:
        return None
    items = pre_detection_result if isinstance(pre_detection_result, list) else []
    label_list = [
        str(item.get("label") or "").lower()
        for item in items
        if isinstance(item, dict)
    ]
    labels = " ".join(label_list)
    if any(k in labels for k in ("bed", "nightstand", "dresser", "wardrobe", "duvet", "headboard")):
        return "bedroom"
    if any(k in labels for k in ("dining table", "dining chair")):
        return "dining room"
    if any(k in labels for k in ("desk", "office chair", "monitor")):
        return "home office"
    if any(k in labels for k in ("sofa", "couch", "coffee table")):
        return "living room"
    return None


@app.function(
    timeout=300,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("replicate-credentials"),
        modal.Secret.from_name("anthropic-credentials"),
    ],
)
def redesign_room(
    room_id: str,
    user_id: str,
    compiled_prompt: str = None,
    anchor_prompt: str = None,
    style_reference_url: str = None,
) -> dict:
    """
    Main pipeline: fetch pano_url → generate style prompt → FLUX Kontext →
    store redesigned pano → update DB.
    """
    from supabase import create_client

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    replicate_token = os.environ["REPLICATE_API_TOKEN"]
    anthropic_key = os.environ["ANTHROPIC_API_KEY"]

    client = create_client(supabase_url, supabase_key)

    client.table("rooms").update({
        "redesign_status": "analyzing_room",
    }).eq("id", room_id).execute()

    try:
        room = client.table("rooms").select(
            "original_photo_url, original_image_url, style_blend, "
            "room_type, user_id, render_context, pre_detection_result"
        ).eq("id", room_id).single().execute().data

        if not room:
            raise RuntimeError(f"Room {room_id} not found")

        # Check render_context schema version
        render_context = room.get("render_context") or {}
        schema_version = render_context.get("schemaVersion", "1.0") if isinstance(render_context, dict) else "1.0"
        if schema_version < "2.0":
            print(f"[kontext] WARNING: render_context schema_version={schema_version} (< 2.0), using safe defaults")

        # Input image: prefer original_photo_url (step-6 writes this), fall
        # back to original_image_url / photo_url for legacy rows.
        pano_url = (
            room.get("original_photo_url")
            or room.get("original_image_url")
            or room.get("photo_url")
        )
        if not pano_url:
            raise RuntimeError(
                f"Room {room_id} has no input image "
                f"(original_photo_url / original_image_url / photo_url)"
            )

        style_blend = room.get("style_blend") or {
            "contemporary": 0.5,
            "minimalist": 0.3,
            "natural": 0.2,
        }
        room_type = room.get("room_type") or "room"  # never assume room type; "room" is a safe generic fallback
        # Override with type inferred from pre-detection furniture labels (more accurate)
        pre_detection_result = room.get("pre_detection_result")
        inferred_type = infer_room_type_from_detection(pre_detection_result) if pre_detection_result else None
        if inferred_type:
            room_type = inferred_type
            print(f"[kontext] Room type inferred from detection: {room_type}")

        print(f"[kontext] Room: {room_type}, styles: {get_dominant_styles(style_blend)}")

        # Generate prompt — prefer TS-compiled prompt from the web app
        if compiled_prompt and compiled_prompt.strip():
            prompt = compiled_prompt
            prompt_source = "ts_compiled"
            print(f"[redesign] Using TS compiled prompt ({len(prompt)} chars)")
        else:
            try:
                prompt = generate_prompt_with_claude(style_blend, room_type, anthropic_key)
                prompt_source = "claude"
            except Exception as e:
                print(f"[kontext] Claude failed: {e}, using fallback")
                prompt = generate_prompt_fallback(style_blend, room_type)
                prompt_source = "fallback"
            print(f"[redesign] Using Python fallback prompt ({len(prompt)} chars)")

        print(f"[kontext] Prompt ({prompt_source}): {prompt[:150]}...")

        # Status: applying_style
        client.table("rooms").update({"redesign_status": "applying_style"}).eq("id", room_id).execute()

        # Build perspective prompt
        perspective_prompt = generate_perspective_prompt(
            style_blend, compiled_prompt=compiled_prompt
        )
        print(f"[perspective] Prompt: {perspective_prompt[:120]}...")

        # Run both FLUX calls in parallel:
        #   - Panorama redesign: FLUX Kontext Pro (style transfer)
        #   - Perspective render: FLUX Depth Pro (depth-conditioned, preserves geometry)
        from concurrent.futures import ThreadPoolExecutor, as_completed

        pano_result = [None]
        perspective_result = [None]
        depth_map_result = [None]
        pano_error = [None]
        perspective_error = [None]
        canny_result = [None]
        canny_error = [None]
        depth_conditioning_method = "none"

        def run_pano():
            kontext_result = None
            last_error = None
            for attempt in range(2):
                try:
                    kontext_result = run_flux_kontext(
                        pano_url, prompt, replicate_token,
                        style_reference_url=style_reference_url,
                    )
                    break
                except Exception as e:
                    last_error = e
                    print(f"[redesign] Kontext attempt {attempt+1} failed: {e}")
                    if attempt == 0:
                        time.sleep(5)
            if kontext_result is None:
                pano_error[0] = last_error
            else:
                pano_result[0] = kontext_result

        def run_perspective_depth():
            """Try FLUX Depth Pro first, fall back to Kontext."""
            nonlocal depth_conditioning_method
            try:
                perspective_result[0] = run_flux_depth_pro(
                    pano_url, perspective_prompt, replicate_token,
                )
                depth_conditioning_method = "flux_depth_pro"
                print("[perspective] Depth Pro succeeded — geometry preserved")
            except Exception as depth_err:
                print(f"[perspective] Depth Pro failed: {depth_err}")
                print("[perspective] Falling back to Kontext Pro...")
                try:
                    perspective_result[0] = run_flux_kontext(
                        pano_url, perspective_prompt, replicate_token,
                    )
                    depth_conditioning_method = "kontext_fallback"
                except Exception as e:
                    perspective_error[0] = e

        def run_depth_extraction():
            """Extract standalone depth map for debugging and storage (non-critical)."""
            try:
                import requests as _req
                print("[depth] Downloading pano for depth extraction...")
                img_resp = _req.get(pano_url, timeout=60)
                img_resp.raise_for_status()
                image_bytes = img_resp.content
                extractor = DepthExtractor()
                depth_map_result[0] = extractor.extract_depth.remote(image_bytes)
                print(f"[depth] Depth map extracted: {len(depth_map_result[0])} bytes")
            except Exception as e:
                print(f"[depth] Depth extraction failed (non-critical): {e}")

        def run_canny():
            """Run FLUX Canny Pro for edge-conditioned generation (non-critical)."""
            try:
                canny_result[0] = run_flux_canny_pro(
                    pano_url, prompt, replicate_token,
                )
                print("[canny] Canny Pro succeeded")
            except Exception as e:
                canny_error[0] = e
                print(f"[canny] Canny Pro failed (non-critical): {e}")

        # Status: rendering
        client.table("rooms").update({"redesign_status": "rendering"}).eq("id", room_id).execute()

        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = [
                executor.submit(run_pano),
                executor.submit(run_perspective_depth),
                executor.submit(run_depth_extraction),
                executor.submit(run_canny),
            ]
            for f in as_completed(futures):
                pass  # Wait for all

        # Status: finalizing
        client.table("rooms").update({"redesign_status": "finalizing"}).eq("id", room_id).execute()

        # Pano is critical — must succeed
        if pano_error[0]:
            raise pano_error[0]
        redesigned_url = pano_result[0]
        redesigned_url = pano_result[0]

        # If canny succeeded, use it as the perspective render (richer geometry)
        if canny_result[0] and not perspective_result[0]:
            perspective_result[0] = canny_result[0]
            depth_conditioning_method = "flux_canny_pro"
            print("[canny] Using Canny result as perspective render")

        # Store pano
        dominant_styles = get_dominant_styles(style_blend)
        style_info = {
            "dominant_styles": dominant_styles,
            "blend": style_blend,
            "prompt_source": prompt_source,
        }
        storage_path = store_redesigned_pano(
            redesigned_url, room_id, user_id, client, prompt, style_info,
        )

        signed = client.storage.from_("room-videos").create_signed_url(
            storage_path, 604800,
        )
        redesign_signed_url = signed.get("signedURL", redesigned_url)

        # Store depth map to Supabase (non-critical)
        depth_map_url = None
        if depth_map_result[0]:
            try:
                depth_storage_path = f"{user_id}/{room_id}/depth_map.png"
                try:
                    client.storage.from_("room-videos").upload(
                        path=depth_storage_path,
                        file=depth_map_result[0],
                        file_options={"content-type": "image/png"},
                    )
                except Exception:
                    client.storage.from_("room-videos").update(
                        path=depth_storage_path,
                        file=depth_map_result[0],
                        file_options={"content-type": "image/png"},
                    )
                depth_signed = client.storage.from_("room-videos").create_signed_url(
                    depth_storage_path, 86400,
                )
                depth_map_url = depth_signed.get("signedURL", "")
                print(f"[depth] Stored: {depth_storage_path}")
            except Exception as e:
                print(f"[depth] Could not store depth map (non-critical): {e}")

        # Store perspective render (non-critical — log error but don't fail)
        perspective_render_url = None
        if perspective_error[0]:
            print(f"[perspective] FLUX failed (non-critical): {perspective_error[0]}")
        elif perspective_result[0]:
            try:
                perspective_render_url = store_perspective_render(
                    perspective_result[0], room_id, supabase_url, supabase_key,
                )
                print(f"[perspective] Stored: {perspective_render_url[:80]}...")
            except Exception as e:
                print(f"[perspective] Store failed (non-critical): {e}")

        # Write data first, status last
        for attempt in range(2):
            try:
                client.table("rooms").update({
                    "redesign_pano_url": redesign_signed_url,
                }).eq("id", room_id).execute()
                break
            except Exception as e:
                if attempt == 0:
                    time.sleep(3)
                    print(f"[redesign] Supabase write retry: {e}")
                else:
                    print(f"[redesign] Supabase write failed after retry: {e}")
                    raise

        # Write perspective URL + depth conditioning method if columns exist
        optional_updates = {}
        if perspective_render_url:
            optional_updates["perspective_render_url"] = perspective_render_url
        if depth_conditioning_method != "none":
            optional_updates["depth_conditioning_method"] = depth_conditioning_method
        if optional_updates:
            try:
                client.table("rooms").update(optional_updates).eq("id", room_id).execute()
            except Exception as e:
                print(f"[db] Could not write optional columns (may not exist): {e}")

        for attempt in range(2):
            try:
                client.table("rooms").update({
                    "redesign_status": "complete",
                }).eq("id", room_id).execute()
                break
            except Exception as e:
                if attempt == 0:
                    time.sleep(3)
                    print(f"[redesign] Supabase status write retry: {e}")
                else:
                    print(f"[redesign] Supabase status write failed after retry: {e}")
                    raise

        print(f"[pipeline] Complete! Depth conditioning: {depth_conditioning_method}")
        return {
            "room_id": room_id,
            "redesigned_pano_url": redesigned_url,
            "redesigned_pano_signed_url": redesign_signed_url,
            "perspective_render_url": perspective_render_url,
            "depth_map_url": depth_map_url,
            "depth_conditioning_method": depth_conditioning_method,
            "storage_path": storage_path,
            "prompt": prompt,
            "perspective_prompt": perspective_prompt,
            "prompt_source": prompt_source,
            "dominant_styles": dominant_styles,
        }

    except Exception as e:
        print(f"[kontext] ERROR: {e}")
        try:
            client.table("rooms").update({
                "redesign_status": "failed",
                "redesign_error": str(e)[:2000],
            }).eq("id", room_id).execute()
        except Exception as update_err:
            print(f"[kontext] Failed to write error status: {update_err}")
        raise


@app.function(
    timeout=300,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("replicate-credentials"),
        modal.Secret.from_name("anthropic-credentials"),
    ],
)
@modal.fastapi_endpoint(method="POST")
def redesign_webhook(item: dict):
    """HTTP webhook for triggering redesign from Next.js."""
    room_id = item.get("room_id")
    user_id = item.get("user_id", "test-user")
    compiled_prompt = item.get("compiled_prompt")
    anchor_prompt = item.get("anchor_prompt")
    style_reference_url = item.get("style_reference_url")
    if not room_id:
        return {"error": "room_id required"}
    try:
        redesign_room.spawn(
            room_id,
            user_id,
            compiled_prompt=compiled_prompt,
            anchor_prompt=anchor_prompt,
            style_reference_url=style_reference_url,
        )
        return {"status": "queued", "room_id": room_id}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.local_entrypoint()
def test_local(room_id: str = "", user_id: str = "test-user"):
    """modal run modal_pipeline/redesign_pipeline.py --room-id <id>"""
    import uuid
    if not room_id:
        room_id = str(uuid.uuid4())
        print(f"Generated room_id: {room_id}")
    result = redesign_room.remote(room_id, user_id)
    print("\n=== RESULT ===")
    for k, v in result.items():
        if k != "prompt":
            print(f"  {k}: {v}")
    print(f"\n  Prompt:\n  {result.get('prompt', 'N/A')}")
