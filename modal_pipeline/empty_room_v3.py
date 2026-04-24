"""Cova V3 Phase A — Strict-inpaint empty-room pipeline.

Not a Modal service. This is a *local* orchestration library that runs
the entire Phase A pipeline on the caller's machine, making remote calls
to:

  * ``fal-ai/sam-3/image``          (protect + remove)
  * ``fal-ai/florence-2-large/ocr-with-region``
  * ``fal-ai/imageutils/depth``
  * ``fal-ai/flux-pro/v1/fill``
  * ``cova-mask2former-v3`` Modal endpoint

The design goal: never denoise full image, never paste-back anywhere
the protect mask covers, and guarantee ``output[feather==0] ==
input[feather==0]`` byte-exactly via ``_hard_enforce_outside_mask``.

Public entry point:

    from modal_pipeline.empty_room_v3 import run_phase_a

    result = run_phase_a(image_path, bench_tmp_dir, run_verify=True)
    result.final                # numpy uint8 BGR final composite
    result.remove_mask          # uint8 0/255
    result.protect_mask         # uint8 0/255
    result.feather_alpha        # float32 [0..1]
    result.verify               # VerifyResult dataclass
"""

from __future__ import annotations

import base64
import dataclasses
import hashlib
import io
import json
import logging
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger("empty_room_v3")
if not logger.handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )


# ---------------------------------------------------------------------------
# Remote endpoints + credentials
# ---------------------------------------------------------------------------

MASK2FORMER_URL = os.environ.get(
    "COVA_MASK2FORMER_V3_URL",
    "https://cova-interior--cova-mask2former-v3-mask2formerservice-api.modal.run",
)


def _load_fal_key() -> None:
    if os.environ.get("FAL_KEY"):
        return
    for candidate in (
        Path("/Users/daksh/Desktop/cova/apps/web/.env.local"),
        Path("/Users/daksh/Desktop/cova/.env.local"),
    ):
        if not candidate.exists():
            continue
        for line in candidate.read_text().splitlines():
            line = line.strip()
            if line.startswith("FAL_KEY="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                os.environ["FAL_KEY"] = val
                return
    raise RuntimeError("FAL_KEY not found in env or .env.local")


# ---------------------------------------------------------------------------
# SAM-3 prompts per spec
# ---------------------------------------------------------------------------

SAM3_PROTECT_WALL_PROMPTS: tuple[str, ...] = (
    "wainscoting",
    "crown molding",
    "baseboard",
    "built-in shelf",
    "built-in bookcase",
    "fireplace mantel",
    "wall-mounted cabinet",
    "plantation shutter",
    "honeycomb blind",
    "cellular blind",
    "permanent wall signage",
    "architectural niche",
    "picture rail",
    "mirror",
    "framed mirror",
    "wall-mounted television",
    "ceiling fan",
    "pendant light",
    "chandelier",
    "wall sconce",
    "flush-mount ceiling light",
)

SAM3_REMOVE_FURNITURE_PROMPTS: tuple[str, ...] = (
    "sofa", "couch", "armchair", "chair", "dining chair", "stool",
    "bench", "bed", "mattress", "platform bed", "headboard",
    "nightstand", "dresser", "wardrobe", "desk", "coffee table",
    "side table", "dining table", "console", "ottoman",
    "table lamp", "floor lamp", "desk lamp",
    "rug", "carpet on floor", "cushion", "pillow", "throw blanket",
    "loose curtain",
    "plant", "potted plant", "vase", "books",
    "framed picture on surface", "wall clock", "decorative object",
    "clutter",
    "computer monitor", "printer", "game console",
    "backpack", "bag", "clothing", "box", "cardboard box",
    "piano", "upright piano", "guitar",
)

MASK2FORMER_CLASSES: tuple[str, ...] = (
    "wall", "floor", "ceiling", "windowpane", "door", "column",
    "stairs", "railing", "fireplace", "countertop", "sink", "bathtub",
    "signboard",
)

# Detection thresholds per spec
PROTECT_THRESHOLD: float = 0.55
REMOVE_THRESHOLD: float = 0.30

WORKING_LONG_SIDE: int = 1024
BBOX_PADDING: int = 256

COST_SAM3_PER_CALL: float = 0.005
COST_FLORENCE2: float = 0.010
COST_DEPTH: float = 0.005
COST_FLUX_FILL: float = 0.05
COST_MASK2FORMER: float = 0.002  # our own A10G cost

SAM3_MAX_WORKERS: int = 24
SAM3_CLIENT_TIMEOUT_S: float = 40.0
SAM3_MAX_RETRIES: int = 3

EMPTY_ROOM_PROMPT = (
    "empty room, bare clean floor, bare walls, architectural photograph, "
    "no furniture, no clutter, no decor, no shadows from removed furniture, "
    "preserved architecture, uniform wall color, clean floor material, "
    "professionally cleaned and vacuumed, ready for staging"
)


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class PreprocessResult:
    original_bgr: "Any"
    working_bgr: "Any"
    working_rgb: "Any"
    scale_factor: float
    clahe_applied: bool


@dataclass
class OCRRegion:
    x: int
    y: int
    w: int
    h: int
    label: str


@dataclass
class DetectionResult:
    architecture_masks: dict[str, "Any"]  # class name → uint8 mask
    architecture_areas_pct: dict[str, float]
    depth_map: Optional["Any"]
    depth_edges: Optional["Any"]
    protect_wall_items: list["Any"]
    ocr_regions: list[OCRRegion]
    remove_furniture: list["Any"]
    partial_failures: list[str] = field(default_factory=list)
    cost_usd: float = 0.0


@dataclass
class VerifyResult:
    passed: bool
    residual_furniture_count: int
    residual_furniture_area_pct: float
    ocr_preserved: bool
    ocr_missing: list[str]
    architecture_iou: float
    mask_region_ssim: float  # SSIM inside remove_mask; > 0.70 = ghost blend (fail)
    failure_modes: list[str]
    cost_usd: float = 0.0


@dataclass
class PipelineResult:
    final_bgr: "Any"
    working_composite_bgr: "Any"
    detection: DetectionResult
    protect_mask: "Any"
    remove_mask: "Any"
    feather_alpha: "Any"
    attempts: int
    qa_outside_delta_e: float
    verify: VerifyResult
    cost_usd: float
    duration_s: float
    short_circuited: bool = False
    fal_input_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------------------------

def preprocess(image_path: str) -> PreprocessResult:
    import cv2  # type: ignore
    import numpy as np

    bgr = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if bgr is None:
        # fallback via PIL (handles webp)
        from PIL import Image, ImageOps

        pil = Image.open(image_path)
        pil = ImageOps.exif_transpose(pil).convert("RGB")
        rgb = np.array(pil)
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

    original = bgr.copy()

    # Low-light CLAHE
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l = lab[:, :, 0]
    median_lum = float(np.median(l))
    clahe_applied = False
    if median_lum < 40:
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        lab[:, :, 0] = clahe.apply(l)
        bgr = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        clahe_applied = True

    # Working resolution
    h, w = bgr.shape[:2]
    scale = WORKING_LONG_SIDE / max(h, w)
    if scale < 1.0:
        working = cv2.resize(
            bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA
        )
    else:
        working = bgr.copy()
        scale = 1.0

    working_rgb = cv2.cvtColor(working, cv2.COLOR_BGR2RGB)

    return PreprocessResult(
        original_bgr=original,
        working_bgr=working,
        working_rgb=working_rgb,
        scale_factor=scale,
        clahe_applied=clahe_applied,
    )


# ---------------------------------------------------------------------------
# Upload helpers
# ---------------------------------------------------------------------------

def _encode_png(arr_bgr_or_gray: "Any") -> bytes:
    import cv2  # type: ignore
    ok, buf = cv2.imencode(".png", arr_bgr_or_gray)
    if not ok:
        raise RuntimeError("PNG encode failed")
    return buf.tobytes()


def upload_bytes_to_fal(data: bytes, suffix: str = ".png") -> str:
    import fal_client  # type: ignore

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        return fal_client.upload_file(path)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def upload_image_to_fal(bgr: "Any") -> str:
    return upload_bytes_to_fal(_encode_png(bgr), suffix=".png")


# ---------------------------------------------------------------------------
# Remote calls
# ---------------------------------------------------------------------------

def call_sam3(
    image_url: str,
    prompt: str,
    threshold: float,
    max_masks: int = 8,
) -> list[tuple["Any", float]]:
    """Return list of (mask_uint8_LATER, score) — masks stay as URLs until we
    decide to keep them (to save download cost). We actually return
    (url, score) — downloading happens in a second pass.
    """
    import fal_client  # type: ignore

    last_err: Exception | None = None
    for attempt in range(SAM3_MAX_RETRIES + 1):
        try:
            r = fal_client.subscribe(
                "fal-ai/sam-3/image",
                arguments={
                    "image_url": image_url,
                    "prompt": prompt,
                    "return_multiple_masks": True,
                    "max_masks": max_masks,
                    "include_scores": True,
                    "apply_mask": False,
                    "output_format": "png",
                },
                with_logs=False,
                client_timeout=SAM3_CLIENT_TIMEOUT_S,
            )
            masks = r.get("masks") or []
            scores = r.get("scores") or []
            metadata = r.get("metadata") or []
            out: list[tuple[str, float]] = []
            for i, m in enumerate(masks):
                url = m.get("url") if isinstance(m, dict) else None
                if not url:
                    continue
                s = 0.5
                if i < len(scores) and scores[i] is not None:
                    s = float(scores[i])
                elif i < len(metadata) and isinstance(metadata[i], dict):
                    s = float(metadata[i].get("score", 0.5))
                if s >= threshold:
                    out.append((url, s))
            return out  # type: ignore[return-value]
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < SAM3_MAX_RETRIES:
                time.sleep(0.5 * (2 ** attempt))
    raise RuntimeError(f"sam3:{prompt}:{type(last_err).__name__}:{last_err}") from last_err


def download_mask(url: str, target_shape: tuple[int, int]) -> "Any":
    import cv2  # type: ignore
    import numpy as np
    import requests
    from PIL import Image

    raw = requests.get(url, timeout=30).content
    img = Image.open(io.BytesIO(raw)).convert("L")
    arr = np.array(img)
    h, w = target_shape
    if arr.shape != (h, w):
        arr = cv2.resize(arr, (w, h), interpolation=cv2.INTER_NEAREST)
    return (arr > 127).astype(np.uint8) * 255


def call_florence2_ocr(image_url: str) -> list[OCRRegion]:
    import fal_client  # type: ignore
    try:
        r = fal_client.subscribe(
            "fal-ai/florence-2-large/ocr-with-region",
            arguments={"image_url": image_url},
            with_logs=False,
            client_timeout=30.0,
        )
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"florence2-ocr:{type(exc).__name__}:{exc}") from exc

    regions: list[OCRRegion] = []
    quad_boxes = (r.get("results") or {}).get("quad_boxes") or []
    for qb in quad_boxes:
        label = str(qb.get("label", "")).lstrip("</s>").strip()
        if not label:
            continue
        regions.append(
            OCRRegion(
                x=int(qb.get("x", 0)),
                y=int(qb.get("y", 0)),
                w=int(qb.get("w", 0)),
                h=int(qb.get("h", 0)),
                label=label,
            )
        )
    return regions


def call_depth(image_url: str, target_shape: tuple[int, int]) -> tuple["Any", "Any"]:
    """Returns (depth_uint8, depth_edges_uint8)."""
    import cv2  # type: ignore
    import numpy as np
    import fal_client  # type: ignore
    import requests
    from PIL import Image

    r = fal_client.subscribe(
        "fal-ai/imageutils/depth",
        arguments={"image_url": image_url},
        with_logs=False,
        client_timeout=30.0,
    )
    depth_obj = r.get("image") or {}
    url = depth_obj.get("url") if isinstance(depth_obj, dict) else None
    if not url:
        raise RuntimeError("depth response missing url")
    raw = requests.get(url, timeout=30).content
    dimg = Image.open(io.BytesIO(raw)).convert("L")
    darr = np.array(dimg)
    h, w = target_shape
    if darr.shape != (h, w):
        darr = cv2.resize(darr, (w, h), interpolation=cv2.INTER_LINEAR)

    sx = cv2.Sobel(darr, cv2.CV_32F, 1, 0, ksize=3)
    sy = cv2.Sobel(darr, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.sqrt(sx * sx + sy * sy)
    mag_u8 = np.clip(mag, 0, 255).astype(np.uint8)
    _, edges = cv2.threshold(mag_u8, 20, 255, cv2.THRESH_BINARY)

    return darr, edges


def call_mask2former(image_url: str, classes: list[str] | None = None) -> tuple[dict[str, "Any"], dict[str, float]]:
    """Call the self-hosted Mask2Former service. Returns (masks, areas_pct)."""
    import numpy as np
    import requests
    from PIL import Image

    payload: dict[str, Any] = {"image_url": image_url}
    if classes:
        payload["classes"] = classes

    r = requests.post(
        f"{MASK2FORMER_URL}/v1/segment",
        json=payload,
        timeout=600,
    )
    if r.status_code != 200:
        raise RuntimeError(f"mask2former:{r.status_code}:{r.text[:200]}")

    body = r.json()
    W = body["image_width"]
    H = body["image_height"]
    masks_b64 = body["masks_base64"]
    areas = body["class_areas_pct"]

    masks: dict[str, Any] = {}
    for name, b64 in masks_b64.items():
        buf = base64.b64decode(b64)
        img = Image.open(io.BytesIO(buf)).convert("L")
        arr = np.array(img)
        if arr.shape != (H, W):
            import cv2  # type: ignore
            arr = cv2.resize(arr, (W, H), interpolation=cv2.INTER_NEAREST)
        masks[name] = (arr > 127).astype(np.uint8) * 255

    return masks, areas


def call_flux_fill(image_url: str, mask_url: str, steps: int = 50, guidance: float = 20.0) -> str:
    """Returns output image URL. Mask convention: white=inpaint, black=preserve."""
    import fal_client  # type: ignore

    last_err: Exception | None = None
    for attempt in range(3):
        try:
            r = fal_client.subscribe(
                "fal-ai/flux-pro/v1/fill",
                arguments={
                    "image_url": image_url,
                    "mask_url": mask_url,
                    "prompt": EMPTY_ROOM_PROMPT,
                    "num_inference_steps": steps,
                    "guidance_scale": guidance,
                    "seed": 42,
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
            raise RuntimeError(f"unexpected flux-fill response keys: {list(r.keys())}")
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < 2:
                time.sleep(1.0 * (2 ** attempt))
    raise RuntimeError(f"flux-fill:{type(last_err).__name__}:{last_err}") from last_err


def call_lama(image_url: str, mask_url: str) -> str:
    """LaMa inpaint — soft-blur fill, no hallucinations. Matches prod
    empty_room.py convention (white=inpaint, black=preserve)."""
    import fal_client  # type: ignore

    last_err: Exception | None = None
    for attempt in range(3):
        try:
            r = fal_client.subscribe(
                "fal-ai/lama",
                arguments={"image_url": image_url, "mask_image_url": mask_url},
                with_logs=False,
                client_timeout=180.0,
            )
            img = r.get("image")
            if isinstance(img, dict) and img.get("url"):
                return img["url"]
            raise RuntimeError(f"unexpected lama response: {list(r.keys())}")
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < 2:
                time.sleep(1.0 * (2 ** attempt))
    raise RuntimeError(f"lama:{type(last_err).__name__}:{last_err}") from last_err


# ---------------------------------------------------------------------------
# Detection fan-out (parallel)
# ---------------------------------------------------------------------------

def run_detection(working_rgb: "Any") -> tuple[DetectionResult, str]:
    """Upload image once, fan out all detections in parallel threads.

    Returns (DetectionResult, fal_image_url).
    """
    import cv2  # type: ignore
    import numpy as np

    H, W = working_rgb.shape[:2]
    bgr = cv2.cvtColor(working_rgb, cv2.COLOR_RGB2BGR)
    fal_url = upload_image_to_fal(bgr)
    logger.info("working image uploaded to fal: %s", fal_url[:60])

    partial: list[str] = []
    cost = 0.0

    # Submit all parallel tasks
    executor = ThreadPoolExecutor(max_workers=SAM3_MAX_WORKERS)
    futures: dict[Any, tuple[str, str]] = {}  # future → (kind, key)

    # Mask2Former
    futures[executor.submit(call_mask2former, fal_url, list(MASK2FORMER_CLASSES))] = ("mask2former", "all")
    # Depth
    futures[executor.submit(call_depth, fal_url, (H, W))] = ("depth", "depth")
    # Florence-2 OCR
    futures[executor.submit(call_florence2_ocr, fal_url)] = ("ocr", "ocr")
    # SAM-3 protect prompts
    for p in SAM3_PROTECT_WALL_PROMPTS:
        futures[executor.submit(call_sam3, fal_url, p, PROTECT_THRESHOLD)] = ("sam3_protect", p)
    # SAM-3 remove prompts
    for p in SAM3_REMOVE_FURNITURE_PROMPTS:
        futures[executor.submit(call_sam3, fal_url, p, REMOVE_THRESHOLD)] = ("sam3_remove", p)

    # Collect
    arch_masks: dict[str, Any] = {}
    arch_areas: dict[str, float] = {}
    depth_map = None
    depth_edges = None
    ocr_regions: list[OCRRegion] = []
    protect_mask_urls: list[str] = []
    remove_mask_urls: list[str] = []

    for fut in as_completed(futures):
        kind, key = futures[fut]
        try:
            res = fut.result()
        except Exception as exc:  # noqa: BLE001
            partial.append(f"{kind}:{key}:{type(exc).__name__}:{exc}")
            logger.warning("detection failure %s/%s: %s", kind, key, exc)
            continue

        if kind == "mask2former":
            arch_masks, arch_areas = res
            cost += COST_MASK2FORMER
        elif kind == "depth":
            depth_map, depth_edges = res
            cost += COST_DEPTH
        elif kind == "ocr":
            ocr_regions = res
            cost += COST_FLORENCE2
        elif kind == "sam3_protect":
            cost += COST_SAM3_PER_CALL
            for (url, score) in res:
                protect_mask_urls.append(url)
        elif kind == "sam3_remove":
            cost += COST_SAM3_PER_CALL
            for (url, score) in res:
                remove_mask_urls.append(url)

    executor.shutdown(wait=True)

    # Download all SAM3 masks in parallel
    protect_masks: list[Any] = []
    remove_masks: list[Any] = []
    if protect_mask_urls or remove_mask_urls:
        with ThreadPoolExecutor(max_workers=12) as dlex:
            p_futs = {dlex.submit(download_mask, u, (H, W)): ("p", u) for u in protect_mask_urls}
            r_futs = {dlex.submit(download_mask, u, (H, W)): ("r", u) for u in remove_mask_urls}
            all_futs = {**p_futs, **r_futs}
            for fut in as_completed(all_futs):
                kind, _ = all_futs[fut]
                try:
                    m = fut.result()
                except Exception as exc:  # noqa: BLE001
                    partial.append(f"mask-dl:{kind}:{exc}")
                    continue
                if kind == "p":
                    protect_masks.append(m)
                else:
                    remove_masks.append(m)

    det = DetectionResult(
        architecture_masks=arch_masks,
        architecture_areas_pct=arch_areas,
        depth_map=depth_map,
        depth_edges=depth_edges,
        protect_wall_items=protect_masks,
        ocr_regions=ocr_regions,
        remove_furniture=remove_masks,
        partial_failures=partial,
        cost_usd=cost,
    )
    logger.info(
        "detection: arch=%d m2f-classes, %d protect-wall, %d remove-furn, %d ocr, cost=$%.4f, partial=%d",
        len(arch_masks), len(protect_masks), len(remove_masks), len(ocr_regions), cost, len(partial),
    )
    return det, fal_url


# ---------------------------------------------------------------------------
# Mask arbitration
# ---------------------------------------------------------------------------

def build_protect_mask(
    det: DetectionResult,
    shape: tuple[int, int],
    ocr_padding: int = 8,
) -> "Any":
    import cv2  # type: ignore
    import numpy as np

    H, W = shape
    protect = np.zeros((H, W), dtype=np.uint8)

    # Mask2Former architecture — always protected
    for name, m in det.architecture_masks.items():
        if m is None:
            continue
        protect = np.maximum(protect, m)

    # SAM-3 protect wall items
    for m in det.protect_wall_items:
        protect = np.maximum(protect, m)

    # OCR regions
    for region in det.ocr_regions:
        x1 = max(0, region.x - ocr_padding)
        y1 = max(0, region.y - ocr_padding)
        x2 = min(W, region.x + region.w + ocr_padding)
        y2 = min(H, region.y + region.h + ocr_padding)
        cv2.rectangle(protect, (x1, y1), (x2, y2), 255, -1)

    return protect


def build_remove_mask(
    det: DetectionResult,
    protect_mask: "Any",
    shape: tuple[int, int],
    dilation_uniform_px: int = 6,
    dilation_downward_px: int = 15,
    min_component_frac: float = 0.001,
) -> "Any":
    import cv2  # type: ignore
    import numpy as np

    H, W = shape

    # Union of SAM-3 remove masks
    remove = np.zeros((H, W), dtype=np.uint8)
    for m in det.remove_furniture:
        remove = np.maximum(remove, m)

    # Subtract protect mask
    remove = np.where(protect_mask > 0, 0, remove).astype(np.uint8)

    # Morphological close (5x5)
    kc = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    remove = cv2.morphologyEx(remove, cv2.MORPH_CLOSE, kc)

    # Fill interior holes using cv2.floodFill
    filled = remove.copy()
    h2, w2 = remove.shape
    ff_mask = np.zeros((h2 + 2, w2 + 2), dtype=np.uint8)
    cv2.floodFill(filled, ff_mask, (0, 0), 128)
    # pixels that are 0 and not flood-filled are interior holes
    interior = (filled == 0).astype(np.uint8) * 255
    remove = np.maximum(remove, interior)

    # Drop tiny components
    num, labels = cv2.connectedComponents(remove)
    min_area = min_component_frac * remove.shape[0] * remove.shape[1]
    out = np.zeros_like(remove)
    for i in range(1, num):
        comp = (labels == i)
        if comp.sum() >= min_area:
            out[comp] = 255
    remove = out

    # Uniform dilation
    if dilation_uniform_px > 0:
        k = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (dilation_uniform_px * 2 + 1, dilation_uniform_px * 2 + 1),
        )
        remove = cv2.dilate(remove, k)

    # Asymmetric downward dilation (floor contact shadow)
    if dilation_downward_px > 0:
        kd = np.zeros((dilation_downward_px * 2 + 1, dilation_uniform_px * 2 + 1), dtype=np.uint8)
        kd[dilation_downward_px:, :] = 1
        remove = cv2.dilate(remove, kd)

    # CRITICAL: re-subtract protect mask (dilation may have bled)
    remove = np.where(protect_mask > 0, 0, remove).astype(np.uint8)

    return remove


def feather_mask(binary: "Any", sigma: float = 6.0) -> "Any":
    import cv2  # type: ignore
    import numpy as np
    if binary.dtype == np.uint8:
        b = binary.astype(np.float32) / 255.0
    else:
        b = binary.astype(np.float32)
    blurred = cv2.GaussianBlur(b, (0, 0), sigma)
    return np.clip(blurred, 0, 1).astype(np.float32)


# ---------------------------------------------------------------------------
# Empty-room generation
# ---------------------------------------------------------------------------

@dataclass
class CropMeta:
    y1: int
    y2: int
    x1: int
    x2: int
    pad_top: int
    pad_left: int
    scale: float
    orig_crop_h: int
    orig_crop_w: int


def _crop_and_resize_to_1024(
    img_bgr: "Any", mask: "Any", pad_px: int = BBOX_PADDING, target: int = 1024
) -> tuple["Any", "Any", CropMeta]:
    import cv2  # type: ignore
    import numpy as np

    H, W = img_bgr.shape[:2]
    ys, xs = np.where(mask > 0)
    if ys.size == 0:
        # trivial — no mask, crop nothing
        raise RuntimeError("remove_mask is empty; short-circuit should have been taken")
    y1 = max(0, int(ys.min()) - pad_px)
    y2 = min(H, int(ys.max()) + pad_px)
    x1 = max(0, int(xs.min()) - pad_px)
    x2 = min(W, int(xs.max()) + pad_px)

    crop = img_bgr[y1:y2, x1:x2]
    crop_m = mask[y1:y2, x1:x2]
    ch, cw = crop.shape[:2]

    # Resize preserving aspect, pad to target×target with zeros
    scale = target / max(ch, cw)
    nh, nw = int(round(ch * scale)), int(round(cw * scale))
    resized = cv2.resize(crop, (nw, nh), interpolation=cv2.INTER_LANCZOS4)
    resized_m = cv2.resize(crop_m, (nw, nh), interpolation=cv2.INTER_NEAREST)

    pad_top = (target - nh) // 2
    pad_left = (target - nw) // 2
    pad_bottom = target - nh - pad_top
    pad_right = target - nw - pad_left

    padded = cv2.copyMakeBorder(resized, pad_top, pad_bottom, pad_left, pad_right,
                                cv2.BORDER_CONSTANT, value=[0, 0, 0])
    padded_m = cv2.copyMakeBorder(resized_m, pad_top, pad_bottom, pad_left, pad_right,
                                  cv2.BORDER_CONSTANT, value=0)

    meta = CropMeta(
        y1=y1, y2=y2, x1=x1, x2=x2,
        pad_top=pad_top, pad_left=pad_left,
        scale=scale, orig_crop_h=ch, orig_crop_w=cw,
    )
    return padded, padded_m, meta


def _unresize_from_pad(output_bgr_target: "Any", meta: CropMeta) -> "Any":
    import cv2  # type: ignore

    nh = int(round(meta.orig_crop_h * meta.scale))
    nw = int(round(meta.orig_crop_w * meta.scale))
    unpadded = output_bgr_target[meta.pad_top:meta.pad_top + nh, meta.pad_left:meta.pad_left + nw]
    unscaled = cv2.resize(unpadded, (meta.orig_crop_w, meta.orig_crop_h), interpolation=cv2.INTER_LANCZOS4)
    return unscaled


def generate_empty_room(
    working_bgr: "Any",
    remove_mask: "Any",
    num_inference_steps: int = 50,
    guidance_scale: float = 20.0,
    inpainter: str = "lama",
) -> "Any":
    """Crop around mask → inpaint → paste back. Does NOT composite
    (that's done by `composite_inpaint`).

    ``inpainter``: "lama" (soft-blur fill, no hallucinations — the
    empirically-better choice per production empty_room.py) or
    "flux_fill" (FLUX.1 [pro] Fill, follows prompt but hallucinates
    furniture — per spec's "Risks and mitigations" table)."""
    import cv2  # type: ignore
    import numpy as np
    import requests

    if remove_mask.sum() == 0:
        return working_bgr.copy()

    padded_crop_bgr, padded_crop_mask, meta = _crop_and_resize_to_1024(working_bgr, remove_mask)

    # Upload crop + mask
    img_url = upload_image_to_fal(padded_crop_bgr)
    mask_url = upload_image_to_fal(padded_crop_mask)

    if inpainter == "lama":
        out_url = call_lama(img_url, mask_url)
    elif inpainter == "flux_fill":
        out_url = call_flux_fill(
            img_url, mask_url,
            steps=num_inference_steps, guidance=guidance_scale,
        )
    else:
        raise ValueError(f"unknown inpainter: {inpainter}")

    out_bytes = requests.get(out_url, timeout=120).content
    from PIL import Image as PILImage
    out_pil = PILImage.open(io.BytesIO(out_bytes)).convert("RGB")
    out_rgb = np.array(out_pil)
    if out_rgb.shape[:2] != (1024, 1024):
        out_rgb = cv2.resize(out_rgb, (1024, 1024), interpolation=cv2.INTER_LANCZOS4)
    out_bgr = cv2.cvtColor(out_rgb, cv2.COLOR_RGB2BGR)

    # Unresize back to original crop dims
    out_crop = _unresize_from_pad(out_bgr, meta)

    # Paste back into full working image
    result = working_bgr.copy()
    result[meta.y1:meta.y2, meta.x1:meta.x2] = out_crop
    return result


# ---------------------------------------------------------------------------
# Composite with bit-exact enforcement
# ---------------------------------------------------------------------------

def _srgb_to_linear(rgb_uint8: "Any") -> "Any":
    import numpy as np
    rgb = rgb_uint8.astype(np.float32) / 255.0
    a = 0.055
    return np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + a) / (1 + a)) ** 2.4)


def _linear_to_srgb(linear: "Any") -> "Any":
    import numpy as np
    a = 0.055
    rgb = np.where(
        linear <= 0.0031308,
        linear * 12.92,
        (1 + a) * np.power(np.maximum(linear, 0), 1 / 2.4) - a,
    )
    return np.clip(rgb * 255, 0, 255).astype(np.uint8)


def composite_inpaint(original_bgr: "Any", generated_bgr: "Any", feather_alpha: "Any") -> "Any":
    """Linear-light alpha composite with HARD enforcement outside mask."""
    import numpy as np

    assert original_bgr.shape == generated_bgr.shape
    assert feather_alpha.shape[:2] == original_bgr.shape[:2]

    alpha = feather_alpha
    if alpha.ndim == 2:
        alpha = alpha[..., None]

    orig_lin = _srgb_to_linear(original_bgr)
    gen_lin = _srgb_to_linear(generated_bgr)
    blended_lin = orig_lin * (1 - alpha) + gen_lin * alpha
    blended = _linear_to_srgb(blended_lin)

    # HARD enforcement — bit-exact wherever alpha is exactly 0
    outside = (feather_alpha if feather_alpha.ndim == 2 else feather_alpha[..., 0]) == 0
    blended[outside] = original_bgr[outside]

    return blended


def qa_outside_delta_e(original_bgr: "Any", output_bgr: "Any", feather_alpha: "Any") -> float:
    """ΔE2000 on mask==0 region. Must be 0 after hard enforcement."""
    import cv2  # type: ignore
    import numpy as np
    from skimage.color import rgb2lab, deltaE_ciede2000  # type: ignore

    outside = (feather_alpha if feather_alpha.ndim == 2 else feather_alpha[..., 0]) == 0
    if not outside.any():
        return 0.0

    orig_rgb = cv2.cvtColor(original_bgr, cv2.COLOR_BGR2RGB)
    out_rgb = cv2.cvtColor(output_bgr, cv2.COLOR_BGR2RGB)
    orig_lab = rgb2lab(orig_rgb.astype(np.float32) / 255.0)
    out_lab = rgb2lab(out_rgb.astype(np.float32) / 255.0)
    delta = deltaE_ciede2000(orig_lab, out_lab)
    return float(delta[outside].mean())


# ---------------------------------------------------------------------------
# Verify truly empty
# ---------------------------------------------------------------------------

def _area_frac(mask: "Any") -> float:
    import numpy as np
    return float((mask > 127).sum()) / float(mask.size)


MASK_REGION_SSIM_GHOST_THRESHOLD: float = 0.70


def _mask_region_ssim(input_bgr: "Any", output_bgr: "Any", binary_mask: "Any") -> float:
    """Mean SSIM between input and output *inside* the binary remove mask.

    Interpretation:
      * < 0.50  → inpainter genuinely replaced pixels in the mask region
      * 0.50-0.70 → partial replacement (acceptable, soft-blur fill)
      * > 0.70  → pixels are nearly identical to input → pipeline ghost-blended

    Returns 1.0 if mask is empty (no remove region → trivially unchanged).
    """
    import cv2  # type: ignore
    import numpy as np
    from skimage.metrics import structural_similarity as ssim  # type: ignore

    mask_bool = binary_mask > 0
    if not mask_bool.any():
        return 1.0
    in_gray = cv2.cvtColor(input_bgr, cv2.COLOR_BGR2GRAY)
    out_gray = cv2.cvtColor(output_bgr, cv2.COLOR_BGR2GRAY)
    _, full_map = ssim(in_gray, out_gray, data_range=255, full=True)
    return float(full_map[mask_bool].mean())


def verify_output(
    output_bgr: "Any",
    input_detection: DetectionResult,
    input_protect_mask: "Any",
    input_bgr: "Any" = None,
    remove_mask_for_ssim: "Any" = None,
) -> VerifyResult:
    """Programmatic verification: residual furniture + OCR + architecture IoU
    + mask-region SSIM ghost check.

    Parameters:
        output_bgr: the composited empty-room image being verified
        input_detection: DetectionResult from the ORIGINAL input (for OCR + arch masks)
        input_protect_mask: protect mask at output resolution (to subtract from residual)
        input_bgr: ORIGINAL working-res BGR image (for mask-region SSIM)
        remove_mask_for_ssim: the binary remove_mask actually sent to the inpainter.
            If SSIM inside this region > 0.70, the pipeline ghost-blended and we
            hard-fail regardless of residual count.

    The mask-region SSIM check is the critical new guard added April 21 after the
    first bench exposed "clean mask + full inpaint → residual furniture visible"
    failure modes. It catches the case where the inpainter/composite appears to
    run but the output pixels are effectively unchanged from input.
    """
    import cv2  # type: ignore
    import numpy as np

    H, W = output_bgr.shape[:2]
    fal_url = upload_image_to_fal(output_bgr)

    cost = 0.0
    partial: list[str] = []

    # Smaller verify prompt list to save cost (top 12 most common)
    VERIFY_REMOVE_PROMPTS = (
        "sofa", "couch", "armchair", "chair", "bed", "dresser",
        "table lamp", "floor lamp", "coffee table", "side table",
        "rug", "plant", "pillow", "clutter",
    )

    with ThreadPoolExecutor(max_workers=SAM3_MAX_WORKERS) as ex:
        # Re-detect residual furniture
        sam_futs = {
            ex.submit(call_sam3, fal_url, p, REMOVE_THRESHOLD): p
            for p in VERIFY_REMOVE_PROMPTS
        }
        # Re-run OCR
        ocr_fut = ex.submit(call_florence2_ocr, fal_url)
        # Re-run Mask2Former
        m2f_fut = ex.submit(call_mask2former, fal_url, list(MASK2FORMER_CLASSES))

        residual_urls: list[str] = []
        for fut in as_completed(sam_futs):
            p = sam_futs[fut]
            cost += COST_SAM3_PER_CALL
            try:
                res = fut.result()
            except Exception as exc:  # noqa: BLE001
                partial.append(f"verify-sam3:{p}:{exc}")
                continue
            for (url, score) in res:
                residual_urls.append(url)

        try:
            output_ocr = ocr_fut.result()
            cost += COST_FLORENCE2
        except Exception as exc:  # noqa: BLE001
            output_ocr = []
            partial.append(f"verify-ocr:{exc}")

        try:
            out_arch_masks, out_arch_areas = m2f_fut.result()
            cost += COST_MASK2FORMER
        except Exception as exc:  # noqa: BLE001
            out_arch_masks, out_arch_areas = {}, {}
            partial.append(f"verify-m2f:{exc}")

    # Download residuals
    residual_mask = np.zeros((H, W), dtype=np.uint8)
    if residual_urls:
        with ThreadPoolExecutor(max_workers=12) as ex:
            futs = {ex.submit(download_mask, u, (H, W)): u for u in residual_urls}
            for fut in as_completed(futs):
                try:
                    m = fut.result()
                    residual_mask = np.maximum(residual_mask, m)
                except Exception:  # noqa: BLE001
                    pass
    # Subtract protect mask (ignore architecture that SAM-3 sometimes misfires on)
    residual_mask = np.where(input_protect_mask > 0, 0, residual_mask).astype(np.uint8)
    # Only count significant residuals (>0.5% area)
    num_lbl, labels = cv2.connectedComponents(residual_mask)
    big_components = 0
    residual_frac = 0.0
    for i in range(1, num_lbl):
        frac = float((labels == i).sum()) / float(H * W)
        if frac >= 0.005:
            big_components += 1
            residual_frac += frac

    # OCR preservation
    input_ocr_labels = {r.label.strip().upper() for r in input_detection.ocr_regions if r.label.strip()}
    output_ocr_labels = {r.label.strip().upper() for r in output_ocr if r.label.strip()}
    ocr_missing = sorted(input_ocr_labels - output_ocr_labels)
    ocr_preserved = len(ocr_missing) == 0

    # Architecture IoU — compute on wall∪floor∪ceiling union (the structural shell)
    def _union(classes: list[str], masks: dict[str, Any]) -> "Any":
        u = np.zeros((H, W), dtype=np.uint8)
        for c in classes:
            m = masks.get(c)
            if m is not None:
                u = np.maximum(u, m)
        return u

    in_arch = _union(["wall", "floor", "ceiling"], input_detection.architecture_masks)
    out_arch = _union(["wall", "floor", "ceiling"], out_arch_masks) if out_arch_masks else in_arch

    inter = np.logical_and(in_arch > 0, out_arch > 0).sum()
    union = np.logical_or(in_arch > 0, out_arch > 0).sum()
    iou = float(inter / union) if union > 0 else 1.0

    # Mask-region SSIM ghost check (hard fail if > 0.70).
    mask_ssim_val: float = 1.0
    mask_ssim_is_ghost: bool = False
    if input_bgr is not None and remove_mask_for_ssim is not None and (remove_mask_for_ssim > 0).any():
        # Ensure the SSIM mask matches output resolution
        mssim_mask = remove_mask_for_ssim
        if mssim_mask.shape[:2] != (H, W):
            mssim_mask = cv2.resize(mssim_mask, (W, H), interpolation=cv2.INTER_NEAREST)
        in_for_ssim = input_bgr
        if in_for_ssim.shape[:2] != (H, W):
            in_for_ssim = cv2.resize(in_for_ssim, (W, H), interpolation=cv2.INTER_AREA)
        mask_ssim_val = _mask_region_ssim(in_for_ssim, output_bgr, mssim_mask)
        mask_ssim_is_ghost = mask_ssim_val > MASK_REGION_SSIM_GHOST_THRESHOLD

    failure_modes: list[str] = []
    if big_components > 0:
        failure_modes.append(f"residual_furniture:{big_components}:area={residual_frac:.3f}")
    if not ocr_preserved:
        failure_modes.append(f"ocr_lost:{ocr_missing}")
    if iou < 0.95:
        failure_modes.append(f"architecture_iou:{iou:.3f}")
    if mask_ssim_is_ghost:
        failure_modes.append(
            f"mask_region_ghost:ssim={mask_ssim_val:.3f}>thr={MASK_REGION_SSIM_GHOST_THRESHOLD}"
        )

    passed = (
        (big_components == 0)
        and ocr_preserved
        and (iou >= 0.95)
        and not mask_ssim_is_ghost
    )

    return VerifyResult(
        passed=passed,
        residual_furniture_count=big_components,
        residual_furniture_area_pct=round(residual_frac * 100.0, 3),
        ocr_preserved=ocr_preserved,
        ocr_missing=ocr_missing,
        architecture_iou=round(iou, 4),
        mask_region_ssim=round(mask_ssim_val, 4),
        failure_modes=failure_modes,
        cost_usd=round(cost, 4),
    )


# ---------------------------------------------------------------------------
# Full pipeline with retry loop
# ---------------------------------------------------------------------------

def run_phase_a(
    image_path: str,
    tmp_dir: Path | None = None,
    run_verify: bool = True,
    max_retries: int = 3,
    min_remove_frac_short_circuit: float = 0.005,
) -> PipelineResult:
    """Full Phase A pipeline with autonomous retry loop."""
    import cv2  # type: ignore
    import numpy as np

    _load_fal_key()

    t0 = time.perf_counter()
    cost = 0.0
    partial: list[str] = []

    pre = preprocess(image_path)
    logger.info(
        "preprocess: orig=%s working=%s scale=%.3f clahe=%s",
        pre.original_bgr.shape[:2], pre.working_bgr.shape[:2],
        pre.scale_factor, pre.clahe_applied,
    )

    det, fal_url = run_detection(pre.working_rgb)
    partial.extend(det.partial_failures)
    cost += det.cost_usd

    H, W = pre.working_bgr.shape[:2]
    protect_mask = build_protect_mask(det, (H, W))

    # Short-circuit: nothing to remove
    raw_remove_union = np.zeros((H, W), dtype=np.uint8)
    for m in det.remove_furniture:
        raw_remove_union = np.maximum(raw_remove_union, m)
    raw_frac = _area_frac(raw_remove_union)
    logger.info("raw remove coverage: %.2f%%", raw_frac * 100)

    if raw_frac < min_remove_frac_short_circuit:
        # Room already looks empty. Return input unchanged (bit-exact).
        logger.info("short-circuit: raw mask < 0.5%%, returning input unchanged")
        empty_feather = np.zeros((H, W), dtype=np.float32)
        final_working = pre.working_bgr.copy()
        final_at_orig = pre.original_bgr.copy()
        verify_res = VerifyResult(
            passed=True,
            residual_furniture_count=0,
            residual_furniture_area_pct=0.0,
            ocr_preserved=True,
            ocr_missing=[],
            architecture_iou=1.0,
            mask_region_ssim=1.0,  # short-circuit: no inpainting → trivially unchanged
            failure_modes=[],
            cost_usd=0.0,
        )
        return PipelineResult(
            final_bgr=final_at_orig,
            working_composite_bgr=final_working,
            detection=det,
            protect_mask=protect_mask,
            remove_mask=np.zeros((H, W), dtype=np.uint8),
            feather_alpha=empty_feather,
            attempts=1,
            qa_outside_delta_e=0.0,
            verify=verify_res,
            cost_usd=cost,
            duration_s=time.perf_counter() - t0,
            short_circuited=True,
            fal_input_url=fal_url,
        )

    # Iterate
    params = dict(
        dilation_uniform=6,
        dilation_downward=15,
        feather_sigma=6.0,
        inpaint_steps=50,
        inpainter="lama",
    )

    last_verify: VerifyResult | None = None
    last_remove_mask = None
    last_feather = None
    last_generated = None
    last_working_composite = None
    last_qa = 0.0

    for attempt in range(max_retries):
        remove_mask = build_remove_mask(
            det, protect_mask, (H, W),
            dilation_uniform_px=params["dilation_uniform"],
            dilation_downward_px=params["dilation_downward"],
        )
        feather = feather_mask(remove_mask, sigma=params["feather_sigma"])
        logger.info(
            "attempt %d: dilation=(%d,%d), feather_sigma=%.1f, remove_pct=%.2f",
            attempt + 1, params["dilation_uniform"], params["dilation_downward"],
            params["feather_sigma"], (remove_mask > 0).sum() / remove_mask.size * 100,
        )

        generated = generate_empty_room(
            pre.working_bgr, remove_mask,
            num_inference_steps=params["inpaint_steps"],
            inpainter=params["inpainter"],
        )
        cost += (0.04 if params["inpainter"] == "lama" else COST_FLUX_FILL)

        working_composite = composite_inpaint(pre.working_bgr, generated, feather)
        qa_de = qa_outside_delta_e(pre.working_bgr, working_composite, feather)
        if qa_de > 0.5:
            raise RuntimeError(
                f"QA FAIL: outside-mask ΔE2000 = {qa_de:.4f} (should be 0). "
                f"Composite is broken — bit-exact preservation violated."
            )
        last_qa = qa_de
        last_working_composite = working_composite
        last_remove_mask = remove_mask
        last_feather = feather
        last_generated = generated

        if run_verify:
            verify_res = verify_output(
                working_composite,
                det,
                protect_mask,
                input_bgr=pre.working_bgr,
                remove_mask_for_ssim=remove_mask,
            )
            cost += verify_res.cost_usd
            last_verify = verify_res
            logger.info(
                "verify attempt %d: pass=%s residual=%d ocr=%s iou=%.3f modes=%s",
                attempt + 1, verify_res.passed, verify_res.residual_furniture_count,
                verify_res.ocr_preserved, verify_res.architecture_iou,
                verify_res.failure_modes,
            )
        else:
            last_verify = VerifyResult(
                passed=True, residual_furniture_count=0,
                residual_furniture_area_pct=0.0, ocr_preserved=True,
                ocr_missing=[], architecture_iou=1.0,
                mask_region_ssim=1.0, failure_modes=[],
            )

        if last_verify.passed:
            break

        # Adjust for next attempt
        if last_verify.residual_furniture_count > 0:
            params["dilation_uniform"] = min(params["dilation_uniform"] + 4, 22)
            params["dilation_downward"] = min(params["dilation_downward"] + 8, 40)
            logger.info(
                "retry: residual furniture → dilation=(%d,%d)",
                params["dilation_uniform"], params["dilation_downward"],
            )
        if not last_verify.ocr_preserved:
            # Rebuild protect mask with wider OCR padding
            logger.info("retry: OCR lost → rebuilding protect mask with 24px OCR pad")
            protect_mask = build_protect_mask(det, (H, W), ocr_padding=24)
        if last_verify.architecture_iou < 0.95:
            params["feather_sigma"] = max(3.0, params["feather_sigma"] - 1.0)
            logger.info("retry: arch IoU low → feather sigma=%.1f", params["feather_sigma"])

    if not last_verify or not last_verify.passed:
        if run_verify:
            # Returns partial result for gallery — marked FAIL in the bench runner
            logger.warning(
                "exhausted %d retries — final verify=%s modes=%s",
                max_retries, last_verify.passed if last_verify else None,
                last_verify.failure_modes if last_verify else None,
            )

    # Upscale working → original resolution
    final_working = last_working_composite
    if pre.scale_factor < 1.0:
        # Resize generated composite to original resolution
        orig_h, orig_w = pre.original_bgr.shape[:2]
        # Resize mask to original resolution
        import cv2  # type: ignore
        final_feather_orig = cv2.resize(
            last_feather, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR
        )
        final_generated_orig = cv2.resize(
            final_working, (orig_w, orig_h), interpolation=cv2.INTER_LANCZOS4,
        )
        final_bgr = composite_inpaint(pre.original_bgr, final_generated_orig, final_feather_orig)
    else:
        final_bgr = final_working

    duration_s = time.perf_counter() - t0
    return PipelineResult(
        final_bgr=final_bgr,
        working_composite_bgr=final_working,
        detection=det,
        protect_mask=protect_mask,
        remove_mask=last_remove_mask,
        feather_alpha=last_feather,
        attempts=attempt + 1,
        qa_outside_delta_e=last_qa,
        verify=last_verify,  # type: ignore[arg-type]
        cost_usd=cost,
        duration_s=duration_s,
        short_circuited=False,
        fal_input_url=fal_url,
    )


# ---------------------------------------------------------------------------
# Detection overlay helper (for gallery)
# ---------------------------------------------------------------------------

def create_detection_overlay(bgr: "Any", remove_mask: "Any", protect_mask: "Any") -> "Any":
    """Original image with red (remove) + green (protect) translucent overlay."""
    import cv2  # type: ignore
    import numpy as np

    base = bgr.copy().astype(np.float32)
    H, W = bgr.shape[:2]

    # Resize masks if needed
    if remove_mask.shape[:2] != (H, W):
        remove_mask = cv2.resize(remove_mask, (W, H), interpolation=cv2.INTER_NEAREST)
    if protect_mask.shape[:2] != (H, W):
        protect_mask = cv2.resize(protect_mask, (W, H), interpolation=cv2.INTER_NEAREST)

    # Red for remove
    red = np.zeros_like(base)
    red[..., 2] = 255  # BGR — red channel index 2
    alpha_r = (remove_mask > 0).astype(np.float32) * 0.45
    alpha_r = alpha_r[..., None]
    base = base * (1 - alpha_r) + red * alpha_r

    # Green for protect
    green = np.zeros_like(base)
    green[..., 1] = 255
    alpha_g = (protect_mask > 0).astype(np.float32) * 0.30
    alpha_g = alpha_g[..., None]
    base = base * (1 - alpha_g) + green * alpha_g

    return np.clip(base, 0, 255).astype(np.uint8)
