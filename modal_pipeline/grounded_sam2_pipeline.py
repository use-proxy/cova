"""
Cova — Grounded-SAM2 Whole-Room Segmentation

Single-pass segmentation: Grounding DINO produces precise bboxes for every
detected item label; SAM2 produces pixel-perfect masks per box. Masks are
uploaded to Supabase Storage and a {label: public_url} map is returned.

Entry points:
  - segment_room(room_id, photo_url, detected_items) -> dict[label, mask_url]
  - segment_room_api  (FastAPI POST webhook)
"""

import io
import os
from typing import Any

import modal

app = modal.App("cova-grounded-sam2")

grounded_sam2_image = (
    modal.Image.from_registry(
        "nvidia/cuda:13.0.1-cudnn-devel-ubuntu22.04",
        add_python="3.11",
    )
    .pip_install(
        "pillow",
        "requests",
        "numpy",
        "supabase",
        "opencv-python-headless",
        "supervision",
        "fastapi[standard]",
    )
    .run_commands(
        "pip install sam2",
        "pip install transformers>=4.40.0",
    )
)

STORAGE_BUCKET = "room-photos"
SIZE_MAP = {"large": 0.65, "medium": 0.40, "small": 0.25}
FIXED_MIN_SIZE = 0.30

LABEL_ALIASES = {
    "ceiling fan": "ceiling fan . fan blades . ceiling light",
    "window blinds": "window blind . venetian blind . window shade . blinds",
    "photo garland": "photo garland . hanging photos . string photos . photo display",
    "rolling cart": "rolling cart . storage cart . drawer cart . rolling cabinet",
    "wall letters": "wall letters . foam letters . wooden letters . alphabet letters . name sign",
    "desk chair": "desk chair . office chair . computer chair",
    "bed": "bed . bed frame . mattress . bedding",
}

CATEGORY_KEYWORDS = {
    "lighting": ("fan", "light", "fixture", "lamp"),
    "wall_art": ("letter", "photo", "picture", "frame", "garland", "poster"),
    "storage": ("cart", "cabinet", "drawer", "shelf", "unit"),
}


def _norm(s: str) -> str:
    return "".join(ch for ch in (s or "").lower() if ch.isalnum())


def _labels_match(item_label: str, det_label: str, category: str = "") -> bool:
    na, nb = _norm(item_label), _norm(det_label)
    if not na or not nb:
        return False
    # 1. Exact match
    if na == nb:
        return True
    # 2. Contains match: item contains detected, OR detected contains any word
    #    from item label.
    il = (item_label or "").lower().strip()
    dl = (det_label or "").lower().strip()
    if dl and dl in il:
        return True
    for word in il.split():
        w = _norm(word)
        if w and len(w) >= 3 and w in nb:
            return True
    # 3-5. Category-based keywords
    cat = (category or "").lower().strip()
    keywords = CATEGORY_KEYWORDS.get(cat)
    if keywords:
        for kw in keywords:
            if kw in dl:
                return True
    return False


def _build_text_prompt(items: list[dict]) -> str:
    pieces: list[str] = []
    seen: set[str] = set()
    for item in items:
        raw = str(item.get("label", "")).lower().strip()
        if not raw:
            continue
        aliased = LABEL_ALIASES.get(raw, raw)
        if aliased in seen:
            continue
        seen.add(aliased)
        pieces.append(aliased)
    if not pieces:
        return ""
    return " . ".join(pieces) + " ."


@app.function(
    gpu="A10G",
    timeout=300,
    memory=16384,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("anthropic-credentials"),
    ],
    image=grounded_sam2_image,
)
def segment_room(
    room_id: str,
    photo_url: str,
    detected_items: list[dict],
) -> dict[str, str]:
    import numpy as np
    import requests
    import torch
    from PIL import Image
    from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor

    if not detected_items:
        return {}

    # --- Step 1: Download photo -----------------------------------------
    resp = requests.get(photo_url, timeout=30)
    resp.raise_for_status()
    image = Image.open(io.BytesIO(resp.content)).convert("RGB")
    image_width, image_height = image.size
    image_np = np.array(image)

    device = "cuda" if torch.cuda.is_available() else "cpu"

    # --- Step 2: Grounding DINO (primary pass) --------------------------
    processor = AutoProcessor.from_pretrained("IDEA-Research/grounding-dino-base")
    gdino = AutoModelForZeroShotObjectDetection.from_pretrained(
        "IDEA-Research/grounding-dino-base"
    ).to(device)

    text_prompt = _build_text_prompt(detected_items)

    def _run_gdino(pil_img: Image.Image, prompt: str):
        if not prompt:
            return np.zeros((0, 4), dtype=np.float32), [], np.zeros((0,), dtype=np.float32)
        inputs = processor(images=pil_img, text=prompt, return_tensors="pt").to(device)
        with torch.no_grad():
            outputs = gdino(**inputs)
        res = processor.post_process_grounded_object_detection(
            outputs,
            inputs.input_ids,
            target_sizes=[pil_img.size[::-1]],
            threshold=0.25,
        )[0]
        boxes = res["boxes"].detach().cpu().numpy()
        labels = [str(l) for l in res.get("labels", res.get("text", []))]
        scores = res["scores"].detach().cpu().numpy()
        return boxes, labels, scores

    det_boxes, det_labels, det_scores = _run_gdino(image, text_prompt)

    # --- Step 3: Match boxes to items ------------------------------------
    used: set[int] = set()
    matched: list[tuple[dict, list[float]]] = []
    unmatched_items: list[dict] = []

    for item in detected_items:
        label = str(item.get("label", "")).strip()
        category = str(item.get("category", "")).strip().lower()
        bbox_pct = item.get("estimated_bbox_pct") or {}
        try:
            est_y = float(bbox_pct.get("y", 0.5))
        except (TypeError, ValueError):
            est_y = 0.5
        best_idx = -1
        best_score = -1.0
        for i, dlabel in enumerate(det_labels):
            if i in used:
                continue
            if not _labels_match(label, dlabel, category):
                continue
            # Wall art in the upper half must match a box in the upper half.
            if category == "wall_art" and est_y < 0.45:
                bx = det_boxes[i]
                center_y = float((bx[1] + bx[3]) / 2.0)
                if center_y > 0.55 * image_height:
                    continue
            s = float(det_scores[i])
            if s > best_score:
                best_score = s
                best_idx = i

        if best_idx >= 0:
            used.add(best_idx)
            box = det_boxes[best_idx].tolist()
            matched.append((item, box))
        else:
            unmatched_items.append(item)

    # --- Step 3b: Second pass — cropped regions for known hard items ----
    def _is_blind_or_curtain(lbl: str) -> bool:
        low = (lbl or "").lower()
        return "blind" in low or "curtain" in low

    still_unmatched: list[dict] = []
    for item in unmatched_items:
        label = str(item.get("label", "")).strip()
        category = str(item.get("category", "")).strip().lower()

        crop_box = None  # (x0, y0, x1, y1) in full-image coords
        crop_prompt = None

        if category == "lighting":
            # Top 30% of image
            crop_box = (0, 0, image_width, int(image_height * 0.30))
            crop_prompt = "ceiling fan . fan blades . light fixture ."
        elif category == "wall_art":
            bbox_pct = item.get("estimated_bbox_pct") or {}
            try:
                ex = float(bbox_pct.get("x", 0.4))
                ey = float(bbox_pct.get("y", 0.4))
                ew = float(bbox_pct.get("w", 0.1))
                eh = float(bbox_pct.get("h", 0.1))
            except (TypeError, ValueError):
                ex, ey, ew, eh = 0.4, 0.4, 0.1, 0.1
            cx1 = max(0.0, ex - 0.2) * image_width
            cy1 = max(0.0, ey - 0.15) * image_height
            cx2 = min(1.0, ex + ew + 0.2) * image_width
            cy2 = min(1.0, ey + eh + 0.15) * image_height
            crop_box = (int(cx1), int(cy1), int(cx2), int(cy2))
            aliased = LABEL_ALIASES.get(label.lower(), label.lower())
            crop_prompt = aliased if aliased.endswith(".") else aliased + " ."
        elif _is_blind_or_curtain(label):
            # Pick side with more wall based on estimated x
            bbox_pct = item.get("estimated_bbox_pct") or {}
            try:
                est_x = float(bbox_pct.get("x", 0.5))
            except (TypeError, ValueError):
                est_x = 0.5
            if est_x < 0.5:
                crop_box = (0, 0, int(image_width * 0.40), image_height)
            else:
                crop_box = (int(image_width * 0.60), 0, image_width, image_height)
            crop_prompt = "window blind . venetian blind . window shade ."

        if crop_box is None or crop_prompt is None:
            still_unmatched.append(item)
            continue

        x0, y0, x1, y1 = crop_box
        if x1 - x0 <= 8 or y1 - y0 <= 8:
            still_unmatched.append(item)
            continue

        crop_img = image.crop((x0, y0, x1, y1))
        c_boxes, c_labels, c_scores = _run_gdino(crop_img, crop_prompt)

        if len(c_boxes) == 0:
            still_unmatched.append(item)
            continue

        # Pick highest-scoring detection (prompt is already item-specific)
        best_i = int(np.argmax(c_scores))
        cb = c_boxes[best_i].tolist()
        full_box = [
            float(cb[0] + x0),
            float(cb[1] + y0),
            float(cb[2] + x0),
            float(cb[3] + y0),
        ]
        matched.append((item, full_box))

    # --- Step 3c: Fallback to estimated_bbox_pct for still-unmatched -----
    for item in still_unmatched:
        bbox_pct = item.get("estimated_bbox_pct") or {}
        try:
            x = float(bbox_pct.get("x", 0.4))
            y = float(bbox_pct.get("y", 0.4))
        except (TypeError, ValueError):
            x, y = 0.4, 0.4
        size_key = str(item.get("size_in_room") or "medium")
        size = SIZE_MAP.get(size_key, 0.40)
        if item.get("is_fixed"):
            size = max(size, FIXED_MIN_SIZE)
        x1 = int(max(0, x) * image_width)
        y1 = int(max(0, y) * image_height)
        x2 = min(image_width, int(x1 + size * image_width))
        y2 = min(image_height, int(y1 + size * image_height))
        if x2 <= x1 or y2 <= y1:
            continue
        matched.append((item, [float(x1), float(y1), float(x2), float(y2)]))

    # Free Grounding DINO from GPU before loading SAM2.
    del gdino
    if device == "cuda":
        torch.cuda.empty_cache()

    if not matched:
        return {}

    # --- Step 4: SAM2 masks ----------------------------------------------
    from sam2.sam2_image_predictor import SAM2ImagePredictor

    predictor = SAM2ImagePredictor.from_pretrained("facebook/sam2-hiera-large")
    predictor.set_image(image_np)

    from supabase import create_client

    sb = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    mask_urls: dict[str, str] = {}
    for item, box in matched:
        label = str(item.get("label", "")).strip()
        if not label:
            continue
        try:
            box_np = np.array([[box[0], box[1], box[2], box[3]]], dtype=np.float32)
            masks, _scores, _logits = predictor.predict(
                point_coords=None,
                point_labels=None,
                box=box_np,
                multimask_output=False,
            )
            mask = masks[0]
            mask_img = Image.fromarray((mask * 255).astype(np.uint8), mode="L")

            buf = io.BytesIO()
            mask_img.save(buf, format="PNG")
            mask_bytes = buf.getvalue()

            safe_label = label.lower().replace(" ", "_").replace("/", "_")
            storage_path = f"masks/{room_id}/{safe_label}.png"

            try:
                sb.storage.from_(STORAGE_BUCKET).upload(
                    path=storage_path,
                    file=mask_bytes,
                    file_options={"content-type": "image/png", "upsert": "true"},
                )
            except Exception as up_err:
                print(f"[grounded-sam2] upload retry for '{label}': {up_err}")
                sb.storage.from_(STORAGE_BUCKET).update(
                    path=storage_path,
                    file=mask_bytes,
                    file_options={"content-type": "image/png"},
                )

            public_url = (
                f"{os.environ['SUPABASE_URL']}/storage/v1/object/public/"
                f"{STORAGE_BUCKET}/{storage_path}"
            )
            mask_urls[label.lower()] = public_url
        except Exception as e:
            print(f"[grounded-sam2] mask failed for '{label}': {e}")
            continue

    print(f"[grounded-sam2] room {room_id}: {len(mask_urls)}/{len(matched)} masks")
    return mask_urls


@app.function(
    image=grounded_sam2_image,
    timeout=360,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("anthropic-credentials"),
    ],
)
@modal.fastapi_endpoint(method="POST")
def segment_room_api(request_data: dict) -> dict[str, Any]:
    room_id = request_data.get("room_id")
    photo_url = request_data.get("photo_url")
    detected_items = request_data.get("detected_items") or []
    if not room_id or not photo_url:
        return {"error": "room_id and photo_url required"}
    try:
        result = segment_room.remote(
            room_id=room_id,
            photo_url=photo_url,
            detected_items=detected_items,
        )
        return {"masks": result}
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[grounded-sam2] ERROR: {tb}")
        return {"error": str(e), "traceback": tb}


@app.local_entrypoint()
def main(room_id: str = "test", photo_url: str = ""):
    if not photo_url:
        print(
            "Usage: modal run grounded_sam2_pipeline.py "
            "--room-id <id> --photo-url <url>"
        )
        return
    import json
    sample_items = [
        {"label": "sofa", "estimated_bbox_pct": {"x": 0.15, "y": 0.45, "w": 0.4, "h": 0.35}, "size_in_room": "large"},
    ]
    result = segment_room.remote(room_id, photo_url, sample_items)
    print(json.dumps(result, indent=2))
