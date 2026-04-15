"""
Cova v3 — Session 5 Main Generation
FLUX img2img with ControlNet (depth + edge), style LoRA, and Unsplash IP-Adapter references.

Entry point: generate_redesign()

Parameters: professionalized_image_url, depth_map_url, edge_map_url, flux_prompt,
            negative_prompt, lora_url, lora_scale, unsplash_reference_urls, room_id, seed
Returns: { output_url, seed_used }

On completion:
  - Uploads PNG to Supabase room-photos bucket: renders/{room_id}.png
  - Updates rooms.redesign_pano_url and rooms.redesign_status = "complete"

On any exception:
  - Sets rooms.redesign_status = "failed"
  - Re-raises so the caller knows it failed
  - Never silently swallows errors
"""

import json
import os
import random
from typing import Optional

import modal

# ---------------------------------------------------------------------------
# Modal image
# ---------------------------------------------------------------------------

fal_image = (
    modal.Image.debian_slim(python_version="3.10")
    # Cache bust: 2026-04-14
    .pip_install(
        "fal-client",
        "supabase",
        "requests",
        "Pillow",
        "numpy",
        "scipy",
    )
)

app = modal.App("cova-generation")

STORAGE_BUCKET = "room-photos"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _download_bytes(url: str) -> bytes:
    import requests
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return resp.content


def _upload_to_supabase(img_bytes: bytes, path: str, supabase_url: str, supabase_key: str) -> str:
    """Upload bytes to room-photos bucket. Upsert on conflict. Return signed URL (7 days)."""
    from supabase import create_client

    client = create_client(supabase_url, supabase_key)

    file_opts = {"content-type": "image/png", "upsert": "true"}
    try:
        client.storage.from_(STORAGE_BUCKET).upload(
            path=path, file=img_bytes, file_options=file_opts,
        )
    except Exception as up_err:
        err_str = str(up_err).lower()
        if "already exists" in err_str or "duplicate" in err_str or "409" in err_str:
            client.storage.from_(STORAGE_BUCKET).update(
                path=path, file=img_bytes, file_options=file_opts,
            )
        else:
            raise

    signed = client.storage.from_(STORAGE_BUCKET).create_signed_url(path, 604800)
    url = (
        signed.get("signedURL")
        or signed.get("signedUrl")
        or signed.get("signed_url", "")
    )
    if not url:
        raise RuntimeError(f"[gen] No signed URL returned for {STORAGE_BUCKET}/{path}: {signed}")
    return url


# ---------------------------------------------------------------------------
# LoRA helpers
# ---------------------------------------------------------------------------

def _validate_and_build_loras(
    loras_json: Optional[str] = None,
    # Legacy single-LoRA params — kept for backwards compat during transition
    lora_url: Optional[str] = None,
    lora_scale: float = 0.8,
) -> list:
    """
    Parses and validates the LoRA stack for fal.ai.

    Priority:
    1. loras_json: JSON array from route.ts, supports stacked LoRAs
    2. lora_url + lora_scale: legacy single-LoRA path

    Rules enforced:
    - Every URL must start with https://
    - Combined scale must not exceed 1.2 (hard cap from research)
    - If all URLs invalid, returns [] (never crashes generation)
    """
    lora_configs = []

    if loras_json:
        try:
            parsed = json.loads(loras_json)
            for item in parsed:
                url = item.get("url", "")
                scale = float(item.get("scale", 0.5))
                name = item.get("name", "unknown")

                if not url.startswith("https://"):
                    print(f"[Generation] ✗ Invalid LoRA URL for '{name}': '{url[:60]}'")
                    continue

                scale = max(0.1, min(1.5, scale))  # Clamp to reasonable range
                lora_configs.append({"path": url, "scale": scale, "_name": name})

        except json.JSONDecodeError as e:
            print(f"[Generation] Failed to parse loras_json: {e}")

    elif lora_url:
        if lora_url.startswith("https://"):
            scale = max(0.1, min(1.5, lora_scale))
            lora_configs.append({"path": lora_url, "scale": scale, "_name": "legacy"})
        else:
            print(f"[Generation] ✗ Invalid legacy LoRA URL: '{lora_url[:60]}'")

    if not lora_configs:
        print("[Generation] ⚠ No valid LoRAs — running without style conditioning")
        return []

    # Enforce 1.2 combined scale cap
    total_scale = sum(l["scale"] for l in lora_configs)
    if total_scale > 1.2:
        factor = 1.2 / total_scale
        print(f"[Generation] Combined scale {total_scale:.2f} > 1.2 — normalizing by {factor:.3f}")
        for l in lora_configs:
            l["scale"] = round(l["scale"] * factor, 3)

    for l in lora_configs:
        print(f"[Generation] ✓ LoRA active: {l['_name']} @ scale {l['scale']}")
    print(f"[Generation] Total LoRA scale: {sum(l['scale'] for l in lora_configs):.2f}")

    # Return in fal.ai format — strip internal _name field
    return [{"path": l["path"], "scale": l["scale"]} for l in lora_configs]


# ---------------------------------------------------------------------------
# Change map builder (for differential diffusion)
# ---------------------------------------------------------------------------

def build_change_map(
    image_width: int,
    image_height: int,
    depth_map_url: str,
    kept_item_mask_urls: list,
    wall_change_requested: bool,
    floor_change_requested: bool,  # always False — floor never changes
    room_id: str,
    supabase_url: str,
    supabase_key: str,
) -> str:
    """
    Builds a grayscale change map for differential diffusion.

    White (255) = regenerate (default)
    Black (0)   = preserve exactly

    Floor region: always black (floor never changes regardless of user input).
    Wall regions: black if wall_change_requested is False.
    Kept item masks: black wherever the EVF-SAM2 mask is white.
    All black regions dilated 5px to prevent edge artifacts.

    Returns: Supabase signed URL for masks/{room_id}/change_map.png (7 days)
    """
    import io
    import requests
    import numpy as np
    from PIL import Image
    from scipy.ndimage import binary_dilation
    from supabase import create_client

    print(f"[change_map] Building for room {room_id}: {image_width}x{image_height}")
    print(f"[change_map] wall_change={wall_change_requested}, floor_change={floor_change_requested}, masks={len(kept_item_mask_urls)}")

    # Start all-white (everything regenerates by default)
    change_map = np.ones((image_height, image_width), dtype=np.uint8) * 255

    # ── Floor region: always black ────────────────────────────────────────────
    # Simple heuristic: use depth map to find floor pixels in lower portion.
    # Floor = bottom 40% of image with depth in the mid-to-high range (far away).
    # Fallback: unconditionally treat bottom 25% as floor.
    if depth_map_url and depth_map_url.startswith("https://"):
        try:
            depth_resp = requests.get(depth_map_url, timeout=30)
            depth_resp.raise_for_status()
            depth_img = Image.open(io.BytesIO(depth_resp.content)).convert("L")
            depth_img = depth_img.resize((image_width, image_height), Image.LANCZOS)
            depth_arr = np.array(depth_img) / 255.0  # 0-1, higher = farther

            # Floor: lower 40% of image where depth > 0.45 (mid to far)
            y_start = int(image_height * 0.60)
            floor_region = np.zeros((image_height, image_width), dtype=bool)
            floor_region[y_start:, :] = depth_arr[y_start:, :] > 0.45
            # Always treat bottom 25% as floor regardless of depth
            floor_region[int(image_height * 0.75):, :] = True

            change_map[floor_region] = 0
            floor_px = int(np.sum(floor_region))
            print(f"[change_map] floor region painted black: {floor_px} pixels (depth-based)")
        except Exception as e:
            print(f"[change_map] Depth map failed ({e}), applying positional floor fallback")
            fallback_start = int(image_height * 0.70)
            change_map[fallback_start:, :] = 0
            fallback_px = image_width * (image_height - fallback_start)
            print(f"[change_map] floor region painted black: {fallback_px} pixels (depth-exception fallback)")
    else:
        # No depth map — paint bottom 30% black
        fallback_start = int(image_height * 0.70)
        change_map[fallback_start:, :] = 0
        fallback_px = image_width * (image_height - fallback_start)
        print(f"[change_map] floor region painted black: {fallback_px} pixels (no-depth-map fallback)")

    # ── Wall regions: black if wall not changing ──────────────────────────────
    if not wall_change_requested:
        # Simple heuristic: upper strip (top 15%) + left/right edges (< 10% / > 90% x)
        # These cover ceiling/upper wall and side walls in most room photos.
        change_map[:int(image_height * 0.15), :] = 0   # ceiling / upper wall
        change_map[:int(image_height * 0.70), :int(image_width * 0.10)] = 0   # left wall
        change_map[:int(image_height * 0.70), int(image_width * 0.90):] = 0   # right wall
        print("[change_map] Wall preservation mask applied")

    # ── Kept item masks: paint black wherever EVF-SAM2 mask is white ─────────
    for mask_url in kept_item_mask_urls:
        if not mask_url or not mask_url.startswith("https://"):
            continue
        try:
            mask_resp = requests.get(mask_url, timeout=30)
            mask_resp.raise_for_status()
            mask_img = Image.open(io.BytesIO(mask_resp.content)).convert("L")
            mask_img = mask_img.resize((image_width, image_height), Image.LANCZOS)
            mask_arr = np.array(mask_img)
            # White pixels in mask (> 128) = kept item region = paint black
            change_map[mask_arr > 128] = 0
            print(f"[change_map] Applied kept item mask: {mask_url[:60]}")
        except Exception as e:
            print(f"[change_map] Failed to apply mask {mask_url[:60]}: {e}")
            # Non-fatal — continue with other masks

    # ── Dilate all black regions by 5px to prevent edge artifacts ────────────
    black_mask = change_map == 0
    structure = np.ones((11, 11), dtype=bool)   # 5px radius → 11x11 kernel
    dilated_black = binary_dilation(black_mask, structure=structure)
    change_map[dilated_black] = 0
    print(f"[change_map] Dilation applied: {np.sum(black_mask)} → {np.sum(dilated_black)} black px")

    # ── Upload to Supabase masks/{room_id}/change_map.png ────────────────────
    pil_map = Image.fromarray(change_map, mode="L")
    buf = io.BytesIO()
    pil_map.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    path = f"masks/{room_id}/change_map.png"
    client = create_client(supabase_url, supabase_key)

    try:
        client.storage.from_(STORAGE_BUCKET).upload(
            path=path,
            file=png_bytes,
            file_options={"content-type": "image/png", "upsert": "true"},
        )
    except Exception as up_err:
        err_str = str(up_err).lower()
        if "already exists" in err_str or "duplicate" in err_str or "409" in err_str:
            client.storage.from_(STORAGE_BUCKET).update(
                path=path,
                file=png_bytes,
                file_options={"content-type": "image/png"},
            )
        else:
            raise

    signed = client.storage.from_(STORAGE_BUCKET).create_signed_url(path, 604800)
    url = (
        signed.get("signedURL")
        or signed.get("signedUrl")
        or signed.get("signed_url", "")
    )
    if not url:
        raise RuntimeError(f"[ChangeMap] No signed URL returned for {path}: {signed}")

    print(f"[ChangeMap] Uploaded: {url[:80]}")
    return url


# ---------------------------------------------------------------------------
# Main generation function
# ---------------------------------------------------------------------------

@app.function(
    image=fal_image,
    timeout=600,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("fal-secrets"),
    ],
)
def generate_redesign_two_pass(
    professionalized_image_url: str,
    depth_map_url: str,
    edge_map_url: str,          # Must be Canny edges (not HED) — see structural_extraction.py
    flux_prompt: str,           # Must contain trigger word if custom LoRA is active
    loras_json: Optional[str],  # JSON array of {url, scale, name}
    unsplash_reference_urls: list,
    room_id: str,
    remove_count: int = 0,
    seed: Optional[int] = None,
    # Differential diffusion — if provided, Pass 2 uses fal-ai/flux-general/differential-diffusion
    # white = regenerate, black = preserve exactly.
    change_map_url: Optional[str] = None,
    # Change map build inputs — if change_map_url is None, build it from these
    kept_item_mask_urls: Optional[list] = None,
    wall_change_requested: bool = True,
) -> dict:
    """
    Two-pass generation for editorial-quality interior redesign.

    PASS 1 — Text-to-image with depth ControlNet only:
      - No input image. FLUX generates from scratch within room geometry.
      - Produces editorial quality with correct tonal characteristics.
      - IP-Adapter at single reference, scale 0.40.
      - ControlNet end_percentage=0.80 (critical — early steps guide structure,
        final 20% polish without constraint).

    PASS 2 — Low-strength img2img on Pass 1 output:
      - Input is Pass 1 output (not original iPhone photo).
      - Strength 0.22-0.32: snaps architectural edges back, preserves styling.
      - Canny ControlNet at scale 0.35 locks window frames, door positions.
      - No IP-Adapter in Pass 2 (style already committed from Pass 1).

    KEY NOTES:
    - FLUX does NOT support negative_prompt — never pass it (throws errors)
    - end_percentage=0.80 was missing from single-pass code — it's the most
      impactful single parameter change
    - IP-Adapter combined > 0.5 degrades quality — single ref at 0.40 is better
      than two refs at 0.50+0.35=0.85
    - fal.ai parameter names: start_percentage / end_percentage
      (NOT control_guidance_start / control_guidance_end)
    """
    import fal_client  # type: ignore[import]
    from supabase import create_client

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(supabase_url, supabase_key)

    base_seed = seed if seed is not None else random.randint(1, 999999)
    loras = _validate_and_build_loras(loras_json=loras_json)

    # ── Build change map if kept item masks were passed ───────────────────────
    # change_map_url already set by caller → skip building
    # kept_item_mask_urls provided → build from masks + depth
    resolved_change_map_url = change_map_url
    if not resolved_change_map_url and kept_item_mask_urls:
        try:
            print(f"[TwoPass] Building change map from {len(kept_item_mask_urls)} kept item masks...")
            resolved_change_map_url = build_change_map(
                image_width=1024,
                image_height=1024,
                depth_map_url=depth_map_url,
                kept_item_mask_urls=kept_item_mask_urls,
                wall_change_requested=wall_change_requested,
                floor_change_requested=False,  # floor never changes
                room_id=room_id,
                supabase_url=supabase_url,
                supabase_key=supabase_key,
            )
            print(f"[TwoPass] Change map built: {resolved_change_map_url[:80]}")
        except Exception as cm_err:
            print(f"[TwoPass] Change map build failed — falling back to standard img2img: {cm_err}")
            resolved_change_map_url = None

    # ── Compute adaptive parameters based on remove_count ──────────────────────
    if remove_count >= 3:
        pass1_depth_scale = 0.68
        pass2_strength = 0.32
    elif remove_count >= 1:
        pass1_depth_scale = 0.72
        pass2_strength = 0.27
    else:
        pass1_depth_scale = 0.78
        pass2_strength = 0.22

    print(f"[TwoPass] Config: remove_count={remove_count}, p1_depth={pass1_depth_scale}, p2_strength={pass2_strength}")
    print(f"[TwoPass] Seed: {base_seed}, LoRAs: {len(loras)}, refs: {len(unsplash_reference_urls)}")

    # ── IP-Adapter / Redux reference conditioning ─────────────────────────────
    # Research: combined scale > 0.5 degrades quality.
    # Previous code used 0.50 + 0.35 = 0.85 combined — too high.
    # Fix: single best reference at 0.40.
    #
    # USE_REDUX_REFERENCE=true switches to fal-ai/flux-general's reference_image_url
    # (Redux-style conditioning) instead of the IP-Adapter. A/B test only.
    # To test: set USE_REDUX_REFERENCE=true in Modal secrets, trigger rerun,
    # and compare against IP-Adapter output. Whichever looks more editorial — use that.
    USE_REDUX_REFERENCE = os.environ.get("USE_REDUX_REFERENCE", "false").lower() == "true"

    valid_refs = [u for u in (unsplash_reference_urls or []) if u and u.startswith("https://")]
    ip_adapter_url = valid_refs[0] if valid_refs else None
    if ip_adapter_url:
        if USE_REDUX_REFERENCE:
            print(f"[TwoPass] Redux reference conditioning at strength 0.40: {ip_adapter_url[:80]}")
        else:
            print(f"[TwoPass] IP-Adapter: single reference at scale 0.40: {ip_adapter_url[:80]}")
    else:
        print(f"[TwoPass] No valid references — omitting reference conditioning")

    # ────────────────────────────────────────────────────────────────────────────
    # PASS 1: Text-to-image + depth ControlNet
    # fal-ai/flux-general (text-to-image endpoint, NO image_url param)
    # ────────────────────────────────────────────────────────────────────────────
    print(f"[TwoPass] Pass 1: text-to-image + depth ControlNet (scale={pass1_depth_scale}, end=0.80)...")

    pass1_args = {
        "prompt": flux_prompt,
        # DO NOT pass negative_prompt — FLUX throws errors.
        "num_inference_steps": 30,
        "guidance_scale": 3.5,
        "image_size": {"width": 1024, "height": 1024},
        "controlnet_unions": [
            {
                "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                "controls": [
                    {
                        "control_image_url": depth_map_url,
                        "control_mode": "depth",
                        "conditioning_scale": pass1_depth_scale,
                        "start_percentage": 0.0,
                        "end_percentage": 0.80,   # CRITICAL — was missing from single-pass code
                    }
                    # No canny in Pass 1 — geometry set by depth, edge reserved for Pass 2 snap
                ],
            }
        ],
        "loras": loras if loras else [],
        "output_format": "png",
        "num_images": 1,
        "seed": base_seed,
        "enable_safety_checker": False,
        "scheduler": "euler",
    }

    if ip_adapter_url:
        if USE_REDUX_REFERENCE:
            # Redux-style conditioning: reference_image_url + reference_strength
            # Mirrors IP-Adapter scale of 0.40 for a fair A/B comparison
            pass1_args["reference_image_url"] = ip_adapter_url
            pass1_args["reference_strength"] = 0.40
            print("[TwoPass] Pass 1: Using Redux reference conditioning (not IP-Adapter)")
        else:
            pass1_args["ip_adapter_image_url"] = ip_adapter_url
            pass1_args["ip_adapter_scale"] = 0.40
            print("[TwoPass] Pass 1: Using IP-Adapter conditioning at scale 0.40")

    try:
        handle1 = fal_client.submit("fal-ai/flux-general", arguments=pass1_args)
        result1 = handle1.get()
        images1 = result1.get("images") or []
        if not images1:
            raise RuntimeError(f"[TwoPass] Pass 1 returned no images: {str(result1)[:300]}")
        pass1_image_url = images1[0]["url"]
        print(f"[TwoPass] Pass 1 complete: {pass1_image_url[:80]}")
    except Exception as e:
        print(f"[TwoPass] Pass 1 FAILED for room {room_id}: {e}")
        try:
            client.table("rooms").update({
                "redesign_status": "failed",
                "redesign_error": f"Pass1: {str(e)[:1900]}",
            }).eq("id", room_id).execute()
        except Exception:
            pass
        raise

    # ────────────────────────────────────────────────────────────────────────────
    # PASS 2: Reality snap — differential diffusion (if change map) or img2img
    #
    # With change map: fal-ai/flux-general/differential-diffusion
    #   White (255) regions regenerate fully — new furniture areas
    #   Black (0) regions preserve exactly — floor, walls, kept items
    #   This prevents the floor/walls/kept items from changing even at higher strength
    #
    # Without change map: standard img2img at strength 0.22-0.32 (existing behavior)
    # ────────────────────────────────────────────────────────────────────────────

    pass2_controlnets = [
        {
            "path": "InstantX/FLUX.1-dev-Controlnet-Union",
            "controls": [
                {
                    # Canny: snaps window frames, door positions, floor boundaries
                    "control_image_url": edge_map_url,
                    "control_mode": "canny",
                    "conditioning_scale": 0.35,
                    "start_percentage": 0.0,
                    "end_percentage": 0.80,
                },
                {
                    # Light depth in Pass 2 prevents spatial drift
                    "control_image_url": depth_map_url,
                    "control_mode": "depth",
                    "conditioning_scale": 0.42,
                    "start_percentage": 0.0,
                    "end_percentage": 0.70,
                },
            ],
        }
    ]

    if resolved_change_map_url:
        print(f"[TwoPass] Pass 2: differential diffusion (change_map + edge_scale=0.35, end=0.80)...")
        # Differential diffusion: white = regenerate, black = preserve.
        # Strength still set to allow full regeneration in white regions.
        # The change map modulates per-pixel — black regions are NOT touched.
        pass2_endpoint = "fal-ai/flux-general/differential-diffusion"
        pass2_args = {
            "prompt": flux_prompt,
            "image_url": pass1_image_url,
            "change_map_image_url": resolved_change_map_url,
            "strength": 0.95,           # High strength in white regions — change map caps black
            "num_inference_steps": 20,
            "guidance_scale": 2.8,
            "controlnet_unions": pass2_controlnets,
            "loras": loras if loras else [],
            "output_format": "png",
            "num_images": 1,
            "seed": base_seed + 1,
            "enable_safety_checker": False,
            "scheduler": "euler",
        }
    else:
        print(f"[TwoPass] Pass 2: standard img2img (strength={pass2_strength}, edge_scale=0.35, end=0.80)...")
        pass2_endpoint = "fal-ai/flux-general/image-to-image"
        pass2_args = {
            "prompt": flux_prompt,
            # DO NOT pass negative_prompt
            "image_url": pass1_image_url,   # Input IS Pass 1, not original iPhone photo
            "strength": pass2_strength,
            "num_inference_steps": 20,
            "guidance_scale": 2.8,          # Lower than Pass 1 — stay close to Pass 1 output
            "controlnet_unions": pass2_controlnets,
            "loras": loras if loras else [],
            # No IP-Adapter in Pass 2 — style committed from Pass 1
            "output_format": "png",
            "num_images": 1,
            "seed": base_seed + 1,          # Offset by 1: same scene, tiny variation
            "enable_safety_checker": False,
            "scheduler": "euler",
        }

    try:
        handle2 = fal_client.submit(pass2_endpoint, arguments=pass2_args)
        result2 = handle2.get()
        images2 = result2.get("images") or []
        if not images2:
            raise RuntimeError(f"[TwoPass] Pass 2 returned no images: {str(result2)[:300]}")
        pass2_image_url = images2[0]["url"]
        print(f"[TwoPass] Pass 2 complete: {pass2_image_url[:80]}")
    except Exception as e:
        print(f"[TwoPass] Pass 2 FAILED for room {room_id}: {e}")
        try:
            client.table("rooms").update({
                "redesign_status": "failed",
                "redesign_error": f"Pass2: {str(e)[:1900]}",
            }).eq("id", room_id).execute()
        except Exception:
            pass
        raise

    # ── Update rooms table ───────────────────────────────────────────────────
    try:
        update_payload = {
            "redesign_pano_url": pass2_image_url,
            "redesign_status": "complete",
            "generation_seed": base_seed,
        }
        if resolved_change_map_url:
            update_payload["change_map_url"] = resolved_change_map_url
        client.table("rooms").update(update_payload).eq("id", room_id).execute()
        print(f"[TwoPass] DB updated — redesign_pano_url + redesign_status=complete + generation_seed={base_seed}")
    except Exception as db_err:
        print(f"[TwoPass] DB update FAILED for room {room_id}: {db_err}")
        raise

    return {
        "final_url": pass2_image_url,
        "pass1_url": pass1_image_url,
        "pass2_url": pass2_image_url,
        "seed": base_seed,
        "pass1_depth_scale": pass1_depth_scale,
        "pass2_strength": pass2_strength,
        "loras_active": len(loras) > 0,
        "differential_diffusion": resolved_change_map_url is not None,
        "change_map_url": resolved_change_map_url,
    }


# ---------------------------------------------------------------------------
# Single-pass generation — kept for A/B testing
# ---------------------------------------------------------------------------

@app.function(
    image=fal_image,
    timeout=300,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("fal-secrets"),
    ],
)
def generate_redesign_single_pass(
    professionalized_image_url: str,
    depth_map_url: str,
    edge_map_url: str,
    flux_prompt: str,
    negative_prompt: str,
    unsplash_reference_urls: list,  # up to 5, mood-first order
    room_id: str,
    seed: int = None,
    remove_count: int = 0,
    # Stacked LoRA stack — JSON array of {url, scale, name}
    loras_json: Optional[str] = None,
    # Legacy single-LoRA params — kept for backwards compat
    lora_url: Optional[str] = None,
    lora_scale: float = 0.8,
) -> dict:
    """
    Main FLUX generation using fal-ai/flux-general/image-to-image.

    ControlNets:
      - Depth (mode=depth, scale=0.60, steps 0%–65%): preserves room geometry
      - Edge  (mode=canny, scale=0.40, steps 0%–50%): preserves structural lines

    LoRA: style trigger injected at requested scale.

    IP-Adapter: two entries — mood/atmosphere ref (scale=0.50) and style/material
      composite ref (scale=0.35). Only included when unsplash_reference_urls is non-empty.

    Uploads output to Supabase room-photos/renders/{room_id}.png.
    Updates rooms.redesign_pano_url and rooms.redesign_status.
    """
    import fal_client  # type: ignore[import]
    from supabase import create_client

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(supabase_url, supabase_key)

    # Resolve seed
    seed_used = seed if seed else random.randint(1, 999999)

    print(f"[gen] Starting generation for room {room_id}")
    print(f"[gen] Prompt ({len(flux_prompt.split())} words): {flux_prompt[:100]}...")
    print(f"[gen] Negative (first 50 chars): {negative_prompt[:50]}")
    print(f"[gen] loras_json: {(loras_json or '')[:120]}")
    print(f"[gen] Unsplash refs: {len(unsplash_reference_urls)}")
    print(f"[gen] Depth map: {depth_map_url[:80]}...")
    print(f"[gen] Edge map: {edge_map_url[:80]}...")
    print(f"[gen] Seed: {seed_used}")
    print(f"[gen] remove_count: {remove_count}")

    # ── Dynamic generation parameters based on change scope ──────────────────
    if remove_count >= 3:
        # Heavy transformation — user wants major changes
        strength = 0.92
        depth_scale = 0.45
        depth_end_pct = 0.75   # active longer → preserves geometry without killing transformation
        edge_scale = 0.30
    elif remove_count >= 1:
        # Moderate transformation
        strength = 0.87
        depth_scale = 0.52
        depth_end_pct = 0.70
        edge_scale = 0.35
    else:
        # Light touch — mostly keeping things
        strength = 0.82
        depth_scale = 0.60
        depth_end_pct = 0.65
        edge_scale = 0.40

    print(f"[generation] change_scope: remove_count={remove_count} strength={strength} depth={depth_scale}@{depth_end_pct} edge={edge_scale}")

    # ── ControlNet configuration ─────────────────────────────────────────────
    # Both depth + edge controls go in a SINGLE controlnet_unions entry.
    # Splitting into two separate entries causes "Could not load pipeline" (422).
    controlnet_unions = [
        {
            "path": "InstantX/FLUX.1-dev-Controlnet-Union",
            "controls": [
                {
                    "control_image_url": depth_map_url,
                    "control_mode": "depth",     # mode 2 — depth
                    "conditioning_scale": depth_scale,
                    "start_percentage": 0.0,
                    "end_percentage": depth_end_pct,  # dynamic — longer = better floor/geometry preservation
                },
                {
                    "control_image_url": edge_map_url,
                    "control_mode": "canny",     # mode 0 — edges
                    "conditioning_scale": edge_scale,
                    "start_percentage": 0.0,
                    "end_percentage": 0.65,       # raised from 0.50 — preserves floor material longer
                },
            ],
        }
    ]
    print(f"[gen] ControlNets: depth scale={depth_scale} (0%–{int(depth_end_pct*100)}%), edge scale={edge_scale} (0%–65%)")

    # ── IP-Adapter configuration ─────────────────────────────────────────────
    # Only use references that are valid HTTPS URLs. Empty list or null → skip.
    valid_refs = [u for u in (unsplash_reference_urls or []) if u and u.startswith("https://")]
    ip_adapter_mood_url = None
    ip_adapter_style_url = None
    if valid_refs:
        ip_adapter_mood_url = valid_refs[0]
        ip_adapter_style_url = (
            valid_refs[1] if len(valid_refs) >= 2 else valid_refs[0]
        )
        for i, ref_url in enumerate(unsplash_reference_urls[:2]):
            print(f"[generation] IP-Adapter ref {i+1}: {ref_url[:80]}")
        print(f"[generation] IP-Adapter entry 1 (mood, scale=0.50): {ip_adapter_mood_url[:80]}...")
        print(f"[generation] IP-Adapter entry 2 (style, scale=0.35): {ip_adapter_style_url[:80]}...")
    else:
        skipped_count = len(unsplash_reference_urls or [])
        print(f"[generation] No valid Unsplash references (received {skipped_count}) — IP-Adapter omitted")

    # ── Build fal.ai arguments ───────────────────────────────────────────────
    fal_arguments = {
        "prompt": flux_prompt,
        "image_url": professionalized_image_url,
        "strength": strength,
        "num_inference_steps": 28,
        "guidance_scale": 3.5,
        "scheduler": "euler",
        "image_size": {"width": 1024, "height": 1024},
        "controlnet_unions": controlnet_unions,
        "output_format": "png",
        "num_images": 1,
        "seed": seed_used,
        "enable_safety_checker": False,
    }

    # Build and validate the LoRA stack.
    # Prefers loras_json (stacked dual-LoRA), falls back to legacy lora_url/lora_scale.
    loras = _validate_and_build_loras(
        loras_json=loras_json,
        lora_url=lora_url,
        lora_scale=lora_scale,
    )
    if loras:
        fal_arguments["loras"] = loras

    # IP-Adapter: use mood URL (entry 1, highest weight) via ip_adapter_image_url.
    # fal-ai/flux-general uses ip_adapter_image_url (singular) not ip_adapters[].
    if ip_adapter_mood_url:
        fal_arguments["ip_adapter_image_url"] = ip_adapter_mood_url
        fal_arguments["ip_adapter_scale"] = 0.50

    # NOTE: fal-ai/flux-general/image-to-image with controlnet_unions does NOT support
    # negative_prompt — including it causes "Could not load pipeline" (422). The design
    # director's negative_prompt is logged for debugging but never sent to fal.ai.
    if negative_prompt and negative_prompt.strip():
        print(f"[gen] Negative prompt (not sent to fal, incompatible with ControlNets): {negative_prompt[:80]}")

    # ip_adapter_image_url is set inline above (replaced ip_adapters[] array)

    # ── Pre-call logging ─────────────────────────────────────────────────────
    ip_adapter_count = 1 if ip_adapter_mood_url else 0
    print(f"[generation] Starting fal.ai call for room {room_id}")
    print(f"[generation] prompt words: {len(flux_prompt.split())}")
    print(f"[generation] loras: {loras}")
    print(f"[generation] ip_adapter count: {ip_adapter_count}")
    print(f"[generation] controlnets: depth={depth_scale} edge={edge_scale}")
    print(f"[generation] seed: {seed_used}")
    print(f"[generation] fal_arguments keys: {list(fal_arguments.keys())}")

    # ── Call fal.ai (submit + get) ───────────────────────────────────────────
    output_url: str = ""
    try:
        handle = fal_client.submit(
            "fal-ai/flux-general/image-to-image",
            arguments=fal_arguments,
        )
        result = handle.get()  # blocks until complete; Modal function timeout=300 handles overall limit

        images = result.get("images") or []
        if not images:
            raise RuntimeError(f"[generation] fal.ai returned no images. Result: {str(result)[:300]}")

        output_url = images[0]["url"]
        print(f"[generation] fal.ai call complete for room {room_id}")
        print(f"[generation] output URL: {output_url[:80]}")

    except Exception as fal_err:
        print(f"[generation] fal.ai call FAILED for room {room_id}: {fal_err}")
        try:
            client.table("rooms").update({
                "redesign_status": "failed",
                "redesign_error": str(fal_err)[:2000],
            }).eq("id", room_id).execute()
        except Exception as db_err:
            print(f"[gen] Could not write failed status: {db_err}")
        raise

    # ── Store fal.ai URL directly (skip download + Supabase re-upload) ────────
    # Modal cannot resolve v3b.fal.media DNS, so we store the fal.ai URL as-is.
    print(f"[generation] Storing fal.ai URL directly: {output_url[:80]}")

    # ── Update rooms table ───────────────────────────────────────────────────
    try:
        client.table("rooms").update({
            "redesign_pano_url": output_url,
            "redesign_status": "complete",
            "generation_seed": seed_used,
        }).eq("id", room_id).execute()
        print(f"[gen] DB updated — redesign_pano_url + redesign_status=complete + generation_seed={seed_used}")
    except Exception as db_err:
        print(f"[gen] DB update FAILED for room {room_id}: {db_err}")
        raise

    return {
        "output_url": output_url,
        "seed_used": seed_used,
        "room_id": room_id,
    }


# ---------------------------------------------------------------------------
# Local dev entry point
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def main(
    room_id: str = "test-room",
    professionalized_url: str = "",
    depth_url: str = "",
    edge_url: str = "",
    flux_prompt: str = "A warm minimalist bedroom with natural oak furniture, linen textiles, and soft ambient lighting.",
):
    if not all([professionalized_url, depth_url, edge_url]):
        print(
            "Usage: modal run modal_pipeline/generation.py "
            "--room-id <ID> "
            "--professionalized-url <URL> "
            "--depth-url <URL> "
            "--edge-url <URL>"
        )
        return

    default_loras_json = json.dumps([
        {"url": "https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-add-details/resolve/main/FLUX-dev-lora-add_details.safetensors", "scale": 0.55, "name": "detail-enhancer"},
        {"url": "https://huggingface.co/XLabs-AI/flux-RealismLora/resolve/main/lora.safetensors", "scale": 0.25, "name": "realism-lora"},
    ])

    result = generate_redesign_two_pass.remote(
        professionalized_image_url=professionalized_url,
        depth_map_url=depth_url,
        edge_map_url=edge_url,
        flux_prompt=flux_prompt,
        unsplash_reference_urls=[],
        room_id=room_id,
        loras_json=default_loras_json,
    )
    print(f"[gen] Output: {result}")
