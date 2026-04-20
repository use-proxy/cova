# DORMANT — FLUX img2img cleanup pass
# Removed from active orchestrator on 2026-04-19 after Modal dashboard confirmed
# the app was Inactive (State 2: deployed but not running, errors silently
# swallowed by orchestrator try/except).
# Preserved for possible v1.x revival if professionalization adds value.
# Last reviewed: 2026-04-19
# See docs/phase-0/professionalization-investigation.md
#
# DISABLED 2026-04-13: FLUX img2img cannot do targeted cleanup.
# Professional quality achieved via:
# - Design director staging script (Session 4)
# - Unsplash IP-Adapter references (Session 5)
# - Main generation at strength 0.85 overrides input clutter

"""
Cova v3 — Professionalization Pass
Takes a preprocessed iPhone photo and produces a "cleaned up" version that
looks professionally photographed: same room, same furniture, same layout,
but with professional lighting and no surface clutter.

Uses FLUX Kontext at LOW strength (0.55) with ControlNet depth conditioning
to lock room geometry. Does NOT redesign the room.

Entry point: professionalize_room()
"""

import os
import time

import modal

# ---------------------------------------------------------------------------
# Modal image — fal-client + supabase
# ---------------------------------------------------------------------------

fal_image = (
    modal.Image.debian_slim(python_version="3.10")
    # Cache bust: 2026-04-13
    .pip_install("fal-client", "supabase", "requests", "Pillow", "opencv-python-headless", "numpy")
)

app = modal.App("cova-professionalization")

STORAGE_BUCKET = "room-photos"

PROFESSIONALIZATION_PROMPT = (
    "Professional real estate photograph of the exact same room. "
    "Keep every piece of furniture in its exact position. Keep all walls, "
    "floors, ceilings, windows, and doors completely unchanged. Keep all "
    "large decorative items. Only make these specific improvements: "
    "1) Even out the lighting so shadows are softer and exposure is balanced. "
    "2) Remove only small surface clutter like cups, papers, and random small "
    "objects from flat surfaces like tables and counters. "
    "3) Straighten any visibly crooked textiles. "
    "Do not add any new furniture or objects. Do not change any colors. "
    "Do not change the style. Do not change the perspective or camera angle. "
    "Preserve all flooring material exactly — do not change carpet to hardwood or any other flooring type. "
    "Do not change the colors, furniture positions, or room layout. Only improve lighting quality and remove visual clutter. "
    "Photorealistic, unchanged room layout."
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _download_bytes(url: str) -> bytes:
    import requests
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return resp.content


def _upload_to_supabase(img_bytes: bytes, path: str) -> str:
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(url, key)

    client.storage.from_(STORAGE_BUCKET).upload(
        path,
        img_bytes,
        {"content-type": "image/jpeg", "upsert": "true"},
    )
    public = client.storage.from_(STORAGE_BUCKET).get_public_url(path)
    return public


# ---------------------------------------------------------------------------
# Quality check + adaptive strength
# ---------------------------------------------------------------------------

def needs_professionalization(image_bytes: bytes) -> bool:
    import cv2
    import numpy as np
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mean_brightness = float(np.mean(gray))
    contrast = float(np.std(gray))
    # Only professionalize dark or low-contrast images
    return mean_brightness < 130 or contrast < 40


def estimate_messiness(image_url: str) -> float:
    """
    Returns 0.0 (tidy) to 1.0 (cluttered).
    Uses edge density as the primary signal: cluttered rooms have more edges.

    Calibrated ranges:
      Clean tidy room: edge_density ~0.08-0.12
      Average room:    edge_density ~0.14-0.20
      Cluttered room:  edge_density ~0.22-0.35+
    """
    import cv2
    import numpy as np
    import requests
    from PIL import Image
    import io

    resp = requests.get(image_url, timeout=10)
    img = Image.open(io.BytesIO(resp.content)).convert("RGB")
    img_small = img.resize((512, 512), Image.LANCZOS)
    img_np = np.array(img_small)
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)

    edges = cv2.Canny(gray, 50, 150)
    edge_density = np.sum(edges > 0) / edges.size

    messiness = max(0.0, min(1.0, (edge_density - 0.08) / 0.20))
    print(f"[Prof] Edge density: {edge_density:.3f} → messiness: {messiness:.2f}")
    return messiness


def adaptive_strength(messiness: float) -> tuple:
    """
    Returns (strength, depth_conditioning_scale) tuned to messiness.
    Upper bound: 0.72. Above this, room layout starts changing.
    """
    # Strength capped at 0.35 to preserve room identity for downstream
    # FLUX Kontext Pro editing — professionalization only fixes lighting and
    # clutter, it must not reshape the room.
    if messiness < 0.25:
        return 0.30, 0.70   # Tidy: gentle cleanup, lighter geometry lock
    elif messiness < 0.50:
        return 0.35, 0.75   # Average: standard cleanup
    elif messiness < 0.75:
        return 0.35, 0.78   # Cluttered
    else:
        return 0.35, 0.82   # Very cluttered: capped


# ---------------------------------------------------------------------------
# Main function
# ---------------------------------------------------------------------------

@app.function(
    image=fal_image,
    timeout=300,
    secrets=[
        modal.Secret.from_name("supabase-secrets"),
        modal.Secret.from_name("fal-secrets"),
    ],
)
def professionalize_room(
    preprocessed_image_url: str,
    depth_map_url: str,
    edge_map_url: str,
    room_id: str,
    removal_target_count: int = 0,
) -> str:
    """
    Run FLUX Kontext img2img at strength=0.35 with two ControlNet passes:
      - Depth ControlNet (mode=2, scale=0.70) — locks room geometry
      - Edge ControlNet (mode=0, scale=0.35) — preserves structural lines

    Uploads result to Supabase and updates rooms.professionalized_image_url.
    Returns the Supabase public URL of the professionalized image.
    """
    import fal_client  # type: ignore[import]
    from supabase import create_client

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(supabase_url, supabase_key)

    print(f"[prof] Starting professionalization for room {room_id}")
    print(f"[prof] Input: {preprocessed_image_url[:80]}...")
    print(f"[prof] Depth: {depth_map_url[:80]}...")
    print(f"[prof] Edges: {edge_map_url[:80]}...")
    print(f"[prof] removal_target_count: {removal_target_count}")

    # Adaptive strength based on actual room clutter (edge density measurement)
    # Falls back to removal_target_count tiers if messiness detection fails
    try:
        messiness = estimate_messiness(preprocessed_image_url)
        prof_strength, depth_conditioning_scale = adaptive_strength(messiness)
        print(f"[Prof] Adaptive params: strength={prof_strength}, depth_scale={depth_conditioning_scale} (messiness={messiness:.2f})")
    except Exception as e:
        print(f"[Prof] Messiness estimation failed ({e}) — falling back to removal_target_count tiers")
        if removal_target_count >= 4:
            prof_strength, depth_conditioning_scale = 0.35, 0.82
        elif removal_target_count >= 2:
            prof_strength, depth_conditioning_scale = 0.35, 0.78
        else:
            prof_strength, depth_conditioning_scale = 0.35, 0.75

    print(f"[prof] strength={prof_strength}, depth_scale={depth_conditioning_scale} (removal_target_count={removal_target_count})")

    # Prompt scales with removal intensity
    if removal_target_count >= 3:
        prof_prompt = (
            "Professional real estate photograph of the exact same room. "
            "Keep every piece of furniture in its exact position. Keep all walls, "
            "floors, ceilings, windows, and doors completely unchanged. "
            "Remove all wall decorations, decals, hanging items, and surface clutter. "
            "Clean all walls to bare painted surface. "
            "Remove any hanging string lights, photo displays, or wall letters. "
            "Even out the lighting so shadows are softer and exposure is balanced. "
            "Straighten any visibly crooked textiles. "
            "Do not add any new furniture or objects. Do not change any colors. "
            "Do not change the style. Do not change the perspective or camera angle. "
            "Do not change the colors, furniture positions, or room layout. Only improve lighting quality and remove visual clutter. "
            "Photorealistic, unchanged room layout."
        )
    else:
        prof_prompt = PROFESSIONALIZATION_PROMPT

    # Quality gate — skip fal.ai call if image is already well-lit and high-contrast
    img_bytes = _download_bytes(preprocessed_image_url)
    if not needs_professionalization(img_bytes):
        print(f"[prof] Skipping — image already high quality")
        return preprocessed_image_url

    result = fal_client.subscribe(
        "fal-ai/flux-general/image-to-image",
        arguments={
            "prompt": prof_prompt,
            "image_url": preprocessed_image_url,
            "strength": prof_strength,
            "num_inference_steps": 15,
            "guidance_scale": 1.5,
            "controlnet_unions": [
                {
                    "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                    "controls": [
                        {
                            "control_image_url": depth_map_url,
                            "control_mode": "depth",
                            "conditioning_scale": depth_conditioning_scale,
                        }
                    ],
                },
                {
                    "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                    "controls": [
                        {
                            "control_image_url": edge_map_url,
                            "control_mode": "canny",
                            "conditioning_scale": 0.35,
                        }
                    ],
                },
            ],
            "output_format": "jpeg",
            "num_images": 1,
        },
        with_logs=True,
    )

    # Extract output URL from fal.ai response
    images = result.get("images") or []
    if not images:
        raise RuntimeError(f"[prof] fal.ai returned no images: {result}")

    output_url: str = images[0]["url"]
    print(f"[prof] fal.ai output: {output_url[:80]}...")

    # Download and store in Supabase
    img_bytes = _download_bytes(output_url)
    storage_path = f"professionalized/{room_id}.jpg"
    supabase_public_url = _upload_to_supabase(img_bytes, storage_path)
    print(f"[prof] Stored → {supabase_public_url[:80]}...")

    # Update rooms.professionalized_image_url (column must exist; soft-fail if not)
    try:
        client.table("rooms").update(
            {"professionalized_image_url": supabase_public_url}
        ).eq("id", room_id).execute()
        print(f"[prof] Updated rooms.professionalized_image_url for {room_id}")
    except Exception as e:
        print(f"[prof] Could not update professionalized_image_url (column may not exist yet): {e}")

    return supabase_public_url


# ---------------------------------------------------------------------------
# Local dev entry point
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def main(
    preprocessed_url: str = "",
    depth_url: str = "",
    edge_url: str = "",
    room_id: str = "test-room",
):
    if not preprocessed_url or not depth_url or not edge_url:
        print(
            "Usage: modal run professionalization.py "
            "--preprocessed-url <URL> --depth-url <URL> --edge-url <URL> --room-id <ID>"
        )
        return

    result = professionalize_room.remote(preprocessed_url, depth_url, edge_url, room_id)
    print(f"Professionalized image: {result}")
