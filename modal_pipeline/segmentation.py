"""
Cova — Layered Segmentation Pipeline

Four-layer architecture for pixel-perfect room segmentation:

  Layer A: OneFormer ADE20K-panoptic (architecture: wall, ceiling, floor, window, door)
  Layer B: SAM3 full-image (furniture instances, up to 32 masks)
  Layer C: SAM3 ceiling-ROI (ceiling fixtures: fans, chandeliers, pendants, garlands)
  Layer D: Depth Anything V2 (depth map for downstream ControlNet)

Orchestration:
  A + D run in parallel.
  B runs after A starts (independent).
  C runs after A completes (needs ceiling bbox from OneFormer).
  Post-processing: class-aware dilation, architecture set-difference, small-component removal.

Entry points:
  - segment_room_layered(room_id, photo_url, detected_items) -> dict
  - segment_room_layered_api (FastAPI POST webhook)
"""

import io
import os
from typing import Any

import modal

# ---------------------------------------------------------------------------
# Modal images
# ---------------------------------------------------------------------------

# OneFormer image — torch + transformers + detectron2
oneformer_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "torch",
        "torchvision",
        "transformers>=4.40.0",
        "scipy",
        "Pillow",
        "numpy",
        "opencv-python-headless",
        "requests",
        "supabase",
        "fal-client",
        "fastapi[standard]",
    )
    .add_local_file("modal_pipeline/utils.py", "/root/utils.py")
)

app = modal.App("cova-segmentation")

STORAGE_BUCKET = "room-photos"

# OneFormer ADE20K class indices for architecture
# ADE20K class list: https://docs.google.com/spreadsheets/d/1se8YEtb2detS7OuPE86fXGyD269pMycAWe2mtKUj2W8
# These are 0-indexed class IDs from the ADE20K-150 panoptic label set.
ARCH_CLASS_IDS = {
    0: "wall",
    1: "floor",
    2: "ceiling",
    5: "window",
    14: "door",
    33: "column",
    # 49 = beam (rarer, included for completeness)
}

# SAM3 furniture prompt — all 28 classes dot-separated
SAM3_FURNITURE_PROMPT = (
    "bed . sofa . chair . dining table . coffee table . side table . nightstand . "
    "dresser . wardrobe . cabinet . shelf . bookshelf . rug . lamp . floor lamp . "
    "pillow . cushion . ottoman . bench . tv . television . mirror . wall art . "
    "painting . curtain . blind . plant . vase ."
)

# SAM3 ceiling-specific prompt
SAM3_CEILING_PROMPT = (
    "ceiling fan . ceiling fan blades . chandelier . pendant light . hanging lamp . "
    "string lights . garland . recessed light . wall letter . wooden letter . "
    "decorative letter ."
)

# Classes where tiny components should NOT be dropped (they're legitimately small)
KEEP_TINY_CLASSES = frozenset({
    "garland", "string_lights", "string lights", "wall_letter", "wall letter",
    "wooden_letter", "wooden letter", "decorative_letter", "decorative letter",
})

# Classes that are MOUNTED ON architecture (wall-mounted, ceiling-mounted).
# These should NOT have architecture subtracted — they overlap with walls/ceiling
# by definition. Without this, wall letters get subtracted to zero because
# they sit on a wall that OneFormer correctly classified as architecture.
SKIP_ARCH_SUBTRACTION = frozenset({
    "wall_letter", "wall_letters", "wall letter", "wall letters",
    "wooden_letter", "wooden letters", "decorative_letter",
    "wall_art", "wall art", "painting", "poster", "picture_frame",
    "wall_sconce", "sconce", "wall_decor", "wall_decal",
    "ceiling_fan", "ceiling fan", "chandelier", "pendant_light", "pendant light",
    "hanging_lamp", "hanging lamp", "recessed_light", "recessed light",
    "string_lights", "string lights", "garland", "photo_garland", "photo garland",
    "mirror", "tv", "television", "clock",
})

# Minimum component area as fraction of image (0.01%)
MIN_COMPONENT_AREA_FRAC = 0.0001


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _download_bytes(url: str) -> bytes:
    import requests
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return resp.content


def _upload_mask_bytes(png_bytes: bytes, path: str, supabase_url: str, supabase_key: str) -> str:
    """Upload PNG mask bytes to Supabase Storage, return public URL."""
    from supabase import create_client

    client = create_client(supabase_url, supabase_key)
    file_opts = {"content-type": "image/png", "upsert": "true"}
    try:
        client.storage.from_(STORAGE_BUCKET).upload(
            path=path, file=png_bytes, file_options=file_opts,
        )
    except Exception as e:
        err_str = str(e).lower()
        if "already exists" in err_str or "duplicate" in err_str or "409" in err_str:
            client.storage.from_(STORAGE_BUCKET).update(
                path=path, file=png_bytes, file_options=file_opts,
            )
        else:
            raise

    return f"{supabase_url}/storage/v1/object/public/{STORAGE_BUCKET}/{path}"


def _array_to_png_bytes(mask_array) -> bytes:
    """Convert a uint8 numpy array (H, W) to PNG bytes."""
    from PIL import Image
    img = Image.fromarray(mask_array, mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# FastAPI webhook endpoint — all-in-one (OneFormer + SAM3 + depth)
# ---------------------------------------------------------------------------

@app.function(
    image=oneformer_image,
    gpu="A10G",
    timeout=300,
    memory=16384,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("fal-secrets"),
    ],
)
@modal.fastapi_endpoint(method="POST")
def segment_room_layered_api(request_data: dict) -> dict[str, Any]:
    """
    POST webhook for the layered segmentation pipeline.
    Runs everything inline (same container) — no cross-function call needed.
    Input: { room_id, photo_url, detected_items }
    Output: { arch_mask_url, instance_masks, depth_url }
    """
    import cv2
    import numpy as np
    import torch
    import fal_client
    from PIL import Image
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from transformers import AutoProcessor, AutoModelForUniversalSegmentation

    from utils import normalize_label_key, get_dilation_px, HARD_STRUCTURAL

    room_id = request_data.get("room_id")
    photo_url = request_data.get("photo_url")
    detected_items = request_data.get("detected_items", [])

    if not room_id or not photo_url:
        return {"error": "room_id and photo_url required"}

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    try:
        # Download image
        print(f"[segmentation] Downloading photo: {photo_url[:80]}...")
        img_bytes = _download_bytes(photo_url)
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        image_w, image_h = image.size
        image_np = np.array(image)
        long_edge = max(image_w, image_h)
        print(f"[segmentation] Image dimensions: {image_w}x{image_h}")

        device = "cuda" if torch.cuda.is_available() else "cpu"

        # ── Layer A: OneFormer ──────────────────────────────────────────
        print("[segmentation] Layer A: Loading OneFormer...")
        processor = AutoProcessor.from_pretrained("shi-labs/oneformer_ade20k_swin_large")
        model = AutoModelForUniversalSegmentation.from_pretrained(
            "shi-labs/oneformer_ade20k_swin_large"
        ).to(device)
        model.eval()

        inputs = processor(images=image, task_inputs=["panoptic"], return_tensors="pt")
        inputs = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = model(**inputs)

        result = processor.post_process_panoptic_segmentation(
            outputs, target_sizes=[(image_h, image_w)],
        )[0]

        seg_map = result["segmentation"].cpu().numpy()
        segments_info = result["segments_info"]

        arch_mask = np.zeros((image_h, image_w), dtype=np.uint8)
        ceiling_bbox = None

        for seg_info in segments_info:
            label_id = seg_info["label_id"]
            seg_id = seg_info["id"]
            if label_id in ARCH_CLASS_IDS:
                region = (seg_map == seg_id)
                arch_mask[region] = 255
                class_name = ARCH_CLASS_IDS[label_id]
                print(f"[oneformer] Found {class_name}: {np.count_nonzero(region)} pixels")
                if label_id == 2:  # ceiling
                    ys, xs = np.where(region)
                    if len(ys) > 0:
                        ceiling_bbox = (int(ys.min()), int(xs.min()), int(ys.max()), int(xs.max()))

        # Fallback strips
        ceiling_end = int(image_h * 0.06)
        floor_start = int(image_h * 0.85)
        arch_mask[:ceiling_end, :] = 255
        arch_mask[floor_start:, :] = 255

        arch_coverage = np.count_nonzero(arch_mask > 0) / arch_mask.size
        print(f"[oneformer] Architecture mask coverage: {arch_coverage:.1%}")

        # Free GPU memory
        del model, outputs, inputs
        torch.cuda.empty_cache()

        # Upload arch mask
        arch_mask_url = _upload_mask_bytes(
            _array_to_png_bytes(arch_mask),
            f"masks/{room_id}/arch_mask.png",
            supabase_url, supabase_key,
        )
        print(f"[segmentation] Layer A done — arch mask uploaded")

        # ── Layers B + D: Per-item SAM3 + depth in parallel ──────────────
        # SAM3 requires one prompt per object (multi-class prompts don't work).
        # We call SAM3 per detected item + depth in one big parallel batch.
        non_structural = [
            item for item in detected_items
            if normalize_label_key(item.get("category", "")) not in HARD_STRUCTURAL
               and normalize_label_key(item.get("label", "")) not in HARD_STRUCTURAL
        ]
        print(f"[segmentation] Layer B: SAM3 per-item × {len(non_structural)} + depth")

        def call_sam3_single(label: str):
            """Call SAM3 for a single object label."""
            r = fal_client.subscribe(
                "fal-ai/sam-3/image",
                arguments={
                    "image_url": photo_url,
                    "prompt": label.lower(),
                    "return_multiple_masks": True,
                    "max_masks": 3,
                    "include_scores": True,
                    "apply_mask": False,
                    "output_format": "png",
                },
                with_logs=False,
            )
            masks = r.get("masks") or []
            scores = r.get("scores") or []
            boxes = r.get("boxes") or []
            metadata = r.get("metadata") or []
            results = []
            for idx, m in enumerate(masks):
                url = m.get("url", "") if isinstance(m, dict) else ""
                if url:
                    score = 0.5  # default
                    if idx < len(scores) and scores[idx] is not None:
                        score = float(scores[idx])
                    elif idx < len(metadata) and isinstance(metadata[idx], dict):
                        score = float(metadata[idx].get("score", 0.5))
                    results.append({
                        "label": label.lower(),
                        "mask_url": url,
                        "score": score,
                    })
            return results

        def run_depth():
            return fal_client.subscribe(
                "fal-ai/imageutils/depth",
                arguments={"image_url": photo_url, "model": "depth-anything-v2"},
                with_logs=True,
            )

        all_instances = []
        depth_result = None

        # Run all SAM3 calls + depth in parallel
        with ThreadPoolExecutor(max_workers=8) as executor:
            depth_future = executor.submit(run_depth)
            sam3_futures = {
                executor.submit(call_sam3_single, item.get("label", "")): item.get("label", "")
                for item in non_structural if item.get("label")
            }

            # Collect SAM3 results
            for future in as_completed(sam3_futures):
                label = sam3_futures[future]
                try:
                    results = future.result()
                    if results:
                        # Take the highest-scoring mask for this label
                        best = max(results, key=lambda x: x["score"])
                        all_instances.append(best)
                        print(f"[sam3] '{label}': score={best['score']:.2f}")
                    else:
                        print(f"[sam3] '{label}': no mask returned")
                except Exception as e:
                    print(f"[sam3] '{label}' failed: {e}")

            # Collect depth
            try:
                depth_result = depth_future.result()
            except Exception as e:
                print(f"[segmentation] depth failed: {e}")

        print(f"[segmentation] SAM3 per-item: {len(all_instances)} masks from {len(non_structural)} items")

        # ── Layer C: SAM3 ceiling ROI ──────────────────────────────────
        print("[segmentation] Layer C: SAM3 ceiling ROI...")
        ceiling_crop_offset = None

        if ceiling_bbox is not None:
            y1, x1, y2, x2 = ceiling_bbox
            pad_h = int((y2 - y1) * 0.10)
            pad_w = int((x2 - x1) * 0.10)
            cy1 = max(0, y1 - pad_h)
            cx1 = max(0, x1 - pad_w)
            cy2 = min(image_h, y2 + pad_h)
            cx2 = min(image_w, x2 + pad_w)
            ceiling_crop_offset = (cx1, cy1)
        else:
            # Fallback: top 20%
            cy1, cx1 = 0, 0
            cy2 = int(image_h * 0.20)
            cx2 = image_w
            ceiling_crop_offset = (0, 0)
            print("[segmentation] No ceiling bbox — using top 20% fallback")

        # SAM3 needs one call per ceiling object type
        CEILING_ITEMS = [
            "ceiling fan", "chandelier", "pendant light",
            "hanging lamp", "string lights", "garland",
            "recessed light",
        ]

        if (cx2 - cx1) > 32 and (cy2 - cy1) > 32:
            crop = image.crop((cx1, cy1, cx2, cy2))
            crop_buf = io.BytesIO()
            crop.save(crop_buf, format="PNG")
            crop_bytes = crop_buf.getvalue()

            crop_path = f"masks/{room_id}/_ceiling_crop_temp.png"
            crop_url = _upload_mask_bytes(
                crop_bytes, crop_path, supabase_url, supabase_key,
            )

            def call_sam3_ceiling(item_label: str):
                r = fal_client.subscribe(
                    "fal-ai/sam-3/image",
                    arguments={
                        "image_url": crop_url,
                        "prompt": item_label,
                        "return_multiple_masks": True,
                        "max_masks": 3,
                        "include_scores": True,
                        "apply_mask": False,
                        "output_format": "png",
                    },
                    with_logs=False,
                )
                masks = r.get("masks") or []
                scores = r.get("scores") or []
                metadata = r.get("metadata") or []
                results = []
                for idx, m in enumerate(masks):
                    url = m.get("url", "") if isinstance(m, dict) else ""
                    if url:
                        score = 0.5
                        if idx < len(scores) and scores[idx] is not None:
                            score = float(scores[idx])
                        elif idx < len(metadata) and isinstance(metadata[idx], dict):
                            score = float(metadata[idx].get("score", 0.5))
                        results.append({
                            "label": item_label,
                            "mask_url": url,
                            "score": score,
                            "from_ceiling_roi": True,
                        })
                return results

            ceiling_count = 0
            with ThreadPoolExecutor(max_workers=4) as executor:
                ceiling_futures = {
                    executor.submit(call_sam3_ceiling, cl): cl
                    for cl in CEILING_ITEMS
                }
                for future in as_completed(ceiling_futures):
                    cl = ceiling_futures[future]
                    try:
                        results = future.result()
                        if results:
                            best = max(results, key=lambda x: x["score"])
                            if best["score"] > 0.3:
                                all_instances.append(best)
                                ceiling_count += 1
                                print(f"[sam3-ceiling] '{cl}': score={best['score']:.2f}")
                    except Exception as e:
                        print(f"[sam3-ceiling] '{cl}' failed: {e}")

            print(f"[segmentation] Layer C: {ceiling_count} ceiling fixtures detected")

        # ── Fallback to Grounded-SAM2 if SAM3 returned nothing ─────────
        if not all_instances:
            print("[segmentation] SAM3 returned 0 instances — no fallback in this endpoint")

        # ── Post-process instance masks ────────────────────────────────
        print(f"[segmentation] Post-processing {len(all_instances)} instance masks...")
        instance_mask_urls: dict[str, str] = {}

        for i, inst in enumerate(all_instances):
            label = inst.get("label", f"object_{i}")
            score = inst.get("score", 0.0)
            mask_url = inst.get("mask_url", "")
            if not mask_url:
                continue

            try:
                mask_data = _download_bytes(mask_url)
                mask_arr = np.array(
                    Image.open(io.BytesIO(mask_data)).convert("L"),
                    dtype=np.uint8,
                )

                # For ceiling ROI masks, paste into full-image canvas
                if inst.get("from_ceiling_roi") and ceiling_crop_offset is not None:
                    cx_off, cy_off = ceiling_crop_offset
                    full_mask = np.zeros((image_h, image_w), dtype=np.uint8)
                    mh, mw = mask_arr.shape[:2]
                    paste_y2 = min(image_h, cy_off + mh)
                    paste_x2 = min(image_w, cx_off + mw)
                    crop_h = paste_y2 - cy_off
                    crop_w = paste_x2 - cx_off
                    full_mask[cy_off:paste_y2, cx_off:paste_x2] = mask_arr[:crop_h, :crop_w]
                    mask_arr = full_mask

                # Resize to source dimensions
                if mask_arr.shape[:2] != (image_h, image_w):
                    mask_arr = cv2.resize(mask_arr, (image_w, image_h), interpolation=cv2.INTER_NEAREST)

                # Binarize
                mask_arr = ((mask_arr > 127).astype(np.uint8)) * 255

                # Morphological close
                k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
                mask_arr = cv2.morphologyEx(mask_arr, cv2.MORPH_CLOSE, k_close, iterations=2)

                # Drop tiny components (unless in KEEP_TINY_CLASSES)
                norm_label = normalize_label_key(label)
                if norm_label not in KEEP_TINY_CLASSES:
                    min_area = int(image_h * image_w * MIN_COMPONENT_AREA_FRAC)
                    num_labels, labels_map, stats, _ = cv2.connectedComponentsWithStats(mask_arr, connectivity=8)
                    for comp_id in range(1, num_labels):
                        if stats[comp_id, cv2.CC_STAT_AREA] < min_area:
                            mask_arr[labels_map == comp_id] = 0

                # Class-aware dilation
                dil_px = get_dilation_px(label, long_edge)
                if dil_px > 0:
                    k_size = dil_px * 2 + 1
                    k_dil = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_size, k_size))
                    mask_arr = cv2.dilate(mask_arr, k_dil, iterations=1)

                # Architecture set-difference — skip for wall/ceiling-mounted items
                if norm_label not in SKIP_ARCH_SUBTRACTION:
                    mask_arr = np.where(arch_mask > 0, 0, mask_arr).astype(np.uint8)
                else:
                    print(f"[segmentation] '{label}' is wall/ceiling-mounted — skipping arch subtraction")

                pixel_count = np.count_nonzero(mask_arr > 0)
                if pixel_count == 0:
                    print(f"[segmentation] Instance '{label}' empty after processing — skipping")
                    continue

                safe_label = normalize_label_key(label).replace(" ", "_")
                mask_path = f"masks/{room_id}/{safe_label}.png"
                uploaded_url = _upload_mask_bytes(
                    _array_to_png_bytes(mask_arr),
                    mask_path, supabase_url, supabase_key,
                )
                instance_mask_urls[label.lower()] = uploaded_url
                print(f"[segmentation] '{label}' — {pixel_count} px, dil={dil_px}px, score={score:.2f}")

            except Exception as e:
                print(f"[segmentation] Failed to process '{label}': {e}")
                continue

        # ── Depth URL ──────────────────────────────────────────────────
        depth_url = ""
        if depth_result:
            depth_url = depth_result.get("image", {}).get("url", "")

        print(f"[segmentation] DONE — arch_mask + {len(instance_mask_urls)} instances + depth")

        return {
            "arch_mask_url": arch_mask_url,
            "instance_masks": instance_mask_urls,
            "depth_url": depth_url,
            "ceiling_bbox": list(ceiling_bbox) if ceiling_bbox is not None else None,
        }

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[segmentation] ERROR: {tb}")
        return {"error": str(e), "traceback": tb}


# ---------------------------------------------------------------------------
# Local dev entry point
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def main(room_id: str = "test", photo_url: str = ""):
    if not photo_url:
        print(
            "Usage: modal run segmentation.py "
            "--room-id <id> --photo-url <url>"
        )
        return

    import json
    # Call the webhook function directly for local testing
    result = segment_room_layered_api.remote({
        "room_id": room_id,
        "photo_url": photo_url,
        "detected_items": [],
    })
    print(json.dumps(result, indent=2))
