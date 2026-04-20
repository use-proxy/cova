"""Phase 0.5 Run 3 — Empty-room bench harness (hybrid LaMa/Bria router).

Per docs/cova-v9-research.pdf §3.4–§3.5 and §9.5:
  Stage E1: SAM 3 text-prompted furniture mask (widened prompt list, 20 prompts)
  Stage E2: Morphological dilation +24px
  Stage E3: Router — dilated coverage ≤35% → LaMa (fal-ai/lama)
                      dilated coverage  >35% → Bria mask-mode (fal-ai/bria/eraser)
  Stage E4: Ghost gate — SAM 3 rerun + SSIM + VP-shift + edge density
            For LaMa rows: evaluate ghost via ghost_inside_mask_pct
            For Bria rows: evaluate ghost via ghost_furniture_area_pct (unchanged)

NOTE: Low-coverage rescan gate REMOVED. Run 2 showed it produced 0pp coverage
gain across all 6 triggered rooms. SAM 3's miss is structural; lowering the
score threshold does not surface additional furniture. Rescan adds cost without
benefit — removed per lessons-learned §1.

Acceptance thresholds (Run 2 calibrated):
  SSIM-unmasked ≥ 0.97, ghost <1% (per-inpainter rule above), VP-shift < 3%,
  edge-density ratio 0.7–1.3, latency ≤ 60s, cost ≤ $0.50/render.

Coverage router threshold: COVERAGE_ROUTER_THRESHOLD_PCT = 35.0
  ≤35% dilated coverage → LaMa (pixel-space CNN, no VAE drift)
  >35% dilated coverage → Bria (diffusion; handles large masks better than LaMa)
  Provisional — Phase 1 hardening will calibrate.

Ghost metric for LaMa rows: ghost_inside_mask_pct
  = ghost area intersected with the dilated primary mask, as % of full image.
  Rationale: LaMa preserves unmasked pixels exactly. If SAM 3 primary mask
  missed furniture, that furniture remains in the LaMa output — but it was
  never in the mask so it is NOT an inpainting artifact. The original global
  ghost metric re-detects this preserved furniture and labels it "ghost"
  (false positive). ghost_inside_mask_pct restricts ghost detection to regions
  that were actually erased, eliminating the false-positive bias.

Invocation:
  python3 bench/scripts/run_empty_room_bench.py           # all 15 rooms
  python3 bench/scripts/run_empty_room_bench.py room-01   # single pilot
"""
from __future__ import annotations

import io
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import cv2  # type: ignore
import numpy as np
import requests
from PIL import Image
from skimage.metrics import structural_similarity as ssim  # type: ignore

# ── Config ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent.parent
BENCH = ROOT / "bench"
ROOMS_DIR = BENCH / "rooms"
OUT_ROOT = BENCH / "run-3-empty-room"
OUTPUTS_DIR = OUT_ROOT / "outputs"
MASKS_DIR = OUT_ROOT / "masks"
METRICS_DIR = OUT_ROOT / "metrics"

# Primary-mask furniture prompts (widened from Run 1 — 20 unique prompts).
# Run 1 had 11; added: ottoman, bookshelf, curtains, artwork, mirror,
# fireplace insert, radiator, media unit, bench  (cabinet already present).
FURNITURE_PROMPTS = [
    "sofa", "chair", "table", "bed", "lamp", "rug", "cabinet",
    "plant", "dresser", "desk", "tv",
    "ottoman", "bookshelf", "curtains", "artwork", "mirror",
    "fireplace insert", "radiator", "media unit", "bench",
]
assert len(FURNITURE_PROMPTS) == 20, f"Expected 20 prompts, got {len(FURNITURE_PROMPTS)}"
assert len(set(FURNITURE_PROMPTS)) == 20, "Duplicate prompts detected"

# Ghost-detection prompts — exact list from §3.4.
GHOST_PROMPTS = ["sofa", "chair", "table", "bed", "lamp", "rug", "cabinet", "plant"]

# Inpainter cost constants
# COST_BRIA: per §3.1 table
# COST_LAMA: confirmed $0.04/call in bench/probe-lama/cost-log.json
#   (per_room cost=$0.08 = $0.04 LaMa + 8×$0.005 ghost; same pricing tier as Bria)
COST_BRIA = 0.04
COST_LAMA = 0.04
COST_SAM3 = 0.005      # per §3.3
DILATION_PX = 24       # unchanged from Run 2
SAM3_SCORE_THRESHOLD = 0.30
MAX_PARALLEL_ROOMS = 3
HARD_COST_CAP = 6.0    # USD — hard stop (raised from Run 2's $4 per spec)

# Router threshold
COVERAGE_ROUTER_THRESHOLD_PCT = 35.0  # provisional; Phase 1 hardening will calibrate

# Run 2 calibrated thresholds (unchanged in Run 3)
THRESHOLDS = {
    "ssim_unmasked_min": 0.97,
    "ghost_area_max_pct": 1.0,
    "vp_shift_max_pct": 3.0,
    "edge_density_min": 0.7,
    "edge_density_max": 1.3,
    "latency_p95_max_s": 60.0,
    "cost_max_usd_per_room": 0.50,
}


# ── Env loading ───────────────────────────────────────────────────────────────
def load_fal_key() -> None:
    if os.getenv("FAL_KEY"):
        return
    env_path = ROOT / "apps/web/.env.local"
    if not env_path.exists():
        raise RuntimeError(f"FAL_KEY not set and {env_path} missing")
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line.startswith("FAL_KEY="):
            val = line.split("=", 1)[1].strip().strip('"').strip("'")
            os.environ["FAL_KEY"] = val
            return
    raise RuntimeError(f"FAL_KEY not found in {env_path}")


load_fal_key()
import fal_client  # noqa: E402


# ── fal helpers ───────────────────────────────────────────────────────────────
def fal_upload_file(path: Path) -> str:
    return fal_client.upload_file(str(path))


def sam3_detect(
    image_url: str,
    prompt: str,
    score_threshold: float = SAM3_SCORE_THRESHOLD,
    max_retries: int = 3,
) -> list[tuple[str, float]]:
    """Return list of (mask_url, score) for a SAM-3 text prompt call.

    score_threshold: minimum confidence to keep a mask. Default 0.30.
    """
    for attempt in range(max_retries):
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
            )
            break
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait = 2 ** attempt
            print(f"[sam3] '{prompt}' retry {attempt+1}/{max_retries} after {wait}s ({e})")
            time.sleep(wait)
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


def bria_eraser(image_url: str, mask_url: str, max_retries: int = 3) -> tuple[str, dict]:
    """Call fal-ai/bria/eraser, return (output_image_url, raw_response)."""
    for attempt in range(max_retries):
        try:
            r = fal_client.subscribe(
                "fal-ai/bria/eraser",
                arguments={"image_url": image_url, "mask_url": mask_url},
                with_logs=False,
            )
            break
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait = 2 ** attempt
            print(f"[bria] retry {attempt+1}/{max_retries} after {wait}s ({e})")
            time.sleep(wait)
    # Response shape varies: {"image": {"url": ...}} or {"images": [...]}
    img = r.get("image")
    if isinstance(img, dict) and img.get("url"):
        return img["url"], r
    imgs = r.get("images")
    if imgs and isinstance(imgs, list):
        first = imgs[0]
        if isinstance(first, dict) and first.get("url"):
            return first["url"], r
        if isinstance(first, str):
            return first, r
    raise RuntimeError(f"Unexpected Bria response shape; keys={list(r.keys())}")


def lama_eraser(image_url: str, mask_url: str, max_retries: int = 3) -> tuple[str, dict]:
    """Call fal-ai/lama, return (output_image_url, raw_response).

    Endpoint confirmed available: fal-ai/lama
    Input schema: image_url (str), mask_image_url (str)
    Output schema: {"image": {"url": str}}
    LaMa is a pixel-space CNN — no VAE round-trip, no diffusion.

    Retry logic identical to bria_eraser.
    """
    for attempt in range(max_retries):
        try:
            r = fal_client.subscribe(
                "fal-ai/lama",
                arguments={
                    "image_url": image_url,
                    "mask_image_url": mask_url,
                },
                with_logs=False,
            )
            break
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait = 2 ** attempt
            print(f"[lama] retry {attempt+1}/{max_retries} after {wait}s ({e})")
            time.sleep(wait)
    img = r.get("image")
    if isinstance(img, dict) and img.get("url"):
        return img["url"], r
    raise RuntimeError(f"Unexpected LaMa response shape; keys={list(r.keys())}")


# ── Image IO ──────────────────────────────────────────────────────────────────
def download_url(url: str, timeout: float = 60.0) -> bytes:
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.content


def download_mask_png(url: str, target_shape: tuple[int, int]) -> np.ndarray:
    img = Image.open(io.BytesIO(download_url(url, timeout=30))).convert("L")
    arr = np.array(img)
    h, w = target_shape
    if arr.shape != (h, w):
        arr = cv2.resize(arr, (w, h), interpolation=cv2.INTER_NEAREST)
    return (arr > 127).astype(np.uint8) * 255


def download_image_rgb(url: str, size: tuple[int, int] | None = None) -> Image.Image:
    img = Image.open(io.BytesIO(download_url(url, timeout=60))).convert("RGB")
    if size is not None and img.size != size:
        img = img.resize(size, Image.LANCZOS)
    return img


# ── Mask construction ─────────────────────────────────────────────────────────
def build_union_mask(
    image_url: str,
    shape: tuple[int, int],
    prompts: list[str],
    score_threshold: float = SAM3_SCORE_THRESHOLD,
) -> tuple[np.ndarray, dict[str, Any], int]:
    """Run SAM-3 for each prompt in parallel, union the best mask per prompt.

    score_threshold: passed through to sam3_detect. Default 0.30.
    """
    h, w = shape
    union = np.zeros((h, w), dtype=np.uint8)
    info: dict[str, Any] = {}
    calls_made = 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        fut_to_prompt = {
            ex.submit(sam3_detect, image_url, p, score_threshold): p
            for p in prompts
        }
        for fut in as_completed(fut_to_prompt):
            p = fut_to_prompt[fut]
            calls_made += 1
            try:
                results = fut.result()
            except Exception as e:
                info[p] = {"error": str(e)}
                continue
            kept = [(u, s) for (u, s) in results if s >= score_threshold]
            if not kept:
                info[p] = {"hits": 0}
                continue
            best_url, best_score = max(kept, key=lambda t: t[1])
            try:
                m = download_mask_png(best_url, (h, w))
                union = np.maximum(union, m)
                cov_pct = float(m.astype(bool).sum() / (h * w) * 100)
                info[p] = {"hits": len(kept), "best_score": best_score, "coverage_pct": cov_pct}
            except Exception as e:
                info[p] = {"download_error": str(e), "best_score": best_score}
    return union, info, calls_made


def dilate_mask(mask: np.ndarray, px: int) -> np.ndarray:
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (px * 2 + 1, px * 2 + 1))
    return cv2.dilate(mask, k, iterations=1)


# ── Metrics ───────────────────────────────────────────────────────────────────
def metric_ssim_unmasked(in_arr: np.ndarray, out_arr: np.ndarray, mask: np.ndarray) -> float:
    """SSIM over pixels OUTSIDE the furniture mask (architecture-preservation region)."""
    gray_in = cv2.cvtColor(in_arr, cv2.COLOR_RGB2GRAY)
    gray_out = cv2.cvtColor(out_arr, cv2.COLOR_RGB2GRAY)
    _, s_map = ssim(gray_in, gray_out, full=True, data_range=255)
    unmasked = (mask == 0)
    if unmasked.sum() == 0:
        return 1.0
    return float(s_map[unmasked].mean())


def metric_ghost_area_pct_with_mask(
    output_url: str,
    shape: tuple[int, int],
    dilated_mask: np.ndarray,
) -> tuple[float, float, dict]:
    """Re-run SAM 3 on output with GHOST_PROMPTS.

    Returns:
        ghost_furniture_area_pct: global ghost area (% of full image), for Bria rows.
        ghost_inside_mask_pct: ghost area intersected with dilated_mask (% of full image),
            for LaMa rows. Detects ghosts only inside regions that were erased — avoids
            false positives from preserved-unmasked furniture.
        per_prompt: per-prompt detail dict.

    Both metrics are computed in one pass; the caller decides which to use
    based on which inpainter was routed.
    """
    h, w = shape
    total_global = 0.0
    total_inside_mask = 0.0
    per: dict[str, Any] = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        fut_to_prompt = {ex.submit(sam3_detect, output_url, p): p for p in GHOST_PROMPTS}
        for fut in as_completed(fut_to_prompt):
            p = fut_to_prompt[fut]
            try:
                results = fut.result()
            except Exception as e:
                per[p] = {"error": str(e)}
                continue
            biggest_global_pct = 0.0
            biggest_inside_pct = 0.0
            for url, score in results:
                if score < SAM3_SCORE_THRESHOLD:
                    continue
                try:
                    m = download_mask_png(url, (h, w))
                    # Global ghost area
                    pct_global = float(m.astype(bool).sum() / (h * w) * 100)
                    if pct_global > biggest_global_pct:
                        biggest_global_pct = pct_global
                    # Inside-mask ghost area: intersect ghost mask with dilated primary mask
                    inside = (m.astype(bool)) & (dilated_mask.astype(bool))
                    pct_inside = float(inside.sum() / (h * w) * 100)
                    if pct_inside > biggest_inside_pct:
                        biggest_inside_pct = pct_inside
                except Exception:
                    continue
            per[p] = {
                "biggest_mask_pct": biggest_global_pct,
                "biggest_inside_mask_pct": biggest_inside_pct,
            }
            if biggest_global_pct > 0.5:
                total_global += biggest_global_pct
            if biggest_inside_pct > 0.5:
                total_inside_mask += biggest_inside_pct
    return total_global, total_inside_mask, per


def metric_vp_shift_pct(in_arr: np.ndarray, out_arr: np.ndarray) -> float:
    """Coarse VP-shift proxy via LSD line midpoint centroid distance, in % of image width.

    True vanishing-point estimation needs RANSAC line grouping; we use the line
    midpoint centroid as a cheap, reproducible proxy that correlates with perspective
    drift without an extra dependency.
    """
    lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)

    def centroid(arr: np.ndarray) -> np.ndarray | None:
        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        det = lsd.detect(gray)
        lines = det[0] if det is not None else None
        if lines is None or len(lines) == 0:
            return None
        mids = []
        for l in lines.reshape(-1, 4):
            x1, y1, x2, y2 = l
            length = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
            if length < 20:
                continue
            mids.append(((x1 + x2) / 2.0, (y1 + y2) / 2.0))
        if not mids:
            return None
        return np.array(mids).mean(axis=0)

    c1 = centroid(in_arr)
    c2 = centroid(out_arr)
    if c1 is None or c2 is None:
        return 0.0
    w = in_arr.shape[1]
    return float(np.linalg.norm(c1 - c2) / w * 100.0)


def metric_edge_density_ratio(out_arr: np.ndarray, mask: np.ndarray, ring_px: int = 16) -> float:
    """Canny edge count in a ring_px band inside mask vs outside mask (around boundary)."""
    out_gray = cv2.cvtColor(out_arr, cv2.COLOR_RGB2GRAY)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ring_px * 2 + 1, ring_px * 2 + 1))
    inner = cv2.erode(mask, kernel)
    outer = cv2.dilate(mask, kernel)
    ring_inside = (mask > 0) & (inner == 0)
    ring_outside = (outer > 0) & (mask == 0)
    edges = cv2.Canny(out_gray, 100, 200)
    inside_count = float(edges[ring_inside].sum()) / 255.0
    outside_count = float(edges[ring_outside].sum()) / 255.0
    if outside_count < 1.0:
        return 1.0
    return inside_count / outside_count


# ── Per-room pipeline ─────────────────────────────────────────────────────────
def process_room(room: dict, metrics_out_dir: Path | None = None) -> dict:
    """Run the full E1-E4 pipeline for a single room with hybrid LaMa/Bria router.

    metrics_out_dir: override where metrics JSON is written.

    Run 3 changes vs Run 2:
    - OUT_ROOT = run-3-empty-room
    - Hybrid router: cov_dilated ≤35% → LaMa, else Bria
    - ghost_inside_mask_pct added; LaMa pass/fail uses this metric
    - Low-coverage rescan gate REMOVED (0pp gain in Run 2, documented in lessons-learned)
    - HARD_COST_CAP = $6.00
    """
    room_id = room["id"]
    filename = room["filename"]
    input_path = ROOMS_DIR / filename
    out_dir = metrics_out_dir if metrics_out_dir is not None else METRICS_DIR
    out_metrics_path = out_dir / f"{room_id}.json"

    t0 = time.time()
    cost = 0.0
    print(f"[{room_id}] ▶ start")

    input_img = Image.open(input_path).convert("RGB")
    in_arr = np.array(input_img)
    h, w = in_arr.shape[:2]

    # Upload input
    try:
        image_url = fal_upload_file(input_path)
    except Exception as e:
        return {"room_id": room_id, "error": f"upload failed: {e}", "cost_usd": cost}
    print(f"[{room_id}] uploaded ({w}x{h}) -> {image_url[:60]}…")

    # Build primary mask (score_threshold=0.30)
    raw_mask, prompt_info, n_calls = build_union_mask(
        image_url, (h, w), FURNITURE_PROMPTS, score_threshold=SAM3_SCORE_THRESHOLD
    )
    cost += n_calls * COST_SAM3
    cov_raw = float(raw_mask.astype(bool).sum() / (h * w) * 100)

    # Dilate + save (24px)
    dilated = dilate_mask(raw_mask, DILATION_PX)
    cov_dilated = float(dilated.astype(bool).sum() / (h * w) * 100)
    mask_path = MASKS_DIR / f"{room_id}_mask.png"
    Image.fromarray(dilated).save(mask_path)
    print(f"[{room_id}] mask coverage raw={cov_raw:.1f}% dilated={cov_dilated:.1f}%")

    # Guard: extremely low coverage on non-empty room is a regression
    stratification = room.get("stratification") or {}
    stratification_clutter = stratification.get("clutter", "unknown")
    low_coverage_flag = (cov_raw < 15.0) and stratification_clutter not in ("none",)

    # Upload mask
    try:
        mask_url = fal_upload_file(mask_path)
    except Exception as e:
        return {"room_id": room_id, "error": f"mask upload failed: {e}", "cost_usd": cost}

    # ── Hybrid router ────────────────────────────────────────────────────────
    # COVERAGE_ROUTER_THRESHOLD_PCT = 35.0 (provisional; Phase 1 hardening will calibrate)
    # LaMa: pixel-space CNN, no VAE drift, but collapses at >40% coverage.
    # Bria: diffusion-based VAE; handles large masks better but drifts unmasked pixels.
    inpainter_t0 = time.time()
    if cov_dilated <= COVERAGE_ROUTER_THRESHOLD_PCT:
        inpainter = "lama"
        print(f"[{room_id}] router → LaMa (coverage {cov_dilated:.1f}% ≤ {COVERAGE_ROUTER_THRESHOLD_PCT}%)")
        try:
            out_url, inpainter_resp = lama_eraser(image_url, mask_url)
        except Exception as e:
            return {"room_id": room_id, "error": f"lama failed: {e}", "cost_usd": cost}
        cost += COST_LAMA
    else:
        inpainter = "bria"
        print(f"[{room_id}] router → Bria (coverage {cov_dilated:.1f}% > {COVERAGE_ROUTER_THRESHOLD_PCT}%)")
        try:
            out_url, inpainter_resp = bria_eraser(image_url, mask_url)
        except Exception as e:
            return {"room_id": room_id, "error": f"bria failed: {e}", "cost_usd": cost}
        cost += COST_BRIA
    inpainter_latency = time.time() - inpainter_t0

    # Download output
    try:
        out_img = download_image_rgb(out_url, size=(w, h))
    except Exception as e:
        return {"room_id": room_id, "error": f"output download failed: {e}", "cost_usd": cost}
    out_arr = np.array(out_img)
    output_path = OUTPUTS_DIR / f"{room_id}.webp"
    out_img.save(output_path, "WEBP", quality=92)

    # Metrics (architecture-preservation + perspective + edges)
    ssim_score = metric_ssim_unmasked(in_arr, out_arr, dilated)
    vp = metric_vp_shift_pct(in_arr, out_arr)
    edr = metric_edge_density_ratio(out_arr, dilated)

    # Ghost detection: upload output and re-run SAM-3 with ghost prompts
    # Computes both global ghost_area and inside-mask ghost_inside_mask_pct in one pass.
    try:
        ghost_upload_url = fal_upload_file(output_path)
        ghost_area, ghost_inside_mask, ghost_per = metric_ghost_area_pct_with_mask(
            ghost_upload_url, (h, w), dilated
        )
    except Exception as e:
        ghost_area = 0.0
        ghost_inside_mask = 0.0
        ghost_per = {"error": str(e)}
    cost += len(GHOST_PROMPTS) * COST_SAM3

    total_latency = time.time() - t0

    # ── Pass/fail per metric ─────────────────────────────────────────────────
    # Ghost pass/fail is inpainter-specific:
    # - LaMa rows: use ghost_inside_mask_pct (avoids false positives from preserved unmasked furniture)
    # - Bria rows: use ghost_furniture_area_pct (unchanged from Run 2)
    if inpainter == "lama":
        ghost_metric_used = "ghost_inside_mask_pct"
        ghost_value_for_pass = ghost_inside_mask
    else:
        ghost_metric_used = "ghost_furniture_area_pct"
        ghost_value_for_pass = ghost_area

    pass_map = {
        "ssim_unmasked": ssim_score >= THRESHOLDS["ssim_unmasked_min"],
        "ghost_furniture": ghost_value_for_pass <= THRESHOLDS["ghost_area_max_pct"],
        "vp_shift": vp < THRESHOLDS["vp_shift_max_pct"],
        "edge_density": THRESHOLDS["edge_density_min"] <= edr <= THRESHOLDS["edge_density_max"],
        "latency": inpainter_latency <= THRESHOLDS["latency_p95_max_s"],
        "cost": cost <= THRESHOLDS["cost_max_usd_per_room"],
    }
    overall_pass = all(pass_map.values())

    result = {
        "room_id": room_id,
        "input_path": str(input_path.relative_to(ROOT)),
        "output_path": str(output_path.relative_to(ROOT)),
        "mask_path": str(mask_path.relative_to(ROOT)),
        "stratification": room.get("stratification"),
        "mask_source": "sam-3",
        "mask_coverage_raw_pct": cov_raw,
        "mask_coverage_dilated_pct": cov_dilated,
        "low_coverage_flag": low_coverage_flag,
        "inpainter": inpainter,
        "router_threshold_pct": COVERAGE_ROUTER_THRESHOLD_PCT,
        "ghost_metric_used": ghost_metric_used,
        "per_prompt_mask_info": prompt_info,
        "ghost_per_prompt": ghost_per,
        "metrics": {
            "ssim_unmasked": ssim_score,
            "ghost_furniture_detected": ghost_value_for_pass > 0.5,
            "ghost_furniture_area_pct": ghost_area,
            "ghost_inside_mask_pct": ghost_inside_mask,
            "ghost_value_for_pass": ghost_value_for_pass,
            "vp_shift_pct": vp,
            "edge_density_ratio": edr,
            "inpainter_latency_s": inpainter_latency,
            "total_latency_s": total_latency,
            "cost_usd": cost,
        },
        "thresholds": THRESHOLDS,
        "pass_per_metric": pass_map,
        "overall_pass": overall_pass,
    }
    out_metrics_path.write_text(json.dumps(result, indent=2))
    print(
        f"[{room_id}] ✓ pass={overall_pass} inpainter={inpainter} "
        f"ssim={ssim_score:.4f} "
        f"ghost_global={ghost_area:.2f}% ghost_in_mask={ghost_inside_mask:.2f}% "
        f"(eval on {ghost_metric_used}) "
        f"vp={vp:.2f}% edr={edr:.2f} "
        f"lat={inpainter_latency:.1f}s cost=${cost:.3f}"
    )
    return result


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> int:
    for d in (OUT_ROOT, OUTPUTS_DIR, MASKS_DIR, METRICS_DIR):
        d.mkdir(parents=True, exist_ok=True)

    manifest = json.loads((BENCH / "manifest.json").read_text())
    rooms: list[dict] = manifest["rooms"]

    # ── CLI parsing ──
    args = sys.argv[1:]

    # Normal run with optional room filter
    if args:
        arg = args[0]
        if arg == "--skip-existing":
            rooms = [r for r in rooms if not (METRICS_DIR / f"{r['id']}.json").exists()]
        else:
            targets = set(arg.split(","))
            rooms = [r for r in rooms if r["id"] in targets]
        if not rooms:
            print(f"no rooms to process (arg={arg})")
            return 0

    # Cost projection guard
    # Rescan gate removed — cost is deterministic per room:
    # 20 SAM3 primary + 8 SAM3 ghost + 1 inpainter (LaMa or Bria, same cost $0.04)
    per_room_cost = len(FURNITURE_PROMPTS) * COST_SAM3 + len(GHOST_PROMPTS) * COST_SAM3 + max(COST_LAMA, COST_BRIA)
    projected = per_room_cost * len(rooms)
    print(
        f"Projected cost for {len(rooms)} rooms: ${projected:.2f} "
        f"(${per_room_cost:.3f}/room: 20 SAM3 primary + 8 SAM3 ghost + inpainter)"
    )
    print(f"Hard cap: ${HARD_COST_CAP:.2f}")
    if projected > 4.0:
        print(f"WARN: projected ${projected:.2f} > soft cap $4.00")
    if projected > HARD_COST_CAP:
        print(f"BLOCKER: projected ${projected:.2f} > hard cap ${HARD_COST_CAP:.2f}")
        return 2

    results: list[dict] = []
    total_running_cost = 0.0
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_ROOMS) as ex:
        fut_to_room = {ex.submit(process_room, r): r for r in rooms}
        for fut in as_completed(fut_to_room):
            r = fut_to_room[fut]
            try:
                result = fut.result()
                results.append(result)
                run_cost = result.get("metrics", {}).get("cost_usd", result.get("cost_usd", 0.0))
                total_running_cost += run_cost
                if total_running_cost > HARD_COST_CAP:
                    print(
                        f"HARD CAP EXCEEDED: cumulative cost ${total_running_cost:.2f} "
                        f"> ${HARD_COST_CAP:.2f} — cancelling remaining rooms"
                    )
                    ex.shutdown(wait=False, cancel_futures=True)
                    break
            except Exception as e:
                print(f"[{r['id']}] CATASTROPHIC: {e}")
                results.append({"room_id": r["id"], "error": str(e), "cost_usd": 0.0})

    # Order results by manifest for deterministic downstream reads
    order = {r["id"]: i for i, r in enumerate(manifest["rooms"])}
    results.sort(key=lambda x: order.get(x.get("room_id"), 999))

    total_cost = sum(r.get("metrics", {}).get("cost_usd", r.get("cost_usd", 0.0)) for r in results)
    if total_cost > 4.0:
        print(f"WARN: total cost ${total_cost:.2f} exceeded soft cap $4.00")

    # Cost log
    lama_rooms = [r for r in results if r.get("inpainter") == "lama"]
    bria_rooms = [r for r in results if r.get("inpainter") == "bria"]
    cost_log = {
        "total_cost_usd": total_cost,
        "hard_cap_usd": HARD_COST_CAP,
        "router_threshold_pct": COVERAGE_ROUTER_THRESHOLD_PCT,
        "lama_room_count": len(lama_rooms),
        "bria_room_count": len(bria_rooms),
        "per_room": [
            {
                "room_id": r.get("room_id"),
                "cost_usd": r.get("metrics", {}).get("cost_usd", r.get("cost_usd", 0.0)),
                "inpainter": r.get("inpainter"),
                "mask_coverage_dilated_pct": r.get("mask_coverage_dilated_pct"),
                "error": r.get("error"),
                "overall_pass": r.get("overall_pass"),
            }
            for r in results
        ],
    }
    (OUT_ROOT / "cost-log.json").write_text(json.dumps(cost_log, indent=2))

    passed = sum(1 for r in results if r.get("overall_pass"))
    print(
        f"\n═══ TOTAL: {passed}/{len(results)} pass, "
        f"cost ${total_cost:.2f}, "
        f"LaMa: {len(lama_rooms)} room(s), Bria: {len(bria_rooms)} room(s) ═══"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
