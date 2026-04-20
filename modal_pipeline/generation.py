"""
Cova v8 — Input Cleaning + Vision-Aware Design Director

  Pre-Stage 1: Clean input image.
    Paint over removable regions with sampled wall/floor color.
    Prevents Fill Pro from reproducing text, logos, posters.

  Stage 1: fal-ai/flux-pro/v1/fill — AGGRESSIVE empty room.
    Input: CLEANED photo + architecture-inverse mask + empty prompt.

  Stage 1.5: Vision-aware Design Director.
    Claude Sonnet sees the Stage 1 empty room and writes a spatially-aware
    design brief with 3-color palette, furniture placement, light direction.

  Stage 2: fal-ai/flux-pro/v1/fill — STYLED (×4 candidates).
    Input: Stage 1 output + SAME mask + Design Director brief
    + anti-hallucination clauses + editorial photography direction.

  Stage 3: Post-processing only (color grading).
    NO composite. Fill Pro output used directly.

Architecture mask: OneFormer semantic + SAM2 wall-object subtraction.
Score 4 candidates with 3-model ensemble (scoring.py).

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
    .apt_install("tesseract-ocr")
    # Cache bust: 2026-04-17-v9-watermark-fix
    .pip_install(
        "fal-client",
        "supabase",
        "requests",
        "httpx",
        "Pillow",
        "numpy",
        "opencv-python-headless",
        "colour-science",
        "anthropic",
        "pytesseract",
    )
    .add_local_file("modal_pipeline/utils.py", "/root/utils.py")
    .add_local_file("modal_pipeline/mask_build.py", "/root/mask_build.py")
    .add_local_file("modal_pipeline/postprocess.py", "/root/postprocess.py")
    .add_local_file("modal_pipeline/spatial_templates.py", "/root/spatial_templates.py")
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


def get_neutral_fill_prompt(room_type: str = "room") -> str:
    """Stage 1 neutral fill prompt — aggressively empty room, zero objects."""
    rt = room_type.replace("_", " ") if room_type else "room"
    return (
        f"Completely empty {rt} interior, NOTHING in the room, "
        f"bare walls painted in the existing wall color, bare floor matching "
        f"the existing floor material, ceiling preserved exactly as-is, "
        f"windows visible with existing treatment, natural daylight streaming in, "
        f"professional interior photography, wide angle view, sharp focus, "
        f"no furniture whatsoever, no decorations, no objects, no people, no clutter, "
        f"no bags, no electronics, no personal items, "
        f"just an empty architectural shell awaiting furnishing, "
        f"pristine clean surfaces, seamless interior, 8k"
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
    subtract_wall_objects_via_sam,
    clean_input_image,
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

    # Step 3: Build union via mask_build — v7 returns (hard_mask, dilated_mask)
    hard_mask, dilated_mask = build_remove_mask(
        instance_masks=instance_masks,
        architecture_mask=architecture_mask,
        image_hw=image_hw,
        instance_labels=instance_labels,
    )

    # Subtract kept item regions
    if keep_exclusion_masks:
        for km in keep_exclusion_masks:
            if km.shape[:2] != (h, w):
                km = cv2.resize(km, (w, h), interpolation=cv2.INTER_NEAREST)
            hard_mask[km > 128] = 0
            dilated_mask[km > 128] = 0

    # Upload DILATED mask for Fill Pro (not the hard mask)
    dilated_mask_url = upload_mask_to_supabase(
        dilated_mask,
        f"masks/{room_id}/combined_remove_mask_dilated.png",
        supabase_url, supabase_key,
    )

    return dilated_mask_url, dilated_mask


# ---------------------------------------------------------------------------
# Fallback mask — inverse of architecture (when no item masks available)
# ---------------------------------------------------------------------------

def build_architecture_inverse_mask(
    architecture_mask,
    image_hw: tuple,
    room_id: str,
    supabase_url: str,
    supabase_key: str,
    kept_item_masks: list = None,
) -> tuple:
    """
    PRIMARY mask strategy: regenerate EVERYTHING that isn't architecture.

    mask_to_regenerate = inverse(architecture_mask)

    This ensures ALL non-structural elements are replaced — no leftover
    chairs, backpacks, decorations, or clutter. Only walls, floor, ceiling,
    windows, and doors survive.

    If kept_item_masks are provided (from user's keep decisions), those
    specific regions are subtracted from the regeneration mask so they're
    preserved.

    Returns (dilated_mask_url, dilated_mask)
    """
    import cv2
    import numpy as np

    h, w = image_hw

    # Start with full inverse of architecture — everything non-structural
    regen_mask = np.where(architecture_mask > 0, 0, 255).astype(np.uint8)

    # Subtract kept items if user explicitly chose to preserve them
    if kept_item_masks:
        for km in kept_item_masks:
            if km.shape[:2] != (h, w):
                km = cv2.resize(km, (w, h), interpolation=cv2.INTER_NEAREST)
            # Dilate kept mask slightly to protect edges
            k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
            km_dilated = cv2.dilate(km, k, iterations=1)
            regen_mask[km_dilated > 127] = 0

    coverage = np.count_nonzero(regen_mask > 0) / (h * w)
    print(f"[arch_inverse_mask] Full architecture-inverse mask: {coverage:.1%} coverage "
          f"(kept_items_subtracted={len(kept_item_masks) if kept_item_masks else 0})")

    # Build via mask_build — v7 returns (hard_mask, dilated_mask) only
    hard_mask_out, dilated_mask = build_remove_mask(
        instance_masks=[regen_mask],
        architecture_mask=architecture_mask,
        image_hw=image_hw,
        instance_labels=["architecture_inverse"],
    )

    dilated_mask_url = upload_mask_to_supabase(
        dilated_mask,
        f"masks/{room_id}/arch_inverse_mask_{int(__import__('time').time())}.png",
        supabase_url, supabase_key,
    )

    return dilated_mask_url, dilated_mask


# ---------------------------------------------------------------------------
# Prompt builder — Fill Pro only
# ---------------------------------------------------------------------------

def build_fill_prompt(style_prompt: str, removed_items: list, kept_items: list = None, room_type: str = "room") -> str:
    """
    Fill Pro prompt with spatial placement, exclusion guidance, and composition.
    room_type drives furniture selection AND spatial layout.
    """
    from spatial_templates import (
        get_spatial_template, fill_spatial_placeholders,
        get_exclusion_phrases, COMPOSITION_DIRECTIVE,
    )

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

    # Build spatial layout from room type template
    spatial = fill_spatial_placeholders(get_spatial_template(room_type))
    exclusion = get_exclusion_phrases(room_type)

    parts = []
    # 1. Spatial layout — WHERE furniture goes
    parts.append(spatial)
    # 2. Style description — WHAT materials/aesthetic
    if style_cleaned:
        parts.append(style_cleaned)
    # 3. Exclusion guidance — what NOT to generate
    parts.append(exclusion)
    # 4. Composition and quality directive
    parts.append(COMPOSITION_DIRECTIVE)

    prompt = " ".join(parts)
    print(f"[fill_prompt] Built ({len(prompt.split())} words): {prompt[:120]}...")
    return prompt


# ---------------------------------------------------------------------------
# Design Brief Generator — Claude Sonnet produces real interior design briefs
# ---------------------------------------------------------------------------

# Style archetype definitions — all 10 COVA styles
# Derived from apps/web/lib/quiz/style-archetypes.ts 12-dim vectors
STYLE_ARCHETYPES = {
    "COVAJAPANDI": {
        "mood": "serene, restrained, warm",
        "materials": "light oak, walnut, linen, tatami, washi paper, ceramic",
        "palette": "oatmeal, ivory, soft taupe, warm grey, charcoal accent",
        "philosophy": "Japanese restraint meets Scandinavian warmth — the room breathes",
        "references": "wabi-sabi, hygge, natural imperfection, handcrafted simplicity",
    },
    "COVABOHEMIAN": {
        "mood": "eclectic, layered, warm, collected",
        "materials": "rattan, macramé, kilim, velvet, brass, terracotta, reclaimed wood",
        "palette": "terracotta, rust, mustard, olive, cream, deep teal accent",
        "philosophy": "a well-traveled collector's sanctuary — every piece has a story",
        "references": "global textiles, vintage finds, maximalist warmth, artisanal craft",
    },
    "COVACOASTAL": {
        "mood": "breezy, relaxed, sun-bleached, organic",
        "materials": "whitewashed wood, linen, jute, driftwood, sea glass, woven rattan",
        "palette": "sandy white, soft blue, seafoam, warm grey, natural driftwood",
        "philosophy": "California coast meets New England cottage — effortless and bright",
        "references": "beach house, coastal grandmother, organic textures, airy light",
    },
    "COVAMIDCENTURY": {
        "mood": "confident, sculptural, optimistic, refined",
        "materials": "walnut, teak, molded plywood, brass, bouclé, leather",
        "palette": "warm walnut, mustard, olive, burnt orange, cream, black accent",
        "philosophy": "form follows function — every curve is intentional, every line purposeful",
        "references": "Eames, Noguchi, Danish modern, 1950s-60s optimism, atomic age",
    },
    "COVAMINIMALIST": {
        "mood": "calm, intentional, uncluttered, precise",
        "materials": "white oak, marble, matte black metal, cashmere, concrete, glass",
        "palette": "pure white, warm grey, black, single warm accent",
        "philosophy": "less but better — every object earns its place through purpose or beauty",
        "references": "Dieter Rams, Japanese minimalism, Scandinavian purity, gallery-like",
    },
    "COVAMINIMAL": {
        "mood": "calm, intentional, uncluttered, precise",
        "materials": "white oak, marble, matte black metal, cashmere, concrete, glass",
        "palette": "pure white, warm grey, black, single warm accent",
        "philosophy": "less but better — every object earns its place through purpose or beauty",
        "references": "Dieter Rams, Japanese minimalism, Scandinavian purity, gallery-like",
    },
    "COVASCANDINAV": {
        "mood": "bright, airy, clean, hygge",
        "materials": "pale birch, white oak, sheepskin, wool, matte ceramic, brushed steel",
        "palette": "bright white, pale grey, blush pink accent, soft sage, natural wood",
        "philosophy": "democratic beauty through simplicity — light-filled and livable",
        "references": "Nordic living, Alvar Aalto, IKEA heritage, lagom, bright winters",
    },
    "COVAINDUSTRIAL": {
        "mood": "raw, urban, honest, dramatic",
        "materials": "exposed steel, reclaimed barn wood, raw concrete, black iron, aged leather, Edison bulbs",
        "palette": "charcoal, gunmetal, warm cognac, exposed brick red, matte black",
        "philosophy": "celebrate the bones — raw materials, honest construction, factory soul",
        "references": "converted loft, warehouse living, exposed ductwork, utilitarian beauty",
    },
    "COVAFARMHOUSE": {
        "mood": "welcoming, nostalgic, rustic, handmade",
        "materials": "reclaimed pine, shiplap, linen, wrought iron, stoneware, cotton ticking",
        "palette": "antique white, sage green, dusty blue, warm honey, cream",
        "philosophy": "lived-in warmth with heirloom character — nothing precious, everything cherished",
        "references": "modern farmhouse, country living, barn conversion, vintage market finds",
    },
    "COVAARTDECO": {
        "mood": "glamorous, geometric, opulent, theatrical",
        "materials": "lacquered walnut, brass inlay, velvet, marble, smoked mirror, shagreen",
        "palette": "deep emerald, rich navy, gold, black lacquer, ivory, champagne",
        "philosophy": "geometric luxury and theatrical drama — every surface is a statement",
        "references": "1920s Paris, Gatsby era, sunburst motifs, stepped forms, jazz age glamour",
    },
    "COVABIOPHILIC": {
        "mood": "lush, nurturing, alive, grounded",
        "materials": "live-edge wood, cork, terracotta, woven seagrass, stone, living moss",
        "palette": "forest green, warm terracotta, natural wood, stone grey, botanical white",
        "philosophy": "bring the outdoors in — the room itself feels alive and breathing",
        "references": "plant-filled sanctuary, greenhouse living, natural light worship, organic forms",
    },
}


def generate_design_brief(
    style_trigger: str,
    room_type: str,
    anthropic_api_key: str,
) -> str:
    """
    Generate a professional interior design brief using Claude Sonnet.

    Returns an 80-120 word evocative design brief suitable for FLUX Fill Pro,
    with specific materials, textures, colors, and photography direction.

    Falls back to a high-quality template if Claude call fails.
    """
    import anthropic

    # Determine style archetype
    style_upper = style_trigger.upper().replace(" ", "")
    archetype = None
    for key, data in STYLE_ARCHETYPES.items():
        if key in style_upper:
            archetype = data
            style_name = key.replace("COVA", "")
            break

    if not archetype:
        # Try to match partial
        for key, data in STYLE_ARCHETYPES.items():
            short = key.replace("COVA", "").lower()
            if short in style_upper.lower():
                archetype = data
                style_name = key.replace("COVA", "")
                break

    if not archetype:
        archetype = STYLE_ARCHETYPES["COVAJAPANDI"]
        style_name = "JAPANDI"

    rt = room_type.replace("_", " ") if room_type else "bedroom"

    system_prompt = (
        "You are an Architectural Digest interior design editor. "
        "Write a FLUX image generation prompt for an AI-redesigned room. "
        "Be SPECIFIC about materials (oak vs walnut), textures (linen vs cotton vs wool), "
        "color temperatures (2700K vs 3000K), and photography direction. "
        "NO generic words. Every adjective must be precise and evocative. "
        "Include photography direction at the end (camera, lighting, publication). "
        "Output ONLY the prompt text, 80-120 words, no preamble."
    )

    user_prompt = (
        f"Write a FLUX Fill Pro prompt for a {style_name} {rt} redesign.\n\n"
        f"Style mood: {archetype['mood']}\n"
        f"Key materials: {archetype['materials']}\n"
        f"Color palette: {archetype['palette']}\n"
        f"Design philosophy: {archetype['philosophy']}\n"
        f"References: {archetype['references']}\n\n"
        f"Requirements:\n"
        f"- Name specific furniture pieces with material adjectives\n"
        f"- Describe the color palette as it appears in the room\n"
        f"- Include a lighting description (type, temperature, direction)\n"
        f"- End with photography direction (camera type, quality, publication)\n"
        f"- The room should feel cohesive and intentionally designed\n"
        f"- NEVER mention removing old furniture or the redesign process\n"
        f"- Write as if describing a finished, photographed room"
    )

    try:
        client = anthropic.Anthropic(api_key=anthropic_api_key)
        response = client.messages.create(
            model="claude-sonnet-4-5-20250514",
            max_tokens=300,
            messages=[{"role": "user", "content": user_prompt}],
            system=system_prompt,
        )
        brief = response.content[0].text.strip()
        # Remove any quotes wrapping the output
        if brief.startswith('"') and brief.endswith('"'):
            brief = brief[1:-1]
        print(f"[design_brief] Claude generated ({len(brief.split())} words): {brief[:120]}...")
        return brief
    except Exception as e:
        print(f"[design_brief] Claude call failed: {e} — using template fallback")
        return _fallback_design_brief(style_name, rt, archetype)


def _fallback_design_brief(style_name: str, room_type: str, archetype: dict) -> str:
    """High-quality template fallback when Claude is unavailable."""
    templates = {
        ("JAPANDI", "bedroom"): (
            "A serene Japandi sanctuary blending Japanese restraint with Scandinavian warmth. "
            "A queen bed dressed in layered linen in oatmeal and ivory anchors the space, "
            "set against a woven tatami-inspired headboard in light oak. "
            "A single nightstand in warm walnut holds a paper lantern lamp casting 2700K glow. "
            "Above the bed, a pair of sumi-e ink paintings in natural wood frames. "
            "A hand-knotted wool rug in soft taupe grounds the composition. "
            "Dried pampas grass in a ceramic vessel adds organic texture. "
            "Shot on Hasselblad, soft morning light from left, shallow depth of field, "
            "Architectural Digest editorial quality, 8k detail."
        ),
        ("BOHEMIAN", "bedroom"): (
            "A richly layered Bohemian retreat with global-inspired warmth. "
            "A queen bed with carved reclaimed wood headboard, dressed in mustard velvet "
            "and terracotta kilim throw pillows. Vintage brass pendant lamp overhead. "
            "A rattan nightstand holds a ceramic table lamp with linen shade. "
            "Macramé wall hanging above the headboard in natural cotton. "
            "Layered vintage Turkish rugs in faded rust and olive tones on hardwood floor. "
            "Trailing pothos and monstera in woven baskets. "
            "Shot on medium format, warm golden hour light, rich color depth, "
            "Domino Magazine editorial quality, 8k detail."
        ),
        ("COASTAL", "bedroom"): (
            "A breezy Coastal bedroom with sun-bleached organic textures. "
            "A queen bed in whitewashed reclaimed pine with a linen-slipcovered headboard "
            "in natural oatmeal, dressed in soft blue chambray and white waffle-knit layers. "
            "Driftwood nightstands with jute-wrapped drawer pulls. "
            "Woven rattan pendant light casting warm diffused glow. "
            "Above the bed, a pair of abstract ocean-inspired prints in bleached wood frames. "
            "Jute area rug with seafoam border grounds the space. "
            "Shot on Hasselblad, bright natural coastal light, airy atmosphere, "
            "Architectural Digest editorial quality, 8k detail."
        ),
        ("MIDCENTURY", "bedroom"): (
            "A confident Mid-Century Modern bedroom with sculptural elegance. "
            "A queen platform bed in oiled walnut with a tufted bouclé headboard in cream. "
            "Tapered brass-leg nightstands in teak with atomic-era ceramic lamps. "
            "A molded plywood Eames-inspired lounge chair in cognac leather by the window. "
            "Abstract geometric art in warm mustard and olive on the wall. "
            "A hand-tufted wool rug in burnt orange and cream geometric pattern. "
            "Shot on medium format, warm afternoon light, rich wood tones, "
            "Dwell Magazine editorial quality, 8k detail."
        ),
        ("MINIMALIST", "bedroom"): (
            "A precisely curated Minimalist bedroom where every element earns its place. "
            "A queen platform bed in white oak with clean lines, dressed in pure white "
            "Egyptian cotton and a single cashmere throw in warm grey. "
            "Floating matte black nightstand with integrated LED strip at 3000K. "
            "A single large-scale abstract photograph in thin black frame. "
            "Polished concrete accent wall meets warm white plaster. "
            "Ivory wool area rug with subtle texture. "
            "Shot on Hasselblad, controlled directional light, gallery-like precision, "
            "Cereal Magazine editorial quality, 8k detail."
        ),
        ("MINIMAL", "bedroom"): (
            "A precisely curated Minimalist bedroom where every element earns its place. "
            "A queen platform bed in white oak with clean lines, dressed in pure white "
            "Egyptian cotton and a single cashmere throw in warm grey. "
            "Floating matte black nightstand with integrated LED strip at 3000K. "
            "A single large-scale abstract photograph in thin black frame. "
            "Ivory wool area rug with subtle texture. "
            "Shot on Hasselblad, controlled directional light, gallery-like precision, "
            "Cereal Magazine editorial quality, 8k detail."
        ),
        ("SCANDINAV", "bedroom"): (
            "A bright Scandinavian bedroom flooded with natural light. "
            "A queen bed in pale birch with a sheepskin-draped headboard, dressed in white "
            "linen duvet with pale grey wool throw. Slim white oak nightstand with a matte "
            "ceramic lamp in soft blush. Above the bed, a single botanical print in thin "
            "birch frame. Soft sage linen curtains filter daylight. A cream wool Berber rug "
            "on pale hardwood floors. Single trailing pothos on the nightstand. "
            "Shot on Hasselblad, bright Nordic morning light, airy and clean, "
            "Kinfolk Magazine editorial quality, 8k detail."
        ),
        ("INDUSTRIAL", "bedroom"): (
            "A dramatic Industrial bedroom in a converted loft space. "
            "A queen bed with raw steel frame and aged leather headboard in dark cognac. "
            "Reclaimed barn wood nightstands with black iron pipe legs. "
            "Oversized Edison bulb pendant hanging from exposed ceiling pipe. "
            "Exposed brick accent wall behind the bed, raw concrete floor with a "
            "worn Persian rug in faded indigo and rust. Metal-framed mirror leaning "
            "against the wall. Canvas tote and vintage factory stool as side table. "
            "Shot on medium format, dramatic side lighting, deep shadows, "
            "Apartment Therapy editorial quality, 8k detail."
        ),
        ("FARMHOUSE", "bedroom"): (
            "A warm Modern Farmhouse bedroom with heirloom character. "
            "A queen bed with whitewashed reclaimed pine headboard, dressed in cream "
            "cotton ticking stripe duvet and sage green linen pillows. "
            "Distressed white nightstands with wrought iron pulls holding stoneware lamps. "
            "Shiplap accent wall painted in antique white behind the bed. "
            "A vintage braided jute rug on wide-plank hardwood floors. "
            "Fresh eucalyptus in a galvanized metal pitcher on the nightstand. "
            "Shot on Hasselblad, warm afternoon light through linen curtains, "
            "Country Living editorial quality, 8k detail."
        ),
        ("ARTDECO", "bedroom"): (
            "A glamorous Art Deco bedroom with geometric opulence. "
            "A queen bed with a tall fluted velvet headboard in deep emerald, "
            "dressed in champagne silk with a black lacquer bed frame with brass inlay. "
            "Mirrored nightstands with sunburst brass drawer pulls holding crystal lamps. "
            "A geometric chevron rug in black and gold. Above the bed, a large sunburst "
            "mirror in antiqued gold. Smoked glass and brass pendant chandelier overhead. "
            "Rich navy velvet curtains with gold tiebacks. "
            "Shot on medium format, warm theatrical lighting, rich contrast, "
            "Elle Decor editorial quality, 8k detail."
        ),
        ("BIOPHILIC", "bedroom"): (
            "A lush Biophilic bedroom that feels like a living greenhouse. "
            "A queen bed with a live-edge walnut headboard, dressed in organic cotton "
            "in botanical white and forest green linen throw. Cork nightstands holding "
            "terracotta pot lamps with woven seagrass shades. Living moss art panel "
            "above the bed in a natural stone frame. Trailing string-of-pearls and "
            "monstera in woven baskets flanking the bed. A stone-grey wool rug over "
            "warm terracotta tile floor. Natural light through sheer linen curtains. "
            "Shot on Hasselblad, bright greenhouse-quality light, lush and alive, "
            "Architectural Digest editorial quality, 8k detail."
        ),
    }

    key = (style_name, room_type)
    if key in templates:
        return templates[key]

    # Generic fallback using archetype data
    return (
        f"A beautifully designed {style_name.lower()} {room_type} interior. "
        f"Mood: {archetype['mood']}. "
        f"Materials throughout: {archetype['materials']}. "
        f"Color palette: {archetype['palette']}. "
        f"Every piece is intentionally placed with design coherence. "
        f"{archetype['philosophy']}. "
        f"Professional editorial interior photography, Hasselblad quality, "
        f"soft natural light, sharp focus, Architectural Digest quality, 8k detail."
    )


# ---------------------------------------------------------------------------
# Fix 5 — Post-render watermark/text detection and removal
# ---------------------------------------------------------------------------

def detect_and_remove_watermarks(
    image_url: str,
    room_id: str,
    supabase_url: str,
    supabase_key: str,
) -> str:
    """
    Detect hallucinated text/watermarks in the render via OCR.
    If found, inpaint those regions with Fill Pro.
    Returns cleaned URL or original if no text found.
    """
    import cv2
    import numpy as np
    import requests
    from PIL import Image

    try:
        import pytesseract
    except ImportError:
        print("[watermark] pytesseract not available — skipping")
        return image_url

    # Download image
    try:
        resp = requests.get(image_url, timeout=60)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGB")
        img_arr = np.array(img)
        h, w = img_arr.shape[:2]
    except Exception as e:
        print(f"[watermark] Failed to download image: {e}")
        return image_url

    # Run OCR
    try:
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
    except Exception as e:
        print(f"[watermark] OCR failed: {e} — skipping")
        return image_url

    # Known watermark/hallucination patterns
    watermark_patterns = [
        "collov", "kki", "timgraphy", "watermark", "stock", "getty",
        "shutter", "adobe", "alamy", "dreamstime", "istock", "123rf",
        "deposit", "fotolia", ".com", ".ai", "www.", "http",
        "copyright", "photo by", "credit", "studio",
    ]

    text_regions = []
    n_boxes = len(data.get("text", []))
    for i in range(n_boxes):
        conf = int(data["conf"][i]) if str(data["conf"][i]) != "-1" else -1
        text = str(data["text"][i]).strip()
        if conf < 30 or len(text) < 3:
            continue

        text_lower = text.lower()
        is_watermark = any(pat in text_lower for pat in watermark_patterns)

        if is_watermark:
            x, y, bw, bh = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
            text_regions.append({
                "text": text,
                "bbox": (x, y, bw, bh),
                "conf": conf,
            })

    if not text_regions:
        print("[watermark] No watermark text detected — clean render")
        return image_url

    print(f"[watermark] Found {len(text_regions)} watermark text regions:")
    for tr in text_regions:
        print(f"  '{tr['text']}' at {tr['bbox']} (conf={tr['conf']})")

    # Build inpaint mask for watermark regions
    text_mask = np.zeros((h, w), dtype=np.uint8)
    for tr in text_regions:
        x, y, bw, bh = tr["bbox"]
        # Expand bbox by 20px
        x1 = max(0, x - 20)
        y1 = max(0, y - 20)
        x2 = min(w, x + bw + 20)
        y2 = min(h, y + bh + 20)
        text_mask[y1:y2, x1:x2] = 255

    # Dilate mask by 10px
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21))
    text_mask = cv2.dilate(text_mask, k, iterations=1)

    # Upload mask
    from mask_build import upload_mask_to_supabase
    text_mask_url = upload_mask_to_supabase(
        text_mask,
        f"masks/{room_id}/watermark_mask_{int(_time_module.time())}.png",
        supabase_url, supabase_key,
    )

    # Re-upload to fal
    fal_img = _upload_to_fal(image_url)
    fal_mask = _upload_to_fal(text_mask_url)

    # Inpaint with Fill Pro
    try:
        import fal_client
        handle = fal_client.submit("fal-ai/flux-pro/v1/fill", arguments={
            "image_url": fal_img,
            "mask_url": fal_mask,
            "prompt": (
                "clean wall surface matching surrounding interior, seamless texture, "
                "no text, no watermarks, no logos, no signatures, "
                "professional interior photography, 8k"
            ),
            "seed": 42,
            "num_images": 1,
            "output_format": "png",
            "safety_tolerance": "2",
        })
        result = handle.get()
        images = result.get("images") or []
        if not images:
            single = result.get("image")
            if single and isinstance(single, dict) and "url" in single:
                images = [single]

        if images:
            cleaned_url = images[0].get("url", "")
            if cleaned_url:
                import requests as _req2
                cleaned_bytes = _req2.get(cleaned_url, timeout=60).content
                cleaned_path = f"renders/{room_id}/watermark_cleaned_{int(_time_module.time())}.jpg"
                final_url = _upload_to_supabase(
                    cleaned_bytes, cleaned_path, supabase_url, supabase_key
                )
                print(f"[watermark] Watermarks removed — cleaned: {final_url[:80]}")
                return final_url
    except Exception as e:
        print(f"[watermark] Fill Pro inpaint failed: {e}")

    return image_url


# ---------------------------------------------------------------------------
# Main generation function — v6 unified Fill Pro pipeline with design briefs
# ---------------------------------------------------------------------------

@app.function(
    image=fal_image,
    timeout=600,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("fal-secrets"),
        modal.Secret.from_name("anthropic-credentials"),
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
    room_type: str = "room",
) -> dict:
    """
    v7 generation: no composite, semantic-only mask, Claude design briefs.

    Stage 1: Fill Pro aggressively empties the room (architecture shell only)
    Stage 2: Fill Pro fills with Claude-generated design brief (x4 candidates)
    Stage 3: Post-processing only (color grading). NO composite.

    Mask: architecture-inverse from OneFormer semantic segmentation.
    No spatial strips. Everything non-structural gets regenerated.
    Fill Pro output used directly — no blending with original photo.
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

    # ── SAM2 refinement — subtract wall-mounted objects from arch mask ──
    # OneFormer classifies wall text, garlands, posters, caps as "wall".
    # SAM2 auto-segment finds them as distinct objects and carves them out.
    try:
        arch_mask = subtract_wall_objects_via_sam(
            arch_mask=arch_mask,
            image_url=input_image,
            image_hw=image_hw,
        )
        print(f"[phase4b] Architecture mask after SAM refinement: "
              f"{np.count_nonzero(arch_mask > 0)} pixels protected")
    except Exception as sam_err:
        print(f"[phase4b] SAM refinement failed (non-critical): {sam_err}")

    # ── Build mask — ALWAYS architecture-inverse (regenerate everything) ──
    # The fundamental strategy: everything that isn't walls/floor/ceiling/
    # windows/doors gets regenerated. This eliminates ALL leftover items —
    # no backpacks, no decorations, no clutter survives.
    mask_result = None
    mask_source = "none"

    # Compute keep list — only items user explicitly chose to preserve
    norm_decisions = {normalize_label_key(k): v for k, v in keep_remove_decisions.items()}
    remove_decision_keys = []
    keep_decision_keys = []
    for k, v in norm_decisions.items():
        cat = get_category_for_label(k, detected_items)
        if cat in HARD_STRUCTURAL:
            continue
        if v == "keep":
            keep_decision_keys.append(k)
        else:
            remove_decision_keys.append(k)

    # Collect kept item masks (if user explicitly kept specific items)
    kept_item_mask_arrays = []
    if keep_decision_keys and masks_ready and item_masks:
        import requests as _req_masks
        from PIL import Image as _MaskImg
        norm_masks = {normalize_label_key(k): v for k, v in item_masks.items()}
        for key in keep_decision_keys:
            mask_url = norm_masks.get(key)
            if not mask_url or not mask_url.startswith("https://"):
                continue
            try:
                resp = _req_masks.get(mask_url, timeout=30)
                resp.raise_for_status()
                mask_img = _MaskImg.open(io.BytesIO(resp.content)).convert("L")
                kept_item_mask_arrays.append(np.array(mask_img, dtype=np.uint8))
                print(f"[phase4b] Will preserve kept item: '{key}'")
            except Exception as e:
                print(f"[phase4b] Could not load kept item mask for '{key}': {e}")

    # PRIMARY STRATEGY: Architecture-inverse mask
    print(f"[phase4b] Using architecture-inverse mask (regenerate ALL non-structural)")
    if kept_item_mask_arrays:
        print(f"[phase4b] Subtracting {len(kept_item_mask_arrays)} user-kept items from mask")
    try:
        mask_result = build_architecture_inverse_mask(
            architecture_mask=arch_mask,
            image_hw=image_hw,
            room_id=room_id,
            supabase_url=supabase_url,
            supabase_key=supabase_key,
            kept_item_masks=kept_item_mask_arrays if kept_item_mask_arrays else None,
        )
        if mask_result:
            mask_source = "architecture_inverse"
            remove_decision_keys = ["all_non_structural"]
    except Exception as mask_err:
        print(f"[phase4b] Architecture-inverse mask failed: {mask_err}")
        raise RuntimeError(f"[phase4b] Cannot build mask for room {room_id}: {mask_err}")

    combined_mask_url, dilated_mask = mask_result

    print(f"[phase4b] ROUTE: unified Fill Pro (mask_source={mask_source})")
    print(f"[phase4b] Input image: {input_image[:80]}")
    print(f"[phase4b] Mask URL: {combined_mask_url[:80]}")

    # ── Mask polarity check ─────────────────────────────────────────────
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

    # ── Pre-Stage 1: Clean input image ────────────────────────────────
    # Paint over all removable regions with sampled wall/floor color.
    # This prevents Fill Pro from reproducing text, logos, clutter.
    cleaned_image_url = None
    try:
        # Build kept items mask union for exclusion from cleaning
        kept_union = None
        if kept_item_mask_arrays:
            kept_union = np.zeros(image_hw, dtype=np.uint8)
            for km in kept_item_mask_arrays:
                if km.shape[:2] != image_hw:
                    km = cv2.resize(km, (image_hw[1], image_hw[0]), interpolation=cv2.INTER_NEAREST)
                kept_union = np.maximum(kept_union, km)

        # The regeneration mask = inverse of arch_mask (same as what Fill Pro sees)
        regen_for_clean = np.where(arch_mask > 0, 0, 255).astype(np.uint8)
        cleaned_arr = clean_input_image(
            image=orig_arr,
            regenerate_mask=regen_for_clean,
            architecture_mask=arch_mask,
            kept_item_mask=kept_union,
        )

        # Upload cleaned image to Supabase
        cleaned_pil = _Img.fromarray(cleaned_arr)
        cleaned_buf = io.BytesIO()
        cleaned_pil.save(cleaned_buf, format="JPEG", quality=95)
        cleaned_path = f"renders/{room_id}/cleaned_input_{int(_time_module.time())}.jpg"
        cleaned_image_url = _upload_to_supabase(
            cleaned_buf.getvalue(), cleaned_path, supabase_url, supabase_key
        )
        print(f"[phase4b] Cleaned input uploaded: {cleaned_image_url[:80]}")
        # Use cleaned image as input to Fill Pro
        stage1_input_url = cleaned_image_url
    except Exception as clean_err:
        print(f"[phase4b] Input cleaning failed (non-critical): {clean_err}")
        stage1_input_url = input_image

    # ── Stage 1: Neutral removal ────────────────────────────────────────
    neutral_prompt = get_neutral_fill_prompt(room_type)
    print(f"[phase4b] Stage 1 prompt (room_type={room_type}): {neutral_prompt[:100]}")
    print("[phase4b] Stage 1: Submitting Fill Pro (neutral removal)...")

    # Re-upload to fal.ai storage for guaranteed access
    fal_input_image = _upload_to_fal(stage1_input_url)
    fal_mask_url = _upload_to_fal(combined_mask_url)

    fill_args = {
        "image_url": fal_input_image,
        "mask_url": fal_mask_url,
        "prompt": neutral_prompt,
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

    # ── Stage 1.5: Vision-aware Design Director ───────────────────────
    # Claude Sonnet sees the Stage 1 empty room and plans the design
    # with spatial awareness: where furniture goes, light direction, colors.
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    style_trigger = lora_trigger_words[0] if lora_trigger_words else style_prompt.split()[0] if style_prompt else "COVAJAPANDI"

    # Get style archetype for the director
    style_upper = style_trigger.upper().replace(" ", "")
    archetype = None
    for key, data in STYLE_ARCHETYPES.items():
        if key in style_upper:
            archetype = data
            style_name_for_brief = key.replace("COVA", "")
            break
    if not archetype:
        for key, data in STYLE_ARCHETYPES.items():
            short = key.replace("COVA", "").lower()
            if short in style_upper.lower():
                archetype = data
                style_name_for_brief = key.replace("COVA", "")
                break
    if not archetype:
        archetype = STYLE_ARCHETYPES["COVAJAPANDI"]
        style_name_for_brief = "JAPANDI"

    design_brief = None
    if anthropic_key and stage1_supabase_url:
        try:
            import anthropic
            import base64 as _b64

            # Download Stage 1 image for vision
            stage1_img_bytes = _download_bytes(stage1_supabase_url)
            stage1_b64 = _b64.b64encode(stage1_img_bytes).decode("utf-8")

            director_system = (
                "You are an Architectural Digest interior designer. "
                "You see an empty room photo. Write a FLUX image generation prompt "
                "to fill this specific room with furniture in the requested style. "
                "Be spatially precise — reference what you SEE: wall positions, "
                "window locations, light direction, room proportions. "
                "Output ONLY the prompt text, 100-150 words, no JSON, no preamble."
            )

            rt = room_type.replace("_", " ") if room_type else "bedroom"
            director_user = (
                f"Design a {style_name_for_brief} {rt} for this empty room.\n\n"
                f"Style: {archetype['mood']}\n"
                f"Materials: {archetype['materials']}\n"
                f"Palette: {archetype['palette']}\n"
                f"Philosophy: {archetype['philosophy']}\n\n"
                f"Requirements:\n"
                f"- Pick EXACTLY 3 colors from the palette. ALL textiles and decor use ONLY these 3 colors.\n"
                f"- Place hero furniture (centered or against main wall)\n"
                f"- Add 2 supporting pieces, 1 wall art, 1 rug\n"
                f"- Reference the window position and light direction you see\n"
                f"- Use spatial phrases: 'centered against back wall', 'left of bed', 'above headboard'\n"
                f"- End with: 'Shot on Hasselblad 50mm, natural window light, shallow depth of field, "
                f"Architectural Digest editorial, 8k'\n"
                f"- NEVER mention: removing furniture, the redesign process, 'empty room'\n"
                f"- Through windows: preserve the existing outdoor view exactly, no changes\n"
                f"- On walls: no text, no signs, no numbers, no hallucinated posters\n"
                f"- No additional windows or doors. No impossible geometry."
            )

            anth_client = anthropic.Anthropic(api_key=anthropic_key)
            response = anth_client.messages.create(
                model="claude-sonnet-4-5-20250514",
                max_tokens=400,
                system=director_system,
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": stage1_b64,
                            },
                        },
                        {"type": "text", "text": director_user},
                    ],
                }],
            )
            design_brief = response.content[0].text.strip()
            if design_brief.startswith('"') and design_brief.endswith('"'):
                design_brief = design_brief[1:-1]
            print(f"[phase4b] Design Director (vision): {design_brief[:150]}...")
        except Exception as dd_err:
            print(f"[phase4b] Design Director failed: {dd_err}")

    # Fallback to template brief if Director failed
    if not design_brief:
        design_brief = generate_design_brief(
            style_trigger=style_trigger,
            room_type=room_type,
            anthropic_api_key=anthropic_key,
        )

    # ── Append anti-hallucination + editorial photography (Fixes 3-5) ──
    anti_hallucination = (
        "Through windows: view matches existing photo exactly, no weather changes, "
        "no season changes. On walls: no text, no signs, no numbers, no hallucinated posters. "
        "No additional windows or doors. No impossible geometry. "
        "All furniture sits on floor with proper contact shadows. "
        "NO WATERMARKS anywhere. NO TEXT anywhere except where explicitly specified. "
        "NO logos, NO signatures, NO studio names, NO photographer credits, "
        "NO website URLs, NO branded content. Clean interior photography "
        "without any overlays or text. Reject any textual elements not described above."
    )

    editorial_photo = (
        "Shot on Hasselblad medium format, 50mm lens, natural window light, "
        "subtle fill from bedside lamp, shallow depth of field on hero furniture, "
        "crisp textures on fabric and wood, editorial magazine framing with rule of thirds, "
        "eye-level camera at 4 feet, Architectural Digest cover standard, 8k detail."
    )

    full_brief = f"{design_brief} {anti_hallucination} {editorial_photo}"

    # Build final prompt: LoRA triggers (3x) + full brief
    if lora_trigger_words:
        triggers_3x = " ".join([t for t in lora_trigger_words] * 3)
        styled_fill_prompt = f"{triggers_3x} style, {full_brief}, {triggers_3x}"
        print(f"[phase4b] LoRA triggers (3x): {triggers_3x}")
    else:
        styled_fill_prompt = full_brief

    print(f"[phase4b] Stage 2 prompt ({len(styled_fill_prompt.split())} words): {styled_fill_prompt[:200]}")
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
                "guidance_scale": 2.5,  # Lower = fewer hallucinated watermarks/text
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

    # ── Upload Stage 2 raw AI output for diagnostics ──────────────────────
    stage2_raw_supabase_url = None
    try:
        stage2_raw_bytes = _req.get(raw_output_url, timeout=60).content
        stage2_raw_path = f"renders/{room_id}/stage2_raw_{int(_time_module.time())}.jpg"
        stage2_raw_supabase_url = _upload_to_supabase(
            stage2_raw_bytes, stage2_raw_path, supabase_url, supabase_key
        )
        print(f"[phase4b] Stage 2 raw uploaded: {stage2_raw_supabase_url[:80]}")
    except Exception as s2_err:
        print(f"[phase4b] Stage 2 raw upload failed: {s2_err}")

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
                "pipeline_version": "v8-vision-director",
            }
            client.table("renders").insert(render_row).execute()
        print(f"[phase4b] Stored {len(all_scores)} candidate scores in renders table")
    except Exception as db_score_err:
        print(f"[phase4b] Failed to store candidate scores: {db_score_err}")

    # ── Fix 5: Post-render watermark detection and removal ──────────────
    try:
        raw_output_url = detect_and_remove_watermarks(
            image_url=raw_output_url,
            room_id=room_id,
            supabase_url=supabase_url,
            supabase_key=supabase_key,
        )
    except Exception as wm_err:
        print(f"[phase4b] Watermark detection failed (non-critical): {wm_err}")

    # ── Stage 3: Post-process Stage 2 raw output directly (NO composite) ──
    # v7: Fill Pro output IS the final render. No pixel blending with original.
    # Post-processing chain adds magazine-quality color grading only.
    before_url = stage2_raw_supabase_url
    try:
        ai_arr = _download_image_as_array(raw_output_url)

        # Post-processing chain — magazine quality color grading
        try:
            from postprocess import run_postprocessing_chain

            ai_arr = run_postprocessing_chain(
                composite=ai_arr,
                original=orig_arr,
                arch_mask=arch_mask,
                furniture_mask=None,
                depth_map=None,
                window_direction=None,
                style_name="",
                tier="default",
            )
            print("[phase4b] Post-processing chain complete")
        except Exception as pp_err:
            print(f"[phase4b] Post-processing FAILED — using raw Stage 2 output: {pp_err}")
            import traceback
            traceback.print_exc()

        # Upload final
        processed_pil = _Img.fromarray(ai_arr)
        buf = io.BytesIO()
        processed_pil.save(buf, format="JPEG", quality=95)
        processed_bytes = buf.getvalue()

        final_path = f"renders/{room_id}/final_{int(_time_module.time())}.jpg"
        final_url = _upload_to_supabase(processed_bytes, final_path, supabase_url, supabase_key)
        print(f"[phase4b] Final (post-processed) uploaded: {final_url[:80]}")

    except Exception as pp_err:
        print(f"[phase4b] Post-processing FAILED — using raw output: {pp_err}")
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
        "composite_applied": False,
        "image_url": final_url,
        "route_used": "fill_pro_direct",
        "mask_url": combined_mask_url,
        "mask_source": mask_source,
        "seed": best.get("seed", base_seed),
        "endpoint_used": "fal-ai/flux-pro/v1/fill x 2 stages",
        "aesthetic_score": aesthetic_score,
        "hps_score": hps_score,
        "q_align_score": q_align_score,
        "ensemble_score": ensemble_score,
        "all_scores": all_scores,
        "fill_prompt_used": neutral_prompt,
        "styled_fill_prompt": styled_fill_prompt,
        "cleaned_input_url": cleaned_image_url if 'cleaned_image_url' in dir() else None,
        "stage1_empty_room_url": stage1_supabase_url,
        "stage2_raw_ai_output_url": stage2_raw_supabase_url,
        "stage1_url": stage1_supabase_url,
        "loras_applied": False,
        "loras_in_prompt": bool(lora_trigger_words),
        "lora_triggers_appended": lora_trigger_words,
        "num_candidates": len(candidates),
        "pipeline_version": "v8-vision-director",
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
