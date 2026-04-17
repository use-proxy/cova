"""
Cova — Mask Building Utilities for Selective Inpainting

Two masks drive the entire pipeline:

  1. Architecture mask (white = architecture pixel, NEVER inpaint)
     Built from pre_detection_result categories in HARD_STRUCTURAL.
     Falls back to default ceiling/floor strips when detection is missing.

  2. Remove mask (white = inpaint this region)
     Union of all user-REMOVE item masks, dilated + feathered.
     Architecture pixels are zeroed out — they can NEVER be in the remove mask.

  soft_alpha is derived from the remove mask:
     soft_alpha = GaussianBlur(hard_mask) / 255.0
     soft_alpha[architecture_mask > 0] = 0.0

  Used by pixel_perfect_composite():
     final = soft_alpha * ai_output + (1 - soft_alpha) * original

  Architecture pixels are mathematically guaranteed byte-identical to original.
"""

import io

import cv2
import numpy as np

from utils import (
    HARD_STRUCTURAL,
    normalize_label_key,
    get_dilation_px,
)


# ---------------------------------------------------------------------------
# Architecture mask — derived from pre_detection_result
# ---------------------------------------------------------------------------

def build_architecture_mask(
    detected_items: list,
    image_hw: tuple,
    arch_mask_url: str = "",
) -> np.ndarray:
    """
    Builds binary architecture mask from detected items.
    White (255) = architecture pixel (never inpaint).

    Priority:
      1. If arch_mask_url is provided (from OneFormer segmentation pipeline),
         download the pixel-perfect semantic mask. Falls back to bbox if download fails.
      2. Otherwise, use estimated_bbox_pct from pre_detection_result.

    Universal — reads from detection output, no hardcoded values.

    Falls back to default ceiling (top 6%) and floor (bottom 15%) strips
    when no structural items are detected.
    """
    h, w = image_hw

    arch_mask = np.zeros((h, w), dtype=np.uint8)

    # Priority 1: OneFormer pixel-perfect mask from segmentation pipeline
    oneformer_loaded = False
    if arch_mask_url and isinstance(arch_mask_url, str) and arch_mask_url.startswith("https://"):
        try:
            import requests
            from PIL import Image

            resp = requests.get(arch_mask_url, timeout=30)
            resp.raise_for_status()
            mask_img = Image.open(io.BytesIO(resp.content)).convert("L")
            mask_arr = np.array(mask_img, dtype=np.uint8)

            # Resize to match image dimensions if needed
            if mask_arr.shape[:2] != (h, w):
                mask_arr = cv2.resize(mask_arr, (w, h), interpolation=cv2.INTER_NEAREST)

            # Binarize — OneFormer mask is white=architecture
            arch_mask = ((mask_arr > 127).astype(np.uint8)) * 255
            oneformer_loaded = True
            pixel_count = np.count_nonzero(arch_mask > 0)
            print(f"[mask_build] Architecture mask from OneFormer: {pixel_count} pixels "
                  f"({pixel_count / (h * w):.1%})")
        except Exception as e:
            print(f"[mask_build] Failed to load OneFormer mask from {arch_mask_url[:60]}: {e}")
            print("[mask_build] Falling back to bbox-based architecture mask")

    # Priority 2: bbox-based mask from pre_detection_result
    if not oneformer_loaded:
        structural_found = 0
        for item in detected_items:
            cat = normalize_label_key(item.get("category", ""))
            label = normalize_label_key(item.get("label", ""))

            if cat not in HARD_STRUCTURAL and label not in HARD_STRUCTURAL:
                continue

            bbox = item.get("estimated_bbox_pct")
            if not bbox or not isinstance(bbox, dict):
                continue

            x1 = int(bbox.get("x", 0) * w)
            y1 = int(bbox.get("y", 0) * h)
            x2 = int((bbox.get("x", 0) + bbox.get("w", 0)) * w)
            y2 = int((bbox.get("y", 0) + bbox.get("h", 0)) * h)
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)

            if x2 > x1 and y2 > y1:
                arch_mask[y1:y2, x1:x2] = 255
                structural_found += 1

        print(f"[mask_build] Architecture mask (bbox fallback): {structural_found} structural items")

    # Always protect ceiling top 6% and floor bottom 15% as fallback
    # These strips are additive — they don't replace OneFormer or bbox masks
    ceiling_end = int(h * 0.06)
    floor_start = int(h * 0.85)
    arch_mask[:ceiling_end, :] = 255
    arch_mask[floor_start:, :] = 255

    total_protected = np.count_nonzero(arch_mask > 0)
    print(f"[mask_build] Architecture mask final: {total_protected} pixels "
          f"({total_protected / (h * w):.1%}) "
          f"+ ceiling strip (top {ceiling_end}px) + floor strip (bottom {h - floor_start}px)")

    return arch_mask


# ---------------------------------------------------------------------------
# Remove mask — union of all user-REMOVE item masks
# ---------------------------------------------------------------------------

def build_remove_mask(
    instance_masks: list,
    architecture_mask: np.ndarray,
    image_hw: tuple,
    feather_sigma: float = 4.0,
    instance_labels: list = None,
) -> tuple:
    """
    Builds combined remove mask from individual instance masks.

    Args:
        instance_masks: list of np.ndarray (grayscale, white=furniture)
        architecture_mask: binary mask (white=architecture, from build_architecture_mask)
        image_hw: (height, width) of the source image
        feather_sigma: Gaussian sigma for soft alpha feathering
        instance_labels: optional list of label strings for class-aware dilation.
                         If provided, each mask gets its own dilation from DILATION_PX.
                         If not provided, uses uniform 3px dilation (legacy behavior).

    Returns:
        (hard_mask, soft_alpha):
            hard_mask: uint8 0/255, union of all instance masks with arch zeroed
            soft_alpha: float32 0.0-1.0, feathered version with arch zeroed
    """
    h, w = image_hw
    long_edge = max(h, w)

    if not instance_masks:
        print("[mask_build] No instance masks — returning empty mask")
        return np.zeros((h, w), dtype=np.uint8), np.zeros((h, w), dtype=np.float32)

    union = np.zeros((h, w), dtype=np.uint8)

    for i, m in enumerate(instance_masks):
        # Resize to source hw with INTER_NEAREST (never bilinear for binary masks)
        if m.shape[:2] != (h, w):
            m = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)

        # Binarize
        m = (m > 127).astype(np.uint8) * 255

        # Morphological close to fill interior holes
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k, iterations=2)

        # Class-aware dilation per instance
        if instance_labels and i < len(instance_labels):
            dil_px = get_dilation_px(instance_labels[i], long_edge)
        else:
            # Legacy fallback — uniform 3px
            dil_px = 3
        if dil_px > 0:
            k_size = dil_px * 2 + 1
            k_dil = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_size, k_size))
            m = cv2.dilate(m, k_dil, iterations=1)

        union = np.maximum(union, m)

    # CRITICAL: Zero out architecture pixels — they must NEVER be inpainted
    union = np.where(architecture_mask > 0, 0, union).astype(np.uint8)

    hard_mask = union

    # Soft alpha for blending
    soft = cv2.GaussianBlur(
        hard_mask.astype(np.float32),
        (0, 0),
        sigmaX=feather_sigma,
        sigmaY=feather_sigma,
    )
    soft_alpha = soft / 255.0

    # CRITICAL: Force soft_alpha to exactly 0.0 in architecture regions
    # GaussianBlur can bleed into architecture regions — zero them explicitly
    soft_alpha = np.where(architecture_mask > 0, 0.0, soft_alpha).astype(np.float32)

    mask_coverage = np.count_nonzero(hard_mask > 0) / (h * w)
    print(f"[mask_build] Remove mask: {mask_coverage:.1%} coverage, "
          f"feather_sigma={feather_sigma}")

    return hard_mask, soft_alpha


# ---------------------------------------------------------------------------
# Upload mask to Supabase
# ---------------------------------------------------------------------------

def upload_mask_to_supabase(
    mask_array: np.ndarray,
    path: str,
    supabase_url: str,
    supabase_key: str,
) -> str:
    """
    Upload a mask array (uint8, grayscale) to Supabase room-photos bucket.
    Returns the public URL.
    """
    from PIL import Image
    from supabase import create_client

    STORAGE_BUCKET = "room-photos"

    mask_pil = Image.fromarray(mask_array, mode="L")
    buf = io.BytesIO()
    mask_pil.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    client = create_client(supabase_url, supabase_key)
    file_opts = {"content-type": "image/png", "upsert": "true"}

    try:
        client.storage.from_(STORAGE_BUCKET).upload(
            path=path, file=png_bytes, file_options=file_opts,
        )
    except Exception as up_err:
        err_str = str(up_err).lower()
        if "already exists" in err_str or "duplicate" in err_str or "409" in err_str:
            client.storage.from_(STORAGE_BUCKET).update(
                path=path, file=png_bytes, file_options=file_opts,
            )
        else:
            raise

    public_url = f"{supabase_url}/storage/v1/object/public/{STORAGE_BUCKET}/{path}"
    print(f"[mask_build] Uploaded mask: {public_url[:80]}...")
    return public_url
