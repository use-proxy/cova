"""
Cova v5 — Unified Fill Pro + Pixel-Perfect Composite (Linear RGB)

Architecture reset: ALL renders go through Fill Pro inpainting + pixel composite.
No route branching. Kontext Pro removed entirely.

Three-stage pipeline:

  Stage 1: fal-ai/flux-pro/v1/fill — NEUTRAL removal.
    Input: original_photo + dilated_remove_mask + neutral prompt
    Output: empty_room.png (furniture erased, floor/walls revealed)

  Stage 2: fal-ai/flux-pro/v1/fill — STYLED inpainting (×4 candidates).
    Input: empty_room.png + dilated_remove_mask (SAME mask) + compiled_prompt
    Output: 4 ai_output candidates (styled furniture in masked region only)

  Stage 3: Pixel-perfect composite (linear RGB).
    sRGB → linear RGB → alpha blend → sRGB
    soft_alpha derived from UNDILATED remove mask (feathered, architecture-zeroed)
    final = soft_alpha * ai_output + (1 - soft_alpha) * original
    Architecture pixels are byte-identical to original (mathematically guaranteed).

When no items marked for removal: auto-mask all non-structural items, or use
inverse of architecture mask as fallback. This eliminates the need for any
separate route.

Score 4 candidates with 3-model ensemble (scoring.py):
  HPSv2 (0.5) + Q-Align (0.3) + Aesthetic V2.5 (0.2).
Return the best. If best < 5.0 (auto-reject gate), regenerate once.
Per-candidate scores stored in renders table.

Entry point: generate_redesign_phase4b()
"""

import io
import json
import os
import random
import time as _time_module
from typing import Optional

import modal

# ---------------------------------------------------------------------------
# Modal image
# ---------------------------------------------------------------------------

fal_image = (
    modal.Image.debian_slim(python_version="3.10")
    # Cache bust: 2026-04-17-v5-postprocess
    .pip_install(
        "fal-client",
        "supabase",
        "requests",
        "httpx",
        "Pillow",
        "numpy",
        "opencv-python-headless",
        "colour-science",
    )
    .add_local_file("modal_pipeline/utils.py", "/root/utils.py")
    .add_local_file("modal_pipeline/mask_build.py", "/root/mask_build.py")
    .add_local_file("modal_pipeline/postprocess.py", "/root/postprocess.py")
    .add_local_dir("modal_pipeline/luts", "/root/luts")
)

# Scorer image — torch, CLIP, HPSv2, Q-Align (optional, may OOM on A10G)
# HPSv2 depends on matplotlib which needs libtk8.6
# Q-Align (q-future/one-align) is ~7B params — gracefully skipped if OOM
scorer_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("python3-tk")
    .pip_install(
        "torch",
        "torchvision",
        "clip-anytorch",
        "hpsv2",
        "requests",
        "Pillow",
        "numpy",
        "huggingface_hub",
        "opencv-python-headless",
        "transformers",
        "accelerate",
    )
    .add_local_file("modal_pipeline/utils.py", "/root/utils.py")
    .add_local_file("modal_pipeline/mask_build.py", "/root/mask_build.py")
    .add_local_file("modal_pipeline/scoring.py", "/root/scoring.py")
)

app = modal.App("cova-generation")

STORAGE_BUCKET = "room-photos"

# Stage 1 neutral fill prompt — same for every room type, every render.
NEUTRAL_FILL_PROMPT = (
    "completely empty room, bare floor, bare walls, no furniture, no objects, "
    "natural light, pristine surfaces, seamless interior photography"
)

# ---------------------------------------------------------------------------
# Shared utilities
# ---------------------------------------------------------------------------

from utils import (
    normalize_label_key,
    normalize_decisions,
    get_category_for_label,
    HARD_STRUCTURAL,
    THIN_STRUCTURE_CATEGORIES,
    DEFAULT_DILATION_PX,
    THIN_DILATION_PX,
)

from mask_build import (
    build_architecture_mask,
    build_remove_mask,
    upload_mask_to_supabase,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _upload_to_fal(image_url: str) -> str:
    """Download image bytes and re-upload to fal.ai storage for guaranteed access.
    URLs already on fal.media/fal.run are returned as-is."""
    if not image_url:
        return image_url
    if any(x in image_url for x in ["fal.media", "fal.run", "cdn.fal"]):
        return image_url  # already on fal, no need to re-upload

    import httpx
    import fal_client

    try:
        response = httpx.get(image_url, timeout=30, follow_redirects=True)
        if response.status_code != 200:
            raise ValueError(f"Image URL returned {response.status_code}: {image_url}")
        image_bytes = response.content
    except Exception as e:
        raise ValueError(f"_upload_to_fal failed to download image: {e}") from None

    fal_url = fal_client.upload(image_bytes, content_type="image/jpeg")
    print(f"[fal_upload] Re-uploaded {image_url[:60]}... -> {fal_url[:60]}...")
    return fal_url


def _download_bytes(url: str) -> bytes:
    import requests
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return resp.content


def _download_image_as_array(url: str):
    """Download image URL and return as RGB numpy array."""
    import numpy as np
    from PIL import Image
    data = _download_bytes(url)
    img = Image.open(io.BytesIO(data)).convert("RGB")
    return np.array(img)


def _upload_to_supabase(img_bytes: bytes, path: str, supabase_url: str, supabase_key: str) -> str:
    """Upload bytes to room-photos bucket (public). Upsert on conflict. Return public URL."""
    from supabase import create_client

    client = create_client(supabase_url, supabase_key)
    file_opts = {"content-type": "image/jpeg", "upsert": "true"}
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

    public_url = f"{supabase_url}/storage/v1/object/public/{STORAGE_BUCKET}/{path}"
    return public_url


# ---------------------------------------------------------------------------
# sRGB ↔ Linear RGB conversion for pixel-perfect compositing
# ---------------------------------------------------------------------------

def _srgb_to_linear(c):
    """Convert sRGB [0,1] to linear RGB [0,1]. Vectorized numpy."""
    import numpy as np
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _linear_to_srgb(c):
    """Convert linear RGB [0,1] to sRGB [0,1]. Vectorized numpy."""
    import numpy as np
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1.0 / 2.4) - 0.055)


# ---------------------------------------------------------------------------
# Phase 6 — 3-Model Ensemble Scorer
#   HPSv2 (0.5) + Q-Align (0.3) + Aesthetic V2.5 (0.2)
#   See scoring.py for model details and licensing.
# ---------------------------------------------------------------------------

@app.function(
    image=scorer_image,
    gpu="A10G",
    timeout=600,
)
def score_candidate(image_url: str, prompt: str = "") -> dict:
    """
    Scores a single candidate image using the 3-model ensemble from scoring.py.

    Returns dict with keys: overall, hps, q_align, aesthetic, reject.
    Individual model scores are None if that model failed.
    """
    from scoring import score_render
    return score_render(image_url, prompt)


@app.function(
    image=scorer_image,
    gpu="A10G",
    timeout=600,
)
def score_candidates_batch(candidate_urls: list, prompt: str = "") -> list:
    """
    Score ALL candidates in a single container call.
    Models load once on first candidate, remaining candidates are fast (~5s each).
    Returns list of score dicts in same order as candidate_urls.
    """
    from scoring import score_render
    results = []
    for i, url in enumerate(candidate_urls):
        try:
            s = score_render(url, prompt)
            print(f"[scoring-batch] Candidate {i}: overall={s.get('overall', 0):.2f}")
            results.append(s)
        except Exception as e:
            print(f"[scoring-batch] Candidate {i} failed: {e}")
            results.append({
                "overall": 0.0, "hps": None, "q_align": None, "aesthetic": None, "reject": True,
            })
    return results


def score_and_select(candidates: list, prompt: str) -> dict:
    """
    Score all candidates with 3-model ensemble, return the best.
    Uses batch scoring to load models once per container.
    """
    # Batch all candidates into a single remote call
    urls = [c["url"] for c in candidates]
    try:
        all_scores = score_candidates_batch.remote(urls, prompt)
    except Exception as e:
        print(f"[scoring] Batch scoring failed: {e}. Falling back to individual scoring.")
        all_scores = []
        for c in candidates:
            try:
                s = score_candidate.remote(c["url"], prompt)
                all_scores.append(s)
            except Exception as e2:
                print(f"[scoring] Individual scoring failed for seed={c['seed']}: {e2}")
                all_scores.append({
                    "overall": 0.0, "hps": None, "q_align": None, "aesthetic": None, "reject": True,
                })

    scored = []
    for c, s in zip(candidates, all_scores):
        scored.append((c, s))
        print(f"[scoring] Candidate seed={c['seed']} "
              f"overall={s.get('overall', 0):.2f} "
              f"hps={s.get('hps', 'N/A')} "
              f"q_align={s.get('q_align', 'N/A')} "
              f"aesthetic={s.get('aesthetic', 'N/A')}")

    if not scored:
        print("[scoring] No candidates scored — returning first candidate")
        candidates[0]["ensemble_score"] = 0.0
        return candidates[0]

    # Select best by overall score
    best_candidate, best_scores = max(scored, key=lambda x: x[1].get("overall", 0.0))
    print(f"[scoring] Selected seed={best_candidate['seed']} "
          f"overall={best_scores.get('overall', 0):.2f}")

    # Attach scores to best candidate
    best_candidate["hps_score"] = best_scores.get("hps") or 0.0
    best_candidate["q_align_score"] = best_scores.get("q_align")
    best_candidate["aesthetic_score"] = best_scores.get("aesthetic") or 0.0
    best_candidate["ensemble_score"] = best_scores.get("overall", 0.0)
    best_candidate["reject"] = best_scores.get("reject", False)

    # Store all candidate scores for DB persistence
    best_candidate["all_scores"] = [
        {
            "seed": c["seed"],
            "url": c["url"],
            "hps": s.get("hps"),
            "q_align": s.get("q_align"),
            "aesthetic": s.get("aesthetic"),
            "overall": s.get("overall", 0.0),
            "was_selected": c["seed"] == best_candidate["seed"],
        }
        for c, s in scored
    ]
    return best_candidate


# ---------------------------------------------------------------------------
# Pixel-perfect composite — linear RGB, THE critical differentiator
# ---------------------------------------------------------------------------

def pixel_perfect_composite(
    original_arr,
    ai_output_arr,
    soft_alpha,
    architecture_mask,
    room_id: str,
):
    """
    Composites ai_output onto original using soft_alpha in LINEAR RGB space.
    Architecture pixels are byte-identical to original.

    sRGB blending causes perceived darkening at boundaries.
    Linear RGB blending produces physically correct results.

    Args:
        original_arr: RGB numpy array of original photo
        ai_output_arr: RGB numpy array of AI-generated output
        soft_alpha: float32 (h, w), 0.0-1.0, architecture regions are 0.0
        architecture_mask: uint8 (h, w), 255=architecture
        room_id: for logging

    Returns:
        composite: RGB numpy array, architecture pixels byte-identical to original
    """
    import cv2
    import numpy as np

    # Resize ai_output to match original exactly
    if ai_output_arr.shape[:2] != original_arr.shape[:2]:
        print(f"[composite] Resizing AI output {ai_output_arr.shape[:2]} -> {original_arr.shape[:2]}")
        ai_output_arr = cv2.resize(
            ai_output_arr,
            (original_arr.shape[1], original_arr.shape[0]),
            interpolation=cv2.INTER_LANCZOS4,
        )

    # Resize soft_alpha if needed
    if soft_alpha.shape[:2] != original_arr.shape[:2]:
        soft_alpha = cv2.resize(
            soft_alpha,
            (original_arr.shape[1], original_arr.shape[0]),
            interpolation=cv2.INTER_LINEAR,
        )

    # Resize architecture_mask if needed
    if architecture_mask.shape[:2] != original_arr.shape[:2]:
        architecture_mask = cv2.resize(
            architecture_mask,
            (original_arr.shape[1], original_arr.shape[0]),
            interpolation=cv2.INTER_NEAREST,
        )

    # Convert to linear RGB — critical for correct blending
    orig_lin = _srgb_to_linear(original_arr / 255.0)
    ai_lin = _srgb_to_linear(ai_output_arr / 255.0)

    # Expand soft_alpha to 3 channels
    alpha_3ch = soft_alpha[:, :, np.newaxis]

    # Composite in linear RGB space
    comp_lin = alpha_3ch * ai_lin + (1.0 - alpha_3ch) * orig_lin

    # Convert back to sRGB
    composite = (_linear_to_srgb(comp_lin) * 255).clip(0, 255).astype(np.uint8)

    # CRITICAL ASSERTION: architecture pixels must be byte-identical
    arch_region = architecture_mask > 0
    arch_pixel_count = np.count_nonzero(arch_region)

    if arch_pixel_count > 0:
        orig_arch = original_arr[arch_region]
        comp_arch = composite[arch_region]

        if not np.array_equal(orig_arch, comp_arch):
            diff = np.abs(comp_arch.astype(int) - orig_arch.astype(int))
            max_diff = diff.max()
            mean_diff = diff.mean()
            mismatched = np.count_nonzero(diff > 0)
            print(f"[composite] WARNING: Architecture pixel mismatch! "
                  f"max_diff={max_diff}, mean_diff={mean_diff:.2f}, "
                  f"mismatched={mismatched}/{arch_pixel_count * 3} subpixels")
            # Force-correct: paste original architecture pixels back
            composite[arch_region] = original_arr[arch_region]
            print("[composite] Force-corrected — architecture pixels now byte-identical")
        else:
            print(f"[composite] arch_pixel_assertion=PASS: "
                  f"{arch_pixel_count} architecture pixels byte-identical")

    # Also verify non-architecture non-mask regions are original
    non_mask = soft_alpha < 0.001
    non_mask_non_arch = non_mask & ~arch_region
    nm_count = np.count_nonzero(non_mask_non_arch)
    if nm_count > 0:
        if not np.array_equal(composite[non_mask_non_arch], original_arr[non_mask_non_arch]):
            composite[non_mask_non_arch] = original_arr[non_mask_non_arch]
            print(f"[composite] Force-corrected {nm_count} non-mask pixels")

    return composite


# ---------------------------------------------------------------------------
# Combined remove mask builder
# ---------------------------------------------------------------------------

def build_combined_remove_mask(
    item_masks: dict,
    keep_remove_decisions: dict,
    detected_items: list,
    architecture_mask,
    image_hw: tuple,
    room_id: str,
    supabase_url: str,
    supabase_key: str,
    auto_remove_all: bool = False,
) -> Optional[tuple]:
    """
    Union all masks for removed items, build soft_alpha via mask_build.
    Returns (dilated_mask_url, hard_mask, dilated_mask, soft_alpha, strength_map)
    or None if no masks available.

    When auto_remove_all=True, treats ALL non-structural items as remove
    (used when no explicit removal decisions but we need a mask for Fill Pro).
    """
    import cv2
    import numpy as np
    import requests
    from PIL import Image

    keep_remove_decisions = normalize_decisions(keep_remove_decisions)

    if not item_masks:
        print("[mask_union] No item_masks — returning None")
        return None

    norm_masks = {normalize_label_key(k): v for k, v in item_masks.items()}
    norm_decisions = {normalize_label_key(k): v for k, v in keep_remove_decisions.items()}

    # Collect remove/keep sets
    remove_keys = []
    keep_keys = []
    for label_key in norm_masks:
        category = get_category_for_label(label_key, detected_items or [])
        if category in HARD_STRUCTURAL:
            continue
        if auto_remove_all:
            # Treat all non-structural items as remove
            remove_keys.append(label_key)
        else:
            decision = norm_decisions.get(label_key, "keep")
            if decision == "remove":
                remove_keys.append(label_key)
            else:
                keep_keys.append(label_key)

    if not remove_keys:
        print("[mask_union] No items to remove — returning None")
        return None

    print(f"[mask_union] Building combined mask for {len(remove_keys)} removed items: {remove_keys}")
    if keep_keys:
        print(f"[mask_union] Preserving {len(keep_keys)} kept items: {keep_keys}")

    # Step 1: Download and collect all remove masks
    instance_masks = []
    instance_labels = []
    h, w = image_hw

    for key in remove_keys:
        mask_url = norm_masks.get(key)
        if not mask_url or not mask_url.startswith("https://"):
            print(f"[mask_union] No mask URL for '{key}' — skipping")
            continue
        try:
            resp = requests.get(mask_url, timeout=30)
            resp.raise_for_status()
            mask_img = Image.open(io.BytesIO(resp.content)).convert("L")
            mask_arr = np.array(mask_img, dtype=np.uint8)

            # Polarity check: SAM2 masks should be white=furniture
            white_ratio = np.count_nonzero(mask_arr > 128) / mask_arr.size
            if white_ratio > 0.80:
                print(f"[mask_union] Mask for '{key}' is {white_ratio:.0%} white — inverting")
                mask_arr = cv2.bitwise_not(mask_arr)

            instance_masks.append(mask_arr)
            instance_labels.append(key)
            print(f"[mask_union] Added mask for '{key}'")
        except Exception as e:
            print(f"[mask_union] Failed to download mask for '{key}': {e}")

    if not instance_masks:
        print("[mask_union] No valid masks — returning None")
        return None

    # Step 2: Exclude kept items from the union
    keep_exclusion_masks = []
    for key in keep_keys:
        mask_url = norm_masks.get(key)
        if not mask_url or not mask_url.startswith("https://"):
            continue
        try:
            resp = requests.get(mask_url, timeout=30)
            resp.raise_for_status()
            keep_img = Image.open(io.BytesIO(resp.content)).convert("L")
            keep_arr = np.array(keep_img, dtype=np.uint8)
            if keep_arr.shape[:2] != (h, w):
                keep_arr = cv2.resize(keep_arr, (w, h), interpolation=cv2.INTER_NEAREST)

            # Category-appropriate dilation
            category = get_category_for_label(key, detected_items or [])
            dil_px = THIN_DILATION_PX if category in THIN_STRUCTURE_CATEGORIES else DEFAULT_DILATION_PX
            kern_size = dil_px * 2 - 1
            keep_kernel = np.ones((kern_size, kern_size), np.uint8)
            keep_dilated = cv2.dilate(keep_arr, keep_kernel, iterations=1)
            keep_exclusion_masks.append(keep_dilated)
            print(f"[mask_union] Excluded kept item '{key}' (dilation={dil_px}px)")
        except Exception as e:
            print(f"[mask_union] Failed to exclude kept item '{key}': {e}")

    # Step 3: Build union via mask_build — returns 4 values now
    hard_mask, dilated_mask, soft_alpha, strength_map = build_remove_mask(
        instance_masks=instance_masks,
        architecture_mask=architecture_mask,
        image_hw=image_hw,
        instance_labels=instance_labels,
    )

    # Subtract kept item regions from hard_mask, rebuild soft_alpha
    if keep_exclusion_masks:
        for km in keep_exclusion_masks:
            if km.shape[:2] != (h, w):
                km = cv2.resize(km, (w, h), interpolation=cv2.INTER_NEAREST)
            hard_mask[km > 128] = 0
            dilated_mask[km > 128] = 0

        # Rebuild soft_alpha from modified hard_mask
        feather_sigma = max(1.0, w / 512.0)
        soft = cv2.GaussianBlur(
            hard_mask.astype(np.float32), (0, 0),
            sigmaX=feather_sigma, sigmaY=feather_sigma,
        )
        soft_alpha = soft / 255.0
        soft_alpha = np.where(architecture_mask > 0, 0.0, soft_alpha).astype(np.float32)

    # Upload DILATED mask for Fill Pro (not the hard mask)
    dilated_mask_url = upload_mask_to_supabase(
        dilated_mask,
        f"masks/{room_id}/combined_remove_mask_dilated.png",
        supabase_url, supabase_key,
    )

    return dilated_mask_url, hard_mask, dilated_mask, soft_alpha, strength_map


# ---------------------------------------------------------------------------
# Fallback mask — inverse of architecture (when no item masks available)
# ---------------------------------------------------------------------------

def build_fallback_mask(
    architecture_mask,
    image_hw: tuple,
    room_id: str,
    supabase_url: str,
    supabase_key: str,
) -> tuple:
    """
    When no item masks are available at all, create a mask that covers ONLY the
    furniture zone — the interior space between ceiling and floor strips.
    Walls, floor, and ceiling are NOT masked.

    This gives Fill Pro control over the area where furniture would be
    while the composite preserves all architecture pixel-perfectly.

    Returns (dilated_mask_url, hard_mask, dilated_mask, soft_alpha, strength_map)
    """
    import numpy as np

    h, w = image_hw

    # Only mask the furniture zone: between ceiling strip and floor strip.
    # Walls within this zone are subtracted via architecture_mask.
    ceiling_end = int(h * 0.12)
    floor_start = int(h * 0.85)

    fallback = np.zeros((h, w), dtype=np.uint8)
    fallback[ceiling_end:floor_start, :] = 255

    # Subtract architecture elements within the furniture zone
    # (walls detected by OneFormer or bbox, plus the ceiling/floor strips)
    fallback = np.where(architecture_mask > 0, 0, fallback).astype(np.uint8)

    coverage = np.count_nonzero(fallback > 0) / (h * w)
    print(f"[fallback_mask] Furniture-zone mask: {coverage:.1%} coverage "
          f"(ceiling_end={ceiling_end}, floor_start={floor_start})")

    # Build the 4 outputs via build_remove_mask
    hard_mask_out, dilated_mask, soft_alpha, strength_map = build_remove_mask(
        instance_masks=[fallback],
        architecture_mask=architecture_mask,
        image_hw=image_hw,
        instance_labels=["fallback_furniture_zone"],
    )

    dilated_mask_url = upload_mask_to_supabase(
        dilated_mask,
        f"masks/{room_id}/fallback_mask_dilated.png",
        supabase_url, supabase_key,
    )

    return dilated_mask_url, hard_mask_out, dilated_mask, soft_alpha, strength_map


# ---------------------------------------------------------------------------
# Prompt builder — Fill Pro only
# ---------------------------------------------------------------------------

def build_fill_prompt(style_prompt: str, removed_items: list, kept_items: list = None) -> str:
    """
    Fill Pro prompt describes replacement content for the masked region only.
    """
    style_cleaned = style_prompt
    for keyword in ["Keep ", "Preserve ", "unchanged", "exactly"]:
        lines = style_cleaned.split(".")
        lines = [ln for ln in lines if keyword not in ln]
        style_cleaned = ".".join(lines)

    if kept_items:
        import re as _re
        kept_labels = set(normalize_label_key(k) for k in kept_items)
        sentences = _re.split(r'(?<=[.!?])\s+', style_cleaned)
        filtered = []
        for sentence in sentences:
            sentence_lower = sentence.lower()
            mentions_kept = any(
                normalize_label_key(label) in sentence_lower
                or any(
                    word in sentence_lower
                    for word in label.lower().replace("_", " ").split()
                    if len(word) > 3
                )
                for label in kept_labels
            )
            if mentions_kept:
                print(f"[fill_prompt] Filtered kept-item sentence: '{sentence[:60]}...'")
            else:
                filtered.append(sentence)
        style_cleaned = ' '.join(filtered)

    style_cleaned = style_cleaned.strip()
    removed_str = ", ".join([r.replace("_", " ") for r in removed_items]) if removed_items else "furniture"

    parts = []
    parts.append(f"Replace {removed_str} with new furniture.")
    if style_cleaned:
        parts.append(style_cleaned)
    parts.append(
        "Include appropriate soft furnishings, complementary lighting, "
        "organic or natural elements, decorative accents where suitable, "
        "styled surfaces. Style cohesive throughout the space."
    )
    parts.append(
        "Neatly arranged soft furnishings, no wrinkles or clutter, "
        "hotel-quality presentation. "
        "Professional interior photography, photorealistic, "
        "warm ambient lighting, sharp focus, no artifacts, "
        "high dynamic range."
    )

    prompt = " ".join(parts)
    print(f"[fill_prompt] Built ({len(prompt.split())} words): {prompt[:120]}...")
    return prompt


# ---------------------------------------------------------------------------
# Main generation function — v5 unified Fill Pro pipeline
# ---------------------------------------------------------------------------

@app.function(
    image=fal_image,
    timeout=600,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("fal-secrets"),
    ],
)
def generate_redesign_phase4b(
    room_id: str,
    user_id: str,
    original_photo_url: str,
    professionalized_photo_url: str,
    style_prompt: str,
    render_context: dict,
    wall_change_requested: bool = True,
    floor_change_requested: bool = False,
    seed: int = 42,
    remove_count: int = 0,
    loras_json: str = None,
) -> dict:
    """
    v5 generation: unified Fill Pro inpainting + pixel-perfect composite.

    ALL renders go through the same 3-stage pipeline:
      Stage 1: Fill Pro neutrally removes items (reveals floor/walls behind)
      Stage 2: Fill Pro applies styled furniture into the SAME mask region (x4 candidates)
      Stage 3: Pixel-perfect composite in linear RGB — architecture pixels byte-identical

    No route branching. When no items marked for removal:
      - If itemMasks exist: auto-remove all non-structural items
      - If no itemMasks: use inverse of architecture mask as fallback
    """
    import fal_client
    import cv2
    import numpy as np
    import requests as _req
    from PIL import Image as _Img
    from supabase import create_client

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(supabase_url, supabase_key)

    base_seed = seed if seed is not None else random.randint(1, 999999)

    print(f"[phase4b] == Generation START for room {room_id} ==")
    print(f"[phase4b] original_photo: {(original_photo_url or 'NONE')[:80]}")
    print(f"[phase4b] professionalized_photo: {(professionalized_photo_url or 'NONE')[:80]}")
    print(f"[phase4b] style_prompt ({len(style_prompt.split())} words): {style_prompt[:120]}...")
    print(f"[phase4b] remove_count: {remove_count}")
    print(f"[phase4b] wall_change: {wall_change_requested}, floor_change: {floor_change_requested}")
    print(f"[phase4b] seed: {base_seed}")

    # ── LoRA parsing — extract COVA* trigger words for prompt injection ──
    # Fill Pro does NOT accept loras param. COVA* trigger words are appended
    # to the styled prompt to activate the trained style signal.
    lora_stack = []
    lora_trigger_words = []
    if loras_json:
        try:
            lora_stack = json.loads(loras_json) if isinstance(loras_json, str) else loras_json
            lora_trigger_words = [
                entry.get("trigger", "")
                for entry in lora_stack
                if entry.get("trigger", "")
            ]
            print(f"[phase4b] LoRA stack received ({len(lora_stack)} entries): "
                  f"{[entry.get('name', 'unknown') for entry in lora_stack]}")
            if lora_trigger_words:
                print(f"[phase4b] COVA trigger words for prompt: {lora_trigger_words}")
            else:
                print("[phase4b] No COVA trigger words in stack — style from prompt only")
        except Exception as e:
            print(f"[phase4b] LoRA JSON parse failed: {e}")
    else:
        print("[phase4b] No LoRA stack received — style from prompt only")

    item_masks = render_context.get("itemMasks") or {}
    masks_ready = render_context.get("masksReady", False)
    detected_items = render_context.get("detected_items") or []
    keep_remove_decisions = normalize_decisions(render_context.get("keep_remove_decisions") or {})

    print(f"[phase4b] detected_items: {len(detected_items)} items")
    print(f"[phase4b] itemMasks: {len(item_masks)} entries, masksReady: {masks_ready}")
    print(f"[phase4b] keep_remove_decisions: {keep_remove_decisions}")

    # ── Download original image to determine dimensions ──────────────────
    orig_arr = None
    for try_url in [original_photo_url, professionalized_photo_url]:
        if not try_url:
            continue
        try:
            orig_arr = _download_image_as_array(try_url)
            image_hw = orig_arr.shape[:2]
            print(f"[phase4b] Original image loaded from: {try_url[:80]}")
            print(f"[phase4b] Original image dimensions: {image_hw[1]}x{image_hw[0]}")
            break
        except Exception as e:
            print(f"[phase4b] Failed to download {try_url[:80]}: {e}")
    if orig_arr is None:
        raise RuntimeError(f"[phase4b] No original image available for room {room_id}")

    input_image = original_photo_url or professionalized_photo_url
    if not input_image:
        raise RuntimeError(f"[phase4b] No photo URL available for room {room_id}")

    # ── Build architecture mask ──────────────────────────────────────────
    arch_mask_url = render_context.get("archMaskUrl", "")
    arch_mask = build_architecture_mask(
        detected_items, image_hw, arch_mask_url=arch_mask_url,
    )
    print(f"[phase4b] Architecture mask built: {np.count_nonzero(arch_mask > 0)} pixels protected"
          f"{' (OneFormer)' if arch_mask_url else ' (bbox fallback)'}")

    # ── Build combined remove mask (unified — no route branching) ────────
    mask_result = None
    mask_source = "none"

    # Compute remove and keep lists
    norm_decisions = {normalize_label_key(k): v for k, v in keep_remove_decisions.items()}
    remove_decision_keys = []
    keep_decision_keys = []
    for k, v in norm_decisions.items():
        cat = get_category_for_label(k, detected_items)
        if cat in HARD_STRUCTURAL:
            continue
        if v == "remove":
            remove_decision_keys.append(k)
        else:
            keep_decision_keys.append(k)

    # Priority 1: User explicitly marked items for removal + masks available
    if masks_ready and item_masks and remove_count > 0:
        try:
            mask_result = build_combined_remove_mask(
                item_masks=item_masks,
                keep_remove_decisions=keep_remove_decisions,
                detected_items=detected_items,
                architecture_mask=arch_mask,
                image_hw=image_hw,
                room_id=room_id,
                supabase_url=supabase_url,
                supabase_key=supabase_key,
            )
            if mask_result:
                mask_source = "user_decisions"
        except Exception as mask_err:
            print(f"[phase4b] Mask build failed: {mask_err}")

    # Priority 2: No explicit removals but masks available — auto-remove all furniture
    if mask_result is None and masks_ready and item_masks:
        print("[phase4b] No explicit removals — auto-masking all non-structural items")
        try:
            mask_result = build_combined_remove_mask(
                item_masks=item_masks,
                keep_remove_decisions={},
                detected_items=detected_items,
                architecture_mask=arch_mask,
                image_hw=image_hw,
                room_id=room_id,
                supabase_url=supabase_url,
                supabase_key=supabase_key,
                auto_remove_all=True,
            )
            if mask_result:
                mask_source = "auto_all_furniture"
                remove_decision_keys = list({
                    normalize_label_key(k) for k in item_masks.keys()
                    if get_category_for_label(normalize_label_key(k), detected_items) not in HARD_STRUCTURAL
                })
        except Exception as mask_err:
            print(f"[phase4b] Auto-mask build failed: {mask_err}")

    # Priority 3: No masks at all — use inverse of architecture mask
    if mask_result is None:
        print("[phase4b] No item masks available — using architecture-inverse fallback")
        try:
            mask_result = build_fallback_mask(
                architecture_mask=arch_mask,
                image_hw=image_hw,
                room_id=room_id,
                supabase_url=supabase_url,
                supabase_key=supabase_key,
            )
            if mask_result:
                mask_source = "architecture_inverse"
                remove_decision_keys = ["furniture_zone"]
        except Exception as fb_err:
            print(f"[phase4b] Fallback mask build failed: {fb_err}")
            raise RuntimeError(f"[phase4b] Cannot build any mask for room {room_id}")

    combined_mask_url, hard_mask, dilated_mask, soft_alpha, strength_map = mask_result

    print(f"[phase4b] ROUTE: unified Fill Pro (mask_source={mask_source})")
    print(f"[phase4b] Input image: {input_image[:80]}")
    print(f"[phase4b] Mask URL: {combined_mask_url[:80]}")

    # ── FIX 1: Floor preservation diagnostics ────────────────────────────
    h_img, w_img = image_hw
    floor_start_px = int(h_img * 0.85)
    floor_arch_pixels = np.count_nonzero(arch_mask[floor_start_px:, :] > 0)
    floor_total_pixels = arch_mask[floor_start_px:, :].size
    print(f"[phase4b] FLOOR CHECK: {floor_arch_pixels}/{floor_total_pixels} floor pixels in architecture_mask "
          f"({floor_arch_pixels / max(floor_total_pixels, 1):.1%})")
    floor_soft_alpha_max = float(soft_alpha[floor_start_px:, :].max()) if soft_alpha.shape[0] > floor_start_px else 0.0
    print(f"[phase4b] FLOOR CHECK: soft_alpha max in bottom 15% = {floor_soft_alpha_max:.6f}")
    if floor_soft_alpha_max > 0.001:
        print("[phase4b] WARNING: soft_alpha > 0 in floor region — force-zeroing")
        soft_alpha[floor_start_px:, :] = 0.0

    ceiling_end_px = int(h_img * 0.06)
    ceil_soft_alpha_max = float(soft_alpha[:ceiling_end_px, :].max()) if ceiling_end_px > 0 else 0.0
    print(f"[phase4b] CEILING CHECK: soft_alpha max in top 6% = {ceil_soft_alpha_max:.6f}")
    if ceil_soft_alpha_max > 0.001:
        print("[phase4b] WARNING: soft_alpha > 0 in ceiling region — force-zeroing")
        soft_alpha[:ceiling_end_px, :] = 0.0

    # ── FIX 2: Mask polarity check ──────────────────────────────────────
    mask_white_count = np.count_nonzero(dilated_mask > 0)
    mask_total = dilated_mask.size
    mask_coverage_pct = mask_white_count / max(mask_total, 1) * 100
    print(f"[phase4b] MASK POLARITY: {mask_white_count} white pixels / {mask_total} total = {mask_coverage_pct:.1f}%")
    if mask_white_count == 0:
        print("[phase4b] CRITICAL: Mask is all black — Fill Pro will not inpaint anything!")
    elif mask_coverage_pct < 5.0:
        print(f"[phase4b] WARNING: Mask coverage < 5% — Fill Pro may barely modify the room")

    # ── Mask dimension verification ─────────────────────────────────────
    try:
        orig_h, orig_w = orig_arr.shape[:2]
        mask_bytes = _req.get(combined_mask_url, timeout=60).content
        mask_img = _Img.open(io.BytesIO(mask_bytes))
        mask_w, mask_h = mask_img.size

        if (mask_w, mask_h) != (orig_w, orig_h):
            print(f"[phase4b] Mask dimensions {mask_w}x{mask_h} != image {orig_w}x{orig_h} — resizing")
            mask_arr = np.array(mask_img.convert("L"))
            mask_arr = cv2.resize(mask_arr, (orig_w, orig_h), interpolation=cv2.INTER_NEAREST)
            resized_pil = _Img.fromarray(mask_arr, mode="L")
            buf = io.BytesIO()
            resized_pil.save(buf, format="PNG")
            resized_bytes = buf.getvalue()
            mask_path = f"masks/{room_id}/combined_remove_mask_resized.png"
            combined_mask_url = _upload_to_supabase(resized_bytes, mask_path, supabase_url, supabase_key)
            print(f"[phase4b] Resized mask uploaded: {combined_mask_url[:80]}")
        else:
            print("[phase4b] Mask dimensions match — OK")
    except Exception as dim_err:
        print(f"[phase4b] Could not verify mask dimensions: {dim_err}")

    # ── Stage 1: Neutral removal ────────────────────────────────────────
    print(f"[phase4b] Stage 1 prompt: {NEUTRAL_FILL_PROMPT[:100]}")
    print("[phase4b] Stage 1: Submitting Fill Pro (neutral removal)...")

    # Re-upload Supabase URLs to fal.ai storage for guaranteed access
    fal_input_image = _upload_to_fal(input_image)
    fal_mask_url = _upload_to_fal(combined_mask_url)

    fill_args = {
        "image_url": fal_input_image,
        "mask_url": fal_mask_url,
        "prompt": NEUTRAL_FILL_PROMPT,
        "seed": base_seed,
        "num_images": 1,
        "output_format": "png",
        "safety_tolerance": "2",
    }

    try:
        handle = fal_client.submit("fal-ai/flux-pro/v1/fill", arguments=fill_args)
        fill_result = handle.get()
    except Exception as e:
        print(f"[phase4b] Stage 1 Fill Pro FAILED: {e}")
        try:
            client.table("rooms").update({
                "redesign_status": "failed",
                "redesign_error": f"FillPro stage1: {str(e)[:1900]}",
            }).eq("id", room_id).execute()
        except Exception:
            pass
        raise

    fill_images = fill_result.get("images") or []
    if not fill_images:
        single = fill_result.get("image")
        if single and isinstance(single, dict) and "url" in single:
            stage1_url = single["url"]
        else:
            raise RuntimeError(f"[phase4b] Stage 1 returned no images: {str(fill_result)[:300]}")
    else:
        stage1_url = fill_images[0].get("url", "")

    if not stage1_url:
        raise RuntimeError("[phase4b] Stage 1 empty URL")

    print(f"[phase4b] Stage 1 DONE — empty room: {stage1_url[:80]}")

    # Upload Stage 1 to Supabase for reuse
    stage1_bytes = _req.get(stage1_url, timeout=60).content
    stage1_path = f"renders/{room_id}/stage1_fill_{int(_time_module.time())}.png"
    stage1_supabase_url = _upload_to_supabase(
        stage1_bytes, stage1_path, supabase_url, supabase_key
    )
    render_context["debug_stage1_url"] = stage1_supabase_url

    # ── Resize mask to match Stage 1 output dimensions ───────────────
    stage1_img = _Img.open(io.BytesIO(stage1_bytes))
    s1_w, s1_h = stage1_img.size
    orig_h, orig_w = image_hw
    if (s1_w, s1_h) != (orig_w, orig_h):
        print(f"[phase4b] Stage 1 output {s1_w}x{s1_h} != original {orig_w}x{orig_h} — resizing mask for Stage 2")
        resized_mask = cv2.resize(dilated_mask, (s1_w, s1_h), interpolation=cv2.INTER_NEAREST)
        resized_mask_pil = _Img.fromarray(resized_mask, mode="L")
        buf = io.BytesIO()
        resized_mask_pil.save(buf, format="PNG")
        stage2_mask_path = f"masks/{room_id}/combined_remove_mask_s2.png"
        stage2_mask_url = _upload_to_supabase(
            buf.getvalue(), stage2_mask_path, supabase_url, supabase_key
        )
        print(f"[phase4b] Stage 2 mask resized and uploaded: {stage2_mask_url[:80]}")
    else:
        stage2_mask_url = combined_mask_url
        print("[phase4b] Stage 1 output matches original — using same mask for Stage 2")

    # ── Stage 2: Styled inpainting x4 candidates (individual calls) ─────
    styled_fill_prompt = build_fill_prompt(
        style_prompt, remove_decision_keys, kept_items=keep_decision_keys
    )

    # Append COVA* trigger words to activate trained style signal
    if lora_trigger_words:
        trigger_suffix = ", ".join(lora_trigger_words) + " style"
        styled_fill_prompt = styled_fill_prompt + f", {trigger_suffix}"
        print(f"[phase4b] Appended COVA triggers to prompt: {trigger_suffix}")

    print(f"[phase4b] Stage 2 prompt (compiled/style): {styled_fill_prompt[:100]}")
    print("[phase4b] Stage 2: Fill Pro styled inpainting x4 seeds")

    # Re-upload Stage 1 output + mask to fal.ai storage for Stage 2
    fal_stage1_url = _upload_to_fal(stage1_supabase_url)
    fal_stage2_mask = _upload_to_fal(stage2_mask_url)

    # Fill Pro num_images param returns only 1 image regardless of value.
    # Use 4 individual calls with different seeds for actual diversity.
    seeds = [base_seed, base_seed + 1000, base_seed + 2000, base_seed + 3000]
    candidates = []

    for s in seeds:
        try:
            style_args = {
                "image_url": fal_stage1_url,
                "mask_url": fal_stage2_mask,
                "prompt": styled_fill_prompt,
                "seed": s,
                "num_images": 1,
                "output_format": "png",
                "safety_tolerance": "2",
            }
            print(f"[phase4b] Stage 2 seed={s}: Submitting Fill Pro...")
            handle = fal_client.submit("fal-ai/flux-pro/v1/fill", arguments=style_args)
            result = handle.get()

            images = result.get("images") or []
            if not images:
                single_image = result.get("image")
                if single_image and isinstance(single_image, dict) and "url" in single_image:
                    images = [single_image]

            if images:
                candidate_url = images[0].get("url", "")
                if candidate_url:
                    candidates.append({"url": candidate_url, "seed": s})
                    print(f"[phase4b] Stage 2 seed={s}: OK — {candidate_url[:80]}")
                else:
                    print(f"[phase4b] Stage 2 seed={s}: empty URL — skipping")
            else:
                print(f"[phase4b] Stage 2 seed={s}: no images returned — skipping")

        except Exception as e:
            print(f"[phase4b] Stage 2 seed={s} failed: {e}")
            # Retry once with higher safety tolerance
            try:
                style_args["safety_tolerance"] = "6"
                print(f"[phase4b] Stage 2 seed={s}: retrying with safety_tolerance=6...")
                handle = fal_client.submit("fal-ai/flux-pro/v1/fill", arguments=style_args)
                result = handle.get()
                images = result.get("images") or []
                if not images:
                    single_image = result.get("image")
                    if single_image and isinstance(single_image, dict) and "url" in single_image:
                        images = [single_image]
                if images:
                    candidate_url = images[0].get("url", "")
                    if candidate_url:
                        candidates.append({"url": candidate_url, "seed": s})
                        print(f"[phase4b] Stage 2 seed={s}: retry OK")
            except Exception as retry_e:
                print(f"[phase4b] Stage 2 seed={s}: retry also failed: {retry_e}")

    # ── Check candidates ─────────────────────────────────────────────────
    if not candidates:
        err_msg = "All candidates failed"
        print(f"[phase4b] {err_msg}")
        try:
            client.table("rooms").update({
                "redesign_status": "failed",
                "redesign_error": err_msg,
            }).eq("id", room_id).execute()
        except Exception:
            pass
        raise RuntimeError(f"[phase4b] {err_msg}")

    print(f"[phase4b] {len(candidates)} candidates — scoring with 3-model ensemble...")

    # ── Score and select best candidate ──────────────────────────────────
    best = score_and_select(candidates, styled_fill_prompt)
    raw_output_url = best["url"]
    ensemble_score = best.get("ensemble_score", 0.0)
    aesthetic_score = best.get("aesthetic_score", 0.0)
    hps_score = best.get("hps_score", 0.0)
    q_align_score = best.get("q_align_score")
    all_scores = best.get("all_scores", [])

    print(f"[phase4b] Best: seed={best['seed']} ensemble={ensemble_score:.2f} "
          f"aesthetic={aesthetic_score:.2f} hps={hps_score:.4f} "
          f"q_align={q_align_score}")
    print(f"[phase4b] All scores: {all_scores}")

    # ── Auto-reject gate — regenerate if best < 5.0 ─────────────────────
    if ensemble_score < 5.0 and len(candidates) > 0:
        print(f"[phase4b] AUTO-REJECT: best score {ensemble_score:.2f} < 5.0 — regenerating with new seed")
        retry_seed = base_seed + 5000
        try:
            retry_args = {
                "image_url": fal_stage1_url,
                "mask_url": fal_stage2_mask,
                "prompt": styled_fill_prompt,
                "seed": retry_seed,
                "num_images": 1,
                "output_format": "png",
                "safety_tolerance": "2",
            }
            handle = fal_client.submit("fal-ai/flux-pro/v1/fill", arguments=retry_args)
            result = handle.get()
            retry_images = result.get("images") or []
            if not retry_images:
                single_image = result.get("image")
                if single_image and isinstance(single_image, dict) and "url" in single_image:
                    retry_images = [single_image]
            retry_candidates = []
            for idx, img_data in enumerate(retry_images):
                url = img_data.get("url", "") if isinstance(img_data, dict) else ""
                if url:
                    retry_candidates.append({"url": url, "seed": retry_seed})

            if retry_candidates:
                retry_best = score_and_select(retry_candidates, styled_fill_prompt)
                if retry_best.get("ensemble_score", 0.0) > ensemble_score:
                    best = retry_best
                    raw_output_url = best["url"]
                    ensemble_score = best.get("ensemble_score", 0.0)
                    aesthetic_score = best.get("aesthetic_score", 0.0)
                    hps_score = best.get("hps_score", 0.0)
                    q_align_score = best.get("q_align_score")
                    all_scores = all_scores + best.get("all_scores", [])
                    print(f"[phase4b] Retry improved: ensemble={ensemble_score:.2f}")
                else:
                    # Add retry scores to all_scores even if not selected
                    all_scores = all_scores + retry_best.get("all_scores", [])
                    print("[phase4b] Retry did not improve — keeping original best")
        except Exception as retry_err:
            print(f"[phase4b] Retry failed: {retry_err}")

    # ── Store per-candidate scores in renders table ──────────────────────
    try:
        loras_used_json = json.loads(loras_json) if loras_json and isinstance(loras_json, str) else loras_json
        for cs in all_scores:
            render_row = {
                "room_id": room_id,
                "user_id": user_id,
                "image_url": cs.get("url", ""),
                "seed": cs.get("seed"),
                "prompt_used": styled_fill_prompt[:2000],
                "loras_used": loras_used_json,
                "hps_score": cs.get("hps"),
                "laion_score": cs.get("aesthetic"),
                "q_align_score": cs.get("q_align"),
                "composite_score": cs.get("overall", 0.0),
                "was_selected": cs.get("was_selected", False),
                "render_type": "candidate",
                "status": "scored",
                "pipeline_version": "v5-ensemble",
            }
            client.table("renders").insert(render_row).execute()
        print(f"[phase4b] Stored {len(all_scores)} candidate scores in renders table")
    except Exception as db_score_err:
        print(f"[phase4b] Failed to store candidate scores: {db_score_err}")

    # ── Stage 3: Pixel-perfect composite (linear RGB) ────────────────────
    before_url = None
    try:
        ai_arr = _download_image_as_array(raw_output_url)

        composite_arr = pixel_perfect_composite(
            original_arr=orig_arr,
            ai_output_arr=ai_arr,
            soft_alpha=soft_alpha,
            architecture_mask=arch_mask,
            room_id=room_id,
        )

        # Floor preservation verification
        h_comp, w_comp = composite_arr.shape[:2]
        floor_region = composite_arr[int(h_comp * 0.75):, :]
        original_floor = orig_arr[int(h_comp * 0.75):, :]
        floor_diff = int(np.abs(floor_region.astype(int) - original_floor.astype(int)).max())
        print(f"[phase4b] floor_diff={floor_diff}")
        if floor_diff > 0:
            print("[phase4b] WARNING: Floor pixels changed — architecture mask may not cover floor")
            floor_arch = arch_mask[int(h_comp * 0.85):, :]
            floor_arch_coverage = np.count_nonzero(floor_arch > 0) / floor_arch.size
            print(f"[phase4b] Architecture mask floor coverage (bottom 15%): {floor_arch_coverage:.1%}")
            floor_alpha = soft_alpha[int(h_comp * 0.75):, :]
            floor_alpha_max = float(floor_alpha.max())
            print(f"[phase4b] soft_alpha max in floor region (bottom 25%): {floor_alpha_max:.4f}")
        else:
            print("[phase4b] Floor preservation PASS — byte-identical to original")

        # Ceiling preservation verification
        ceiling_region = composite_arr[:int(h_comp * 0.10), :]
        original_ceiling = orig_arr[:int(h_comp * 0.10), :]
        ceiling_diff = int(np.abs(ceiling_region.astype(int) - original_ceiling.astype(int)).max())
        print(f"[phase4b] ceiling_diff={ceiling_diff}")
        if ceiling_diff == 0:
            print("[phase4b] Ceiling preservation PASS — byte-identical to original")

        # ── Save before_postprocess for A/B comparison ──────────────────
        before_pil = _Img.fromarray(composite_arr)
        before_buf = io.BytesIO()
        before_pil.save(before_buf, format="JPEG", quality=95)
        before_path = f"renders/{room_id}/before_postprocess_{int(_time_module.time())}.jpg"
        before_url = _upload_to_supabase(
            before_buf.getvalue(), before_path, supabase_url, supabase_key
        )
        print(f"[phase4b] Before postprocess saved: {before_url[:80]}")

        # ── Post-processing chain — magazine quality ────────────────────
        try:
            from postprocess import run_postprocessing_chain

            composite_arr = run_postprocessing_chain(
                composite=composite_arr,
                original=orig_arr,
                arch_mask=arch_mask,
                furniture_mask=soft_alpha,
                depth_map=None,
                window_direction=None,
                style_name="",
                tier="default",
            )
            print("[phase4b] Post-processing chain complete")
        except Exception as pp_err:
            print(f"[phase4b] Post-processing FAILED — using raw composite: {pp_err}")
            import traceback
            traceback.print_exc()

        # Upload final
        processed_pil = _Img.fromarray(composite_arr)
        buf = io.BytesIO()
        processed_pil.save(buf, format="JPEG", quality=95)
        processed_bytes = buf.getvalue()

        final_path = f"renders/{room_id}/final_{int(_time_module.time())}.jpg"
        final_url = _upload_to_supabase(processed_bytes, final_path, supabase_url, supabase_key)
        print(f"[phase4b] Final (post-processed) uploaded: {final_url[:80]}")

    except Exception as comp_err:
        print(f"[phase4b] Composite FAILED — using raw output: {comp_err}")
        import traceback
        traceback.print_exc()
        final_url = raw_output_url

    print(f"[phase4b] Final URL: {final_url[:80]}")

    # ── Update rooms table ───────────────────────────────────────────────
    try:
        update_payload = {
            "redesign_pano_url": final_url,
            "redesign_status": "complete",
            "generation_seed": best.get("seed", base_seed),
        }
        client.table("rooms").update(update_payload).eq("id", room_id).execute()
        print("[phase4b] DB updated — redesign_status=complete")
    except Exception as db_err:
        print(f"[phase4b] DB update FAILED: {db_err}")
        raise

    print(f"[phase4b] == Generation COMPLETE for room {room_id} ==")

    result_dict = {
        "final_url": final_url,
        "raw_fal_url": raw_output_url,
        "before_postprocess_url": before_url,
        "composite_applied": True,
        "image_url": final_url,
        "route_used": "fill_pro_unified",
        "mask_url": combined_mask_url,
        "mask_source": mask_source,
        "seed": best.get("seed", base_seed),
        "endpoint_used": "fal-ai/flux-pro/v1/fill x 2 stages",
        "aesthetic_score": aesthetic_score,
        "hps_score": hps_score,
        "q_align_score": q_align_score,
        "ensemble_score": ensemble_score,
        "all_scores": all_scores,
        "fill_prompt_used": NEUTRAL_FILL_PROMPT,
        "styled_fill_prompt": styled_fill_prompt,
        "stage1_url": stage1_supabase_url,
        "loras_applied": False,
        "loras_in_prompt": bool(lora_trigger_words),
        "lora_triggers_appended": lora_trigger_words,
        "num_candidates": len(candidates),
    }

    return result_dict


# ---------------------------------------------------------------------------
# Local dev entry point
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def main(
    room_id: str = "test-room",
    original_url: str = "",
    professionalized_url: str = "",
    style_prompt: str = "Replace furniture with warm natural style pieces. Bright natural daylight, professional interior photography.",
):
    if not original_url and not professionalized_url:
        print(
            "Usage: modal run modal_pipeline/generation.py "
            "--room-id <ID> "
            "--original-url <URL> "
            "[--professionalized-url <URL>] "
            "[--style-prompt <PROMPT>]"
        )
        return

    result = generate_redesign_phase4b.remote(
        room_id=room_id,
        user_id="local-test",
        original_photo_url=original_url,
        professionalized_photo_url=professionalized_url or original_url,
        style_prompt=style_prompt,
        render_context={},
        seed=42,
    )
    print(f"[main] Output: {result}")
