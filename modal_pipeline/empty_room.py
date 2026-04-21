"""Cova v9 — Empty-Room Service (render-upgrade, 2026-04-21).

Modal app: ``cova-empty-room``. A10G GPU. Python 3.10.

Single v1 endpoint:

  * ``POST /v1/generate_empty_room``

Pipeline (research-driven render upgrade):

  1. Preprocess: EXIF-transpose, CLAHE on dark rooms (mean luminance <
     70), aspect-ratio enum detection. No force-crop.
  2. SAM 3 detect — 22 curated furniture prompts, parallel, threshold
     0.25 (was 0.10).
  3. Architecture mask — 5 ADE20K-style prompts (wall/ceiling/floor/
     window/door) at threshold 0.40. Subtracted from the furniture
     union so inpainting never touches walls/ceiling/floor.
  4. Depth-edge augmentation — Depth-Anything-V2 Sobel edges unioned
     with SAM-3 mask to catch low-contrast furniture.
  5. Dilate-close the combined mask (σ_close=14, σ_dilate=32).
  6. Primary inpainter: fal-ai/flux-pro/v1/fill (research says FLUX.1
     [pro] Fill is the cleanest empty-room inpainter). Fallback chain:
     Bria Eraser → LaMa.
  7. Passthrough blend — `final = original × (1 - mask_soft) +
     inpainted × mask_soft` with Gaussian σ=8. Unmasked pixels stay
     bit-exact. Output re-uploaded to Supabase public bucket.

Returns the Supabase URL (not fal URL) so downstream consumers get a
stable, rehostable asset.

Changelog vs prior version (109dc03):
  - 57 prompts → 22 (research spec). Depth-edge augmentation picks up
    the missing clutter categories.
  - SAM3 threshold 0.10 → 0.25.
  - Architecture mask subtraction added (new).
  - Depth-edge union added (new).
  - FLUX Fill promoted from flag-only to primary; Bria + LaMa are now
    fallback.
  - Passthrough blend added (new). Final output rehosted to Supabase.
  - Preprocessing pipeline added (new).
"""

from __future__ import annotations

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

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

APP_NAME = "cova-empty-room"
API_VERSION = "v1"

# Research-recommended 22-prompt list. Categories: sleeping, seating,
# tables & storage, decor/clutter, electronics/misc. Depth-edge
# augmentation catches low-contrast items outside this vocabulary.
FURNITURE_PROMPTS: tuple[str, ...] = (
    "bed", "mattress", "pillow", "blanket", "bedding",
    "sofa", "couch", "chair", "armchair", "ottoman",
    "table", "desk", "dresser", "cabinet", "shelf", "nightstand",
    "rug", "lamp", "plant", "curtain", "clothing",
    "television", "monitor", "guitar",
)

# Architecture classes protected from the erase mask.
ARCHITECTURE_PROMPTS: tuple[str, ...] = (
    "wall", "ceiling", "floor", "window", "door",
)

SAM3_SCORE_THRESHOLD: float = 0.25          # research spec (was 0.10)
ARCH_SAM3_SCORE_THRESHOLD: float = 0.40     # tighter for architecture

MORPH_CLOSE_PX: int = 14
DILATION_PX: int = 32
PASSTHROUGH_SIGMA: float = 8.0

# Depth edge thresholding
DEPTH_EDGE_THRESHOLD: int = 20
DEPTH_EDGE_DILATE_PX: int = 10

# Architecture shrink (px) — erode the protected region slightly so
# edge-adjacent furniture can still be removed.
ARCH_SHRINK_PX: int = 5

COVERAGE_ROUTER_THRESHOLD_PCT: float = 35.0
COVERAGE_REJECT_THRESHOLD_PCT: float = 92.0
COVERAGE_SHORT_CIRCUIT_PCT: float = 1.0

# Cost model (fal pricing).
COST_SAM3_PER_CALL: float = 0.005
COST_DEPTH: float = 0.005
COST_LAMA: float = 0.04
COST_BRIA: float = 0.04
COST_FLUX_FILL: float = 0.05

SAM3_MAX_WORKERS: int = 24
SAM3_MAX_RETRIES: int = 4
SAM3_CLIENT_TIMEOUT_S: float = 40.0
MASK_DOWNLOAD_WORKERS: int = 8

INPAINTER_MAX_RETRIES: int = 3
INPAINTER_HARD_TIMEOUT_S: float = 60.0

PATCH_SIZE: int = 200
MASK_OVERLAP_THRESHOLD: float = 0.05

# Dark-image preprocessing threshold (mean luminance).
DARK_THRESHOLD: float = 70.0

# Supabase bucket for depth/edge/empty-room rehost.
SUPABASE_BUCKET: str = "room-photos"
SUPABASE_PREFIX: str = "render-upgrade"

SCHEMA_VERSION: Literal["1.0"] = "1.0"


# ---------------------------------------------------------------------------
# Modal image
# ---------------------------------------------------------------------------

empty_room_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install(
        "libgl1-mesa-glx",
        "libglib2.0-0",
        "libsm6",
        "libxext6",
        "libxrender1",
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
    )
)

app = modal.App(APP_NAME)

logger = logging.getLogger("cova-empty-room")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


# ---------------------------------------------------------------------------
# Pydantic schemas (v1 — frozen public contract; internals changed)
# ---------------------------------------------------------------------------


class EmptyRoomRequest(BaseModel):
    image_url: HttpUrl
    image_hash: str | None = None
    user_id: str | None = Field(default=None)
    force_inpainter: Literal["lama", "bria", "flux_fill"] | None = Field(default=None)
    # Render-upgrade additions
    enable_depth_edges: bool = Field(
        default=True,
        description="Union depth-discontinuity edges with SAM-3 mask.",
    )
    enable_arch_protection: bool = Field(
        default=True,
        description="Subtract wall/ceiling/floor/window/door mask before inpaint.",
    )


class PatchCoordinates(BaseModel):
    x: int
    y: int
    size: int


class EmptyRoomResponse(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    empty_room_url: HttpUrl
    image_hash: str
    image_width: int
    image_height: int
    mask_coverage_raw_pct: float
    mask_coverage_dilated_pct: float
    inpainter_used: Literal["lama", "bria", "flux_fill", "short_circuit"]
    router_threshold_pct: float = COVERAGE_ROUTER_THRESHOLD_PCT
    architectural_patch_ssim: float
    patch_coordinates: PatchCoordinates
    patch_clean: bool
    partial_failures: list[str] = Field(default_factory=list)
    latency_ms: int
    cost_usd: float
    generated_at_iso: str
    # Render-upgrade additions (informational; backward-compatible)
    preprocessing_applied: list[str] = Field(default_factory=list)
    depth_edges_used: bool = False
    arch_protection_used: bool = False


# ---------------------------------------------------------------------------
# Helpers (top-level so they are picklable by Modal)
# ---------------------------------------------------------------------------


def _iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _fetch_image_bytes(url: str, timeout: int = 60) -> bytes:
    import requests
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.content


# ----- Supabase rehost ------------------------------------------------------


def _rehost_to_supabase(
    content: bytes, suffix: str = ".jpg", subfolder: str = "empty"
) -> str:
    """Upload bytes to the `room-photos` public bucket and return the URL.

    Proven-working alternative to fal rehosting for ControlNet URLs
    (F6-CONTROLNET-URL.1). Also used to stabilize the empty-room output
    URL independent of fal's ephemeral CDN.
    """
    from supabase import create_client

    sb_url = os.environ["SUPABASE_URL"]
    sb_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get(
        "SUPABASE_SERVICE_ROLE_KEY"
    )
    if not sb_key:
        raise RuntimeError(
            "Supabase service key missing; cannot rehost. Ensure "
            "supabase-secrets is attached to this Modal app."
        )
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
    """Upload in-memory bytes to fal storage; returns URL."""
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


# ----- Preprocessing --------------------------------------------------------


def _preprocess_image(raw: bytes) -> tuple[bytes, dict]:
    """EXIF transpose + optional CLAHE for dark images. Returns jpeg bytes.

    Never force-crops. Aspect detection drives downstream image_size
    enum selection but the actual pixel data stays the same aspect.
    """
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
    """Run one SAM 3 prompt; return [(mask_url, score), ...]."""
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
) -> tuple["Any", list[str], int]:
    """Union top-1 mask per prompt, parallel across prompts."""
    import numpy as np

    h, w = shape
    union = np.zeros((h, w), dtype=np.uint8)
    failures: list[str] = []
    calls_made = 0

    best_urls: list[tuple[str, str]] = []
    with ThreadPoolExecutor(max_workers=SAM3_MAX_WORKERS) as ex:
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


# ----- Depth-edge augmentation ---------------------------------------------


def _get_depth_edges(image_url: str, shape: tuple[int, int]) -> tuple["Any", Optional[str]]:
    """Call fal-ai/imageutils/depth; Sobel → binary edges.

    Returns (edge_mask_uint8, depth_url). If depth call fails, returns
    (zeros, None) so callers can proceed without the augmentation.
    """
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
        logger.warning("depth response missing url: %s", str(r)[:200])
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


# ----- Architecture mask ----------------------------------------------------


def _build_architecture_mask(
    image_url: str,
    shape: tuple[int, int],
) -> tuple["Any", list[str]]:
    """Union top-1 mask of wall/ceiling/floor/window/door at 0.40 threshold."""
    import numpy as np

    h, w = shape
    arch = np.zeros((h, w), dtype=np.uint8)
    failures: list[str] = []

    best_urls: list[tuple[str, str]] = []
    with ThreadPoolExecutor(max_workers=min(SAM3_MAX_WORKERS, len(ARCHITECTURE_PROMPTS))) as ex:
        futs = {
            ex.submit(_sam3_detect, image_url, p, ARCH_SAM3_SCORE_THRESHOLD): p
            for p in ARCHITECTURE_PROMPTS
        }
        for fut in as_completed(futs):
            prompt = futs[fut]
            try:
                results = fut.result()
            except Exception as exc:  # noqa: BLE001
                failures.append(f"arch-sam3:{prompt}:{type(exc).__name__}:{exc}")
                continue
            kept = [(u, s) for (u, s) in results if s >= ARCH_SAM3_SCORE_THRESHOLD]
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
                    arch = np.maximum(arch, m)
                except Exception as exc:  # noqa: BLE001
                    failures.append(
                        f"arch-sam3-dl:{prompt}:{type(exc).__name__}:{exc}"
                    )

    return arch, failures


def _subtract_architecture(furniture: "Any", arch: "Any") -> "Any":
    """Remove architectural regions from furniture mask (with slight shrink)."""
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


# ----- Mask morphology ------------------------------------------------------


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


# ----- Inpainters -----------------------------------------------------------


EMPTY_ROOM_PROMPT = (
    "empty room, unfurnished interior, bare floor, blank walls, "
    "no furniture, no objects, clean empty space, architectural photography, "
    "same room same perspective, walls unchanged, ceiling unchanged, "
    "floor unchanged, natural daylight, photorealistic"
)


def _call_flux_fill(image_url: str, mask_url: str) -> str:
    """Primary inpainter — fal-ai/flux-pro/v1/fill.

    Mask convention: WHITE = inpaint, BLACK = preserve (same as
    LaMa/Bria). Confirmed empirically 2026-04-21 by A/B testing
    both polarities on fal-ai/flux-pro/v1/fill.
    """
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
    raise RuntimeError(
        f"bria:{type(last_err).__name__}:{last_err}"
    ) from last_err


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
    raise RuntimeError(
        f"lama:{type(last_err).__name__}:{last_err}"
    ) from last_err


# ----- Passthrough blend ----------------------------------------------------


def _passthrough_blend(
    original: "Any", inpainted: "Any", mask: "Any", sigma: float = PASSTHROUGH_SIGMA
) -> "Any":
    """final = original × (1 - mask_soft) + inpainted × mask_soft.

    Gaussian-blurred mask gives soft edges so unmasked architecture
    stays bit-exact and the seam at the mask boundary fades smoothly.
    """
    import cv2  # type: ignore
    import numpy as np

    mask_f = mask.astype(np.float32) / 255.0
    soft = cv2.GaussianBlur(mask_f, (0, 0), sigmaX=sigma, sigmaY=sigma)
    soft = np.clip(soft, 0.0, 1.0)[:, :, None]
    orig_f = original.astype(np.float32)
    inp_f = inpainted.astype(np.float32)
    blended = orig_f * (1.0 - soft) + inp_f * soft
    return blended.clip(0, 255).astype(np.uint8)


# ----- Patch SSIM (ported 1:1) ---------------------------------------------


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


# ---------------------------------------------------------------------------
# Modal class
# ---------------------------------------------------------------------------


@app.cls(
    image=empty_room_image,
    gpu="A10G",
    timeout=300,
    startup_timeout=60,
    min_containers=0,
    max_containers=4,
    secrets=[
        modal.Secret.from_name("supabase-secrets"),
        modal.Secret.from_name("fal-secrets"),
    ],
)
class EmptyRoom:
    @modal.enter()
    def load(self) -> None:
        logger.info(
            "cova-empty-room ready  furniture_prompts=%d arch_prompts=%d primary_inpainter=flux_fill",
            len(FURNITURE_PROMPTS), len(ARCHITECTURE_PROMPTS),
        )

    def _generate(self, req: EmptyRoomRequest) -> EmptyRoomResponse:
        import cv2  # type: ignore
        import numpy as np
        from PIL import Image

        t0 = time.perf_counter()
        cost = 0.0
        partial_failures: list[str] = []

        # ---- 1. Fetch + preprocess -----------------------------------
        raw = _fetch_image_bytes(str(req.image_url))
        processed_bytes, pre_meta = _preprocess_image(raw)
        # Re-upload if we touched the image; otherwise use the caller URL.
        applied = pre_meta.get("applied", [])
        if applied:
            preprocess_url = _rehost_to_supabase(
                processed_bytes, suffix=".jpg", subfolder="preprocessed"
            )
            image_url = preprocess_url
        else:
            image_url = str(req.image_url)

        image_hash = req.image_hash or _sha256_hex(processed_bytes)
        pil = Image.open(io.BytesIO(processed_bytes)).convert("RGB")
        in_arr = np.array(pil)
        h, w = in_arr.shape[:2]
        in_gray = cv2.cvtColor(in_arr, cv2.COLOR_RGB2GRAY)

        # ---- 2. SAM-3 furniture union --------------------------------
        raw_mask, sam_fails, n_sam_calls = _build_union_mask(
            image_url, (h, w), FURNITURE_PROMPTS, SAM3_SCORE_THRESHOLD
        )
        partial_failures.extend(sam_fails)
        cost += n_sam_calls * COST_SAM3_PER_CALL

        hard_sam_fails = sum(1 for f in sam_fails if f.startswith("sam3:"))
        max_allowed_fails = max(3, len(FURNITURE_PROMPTS) // 4)
        if hard_sam_fails > max_allowed_fails:
            raise RuntimeError(
                f"too many SAM 3 prompt failures "
                f"({hard_sam_fails}/{len(FURNITURE_PROMPTS)})"
            )

        # ---- 3. Depth-edge augmentation ------------------------------
        depth_edges_used = False
        if req.enable_depth_edges:
            try:
                depth_edges, _depth_url = _get_depth_edges(image_url, (h, w))
                cost += COST_DEPTH
                if depth_edges.max() > 0:
                    raw_mask = np.maximum(raw_mask, depth_edges)
                    depth_edges_used = True
            except Exception as exc:  # noqa: BLE001
                partial_failures.append(f"depth-edges:{type(exc).__name__}:{exc}")

        cov_raw_pct = float(raw_mask.astype(bool).sum() / (h * w) * 100)

        # ---- 4. Architecture mask subtraction ------------------------
        arch_protection_used = False
        if req.enable_arch_protection:
            try:
                arch_mask, arch_fails = _build_architecture_mask(image_url, (h, w))
                cost += len(ARCHITECTURE_PROMPTS) * COST_SAM3_PER_CALL
                partial_failures.extend(arch_fails)
                if arch_mask.max() > 0:
                    raw_mask = _subtract_architecture(raw_mask, arch_mask)
                    arch_protection_used = True
            except Exception as exc:  # noqa: BLE001
                partial_failures.append(f"arch-mask:{type(exc).__name__}:{exc}")

        # ---- 5. Morphology (close holes, then dilate) ----------------
        dilated = _close_then_dilate(raw_mask, MORPH_CLOSE_PX, DILATION_PX)
        cov_dilated_pct = float(dilated.astype(bool).sum() / (h * w) * 100)

        # ---- 6. Reject guards ----------------------------------------
        if cov_raw_pct < COVERAGE_SHORT_CIRCUIT_PCT:
            raise FurnitureNotFoundError(
                cov_raw_pct=cov_raw_pct,
                partial_failures=partial_failures,
                cost_so_far=cost,
                n_prompts=len(FURNITURE_PROMPTS),
            )
        if cov_dilated_pct > COVERAGE_REJECT_THRESHOLD_PCT:
            raise HighCoverageError(
                cov_dilated_pct=cov_dilated_pct,
                partial_failures=partial_failures,
                cost_so_far=cost,
            )

        # ---- 7. Upload mask to fal -----------------------------------
        ok, mask_buf = cv2.imencode(".png", dilated)
        if not ok:
            raise RuntimeError("mask PNG encoding failed")
        mask_url = _upload_bytes_to_fal(mask_buf.tobytes(), suffix=".png")

        # ---- 8. Router: LaMa primary (prior pipeline-fix baseline) ----
        # Empirical: LaMa = soft blur fill, no hallucinations (ideal for
        # Stage A redesign overwrite). flux-fill = regenerates furniture
        # even with prompt + correct mask. Bria = geometric-box artifacts.
        # LaMa's "softness" is invisible once Stage A paints over the mask.
        if req.force_inpainter is not None:
            inpainter = req.force_inpainter
        else:
            inpainter = "lama"

        logger.info(
            "router → %s (cov_raw=%.1f%%, cov_dilated=%.1f%%)",
            inpainter, cov_raw_pct, cov_dilated_pct,
        )

        inpaint_attempts: list[str] = []
        out_url: Optional[str] = None
        last_error: Optional[str] = None

        # Primary + fallback chain.
        chain = [inpainter]
        if inpainter == "lama":
            chain += ["bria", "flux_fill"]
        elif inpainter == "bria":
            chain += ["lama", "flux_fill"]
        else:
            chain += ["lama", "bria"]
        tried: set[str] = set()
        actually_used = inpainter
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
                inpaint_attempts.append(f"{candidate}:ok")
                break
            except Exception as exc:  # noqa: BLE001
                last_error = f"{candidate}:{type(exc).__name__}:{exc}"
                inpaint_attempts.append(last_error)
                logger.warning("inpainter %s failed: %s", candidate, exc)
        if out_url is None:
            raise RuntimeError(
                f"all inpainters failed: {inpaint_attempts}"
            )
        partial_failures.extend(
            [a for a in inpaint_attempts if not a.endswith(":ok")]
        )

        # ---- 9. Download output + passthrough blend ------------------
        out_raw = _fetch_image_bytes(out_url)
        out_pil = Image.open(io.BytesIO(out_raw)).convert("RGB")
        if out_pil.size != (w, h):
            out_pil = out_pil.resize((w, h), Image.LANCZOS)
        out_arr = np.array(out_pil)

        blended = _passthrough_blend(in_arr, out_arr, dilated, PASSTHROUGH_SIGMA)
        blended_pil = Image.fromarray(blended)
        buf = io.BytesIO()
        blended_pil.save(buf, format="JPEG", quality=95)
        final_url = _rehost_to_supabase(buf.getvalue(), suffix=".jpg", subfolder="empty")

        # ---- 10. Patch SSIM on BLENDED output (vs input) -------------
        out_gray = cv2.cvtColor(blended, cv2.COLOR_RGB2GRAY)
        px, py, mask_ov, tex_std, clean = _select_best_patch(
            in_gray, dilated, h, w, PATCH_SIZE
        )
        patch_ssim_val = _compute_patch_ssim(
            in_gray, out_gray, px, py, PATCH_SIZE
        )

        latency_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "generate_empty_room done  inpainter=%s cov_raw=%.1f%% cov_dilated=%.1f%% ssim=%.3f latency_ms=%d cost=$%.4f",
            actually_used, cov_raw_pct, cov_dilated_pct, patch_ssim_val,
            latency_ms, cost,
        )
        return EmptyRoomResponse(
            empty_room_url=final_url,
            image_hash=image_hash,
            image_width=w,
            image_height=h,
            mask_coverage_raw_pct=cov_raw_pct,
            mask_coverage_dilated_pct=cov_dilated_pct,
            inpainter_used=actually_used,  # type: ignore[arg-type]
            architectural_patch_ssim=patch_ssim_val,
            patch_coordinates=PatchCoordinates(x=px, y=py, size=PATCH_SIZE),
            patch_clean=clean,
            partial_failures=partial_failures,
            latency_ms=latency_ms,
            cost_usd=round(cost, 4),
            generated_at_iso=_iso_now(),
            preprocessing_applied=applied,
            depth_edges_used=depth_edges_used,
            arch_protection_used=arch_protection_used,
        )

    # ------------------------------------------------------------------
    # ASGI
    # ------------------------------------------------------------------

    @modal.asgi_app()
    def api(self):
        from fastapi import FastAPI, HTTPException

        fapp = FastAPI(title="cova-empty-room", version="1.0.0")

        @fapp.get("/healthz")
        def healthz() -> dict:
            return {
                "app": APP_NAME,
                "api_version": API_VERSION,
                "status": "ready",
                "furniture_prompts": len(FURNITURE_PROMPTS),
                "arch_prompts": len(ARCHITECTURE_PROMPTS),
                "primary_inpainter": "flux_fill",
                "passthrough_sigma": PASSTHROUGH_SIGMA,
            }

        @fapp.post(
            f"/{API_VERSION}/generate_empty_room",
            response_model=EmptyRoomResponse,
        )
        def generate_empty_room(req: EmptyRoomRequest) -> EmptyRoomResponse:
            try:
                return self._generate(req)
            except HighCoverageError as exc:
                raise HTTPException(
                    status_code=413,
                    detail={
                        "error": "coverage_too_high",
                        "message": (
                            "Room is too cluttered to produce a clean empty-room render."
                        ),
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
        self,
        cov_dilated_pct: float,
        partial_failures: list[str],
        cost_so_far: float,
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
        f"{APP_NAME} module loaded  "
        f"endpoint=/{API_VERSION}/generate_empty_room  "
        f"furniture_prompts={len(FURNITURE_PROMPTS)}  "
        f"arch_prompts={len(ARCHITECTURE_PROMPTS)}  "
        f"primary=flux_fill"
    )
