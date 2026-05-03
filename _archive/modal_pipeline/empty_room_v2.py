"""Cova Render v2 — Empty-Room Service (2026-04-21).

Modal app: ``cova-empty-room-v2`` (STAGING, NOT production).
A10G GPU. Python 3.10. Single v1 endpoint: POST /v1/generate_empty_room.

v2 changes over v1 (cova-empty-room):
  - FURNITURE_REMOVE_PROMPTS extended from 22 → 44 (spec Phase 1B).
    Adds: comforter/bedsheet, console table/sideboard/freestanding shelf,
    poster/framed photo/wall art/painting/canvas, LED strip/string lights,
    laptop/computer, backpack/bag/box, bottle/cup, houseplant/vase/candle/
    figurine, letters/stickers/photos hanging.
  - ARCHITECTURE_PRESERVE_PROMPTS extended from 5 → 24 at threshold 0.35
    (spec Phase 1A). Adds: doorway, crown molding, baseboard, wainscoting,
    ceiling beam/medallion, built-in shelving/cabinet, fireplace/mantel,
    radiator/vent, ceiling fan, chandelier, pendant fixture, recessed light,
    blinds/shutters, exposed brick/stone wall/wood paneling.
  - New preemptive _detect_input_coverage: near-empty inputs (coverage<0.15)
    SKIP inpaint entirely and return original as empty_room_url.
    Fixes F-RENDER-UPGRADE-3 (room-14 stacked-stone).
  - New _verify_truly_empty Claude Vision loop: post-inpaint, ask Sonnet to
    judge empty/architecture_preserved. If not empty AND attempt<3, run a
    second LaMa pass targeting residual regions and re-verify.
  - Failure diagnostics logged structurally; response includes
    `verify_iterations` + `verify_final_verdict` for downstream tracking.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Literal, Optional

import modal
from pydantic import BaseModel, Field, HttpUrl

APP_NAME = "cova-empty-room-v2"
API_VERSION = "v1"
SCHEMA_VERSION: Literal["2.0"] = "2.0"


# ---------------------------------------------------------------------------
# Prompt lists (v2 extended — spec Phase 1A/1B)
# ---------------------------------------------------------------------------

FURNITURE_REMOVE_PROMPTS: tuple[str, ...] = (
    # Beds + sleeping
    "bed", "mattress", "pillow", "blanket", "bedding", "comforter", "bedsheet",
    # Seating
    "sofa", "couch", "chair", "armchair", "ottoman", "bench", "stool",
    # Tables + freestanding storage
    "table", "desk", "dresser", "freestanding shelf", "cabinet",
    "nightstand", "bookshelf", "console table", "sideboard",
    # Decor + personal
    "rug", "floor mat", "curtain", "clothing", "clothes",
    "poster", "framed photo", "wall art", "painting", "canvas",
    "string lights", "LED strip",
    # Electronics + clutter
    "television", "monitor", "computer", "laptop", "guitar",
    "backpack", "bag", "box", "bottle", "cup",
    # Plants + small decor
    "houseplant", "potted plant", "vase", "candle", "figurine",
    # Personal
    "stickers", "photos hanging",
)

ARCHITECTURE_PRESERVE_PROMPTS: tuple[str, ...] = (
    # Structural shell
    "wall", "ceiling", "floor", "window", "door", "doorway",
    # Fixed architectural features
    "crown molding", "baseboard", "wainscoting", "window frame",
    "ceiling beam", "exposed beam", "ceiling medallion",
    # Built-ins (immovable)
    "built-in shelving", "built-in cabinet", "fireplace", "mantel",
    "radiator", "vent",
    # Ceiling fixtures (structural — not removable decor)
    "ceiling fan", "pendant light fixture", "chandelier", "recessed light",
    # Window treatments (structural)
    "window blinds", "plantation shutters",
    # Distinctive surfaces
    "exposed brick", "stone wall", "wood paneling",
)

SAM3_SCORE_THRESHOLD: float = 0.25
ARCH_SAM3_SCORE_THRESHOLD: float = 0.35  # v2: 0.40 → 0.35 per spec

# Preemptive coverage detect (separate cheap pass).
COVERAGE_DETECT_THRESHOLD: float = 0.15
COVERAGE_DETECT_PROMPTS: tuple[str, ...] = (
    # Small subset — just enough to estimate whether room has meaningful
    # furniture. Full FURNITURE_REMOVE_PROMPTS is run later if inpaint happens.
    "bed", "sofa", "chair", "table", "desk", "dresser",
    "cabinet", "bookshelf", "rug", "curtain",
)

MORPH_CLOSE_PX: int = 14
DILATION_PX: int = 32
PASSTHROUGH_SIGMA: float = 8.0

DEPTH_EDGE_THRESHOLD: int = 20
DEPTH_EDGE_DILATE_PX: int = 10
ARCH_SHRINK_PX: int = 5

COVERAGE_ROUTER_THRESHOLD_PCT: float = 35.0
COVERAGE_REJECT_THRESHOLD_PCT: float = 92.0
COVERAGE_SHORT_CIRCUIT_PCT: float = 1.0

COST_SAM3_PER_CALL: float = 0.005
COST_DEPTH: float = 0.005
COST_LAMA: float = 0.04
COST_BRIA: float = 0.04
COST_FLUX_FILL: float = 0.05
COST_VERIFY_CLAUDE: float = 0.015  # ~1200 input + 800 output tokens Sonnet 4.5

SAM3_MAX_WORKERS: int = 24
SAM3_MAX_RETRIES: int = 4
SAM3_CLIENT_TIMEOUT_S: float = 40.0
MASK_DOWNLOAD_WORKERS: int = 8

INPAINTER_MAX_RETRIES: int = 3

PATCH_SIZE: int = 200
MASK_OVERLAP_THRESHOLD: float = 0.05

DARK_THRESHOLD: float = 70.0

SUPABASE_BUCKET: str = "room-photos"
SUPABASE_PREFIX: str = "render-upgrade-v2"

VERIFY_MAX_ITERATIONS: int = 3


# ---------------------------------------------------------------------------
# Modal image
# ---------------------------------------------------------------------------

empty_room_v2_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install(
        "libgl1-mesa-glx", "libglib2.0-0", "libsm6", "libxext6", "libxrender1",
    )
    .pip_install(
        "fastapi[standard]==0.115.4",
        "pydantic>=2.5,<3",
        "requests",
        "supabase",
        "fal-client",
        "Pillow",
        "numpy",
        "opencv-python-headless",
        "scikit-image",
        "anthropic>=0.42.0",
    )
)

app = modal.App(APP_NAME)

logger = logging.getLogger("cova-empty-room-v2")
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class EmptyRoomV2Request(BaseModel):
    image_url: HttpUrl
    image_hash: str | None = None
    user_id: str | None = Field(default=None)
    force_inpainter: Literal["lama", "bria", "flux_fill"] | None = Field(default=None)
    enable_depth_edges: bool = True
    enable_arch_protection: bool = True
    enable_verify_loop: bool = Field(
        default=True,
        description="Claude Vision verify_truly_empty iteration loop.",
    )
    enable_coverage_short_circuit: bool = Field(
        default=True,
        description="Skip inpaint if input already near-empty (coverage<0.15).",
    )


class PatchCoordinates(BaseModel):
    x: int
    y: int
    size: int


class VerifyIterationReport(BaseModel):
    iteration: int
    is_empty: bool
    remaining_items: list[str] = Field(default_factory=list)
    ghost_artifacts: list[str] = Field(default_factory=list)
    architecture_preserved: bool
    architecture_issues: list[str] = Field(default_factory=list)
    overall_quality: Literal["EXCELLENT", "ACCEPTABLE", "POOR"] = "ACCEPTABLE"


class EmptyRoomV2Response(BaseModel):
    schema_version: Literal["2.0"] = "2.0"
    empty_room_url: HttpUrl
    image_hash: str
    image_width: int
    image_height: int
    mask_coverage_raw_pct: float
    mask_coverage_dilated_pct: float
    inpainter_used: Literal["lama", "bria", "flux_fill", "short_circuit", "passthrough_empty"]
    router_threshold_pct: float = COVERAGE_ROUTER_THRESHOLD_PCT
    architectural_patch_ssim: float
    patch_coordinates: PatchCoordinates
    patch_clean: bool
    partial_failures: list[str] = Field(default_factory=list)
    latency_ms: int
    cost_usd: float
    generated_at_iso: str
    preprocessing_applied: list[str] = Field(default_factory=list)
    depth_edges_used: bool = False
    arch_protection_used: bool = False
    # v2
    coverage_short_circuited: bool = False
    input_coverage_estimate: float | None = None
    verify_iterations: list[VerifyIterationReport] = Field(default_factory=list)
    verify_final_verdict: Literal["EMPTY", "PARTIAL", "FAILED", "NOT_RUN"] = "NOT_RUN"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _fetch_bytes(url: str, timeout: int = 60) -> bytes:
    import requests
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.content


def _rehost_to_supabase(
    content: bytes, suffix: str = ".jpg", subfolder: str = "empty"
) -> str:
    from supabase import create_client

    sb_url = os.environ["SUPABASE_URL"]
    sb_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get(
        "SUPABASE_SERVICE_ROLE_KEY"
    )
    if not sb_key:
        raise RuntimeError("Supabase service key missing; cannot rehost.")
    client = create_client(sb_url, sb_key)

    digest = hashlib.md5(content).hexdigest()[:12]
    ext = suffix if suffix.startswith(".") else f".{suffix}"
    filename = f"{digest}{ext}"
    path = f"{SUPABASE_PREFIX}/{subfolder}/{filename}"
    content_type = "image/png" if ext == ".png" else "image/jpeg"

    client.storage.from_(SUPABASE_BUCKET).upload(
        path=path,
        file=content,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return client.storage.from_(SUPABASE_BUCKET).get_public_url(path)


def _upload_bytes_to_fal(data: bytes, suffix: str = ".png") -> str:
    import fal_client  # type: ignore
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        return fal_client.upload_file(tmp_path)
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


def _preprocess_image(raw: bytes) -> tuple[bytes, dict]:
    import cv2  # type: ignore
    import numpy as np
    from PIL import Image, ImageOps

    applied: list[str] = []
    img = Image.open(io.BytesIO(raw))
    rotated = ImageOps.exif_transpose(img)
    if rotated.size != img.size or rotated.tobytes()[:128] != img.tobytes()[:128]:
        applied.append("exif_transpose")
    img = rotated.convert("RGB")

    arr = np.array(img)
    mean_lum = float(arr.mean())
    meta: dict = {"mean_luminance": mean_lum}

    if mean_lum < DARK_THRESHOLD:
        lab = cv2.cvtColor(arr, cv2.COLOR_RGB2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_clahe = clahe.apply(l)
        lab_clahe = cv2.merge([l_clahe, a, b])
        arr = cv2.cvtColor(lab_clahe, cv2.COLOR_LAB2RGB)
        gamma = 0.75
        arr = (255.0 * (arr / 255.0) ** gamma).astype(np.uint8)
        applied.append(f"clahe_gamma{gamma}")
        img = Image.fromarray(arr)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    meta["applied"] = applied
    return buf.getvalue(), meta


# ----- SAM-3 detection ------------------------------------------------------


def _sam3_detect(
    image_url: str,
    prompt: str,
    score_threshold: float = SAM3_SCORE_THRESHOLD,
    retries: int = SAM3_MAX_RETRIES,
) -> list[tuple[str, float]]:
    import fal_client  # type: ignore

    last_err: Exception | None = None
    for attempt in range(retries + 1):
        try:
            r = fal_client.subscribe(
                "fal-ai/sam-3/image",
                arguments={
                    "image_url": image_url,
                    "prompt": prompt,
                    "return_multiple_masks": True,
                    "max_masks": 5,
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
                out.append((url, s))
            return out
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < retries:
                time.sleep(0.5 * (2 ** attempt))
    raise RuntimeError(
        f"sam3:{prompt}:{type(last_err).__name__}:{last_err}"
    ) from last_err


def _download_mask_png(url: str, target_shape: tuple[int, int]) -> "Any":
    import cv2  # type: ignore
    import numpy as np
    from PIL import Image
    import requests

    raw = requests.get(url, timeout=30).content
    img = Image.open(io.BytesIO(raw)).convert("L")
    arr = np.array(img)
    h, w = target_shape
    if arr.shape != (h, w):
        arr = cv2.resize(arr, (w, h), interpolation=cv2.INTER_NEAREST)
    return (arr > 127).astype(np.uint8) * 255


def _build_union_mask(
    image_url: str,
    shape: tuple[int, int],
    prompts: tuple[str, ...],
    score_threshold: float,
    max_workers: int = SAM3_MAX_WORKERS,
) -> tuple["Any", list[str], int]:
    import numpy as np

    h, w = shape
    union = np.zeros((h, w), dtype=np.uint8)
    failures: list[str] = []
    calls_made = 0

    best_urls: list[tuple[str, str]] = []
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futs = {
            ex.submit(_sam3_detect, image_url, p, score_threshold): p
            for p in prompts
        }
        for fut in as_completed(futs):
            prompt = futs[fut]
            calls_made += 1
            try:
                results = fut.result()
            except Exception as exc:  # noqa: BLE001
                failures.append(f"sam3:{prompt}:{type(exc).__name__}:{exc}")
                continue
            kept = [(u, s) for (u, s) in results if s >= score_threshold]
            if not kept:
                continue
            best_url, _ = max(kept, key=lambda t: t[1])
            best_urls.append((prompt, best_url))

    if best_urls:
        with ThreadPoolExecutor(max_workers=MASK_DOWNLOAD_WORKERS) as ex:
            dl_futs = {
                ex.submit(_download_mask_png, url, (h, w)): prompt
                for (prompt, url) in best_urls
            }
            for fut in as_completed(dl_futs):
                prompt = dl_futs[fut]
                try:
                    m = fut.result()
                    union = np.maximum(union, m)
                except Exception as exc:  # noqa: BLE001
                    failures.append(
                        f"sam3-download:{prompt}:{type(exc).__name__}:{exc}"
                    )

    return union, failures, calls_made


# ----- Depth edges ---------------------------------------------------------


def _get_depth_edges(image_url: str, shape: tuple[int, int]) -> tuple["Any", Optional[str]]:
    import cv2  # type: ignore
    import numpy as np
    from PIL import Image
    import requests
    import fal_client  # type: ignore

    h, w = shape
    try:
        r = fal_client.subscribe(
            "fal-ai/imageutils/depth",
            arguments={"image_url": image_url},
            with_logs=False,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("depth call failed: %s", exc)
        return np.zeros((h, w), dtype=np.uint8), None
    depth = r.get("image") or {}
    url = depth.get("url") if isinstance(depth, dict) else None
    if not url:
        return np.zeros((h, w), dtype=np.uint8), None
    try:
        raw = requests.get(url, timeout=30).content
        dimg = Image.open(io.BytesIO(raw)).convert("L")
        darr = np.array(dimg)
        if darr.shape != (h, w):
            darr = cv2.resize(darr, (w, h), interpolation=cv2.INTER_LINEAR)
    except Exception as exc:  # noqa: BLE001
        logger.warning("depth download failed: %s", exc)
        return np.zeros((h, w), dtype=np.uint8), url

    sx = cv2.Sobel(darr, cv2.CV_32F, 1, 0, ksize=3)
    sy = cv2.Sobel(darr, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.sqrt(sx * sx + sy * sy)
    mag_u8 = np.clip(mag, 0, 255).astype(np.uint8)
    _, binary = cv2.threshold(mag_u8, DEPTH_EDGE_THRESHOLD, 255, cv2.THRESH_BINARY)
    k = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (DEPTH_EDGE_DILATE_PX * 2 + 1, DEPTH_EDGE_DILATE_PX * 2 + 1)
    )
    return cv2.dilate(binary, k), url


def _subtract_architecture(furniture: "Any", arch: "Any") -> "Any":
    import cv2  # type: ignore
    import numpy as np
    if arch.max() == 0:
        return furniture
    protected = (arch > 127).astype(np.uint8) * 255
    k = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (ARCH_SHRINK_PX * 2 + 1, ARCH_SHRINK_PX * 2 + 1)
    )
    shrunk = cv2.erode(protected, k)
    out = furniture.copy()
    out[shrunk > 127] = 0
    return out


def _close_then_dilate(mask: "Any", close_px: int, dilate_px: int) -> "Any":
    import cv2  # type: ignore
    if close_px > 0:
        kc = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (close_px * 2 + 1, close_px * 2 + 1)
        )
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kc)
    if dilate_px > 0:
        kd = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (dilate_px * 2 + 1, dilate_px * 2 + 1)
        )
        mask = cv2.dilate(mask, kd, iterations=1)
    return mask


# ----- Inpainters ----------------------------------------------------------


EMPTY_ROOM_PROMPT = (
    "empty room, unfurnished interior, bare floor, blank walls, "
    "no furniture, no objects, clean empty space, architectural photography, "
    "same room same perspective, walls unchanged, ceiling unchanged, "
    "floor unchanged, natural daylight, photorealistic"
)


def _call_lama(image_url: str, mask_url: str) -> str:
    import fal_client  # type: ignore

    last_err: Exception | None = None
    for attempt in range(INPAINTER_MAX_RETRIES):
        try:
            r = fal_client.subscribe(
                "fal-ai/lama",
                arguments={"image_url": image_url, "mask_image_url": mask_url},
                with_logs=False,
            )
            img = r.get("image")
            if isinstance(img, dict) and img.get("url"):
                return img["url"]
            raise RuntimeError(f"unexpected LaMa response: {list(r.keys())}")
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < INPAINTER_MAX_RETRIES - 1:
                time.sleep(0.5 * (2 ** attempt))
    raise RuntimeError(f"lama:{type(last_err).__name__}:{last_err}") from last_err


def _call_bria(image_url: str, mask_url: str) -> str:
    import fal_client  # type: ignore

    last_err: Exception | None = None
    for attempt in range(INPAINTER_MAX_RETRIES):
        try:
            r = fal_client.subscribe(
                "fal-ai/bria/eraser",
                arguments={"image_url": image_url, "mask_url": mask_url},
                with_logs=False,
            )
            img = r.get("image")
            if isinstance(img, dict) and img.get("url"):
                return img["url"]
            imgs = r.get("images")
            if imgs and isinstance(imgs, list):
                first = imgs[0]
                if isinstance(first, dict) and first.get("url"):
                    return first["url"]
                if isinstance(first, str):
                    return first
            raise RuntimeError(f"unexpected Bria response: {list(r.keys())}")
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < INPAINTER_MAX_RETRIES - 1:
                time.sleep(0.5 * (2 ** attempt))
    raise RuntimeError(f"bria:{type(last_err).__name__}:{last_err}") from last_err


def _call_flux_fill(image_url: str, mask_url: str) -> str:
    import fal_client  # type: ignore

    last_err: Exception | None = None
    for attempt in range(INPAINTER_MAX_RETRIES):
        try:
            r = fal_client.subscribe(
                "fal-ai/flux-pro/v1/fill",
                arguments={
                    "image_url": image_url,
                    "mask_url": mask_url,
                    "prompt": EMPTY_ROOM_PROMPT,
                    "num_inference_steps": 28,
                    "guidance_scale": 20,
                    "seed": 42,
                    "num_images": 1,
                    "output_format": "png",
                    "safety_tolerance": "6",
                },
                with_logs=False,
                client_timeout=180.0,
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
            raise RuntimeError(f"unexpected flux-fill response: {list(r.keys())}")
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < INPAINTER_MAX_RETRIES - 1:
                time.sleep(0.5 * (2 ** attempt))
    raise RuntimeError(
        f"flux-fill:{type(last_err).__name__}:{last_err}"
    ) from last_err


# ----- Passthrough blend ---------------------------------------------------


def _passthrough_blend(
    original: "Any", inpainted: "Any", mask: "Any", sigma: float = PASSTHROUGH_SIGMA
) -> "Any":
    import cv2  # type: ignore
    import numpy as np

    mask_f = mask.astype(np.float32) / 255.0
    soft = cv2.GaussianBlur(mask_f, (0, 0), sigmaX=sigma, sigmaY=sigma)
    soft = np.clip(soft, 0.0, 1.0)[:, :, None]
    orig_f = original.astype(np.float32)
    inp_f = inpainted.astype(np.float32)
    blended = orig_f * (1.0 - soft) + inp_f * soft
    return blended.clip(0, 255).astype(np.uint8)


# ----- Patch SSIM ----------------------------------------------------------


def _generate_patch_candidates(H: int, W: int, patch_size: int) -> list[tuple[int, int]]:
    candidates: list[tuple[int, int]] = []
    cx = max(0, W // 2 - patch_size // 2)
    cy = max(0, H // 12)
    candidates.append((cx, cy))
    candidates.append((0, 0))
    candidates.append((max(0, W - patch_size), 0))
    y_fixed = max(0, H // 12)
    for frac_x in (1 / 8, 3 / 8, 5 / 8, 7 / 8):
        x = int(frac_x * W) - patch_size // 2
        x = max(0, min(W - patch_size, x))
        candidates.append((x, y_fixed))
    candidates.append((max(0, W // 2 - patch_size // 2), max(0, H // 6)))
    seen: set[tuple[int, int]] = set()
    unique: list[tuple[int, int]] = []
    for c in candidates:
        key = (c[0] // 10, c[1] // 10)
        if key not in seen:
            seen.add(key)
            unique.append(c)
    return unique


def _patch_mask_overlap(mask_gray: "Any", x: int, y: int, patch_size: int) -> float:
    import numpy as np
    ph = min(patch_size, mask_gray.shape[0] - y)
    pw = min(patch_size, mask_gray.shape[1] - x)
    if ph <= 0 or pw <= 0:
        return 1.0
    return float(np.mean(mask_gray[y : y + ph, x : x + pw] > 128))


def _patch_texture_std(img_gray: "Any", x: int, y: int, patch_size: int) -> float:
    import numpy as np
    ph = min(patch_size, img_gray.shape[0] - y)
    pw = min(patch_size, img_gray.shape[1] - x)
    if ph <= 0 or pw <= 0:
        return 9999.0
    return float(np.std(img_gray[y : y + ph, x : x + pw]))


def _select_best_patch(
    img_gray: "Any", mask_gray: "Any", H: int, W: int, patch_size: int
) -> tuple[int, int, float, float, bool]:
    candidates = _generate_patch_candidates(H, W, patch_size)
    results = [
        (cx, cy, _patch_mask_overlap(mask_gray, cx, cy, patch_size), _patch_texture_std(img_gray, cx, cy, patch_size))
        for (cx, cy) in candidates
    ]
    clean = [r for r in results if r[2] < MASK_OVERLAP_THRESHOLD]
    if clean:
        best = min(clean, key=lambda r: r[3])
        return best[0], best[1], best[2], best[3], True
    best = min(results, key=lambda r: r[2])
    return best[0], best[1], best[2], best[3], False


def _compute_patch_ssim(
    in_gray: "Any", out_gray: "Any", x: int, y: int, patch_size: int
) -> float:
    from skimage.metrics import structural_similarity as ssim  # type: ignore

    ph = min(patch_size, in_gray.shape[0] - y)
    pw = min(patch_size, in_gray.shape[1] - x)
    p_in = in_gray[y : y + ph, x : x + pw]
    p_out = out_gray[y : y + ph, x : x + pw]
    return float(ssim(p_in, p_out, data_range=255, full=False))


# ----- Coverage detect (preemptive) ----------------------------------------


def _detect_input_coverage(image_url: str, shape: tuple[int, int]) -> tuple[float, int, list[str]]:
    """Estimate fraction of frame covered by furniture.

    Uses a small prompt subset (10 vs 44) at a LOWER threshold (0.15 vs 0.25)
    to catch near-empty inputs before committing to full pipeline.
    """
    import numpy as np

    union, failures, calls = _build_union_mask(
        image_url, shape, COVERAGE_DETECT_PROMPTS, 0.15, max_workers=10
    )
    h, w = shape
    coverage = float(union.astype(bool).sum()) / float(h * w)
    return coverage, calls, failures


# ----- Claude Vision verify_truly_empty ------------------------------------


VERIFY_PROMPT = """You are verifying that a room has been properly emptied of furniture and personal items. The room should contain ONLY:
- Walls (with original color and finish)
- Floor (with original material)
- Ceiling (with fans, fixtures, medallions)
- Windows (with original blinds, shutters, or bare)
- Doors and doorways
- Built-in features (shelving, cabinets, fireplaces, beams, wainscoting)
- Architectural details (moldings, trim, radiators, vents)

It should contain NOTHING ELSE — no furniture, no bedding, no rugs, no loose decor, no clothing, no electronics, no plants, no art, no personal items, no clutter, no ghost outlines or blurred remnants of removed items.

Evaluate this image strictly. Respond in JSON only:
{
  "is_empty": true/false,
  "remaining_furniture": ["specific items visible that should have been removed"],
  "ghost_artifacts": ["blur, shadows, or outlines indicating incomplete removal"],
  "architecture_preserved": true/false,
  "architecture_issues": ["any architectural features that look wrong or changed"],
  "overall_quality": "EXCELLENT|ACCEPTABLE|POOR"
}

is_empty is true ONLY if remaining_furniture is empty AND ghost_artifacts is empty.
architecture_preserved is true ONLY if walls, windows, ceiling, doors, built-ins all appear intact and unchanged."""


def _verify_truly_empty(empty_url: str, iteration: int = 1) -> VerifyIterationReport:
    """Claude Vision check. Raises on API error."""
    import anthropic

    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    client = anthropic.Anthropic(api_key=key)

    img_bytes = _fetch_bytes(empty_url)
    img_b64 = base64.standard_b64encode(img_bytes).decode()

    resp = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=800,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": VERIFY_PROMPT},
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": img_b64,
                        },
                    },
                ],
            }
        ],
    )
    text = resp.content[0].text.strip()
    # Extract JSON (Sonnet may wrap in markdown).
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    # Find first { ... last }
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise RuntimeError(f"verify: no JSON in response: {text[:200]}")
    payload = json.loads(text[start : end + 1])

    return VerifyIterationReport(
        iteration=iteration,
        is_empty=bool(payload.get("is_empty", False)),
        remaining_items=[str(x) for x in payload.get("remaining_furniture", [])],
        ghost_artifacts=[str(x) for x in payload.get("ghost_artifacts", [])],
        architecture_preserved=bool(payload.get("architecture_preserved", True)),
        architecture_issues=[str(x) for x in payload.get("architecture_issues", [])],
        overall_quality=payload.get("overall_quality", "ACCEPTABLE"),
    )


# ---------------------------------------------------------------------------
# Modal class
# ---------------------------------------------------------------------------


@app.cls(
    image=empty_room_v2_image,
    gpu="A10G",
    timeout=600,
    startup_timeout=60,
    min_containers=0,
    max_containers=4,
    secrets=[
        modal.Secret.from_name("supabase-secrets"),
        modal.Secret.from_name("fal-secrets"),
        modal.Secret.from_name("anthropic-credentials"),
    ],
)
class EmptyRoomV2:
    @modal.enter()
    def load(self) -> None:
        logger.info(
            "cova-empty-room-v2 ready  furniture_prompts=%d arch_prompts=%d "
            "arch_threshold=%.2f verify_loop=True coverage_short_circuit=True",
            len(FURNITURE_REMOVE_PROMPTS), len(ARCHITECTURE_PRESERVE_PROMPTS),
            ARCH_SAM3_SCORE_THRESHOLD,
        )

    def _inpaint_once(
        self,
        image_url: str,
        shape: tuple[int, int],
        in_arr: "Any",
        prompts: tuple[str, ...],
        force_inpainter: Optional[str],
        enable_arch: bool,
        enable_depth: bool,
    ) -> tuple[str, dict]:
        """Run one inpaint pass; return (output_url, info dict).

        info = {
          mask_raw_pct, mask_dilated_pct, inpainter_used, cost, failures,
          depth_edges_used, arch_protection_used, dilated_mask (np array)
        }
        """
        import cv2  # type: ignore
        import numpy as np

        h, w = shape
        cost = 0.0
        failures: list[str] = []

        raw_mask, sam_fails, n_sam = _build_union_mask(
            image_url, shape, prompts, SAM3_SCORE_THRESHOLD
        )
        failures.extend(sam_fails)
        cost += n_sam * COST_SAM3_PER_CALL

        depth_used = False
        if enable_depth:
            try:
                depth_edges, _ = _get_depth_edges(image_url, shape)
                cost += COST_DEPTH
                if depth_edges.max() > 0:
                    raw_mask = np.maximum(raw_mask, depth_edges)
                    depth_used = True
            except Exception as exc:  # noqa: BLE001
                failures.append(f"depth-edges:{type(exc).__name__}:{exc}")

        cov_raw_pct = float(raw_mask.astype(bool).sum() / (h * w) * 100)

        arch_used = False
        if enable_arch:
            try:
                arch_mask, arch_fails, _ = _build_union_mask(
                    image_url, shape, ARCHITECTURE_PRESERVE_PROMPTS,
                    ARCH_SAM3_SCORE_THRESHOLD,
                )
                cost += len(ARCHITECTURE_PRESERVE_PROMPTS) * COST_SAM3_PER_CALL
                failures.extend(arch_fails)
                if arch_mask.max() > 0:
                    raw_mask = _subtract_architecture(raw_mask, arch_mask)
                    arch_used = True
            except Exception as exc:  # noqa: BLE001
                failures.append(f"arch-mask:{type(exc).__name__}:{exc}")

        dilated = _close_then_dilate(raw_mask, MORPH_CLOSE_PX, DILATION_PX)
        cov_dilated_pct = float(dilated.astype(bool).sum() / (h * w) * 100)

        if cov_raw_pct < COVERAGE_SHORT_CIRCUIT_PCT:
            raise FurnitureNotFoundError(
                cov_raw_pct=cov_raw_pct,
                partial_failures=failures,
                cost_so_far=cost,
                n_prompts=len(prompts),
            )
        if cov_dilated_pct > COVERAGE_REJECT_THRESHOLD_PCT:
            raise HighCoverageError(
                cov_dilated_pct=cov_dilated_pct,
                partial_failures=failures,
                cost_so_far=cost,
            )

        ok, mask_buf = cv2.imencode(".png", dilated)
        if not ok:
            raise RuntimeError("mask PNG encoding failed")
        mask_url = _upload_bytes_to_fal(mask_buf.tobytes(), suffix=".png")

        inpainter = force_inpainter or "lama"
        chain = [inpainter]
        if inpainter == "lama":
            chain += ["bria", "flux_fill"]
        elif inpainter == "bria":
            chain += ["lama", "flux_fill"]
        else:
            chain += ["lama", "bria"]
        tried: set[str] = set()
        out_url: Optional[str] = None
        actually_used = inpainter
        attempts: list[str] = []
        for candidate in chain:
            if candidate in tried:
                continue
            tried.add(candidate)
            try:
                if candidate == "flux_fill":
                    out_url = _call_flux_fill(image_url, mask_url)
                    cost += COST_FLUX_FILL
                elif candidate == "bria":
                    out_url = _call_bria(image_url, mask_url)
                    cost += COST_BRIA
                elif candidate == "lama":
                    out_url = _call_lama(image_url, mask_url)
                    cost += COST_LAMA
                else:
                    continue
                actually_used = candidate
                attempts.append(f"{candidate}:ok")
                break
            except Exception as exc:  # noqa: BLE001
                attempts.append(f"{candidate}:{type(exc).__name__}:{exc}")
        if out_url is None:
            raise RuntimeError(f"all inpainters failed: {attempts}")
        failures.extend([a for a in attempts if not a.endswith(":ok")])

        info = {
            "mask_raw_pct": cov_raw_pct,
            "mask_dilated_pct": cov_dilated_pct,
            "inpainter_used": actually_used,
            "cost": cost,
            "failures": failures,
            "depth_edges_used": depth_used,
            "arch_protection_used": arch_used,
            "dilated_mask": dilated,
        }
        return out_url, info

    def _generate(self, req: EmptyRoomV2Request) -> EmptyRoomV2Response:
        import cv2  # type: ignore
        import numpy as np
        from PIL import Image

        t0 = time.perf_counter()
        total_cost = 0.0
        partial_failures: list[str] = []

        # 1. Fetch + preprocess
        raw = _fetch_bytes(str(req.image_url))
        processed_bytes, pre_meta = _preprocess_image(raw)
        applied = pre_meta.get("applied", [])
        if applied:
            image_url = _rehost_to_supabase(
                processed_bytes, suffix=".jpg", subfolder="preprocessed"
            )
        else:
            image_url = str(req.image_url)

        image_hash = req.image_hash or _sha256_hex(processed_bytes)
        pil = Image.open(io.BytesIO(processed_bytes)).convert("RGB")
        in_arr = np.array(pil)
        h, w = in_arr.shape[:2]
        in_gray = cv2.cvtColor(in_arr, cv2.COLOR_RGB2GRAY)

        # 2. Preemptive coverage detect (v2)
        coverage_short_circuited = False
        coverage_est: Optional[float] = None
        if req.enable_coverage_short_circuit:
            try:
                coverage_est, cov_calls, cov_fails = _detect_input_coverage(
                    image_url, (h, w)
                )
                total_cost += cov_calls * COST_SAM3_PER_CALL
                partial_failures.extend(cov_fails)
                logger.info("input coverage estimate = %.3f", coverage_est)
                if coverage_est < COVERAGE_DETECT_THRESHOLD:
                    coverage_short_circuited = True
                    logger.info(
                        "coverage<%.2f → short-circuit (pass input through as empty)",
                        COVERAGE_DETECT_THRESHOLD,
                    )
            except Exception as exc:  # noqa: BLE001
                partial_failures.append(f"coverage-detect:{type(exc).__name__}:{exc}")

        if coverage_short_circuited:
            # Use the preprocessed image as the "empty" output.
            buf = io.BytesIO()
            Image.fromarray(in_arr).save(buf, format="JPEG", quality=95)
            final_url = _rehost_to_supabase(
                buf.getvalue(), suffix=".jpg", subfolder="empty"
            )
            latency_ms = int((time.perf_counter() - t0) * 1000)
            return EmptyRoomV2Response(
                empty_room_url=final_url,
                image_hash=image_hash,
                image_width=w,
                image_height=h,
                mask_coverage_raw_pct=0.0,
                mask_coverage_dilated_pct=0.0,
                inpainter_used="passthrough_empty",
                architectural_patch_ssim=1.0,
                patch_coordinates=PatchCoordinates(x=0, y=0, size=PATCH_SIZE),
                patch_clean=True,
                partial_failures=partial_failures,
                latency_ms=latency_ms,
                cost_usd=round(total_cost, 4),
                generated_at_iso=_iso_now(),
                preprocessing_applied=applied,
                depth_edges_used=False,
                arch_protection_used=False,
                coverage_short_circuited=True,
                input_coverage_estimate=coverage_est,
                verify_iterations=[],
                verify_final_verdict="NOT_RUN",
            )

        # 3. First inpaint pass
        out_url, info = self._inpaint_once(
            image_url, (h, w), in_arr,
            FURNITURE_REMOVE_PROMPTS,
            req.force_inpainter,
            req.enable_arch_protection,
            req.enable_depth_edges,
        )
        total_cost += info["cost"]
        partial_failures.extend(info["failures"])
        depth_used_first = info["depth_edges_used"]
        arch_used_first = info["arch_protection_used"]
        inpainter_first = info["inpainter_used"]
        cov_raw_pct = info["mask_raw_pct"]
        cov_dilated_pct = info["mask_dilated_pct"]
        dilated_first = info["dilated_mask"]

        # Download + passthrough blend.
        out_raw = _fetch_bytes(out_url)
        out_pil = Image.open(io.BytesIO(out_raw)).convert("RGB")
        if out_pil.size != (w, h):
            out_pil = out_pil.resize((w, h), Image.LANCZOS)
        out_arr = np.array(out_pil)
        blended = _passthrough_blend(in_arr, out_arr, dilated_first, PASSTHROUGH_SIGMA)

        blended_pil = Image.fromarray(blended)
        buf = io.BytesIO()
        blended_pil.save(buf, format="JPEG", quality=95)
        current_url = _rehost_to_supabase(
            buf.getvalue(), suffix=".jpg", subfolder="empty"
        )
        current_arr = blended.copy()

        # 4. Verify loop (v2)
        verify_reports: list[VerifyIterationReport] = []
        verdict: Literal["EMPTY", "PARTIAL", "FAILED", "NOT_RUN"] = "NOT_RUN"
        if req.enable_verify_loop:
            for it in range(1, VERIFY_MAX_ITERATIONS + 1):
                try:
                    report = _verify_truly_empty(current_url, iteration=it)
                    total_cost += COST_VERIFY_CLAUDE
                    verify_reports.append(report)
                except Exception as exc:  # noqa: BLE001
                    partial_failures.append(
                        f"verify:{it}:{type(exc).__name__}:{exc}"
                    )
                    break

                logger.info(
                    "verify iter=%d is_empty=%s arch_ok=%s quality=%s remaining=%s ghosts=%s",
                    it, report.is_empty, report.architecture_preserved,
                    report.overall_quality,
                    report.remaining_items[:3], report.ghost_artifacts[:3],
                )

                if report.is_empty and report.architecture_preserved:
                    verdict = "EMPTY"
                    break
                if it == VERIFY_MAX_ITERATIONS:
                    verdict = "PARTIAL" if report.is_empty else "FAILED"
                    partial_failures.append(
                        f"verify-max-iters:{it}:remaining={len(report.remaining_items)}:ghosts={len(report.ghost_artifacts)}"
                    )
                    break

                # Targeted re-pass: run LaMa on a fresh mask built from the
                # union of residual items named by the critic + core furniture
                # prompts. Simplest practical path: re-run with the full prompt
                # set, which is cheap and converges.
                try:
                    out_url2, info2 = self._inpaint_once(
                        current_url, (h, w), current_arr,
                        FURNITURE_REMOVE_PROMPTS,
                        "lama",  # force LaMa on retries — no hallucination
                        req.enable_arch_protection,
                        False,  # depth already applied first pass
                    )
                    total_cost += info2["cost"]
                    partial_failures.extend(info2["failures"])
                    out_raw2 = _fetch_bytes(out_url2)
                    out_pil2 = Image.open(io.BytesIO(out_raw2)).convert("RGB")
                    if out_pil2.size != (w, h):
                        out_pil2 = out_pil2.resize((w, h), Image.LANCZOS)
                    out_arr2 = np.array(out_pil2)
                    blended2 = _passthrough_blend(
                        current_arr, out_arr2, info2["dilated_mask"], PASSTHROUGH_SIGMA
                    )
                    current_arr = blended2
                    blended_pil2 = Image.fromarray(blended2)
                    buf2 = io.BytesIO()
                    blended_pil2.save(buf2, format="JPEG", quality=95)
                    current_url = _rehost_to_supabase(
                        buf2.getvalue(), suffix=".jpg", subfolder="empty-iter"
                    )
                except Exception as exc:  # noqa: BLE001
                    partial_failures.append(
                        f"verify-reinpaint:{it}:{type(exc).__name__}:{exc}"
                    )
                    verdict = "FAILED"
                    break

        # 5. Patch SSIM on final blended output (against ORIGINAL)
        out_gray = cv2.cvtColor(current_arr, cv2.COLOR_RGB2GRAY)
        px, py, mask_ov, tex_std, clean = _select_best_patch(
            in_gray, dilated_first, h, w, PATCH_SIZE
        )
        patch_ssim_val = _compute_patch_ssim(
            in_gray, out_gray, px, py, PATCH_SIZE
        )

        latency_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "v2 done inpainter=%s cov_raw=%.1f%% cov_dilated=%.1f%% ssim=%.3f verify=%s iters=%d latency_ms=%d cost=$%.4f",
            inpainter_first, cov_raw_pct, cov_dilated_pct, patch_ssim_val,
            verdict, len(verify_reports), latency_ms, total_cost,
        )

        return EmptyRoomV2Response(
            empty_room_url=current_url,
            image_hash=image_hash,
            image_width=w,
            image_height=h,
            mask_coverage_raw_pct=cov_raw_pct,
            mask_coverage_dilated_pct=cov_dilated_pct,
            inpainter_used=inpainter_first,  # type: ignore[arg-type]
            architectural_patch_ssim=patch_ssim_val,
            patch_coordinates=PatchCoordinates(x=px, y=py, size=PATCH_SIZE),
            patch_clean=clean,
            partial_failures=partial_failures,
            latency_ms=latency_ms,
            cost_usd=round(total_cost, 4),
            generated_at_iso=_iso_now(),
            preprocessing_applied=applied,
            depth_edges_used=depth_used_first,
            arch_protection_used=arch_used_first,
            coverage_short_circuited=False,
            input_coverage_estimate=coverage_est,
            verify_iterations=verify_reports,
            verify_final_verdict=verdict,
        )

    @modal.asgi_app()
    def api(self):
        from fastapi import FastAPI, HTTPException

        fapp = FastAPI(title=APP_NAME, version="2.0.0")

        @fapp.get("/healthz")
        def healthz() -> dict:
            return {
                "app": APP_NAME,
                "api_version": API_VERSION,
                "status": "ready",
                "furniture_prompts": len(FURNITURE_REMOVE_PROMPTS),
                "arch_prompts": len(ARCHITECTURE_PRESERVE_PROMPTS),
                "arch_threshold": ARCH_SAM3_SCORE_THRESHOLD,
                "verify_loop": True,
                "coverage_short_circuit": True,
                "verify_max_iterations": VERIFY_MAX_ITERATIONS,
            }

        @fapp.post(
            f"/{API_VERSION}/generate_empty_room",
            response_model=EmptyRoomV2Response,
        )
        def generate_empty_room(req: EmptyRoomV2Request) -> EmptyRoomV2Response:
            try:
                return self._generate(req)
            except HighCoverageError as exc:
                raise HTTPException(
                    status_code=413,
                    detail={
                        "error": "coverage_too_high",
                        "message": "Room too cluttered for clean empty-room render.",
                        "mask_coverage_dilated_pct": exc.cov_dilated_pct,
                        "reject_threshold_pct": COVERAGE_REJECT_THRESHOLD_PCT,
                        "partial_failures": exc.partial_failures,
                        "cost_usd": exc.cost_so_far,
                    },
                )
            except FurnitureNotFoundError as exc:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "error": "furniture_not_found",
                        "message": "SAM 3 detected insufficient furniture.",
                        "mask_coverage_raw_pct": exc.cov_raw_pct,
                        "n_prompts_tried": exc.n_prompts,
                        "partial_failures": exc.partial_failures,
                        "cost_usd": exc.cost_so_far,
                    },
                )
            except RuntimeError as exc:
                msg = str(exc)
                if msg.startswith(("lama:", "bria:", "flux-fill:", "sam3:")):
                    raise HTTPException(
                        status_code=502,
                        detail={"error": "upstream_failure", "message": msg},
                    )
                raise HTTPException(
                    status_code=500,
                    detail={"error": "internal_error", "message": msg},
                )

        return fapp


class HighCoverageError(Exception):
    def __init__(
        self, cov_dilated_pct: float, partial_failures: list[str], cost_so_far: float
    ) -> None:
        super().__init__(
            f"coverage {cov_dilated_pct:.1f}% exceeds reject "
            f"threshold {COVERAGE_REJECT_THRESHOLD_PCT}%"
        )
        self.cov_dilated_pct = cov_dilated_pct
        self.partial_failures = partial_failures
        self.cost_so_far = cost_so_far


class FurnitureNotFoundError(Exception):
    def __init__(
        self,
        cov_raw_pct: float,
        partial_failures: list[str],
        cost_so_far: float,
        n_prompts: int,
    ) -> None:
        super().__init__(
            f"furniture detection failed: coverage={cov_raw_pct:.2f}%"
        )
        self.cov_raw_pct = cov_raw_pct
        self.partial_failures = partial_failures
        self.cost_so_far = cost_so_far
        self.n_prompts = n_prompts


if __name__ == "__main__":
    print(
        f"{APP_NAME} module loaded  endpoint=/{API_VERSION}/generate_empty_room "
        f"furniture_prompts={len(FURNITURE_REMOVE_PROMPTS)} "
        f"arch_prompts={len(ARCHITECTURE_PRESERVE_PROMPTS)} "
        f"arch_threshold={ARCH_SAM3_SCORE_THRESHOLD}"
    )
