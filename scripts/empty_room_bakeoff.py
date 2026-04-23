#!/usr/bin/env python3
"""Empty Room Bake-Off — 10 detection × inpainting combinations side-by-side.

Spec: /home/claude/cova-prompts/EMPTY_ROOM_BAKEOFF.md
Output: /tmp/empty-room-bakeoff/bakeoff.html

Run once on DAKSH target_room.jpg, then top 3 on 3 other bench rooms.
No tuning, no retries — one call per approach per room with default config.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Optional

import cv2  # type: ignore
import numpy as np
import requests  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from modal_pipeline.empty_room_v3 import (  # noqa: E402
    _load_fal_key,
    call_florence2_ocr,
    call_flux_fill,
    call_lama,
    call_sam3,
    download_mask,
    preprocess,
    upload_image_to_fal,
    upload_bytes_to_fal,
    _encode_png,
)


def _load_anthropic_key() -> None:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return
    for candidate in (
        Path("/Users/daksh/Desktop/cova/apps/web/.env.local"),
        Path("/Users/daksh/Desktop/cova/.env.local"),
    ):
        if not candidate.exists():
            continue
        for line in candidate.read_text().splitlines():
            line = line.strip()
            if line.startswith("ANTHROPIC_API_KEY="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                os.environ["ANTHROPIC_API_KEY"] = val
                return

logger = logging.getLogger("bakeoff")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

OUT_DIR = Path("/tmp/empty-room-bakeoff")
OUT_OUTPUTS = OUT_DIR / "outputs"
OUT_MASKS = OUT_DIR / "masks"
OUT_FALLBACK = OUT_DIR / "fallback"
for d in (OUT_DIR, OUT_OUTPUTS, OUT_MASKS, OUT_FALLBACK):
    d.mkdir(parents=True, exist_ok=True)

TARGET = ROOT / "benchmarks" / "target_room.jpg"
FALLBACK_ROOMS = [
    ROOT / "bench" / "rooms" / "room-02_livingroom-piano-joydivision.webp",
    ROOT / "bench" / "rooms" / "room-06_empty-bay-window.webp",
    ROOT / "bench" / "rooms" / "room-15_wood-paneling-twin-beds.webp",
]

COST_CAP = 20.0
TIME_CAP_SECONDS = 90 * 60

EMPTY_ROOM_PROMPT = (
    "empty room, bare clean floor, bare walls, no furniture, no clutter, "
    "architectural photo"
)
KONTEXT_PROMPT = (
    "this exact room photograph, but completely empty — all furniture, clutter, "
    "bedding, and personal items removed while keeping walls, floor, ceiling, "
    "windows, blinds, fan, and wall features unchanged"
)

FURNITURE_PROMPTS = (
    "sofa", "couch", "armchair", "chair", "bed", "mattress", "dresser",
    "nightstand", "desk", "table lamp", "floor lamp", "coffee table",
    "side table", "rug", "pillow", "blanket", "plant", "potted plant",
    "clothing", "backpack", "bag", "clutter", "box", "books",
    "piano", "guitar", "tv", "computer monitor",
)

# Architecture protection prompts (reused to build protect mask)
PROTECT_PROMPTS = (
    "ceiling fan", "wall-mounted television", "fireplace mantel",
    "built-in shelf", "built-in bookcase", "wall-mounted cabinet",
    "plantation shutter", "honeycomb blind", "cellular blind",
    "mirror", "framed mirror", "pendant light", "chandelier",
    "wall sconce", "flush-mount ceiling light",
    "permanent wall signage",
)

# Residual detection (evaluation) — lower threshold to catch ghosts
RESIDUAL_PROMPTS = (
    "sofa", "couch", "armchair", "chair", "bed", "dresser",
    "table lamp", "floor lamp", "coffee table", "side table",
    "rug", "plant", "pillow", "clutter", "desk", "nightstand",
)
RESIDUAL_THRESHOLD = 0.15

# Cost table (approximate USD per call)
COST_SAM3 = 0.005
COST_FLORENCE2 = 0.010
COST_FLUX_FILL = 0.05
COST_LAMA = 0.04
COST_BRIA = 0.10
COST_KONTEXT = 0.04
COST_GROUNDED_SAM2 = 0.05
COST_SDXL_INPAINT = 0.03  # replicate lucataco/sdxl-inpainting ~$0.02-0.04
COST_CLAUDE_VISION = 0.03  # per verdict or bbox call

# Running cost accounting
_COST_SO_FAR = 0.0


def _add_cost(amount: float) -> None:
    global _COST_SO_FAR
    _COST_SO_FAR += amount


def get_cost() -> float:
    return _COST_SO_FAR


# ---------------------------------------------------------------------------
# Shared detection (SAM3 furniture + protect + OCR) — run once per room
# ---------------------------------------------------------------------------

@dataclass
class SharedDetection:
    image_url: str
    working_bgr: np.ndarray
    H: int
    W: int
    furniture_masks: list[np.ndarray]
    protect_masks: list[np.ndarray]
    ocr_regions: list[Any]
    cost: float = 0.0


def run_shared_detection(working_bgr: np.ndarray) -> SharedDetection:
    H, W = working_bgr.shape[:2]
    fal_url = upload_image_to_fal(working_bgr)
    logger.info("shared: uploaded working image %s", fal_url[:80])

    cost = 0.0

    with ThreadPoolExecutor(max_workers=24) as ex:
        furn_futs = {
            ex.submit(call_sam3, fal_url, p, 0.30): ("f", p) for p in FURNITURE_PROMPTS
        }
        prot_futs = {
            ex.submit(call_sam3, fal_url, p, 0.55): ("p", p) for p in PROTECT_PROMPTS
        }
        ocr_fut = ex.submit(call_florence2_ocr, fal_url)
        all_futs = {**furn_futs, **prot_futs}

        furn_urls: list[str] = []
        prot_urls: list[str] = []
        for fut in as_completed(all_futs):
            kind, p = all_futs[fut]
            cost += COST_SAM3
            try:
                pairs = fut.result()
            except Exception as exc:  # noqa: BLE001
                logger.warning("sam3 %s/%s failed: %s", kind, p, exc)
                continue
            for url, _score in pairs:
                if kind == "f":
                    furn_urls.append(url)
                else:
                    prot_urls.append(url)

        try:
            ocr_regions = ocr_fut.result()
            cost += COST_FLORENCE2
        except Exception as exc:  # noqa: BLE001
            logger.warning("ocr failed: %s", exc)
            ocr_regions = []

    furn_masks: list[np.ndarray] = []
    prot_masks: list[np.ndarray] = []
    if furn_urls or prot_urls:
        with ThreadPoolExecutor(max_workers=12) as ex:
            futs = {}
            for u in furn_urls:
                futs[ex.submit(download_mask, u, (H, W))] = ("f", u)
            for u in prot_urls:
                futs[ex.submit(download_mask, u, (H, W))] = ("p", u)
            for fut in as_completed(futs):
                kind, _ = futs[fut]
                try:
                    m = fut.result()
                except Exception as exc:  # noqa: BLE001
                    logger.warning("mask dl failed: %s", exc)
                    continue
                if kind == "f":
                    furn_masks.append(m)
                else:
                    prot_masks.append(m)

    logger.info(
        "shared detection: %d furniture masks, %d protect masks, %d ocr, cost=$%.3f",
        len(furn_masks), len(prot_masks), len(ocr_regions), cost,
    )
    _add_cost(cost)
    return SharedDetection(
        image_url=fal_url, working_bgr=working_bgr, H=H, W=W,
        furniture_masks=furn_masks, protect_masks=prot_masks,
        ocr_regions=ocr_regions, cost=cost,
    )


def build_remove_mask_from_shared(
    shared: SharedDetection,
    dilate_uniform: int = 8,
    dilate_down: int = 0,
) -> np.ndarray:
    H, W = shared.H, shared.W
    remove = np.zeros((H, W), dtype=np.uint8)
    for m in shared.furniture_masks:
        remove = np.maximum(remove, m)
    # Subtract protect
    protect = np.zeros((H, W), dtype=np.uint8)
    for m in shared.protect_masks:
        protect = np.maximum(protect, m)
    remove = np.where(protect > 0, 0, remove).astype(np.uint8)
    if dilate_uniform > 0:
        k = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (dilate_uniform * 2 + 1, dilate_uniform * 2 + 1)
        )
        remove = cv2.dilate(remove, k)
    if dilate_down > 0:
        # asymmetric downward kernel
        kd = np.zeros((dilate_down * 2 + 1, max(1, dilate_uniform * 2 + 1)), dtype=np.uint8)
        kd[dilate_down:, :] = 1
        remove = cv2.dilate(remove, kd)
    # re-subtract protect after dilation
    remove = np.where(protect > 0, 0, remove).astype(np.uint8)
    return remove


# ---------------------------------------------------------------------------
# Alternative detectors
# ---------------------------------------------------------------------------

def call_grounded_sam2(image_url: str, H: int, W: int) -> np.ndarray:
    """Text-prompted segmentation alternative to SAM3. Tries EVF-SAM first,
    then falls back to running Grounding DINO (box detection) + SAM2 (box → mask)."""
    import fal_client  # type: ignore

    text_prompt = (
        "bed . sofa . couch . chair . armchair . table . desk . dresser . "
        "nightstand . lamp . rug . pillow . blanket . clothing . backpack . "
        "bag . plant . books . clutter . piano . tv"
    )

    # Try evf-sam (text-prompted segmentation). Multi-label by calling per-item.
    labels = [
        "bed", "sofa", "couch", "chair", "armchair", "table", "desk",
        "dresser", "nightstand", "lamp", "rug", "pillow", "blanket",
        "clothing", "backpack", "plant", "piano", "tv",
    ]
    union = np.zeros((H, W), dtype=np.uint8)
    tried_any = False

    # Try Grounding DINO (text→bbox) as first path; covers most distro of fal
    endpoints_bbox = [
        "fal-ai/grounding-dino",
        "fal-ai/florence-2-large/caption-to-phrase-grounding",
    ]
    for ep in endpoints_bbox:
        try:
            args = (
                {"image_url": image_url, "prompt": text_prompt}
                if "grounding-dino" in ep
                else {"image_url": image_url, "text_input": text_prompt}
            )
            r = fal_client.subscribe(ep, arguments=args, with_logs=False, client_timeout=120.0)
            tried_any = True
            # Collect boxes in various shapes
            boxes: list[tuple[int, int, int, int]] = []
            # grounding-dino shape: {"detections": [{"bbox":[x1,y1,x2,y2], "label": "..."}]}
            dets = r.get("detections") or r.get("boxes") or []
            for d in dets:
                bb = d.get("bbox") or d.get("box") if isinstance(d, dict) else None
                if bb and len(bb) >= 4:
                    x1, y1, x2, y2 = map(int, bb[:4])
                    boxes.append((x1, y1, x2, y2))
            # florence shape: {"results":{"bboxes":[[...]]}}
            rr = r.get("results") or {}
            if isinstance(rr, dict):
                bbs = rr.get("bboxes") or []
                for bb in bbs:
                    if isinstance(bb, (list, tuple)) and len(bb) >= 4:
                        x1, y1, x2, y2 = map(int, bb[:4])
                        boxes.append((x1, y1, x2, y2))
            logger.info("%s produced %d boxes", ep, len(boxes))
            if boxes:
                # Now try SAM 2 with box prompts; if unavailable, fallback to filled rects
                try:
                    sam2 = fal_client.subscribe(
                        "fal-ai/sam2/image",
                        arguments={
                            "image_url": image_url,
                            "prompts": [
                                {"type": "box", "box": [float(x1), float(y1), float(x2), float(y2)], "label": 1}
                                for (x1, y1, x2, y2) in boxes
                            ],
                        },
                        with_logs=False,
                        client_timeout=120.0,
                    )
                    mask_entries = sam2.get("masks") or sam2.get("image") or []
                    if isinstance(mask_entries, dict):
                        mask_entries = [mask_entries]
                    for m in mask_entries:
                        url = m.get("url") if isinstance(m, dict) else None
                        if url:
                            mm = download_mask(url, (H, W))
                            union = np.maximum(union, mm)
                    if (union > 0).any():
                        return union
                except Exception as exc:  # noqa: BLE001
                    logger.info("sam2 box-prompt failed (%s), using filled rectangles", exc)
                    for (x1, y1, x2, y2) in boxes:
                        cv2.rectangle(union, (x1, y1), (x2, y2), 255, -1)
                    return union
        except Exception as exc:  # noqa: BLE001
            logger.info("bbox endpoint %s failed: %s", ep, exc)
            continue

    if not tried_any:
        raise RuntimeError("no grounded-detection endpoint available on fal")
    if (union == 0).all():
        raise RuntimeError("grounded-detection returned empty mask on all endpoints")
    return union


def call_florence2_detect(image_url: str) -> list[tuple[int, int, int, int, str]]:
    """Open-vocab detection via Florence-2. Returns [(x1, y1, x2, y2, label), ...].

    Tolerant to several response shapes: bboxes may be list-of-list, list-of-dict,
    or nested under "results" as a dict or a JSON string. Labels live alongside."""
    import fal_client  # type: ignore

    def _subscribe(ep: str, args: dict):
        return fal_client.subscribe(ep, arguments=args, with_logs=False, client_timeout=90.0)

    r = None
    last_exc = None
    for ep, args in [
        ("fal-ai/florence-2-large/caption-to-phrase-grounding", {
            "image_url": image_url,
            "text_input": (
                "furniture, sofa, chair, bed, lamp, table, desk, dresser, "
                "rug, pillow, plant, clothing, backpack, books, piano, tv, clutter"
            ),
        }),
        ("fal-ai/florence-2-large/object-detection", {"image_url": image_url}),
        ("fal-ai/florence-2-large/dense-region-caption", {"image_url": image_url}),
    ]:
        try:
            r = _subscribe(ep, args)
            logger.info("florence-2 detect via %s returned keys %s", ep, list(r.keys()))
            break
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            logger.info("florence-2 endpoint %s failed: %s", ep, exc)
            r = None
            continue
    if r is None:
        raise RuntimeError(f"florence-2 all endpoints failed: {last_exc}")

    # Extract bboxes + labels tolerantly
    def _extract(obj) -> tuple[list[list[float]], list[str]]:
        if obj is None:
            return [], []
        # might be a JSON string
        if isinstance(obj, str):
            try:
                obj = json.loads(obj)
            except Exception:  # noqa: BLE001
                return [], []
        if isinstance(obj, dict):
            # florence nested: {"<OD>": {"bboxes":[[...]],"labels":[...]}}
            for task_key in list(obj.keys()):
                sub = obj[task_key]
                if isinstance(sub, dict) and ("bboxes" in sub or "boxes" in sub):
                    obj = sub
                    break
            bbs = obj.get("bboxes") or obj.get("boxes") or []
            lbls = obj.get("labels") or obj.get("bboxes_labels") or []
            boxes_out = []
            labels_out = []
            for i, bb in enumerate(bbs):
                if isinstance(bb, dict):
                    # {"x1":..} or {"x":..,"y":..,"w":..,"h":..}
                    if "x1" in bb:
                        boxes_out.append([bb["x1"], bb["y1"], bb["x2"], bb["y2"]])
                    elif "x" in bb and "w" in bb:
                        x, y, w, h = bb["x"], bb["y"], bb["w"], bb["h"]
                        boxes_out.append([x, y, x + w, y + h])
                    else:
                        continue
                elif isinstance(bb, (list, tuple)) and len(bb) >= 4:
                    boxes_out.append(list(bb[:4]))
                else:
                    continue
                labels_out.append(str(lbls[i]) if i < len(lbls) else "")
            return boxes_out, labels_out
        return [], []

    # Results may be at top-level or nested
    bbs, lbls = _extract(r.get("results"))
    if not bbs:
        bbs, lbls = _extract(r)
    out = []
    for i, bb in enumerate(bbs):
        try:
            x1, y1, x2, y2 = int(bb[0]), int(bb[1]), int(bb[2]), int(bb[3])
            lbl = lbls[i] if i < len(lbls) else ""
            out.append((x1, y1, x2, y2, str(lbl)))
        except (TypeError, ValueError):
            continue
    return out


def florence_bboxes_to_sam3_mask(
    image_url: str,
    bboxes: list[tuple[int, int, int, int, str]],
    H: int,
    W: int,
) -> np.ndarray:
    """For each Florence-2 bbox, call SAM-3 with its label to refine into pixel mask.
    If SAM-3 fails for a label, fall back to the filled bbox rectangle."""
    import fal_client  # type: ignore

    union = np.zeros((H, W), dtype=np.uint8)
    if not bboxes:
        return union

    # Dedup by label
    unique_labels: list[str] = []
    seen = set()
    bbox_by_label: dict[str, list[tuple[int, int, int, int]]] = {}
    for (x1, y1, x2, y2, lbl) in bboxes:
        key = lbl.lower().strip()
        if not key:
            continue
        if key not in seen:
            unique_labels.append(key)
            seen.add(key)
        bbox_by_label.setdefault(key, []).append((x1, y1, x2, y2))

    # Run SAM-3 per label; union the mask; plus overlay filled bbox as floor
    with ThreadPoolExecutor(max_workers=12) as ex:
        futs = {
            ex.submit(call_sam3, image_url, lbl, 0.30): lbl for lbl in unique_labels[:24]
        }
        mask_urls: list[str] = []
        for fut in as_completed(futs):
            lbl = futs[fut]
            try:
                pairs = fut.result()
            except Exception as exc:  # noqa: BLE001
                logger.warning("florence→sam3 %s failed: %s", lbl, exc)
                # Fall back: filled rectangles for this label's bboxes
                for (x1, y1, x2, y2) in bbox_by_label.get(lbl, []):
                    cv2.rectangle(union, (x1, y1), (x2, y2), 255, -1)
                continue
            for url, _s in pairs:
                mask_urls.append(url)

        # Download masks
        if mask_urls:
            dl_futs = {ex.submit(download_mask, u, (H, W)): u for u in mask_urls}
            for fut in as_completed(dl_futs):
                try:
                    m = fut.result()
                    union = np.maximum(union, m)
                except Exception:  # noqa: BLE001
                    pass

    _add_cost(COST_SAM3 * len(unique_labels))
    return union


def call_claude_bboxes(input_bgr: np.ndarray) -> list[tuple[int, int, int, int, str]]:
    """Claude Sonnet 4.5 vision returning bboxes of all furniture/clutter."""
    import anthropic  # type: ignore

    client = anthropic.Anthropic()
    ok, png = cv2.imencode(".png", input_bgr)
    if not ok:
        raise RuntimeError("png encode failed")
    b64 = base64.b64encode(png.tobytes()).decode("ascii")
    H, W = input_bgr.shape[:2]

    prompt = f"""Identify ALL movable furniture, clutter, decor, bedding, and personal items
in this room photograph. Do NOT mark architectural features (walls, floor, ceiling,
windows, built-ins, fan, wall text, fixtures).

Return STRICT JSON only:
{{
  "items": [
    {{"label": "string", "x1": int, "y1": int, "x2": int, "y2": int}},
    ...
  ]
}}

Coordinates are in pixels with origin top-left. Image dimensions: {W}x{H} (WxH).
Include every distinct item — be thorough. Loose items (clothing on floor, books, bags)
must also be boxed."""

    resp = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64", "media_type": "image/png", "data": b64,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )
    text = resp.content[0].text if resp.content else ""
    # Strip markdown code fence if present
    t = text.strip()
    if t.startswith("```"):
        # remove first fence line and last ```
        t = t.split("\n", 1)[1] if "\n" in t else t
        if t.endswith("```"):
            t = t[: -3]
        if t.startswith("json\n"):
            t = t[5:]
    try:
        data = json.loads(t)
    except json.JSONDecodeError:
        # find the first { ... last } slice
        start = t.find("{")
        end = t.rfind("}")
        if start >= 0 and end > start:
            data = json.loads(t[start:end + 1])
        else:
            raise
    items = data.get("items", [])
    out = []
    for it in items:
        try:
            x1 = int(it["x1"]); y1 = int(it["y1"])
            x2 = int(it["x2"]); y2 = int(it["y2"])
            lbl = str(it.get("label", ""))
            out.append((x1, y1, x2, y2, lbl))
        except (KeyError, TypeError, ValueError):
            continue
    _add_cost(COST_CLAUDE_VISION)
    return out


def bboxes_to_filled_mask(
    H: int,
    W: int,
    bboxes: list[tuple[int, int, int, int, str]],
    padding: int = 10,
) -> np.ndarray:
    m = np.zeros((H, W), dtype=np.uint8)
    for (x1, y1, x2, y2, _lbl) in bboxes:
        x1p = max(0, x1 - padding)
        y1p = max(0, y1 - padding)
        x2p = min(W, x2 + padding)
        y2p = min(H, y2 + padding)
        cv2.rectangle(m, (x1p, y1p), (x2p, y2p), 255, -1)
    return m


# ---------------------------------------------------------------------------
# Alternative inpainters
# ---------------------------------------------------------------------------

def call_bria_eraser(image_url: str, mask_url: str) -> str:
    """Commercial-grade object removal via Bria on fal."""
    import fal_client  # type: ignore

    r = fal_client.subscribe(
        "fal-ai/bria/eraser",
        arguments={"image_url": image_url, "mask_url": mask_url},
        with_logs=False,
        client_timeout=180.0,
    )
    img = r.get("image")
    if isinstance(img, dict) and img.get("url"):
        return img["url"]
    imgs = r.get("images") or []
    if imgs:
        first = imgs[0]
        if isinstance(first, dict) and first.get("url"):
            return first["url"]
        if isinstance(first, str):
            return first
    raise RuntimeError(f"bria eraser: unexpected response keys {list(r.keys())}")


def call_flux_kontext(image_url: str, prompt: str) -> str:
    """FLUX Kontext instruction-style edit (no mask)."""
    import fal_client  # type: ignore

    r = fal_client.subscribe(
        "fal-ai/flux-pro/kontext",
        arguments={
            "image_url": image_url,
            "prompt": prompt,
            "guidance_scale": 3.5,
            "num_images": 1,
            "output_format": "png",
            "safety_tolerance": "6",
        },
        with_logs=False,
        client_timeout=240.0,
    )
    imgs = r.get("images") or []
    if imgs:
        first = imgs[0]
        if isinstance(first, dict) and first.get("url"):
            return first["url"]
        if isinstance(first, str):
            return first
    img = r.get("image")
    if isinstance(img, dict) and img.get("url"):
        return img["url"]
    raise RuntimeError(f"flux-kontext: unexpected response keys {list(r.keys())}")


def call_sdxl_inpaint_replicate(image_bgr: np.ndarray, mask_binary: np.ndarray) -> np.ndarray:
    """SDXL inpainting via Replicate HTTP API (bypasses broken SDK)."""
    token = os.environ.get("REPLICATE_API_TOKEN")
    if not token:
        # Try reading from .env.local
        for cand in (ROOT / ".env.local", ROOT / "apps/web/.env.local"):
            if cand.exists():
                for line in cand.read_text().splitlines():
                    if line.startswith("REPLICATE_API_TOKEN="):
                        token = line.split("=", 1)[1].strip().strip('"').strip("'")
                        os.environ["REPLICATE_API_TOKEN"] = token
                        break
            if token:
                break
    if not token:
        raise RuntimeError("REPLICATE_API_TOKEN not set")

    # Upload image and mask as data URLs (replicate accepts http(s) or data URIs)
    ok_i, i_buf = cv2.imencode(".png", image_bgr)
    ok_m, m_buf = cv2.imencode(".png", mask_binary)
    if not (ok_i and ok_m):
        raise RuntimeError("png encode failed")
    img_data_uri = "data:image/png;base64," + base64.b64encode(i_buf.tobytes()).decode("ascii")
    mask_data_uri = "data:image/png;base64," + base64.b64encode(m_buf.tobytes()).decode("ascii")

    # lucataco/sdxl-inpainting — public model, accepts mask + image + prompt
    # Version pinned to a known-good hash
    version = "a5b13068cc81a89a4fbeefeccc774869fcb34df4dbc92c1555e0f2771d49dde7"
    payload = {
        "version": version,
        "input": {
            "image": img_data_uri,
            "mask": mask_data_uri,
            "prompt": EMPTY_ROOM_PROMPT,
            "negative_prompt": "furniture, clutter, bed, sofa, chair, lamp, rug, plant",
            "num_inference_steps": 30,
            "guidance_scale": 7.5,
            "strength": 0.99,
        },
    }

    r = requests.post(
        "https://api.replicate.com/v1/predictions",
        headers={"Authorization": f"Token {token}", "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"replicate create: {r.status_code} {r.text[:200]}")
    pred = r.json()
    pred_id = pred["id"]

    # Poll
    deadline = time.time() + 240
    while time.time() < deadline:
        time.sleep(2.0)
        gr = requests.get(
            f"https://api.replicate.com/v1/predictions/{pred_id}",
            headers={"Authorization": f"Token {token}"},
            timeout=30,
        )
        if gr.status_code >= 300:
            raise RuntimeError(f"replicate poll: {gr.status_code}")
        j = gr.json()
        status = j.get("status")
        if status == "succeeded":
            output = j.get("output")
            url = output[0] if isinstance(output, list) else output
            raw = requests.get(url, timeout=60).content
            from PIL import Image
            arr = np.array(Image.open(io.BytesIO(raw)).convert("RGB"))
            return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
        if status == "failed":
            raise RuntimeError(f"sdxl-inpaint failed: {j.get('error', 'unknown')}")
    raise RuntimeError("sdxl-inpaint timed out")


# ---------------------------------------------------------------------------
# Image utilities
# ---------------------------------------------------------------------------

def download_image_to_bgr(url: str, target_shape: Optional[tuple[int, int]] = None) -> np.ndarray:
    raw = requests.get(url, timeout=120).content
    from PIL import Image
    pil = Image.open(io.BytesIO(raw)).convert("RGB")
    arr = np.array(pil)
    bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    if target_shape is not None and bgr.shape[:2] != target_shape:
        h, w = target_shape
        bgr = cv2.resize(bgr, (w, h), interpolation=cv2.INTER_LANCZOS4)
    return bgr


def feather_alpha(mask: np.ndarray, sigma: float = 4.0) -> np.ndarray:
    b = mask.astype(np.float32) / 255.0
    b = cv2.GaussianBlur(b, (0, 0), sigma)
    return np.clip(b, 0, 1).astype(np.float32)


def linear_composite(orig: np.ndarray, gen: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    a = alpha if alpha.ndim == 3 else alpha[..., None]
    blended = orig.astype(np.float32) * (1 - a) + gen.astype(np.float32) * a
    return np.clip(blended, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------
# Evaluation metrics
# ---------------------------------------------------------------------------

def eval_residual_via_sam3(image_url: str, H: int, W: int) -> tuple[int, float, np.ndarray]:
    """Re-run SAM-3 on output at low threshold 0.15. Return (count, area_frac, union_mask)."""
    mask_urls: list[str] = []
    with ThreadPoolExecutor(max_workers=20) as ex:
        futs = {
            ex.submit(call_sam3, image_url, p, RESIDUAL_THRESHOLD): p
            for p in RESIDUAL_PROMPTS
        }
        for fut in as_completed(futs):
            p = futs[fut]
            _add_cost(COST_SAM3)
            try:
                pairs = fut.result()
            except Exception as exc:  # noqa: BLE001
                logger.warning("residual sam3 %s failed: %s", p, exc)
                continue
            for u, _s in pairs:
                mask_urls.append(u)

    union = np.zeros((H, W), dtype=np.uint8)
    if mask_urls:
        with ThreadPoolExecutor(max_workers=12) as ex:
            futs2 = {ex.submit(download_mask, u, (H, W)): u for u in mask_urls}
            for fut in as_completed(futs2):
                try:
                    m = fut.result()
                    union = np.maximum(union, m)
                except Exception:  # noqa: BLE001
                    pass

    # Count components >= 0.5% area
    num, labels = cv2.connectedComponents(union)
    big = 0
    total_frac = 0.0
    for i in range(1, num):
        frac = float((labels == i).sum()) / float(H * W)
        if frac >= 0.005:
            big += 1
            total_frac += frac
    return big, total_frac, union


def eval_inside_mask_ssim(input_bgr: np.ndarray, output_bgr: np.ndarray, mask: np.ndarray) -> float:
    from skimage.metrics import structural_similarity as ssim  # type: ignore
    if mask is None or (mask > 0).sum() == 0:
        return 1.0
    if input_bgr.shape != output_bgr.shape:
        output_bgr = cv2.resize(
            output_bgr, (input_bgr.shape[1], input_bgr.shape[0]),
            interpolation=cv2.INTER_AREA,
        )
    if mask.shape[:2] != input_bgr.shape[:2]:
        mask = cv2.resize(
            mask, (input_bgr.shape[1], input_bgr.shape[0]),
            interpolation=cv2.INTER_NEAREST,
        )
    ig = cv2.cvtColor(input_bgr, cv2.COLOR_BGR2GRAY)
    og = cv2.cvtColor(output_bgr, cv2.COLOR_BGR2GRAY)
    _, full = ssim(ig, og, data_range=255, full=True)
    return float(full[mask > 0].mean())


def eval_outside_mask_delta_e(input_bgr: np.ndarray, output_bgr: np.ndarray, mask: np.ndarray) -> float:
    from skimage.color import rgb2lab, deltaE_ciede2000  # type: ignore
    if input_bgr.shape != output_bgr.shape:
        output_bgr = cv2.resize(
            output_bgr, (input_bgr.shape[1], input_bgr.shape[0]),
            interpolation=cv2.INTER_AREA,
        )
    outside = mask == 0 if mask is not None else np.ones(input_bgr.shape[:2], dtype=bool)
    if outside.shape != input_bgr.shape[:2]:
        outside = cv2.resize(
            outside.astype(np.uint8), (input_bgr.shape[1], input_bgr.shape[0]),
            interpolation=cv2.INTER_NEAREST,
        ) > 0
    if not outside.any():
        return 0.0
    i_rgb = cv2.cvtColor(input_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    o_rgb = cv2.cvtColor(output_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    d = deltaE_ciede2000(rgb2lab(i_rgb), rgb2lab(o_rgb))
    return float(d[outside].mean())


def eval_ocr_recall(input_url: str, output_url: str) -> float:
    try:
        in_ocr = call_florence2_ocr(input_url)
        _add_cost(COST_FLORENCE2)
    except Exception:  # noqa: BLE001
        return 1.0
    try:
        out_ocr = call_florence2_ocr(output_url)
        _add_cost(COST_FLORENCE2)
    except Exception:  # noqa: BLE001
        return 0.0
    in_tokens = {r.label.strip().upper() for r in in_ocr if r.label.strip()}
    out_tokens = {r.label.strip().upper() for r in out_ocr if r.label.strip()}
    if not in_tokens:
        return 1.0
    return len(in_tokens & out_tokens) / len(in_tokens)


def eval_claude_verdict(input_bgr: np.ndarray, output_bgr: np.ndarray) -> dict:
    import anthropic  # type: ignore
    client = anthropic.Anthropic()

    def to_b64(bgr):
        ok, buf = cv2.imencode(".png", bgr)
        return base64.b64encode(buf.tobytes()).decode("ascii")

    prompt = """You are evaluating whether an AI successfully removed ALL furniture and clutter from a room photo while preserving the architecture.

INPUT (original room): first image
OUTPUT (attempted empty room): second image

Evaluate the OUTPUT strictly:

1. Is the OUTPUT truly empty? It should contain ONLY walls, floor, ceiling, windows (with blinds/shutters if architectural), doors, built-ins, ceiling fans, ceiling fixtures, wall text if architectural, and architectural features (moldings, radiators, vents).

2. It should contain NOTHING ELSE — no furniture, no bedding, no rugs, no clothing, no electronics, no plants, no backpacks, no clutter. Also no GHOSTS or blurred remnants of removed items.

3. Is the architecture preserved? Walls should be same color, floor same material, ceiling features same, windows same, fan same, wall text same.

Return STRICT JSON only:
{
  "is_empty": true/false,
  "residual_items_visible": ["list of items still visible"],
  "ghost_artifacts_visible": ["list of blurred remnants or outlines"],
  "architecture_preserved": true/false,
  "architecture_changes": ["list of changed elements"],
  "quality_score": 0-10,
  "one_line_verdict": "string"
}"""

    try:
        resp = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": "image/png", "data": to_b64(input_bgr)},
                        },
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": "image/png", "data": to_b64(output_bgr)},
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        _add_cost(COST_CLAUDE_VISION)
        t = resp.content[0].text.strip() if resp.content else ""
        if t.startswith("```"):
            t = t.split("\n", 1)[1] if "\n" in t else t
            if t.endswith("```"):
                t = t[:-3]
            if t.startswith("json\n"):
                t = t[5:]
        s = t.find("{"); e = t.rfind("}")
        if s >= 0 and e > s:
            return json.loads(t[s:e + 1])
        return {"quality_score": 0, "one_line_verdict": "parse_fail"}
    except Exception as exc:  # noqa: BLE001
        logger.warning("claude verdict failed: %s", exc)
        return {"quality_score": 0, "one_line_verdict": f"error: {exc}"}


@dataclass
class ApproachResult:
    id: int
    name: str
    status: str = "ok"  # ok | fail
    error: str | None = None
    output_path: str | None = None
    mask_path: str | None = None
    cost_usd: float = 0.0
    latency_s: float = 0.0
    metrics: dict = field(default_factory=dict)
    composite_score: float = 0.0


def evaluate_and_score(
    input_bgr: np.ndarray,
    input_url: str,
    output_bgr: np.ndarray,
    mask: np.ndarray | None,
    approach_name: str,
) -> dict:
    H, W = input_bgr.shape[:2]
    # Upload output for metrics that need a URL
    try:
        output_url = upload_image_to_fal(output_bgr)
    except Exception as exc:  # noqa: BLE001
        logger.warning("output upload failed: %s", exc)
        output_url = None

    metrics: dict = {}

    # 1. Residual furniture
    if output_url:
        try:
            count, frac, _ = eval_residual_via_sam3(output_url, H, W)
            metrics["residual_count"] = count
            metrics["residual_area_fraction"] = round(frac, 4)
        except Exception as exc:  # noqa: BLE001
            logger.warning("residual eval failed: %s", exc)

    # 2. Inside-mask SSIM
    if mask is not None:
        try:
            metrics["inside_mask_ssim"] = round(eval_inside_mask_ssim(input_bgr, output_bgr, mask), 4)
        except Exception as exc:  # noqa: BLE001
            logger.warning("inside ssim failed: %s", exc)

    # 3. Outside-mask ΔE (only if mask defined)
    if mask is not None:
        try:
            metrics["outside_mask_delta_e"] = round(eval_outside_mask_delta_e(input_bgr, output_bgr, mask), 3)
        except Exception as exc:  # noqa: BLE001
            logger.warning("outside ΔE failed: %s", exc)
    else:
        try:
            # no mask → compare whole image (architecture drift)
            zeros = np.zeros(input_bgr.shape[:2], dtype=np.uint8)
            metrics["outside_mask_delta_e"] = round(eval_outside_mask_delta_e(input_bgr, output_bgr, zeros), 3)
        except Exception as exc:  # noqa: BLE001
            logger.warning("whole-image ΔE failed: %s", exc)

    # 4. OCR recall
    if output_url:
        try:
            metrics["ocr_recall"] = round(eval_ocr_recall(input_url, output_url), 3)
        except Exception as exc:  # noqa: BLE001
            logger.warning("ocr recall failed: %s", exc)

    # 5. Claude verdict
    try:
        v = eval_claude_verdict(input_bgr, output_bgr)
        metrics["claude_score"] = int(v.get("quality_score", 0))
        metrics["claude_verdict"] = v.get("one_line_verdict", "")
        metrics["claude_is_empty"] = bool(v.get("is_empty", False))
        metrics["claude_arch_preserved"] = bool(v.get("architecture_preserved", False))
        metrics["claude_residual_items"] = v.get("residual_items_visible", [])
        metrics["claude_ghosts"] = v.get("ghost_artifacts_visible", [])
    except Exception as exc:  # noqa: BLE001
        logger.warning("claude verdict failed: %s", exc)

    return metrics


def composite_score_from_metrics(m: dict) -> float:
    frac = m.get("residual_area_fraction", 1.0)
    imsm = m.get("inside_mask_ssim", 1.0)
    ode = m.get("outside_mask_delta_e", 10.0)
    ocr = m.get("ocr_recall", 0.0)
    cs = m.get("claude_score", 0)
    score = (
        0.40 * (1.0 - min(frac, 1.0))
        + 0.25 * (1.0 - min(imsm, 1.0))
        + 0.20 * (1.0 - min(ode / 10.0, 1.0))
        + 0.10 * ocr
        + 0.05 * (cs / 10.0)
    )
    return round(score, 4)


# ---------------------------------------------------------------------------
# Approach implementations
# ---------------------------------------------------------------------------

def approach_1(shared: SharedDetection, out_stub: str) -> ApproachResult:
    """SAM3 + FLUX Fill (baseline)."""
    mask = build_remove_mask_from_shared(shared, dilate_uniform=8)
    mask_url = upload_bytes_to_fal(_encode_png(mask), suffix=".png")
    out_url = call_flux_fill(shared.image_url, mask_url)
    _add_cost(COST_FLUX_FILL)
    output_bgr = download_image_to_bgr(out_url, (shared.H, shared.W))
    feather = feather_alpha(mask, sigma=4.0)
    composited = linear_composite(shared.working_bgr, output_bgr, feather)
    return _save_and_eval(1, "SAM3 + FLUX Fill (baseline)", shared, composited, mask, out_stub)


def approach_2(shared: SharedDetection, out_stub: str) -> ApproachResult:
    """SAM3 + LaMa."""
    mask = build_remove_mask_from_shared(shared, dilate_uniform=8)
    mask_url = upload_bytes_to_fal(_encode_png(mask), suffix=".png")
    out_url = call_lama(shared.image_url, mask_url)
    _add_cost(COST_LAMA)
    output_bgr = download_image_to_bgr(out_url, (shared.H, shared.W))
    feather = feather_alpha(mask, sigma=4.0)
    composited = linear_composite(shared.working_bgr, output_bgr, feather)
    return _save_and_eval(2, "SAM3 + LaMa", shared, composited, mask, out_stub)


def approach_3(shared: SharedDetection, out_stub: str) -> ApproachResult:
    """SAM3 + FLUX Fill, aggressive dilation (+20 uniform, +30 downward)."""
    mask = build_remove_mask_from_shared(shared, dilate_uniform=20, dilate_down=30)
    mask_url = upload_bytes_to_fal(_encode_png(mask), suffix=".png")
    out_url = call_flux_fill(shared.image_url, mask_url)
    _add_cost(COST_FLUX_FILL)
    output_bgr = download_image_to_bgr(out_url, (shared.H, shared.W))
    feather = feather_alpha(mask, sigma=6.0)
    composited = linear_composite(shared.working_bgr, output_bgr, feather)
    return _save_and_eval(3, "SAM3 + FLUX Fill aggressive dilation", shared, composited, mask, out_stub)


def approach_4(shared: SharedDetection, out_stub: str) -> ApproachResult:
    """Grounded SAM 2 + FLUX Fill."""
    mask = call_grounded_sam2(shared.image_url, shared.H, shared.W)
    _add_cost(COST_GROUNDED_SAM2)
    if (mask > 0).sum() == 0:
        raise RuntimeError("grounded-sam-2 produced empty mask")
    # subtract protect, dilate +8
    protect = np.zeros_like(mask)
    for m in shared.protect_masks:
        protect = np.maximum(protect, m)
    mask = np.where(protect > 0, 0, mask).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))
    mask = cv2.dilate(mask, k)
    mask = np.where(protect > 0, 0, mask).astype(np.uint8)
    mask_url = upload_bytes_to_fal(_encode_png(mask), suffix=".png")
    out_url = call_flux_fill(shared.image_url, mask_url)
    _add_cost(COST_FLUX_FILL)
    output_bgr = download_image_to_bgr(out_url, (shared.H, shared.W))
    feather = feather_alpha(mask, sigma=4.0)
    composited = linear_composite(shared.working_bgr, output_bgr, feather)
    return _save_and_eval(4, "Grounded SAM 2 + FLUX Fill", shared, composited, mask, out_stub)


def approach_5(shared: SharedDetection, out_stub: str) -> ApproachResult:
    """Florence-2 OD → SAM3 per label → FLUX Fill."""
    boxes = call_florence2_detect(shared.image_url)
    _add_cost(COST_FLORENCE2)
    if not boxes:
        raise RuntimeError("florence-2 returned no boxes")
    mask = florence_bboxes_to_sam3_mask(shared.image_url, boxes, shared.H, shared.W)
    if (mask > 0).sum() == 0:
        raise RuntimeError("florence→sam3 produced empty mask")
    protect = np.zeros_like(mask)
    for m in shared.protect_masks:
        protect = np.maximum(protect, m)
    mask = np.where(protect > 0, 0, mask).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))
    mask = cv2.dilate(mask, k)
    mask = np.where(protect > 0, 0, mask).astype(np.uint8)
    mask_url = upload_bytes_to_fal(_encode_png(mask), suffix=".png")
    out_url = call_flux_fill(shared.image_url, mask_url)
    _add_cost(COST_FLUX_FILL)
    output_bgr = download_image_to_bgr(out_url, (shared.H, shared.W))
    feather = feather_alpha(mask, sigma=4.0)
    composited = linear_composite(shared.working_bgr, output_bgr, feather)
    return _save_and_eval(5, "Florence2 → SAM3 → FLUX Fill", shared, composited, mask, out_stub)


def approach_6(shared: SharedDetection, out_stub: str) -> ApproachResult:
    """SAM3 + SDXL Inpainting (Replicate)."""
    mask = build_remove_mask_from_shared(shared, dilate_uniform=8)
    # Call SDXL directly with full-resolution image and mask
    output_bgr = call_sdxl_inpaint_replicate(shared.working_bgr, mask)
    _add_cost(COST_SDXL_INPAINT)
    if output_bgr.shape[:2] != (shared.H, shared.W):
        output_bgr = cv2.resize(output_bgr, (shared.W, shared.H), interpolation=cv2.INTER_LANCZOS4)
    feather = feather_alpha(mask, sigma=4.0)
    composited = linear_composite(shared.working_bgr, output_bgr, feather)
    return _save_and_eval(6, "SAM3 + SDXL Inpainting", shared, composited, mask, out_stub)


def approach_7(shared: SharedDetection, out_stub: str) -> ApproachResult:
    """Two-pass: LaMa removal → FLUX Fill restoration."""
    mask = build_remove_mask_from_shared(shared, dilate_uniform=8)
    mask_url = upload_bytes_to_fal(_encode_png(mask), suffix=".png")

    # Pass 1: LaMa
    lama_url = call_lama(shared.image_url, mask_url)
    _add_cost(COST_LAMA)
    lama_bgr = download_image_to_bgr(lama_url, (shared.H, shared.W))

    # Pass 2: FLUX Fill on LaMa output with same mask
    lama_up = upload_bytes_to_fal(_encode_png(lama_bgr), suffix=".png")
    flux_url = call_flux_fill(lama_up, mask_url)
    _add_cost(COST_FLUX_FILL)
    output_bgr = download_image_to_bgr(flux_url, (shared.H, shared.W))

    feather = feather_alpha(mask, sigma=4.0)
    composited = linear_composite(shared.working_bgr, output_bgr, feather)
    return _save_and_eval(7, "LaMa + FLUX Fill two-pass", shared, composited, mask, out_stub)


def approach_8(shared: SharedDetection, out_stub: str) -> ApproachResult:
    """Claude Vision bboxes → filled mask → FLUX Fill."""
    bboxes = call_claude_bboxes(shared.working_bgr)
    if not bboxes:
        raise RuntimeError("claude returned no bboxes")
    mask = bboxes_to_filled_mask(shared.H, shared.W, bboxes, padding=12)
    protect = np.zeros_like(mask)
    for m in shared.protect_masks:
        protect = np.maximum(protect, m)
    mask = np.where(protect > 0, 0, mask).astype(np.uint8)
    mask_url = upload_bytes_to_fal(_encode_png(mask), suffix=".png")
    out_url = call_flux_fill(shared.image_url, mask_url)
    _add_cost(COST_FLUX_FILL)
    output_bgr = download_image_to_bgr(out_url, (shared.H, shared.W))
    feather = feather_alpha(mask, sigma=4.0)
    composited = linear_composite(shared.working_bgr, output_bgr, feather)
    return _save_and_eval(8, "Claude Vision mask + FLUX Fill", shared, composited, mask, out_stub)


def approach_9(shared: SharedDetection, out_stub: str) -> ApproachResult:
    """Commercial object-removal API (Bria eraser on fal)."""
    mask = build_remove_mask_from_shared(shared, dilate_uniform=8)
    mask_url = upload_bytes_to_fal(_encode_png(mask), suffix=".png")
    out_url = call_bria_eraser(shared.image_url, mask_url)
    _add_cost(COST_BRIA)
    output_bgr = download_image_to_bgr(out_url, (shared.H, shared.W))
    feather = feather_alpha(mask, sigma=4.0)
    composited = linear_composite(shared.working_bgr, output_bgr, feather)
    return _save_and_eval(9, "Bria eraser (commercial)", shared, composited, mask, out_stub)


def approach_10(shared: SharedDetection, out_stub: str) -> ApproachResult:
    """FLUX Kontext instruction-based edit (no mask)."""
    out_url = call_flux_kontext(shared.image_url, KONTEXT_PROMPT)
    _add_cost(COST_KONTEXT)
    output_bgr = download_image_to_bgr(out_url, (shared.H, shared.W))
    return _save_and_eval(10, "FLUX Kontext instruction edit", shared, output_bgr, None, out_stub)


APPROACHES = [
    (1, approach_1),
    (2, approach_2),
    (3, approach_3),
    (4, approach_4),
    (5, approach_5),
    (6, approach_6),
    (7, approach_7),
    (8, approach_8),
    (9, approach_9),
    (10, approach_10),
]


def _save_and_eval(
    aid: int,
    name: str,
    shared: SharedDetection,
    output_bgr: np.ndarray,
    mask: np.ndarray | None,
    out_stub: str,
) -> ApproachResult:
    out_dir = OUT_DIR if out_stub == "target" else OUT_FALLBACK / out_stub
    out_dir.mkdir(parents=True, exist_ok=True)
    out_subdir = out_dir / "outputs"
    out_subdir.mkdir(parents=True, exist_ok=True)
    mask_subdir = out_dir / "masks"
    mask_subdir.mkdir(parents=True, exist_ok=True)

    out_name = f"approach_{aid:02d}.png"
    mask_name = f"approach_{aid:02d}_mask.png"
    out_path = out_subdir / out_name
    mask_path = mask_subdir / mask_name

    cv2.imwrite(str(out_path), output_bgr)
    if mask is not None:
        cv2.imwrite(str(mask_path), mask)

    cost_before = get_cost()
    metrics = evaluate_and_score(
        shared.working_bgr, shared.image_url, output_bgr, mask, name,
    )
    eval_cost = get_cost() - cost_before

    composite = composite_score_from_metrics(metrics)

    # Compute relative paths for HTML (relative to OUT_DIR)
    if out_stub == "target":
        rel_out = f"outputs/{out_name}"
        rel_mask = f"masks/{mask_name}" if mask is not None else None
    else:
        rel_out = f"fallback/{out_stub}/outputs/{out_name}"
        rel_mask = f"fallback/{out_stub}/masks/{mask_name}" if mask is not None else None

    return ApproachResult(
        id=aid,
        name=name,
        status="ok",
        output_path=rel_out,
        mask_path=rel_mask,
        cost_usd=0.0,  # per-call cost set by caller via wrapper
        latency_s=0.0,
        metrics={**metrics, "_eval_cost_usd": round(eval_cost, 3)},
        composite_score=composite,
    )


# ---------------------------------------------------------------------------
# HTML generation
# ---------------------------------------------------------------------------

def _metric_row(label: str, value: Any, klass: str = "") -> str:
    return f'<div class="metric-row"><span>{label}</span><span class="{klass}">{value}</span></div>'


def _fmt_metric(name: str, val: Any) -> str:
    if val is None:
        return _metric_row(name, "—")
    if isinstance(val, float):
        return _metric_row(name, f"{val:.3f}")
    if isinstance(val, int):
        return _metric_row(name, str(val))
    if isinstance(val, list):
        if not val:
            return _metric_row(name, "[]")
        return _metric_row(name, ", ".join(str(v) for v in val[:5]))
    return _metric_row(name, str(val))


def render_cell(r: ApproachResult, best: bool = False) -> str:
    klass = "cell best" if best else "cell"
    if r.status != "ok":
        return f"""<div class="{klass}">
  <div class="label">Approach {r.id}: {r.name}</div>
  <div class="verdict error">FAILED: {r.error}</div>
</div>"""

    m = r.metrics
    resid = m.get("residual_count")
    resid_frac = m.get("residual_area_fraction")
    ims = m.get("inside_mask_ssim")
    ode = m.get("outside_mask_delta_e")
    ocr = m.get("ocr_recall")
    cs = m.get("claude_score")
    verdict = m.get("claude_verdict", "")
    residual_items = m.get("claude_residual_items", [])
    ghosts = m.get("claude_ghosts", [])

    mask_thumb = (
        f'<img src="{r.mask_path}" class="mask-thumb" alt="mask">'
        if r.mask_path else '<div class="mask-thumb empty">no mask (instruction edit)</div>'
    )

    residual_class = "metric-good" if (resid == 0) else "metric-bad"
    inside_class = "metric-good" if (ims is not None and ims < 0.5) else (
        "metric-meh" if (ims is not None and ims < 0.7) else "metric-bad"
    )

    return f"""<div class="{klass}">
  <div class="label">#{r.id} — {r.name}</div>
  <img src="{r.output_path}" alt="output">
  {mask_thumb}
  <div class="metrics">
    {_metric_row("cost", f"${r.cost_usd:.3f}")}
    {_metric_row("latency", f"{r.latency_s:.1f}s")}
    {_metric_row("residual count", str(resid) if resid is not None else "—", residual_class)}
    {_metric_row("residual area", f"{resid_frac*100:.2f}%" if resid_frac is not None else "—")}
    {_metric_row("inside-mask SSIM", f"{ims:.3f}" if ims is not None else "—", inside_class)}
    {_metric_row("outside ΔE", f"{ode:.2f}" if ode is not None else "—")}
    {_metric_row("OCR recall", f"{ocr:.2f}" if ocr is not None else "—")}
    {_metric_row("Claude score", f"{cs}/10" if cs is not None else "—")}
    {_metric_row("composite", f"{r.composite_score:.3f}", "metric-good" if best else "")}
  </div>
  <div class="verdict">{verdict}</div>
  {'<div class="verdict warn">residual: ' + ", ".join(residual_items[:4]) + '</div>' if residual_items else ''}
  {'<div class="verdict warn">ghosts: ' + ", ".join(ghosts[:4]) + '</div>' if ghosts else ''}
</div>"""


def generate_html(
    target_results: list[ApproachResult],
    target_image_rel: str,
    top_3_ids: list[int],
    fallback_results: dict[str, list[ApproachResult]],
    fallback_images_rel: dict[str, str],
    total_cost: float,
    total_latency: float,
) -> str:
    # Sort target results by composite descending for the ranking panel
    ok_results = [r for r in target_results if r.status == "ok"]
    ok_sorted = sorted(ok_results, key=lambda r: r.composite_score, reverse=True)

    cells = []
    for r in target_results:
        is_best = r.status == "ok" and r.id in top_3_ids
        cells.append(render_cell(r, best=is_best))

    ranking_rows = []
    for i, r in enumerate(ok_sorted):
        rc = r.metrics.get("residual_count", "—")
        ims = r.metrics.get("inside_mask_ssim", "—")
        ode = r.metrics.get("outside_mask_delta_e", "—")
        cs = r.metrics.get("claude_score", "—")
        ranking_rows.append(
            f"<tr><td>{i+1}</td><td>#{r.id}</td><td>{r.name}</td>"
            f"<td><b>{r.composite_score:.3f}</b></td>"
            f"<td>{rc}</td>"
            f"<td>{f'{ims:.3f}' if isinstance(ims, float) else ims}</td>"
            f"<td>{f'{ode:.2f}' if isinstance(ode, float) else ode}</td>"
            f"<td>{cs}</td>"
            f"<td>${r.cost_usd:.3f}</td>"
            f"<td>{r.latency_s:.1f}s</td></tr>"
        )
    for r in target_results:
        if r.status != "ok":
            ranking_rows.append(
                f"<tr class='fail'><td>—</td><td>#{r.id}</td><td>{r.name}</td>"
                f"<td colspan='8'>FAIL: {r.error}</td></tr>"
            )

    # Fallback (generalization) section
    fb_sections = []
    for room_name, results in fallback_results.items():
        room_img = fallback_images_rel.get(room_name, "")
        fb_cells = "\n".join(render_cell(r) for r in results)
        fb_sections.append(f"""<div class="fallback-room">
  <div class="cell input-cell">
    <div class="label">Fallback bench: {room_name}</div>
    <img src="{room_img}" style="max-width: 400px;">
  </div>
  {fb_cells}
</div>""")

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Empty Room Bake-Off — DAKSH target_room.jpg</title>
<style>
  body {{ background: #0a0a0a; color: #e5e5e5; font-family: -apple-system, 'Segoe UI', sans-serif; padding: 24px; }}
  h1, h2 {{ font-weight: 500; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px; margin-bottom: 40px; }}
  .cell {{ background: #141414; border-radius: 8px; padding: 16px; border: 1px solid #232323; }}
  .cell.best {{ border: 2px solid #4ade80; box-shadow: 0 0 20px rgba(74,222,128,0.15); }}
  .cell img {{ width: 100%; border-radius: 6px; display: block; }}
  .mask-thumb {{ width: 120px !important; margin-top: 8px; opacity: 0.65; }}
  .mask-thumb.empty {{ width: 120px; height: 28px; background: #0a0a0a; border-radius: 4px; font-size: 10px; color: #666; display: flex; align-items: center; justify-content: center; }}
  .label {{ font-size: 14px; font-weight: 500; margin: 0 0 12px; color: #f5f5f5; }}
  .metrics {{ font-size: 11px; color: #999; line-height: 1.7; font-family: 'SF Mono', Consolas, monospace; margin-top: 10px; }}
  .metric-row {{ display: flex; justify-content: space-between; border-bottom: 1px solid #1f1f1f; padding: 2px 0; }}
  .metric-good {{ color: #4ade80; }}
  .metric-bad {{ color: #ff6b6b; }}
  .metric-meh {{ color: #fbbf24; }}
  .verdict {{ font-size: 12px; color: #bbb; padding: 8px 10px; background: #0a0a0a; border-radius: 4px; margin-top: 8px; line-height: 1.4; }}
  .verdict.error {{ color: #ff6b6b; }}
  .verdict.warn {{ color: #fbbf24; font-size: 11px; }}
  .input-cell {{ background: #1a2942; border: 2px solid #3b82f6; grid-column: 1 / -1; }}
  table {{ width: 100%; border-collapse: collapse; margin: 16px 0 40px; font-size: 13px; }}
  th, td {{ padding: 8px 12px; text-align: left; border-bottom: 1px solid #222; }}
  th {{ background: #1f1f1f; font-weight: 500; color: #aaa; }}
  tr.fail td {{ color: #ff6b6b; }}
  .stats {{ background: #141414; padding: 16px; border-radius: 8px; margin-bottom: 24px; font-family: 'SF Mono', monospace; font-size: 13px; color: #bbb; }}
  .fallback-room {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px; margin-bottom: 32px; }}
</style>
</head>
<body>
<h1>Empty Room Bake-Off — DAKSH target_room.jpg</h1>
<div class="stats">
  Total cost: <b>${total_cost:.2f}</b> / cap ${COST_CAP:.0f} &middot;
  Total latency: <b>{total_latency:.1f}s</b> &middot;
  Approaches run: <b>{sum(1 for r in target_results if r.status == 'ok')}</b>/{len(target_results)} &middot;
  Top 3 IDs: <b>{top_3_ids}</b>
</div>

<h2>Input (target)</h2>
<div class="grid">
  <div class="cell input-cell">
    <div class="label">INPUT — target_room.jpg (DAKSH)</div>
    <img src="{target_image_rel}" style="max-width: 600px;">
  </div>
</div>

<h2>10 Approaches on DAKSH</h2>
<div class="grid">
{chr(10).join(cells)}
</div>

<h2>Composite Score Ranking</h2>
<table>
<thead><tr><th>#</th><th>ID</th><th>Name</th><th>Composite</th><th>Residual count</th><th>Inside SSIM</th><th>Outside ΔE</th><th>Claude</th><th>Cost</th><th>Latency</th></tr></thead>
<tbody>
{chr(10).join(ranking_rows)}
</tbody>
</table>

<h2>Generalization Check (top 3 on 3 other bench rooms)</h2>
{chr(10).join(fb_sections) if fb_sections else '<p>no fallback results</p>'}

</body></html>"""
    return html


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------

def run_approach_with_timing(
    approach_fn,
    aid: int,
    name: str,
    shared: SharedDetection,
    out_stub: str,
) -> ApproachResult:
    start = time.time()
    cost_before = get_cost()
    try:
        r = approach_fn(shared, out_stub)
        elapsed = time.time() - start
        r.latency_s = round(elapsed, 2)
        r.cost_usd = round(get_cost() - cost_before, 3)
        logger.info(
            "approach %d '%s' OK: composite=%.3f cost=$%.3f latency=%.1fs",
            aid, name, r.composite_score, r.cost_usd, r.latency_s,
        )
        return r
    except Exception as exc:  # noqa: BLE001
        elapsed = time.time() - start
        tb = traceback.format_exc()
        logger.error("approach %d '%s' FAILED: %s\n%s", aid, name, exc, tb)
        return ApproachResult(
            id=aid, name=name, status="fail",
            error=f"{type(exc).__name__}: {exc}",
            latency_s=round(elapsed, 2),
            cost_usd=round(get_cost() - cost_before, 3),
        )


def run_bakeoff() -> None:
    t0 = time.time()
    logger.info("=== Empty Room Bake-Off start ===")
    logger.info("Target: %s", TARGET)
    logger.info("Output: %s", OUT_DIR / "bakeoff.html")

    _load_fal_key()
    _load_anthropic_key()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        logger.warning("ANTHROPIC_API_KEY not loaded — Claude verdict + Claude-mask approach will fail")

    # Preprocess target
    pre = preprocess(str(TARGET))
    logger.info("target preprocessed: %s → %s (scale=%.3f)", pre.original_bgr.shape[:2], pre.working_bgr.shape[:2], pre.scale_factor)

    # Save input image at output_dir-relative path for the HTML
    target_copy = OUT_DIR / "input_target.png"
    cv2.imwrite(str(target_copy), pre.working_bgr)

    # Shared detection on target
    shared = run_shared_detection(pre.working_bgr)

    # Run 10 approaches
    target_results: list[ApproachResult] = []
    for aid, fn in APPROACHES:
        if get_cost() > COST_CAP:
            logger.warning("cost cap hit ($%.2f), skipping approach %d", get_cost(), aid)
            target_results.append(ApproachResult(
                id=aid, name=f"approach_{aid}", status="fail",
                error=f"cost cap hit before run (${get_cost():.2f})",
            ))
            continue
        if time.time() - t0 > TIME_CAP_SECONDS:
            logger.warning("time cap hit, skipping approach %d", aid)
            target_results.append(ApproachResult(
                id=aid, name=f"approach_{aid}", status="fail",
                error="time cap hit",
            ))
            continue
        name_map = {a[0]: a[1].__doc__.split(".")[0] for a in APPROACHES}
        result = run_approach_with_timing(fn, aid, name_map[aid], shared, "target")
        target_results.append(result)
        logger.info("running total cost: $%.2f", get_cost())

    # Identify top 3
    ok_sorted = sorted(
        [r for r in target_results if r.status == "ok"],
        key=lambda r: r.composite_score,
        reverse=True,
    )
    top_3 = [r.id for r in ok_sorted[:3]]
    logger.info("top 3 on target: %s", top_3)

    # Generalization on 3 other bench rooms
    fallback_results: dict[str, list[ApproachResult]] = {}
    fallback_images_rel: dict[str, str] = {}
    fb_ids_ok = [r.id for r in ok_sorted[:3]]
    approach_fns_by_id = {a[0]: a[1] for a in APPROACHES}
    name_by_id = {r.id: r.name for r in target_results}

    for room_path in FALLBACK_ROOMS:
        if get_cost() > COST_CAP:
            logger.warning("cost cap hit, skipping fallback room %s", room_path.name)
            break
        if time.time() - t0 > TIME_CAP_SECONDS:
            logger.warning("time cap hit, skipping fallback room %s", room_path.name)
            break
        try:
            fb_pre = preprocess(str(room_path))
        except Exception as exc:  # noqa: BLE001
            logger.warning("preprocess %s failed: %s", room_path.name, exc)
            continue

        stub = room_path.stem
        fb_dir = OUT_FALLBACK / stub
        fb_dir.mkdir(parents=True, exist_ok=True)
        fb_img_path = fb_dir / "input.png"
        cv2.imwrite(str(fb_img_path), fb_pre.working_bgr)
        fallback_images_rel[stub] = f"fallback/{stub}/input.png"

        fb_shared = run_shared_detection(fb_pre.working_bgr)

        room_results: list[ApproachResult] = []
        for aid in fb_ids_ok:
            if get_cost() > COST_CAP:
                logger.warning("cost cap hit inside fallback for %s", stub)
                break
            if time.time() - t0 > TIME_CAP_SECONDS:
                break
            fn = approach_fns_by_id[aid]
            r = run_approach_with_timing(fn, aid, name_by_id.get(aid, str(aid)), fb_shared, stub)
            room_results.append(r)
            logger.info("running total cost: $%.2f", get_cost())
        fallback_results[stub] = room_results

    # Write JSON result log
    result_log = {
        "target": [asdict(r) for r in target_results],
        "top_3": top_3,
        "fallback": {k: [asdict(r) for r in v] for k, v in fallback_results.items()},
        "total_cost_usd": round(get_cost(), 3),
        "total_latency_s": round(time.time() - t0, 1),
        "cost_cap": COST_CAP,
    }
    (OUT_DIR / "bakeoff_results.json").write_text(json.dumps(result_log, indent=2, default=str))

    # Write HTML
    html = generate_html(
        target_results=target_results,
        target_image_rel="input_target.png",
        top_3_ids=top_3,
        fallback_results=fallback_results,
        fallback_images_rel=fallback_images_rel,
        total_cost=get_cost(),
        total_latency=time.time() - t0,
    )
    (OUT_DIR / "bakeoff.html").write_text(html)

    logger.info("=== Bake-off complete ===")
    logger.info("Total cost: $%.2f", get_cost())
    logger.info("Total latency: %.1fs", time.time() - t0)
    logger.info("HTML: file://%s", OUT_DIR / "bakeoff.html")


if __name__ == "__main__":
    run_bakeoff()
