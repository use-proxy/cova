"""
Cova v4b — Phase 4b Generation: Two-Stage Selective Architecture

Two routes based on keep/remove decisions:

ROUTE A — Items removed (remove_count > 0): TWO-STAGE
  Stage 1: fal-ai/flux-pro/v1/fill — NEUTRAL removal only.
    Input: original_photo + combined_furniture_mask + neutral prompt
    Output: clean room with removed items erased, floor/walls revealed
    Price: $0.05/MP
  Stage 2: fal-ai/flux-pro/kontext — Full style redesign.
    Input: stage1 clean room + kontext_prompt (full style)
    Output: fully redesigned room
    Price: $0.04/image

ROUTE B — No removals (style transfer only):
  fal-ai/flux-pro/kontext (FLUX Kontext Pro)
  Input: professionalized_photo + kontext_prompt
  Output: restyled room (Kontext preserves structure implicitly)
  Price: $0.04/image

Entry point: generate_redesign_phase4b()

On completion:
  - Updates rooms.redesign_pano_url and rooms.redesign_status = "complete"

On any exception:
  - Sets rooms.redesign_status = "failed"
  - Re-raises so the caller knows it failed
"""

import io
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
    # Cache bust: 2026-04-16-phase6-7
    .pip_install(
        "fal-client",
        "supabase",
        "requests",
        "Pillow",
        "numpy",
        "opencv-python-headless",
    )
    .add_local_file("modal_pipeline/utils.py", "/root/utils.py")
)

# Aesthetic scorer image — heavier deps (torch, CLIP)
aesthetic_image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "torch",
        "torchvision",
        "clip-anytorch",
        "requests",
        "Pillow",
        "numpy",
        "huggingface_hub",
    )
    .add_local_file("modal_pipeline/utils.py", "/root/utils.py")
)

app = modal.App("cova-generation")

STORAGE_BUCKET = "room-photos"

# Default ceiling/floor fractions — ONLY used as fallback when pre_detection
# bounding boxes are not available. Dynamic bbox-based values preferred.
CEILING_FRAC_DEFAULT = 0.06
FLOOR_START_FRAC_DEFAULT = 0.80
# Feather kernel for item mask blending (3px gaussian on 7x7)
FEATHER_KSIZE = 7
FEATHER_SIGMA = 3

# Area threshold: if a mask covers more than this % of total image pixels,
# do NOT composite it back — let the generation handle it.
# 15% is conservative: large furniture is ~20-30%, small fixtures ~3-5%,
# thin items ~2-4%, medium fixtures ~8-12%
AREA_THRESHOLD_PCT = 0.15

# Stage 1 neutral fill prompt — same for every room type, every render.
# Describes only what Fill Pro should do in the masked region.
NEUTRAL_FILL_PROMPT = (
    "Remove the furniture in the masked region completely. "
    "Replace with the floor material and wall surface that would "
    "exist behind it, matching the exact color, texture, and "
    "material of the immediately surrounding floor and wall pixels. "
    "No new furniture. No new objects. Seamless photorealistic fill. "
    "The result should look like the furniture was never there."
)


# ---------------------------------------------------------------------------
# Import shared utilities — defined once in utils.py, imported everywhere.
# The add_local_file above ensures utils.py is available in the Modal container.
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _download_bytes(url: str) -> bytes:
    import requests
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return resp.content


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

    # room-photos bucket is public — construct public URL directly
    # No signing needed, no token expiry issues
    public_url = f"{supabase_url}/storage/v1/object/public/{STORAGE_BUCKET}/{path}"
    return public_url


# ---------------------------------------------------------------------------
# Phase 6 — LAION Aesthetic V2.5 scorer (GPU, separate image)
# ---------------------------------------------------------------------------

@app.function(
    image=aesthetic_image,
    gpu="A10G",
    timeout=120,
)
def score_aesthetic(image_url: str) -> float:
    """
    Scores image using LAION Aesthetic V2.5 (CLIP ViT-L/14 + linear head).
    Returns score 0-10. Reject below 5.0. Target above 6.0 for good renders.
    """
    import torch
    import clip
    import numpy as np
    import requests
    from io import BytesIO
    from PIL import Image
    from huggingface_hub import hf_hub_download

    device = "cuda" if torch.cuda.is_available() else "cpu"

    # Load CLIP ViT-L/14
    model, preprocess = clip.load("ViT-L/14", device=device)

    # Download image
    response = requests.get(image_url, timeout=30)
    response.raise_for_status()
    img = Image.open(BytesIO(response.content)).convert("RGB")
    img_tensor = preprocess(img).unsqueeze(0).to(device)

    with torch.no_grad():
        image_features = model.encode_image(img_tensor)
        image_features /= image_features.norm(dim=-1, keepdim=True)

    # Load LAION aesthetic predictor V2.5 (MLP head)
    # Download directly — HF repo may be gated
    import os as _os
    weights_path = "/tmp/sac+logos+ava1-l14-linearMSE.pth"
    if not _os.path.exists(weights_path):
        import urllib.request
        urllib.request.urlretrieve(
            "https://github.com/christophschuhmann/improved-aesthetic-predictor/raw/main/sac+logos+ava1-l14-linearMSE.pth",
            weights_path,
        )
    state_dict = torch.load(weights_path, map_location=device)

    # MLP head architecture: 768 → 1024 → 128 → 64 → 16 → 1
    # State dict uses "layers.N" prefix — strip to match Sequential keys
    cleaned_state_dict = {k.replace("layers.", ""): v for k, v in state_dict.items()}
    mlp = torch.nn.Sequential(
        torch.nn.Linear(768, 1024),
        torch.nn.Dropout(0.2),
        torch.nn.Linear(1024, 128),
        torch.nn.Dropout(0.2),
        torch.nn.Linear(128, 64),
        torch.nn.Dropout(0.1),
        torch.nn.Linear(64, 16),
        torch.nn.Linear(16, 1),
    ).to(device)
    mlp.load_state_dict(cleaned_state_dict)
    mlp.eval()

    with torch.no_grad():
        score = mlp(image_features.float())

    return float(score.squeeze().cpu())


def score_and_select(candidates: list, prompt: str) -> dict:
    """
    Score all candidates with LAION Aesthetic V2.5 and return the best.
    Runs scoring in parallel via Modal .map().
    """
    if len(candidates) == 1:
        # Single candidate — score it but always return it
        try:
            score = score_aesthetic.remote(candidates[0]["url"])
            print(f"[aesthetic] Single candidate seed={candidates[0]['seed']} score={score:.2f}")
        except Exception as e:
            print(f"[aesthetic] Scoring failed: {e}")
            score = 0.0
        candidates[0]["aesthetic_score"] = score
        candidates[0]["all_scores"] = [{"seed": candidates[0]["seed"], "score": score}]
        return candidates[0]

    scores = []
    for c in candidates:
        try:
            score = score_aesthetic.remote(c["url"])
            scores.append((c, score))
            print(f"[aesthetic] Candidate seed={c['seed']} score={score:.2f}")
        except Exception as e:
            print(f"[aesthetic] Scoring failed for seed={c['seed']}: {e}")
            scores.append((c, 0.0))

    # Filter below minimum threshold
    valid = [(c, s) for c, s in scores if s >= 5.0]
    if not valid:
        print("[aesthetic] All candidates below threshold — using best available")
        valid = scores

    # Return highest scoring
    best_candidate, best_score = max(valid, key=lambda x: x[1])
    print(f"[aesthetic] Selected seed={best_candidate['seed']} score={best_score:.2f}")

    best_candidate["aesthetic_score"] = best_score
    best_candidate["all_scores"] = [
        {"seed": c["seed"], "score": s} for c, s in scores
    ]
    return best_candidate


# ---------------------------------------------------------------------------
# Phase 7 — Post-processing visual signature
# ---------------------------------------------------------------------------

def apply_visual_signature(image_array):
    """
    Applies Cova visual signature post-processing.
    Input: composite image as numpy array (BGR, from cv2)
    Output: processed image as numpy array (BGR)
    Universal — applies to any room type, any render.
    Steps must run in exact order.

    Order: white balance → CLAHE → teal-orange grade → vignette → grain → CA
    """
    import cv2
    import numpy as np

    # All parameters as module-level constants for easy tuning
    WB_A_SHIFT = 3       # LAB a channel warm shift
    WB_B_SHIFT = 5       # LAB b channel warm shift
    CLAHE_CLIP = 2.0     # CLAHE clip limit
    CLAHE_GRID = (8, 8)  # CLAHE tile grid
    GRADE_SHADOW_A = -3  # Teal in shadows (LAB a)
    GRADE_SHADOW_B = 3   # Teal in shadows (LAB b)
    GRADE_HIGH_A = 2     # Warm in highlights (LAB a)
    GRADE_HIGH_B = 5     # Warm in highlights (LAB b)
    SHADOW_THRESHOLD = 85
    HIGHLIGHT_THRESHOLD = 170
    VIGNETTE_STRENGTH = 0.15
    GRAIN_INTENSITY = 0.025
    CA_SHIFT_PX = 1      # Chromatic aberration shift in pixels

    img = image_array.copy()
    h, w = img.shape[:2]

    # STEP 1 — White balance correction (LAB space) — warm shift
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    a = np.clip(a.astype(np.int16) + WB_A_SHIFT, 0, 255).astype(np.uint8)
    b = np.clip(b.astype(np.int16) + WB_B_SHIFT, 0, 255).astype(np.uint8)
    img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    # STEP 2 — CLAHE micro-contrast on L channel only (adaptive clip)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l_std = float(np.std(l))
    clip = CLAHE_CLIP if l_std < 60 else 1.5  # reduce if already high contrast
    clahe = cv2.createCLAHE(clipLimit=clip, tileGridSize=CLAHE_GRID)
    l = clahe.apply(l)
    img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    # STEP 3 — Teal-orange LAB grade (shadows → teal, highlights → warm)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    shadow_mask = (l < SHADOW_THRESHOLD).astype(np.float32)
    highlight_mask = (l > HIGHLIGHT_THRESHOLD).astype(np.float32)
    a = np.clip(
        a.astype(np.int16)
        + (shadow_mask * GRADE_SHADOW_A).astype(np.int16)
        + (highlight_mask * GRADE_HIGH_A).astype(np.int16),
        0, 255
    ).astype(np.uint8)
    b = np.clip(
        b.astype(np.int16)
        + (shadow_mask * GRADE_SHADOW_B).astype(np.int16)
        + (highlight_mask * GRADE_HIGH_B).astype(np.int16),
        0, 255
    ).astype(np.uint8)
    img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    # STEP 4 — Elliptical vignette (aspect-ratio correct)
    sigma_x = w * 0.7
    sigma_y = h * 0.6  # tighter vertically = more natural for interior photos
    kernel_x = cv2.getGaussianKernel(w, sigma_x)
    kernel_y = cv2.getGaussianKernel(h, sigma_y)
    vignette_mask = (kernel_y * kernel_x.T)
    vignette_mask = vignette_mask / vignette_mask.max()
    vignette = 1 - VIGNETTE_STRENGTH * (1 - vignette_mask)
    for c in range(3):
        img[:, :, c] = np.clip(
            img[:, :, c] * vignette, 0, 255
        ).astype(np.uint8)

    # STEP 5 — Shadow-weighted film grain
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    # Grain stronger in shadows, weaker in highlights (matches real film behavior)
    grain_weight = 1.0 - (l.astype(np.float32) / 255.0) * 0.7
    noise = np.random.normal(0, GRAIN_INTENSITY * 255, l.shape)
    l = np.clip(
        l.astype(np.float32) + noise * grain_weight, 0, 255
    ).astype(np.uint8)
    img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    # STEP 6 — Chromatic aberration (1px shift, R channel only)
    b_ch, g_ch, r_ch = cv2.split(img)
    M = np.float32([[1, 0, CA_SHIFT_PX], [0, 1, 0]])
    r_ch = cv2.warpAffine(r_ch, M, (w, h))
    img = cv2.merge([b_ch, g_ch, r_ch])

    return img


# ---------------------------------------------------------------------------
# Post-generation pixel composite — fixes floor/ceiling/kept-item preservation
# ---------------------------------------------------------------------------

def _get_structural_bbox(detected_items: list, label_category: str) -> dict:
    """
    Returns estimated_bbox_pct from detected items for a given category.
    Falls back to None if not found.
    Works for any room type — reads from actual detection.
    """
    for item in detected_items:
        if normalize_label_key(item.get("category", "")) == label_category:
            bbox = item.get("estimated_bbox_pct")
            if bbox and isinstance(bbox, dict):
                return bbox
        if normalize_label_key(item.get("label", "")) == label_category:
            bbox = item.get("estimated_bbox_pct")
            if bbox and isinstance(bbox, dict):
                return bbox
    return None


def composite_structural_pixels(
    original_photo_url: str,
    generated_image_url: str,
    render_context: dict,
    wall_change_requested: bool,
    floor_change_requested: bool,
    room_id: str,
    supabase_url: str,
    supabase_key: str,
) -> str:
    """
    Composites original pixels back onto the generated image for regions
    that the generation model damages. Returns URL of the composited image
    uploaded to Supabase Storage.

    Ceiling/floor regions are derived from detected bounding boxes when
    available, falling back to default fractions only if detection is missing.

    Decision logic is purely AREA-BASED — no hardcoded category names:
      1. Ceiling strip — always composited (bbox-driven or default 6%)
      2. Floor strip — only when floor not changing (bbox-driven or default 80%)
      3. Item masks — composited back ONLY if:
         a) User did NOT mark it "remove", AND
         b) Mask area is BELOW AREA_THRESHOLD_PCT of total pixels
         Large items always exceed the threshold and are left to the
         generation model.
    """
    import cv2
    import numpy as np
    import requests
    import time as _time
    from PIL import Image

    print(f"[composite] Starting pixel composite for room {room_id}")
    print(f"[composite] floor_change={floor_change_requested}")
    print(f"[composite] area_threshold={AREA_THRESHOLD_PCT:.0%}")

    # Download both images
    try:
        orig_bytes = requests.get(original_photo_url, timeout=60).content
        orig_arr = np.array(Image.open(io.BytesIO(orig_bytes)).convert("RGB"))
    except Exception as e:
        print(f"[composite] Failed to download original photo — skipping composite: {e}")
        return generated_image_url

    try:
        gen_bytes = requests.get(generated_image_url, timeout=60).content
        gen_arr = np.array(Image.open(io.BytesIO(gen_bytes)).convert("RGB"))
    except Exception as e:
        print(f"[composite] Failed to download generated image — skipping composite: {e}")
        return generated_image_url

    # Resize generated to match original if needed
    if gen_arr.shape[:2] != orig_arr.shape[:2]:
        print(f"[composite] Resizing generated {gen_arr.shape[:2]} → {orig_arr.shape[:2]}")
        gen_arr = cv2.resize(gen_arr, (orig_arr.shape[1], orig_arr.shape[0]), interpolation=cv2.INTER_LANCZOS4)

    composite = gen_arr.copy()
    h, w = orig_arr.shape[:2]
    total_pixels = h * w
    area_threshold = total_pixels * AREA_THRESHOLD_PCT

    # ── Derive ceiling/floor regions from detected bounding boxes ──────────
    detected_items = render_context.get("detected_items") or []

    ceiling_bbox = _get_structural_bbox(detected_items, "ceiling")
    if ceiling_bbox:
        ceiling_end = ceiling_bbox.get("y", 0) + ceiling_bbox.get("h", 0.06)
        ceiling_frac = min(ceiling_end, 0.12)  # cap at 12%
        print(f"[composite] Ceiling bbox detected: y={ceiling_bbox.get('y'):.2f} h={ceiling_bbox.get('h'):.2f} → frac={ceiling_frac:.2f}")
    else:
        ceiling_frac = CEILING_FRAC_DEFAULT
        print(f"[composite] No ceiling bbox — using default {ceiling_frac:.0%}")

    floor_bbox = _get_structural_bbox(detected_items, "floor")
    if floor_bbox:
        floor_start_frac = max(floor_bbox.get("y", 0.80), 0.72)  # floor at min 72%
        print(f"[composite] Floor bbox detected: y={floor_bbox.get('y'):.2f} h={floor_bbox.get('h'):.2f} → start_frac={floor_start_frac:.2f}")
    else:
        floor_start_frac = FLOOR_START_FRAC_DEFAULT
        print(f"[composite] No floor bbox — using default {floor_start_frac:.0%}")

    # STEP 1 — Ceiling strip: hard paste + cosine S-curve feathered seam
    ceiling_h = int(h * ceiling_frac)
    seam_h = 20
    # Hard paste original ceiling pixels (above the seam zone)
    hard_ceiling = max(0, ceiling_h - seam_h)
    if hard_ceiling > 0:
        composite[:hard_ceiling, :, :] = orig_arr[:hard_ceiling, :, :]
    # Cosine S-curve feather for the seam zone (smoother than linear)
    seam_start = hard_ceiling
    actual_seam = min(seam_h, ceiling_h)
    if actual_seam > 0:
        t = np.linspace(0, np.pi, actual_seam)
        gradient = (1 - np.cos(t)) / 2  # S-curve: 0→1 smoothly
        for i in range(actual_seam):
            alpha = gradient[i]  # 0=original at top, 1=generated at bottom
            composite[seam_start + i, :, :] = (
                orig_arr[seam_start + i, :, :] * (1 - alpha) +
                gen_arr[seam_start + i, :, :] * alpha
            ).astype(np.uint8)
    print(f"[composite] Ceiling composite: top {ceiling_h}px with {actual_seam}px cosine seam")

    # STEP 2 — Floor strip: hard paste + cosine S-curve feathered seam
    if not floor_change_requested:
        floor_start = int(h * floor_start_frac)
        seam_h_floor = 20
        # Hard paste original floor pixels (below the seam zone)
        hard_floor_start = floor_start + seam_h_floor
        if hard_floor_start < h:
            composite[hard_floor_start:, :, :] = orig_arr[hard_floor_start:, :, :]
        # Cosine S-curve feather for the seam zone
        actual_seam_floor = min(seam_h_floor, h - floor_start)
        if actual_seam_floor > 0:
            t = np.linspace(0, np.pi, actual_seam_floor)
            gradient = (1 - np.cos(t)) / 2  # S-curve: 0→1 smoothly
            for i in range(actual_seam_floor):
                alpha = gradient[i]  # 0→keep generated, 1→use original
                row = floor_start + i
                composite[row, :, :] = (
                    gen_arr[row, :, :] * (1 - alpha) +
                    orig_arr[row, :, :] * alpha
                ).astype(np.uint8)
        print(f"[composite] Floor composite: bottom {h - floor_start}px with {actual_seam_floor}px cosine seam")

    # STEP 3 — Item masks: composite back only SMALL items
    # No wall composite — walls are large surfaces handled by generation model.
    norm_decisions = normalize_decisions(render_context.get("keep_remove_decisions", {}))

    item_masks = render_context.get("itemMasks") or {}
    detected_items = render_context.get("detected_items") or []
    composited_items = 0
    mask_areas = {}

    for label, mask_url in item_masks.items():
        if not mask_url or not mask_url.startswith("https://"):
            continue

        norm_label = normalize_label_key(label)
        decision = norm_decisions.get(norm_label, "keep")

        # Never composite back items user marked remove
        if decision == "remove":
            print(f"[composite] Skipping '{norm_label}': user marked remove")
            continue

        # Download mask and measure its area
        try:
            mask_bytes = requests.get(mask_url, timeout=30).content
            item_mask = np.array(Image.open(io.BytesIO(mask_bytes)).convert("L"))
            if item_mask.shape[:2] != (h, w):
                item_mask = cv2.resize(item_mask, (w, h))
        except Exception as e:
            print(f"[composite] Could not download mask for '{norm_label}': {e}")
            continue

        # Polarity check: if >80% white, likely inverted
        white_ratio = np.count_nonzero(item_mask > 128) / item_mask.size
        if white_ratio > 0.80:
            item_mask = cv2.bitwise_not(item_mask)

        # Measure how much of the image this mask covers
        mask_area = np.count_nonzero(item_mask > 128)
        mask_areas[norm_label] = mask_area

        if mask_area > area_threshold:
            # Large item — skip compositing, let generation handle it
            print(f"[composite] Skipping '{norm_label}': "
                  f"area {mask_area / total_pixels:.1%} > threshold {AREA_THRESHOLD_PCT:.0%}")
            continue

        # Small item — composite back with feathered edges
        print(f"[composite] Compositing '{norm_label}': area {mask_area / total_pixels:.1%}")

        item_mask_f = cv2.GaussianBlur(
            item_mask.astype(np.float32), (FEATHER_KSIZE, FEATHER_KSIZE), sigmaX=FEATHER_SIGMA
        )
        item_mask_f = item_mask_f / 255.0

        for c in range(3):
            composite[:, :, c] = (
                orig_arr[:, :, c] * item_mask_f +
                composite[:, :, c] * (1.0 - item_mask_f)
            ).astype(np.uint8)

        composited_items += 1

    # Summary log: all mask areas for threshold tuning
    if mask_areas:
        print(f"[composite] Mask areas: " + ", ".join([
            f"{label}={area / total_pixels:.1%}"
            for label, area in mask_areas.items()
        ]))
    print(f"[composite] {composited_items} items composited back from original")

    # Upload composited result
    composite_pil = Image.fromarray(composite)
    buf = io.BytesIO()
    composite_pil.save(buf, format="JPEG", quality=95)
    composite_bytes = buf.getvalue()

    path = f"renders/{room_id}/composite_{int(_time.time())}.jpg"
    try:
        composite_url = _upload_to_supabase(composite_bytes, path, supabase_url, supabase_key)
        print(f"[composite] Uploaded: {composite_url[:80]}...")
        return composite_url
    except Exception as e:
        print(f"[composite] Upload failed — returning raw generated URL: {e}")
        return generated_image_url


# ---------------------------------------------------------------------------
# Combined remove mask builder
# ---------------------------------------------------------------------------

def build_combined_remove_mask(
    item_masks: dict,
    keep_remove_decisions: dict,
    detected_items: list,
    room_id: str,
    supabase_url: str,
    supabase_key: str,
) -> Optional[str]:
    """
    Union all masks for user-REMOVE items, excluding HARD_STRUCTURAL.
    Returns uploaded mask URL or None if no removals.

    User decisions are THE LAW — never overridden:
      - HARD_STRUCTURAL items: never shown to user, never inpainted
      - Everything else: user said keep → keep, user said remove → remove
      - Items with no decision default to 'keep' (Fix A)

    Mask polarity (Fix E):
      SAM2 masks: white (255) = furniture region, black (0) = background
      Fill Pro expects: white = INPAINT THIS, black = KEEP THIS
      Polarity matches — no inversion needed. If a SAM2 mask is inverted
      (white=background), apply cv2.bitwise_not() BEFORE adding to union.

    Thin structure dilation (rendering quality concern, NOT preservation override):
      Items in THIN_STRUCTURE_CATEGORIES get 8px dilation instead of 17px
      when building preserve exclusion masks. This preserves fan blade detail,
      garland strings, letter strokes, etc. User decisions still take precedence.
    """
    import cv2
    import numpy as np
    import requests
    from PIL import Image

    # Defensive normalization — handles both list and dict formats
    keep_remove_decisions = normalize_decisions(keep_remove_decisions)

    if not item_masks or not keep_remove_decisions:
        print("[mask_union] No item_masks or keep_remove_decisions — returning None")
        return None

    # Normalize keys for matching
    norm_masks = {normalize_label_key(k): v for k, v in item_masks.items()}
    norm_decisions = {normalize_label_key(k): v for k, v in keep_remove_decisions.items()}

    # Collect remove/keep/preserve sets based on user decisions + structural rules
    remove_keys = []
    keep_keys = []
    for label_key in norm_masks:
        category = get_category_for_label(label_key, detected_items or [])

        if category in HARD_STRUCTURAL:
            # Hard structural — never shown to user, always preserved
            continue

        # User decision is law. Default to 'keep' if no decision recorded (Fix A).
        decision = norm_decisions.get(label_key, "keep")

        if decision == "remove":
            remove_keys.append(label_key)
        else:
            # 'keep' or any other value → preserve
            keep_keys.append(label_key)

    if not remove_keys:
        print("[mask_union] No remove decisions for non-structural items — returning None (Kontext route)")
        return None

    print(f"[mask_union] Building combined mask for {len(remove_keys)} removed items: {remove_keys}")
    if keep_keys:
        print(f"[mask_union] Preserving {len(keep_keys)} kept items: {keep_keys}")

    # ── Step 1: Union all remove masks ──────────────────────────────────────
    combined_mask = None
    mask_count = 0

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

            # Polarity check (Fix E): SAM2 masks should be white=furniture.
            # If mask is mostly white (>80% white pixels), it's likely inverted.
            white_ratio = np.count_nonzero(mask_arr > 128) / mask_arr.size
            if white_ratio > 0.80:
                print(f"[mask_union] WARNING: mask for '{key}' is {white_ratio:.0%} white — likely inverted, applying bitwise_not")
                mask_arr = cv2.bitwise_not(mask_arr)

            if combined_mask is None:
                combined_mask = mask_arr.copy()
            else:
                if mask_arr.shape != combined_mask.shape:
                    mask_arr = cv2.resize(mask_arr, (combined_mask.shape[1], combined_mask.shape[0]))
                combined_mask = cv2.bitwise_or(combined_mask, mask_arr)

            mask_count += 1
            print(f"[mask_union] Added mask for '{key}': {mask_url[:60]}...")
        except Exception as e:
            print(f"[mask_union] Failed to download/process mask for '{key}': {e}")
            continue

    if combined_mask is None or mask_count == 0:
        print("[mask_union] No valid masks downloaded — returning None")
        return None

    # ── Step 2: Exclude kept items from remove mask ─────────────────────────
    for key in keep_keys:
        mask_url = norm_masks.get(key)
        if not mask_url or not mask_url.startswith("https://"):
            continue
        try:
            resp = requests.get(mask_url, timeout=30)
            resp.raise_for_status()
            keep_img = Image.open(io.BytesIO(resp.content)).convert("L")
            keep_arr = np.array(keep_img, dtype=np.uint8)
            if keep_arr.shape != combined_mask.shape:
                keep_arr = cv2.resize(keep_arr, (combined_mask.shape[1], combined_mask.shape[0]))

            # Category-appropriate dilation for preserve exclusion mask
            # Thin structures get tighter dilation to preserve edge quality
            category = get_category_for_label(key, detected_items or [])
            dil_px = THIN_DILATION_PX if category in THIN_STRUCTURE_CATEGORIES else DEFAULT_DILATION_PX
            kern_size = dil_px * 2 - 1
            keep_kernel = np.ones((kern_size, kern_size), np.uint8)
            keep_dilated = cv2.dilate(keep_arr, keep_kernel, iterations=1)

            # Where kept item is white → force combined mask to black (preserve)
            combined_mask[keep_dilated > 128] = 0
            print(f"[mask_union] Excluded kept item '{key}' (category={category}, dilation={dil_px}px)")
        except Exception as e:
            print(f"[mask_union] Failed to exclude kept item '{key}': {e}")

    # ── Step 3a: Fill holes in the mask ──────────────────────────────────────
    # Prevents generation from leaving original pixels visible through holes,
    # which creates ghosting artifacts in the output.
    kernel_close = np.ones((15, 15), np.uint8)
    combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_CLOSE, kernel_close)
    print(f"[mask_union] Hole-filling (MORPH_CLOSE 15x15) applied")

    # ── Step 3b: Dilate remove mask edges ────────────────────────────────────
    kernel = np.ones((DEFAULT_DILATION_PX * 2 - 1, DEFAULT_DILATION_PX * 2 - 1), np.uint8)
    combined_mask = cv2.dilate(combined_mask, kernel, iterations=1)
    print(f"[mask_union] Dilation ({DEFAULT_DILATION_PX}px) applied to remove mask")

    # ── Step 4: Gaussian feather ────────────────────────────────────────────
    combined_mask = cv2.GaussianBlur(combined_mask, (31, 31), 15)
    print(f"[mask_union] Gaussian feather (sigma=15) applied")

    # ── Step 5: Upload ──────────────────────────────────────────────────────
    mask_pil = Image.fromarray(combined_mask, mode="L")
    buf = io.BytesIO()
    mask_pil.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    path = f"masks/{room_id}/combined_remove_mask.png"
    try:
        mask_url = _upload_to_supabase(png_bytes, path, supabase_url, supabase_key)
        print(f"[mask_union] Uploaded combined mask: {mask_url[:80]}...")
        return mask_url
    except Exception as up_err:
        print(f"[mask_union] Upload failed: {up_err}")
        return None


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def build_kontext_prompt(
    style_prompt: str,
    render_context: dict,
    wall_change_requested: bool = False,
    floor_change_requested: bool = False,
) -> str:
    """
    Dynamically build a Kontext-optimized imperative prompt from render_context.

    All item lists are derived from render_context for THIS room — nothing hardcoded.
    User decisions are law — no silent overrides.
    """
    detected_items = render_context.get("detected_items", [])
    decisions = normalize_decisions(render_context.get("keep_remove_decisions", {}))
    norm_decisions = {normalize_label_key(k): v for k, v in decisions.items()}

    # Remove list: user said remove AND not hard structural
    remove_items = []
    for item in detected_items:
        label = normalize_label_key(item.get("label", ""))
        display = item.get("display_name", label.replace("_", " "))
        category = normalize_label_key(item.get("category", ""))
        if norm_decisions.get(label) == "remove" and category not in HARD_STRUCTURAL:
            remove_items.append(display)
    # Also check decisions for items not in detected_items
    detected_labels = {normalize_label_key(i.get("label", "")) for i in detected_items}
    for k, v in norm_decisions.items():
        if v == "remove" and k not in detected_labels:
            cat = get_category_for_label(k, detected_items)
            if cat not in HARD_STRUCTURAL:
                remove_items.append(k.replace("_", " "))

    # Keep list: hard structural present in room + user-kept items
    structural_present = []
    user_kept = []
    for item in detected_items:
        label = normalize_label_key(item.get("label", ""))
        display = item.get("display_name", label.replace("_", " "))
        category = normalize_label_key(item.get("category", ""))
        if category in HARD_STRUCTURAL:
            structural_present.append(display)
        elif norm_decisions.get(label, "keep") == "keep":
            # Default to 'keep' if no decision recorded (Fix A)
            user_kept.append(display)
    # Also check decisions for kept items not in detected_items
    for k, v in norm_decisions.items():
        if v == "keep" and k not in detected_labels:
            user_kept.append(k.replace("_", " "))

    # Wall/floor language
    wall_lang = (
        "walls with smooth painted finish exactly unchanged"
        if not wall_change_requested
        else "walls repainted to complement new style, smooth painted finish"
    )
    floor_lang = (
        "floor exactly unchanged"
        if not floor_change_requested
        else "floor updated to complement new style"
    )

    # Build prompt
    remove_clause = f"Remove {', '.join(remove_items)}. " if remove_items else ""

    preserve_all = structural_present + user_kept
    keep_clause = (
        f"Keep {', '.join(preserve_all)}, {wall_lang}, {floor_lang} exactly. "
        if preserve_all
        else f"Keep {wall_lang}, {floor_lang} exactly. "
    )

    # Style direction from compiled prompt (strip existing remove/keep/preserve)
    style_cleaned = style_prompt
    for prefix in ["Remove ", "Keep ", "Preserve "]:
        while prefix in style_cleaned:
            idx = style_cleaned.find(prefix)
            end = style_cleaned.find(".", idx)
            if end == -1:
                end = len(style_cleaned)
            style_cleaned = style_cleaned[:idx] + style_cleaned[end + 1:]
    style_cleaned = style_cleaned.strip()

    # ── Filter sentences that describe kept items as new furniture ──────────
    # Items in keepItems must NEVER appear in the furniture description body.
    # They are named once in the keep clause and never again. If Kontext sees
    # the same item in both keep clause AND furniture spec, it treats it as
    # both preserved and redesigned — causing the model to re-render the
    # kept item's surface instead of preserving it.
    kept_labels = set(
        normalize_label_key(k) for k, v in norm_decisions.items() if v != "remove"
    )
    if kept_labels and style_cleaned:
        import re as _re
        sentences = _re.split(r'(?<=[.!?])\s+', style_cleaned)
        filtered_sentences = []
        for sentence in sentences:
            sentence_lower = sentence.lower()
            mentions_kept = any(
                normalize_label_key(label) in sentence_lower
                or any(
                    word in sentence_lower
                    for word in label.lower().split("_")
                    if len(word) > 3  # skip short words like "of", "the"
                )
                for label in kept_labels
            )
            if mentions_kept:
                print(f"[kontext_prompt] Filtered kept-item sentence: '{sentence[:60]}...'")
            else:
                filtered_sentences.append(sentence)
        style_cleaned = ' '.join(filtered_sentences)

    # Truncate style body to MAX_BODY_WORDS so total prompt stays in
    # Kontext optimal range (120-200 words). Remove/keep clauses add ~35-40
    # words on top, plus quality_suffix adds ~25 words.
    MAX_BODY_WORDS = 165
    body_words = style_cleaned.split()
    if len(body_words) > MAX_BODY_WORDS:
        truncated = ' '.join(body_words[:MAX_BODY_WORDS])
        last_period = truncated.rfind('.')
        if last_period > len(truncated) * 0.7:
            style_cleaned = truncated[:last_period + 1]
        else:
            style_cleaned = truncated
        print(f"[kontext_prompt] Prompt body truncated from {len(body_words)} to "
              f"{len(style_cleaned.split())} words")

    # Strip duplicate photography spec from Design Director output
    # (DD appends "Shot at eye level..." or "Shot on Hasselblad..." — we append our own)
    import re as _re_photo
    style_cleaned = _re_photo.sub(
        r'Shot (?:at eye level|on Hasselblad)[^.]*\.?\s*', '', style_cleaned
    ).strip()

    quality_suffix = (
        "Shot on Hasselblad X2D 100C, 24mm tilt-shift at f/8, "
        "perfect exposure, professional architectural photography, "
        "Architectural Digest quality, no people, no text."
    )

    prompt = remove_clause + keep_clause + (style_cleaned + " " if style_cleaned else "") + quality_suffix
    word_count = len(prompt.split())
    if word_count < 80:
        print(f"[kontext_prompt] WARNING: prompt too short ({word_count} words) — may lack specificity")
    if word_count > 210:
        print(f"[kontext_prompt] WARNING: prompt too long ({word_count} words) — truncating to preserve coherence")
        # Keep removal + preservation clauses, truncate style content
        words = prompt.split()
        prompt = " ".join(words[:210])
        # Ensure photography spec is at the end
        if "hasselblad" not in prompt.lower():
            prompt += (" Shot on Hasselblad X2D 100C, 24mm tilt-shift at f/8, "
                       "perfect exposure, professional architectural photography, "
                       "Architectural Digest quality, no people, no text.")
    print(f"[kontext_prompt] Built ({len(prompt.split())} words): {prompt[:120]}...")
    return prompt


def build_fill_prompt(style_prompt: str, removed_items: list, kept_items: list = None) -> str:
    """
    Fill Pro prompt describes replacement content for the masked region only.
    Only describes what goes INTO the masked region (removed items).
    Never describes items in the keep list (Fix D).

    style_prompt comes from Design Director which already knows the user's style
    fingerprint, room constraints, and what was removed — so we enrich, not overwrite.
    """
    # Strip preservation instructions — Fill Pro doesn't need them
    style_cleaned = style_prompt
    for keyword in ["Keep ", "Preserve ", "unchanged", "exactly"]:
        lines = style_cleaned.split(".")
        lines = [l for l in lines if keyword not in l]
        style_cleaned = ".".join(lines)

    # Also strip any sentences mentioning kept items (Fix D + kept-item exclusion)
    # Items in keepItems must NEVER appear in the furniture description body.
    # They are named once in the keep clause and never again.
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

    removed_str = ", ".join([r.replace("_", " ") for r in removed_items])

    parts = []
    parts.append(f"Replace {removed_str} with new furniture.")

    if style_cleaned:
        parts.append(style_cleaned)

    # Generic richness guidance — applies to all room types
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
# Main generation function — Phase 4b
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
) -> dict:
    """
    Phase 4b generation: two-stage selective architecture.

    ROUTE A (Fill Pro → Kontext): When items are marked for removal:
      Stage 1: Fill Pro neutrally removes items (reveals floor/walls behind)
      Stage 2: Kontext Pro applies full style redesign to the clean room
      This ensures the entire room is styled, not just the masked region.

    ROUTE B (Kontext Pro): When no items are removed, uses Kontext Pro for
    whole-room style transfer. Kontext preserves structure implicitly.
    """
    import fal_client
    from supabase import create_client

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(supabase_url, supabase_key)

    base_seed = seed if seed is not None else random.randint(1, 999999)

    print(f"[phase4b] ── Generation START for room {room_id} ──")
    print(f"[phase4b] original_photo: {(original_photo_url or 'NONE')[:80]}")
    print(f"[phase4b] professionalized_photo: {(professionalized_photo_url or 'NONE')[:80]}")
    print(f"[phase4b] style_prompt ({len(style_prompt.split())} words): {style_prompt[:120]}...")
    print(f"[phase4b] remove_count: {remove_count}")
    print(f"[phase4b] wall_change: {wall_change_requested}, floor_change: {floor_change_requested}")
    print(f"[phase4b] seed: {base_seed}")

    # Extract item masks and keep/remove decisions from render_context
    item_masks = render_context.get("itemMasks") or {}
    masks_ready = render_context.get("masksReady", False)

    # Fix B: detected_items may be missing from render_context
    detected_items = render_context.get("detected_items") or []
    print(f"[phase4b] detected_items: {len(detected_items)} items")
    if not detected_items:
        print("[phase4b] WARNING: detected_items missing from render_context — "
              "all non-structural items will use default dilation, category matching degraded")

    # Normalize keep_remove_decisions — handles both list (DB) and dict formats
    keep_remove_decisions = normalize_decisions(render_context.get("keep_remove_decisions") or {})

    print(f"[phase4b] itemMasks: {len(item_masks)} entries, masksReady: {masks_ready}")
    print(f"[phase4b] keep_remove_decisions: {keep_remove_decisions}")

    # ── Routing decision logging ───────────────────────────────────────────
    print(f"[phase4b] ROUTING DECISION INPUTS:")
    print(f"[phase4b]   remove_count={remove_count}")
    print(f"[phase4b]   masksReady={masks_ready}")
    print(f"[phase4b]   itemMasks_count={len(item_masks)}")
    print(f"[phase4b]   keep_remove_decisions_count={len(keep_remove_decisions)}")
    remove_decisions_list = [k for k, v in keep_remove_decisions.items() if v == "remove"]
    keep_decisions_list = [k for k, v in keep_remove_decisions.items() if v == "keep"]
    print(f"[phase4b]   remove_decisions={remove_decisions_list}")
    print(f"[phase4b]   keep_decisions={keep_decisions_list}")

    if not masks_ready and remove_count > 0:
        print("[phase4b] WARNING: masksReady=false but remove_count>0 — "
              "Fill Pro CANNOT fire without masks. Falling through to Kontext route. "
              "To fix: ensure step-7c completes and sets masksReady=true + itemMasks in render_context")

    # ── Build combined remove mask ───────────────────────────────────────────
    combined_mask_url = None
    if masks_ready and item_masks and remove_count > 0:
        try:
            combined_mask_url = build_combined_remove_mask(
                item_masks=item_masks,
                keep_remove_decisions=keep_remove_decisions,
                detected_items=detected_items,
                room_id=room_id,
                supabase_url=supabase_url,
                supabase_key=supabase_key,
            )
        except Exception as mask_err:
            print(f"[phase4b] Mask build failed — falling through to Kontext: {mask_err}")
            combined_mask_url = None

    # Compute remove and keep lists for prompt building
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

    # ── Route selection + multi-candidate generation (Phase 6) ─────────────
    route_used: str
    endpoint_used: str
    two_stage = bool(combined_mask_url and len(remove_decision_keys) > 0)

    if two_stage:
        route_used = "fill_pro_then_kontext"
        endpoint_used = "fal-ai/flux-pro/v1/fill + fal-ai/flux-pro/kontext"
        input_image = original_photo_url or professionalized_photo_url
    else:
        route_used = "kontext_pro"
        endpoint_used = "fal-ai/flux-pro/kontext"
        input_image = professionalized_photo_url or original_photo_url

    if not input_image:
        raise RuntimeError(f"[phase4b] No photo URL available for room {room_id}")

    print(f"[phase4b] ROUTE: {'A (Fill Pro → Kontext)' if two_stage else 'B (Kontext Pro)'}")
    print(f"[phase4b] Input image: {input_image[:80]}")
    if two_stage:
        print(f"[phase4b] Mask URL: {combined_mask_url[:80]}")

    # Build Kontext prompt (used by both routes)
    kontext_prompt = build_kontext_prompt(
        style_prompt, render_context,
        wall_change_requested=wall_change_requested,
        floor_change_requested=floor_change_requested,
    )
    print(f"[phase4b] Kontext prompt ({len(kontext_prompt.split())} words): {kontext_prompt[:120]}...")

    # ── Mask dimension verification (Route A only) ──────────────────────────
    if two_stage:
        try:
            import requests as _req
            import numpy as np
            import cv2
            from PIL import Image as _Img

            orig_bytes = _req.get(input_image, timeout=60).content
            orig_img = _Img.open(io.BytesIO(orig_bytes))
            orig_w, orig_h = orig_img.size

            mask_bytes = _req.get(combined_mask_url, timeout=60).content
            mask_img = _Img.open(io.BytesIO(mask_bytes))
            mask_w, mask_h = mask_img.size

            if (mask_w, mask_h) != (orig_w, orig_h):
                print(f"[phase4b] Mask dimensions {mask_w}x{mask_h} != image {orig_w}x{orig_h} — resizing mask")
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
                print(f"[phase4b] Mask dimensions match — OK")
        except Exception as dim_err:
            print(f"[phase4b] Could not verify mask dimensions (continuing anyway): {dim_err}")

    # ── Fill Pro Stage 1 (Route A only — runs ONCE, reused by all candidates)
    stage1_supabase_url = None
    fill_prompt = None
    if two_stage:
        fill_prompt = NEUTRAL_FILL_PROMPT
        print(f"[phase4b] Stage 1 Fill prompt: {fill_prompt[:80]}...")

        fill_args = {
            "image_url": input_image,
            "mask_url": combined_mask_url,
            "prompt": fill_prompt,
            "seed": base_seed,
            "output_format": "jpeg",
            "safety_tolerance": "6",
            "enhance_prompt": False,
        }

        try:
            print(f"[phase4b] Stage 1: Submitting Fill Pro (neutral removal)...")
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
                raise RuntimeError(f"[phase4b] Stage 1 Fill Pro returned no images: {str(fill_result)[:300]}")
        else:
            stage1_url = fill_images[0].get("url", "")

        if not stage1_url:
            raise RuntimeError(f"[phase4b] Stage 1 Fill Pro empty URL: {str(fill_result)[:300]}")

        print(f"[phase4b] Stage 1 DONE — clean room: {stage1_url[:80]}")

        import time as _time_s1
        import requests as _req_s1
        stage1_bytes = _req_s1.get(stage1_url, timeout=60).content
        stage1_path = f"renders/{room_id}/stage1_fill_{int(_time_s1.time())}.jpg"
        stage1_supabase_url = _upload_to_supabase(
            stage1_bytes, stage1_path, supabase_url, supabase_key
        )
        print(f"[phase4b] Stage 1 uploaded to Supabase: {stage1_supabase_url[:80]}")

        # Write debug URL to render_context for inspection
        render_context["debug_stage1_url"] = stage1_supabase_url

    # ── Phase 6: Multi-candidate generation (3 seeds) ───────────────────────
    seeds = [base_seed, base_seed + 1000, base_seed + 2000]
    candidates = []

    for s in seeds:
        try:
            if two_stage:
                # Stage 2: Kontext on clean room from Fill Pro
                kontext_args = {
                    "image_url": stage1_supabase_url,
                    "prompt": kontext_prompt,
                    "num_inference_steps": 30,
                    "guidance_scale": 7.0,
                    "seed": s,
                    "output_format": "jpeg",
                    "safety_tolerance": "5",
                }
                print(f"[phase4b] Candidate seed={s}: Submitting Kontext Pro...")
                handle = fal_client.submit("fal-ai/flux-pro/kontext", arguments=kontext_args)
                result = handle.get()
            else:
                # Route B: Kontext on professionalized photo
                fal_args = {
                    "image_url": input_image,
                    "prompt": kontext_prompt,
                    "num_inference_steps": 30,
                    "guidance_scale": 7.0,
                    "seed": s,
                    "output_format": "jpeg",
                    "safety_tolerance": "5",
                }
                print(f"[phase4b] Candidate seed={s}: Submitting Kontext Pro...")
                handle = fal_client.submit("fal-ai/flux-pro/kontext", arguments=fal_args)
                result = handle.get()

            # Parse result
            images = result.get("images") or []
            if not images:
                single_image = result.get("image")
                if single_image and isinstance(single_image, dict) and "url" in single_image:
                    candidate_url = single_image["url"]
                else:
                    print(f"[phase4b] Candidate seed={s}: no images in result — skipping")
                    continue
            else:
                candidate_url = images[0].get("url", "")

            if not candidate_url:
                print(f"[phase4b] Candidate seed={s}: empty URL — skipping")
                continue

            candidates.append({"url": candidate_url, "seed": s})
            print(f"[phase4b] Candidate seed={s}: OK — {candidate_url[:80]}")

        except Exception as e:
            print(f"[phase4b] Candidate seed={s} failed: {e}")
            continue

    if not candidates:
        err_msg = "All 3 candidates failed"
        print(f"[phase4b] {err_msg}")
        try:
            client.table("rooms").update({
                "redesign_status": "failed",
                "redesign_error": err_msg,
            }).eq("id", room_id).execute()
        except Exception:
            pass
        raise RuntimeError(f"[phase4b] {err_msg}")

    print(f"[phase4b] {len(candidates)} candidates generated — scoring with LAION Aesthetic V2.5...")

    # ── Score and select best candidate ─────────────────────────────────────
    best = score_and_select(candidates, kontext_prompt)
    raw_output_url = best["url"]
    aesthetic_score = best.get("aesthetic_score", 0.0)
    all_scores = best.get("all_scores", [])

    print(f"[phase4b] Best candidate: seed={best['seed']} aesthetic_score={aesthetic_score:.2f}")
    print(f"[phase4b] All scores: {all_scores}")
    print(f"[phase4b] Raw output URL: {raw_output_url[:80]}")
    print(f"[phase4b] Route used: {route_used}")

    # ── Post-generation pixel composite ─────────────────────────────────────
    composite_url = composite_structural_pixels(
        original_photo_url=original_photo_url,
        generated_image_url=raw_output_url,
        render_context=render_context,
        wall_change_requested=wall_change_requested,
        floor_change_requested=floor_change_requested,
        room_id=room_id,
        supabase_url=supabase_url,
        supabase_key=supabase_key,
    )

    composite_applied = (composite_url != raw_output_url)
    print(f"[phase4b] Composite applied: {composite_applied}")

    # ── Phase 7: Apply visual signature post-processing ─────────────────────
    import cv2
    import numpy as np
    import requests as _req_vis
    from PIL import Image as _Img_vis
    import time as _time_vis

    try:
        vis_bytes = _req_vis.get(composite_url, timeout=60).content
        vis_arr = np.array(_Img_vis.open(io.BytesIO(vis_bytes)).convert("RGB"))
        # Convert RGB → BGR for OpenCV processing
        vis_bgr = cv2.cvtColor(vis_arr, cv2.COLOR_RGB2BGR)

        processed_bgr = apply_visual_signature(vis_bgr)

        # Convert BGR → RGB for PIL
        processed_rgb = cv2.cvtColor(processed_bgr, cv2.COLOR_BGR2RGB)
        processed_pil = _Img_vis.fromarray(processed_rgb)
        buf = io.BytesIO()
        processed_pil.save(buf, format="JPEG", quality=95)
        processed_bytes = buf.getvalue()

        final_path = f"renders/{room_id}/final_{int(_time_vis.time())}.jpg"
        final_url = _upload_to_supabase(processed_bytes, final_path, supabase_url, supabase_key)
        print(f"[phase4b] Visual signature applied — final: {final_url[:80]}")
    except Exception as vis_err:
        print(f"[phase4b] Visual signature FAILED — using composite: {vis_err}")
        final_url = composite_url

    print(f"[phase4b] Final URL: {final_url[:80]}")

    # ── Update rooms table ──────────────────────────────────────────────────
    try:
        update_payload = {
            "redesign_pano_url": final_url,
            "redesign_status": "complete",
            "generation_seed": best["seed"],
        }
        client.table("rooms").update(update_payload).eq("id", room_id).execute()
        print(f"[phase4b] DB updated — redesign_pano_url + redesign_status=complete")
    except Exception as db_err:
        print(f"[phase4b] DB update FAILED for room {room_id}: {db_err}")
        raise

    print(f"[phase4b] ── Generation COMPLETE for room {room_id} ──")

    result_dict = {
        "final_url": final_url,
        "raw_fal_url": raw_output_url,
        "composite_applied": composite_applied,
        "image_url": final_url,
        "route_used": route_used,
        "mask_url": combined_mask_url,
        "seed": best["seed"],
        "endpoint_used": endpoint_used,
        "aesthetic_score": aesthetic_score,
        "all_scores": all_scores,
    }

    if route_used == "fill_pro_then_kontext":
        result_dict["fill_prompt_used"] = fill_prompt
        result_dict["kontext_prompt_used"] = kontext_prompt
        result_dict["stage1_url"] = stage1_supabase_url
    elif route_used == "kontext_pro":
        result_dict["kontext_prompt_used"] = kontext_prompt
        result_dict["fill_prompt_used"] = None
    else:
        result_dict["fill_prompt_used"] = None
        result_dict["kontext_prompt_used"] = None

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
