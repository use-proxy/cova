"""
Cova M7/M8 — FLUX Redesign Pipeline with Depth Conditioning
Takes marble_pano_url from rooms table, generates style prompt via Claude,
runs FLUX Kontext Pro (panorama) + FLUX Depth Pro (perspective), stores results.

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

STYLE_VOCABULARY = {
    "coastal": {
        "furniture": [
            "natural rattan armchair", "whitewashed oak coffee table",
            "linen upholstered sofa in off-white", "woven seagrass rug",
            "driftwood side table", "wicker storage basket",
        ],
        "materials": ["rattan", "seagrass", "whitewashed oak", "linen"],
        "colors": ["off-white", "soft blue", "sandy beige", "warm white"],
        "feel": "breezy light-filled with natural weathered materials",
    },
    "japandi": {
        "furniture": [
            "low solid oak platform bed",
            "clean-lined walnut coffee table with tapered legs",
            "clean-lined linen sofa in warm grey", "natural jute rug",
            "simple oak bookshelf", "ceramic accent stool",
        ],
        "materials": ["solid oak", "walnut", "natural linen", "ceramic"],
        "colors": ["warm white", "natural wood tones", "soft grey", "muted sage"],
        "feel": "calm warm naturalism with clean lines",
    },
    "bohemian": {
        "furniture": [
            "colorful Moroccan rug", "eclectic velvet sofa in jewel tone",
            "woven pouf ottoman", "rattan peacock chair", "layered kilim rug",
        ],
        "materials": ["macrame", "kilim", "velvet", "rattan"],
        "colors": ["terracotta", "deep teal", "warm mustard", "burnt orange"],
        "feel": "eclectic layered with rich textural depth",
    },
    "minimalist": {
        "furniture": [
            "white platform bed", "glass and steel coffee table",
            "all-white modular sofa", "floating white shelves",
            "matte black accent chair",
        ],
        "materials": ["glass", "steel", "concrete", "matte lacquer"],
        "colors": ["pure white", "light grey", "matte black", "charcoal"],
        "feel": "deliberately uncluttered with intentional negative space",
    },
    "mid_century": {
        "furniture": [
            "walnut credenza with tapered legs", "Eames-style lounge chair",
            "low profile tufted sofa in mustard velvet",
            "hairpin leg coffee table", "arc floor lamp",
        ],
        "materials": ["teak", "walnut", "molded plywood", "brass"],
        "colors": ["mustard yellow", "burnt orange", "teal", "walnut brown"],
        "feel": "warm retro curves with teak and brass accents",
    },
}


def get_dominant_styles(blend: dict) -> list:
    return [
        style for style, weight
        in sorted(blend.items(), key=lambda x: x[1], reverse=True)
        if weight > 0.1
    ]


def generate_prompt_with_claude(blend: dict, room_type: str, anthropic_key: str) -> str:
    import requests

    dominant = get_dominant_styles(blend)
    style_context = "\n".join([
        f"{s} ({round(blend.get(s, 0) * 100)}%): "
        f"{STYLE_VOCABULARY.get(s, {}).get('feel', s)}"
        for s in dominant
    ])

    furniture_items = []
    for s in dominant:
        vocab = STYLE_VOCABULARY.get(s, {})
        n = max(1, round(blend.get(s, 0) * 5))
        furniture_items.extend(vocab.get("furniture", [])[:n])

    system_prompt = (
        "You are an expert interior designer creating precise image editing "
        "prompts for FLUX Kontext Pro, an AI image editor.\n\n"
        "FLUX Kontext edits existing images. It excels at replacing furniture "
        "while preserving room architecture.\n\n"
        "CRITICAL: Never use these style names in any output: "
        "Japandi, Bohemian, Coastal, Mid-Century Modern, Minimalist. "
        "Instead use descriptive phrases:\n"
        "- Instead of 'Japandi': 'calm warm naturalism with clean lines'\n"
        "- Instead of 'Minimalist': 'deliberately uncluttered with negative space'\n"
        "- Instead of 'Bohemian': 'eclectic layered with rich texture'\n"
        "- Instead of 'Coastal': 'breezy light-filled with natural materials'\n"
        "- Instead of 'Mid-Century Modern': 'warm retro curves with teak and brass'\n"
        "Always describe the visual qualities, never the style label.\n\n"
        "Your prompts must:\n"
        "1. Be extremely specific about furniture pieces with materials and colors\n"
        "2. Explicitly preserve walls, floors, windows, ceiling, doors\n"
        "3. Specify photorealistic result\n"
        "4. Include 'equirectangular panorama, 360 degree view'\n"
        "5. Stay under 280 words\n"
        "6. Sound like directing a real interior designer, not an AI"
    )

    user_message = (
        f"Create a FLUX Kontext prompt to redesign this {room_type}.\n\n"
        f"Style blend:\n{style_context}\n\n"
        f"Suggested furniture:\n{', '.join(furniture_items[:6])}\n\n"
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
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 512,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_message}],
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["content"][0]["text"].strip()


def generate_prompt_fallback(blend: dict, room_type: str) -> str:
    dominant = get_dominant_styles(blend)
    if not dominant:
        dominant = ["minimalist"]
    top = dominant[0]
    vocab = STYLE_VOCABULARY.get(top, STYLE_VOCABULARY["minimalist"])
    furniture = ", ".join(vocab["furniture"][:4])
    materials = ", ".join(vocab["materials"][:3])
    colors = ", ".join(vocab["colors"][:3])
    return (
        f"Redesign this {room_type} in {vocab['feel']} style. "
        f"Replace all furniture with: {furniture}. "
        f"Use materials: {materials}. Color palette: {colors}. "
        f"Keep all walls, floors, windows, ceiling, doors, and architectural "
        f"features exactly as they are. Preserve all room dimensions, "
        f"proportions, and existing lighting. The result must look like a "
        f"photorealistic interior design photograph. "
        f"Equirectangular panorama, 360 degree view."
    )


def run_flux_kontext(pano_url: str, prompt: str, replicate_token: str, timeout: int = 120) -> str:
    import requests

    print(f"[kontext] Starting prediction...")
    print(f"[kontext] Prompt: {prompt[:120]}...")

    create_resp = requests.post(
        f"{REPLICATE_API_BASE}/models/{FLUX_KONTEXT_MODEL}/predictions",
        headers={
            "Authorization": f"Token {replicate_token}",
            "Content-Type": "application/json",
            "Prefer": "wait",
        },
        json={
            "input": {
                "input_image": pano_url,
                "prompt": prompt,
                "guidance": 2.5,
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
                "num_inference_steps": 28,
                "guidance_scale": 7.5,
                "output_format": "jpg",
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


def generate_perspective_prompt(style_blend: dict) -> str:
    """Build the perspective render prompt from style_blend."""
    dominant = get_dominant_styles(style_blend)
    style_parts = []
    for s in dominant:
        vocab = STYLE_VOCABULARY.get(s, {})
        feel = vocab.get("feel", s)
        style_parts.append(feel)
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


@app.function(
    timeout=300,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("replicate-credentials"),
        modal.Secret.from_name("anthropic-credentials"),
    ],
)
def redesign_room(room_id: str, user_id: str) -> dict:
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
            "marble_pano_url, style_blend, room_type, user_id, render_context"
        ).eq("id", room_id).single().execute().data

        if not room:
            raise RuntimeError(f"Room {room_id} not found")

        # Check render_context schema version
        render_context = room.get("render_context") or {}
        schema_version = render_context.get("schemaVersion", "1.0") if isinstance(render_context, dict) else "1.0"
        if schema_version < "2.0":
            print(f"[kontext] WARNING: render_context schema_version={schema_version} (< 2.0), using safe defaults")

        pano_url = room.get("marble_pano_url")
        if not pano_url:
            raise RuntimeError(f"Room {room_id} has no marble_pano_url")

        style_blend = room.get("style_blend") or {
            "coastal": 0.0, "japandi": 0.7, "minimalist": 0.3,
            "bohemian": 0.0, "mid_century": 0.0,
        }
        room_type = room.get("room_type", "living room")

        print(f"[kontext] Room: {room_type}, styles: {get_dominant_styles(style_blend)}")

        # Generate prompt
        try:
            prompt = generate_prompt_with_claude(style_blend, room_type, anthropic_key)
            prompt_source = "claude"
        except Exception as e:
            print(f"[kontext] Claude failed: {e}, using fallback")
            prompt = generate_prompt_fallback(style_blend, room_type)
            prompt_source = "fallback"

        print(f"[kontext] Prompt ({prompt_source}): {prompt[:150]}...")

        # Status: applying_style
        client.table("rooms").update({"redesign_status": "applying_style"}).eq("id", room_id).execute()

        # Build perspective prompt
        perspective_prompt = generate_perspective_prompt(style_blend)
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
        depth_conditioning_method = "none"

        def run_pano():
            try:
                pano_result[0] = run_flux_kontext(pano_url, prompt, replicate_token)
            except Exception as e:
                pano_error[0] = e

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

        # Status: rendering
        client.table("rooms").update({"redesign_status": "rendering"}).eq("id", room_id).execute()

        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = [
                executor.submit(run_pano),
                executor.submit(run_perspective_depth),
                executor.submit(run_depth_extraction),
            ]
            for f in as_completed(futures):
                pass  # Wait for all

        # Status: finalizing
        client.table("rooms").update({"redesign_status": "finalizing"}).eq("id", room_id).execute()

        # Pano is critical — must succeed
        if pano_error[0]:
            raise pano_error[0]
        redesigned_url = pano_result[0]

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
            storage_path, 86400,
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
        client.table("rooms").update({
            "redesign_pano_url": redesigned_url,
        }).eq("id", room_id).execute()

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

        client.table("rooms").update({
            "redesign_status": "complete",
        }).eq("id", room_id).execute()

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
    if not room_id:
        return {"error": "room_id required"}
    try:
        result = redesign_room.local(room_id, user_id)
        return {"status": "complete", **result}
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
