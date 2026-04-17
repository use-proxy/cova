"""
Cova v5 — Selective Inpainting via Fill Pro + Pixel-Perfect Composite

Architecture reset: pixel-composite approach guarantees architecture preservation.

Three-stage pipeline (Route A — items removed):

  Stage 1: fal-ai/flux-pro/v1/fill — NEUTRAL removal.
    Input: original_photo + combined_remove_mask + neutral prompt
    Output: empty_room.png (furniture erased, floor/walls revealed)

  Stage 2: fal-ai/flux-pro/v1/fill — STYLED inpainting.
    Input: empty_room.png + combined_remove_mask (SAME mask) + compiled_prompt
    Output: ai_output.png (styled furniture in masked region only)

  Stage 3: Pixel-perfect composite.
    soft_alpha derived from remove mask (feathered, architecture-zeroed)
    final = soft_alpha * ai_output + (1 - soft_alpha) * original
    Architecture pixels are byte-identical to original (mathematically guaranteed).

Route B — No removals (style transfer only):
  fal-ai/flux-pro/kontext (FLUX Kontext Pro)
  Kontext preserves structure implicitly.

Generate 3 candidates (3 different seeds), score with LAION Aesthetic V2.5,
return the best. Apply visual signature post-processing.

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
    # Cache bust: 2026-04-16-v5-mask-resize-fix
    .pip_install(
        "fal-client",
        "supabase",
        "requests",
        "Pillow",
        "numpy",
        "opencv-python-headless",
    )
    .add_local_file("modal_pipeline/utils.py", "/root/utils.py")
    .add_local_file("modal_pipeline/mask_build.py", "/root/mask_build.py")
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
        "opencv-python-headless",
    )
    .add_local_file("modal_pipeline/utils.py", "/root/utils.py")
    .add_local_file("modal_pipeline/mask_build.py", "/root/mask_build.py")
)

app = modal.App("cova-generation")

STORAGE_BUCKET = "room-photos"

# Phase 7 visual signature — disable until base render quality is verified (Session 6)
ENABLE_VISUAL_SIGNATURE = False

# Stage 1 neutral fill prompt — same for every room type, every render.
NEUTRAL_FILL_PROMPT = (
    "completely empty room, bare floor, bare walls, no furniture, no objects, "
    "natural light, architectural interior photograph, pristine surfaces, seamless"
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
    """
    if len(candidates) == 1:
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

    valid = [(c, s) for c, s in scores if s >= 5.0]
    if not valid:
        print("[aesthetic] All candidates below threshold — using best available")
        valid = scores

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

    WB_A_SHIFT = 3
    WB_B_SHIFT = 5
    CLAHE_CLIP = 2.0
    CLAHE_GRID = (8, 8)
    GRADE_SHADOW_A = -3
    GRADE_SHADOW_B = 3
    GRADE_HIGH_A = 2
    GRADE_HIGH_B = 5
    SHADOW_THRESHOLD = 85
    HIGHLIGHT_THRESHOLD = 170
    VIGNETTE_STRENGTH = 0.15
    GRAIN_INTENSITY = 0.025
    CA_SHIFT_PX = 1

    img = image_array.copy()
    h, w = img.shape[:2]

    # STEP 1 — White balance correction (LAB space)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    a = np.clip(a.astype(np.int16) + WB_A_SHIFT, 0, 255).astype(np.uint8)
    b = np.clip(b.astype(np.int16) + WB_B_SHIFT, 0, 255).astype(np.uint8)
    img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    # STEP 2 — CLAHE micro-contrast on L channel
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l_std = float(np.std(l))
    clip = CLAHE_CLIP if l_std < 60 else 1.5
    clahe = cv2.createCLAHE(clipLimit=clip, tileGridSize=CLAHE_GRID)
    l = clahe.apply(l)
    img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    # STEP 3 — Teal-orange LAB grade
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

    # STEP 4 — Elliptical vignette
    sigma_x = w * 0.7
    sigma_y = h * 0.6
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
# Pixel-perfect composite — THE critical differentiator
# ---------------------------------------------------------------------------

def pixel_perfect_composite(
    original_arr,
    ai_output_arr,
    soft_alpha,
    architecture_mask,
    room_id: str,
):
    """
    Composites ai_output onto original using soft_alpha.
    Architecture pixels are byte-identical to original.

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
        print(f"[composite] Resizing AI output {ai_output_arr.shape[:2]} → {original_arr.shape[:2]}")
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

    # Expand soft_alpha to 3 channels
    alpha_3ch = soft_alpha[:, :, np.newaxis]

    # Composite: final = alpha * ai + (1 - alpha) * original
    composite = (
        alpha_3ch * ai_output_arr.astype(np.float32) +
        (1.0 - alpha_3ch) * original_arr.astype(np.float32)
    ).astype(np.uint8)

    # CRITICAL ASSERTION: architecture pixels must be byte-identical
    # Architecture mask uses INVERTED convention here: we want to check
    # pixels where architecture_mask == 255 (architecture regions)
    # In those regions, soft_alpha should be 0.0, so composite == original
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
            print(f"[composite] Force-corrected — architecture pixels now byte-identical")
        else:
            print(f"[composite] PASS: {arch_pixel_count} architecture pixels byte-identical")

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
) -> Optional[tuple]:
    """
    Union all masks for user-REMOVE items, build soft_alpha via mask_build.
    Returns (mask_url, hard_mask, soft_alpha) or None if no removals.
    """
    import cv2
    import numpy as np
    import requests
    from PIL import Image

    keep_remove_decisions = normalize_decisions(keep_remove_decisions)

    if not item_masks or not keep_remove_decisions:
        print("[mask_union] No item_masks or keep_remove_decisions — returning None")
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
        decision = norm_decisions.get(label_key, "keep")
        if decision == "remove":
            remove_keys.append(label_key)
        else:
            keep_keys.append(label_key)

    if not remove_keys:
        print("[mask_union] No remove decisions — returning None (Kontext route)")
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
    # Download kept masks, dilate them, and use them to zero out overlapping regions
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

    # Step 3: Build union via mask_build, then subtract kept items
    hard_mask, soft_alpha = build_remove_mask(
        instance_masks=instance_masks,
        architecture_mask=architecture_mask,
        image_hw=image_hw,
        feather_sigma=4.0,
        instance_labels=instance_labels,
    )

    # Subtract kept item regions from hard_mask, rebuild soft_alpha
    if keep_exclusion_masks:
        for km in keep_exclusion_masks:
            if km.shape[:2] != (h, w):
                km = cv2.resize(km, (w, h), interpolation=cv2.INTER_NEAREST)
            hard_mask[km > 128] = 0

        # Rebuild soft_alpha from modified hard_mask
        soft = cv2.GaussianBlur(
            hard_mask.astype(np.float32), (0, 0),
            sigmaX=4.0, sigmaY=4.0,
        )
        soft_alpha = soft / 255.0
        soft_alpha = np.where(architecture_mask > 0, 0.0, soft_alpha).astype(np.float32)

    # Upload hard mask for Fill Pro
    mask_url = upload_mask_to_supabase(
        hard_mask,
        f"masks/{room_id}/combined_remove_mask.png",
        supabase_url, supabase_key,
    )

    return mask_url, hard_mask, soft_alpha


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

    remove_items = []
    for item in detected_items:
        label = normalize_label_key(item.get("label", ""))
        display = item.get("display_name", label.replace("_", " "))
        category = normalize_label_key(item.get("category", ""))
        if norm_decisions.get(label) == "remove" and category not in HARD_STRUCTURAL:
            remove_items.append(display)
    detected_labels = {normalize_label_key(i.get("label", "")) for i in detected_items}
    for k, v in norm_decisions.items():
        if v == "remove" and k not in detected_labels:
            cat = get_category_for_label(k, detected_items)
            if cat not in HARD_STRUCTURAL:
                remove_items.append(k.replace("_", " "))

    structural_present = []
    user_kept = []
    for item in detected_items:
        label = normalize_label_key(item.get("label", ""))
        display = item.get("display_name", label.replace("_", " "))
        category = normalize_label_key(item.get("category", ""))
        if category in HARD_STRUCTURAL:
            structural_present.append(display)
        elif norm_decisions.get(label, "keep") == "keep":
            user_kept.append(display)
    for k, v in norm_decisions.items():
        if v == "keep" and k not in detected_labels:
            user_kept.append(k.replace("_", " "))

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

    remove_clause = f"Remove {', '.join(remove_items)}. " if remove_items else ""
    preserve_all = structural_present + user_kept
    keep_clause = (
        f"Keep {', '.join(preserve_all)}, {wall_lang}, {floor_lang} exactly. "
        if preserve_all
        else f"Keep {wall_lang}, {floor_lang} exactly. "
    )

    style_cleaned = style_prompt
    for prefix in ["Remove ", "Keep ", "Preserve "]:
        while prefix in style_cleaned:
            idx = style_cleaned.find(prefix)
            end = style_cleaned.find(".", idx)
            if end == -1:
                end = len(style_cleaned)
            style_cleaned = style_cleaned[:idx] + style_cleaned[end + 1:]
    style_cleaned = style_cleaned.strip()

    # Filter sentences describing kept items as new furniture
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
                    if len(word) > 3
                )
                for label in kept_labels
            )
            if mentions_kept:
                print(f"[kontext_prompt] Filtered kept-item sentence: '{sentence[:60]}...'")
            else:
                filtered_sentences.append(sentence)
        style_cleaned = ' '.join(filtered_sentences)

    MAX_BODY_WORDS = 165
    body_words = style_cleaned.split()
    if len(body_words) > MAX_BODY_WORDS:
        truncated = ' '.join(body_words[:MAX_BODY_WORDS])
        last_period = truncated.rfind('.')
        if last_period > len(truncated) * 0.7:
            style_cleaned = truncated[:last_period + 1]
        else:
            style_cleaned = truncated
        print(f"[kontext_prompt] Prompt body truncated to {len(style_cleaned.split())} words")

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
        print(f"[kontext_prompt] WARNING: prompt too short ({word_count} words)")
    if word_count > 210:
        print(f"[kontext_prompt] WARNING: prompt too long ({word_count} words) — truncating")
        words = prompt.split()
        prompt = " ".join(words[:210])
        if "hasselblad" not in prompt.lower():
            prompt += (" Shot on Hasselblad X2D 100C, 24mm tilt-shift at f/8, "
                       "perfect exposure, professional architectural photography, "
                       "Architectural Digest quality, no people, no text.")
    print(f"[kontext_prompt] Built ({len(prompt.split())} words): {prompt[:120]}...")
    return prompt


def build_fill_prompt(style_prompt: str, removed_items: list, kept_items: list = None) -> str:
    """
    Fill Pro prompt describes replacement content for the masked region only.
    """
    style_cleaned = style_prompt
    for keyword in ["Keep ", "Preserve ", "unchanged", "exactly"]:
        lines = style_cleaned.split(".")
        lines = [l for l in lines if keyword not in l]
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
    removed_str = ", ".join([r.replace("_", " ") for r in removed_items])

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
# Main generation function — Phase 4b → v5 pixel-composite architecture
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
    v5 generation: selective inpainting via Fill Pro + pixel-perfect composite.

    ROUTE A (Fill Pro × 2 stages): When items are marked for removal:
      Stage 1: Fill Pro neutrally removes items (reveals floor/walls behind)
      Stage 2: Fill Pro applies styled furniture into the SAME mask region
      Stage 3: Pixel-perfect composite — architecture pixels byte-identical

    ROUTE B (Kontext Pro): When no items are removed, uses Kontext Pro for
    whole-room style transfer. Kontext preserves structure implicitly.
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

    print(f"[phase4b] ── Generation START for room {room_id} ──")
    print(f"[phase4b] original_photo: {(original_photo_url or 'NONE')[:80]}")
    print(f"[phase4b] professionalized_photo: {(professionalized_photo_url or 'NONE')[:80]}")
    print(f"[phase4b] style_prompt ({len(style_prompt.split())} words): {style_prompt[:120]}...")
    print(f"[phase4b] remove_count: {remove_count}")
    print(f"[phase4b] wall_change: {wall_change_requested}, floor_change: {floor_change_requested}")
    print(f"[phase4b] seed: {base_seed}")

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
        print(f"[phase4b] WARNING: No original image available — composite disabled")
        image_hw = (1024, 1024)

    # ── Build architecture mask ──────────────────────────────────────────
    # Use OneFormer pixel-perfect mask if available from segmentation pipeline
    arch_mask_url = render_context.get("archMaskUrl", "")
    arch_mask = build_architecture_mask(
        detected_items, image_hw, arch_mask_url=arch_mask_url,
    )
    print(f"[phase4b] Architecture mask built: {np.count_nonzero(arch_mask > 0)} pixels protected"
          f"{' (OneFormer)' if arch_mask_url else ' (bbox fallback)'}")

    # ── Build combined remove mask ───────────────────────────────────────
    mask_result = None
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
        except Exception as mask_err:
            print(f"[phase4b] Mask build failed — falling to Kontext: {mask_err}")
            mask_result = None
    elif not masks_ready and remove_count > 0:
        print("[phase4b] WARNING: masksReady=false but remove_count>0 — "
              "falling to Kontext route")

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

    # ── Route selection ──────────────────────────────────────────────────
    two_stage = bool(mask_result and len(remove_decision_keys) > 0)

    if two_stage:
        combined_mask_url, hard_mask, soft_alpha = mask_result
        route_used = "fill_pro_two_stage"
        endpoint_used = "fal-ai/flux-pro/v1/fill × 2 stages"
        input_image = original_photo_url or professionalized_photo_url
    else:
        combined_mask_url = None
        hard_mask = None
        soft_alpha = None
        route_used = "kontext_pro"
        endpoint_used = "fal-ai/flux-pro/kontext"
        input_image = professionalized_photo_url or original_photo_url

    if not input_image:
        raise RuntimeError(f"[phase4b] No photo URL available for room {room_id}")

    print(f"[phase4b] ROUTE: {'A (Fill Pro × 2 + Composite)' if two_stage else 'B (Kontext Pro)'}")
    print(f"[phase4b] Input image: {input_image[:80]}")

    # Build prompts
    kontext_prompt = build_kontext_prompt(
        style_prompt, render_context,
        wall_change_requested=wall_change_requested,
        floor_change_requested=floor_change_requested,
    )

    # ── Mask dimension verification (Route A only) ───────────────────────
    if two_stage:
        try:
            orig_h, orig_w = orig_arr.shape[:2] if orig_arr is not None else (0, 0)
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
                print(f"[phase4b] Mask dimensions match — OK")
        except Exception as dim_err:
            print(f"[phase4b] Could not verify mask dimensions: {dim_err}")

    # ── ROUTE A: Fill Pro two-stage + pixel composite ────────────────────
    stage1_supabase_url = None
    fill_prompt = None

    if two_stage:
        # ── Stage 1: Neutral removal ──────────────────────────────────────
        fill_prompt = NEUTRAL_FILL_PROMPT
        print(f"[phase4b] Stage 1 prompt: {NEUTRAL_FILL_PROMPT[:100]}")
        print(f"[phase4b] Stage 1: Submitting Fill Pro (neutral removal)...")

        fill_args = {
            "image_url": input_image,
            "mask_url": combined_mask_url,
            "prompt": fill_prompt,
            "seed": base_seed,
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
            raise RuntimeError(f"[phase4b] Stage 1 empty URL")

        print(f"[phase4b] Stage 1 DONE — empty room: {stage1_url[:80]}")

        # Upload Stage 1 to Supabase for reuse
        stage1_bytes = _req.get(stage1_url, timeout=60).content
        stage1_path = f"renders/{room_id}/stage1_fill_{int(_time_module.time())}.png"
        stage1_supabase_url = _upload_to_supabase(
            stage1_bytes, stage1_path, supabase_url, supabase_key
        )
        render_context["debug_stage1_url"] = stage1_supabase_url

        # ── Resize mask to match Stage 1 output dimensions ───────────────
        # Fill Pro may return a different resolution than the input image.
        # Stage 2 requires the mask to match the Stage 1 output exactly.
        stage1_img = _Img.open(io.BytesIO(stage1_bytes))
        s1_w, s1_h = stage1_img.size
        orig_h, orig_w = image_hw
        if (s1_w, s1_h) != (orig_w, orig_h):
            print(f"[phase4b] Stage 1 output {s1_w}x{s1_h} != original {orig_w}x{orig_h} — resizing mask for Stage 2")
            resized_mask = cv2.resize(hard_mask, (s1_w, s1_h), interpolation=cv2.INTER_NEAREST)
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
            print(f"[phase4b] Stage 1 output matches original — using same mask for Stage 2")

        # ── Stage 2: Styled inpainting × 3 seeds ─────────────────────────
        styled_fill_prompt = build_fill_prompt(
            style_prompt, remove_decision_keys, kept_items=keep_decision_keys
        )
        print(f"[phase4b] Stage 2 prompt (compiled/style): {styled_fill_prompt[:100]}")
        print(f"[phase4b] Stage 2: Fill Pro styled inpainting × 3 seeds")

        seeds = [base_seed, base_seed + 1000, base_seed + 2000]
        candidates = []

        for s in seeds:
            try:
                style_args = {
                    "image_url": stage1_supabase_url,
                    "mask_url": stage2_mask_url,
                    "prompt": styled_fill_prompt,
                    "seed": s,
                    "output_format": "png",
                    "safety_tolerance": "2",
                }
                print(f"[phase4b] Stage 2 candidate seed={s}: Submitting Fill Pro...")
                handle = fal_client.submit("fal-ai/flux-pro/v1/fill", arguments=style_args)
                result = handle.get()

                images = result.get("images") or []
                if not images:
                    single_image = result.get("image")
                    if single_image and isinstance(single_image, dict) and "url" in single_image:
                        candidate_url = single_image["url"]
                    else:
                        print(f"[phase4b] Stage 2 seed={s}: no images — skipping")
                        continue
                else:
                    candidate_url = images[0].get("url", "")

                if not candidate_url:
                    print(f"[phase4b] Stage 2 seed={s}: empty URL — skipping")
                    continue

                candidates.append({"url": candidate_url, "seed": s})
                print(f"[phase4b] Stage 2 seed={s}: OK — {candidate_url[:80]}")

            except Exception as e:
                print(f"[phase4b] Stage 2 seed={s} failed: {e}")
                # Retry once with higher safety tolerance
                try:
                    style_args["safety_tolerance"] = "6"
                    print(f"[phase4b] Stage 2 seed={s}: retrying with safety_tolerance=6...")
                    handle = fal_client.submit("fal-ai/flux-pro/v1/fill", arguments=style_args)
                    result = handle.get()
                    images = result.get("images") or []
                    if images:
                        candidates.append({"url": images[0]["url"], "seed": s})
                        print(f"[phase4b] Stage 2 seed={s}: retry OK")
                except Exception as retry_e:
                    print(f"[phase4b] Stage 2 seed={s}: retry also failed: {retry_e}")
                continue

    else:
        # ── ROUTE B: Kontext Pro × 3 seeds ───────────────────────────────
        seeds = [base_seed, base_seed + 1000, base_seed + 2000]
        candidates = []

        for s in seeds:
            try:
                fal_args = {
                    "image_url": input_image,
                    "prompt": kontext_prompt,
                    "num_inference_steps": 30,
                    "guidance_scale": 7.0,
                    "seed": s,
                    "output_format": "jpeg",
                    "safety_tolerance": "5",
                }
                print(f"[phase4b] Kontext candidate seed={s}: Submitting...")
                handle = fal_client.submit("fal-ai/flux-pro/kontext", arguments=fal_args)
                result = handle.get()

                images = result.get("images") or []
                if not images:
                    single_image = result.get("image")
                    if single_image and isinstance(single_image, dict) and "url" in single_image:
                        candidate_url = single_image["url"]
                    else:
                        print(f"[phase4b] Kontext seed={s}: no images — skipping")
                        continue
                else:
                    candidate_url = images[0].get("url", "")

                if not candidate_url:
                    continue

                candidates.append({"url": candidate_url, "seed": s})
                print(f"[phase4b] Kontext seed={s}: OK — {candidate_url[:80]}")
            except Exception as e:
                print(f"[phase4b] Kontext seed={s} failed: {e}")

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

    print(f"[phase4b] {len(candidates)} candidates — scoring with LAION Aesthetic V2.5...")

    # ── Score and select best candidate ──────────────────────────────────
    best = score_and_select(candidates, kontext_prompt)
    raw_output_url = best["url"]
    aesthetic_score = best.get("aesthetic_score", 0.0)
    all_scores = best.get("all_scores", [])

    print(f"[phase4b] Best: seed={best['seed']} score={aesthetic_score:.2f}")
    print(f"[phase4b] All scores: {all_scores}")

    # ── Pixel-perfect composite (Route A only) ───────────────────────────
    composite_applied = False
    if two_stage and orig_arr is not None and soft_alpha is not None:
        try:
            ai_arr = _download_image_as_array(raw_output_url)

            composite_arr = pixel_perfect_composite(
                original_arr=orig_arr,
                ai_output_arr=ai_arr,
                soft_alpha=soft_alpha,
                architecture_mask=arch_mask,
                room_id=room_id,
            )

            # FIX 2 — Floor preservation verification
            h_comp, w_comp = composite_arr.shape[:2]
            floor_region = composite_arr[int(h_comp * 0.75):, :]
            original_floor = orig_arr[int(h_comp * 0.75):, :]
            floor_diff = np.abs(floor_region.astype(int) - original_floor.astype(int)).max()
            print(f"[phase4b] Floor region max pixel diff: {floor_diff}")
            if floor_diff > 0:
                print(f"[phase4b] WARNING: Floor pixels changed — architecture mask may not cover floor")
                # Log architecture mask floor coverage
                floor_arch = arch_mask[int(h_comp * 0.85):, :]
                floor_arch_coverage = np.count_nonzero(floor_arch > 0) / floor_arch.size
                print(f"[phase4b] Architecture mask floor coverage (bottom 15%): {floor_arch_coverage:.1%}")
                # Log soft_alpha in floor region
                floor_alpha = soft_alpha[int(h_comp * 0.75):, :]
                floor_alpha_max = float(floor_alpha.max())
                print(f"[phase4b] soft_alpha max in floor region (bottom 25%): {floor_alpha_max:.4f}")
            else:
                print(f"[phase4b] Floor preservation PASS — byte-identical to original")

            # Phase 7 visual signature (disabled until Session 6)
            if ENABLE_VISUAL_SIGNATURE:
                composite_bgr = cv2.cvtColor(composite_arr, cv2.COLOR_RGB2BGR)
                processed_bgr = apply_visual_signature(composite_bgr)
                output_rgb = cv2.cvtColor(processed_bgr, cv2.COLOR_BGR2RGB)
                print(f"[phase4b] Visual signature applied")
            else:
                output_rgb = composite_arr
                print(f"[phase4b] Visual signature SKIPPED (ENABLE_VISUAL_SIGNATURE=False)")

            # Upload
            processed_pil = _Img.fromarray(output_rgb)
            buf = io.BytesIO()
            processed_pil.save(buf, format="JPEG", quality=95)
            processed_bytes = buf.getvalue()

            final_path = f"renders/{room_id}/final_{int(_time_module.time())}.jpg"
            final_url = _upload_to_supabase(processed_bytes, final_path, supabase_url, supabase_key)
            composite_applied = True
            print(f"[phase4b] Pixel composite uploaded: {final_url[:80]}")

        except Exception as comp_err:
            print(f"[phase4b] Composite FAILED — falling back to raw + visual sig: {comp_err}")
            final_url = None

    if not two_stage or not composite_applied:
        # Route B — Color-matched Kontext + strip-based architecture protection.
        # Strategy: use Kontext output for the middle band (furniture zone),
        # force-paste original pixels for floor + ceiling strips with feathered blend.
        # Global LAB color matching minimizes wall color drift.
        # No bbox rectangles — avoids visible seam artifacts on flat walls.
        try:
            kontext_arr = _download_image_as_array(raw_output_url)

            if orig_arr is not None:
                h_out, w_out = orig_arr.shape[:2]
                FEATHER_PX = max(80, int(min(h_out, w_out) * 0.025))

                # Resize Kontext output to match original
                if kontext_arr.shape[:2] != (h_out, w_out):
                    print(f"[phase4b] Resizing Kontext output {kontext_arr.shape[:2]} → {(h_out, w_out)}")
                    kontext_arr = cv2.resize(
                        kontext_arr, (w_out, h_out),
                        interpolation=cv2.INTER_LANCZOS4,
                    )

                # Step 1: Global LAB color matching — shift Kontext colors to match original
                try:
                    orig_lab = cv2.cvtColor(orig_arr, cv2.COLOR_RGB2LAB).astype(np.float32)
                    kontext_lab = cv2.cvtColor(kontext_arr, cv2.COLOR_RGB2LAB).astype(np.float32)
                    for ch in range(3):
                        o_mean, o_std = orig_lab[:, :, ch].mean(), orig_lab[:, :, ch].std()
                        k_mean, k_std = kontext_lab[:, :, ch].mean(), kontext_lab[:, :, ch].std()
                        if k_std > 0.1:
                            kontext_lab[:, :, ch] = (
                                (kontext_lab[:, :, ch] - k_mean) * (o_std / k_std) + o_mean
                            )
                    kontext_lab = np.clip(kontext_lab, 0, 255)
                    kontext_arr = cv2.cvtColor(kontext_lab.astype(np.uint8), cv2.COLOR_LAB2RGB)
                    print(f"[phase4b] Global LAB color matching applied")
                except Exception as cm_err:
                    print(f"[phase4b] Color matching failed: {cm_err}")

                # Step 2: Start with color-matched Kontext as base
                output_arr = kontext_arr.copy()

                # Step 3: Force-paste floor strip with feathered blend
                if not floor_change_requested:
                    floor_hard = int(h_out * 0.72)  # bottom 28% is hard original
                    for y in range(max(0, floor_hard - FEATHER_PX), floor_hard):
                        t = (y - (floor_hard - FEATHER_PX)) / FEATHER_PX
                        output_arr[y, :] = (
                            (1.0 - t) * output_arr[y, :].astype(np.float32) +
                            t * orig_arr[y, :].astype(np.float32)
                        ).astype(np.uint8)
                    output_arr[floor_hard:, :] = orig_arr[floor_hard:, :]
                    print(f"[phase4b] Floor strip: original below y={floor_hard} ({FEATHER_PX}px feather)")

                # Step 4: Force-paste ceiling strip with feathered blend
                if not wall_change_requested:
                    ceil_hard = int(h_out * 0.12)  # top 12% is hard original
                    output_arr[:ceil_hard, :] = orig_arr[:ceil_hard, :]
                    for y in range(ceil_hard, min(h_out, ceil_hard + FEATHER_PX)):
                        t = (y - ceil_hard) / FEATHER_PX
                        output_arr[y, :] = (
                            t * output_arr[y, :].astype(np.float32) +
                            (1.0 - t) * orig_arr[y, :].astype(np.float32)
                        ).astype(np.uint8)
                    print(f"[phase4b] Ceiling strip: original above y={ceil_hard} ({FEATHER_PX}px feather)")

                # Step 5: Force architecture mask pixels (catches blinds, structural items)
                resized_arch = arch_mask
                if arch_mask.shape[:2] != (h_out, w_out):
                    resized_arch = cv2.resize(arch_mask, (w_out, h_out), interpolation=cv2.INTER_NEAREST)
                output_arr[resized_arch > 0] = orig_arr[resized_arch > 0]

                # Verification logs
                floor_region = output_arr[int(h_out * 0.75):, :]
                original_floor = orig_arr[int(h_out * 0.75):, :]
                floor_diff = int(np.abs(floor_region.astype(int) - original_floor.astype(int)).max())
                print(f"[phase4b] Floor region max pixel diff: {floor_diff}")
                if floor_diff == 0:
                    print(f"[phase4b] Floor preservation PASS — byte-identical to original")

                ceil_region = output_arr[:int(h_out * 0.10), :]
                original_ceil = orig_arr[:int(h_out * 0.10), :]
                ceil_diff = int(np.abs(ceil_region.astype(int) - original_ceil.astype(int)).max())
                print(f"[phase4b] Ceiling region max pixel diff: {ceil_diff}")

                composite_applied = True
            else:
                output_arr = kontext_arr
                print(f"[phase4b] No original image — cannot apply architecture composite")

            if ENABLE_VISUAL_SIGNATURE:
                vis_bgr = cv2.cvtColor(output_arr, cv2.COLOR_RGB2BGR)
                processed_bgr = apply_visual_signature(vis_bgr)
                output_arr = cv2.cvtColor(processed_bgr, cv2.COLOR_BGR2RGB)
                print(f"[phase4b] Visual signature applied")
            else:
                print(f"[phase4b] Visual signature SKIPPED (ENABLE_VISUAL_SIGNATURE=False)")

            processed_pil = _Img.fromarray(output_arr)
            buf = io.BytesIO()
            processed_pil.save(buf, format="JPEG", quality=95)
            processed_bytes = buf.getvalue()

            final_path = f"renders/{room_id}/final_{int(_time_module.time())}.jpg"
            final_url = _upload_to_supabase(processed_bytes, final_path, supabase_url, supabase_key)
            print(f"[phase4b] Route B output uploaded: {final_url[:80]}")
        except Exception as route_b_err:
            print(f"[phase4b] Route B post-processing FAILED — using raw: {route_b_err}")
            import traceback
            traceback.print_exc()
            final_url = raw_output_url

    print(f"[phase4b] Final URL: {final_url[:80]}")

    # ── Update rooms table ───────────────────────────────────────────────
    try:
        update_payload = {
            "redesign_pano_url": final_url,
            "redesign_status": "complete",
            "generation_seed": best["seed"],
        }
        client.table("rooms").update(update_payload).eq("id", room_id).execute()
        print(f"[phase4b] DB updated — redesign_status=complete")
    except Exception as db_err:
        print(f"[phase4b] DB update FAILED: {db_err}")
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
        "fill_prompt_used": fill_prompt if two_stage else None,
        "kontext_prompt_used": kontext_prompt,
    }

    if two_stage:
        result_dict["stage1_url"] = stage1_supabase_url
        result_dict["styled_fill_prompt"] = build_fill_prompt(
            style_prompt, remove_decision_keys, kept_items=keep_decision_keys
        ) if remove_decision_keys else None

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
