"""
Cova v7 — Mask Building Utilities (Semantic-Only, No Composite)

Two outputs drive the pipeline:

  1. Architecture mask (white = architecture pixel)
     Built from OneFormer semantic segmentation (ADE20K classes).
     NO spatial strips. Pure semantic classification only.
     Preserves: wall, ceiling, floor, window, door, structural elements.
     Does NOT preserve: wall decorations, lights, clutter, furniture.

  2. Dilated mask for Fill Pro (white = regenerate)
     inverse(architecture_mask) with 12px elliptical dilation.
     This is the only mask Fill Pro sees.

No composite — Fill Pro output is used directly after post-processing.
No soft_alpha, no strength_map, no pixel blending.
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
# Architecture mask — semantic-only, no spatial strips
# ---------------------------------------------------------------------------

def build_architecture_mask(
    detected_items: list,
    image_hw: tuple,
    arch_mask_url: str = "",
) -> np.ndarray:
    """
    Builds binary architecture mask from semantic segmentation.
    White (255) = architecture pixel (preserved by Fill Pro via mask).

    Priority:
      1. OneFormer pixel-perfect semantic mask (from segmentation pipeline)
      2. Bbox-based fallback from pre_detection_result

    NO spatial strips. Pure semantic classification only.
    Wall decorations, lights, clutter are NOT protected.
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

    # NO spatial strips — pure semantic only
    total_protected = np.count_nonzero(arch_mask > 0)
    print(f"[mask_build] Architecture mask (before SAM refinement): {total_protected} pixels "
          f"({total_protected / (h * w):.1%}) — semantic only, no spatial strips")

    return arch_mask


# ---------------------------------------------------------------------------
# SAM2 auto-segment refinement — subtract wall-mounted objects from arch mask
# ---------------------------------------------------------------------------

# Max area ratio for a SAM proposal to be considered a "removable object"
# Wall letters ~0.1-0.5%, garland ~1-2%, poster ~2-4%.
# Anything > 5% is likely a wall/floor/ceiling section itself.
MAX_OBJECT_AREA_RATIO = 0.05

# Min area ratio — ignore tiny noise proposals (< 0.05%)
MIN_OBJECT_AREA_RATIO = 0.0005

# How much of a SAM proposal must overlap with the architecture mask
# to be considered "wall-mounted" (vs free-standing furniture already excluded)
# Must be very high — we only want objects fully embedded in wall/floor
MIN_ARCH_OVERLAP = 0.70


def subtract_wall_objects_via_sam(
    arch_mask: np.ndarray,
    image_url: str,
    image_hw: tuple,
) -> np.ndarray:
    """
    Use SAM2 automatic segmentation to find wall-mounted objects that
    OneFormer misclassified as part of the wall, then subtract them
    from the architecture preservation mask.

    Targets: wall text/letters, photo garlands, posters, baseball caps,
    small decorations, clutter on floors — anything OneFormer called
    "wall" or "floor" but is actually a removable object.

    Returns: refined arch_mask with wall-mounted objects carved out.
    """
    import fal_client
    import requests
    from PIL import Image

    h, w = image_hw
    total_pixels = h * w

    print(f"[sam_refine] Running SAM2 auto-segment on {w}x{h} image...")

    try:
        result = fal_client.subscribe(
            "fal-ai/sam2/auto-segment",
            arguments={
                "image_url": image_url,
                "output_format": "png",
                "points_per_side": 32,
                "pred_iou_thresh": 0.86,
                "stability_score_thresh": 0.92,
                "min_mask_region_area": 100,
            },
            with_logs=False,
        )
    except Exception as e:
        print(f"[sam_refine] SAM2 auto-segment FAILED: {e} — returning arch_mask unchanged")
        return arch_mask

    individual_masks = result.get("individual_masks") or []
    print(f"[sam_refine] SAM2 returned {len(individual_masks)} proposals")

    if not individual_masks:
        print("[sam_refine] No proposals — returning arch_mask unchanged")
        return arch_mask

    # Process each SAM proposal
    subtracted_count = 0
    refined_mask = arch_mask.copy()

    for i, mask_data in enumerate(individual_masks):
        mask_url = mask_data.get("url") if isinstance(mask_data, dict) else None
        if not mask_url:
            continue

        try:
            resp = requests.get(mask_url, timeout=15)
            resp.raise_for_status()
            mask_img = Image.open(io.BytesIO(resp.content)).convert("L")
            sam_mask = np.array(mask_img, dtype=np.uint8)

            if sam_mask.shape[:2] != (h, w):
                sam_mask = cv2.resize(sam_mask, (w, h), interpolation=cv2.INTER_NEAREST)

            # Binarize
            sam_mask = (sam_mask > 127).astype(np.uint8) * 255
            sam_pixel_count = np.count_nonzero(sam_mask > 0)
            area_ratio = sam_pixel_count / total_pixels

            # Skip if too tiny (noise)
            if area_ratio < MIN_OBJECT_AREA_RATIO:
                continue

            # Skip if very large (it's a wall/floor/ceiling section)
            if area_ratio > 0.10:
                continue

            # Check overlap with architecture mask
            overlap_pixels = np.count_nonzero((sam_mask > 0) & (arch_mask > 0))
            if sam_pixel_count > 0:
                overlap_ratio = overlap_pixels / sam_pixel_count
            else:
                continue

            # Check 1: Wall-mounted object (mostly in arch, <5% of image)
            is_wall_mounted = (
                overlap_ratio >= MIN_ARCH_OVERLAP
                and area_ratio <= MAX_OBJECT_AREA_RATIO
            )

            # Check 2: Object ON furniture (<10%, >20% overlap with non-arch)
            # Catches: caps on bedposts, clothes on bed, books on desk
            is_on_furniture = False
            if not is_wall_mounted and area_ratio < 0.10:
                non_arch_pixels = np.count_nonzero((sam_mask > 0) & (arch_mask == 0))
                non_arch_ratio = non_arch_pixels / sam_pixel_count
                is_on_furniture = non_arch_ratio >= 0.20

            if not is_wall_mounted and not is_on_furniture:
                continue

            # This is a removable object (wall-mounted or on-furniture)
            # Dilate slightly to catch edges
            k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            sam_mask_dilated = cv2.dilate(sam_mask, k, iterations=1)

            # Subtract from architecture mask — these pixels should be regenerated
            refined_mask = np.where(sam_mask_dilated > 0, 0, refined_mask).astype(np.uint8)
            subtracted_count += 1

            if subtracted_count <= 20:  # Only log first 20
                obj_type = "wall-mounted" if is_wall_mounted else "on-furniture"
                print(f"[sam_refine] Subtracted {obj_type} proposal {i}: "
                      f"area={area_ratio:.3%}, arch_overlap={overlap_ratio:.0%}")

        except Exception as e:
            # Skip individual proposals that fail to download
            continue

    after_protected = np.count_nonzero(refined_mask > 0)
    removed_pixels = total_protected - after_protected if 'total_protected' in dir() else np.count_nonzero(arch_mask > 0) - after_protected
    print(f"[sam_refine] Subtracted {subtracted_count} wall-mounted objects "
          f"({removed_pixels} pixels removed from arch mask)")
    print(f"[sam_refine] Architecture mask after SAM refinement: {after_protected} pixels "
          f"({after_protected / total_pixels:.1%})")

    return refined_mask


# ---------------------------------------------------------------------------
# Input cleaning — paint over removable regions before Fill Pro
# ---------------------------------------------------------------------------

def clean_input_image(
    image: np.ndarray,
    regenerate_mask: np.ndarray,
    architecture_mask: np.ndarray,
    kept_item_mask: np.ndarray = None,
) -> np.ndarray:
    """
    v9 — Paint over regeneration regions with compass-direction sampled color.
    Prevents Fill Pro from reproducing text, logos, posters, clutter.

    For each connected component in the regeneration mask:
      1. Walk N/S/E/W from component edges until hitting preserved architecture
      2. Sample those 4 boundary colors
      3. Fill the region with their average
      4. Apply heavy 31x31 Gaussian blur to filled regions (destroys outlines)
      5. Add mild noise (sigma=8) to prevent ghost edge detection

    kept_item_mask: if provided, these regions are excluded from cleaning.
    """
    h, w = image.shape[:2]
    cleaned = image.copy()

    # Build the mask of regions to clean
    clean_mask = regenerate_mask.copy()

    # Exclude kept items from cleaning
    if kept_item_mask is not None:
        if kept_item_mask.shape[:2] != (h, w):
            kept_item_mask = cv2.resize(kept_item_mask, (w, h), interpolation=cv2.INTER_NEAREST)
        clean_mask = np.where(kept_item_mask > 127, 0, clean_mask).astype(np.uint8)

    # Binarize
    clean_mask = (clean_mask > 127).astype(np.uint8)

    clean_pixel_count = np.count_nonzero(clean_mask)
    if clean_pixel_count == 0:
        print("[clean_input] No regions to clean — returning original")
        return image

    # Precompute preserved architecture pixels (not being cleaned)
    preserved = (architecture_mask > 0) & (clean_mask == 0)

    # Find connected components
    num_components, labels = cv2.connectedComponents(clean_mask)
    print(f"[clean_input] Found {num_components - 1} connected components to clean")

    components_cleaned = 0
    for comp_id in range(1, num_components):
        component = (labels == comp_id).astype(np.uint8)
        comp_pixels = component.sum()

        if comp_pixels < 50:
            continue  # skip tiny noise

        # Get component bounding box and centroid
        ys, xs = np.where(component > 0)
        y_min, y_max = int(ys.min()), int(ys.max())
        x_min, x_max = int(xs.min()), int(xs.max())
        cy = (y_min + y_max) // 2
        cx = (x_min + x_max) // 2

        # Walk 4 compass directions from component edges to find architecture
        boundary_colors = []

        # North: at centroid x, walk up from top edge of component
        for y in range(max(0, y_min - 1), -1, -1):
            if preserved[y, cx]:
                boundary_colors.append(image[y, cx].copy())
                break

        # South: at centroid x, walk down from bottom edge of component
        for y in range(min(h - 1, y_max + 1), h):
            if preserved[y, cx]:
                boundary_colors.append(image[y, cx].copy())
                break

        # West: at centroid y, walk left from left edge of component
        for x in range(max(0, x_min - 1), -1, -1):
            if preserved[cy, x]:
                boundary_colors.append(image[cy, x].copy())
                break

        # East: at centroid y, walk right from right edge of component
        for x in range(min(w - 1, x_max + 1), w):
            if preserved[cy, x]:
                boundary_colors.append(image[cy, x].copy())
                break

        if len(boundary_colors) >= 3:
            # Average the compass-direction samples
            fill_color = np.mean(boundary_colors, axis=0).astype(np.uint8)
        elif len(boundary_colors) >= 1:
            # Few directions found architecture — use what we have
            fill_color = np.mean(boundary_colors, axis=0).astype(np.uint8)
        else:
            # No compass directions found architecture — use closest preserved pixel
            # Dilate component by 200px and find any preserved architecture
            kernel_large = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (201, 201))
            dilated_large = cv2.dilate(component, kernel_large, iterations=1)
            border = (dilated_large > 0) & (component == 0) & preserved
            if border.sum() >= 10:
                fill_color = np.median(image[border], axis=0).astype(np.uint8)
            elif np.any(preserved):
                fill_color = np.median(image[preserved], axis=0).astype(np.uint8)
            else:
                continue

        # Paint the component with sampled color
        cleaned[component > 0] = fill_color
        components_cleaned += 1

    # --- Fix 2: Destroy ghost outlines ---

    # Step 1: Heavy 31x31 Gaussian blur on cleaned regions only
    blurred = cv2.GaussianBlur(cleaned, (31, 31), 0)
    result = np.where(
        clean_mask[:, :, np.newaxis] > 0,
        blurred,
        cleaned,
    ).astype(np.uint8)

    # Step 2: Add mild noise (sigma=8) to cleaned regions to destroy residual edges
    noise = np.random.normal(0, 8, result.shape).astype(np.float32)
    noisy = np.clip(result.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    result = np.where(
        clean_mask[:, :, np.newaxis] > 0,
        noisy,
        result,
    ).astype(np.uint8)

    print(f"[clean_input] Cleaned {components_cleaned} components "
          f"({clean_pixel_count} pixels, {clean_pixel_count / (h * w):.1%}) "
          f"with compass sampling + blur + noise")

    return result


# ---------------------------------------------------------------------------
# Remove mask — simplified for v7 (no composite, no soft_alpha)
# ---------------------------------------------------------------------------

# Fill Pro dilation — gives the model room to generate natural contact shadows
# v9: increased from 12 to 32 (+20px) to destroy ghost outline edges
FILL_PRO_DILATION_PX = 32


def build_remove_mask(
    instance_masks: list,
    architecture_mask: np.ndarray,
    image_hw: tuple,
    instance_labels: list = None,
) -> tuple:
    """
    Builds combined remove mask from individual instance masks.
    v7 simplified: returns (hard_mask, dilated_mask) only.
    No soft_alpha, no strength_map — composite is gone.

    Args:
        instance_masks: list of np.ndarray (grayscale, white=furniture)
        architecture_mask: binary mask (white=architecture)
        image_hw: (height, width) of the source image
        instance_labels: optional list of label strings for class-aware dilation.

    Returns:
        (hard_mask, dilated_mask):
            hard_mask:      uint8 0/255, union of all instance masks with arch zeroed
            dilated_mask:   uint8 0/255, 12px elliptical dilation for Fill Pro
    """
    h, w = image_hw
    long_edge = max(h, w)

    if not instance_masks:
        print("[mask_build] No instance masks — returning empty masks")
        empty = np.zeros((h, w), dtype=np.uint8)
        return empty, empty.copy()

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
            dil_px = 3
        if dil_px > 0:
            k_size = dil_px * 2 + 1
            k_dil = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_size, k_size))
            m = cv2.dilate(m, k_dil, iterations=1)

        union = np.maximum(union, m)

    # Zero out architecture pixels — they must NEVER be in the regenerate mask
    union = np.where(architecture_mask > 0, 0, union).astype(np.uint8)

    hard_mask = union

    # Dilated mask for Fill Pro input (12px elliptical dilation)
    dil_size = FILL_PRO_DILATION_PX * 2 + 1
    ellipse_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dil_size, dil_size))
    dilated_mask = cv2.dilate(hard_mask, ellipse_kernel, iterations=1)
    # Zero architecture from dilated mask too
    dilated_mask = np.where(architecture_mask > 0, 0, dilated_mask).astype(np.uint8)

    mask_coverage = np.count_nonzero(hard_mask > 0) / (h * w)
    dilated_coverage = np.count_nonzero(dilated_mask > 0) / (h * w)
    print(f"[mask_build] Remove mask: {mask_coverage:.1%} coverage, "
          f"dilated: {dilated_coverage:.1%}")

    return hard_mask, dilated_mask


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
