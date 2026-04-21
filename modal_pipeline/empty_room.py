"""Cova v9 — Empty-Room Service (Phase 2).

Modal app: ``cova-empty-room``. A10G GPU (not used for inference — all
heavy compute is delegated to fal; GPU tier chosen for Modal billing
consistency with the rest of the Cova stack).

Single v1 endpoint:

  * ``POST /v1/generate_empty_room`` — Furniture mask (SAM 3 @ fal, 20
    prompts in parallel) → 24px dilation → coverage-based router
    (≤35% → LaMa, >35% → Bria) → architectural-patch SSIM acceptance
    metric → return clean empty-room URL.

The pipeline reproduces Phase 0.5 Run 3 (`bench/run-3-empty-room/`)
inside a production service wrapper. All thresholds and prompts are
ports of the bench harness; no new model-level decisions are taken
here. See ``docs/phase-2/service-design.md`` for the full contract.

Upstream dependency: none at request-time (we call fal directly). The
Phase 1 perception service is **not** called on the standalone path —
its keep-class prompts are disjoint from the 20 furniture-erase
prompts used here; see ``docs/phase-2/service-design.md`` §3.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Literal

import modal
from pydantic import BaseModel, Field, HttpUrl

# ---------------------------------------------------------------------------
# Constants (frozen for Phase 2 — match Run 3 bench exactly)
# ---------------------------------------------------------------------------

APP_NAME = "cova-empty-room"
API_VERSION = "v1"

# Furniture prompts — expanded from the bench-only 20 to 54 (Phase 4 fix).
# See docs/pipeline-fix/sam3-diagnostic.json: the original 20 missed real-room
# clutter (clothes/backpacks/cables/electronics/photos) that the diagnostic
# confirmed SAM 3 reliably detects with high confidence on the target room.
# Categories below preserve the bench list 1:1 then layer in
# bedding/clutter/electronics/wall-decor.
FURNITURE_PROMPTS: tuple[str, ...] = (
    # ── Core (bench Run 3, all 20 kept) ──
    "sofa", "chair", "table", "bed", "lamp", "rug", "cabinet", "plant",
    "dresser", "desk", "tv", "ottoman", "bookshelf", "curtains", "artwork",
    "mirror", "fireplace insert", "radiator", "media unit", "bench",
    # ── Bedding / sleep extras ──
    "pillow", "bedding", "blanket", "mattress", "bed frame",
    "nightstand", "bedside table",
    # ── Storage extras ──
    "drawer", "drawer unit", "storage box", "storage unit", "bookcase",
    # ── Seating extras ──
    "office chair", "desk chair", "armchair", "stool",
    # ── Tables / lamps extras ──
    "side table", "coffee table", "floor lamp", "table lamp", "tv stand",
    # ── Real-room clutter (target-room killer) ──
    "backpack", "bag", "clothes", "laundry", "shoes",
    "boxes", "cardboard box", "cable", "wire", "power cord",
    "picture frame", "hanging photos", "string lights",
    "decoration", "clutter", "furniture",
)
assert len(FURNITURE_PROMPTS) == 57, f"got {len(FURNITURE_PROMPTS)}"
assert len(set(FURNITURE_PROMPTS)) == 57, "duplicate prompt"

# Lowered from 0.30 — Phase 3 diagnostic showed every detected item scored
# > 0.5 on target room, but bench rooms include some 0.10-0.30 hits we want
# to keep. 0.10 catches both without producing spurious masks (SAM 3 returns
# zero masks for non-existent prompts rather than low-score ghosts).
SAM3_SCORE_THRESHOLD: float = 0.10

# 24 → 32 (compromise): 40px iter 4 caused too much LaMa over-blur.
# 32px gives a clean compromise: enough buffer to capture mask penumbra
# without burning a huge floor patch into LaMa softness.
DILATION_PX: int = 32

# Morphological close kernel — applied before dilation. Closes the holes
# inside furniture masks (e.g., gap between desk legs, hollow in the back
# of an office chair) so the inpainter doesn't try to preserve those holes.
MORPH_CLOSE_PX: int = 14
COVERAGE_ROUTER_THRESHOLD_PCT: float = 35.0
COVERAGE_REJECT_THRESHOLD_PCT: float = 90.0  # above this → 413
COVERAGE_SHORT_CIRCUIT_PCT: float = 1.0      # below this → return input unchanged

# Cost model (match Run 3 bench)
COST_SAM3_PER_CALL: float = 0.005
COST_LAMA: float = 0.04
COST_BRIA: float = 0.04
# fal-ai/flux-pro/v1/fill — observed $0.05/call from bench harness.
COST_FLUX_FILL: float = 0.05

# SAM 3 concurrency.
# Phase 6 fix (2026-04-21): single-room bench at 57 workers OK, but 3-room
# parallel bench × 57 = 171 concurrent SAM3 calls hit fal rate-limits and
# ALL prompts failed. Capped at 24 workers — three concurrent containers
# stay within fal's per-key throughput while still keeping wall-clock
# acceptable (3 waves of ~24 in parallel ≈ 30s vs 18s in single wave).
SAM3_MAX_WORKERS: int = 24
# bumped 2 → 4 to better swallow transient fal queue errors under load
SAM3_MAX_RETRIES: int = 4
# Client-side timeout on a single SAM 3 subscribe call. Calls that exceed
# this are cancelled and retried. Tuned for production scenario (1 user →
# 1 container → 20 concurrent SAM3 calls). Under concurrent-user load fal's
# queue can take 30-40s per call; 40s timeout tolerates that without
# triggering spurious retries. 40s × 3 attempts bounds the tail at ~120s
# but the partial-failure threshold (> 4) lets us succeed on >= 16/20.
SAM3_CLIENT_TIMEOUT_S: float = 40.0
# Mask-download parallelism (post-SAM3). Independent of SAM3 workers so both
# stages overlap cleanly.
MASK_DOWNLOAD_WORKERS: int = 8

# Inpainter retry
INPAINTER_MAX_RETRIES: int = 3
INPAINTER_HARD_TIMEOUT_S: float = 60.0

# Patch SSIM (ported from bench/scripts/lama_patch_audit.py)
PATCH_SIZE: int = 200
MASK_OVERLAP_THRESHOLD: float = 0.05

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
# Pydantic schemas (v1 — frozen)
# ---------------------------------------------------------------------------


class EmptyRoomRequest(BaseModel):
    image_url: HttpUrl
    image_hash: str | None = None
    user_id: str | None = Field(
        default=None,
        description="Supabase auth.users.id for attribution/logging only.",
    )
    force_inpainter: Literal["lama", "bria", "flux_fill"] | None = Field(
        default=None,
        description=(
            "Diagnostic override — bypass the coverage router. Omit in "
            "production; setters should expect quality regressions."
        ),
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


# ---------------------------------------------------------------------------
# Helpers (top-level so they are picklable by Modal)
# ---------------------------------------------------------------------------


def _fetch_image_bytes(url: str, timeout: int = 60) -> bytes:
    import requests
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.content


def _sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _sam3_detect(
    image_url: str,
    prompt: str,
    score_threshold: float = SAM3_SCORE_THRESHOLD,
    retries: int = SAM3_MAX_RETRIES,
) -> list[tuple[str, float]]:
    """Run one SAM 3 prompt; return [(mask_url, score), ...]. Retries transients."""
    import fal_client  # type: ignore

    last_err: Exception | None = None
    t_sam0 = time.perf_counter()
    for attempt in range(retries + 1):
        try:
            t_call0 = time.perf_counter()
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
            logger.debug(
                "TIMING sam3_call prompt=%s attempt=%d dt_s=%.3f",
                prompt, attempt, time.perf_counter() - t_call0,
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
    """Union of top-1 masks per prompt, evaluated in parallel.

    Returns (mask uint8 HxW, partial_failures[], sam_calls_made).
    """
    import numpy as np

    h, w = shape
    union = np.zeros((h, w), dtype=np.uint8)
    failures: list[str] = []
    calls_made = 0

    t_union0 = time.perf_counter()
    total_download_s = 0.0
    # Stage A — all SAM3 prompts in parallel (workers = prompt count).
    best_urls: list[tuple[str, str]] = []  # (prompt, mask_url)
    t_sam0 = time.perf_counter()
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
    sam_dt = time.perf_counter() - t_sam0

    # Stage B — download all masks in parallel, then union serially (numpy).
    t_dl_all0 = time.perf_counter()
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
    total_download_s = time.perf_counter() - t_dl_all0

    logger.info(
        "TIMING build_union_mask total_dt_s=%.3f sam3_stage_s=%.3f mask_download_s=%.3f n_workers=%d n_prompts=%d masks_dl=%d",
        time.perf_counter() - t_union0, sam_dt, total_download_s,
        SAM3_MAX_WORKERS, len(prompts), len(best_urls),
    )

    return union, failures, calls_made


def _dilate_mask(mask: "Any", px: int) -> "Any":
    import cv2  # type: ignore
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (px * 2 + 1, px * 2 + 1))
    return cv2.dilate(mask, k, iterations=1)


def _close_then_dilate(mask: "Any", close_px: int, dilate_px: int) -> "Any":
    """Close internal holes (chair legs, desk gaps) before dilating outward.

    Phase 4 fix: dilate-only left thin holes inside furniture that the
    inpainter happily preserved as "background", producing visible
    skeletons of the removed item. Closing first eliminates the holes.
    """
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


def _call_lama(image_url: str, mask_url: str) -> str:
    """fal-ai/lama wrapper with retry. Returns output image URL."""
    import fal_client  # type: ignore

    last_err: Exception | None = None
    for attempt in range(INPAINTER_MAX_RETRIES):
        try:
            r = fal_client.subscribe(
                "fal-ai/lama",
                arguments={
                    "image_url": image_url,
                    "mask_image_url": mask_url,
                },
                with_logs=False,
            )
            img = r.get("image")
            if isinstance(img, dict) and img.get("url"):
                return img["url"]
            raise RuntimeError(f"unexpected LaMa response: keys={list(r.keys())}")
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < INPAINTER_MAX_RETRIES - 1:
                time.sleep(0.5 * (2 ** attempt))
    raise RuntimeError(
        f"lama:{type(last_err).__name__}:{last_err}"
    ) from last_err


def _call_bria(image_url: str, mask_url: str) -> str:
    """fal-ai/bria/eraser (mask mode) wrapper with retry. Returns image URL."""
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
            raise RuntimeError(f"unexpected Bria response: keys={list(r.keys())}")
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < INPAINTER_MAX_RETRIES - 1:
                time.sleep(0.5 * (2 ** attempt))
    raise RuntimeError(
        f"bria:{type(last_err).__name__}:{last_err}"
    ) from last_err


# Phase 4 iter 3: prompt-guided FLUX Fill produces sharper output than LaMa
# on large continuous masks (where LaMa softens) and avoids Bria's
# "geometric ghost" hallucinations. The prompt locks the inpainter onto
# "empty room continuation" geometry so it never tries to invent furniture.
# Pattern lifted from modal_pipeline/generation.py:get_neutral_fill_prompt —
# stronger "no furniture" anchoring than my iter 3 prompt, matches the
# proven Stage-1 empty-room generator already in production code.
EMPTY_ROOM_FILL_PROMPT = (
    "Completely empty bedroom interior, NOTHING in the room, "
    "bare walls painted in the existing wall color, bare floor matching "
    "the existing floor material, ceiling preserved exactly as-is, "
    "windows visible with existing treatment, natural daylight streaming in, "
    "professional interior photography, wide angle view, sharp focus, "
    "no furniture whatsoever, no decorations, no objects, no people, "
    "no clutter, no bags, no electronics, no personal items, "
    "just an empty architectural shell awaiting furnishing, "
    "pristine clean surfaces, seamless interior, 8k"
)


def _call_flux_fill(image_url: str, mask_url: str) -> str:
    """fal-ai/flux-pro/v1/fill — prompt-guided inpainter. Returns image URL.

    Argument shape matches modal_pipeline/generation.py:1361 (production
    Stage 1 empty-room call). Earlier iter 3 attempt added num_inference_steps
    and guidance_scale which flux-pro/v1/fill silently ignores.

    Iter 6 fix: flux-pro/v1/fill uses INVERTED mask convention vs LaMa/Bria
    — it treats WHITE pixels as preserve and BLACK pixels as inpaint.
    Iter 5 (which used the LaMa-convention mask: white=furniture) caused
    flux-fill to regenerate furniture in the white areas. We invert the
    mask here before posting so the contract presented to callers stays
    LaMa/Bria-compatible (white=inpaint)."""
    import fal_client  # type: ignore
    import io
    import requests as _req
    from PIL import Image, ImageOps

    # Download, invert, re-upload mask. flux-fill is the only inpainter
    # using inverted convention, so we keep the inversion local to this
    # wrapper instead of changing the upstream mask producer.
    mask_bytes = _req.get(mask_url, timeout=30).content
    inv = ImageOps.invert(Image.open(io.BytesIO(mask_bytes)).convert("L"))
    buf = io.BytesIO()
    inv.save(buf, format="PNG")
    inv_url = _upload_bytes_to_fal(buf.getvalue(), suffix=".png")

    last_err: Exception | None = None
    for attempt in range(INPAINTER_MAX_RETRIES):
        try:
            r = fal_client.subscribe(
                "fal-ai/flux-pro/v1/fill",
                arguments={
                    "image_url": image_url,
                    "mask_url": inv_url,
                    "prompt": EMPTY_ROOM_FILL_PROMPT,
                    "seed": 42,
                    "num_images": 1,
                    "output_format": "png",
                    "safety_tolerance": "2",
                },
                with_logs=False,
                client_timeout=180.0,
            )
            imgs = r.get("images") or []
            if imgs and isinstance(imgs, list):
                first = imgs[0]
                if isinstance(first, dict) and first.get("url"):
                    return first["url"]
                if isinstance(first, str):
                    return first
            img = r.get("image")
            if isinstance(img, dict) and img.get("url"):
                return img["url"]
            raise RuntimeError(
                f"unexpected flux-fill response: keys={list(r.keys())}"
            )
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < INPAINTER_MAX_RETRIES - 1:
                time.sleep(0.5 * (2 ** attempt))
    raise RuntimeError(
        f"flux-fill:{type(last_err).__name__}:{last_err}"
    ) from last_err


# ---------------------------------------------------------------------------
# Patch-SSIM (ported 1:1 from bench/scripts/lama_patch_audit.py)
# ---------------------------------------------------------------------------


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


def _upload_bytes_to_fal(data: bytes, suffix: str = ".png") -> str:
    """Upload an in-memory image to fal storage and return the URL."""
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


# ---------------------------------------------------------------------------
# Modal class
# ---------------------------------------------------------------------------


@app.cls(
    image=empty_room_image,
    gpu="A10G",
    timeout=240,
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
        logger.info("cova-empty-room container ready")

    def _generate(self, req: EmptyRoomRequest) -> EmptyRoomResponse:
        import cv2  # type: ignore
        import numpy as np
        from PIL import Image

        t0 = time.perf_counter()
        cost = 0.0
        partial_failures: list[str] = []

        # ------------------------------------------------------------------
        # 1. Fetch + hash
        # ------------------------------------------------------------------
        t_fetch0 = time.perf_counter()
        raw = _fetch_image_bytes(str(req.image_url))
        logger.info("TIMING fetch_image dt_s=%.3f bytes=%d", time.perf_counter() - t_fetch0, len(raw))
        image_hash = req.image_hash or _sha256_hex(raw)
        pil = Image.open(io.BytesIO(raw)).convert("RGB")
        in_arr = np.array(pil)
        h, w = in_arr.shape[:2]
        in_gray = cv2.cvtColor(in_arr, cv2.COLOR_RGB2GRAY)

        # ------------------------------------------------------------------
        # 2. SAM 3 — 20 furniture prompts → union mask
        # ------------------------------------------------------------------
        raw_mask, sam_fails, n_sam_calls = _build_union_mask(
            str(req.image_url),
            (h, w),
            FURNITURE_PROMPTS,
            SAM3_SCORE_THRESHOLD,
        )
        partial_failures.extend(sam_fails)
        cost += n_sam_calls * COST_SAM3_PER_CALL

        # Hard failure threshold scales with the prompt list size.
        # Original (20 prompts): allow ≤4 failures (= 16 OK).
        # Expanded (57 prompts): allow ≤14 failures (= 43 OK ≈ same ratio).
        hard_sam_fails = sum(
            1 for f in sam_fails if f.startswith("sam3:")
        )
        max_allowed_fails = max(4, len(FURNITURE_PROMPTS) // 4)
        if hard_sam_fails > max_allowed_fails:
            raise RuntimeError(
                f"too many SAM 3 prompt failures "
                f"({hard_sam_fails}/{len(FURNITURE_PROMPTS)}); "
                f"union mask is unreliable"
            )

        cov_raw_pct = float(raw_mask.astype(bool).sum() / (h * w) * 100)

        # ------------------------------------------------------------------
        # 3. Close internal holes, then dilate outward
        # ------------------------------------------------------------------
        dilated = _close_then_dilate(raw_mask, MORPH_CLOSE_PX, DILATION_PX)
        cov_dilated_pct = float(dilated.astype(bool).sum() / (h * w) * 100)

        # ------------------------------------------------------------------
        # 4. Reject guards
        #
        # Phase 4 fix: the previous COVERAGE_SHORT_CIRCUIT_PCT path returned
        # the *original* image when SAM 3 found < 1% furniture, masquerading
        # as a successful empty room. That fed unmodified furnished rooms
        # into the redesign service. Replaced with a hard 422 — empty-room
        # contract requires actual removal, not a silent passthrough.
        # ------------------------------------------------------------------
        if cov_raw_pct < COVERAGE_SHORT_CIRCUIT_PCT:
            raise FurnitureNotFoundError(
                cov_raw_pct=cov_raw_pct,
                partial_failures=partial_failures,
                cost_so_far=cost,
                n_prompts=len(FURNITURE_PROMPTS),
            )

        if cov_dilated_pct > COVERAGE_REJECT_THRESHOLD_PCT:
            # Signaled via exception; the ASGI layer translates to HTTP 413.
            raise HighCoverageError(
                cov_dilated_pct=cov_dilated_pct,
                partial_failures=partial_failures,
                cost_so_far=cost,
            )

        # ------------------------------------------------------------------
        # 5. Upload dilated mask to fal (inpainter requires URL)
        # ------------------------------------------------------------------
        # Encode dilated mask as PNG bytes
        ok, mask_buf = cv2.imencode(".png", dilated)
        if not ok:
            raise RuntimeError("mask PNG encoding failed")
        t_up0 = time.perf_counter()
        mask_url = _upload_bytes_to_fal(mask_buf.tobytes(), suffix=".png")
        logger.info("TIMING mask_upload dt_s=%.3f", time.perf_counter() - t_up0)

        # ------------------------------------------------------------------
        # 6. Route + call inpainter
        # ------------------------------------------------------------------
        # Phase 4 iter 7 (decisive): inpainter selection from target-room
        # bake-off iter 1-6.
        #   - LaMa (iter 1): removes major furniture, mild softness on
        #     large floor patches but NO hallucinations. SAFE default.
        #   - Bria (iter 2): hallucinates white geometric boxes where bed
        #     was. UNSAFE for indoor rooms.
        #   - flux-fill (iter 3, 5, 6): regenerates furniture instead of
        #     removing — even with inverted mask. UNSAFE.
        # → LaMa is the only inpainter that does not invent new structures.
        #   The softening it leaves on large patches is acceptable because
        #   the Phase 5 redesign overlay paints new furniture over those
        #   regions. The original 35% LaMa↔Bria router is preserved for
        #   bench rooms (where Bria worked fine on already-clean inputs).
        if req.force_inpainter is not None:
            inpainter = req.force_inpainter
        elif cov_dilated_pct <= COVERAGE_ROUTER_THRESHOLD_PCT:
            inpainter = "lama"
        else:
            inpainter = "bria"

        logger.info(
            "router → %s (cov_raw=%.1f%%, cov_dilated=%.1f%%)",
            inpainter,
            cov_raw_pct,
            cov_dilated_pct,
        )

        t_inp0 = time.perf_counter()
        if inpainter == "lama":
            out_url = _call_lama(str(req.image_url), mask_url)
            cost += COST_LAMA
        elif inpainter == "flux_fill":
            out_url = _call_flux_fill(str(req.image_url), mask_url)
            cost += COST_FLUX_FILL
        else:
            out_url = _call_bria(str(req.image_url), mask_url)
            cost += COST_BRIA
        logger.info("TIMING inpainter=%s dt_s=%.3f", inpainter, time.perf_counter() - t_inp0)

        # ------------------------------------------------------------------
        # 7. Download output + compute patch SSIM
        # ------------------------------------------------------------------
        t_out0 = time.perf_counter()
        out_raw = _fetch_image_bytes(out_url)
        logger.info("TIMING output_download dt_s=%.3f", time.perf_counter() - t_out0)
        t_ssim0 = time.perf_counter()
        out_pil = Image.open(io.BytesIO(out_raw)).convert("RGB")
        if out_pil.size != (w, h):
            out_pil = out_pil.resize((w, h), Image.LANCZOS)
        out_arr = np.array(out_pil)
        out_gray = cv2.cvtColor(out_arr, cv2.COLOR_RGB2GRAY)

        px, py, mask_ov, tex_std, clean = _select_best_patch(
            in_gray, dilated, h, w, PATCH_SIZE
        )
        patch_ssim_val = _compute_patch_ssim(
            in_gray, out_gray, px, py, PATCH_SIZE
        )
        logger.info("TIMING ssim_block dt_s=%.3f", time.perf_counter() - t_ssim0)

        latency_ms = int((time.perf_counter() - t0) * 1000)
        logger.info("TIMING total dt_s=%.3f inpainter=%s", latency_ms/1000.0, inpainter)
        return EmptyRoomResponse(
            empty_room_url=out_url,
            image_hash=image_hash,
            image_width=w,
            image_height=h,
            mask_coverage_raw_pct=cov_raw_pct,
            mask_coverage_dilated_pct=cov_dilated_pct,
            inpainter_used=inpainter,
            architectural_patch_ssim=patch_ssim_val,
            patch_coordinates=PatchCoordinates(x=px, y=py, size=PATCH_SIZE),
            patch_clean=clean,
            partial_failures=partial_failures,
            latency_ms=latency_ms,
            cost_usd=cost,
            generated_at_iso=_iso_now(),
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
                "router_threshold_pct": COVERAGE_ROUTER_THRESHOLD_PCT,
                "furniture_prompts": len(FURNITURE_PROMPTS),
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
                            "Room is too cluttered to produce a clean "
                            "empty-room render. Please upload a photo with "
                            "less furniture visible."
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
                        "message": (
                            "SAM 3 detected insufficient furniture in this "
                            "image. Refusing to return the original as an "
                            "empty-room render. Try a clearer indoor photo."
                        ),
                        "mask_coverage_raw_pct": exc.cov_raw_pct,
                        "n_prompts_tried": exc.n_prompts,
                        "partial_failures": exc.partial_failures,
                        "cost_usd": exc.cost_so_far,
                    },
                )
            except RuntimeError as exc:
                # Distinguish upstream/fal failures from internal bugs.
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
    """Raised when the dilated mask exceeds the reject threshold."""

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
    """Raised when SAM 3 found <1% coverage. Phase 4 hard fail (no silent
    passthrough). The 422 surface lets callers route to a manual-upload
    flow instead of pushing the original through redesign as if it were
    empty."""

    def __init__(
        self,
        cov_raw_pct: float,
        partial_failures: list[str],
        cost_so_far: float,
        n_prompts: int,
    ) -> None:
        super().__init__(
            f"furniture detection failed: coverage={cov_raw_pct:.2f}%, "
            f"prompts={n_prompts}; refusing to return original image"
        )
        self.cov_raw_pct = cov_raw_pct
        self.partial_failures = partial_failures
        self.cost_so_far = cost_so_far
        self.n_prompts = n_prompts


# ---------------------------------------------------------------------------
# Local sanity check
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    print(
        f"{APP_NAME} module loaded  "
        f"endpoint=/{API_VERSION}/generate_empty_room  "
        f"furniture_prompts={len(FURNITURE_PROMPTS)}  "
        f"router_threshold={COVERAGE_ROUTER_THRESHOLD_PCT}%  "
        f"reject_threshold={COVERAGE_REJECT_THRESHOLD_PCT}%"
    )
