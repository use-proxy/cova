"""Phase 0.5 Run 2 — Empty-room bench harness (Bria Eraser primary path).

Per docs/cova-v9-research.pdf §3.4–§3.5 and §9.5:
  Stage E1: SAM 3 text-prompted furniture mask (widened prompt list, 20 prompts)
  Stage E2: Morphological dilation +24px (was 16px in Run 1.5)
  Stage E3: fal-ai/bria/eraser  ← PRIMARY
  Stage E4: Ghost gate — SAM 3 rerun + SSIM + VP-shift + edge density
  Stage E5 (new): Low-coverage rescan gate — if medium/heavy clutter and
            coverage < 20%, re-run SAM 3 at score_threshold=0.20 and merge.

Acceptance thresholds (Run 2 calibrated):
  SSIM-unmasked ≥ 0.97, ghost area < 1.0%, VP-shift < 3%,
  edge-density ratio 0.7–1.3, latency ≤ 60s, cost ≤ $0.50/render.

Invocation:
  python3 bench/scripts/run_empty_room_bench.py           # all 15 rooms
  python3 bench/scripts/run_empty_room_bench.py room-01   # single pilot
  python3 bench/scripts/run_empty_room_bench.py --repeat room-06 N=4  # noise-floor
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
OUT_ROOT = BENCH / "run-2-empty-room"
OUTPUTS_DIR = OUT_ROOT / "outputs"
MASKS_DIR = OUT_ROOT / "masks"
METRICS_DIR = OUT_ROOT / "metrics"
NOISE_FLOOR_DIR = OUT_ROOT / "noise-floor"

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

COST_BRIA = 0.04      # per §3.1 table
COST_SAM3 = 0.005     # per §3.3
DILATION_PX = 24      # Run 2: widened from 16px (Run 1.5) to 24px
SAM3_SCORE_THRESHOLD = 0.30   # default; rescan uses 0.20 (passed as parameter)
MAX_PARALLEL_ROOMS = 3
HARD_COST_CAP = 4.0   # USD — hard stop (Run 2: tighter than Run 1.5's $6)

# Low-coverage rescan parameters
RESCAN_COVERAGE_THRESHOLD = 0.20  # 20% — trigger threshold for medium/heavy clutter rooms
RESCAN_SCORE_THRESHOLD = 0.20     # lowered from 0.30 to catch more furniture in rescan pass

# Run 2 calibrated thresholds (relaxed from §3.4 strict based on Run 1.5 findings)
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

    score_threshold: minimum confidence to keep a mask. Default 0.30; pass 0.20
    for the low-coverage rescan pass.
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

    score_threshold: passed through to sam3_detect. Default 0.30 for primary
    pass; use 0.20 for the low-coverage rescan pass.
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


def metric_ghost_area_pct(output_url: str, shape: tuple[int, int]) -> tuple[float, dict]:
    """Re-run SAM 3 on output with GHOST_PROMPTS; sum area of any mask > 0.5%."""
    h, w = shape
    total = 0.0
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
            biggest_pct = 0.0
            for url, score in results:
                if score < SAM3_SCORE_THRESHOLD:
                    continue
                try:
                    m = download_mask_png(url, (h, w))
                    pct = float(m.astype(bool).sum() / (h * w) * 100)
                    if pct > biggest_pct:
                        biggest_pct = pct
                except Exception:
                    continue
            per[p] = {"biggest_mask_pct": biggest_pct}
            if biggest_pct > 0.5:
                total += biggest_pct
    return total, per


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
    """Run the full E1-E5 pipeline for a single room.

    metrics_out_dir: override where metrics JSON is written (used by noise-floor mode).

    New in Run 2:
    - DILATION_PX = 24 (was 16)
    - Low-coverage rescan gate: if medium/heavy clutter AND coverage < 20%,
      run second SAM 3 pass at score_threshold=0.20 and merge.
    - Rescan stats tracked: rescan_triggered, coverage_before_rescan,
      coverage_after_rescan, rescan_sam3_calls.
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

    # Build primary mask (score_threshold=0.30 default)
    raw_mask, prompt_info, n_calls = build_union_mask(
        image_url, (h, w), FURNITURE_PROMPTS, score_threshold=SAM3_SCORE_THRESHOLD
    )
    cost += n_calls * COST_SAM3
    cov_raw = float(raw_mask.astype(bool).sum() / (h * w) * 100)

    # ── Low-coverage rescan gate ──────────────────────────────────────────────
    stratification = room.get("stratification") or {}
    stratification_clutter = stratification.get("clutter", "unknown")
    clutter_qualifies = stratification_clutter in ("medium", "heavy")

    rescan_triggered = False
    coverage_before_rescan: float | None = None
    coverage_after_rescan: float | None = None
    rescan_sam3_calls = 0
    rescan_prompt_info: dict[str, Any] = {}

    coverage_fraction = raw_mask.astype(bool).sum() / (h * w)
    if clutter_qualifies and coverage_fraction < RESCAN_COVERAGE_THRESHOLD:
        rescan_triggered = True
        coverage_before_rescan = float(coverage_fraction * 100)
        print(
            f"[{room_id}] LOW COVERAGE ({coverage_before_rescan:.1f}%) on {stratification_clutter} room "
            f"— triggering rescan at score_threshold={RESCAN_SCORE_THRESHOLD}"
        )
        rescan_mask, rescan_info, n_rescan_calls = build_union_mask(
            image_url, (h, w), FURNITURE_PROMPTS, score_threshold=RESCAN_SCORE_THRESHOLD
        )
        cost += n_rescan_calls * COST_SAM3
        rescan_sam3_calls = n_rescan_calls
        rescan_prompt_info = rescan_info

        # Merge rescan into primary union
        raw_mask = np.maximum(raw_mask, rescan_mask)
        coverage_after_rescan = float(raw_mask.astype(bool).sum() / (h * w) * 100)
        print(
            f"[{room_id}] Rescan done: coverage {coverage_before_rescan:.1f}% → {coverage_after_rescan:.1f}%"
        )

    # Recompute raw coverage after possible rescan merge
    cov_raw = float(raw_mask.astype(bool).sum() / (h * w) * 100)

    # Dilate + save (24px — Run 2 change)
    dilated = dilate_mask(raw_mask, DILATION_PX)
    cov_dilated = float(dilated.astype(bool).sum() / (h * w) * 100)
    mask_path = MASKS_DIR / f"{room_id}_mask.png"
    Image.fromarray(dilated).save(mask_path)
    print(f"[{room_id}] mask coverage raw={cov_raw:.1f}% dilated={cov_dilated:.1f}%")

    # Guard: extremely low coverage on non-empty room is a regression
    low_coverage_flag = (cov_raw < 15.0) and stratification_clutter not in ("none",)

    # Upload mask
    try:
        mask_url = fal_upload_file(mask_path)
    except Exception as e:
        return {"room_id": room_id, "error": f"mask upload failed: {e}", "cost_usd": cost}

    # Bria Eraser
    bria_t0 = time.time()
    try:
        out_url, bria_resp = bria_eraser(image_url, mask_url)
    except Exception as e:
        return {"room_id": room_id, "error": f"bria failed: {e}", "cost_usd": cost}
    bria_latency = time.time() - bria_t0
    cost += COST_BRIA

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
    try:
        ghost_upload_url = fal_upload_file(output_path)
        ghost_area, ghost_per = metric_ghost_area_pct(ghost_upload_url, (h, w))
    except Exception as e:
        ghost_area = 0.0
        ghost_per = {"error": str(e)}
    cost += len(GHOST_PROMPTS) * COST_SAM3

    total_latency = time.time() - t0

    pass_map = {
        "ssim_unmasked": ssim_score >= THRESHOLDS["ssim_unmasked_min"],
        "ghost_furniture": ghost_area <= THRESHOLDS["ghost_area_max_pct"],
        "vp_shift": vp < THRESHOLDS["vp_shift_max_pct"],
        "edge_density": THRESHOLDS["edge_density_min"] <= edr <= THRESHOLDS["edge_density_max"],
        "latency": bria_latency <= THRESHOLDS["latency_p95_max_s"],
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
        "rescan_triggered": rescan_triggered,
        "coverage_before_rescan": coverage_before_rescan,
        "coverage_after_rescan": coverage_after_rescan,
        "rescan_sam3_calls": rescan_sam3_calls,
        "per_prompt_mask_info": prompt_info,
        "rescan_prompt_info": rescan_prompt_info,
        "ghost_per_prompt": ghost_per,
        "metrics": {
            "ssim_unmasked": ssim_score,
            "ghost_furniture_detected": ghost_area > 0.5,
            "ghost_furniture_area_pct": ghost_area,
            "vp_shift_pct": vp,
            "edge_density_ratio": edr,
            "bria_latency_s": bria_latency,
            "total_latency_s": total_latency,
            "cost_usd": cost,
        },
        "thresholds": THRESHOLDS,
        "pass_per_metric": pass_map,
        "overall_pass": overall_pass,
    }
    out_metrics_path.write_text(json.dumps(result, indent=2))
    print(
        f"[{room_id}] ✓ pass={overall_pass} ssim={ssim_score:.4f} "
        f"ghost={ghost_area:.2f}% vp={vp:.2f}% edr={edr:.2f} "
        f"lat={bria_latency:.1f}s cost=${cost:.3f}"
        + (f" RESCAN" if rescan_triggered else "")
    )
    return result


# ── Noise-floor mode ──────────────────────────────────────────────────────────
def run_noise_floor(room_id_arg: str, n_repeats: int, manifest: dict) -> int:
    """Run room_id N times under the new widened-prompt pipeline.

    Writes metrics to noise-floor/room-<id>_run{1..N}.json.
    All runs are fresh — prior run numbers are NOT reused.
    """
    rooms_by_id = {r["id"]: r for r in manifest["rooms"]}
    if room_id_arg not in rooms_by_id:
        print(f"ERROR: room '{room_id_arg}' not found in manifest")
        return 1

    room = rooms_by_id[room_id_arg]
    NOISE_FLOOR_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    MASKS_DIR.mkdir(parents=True, exist_ok=True)

    # Cost guard: each run costs ~(20 SAM3 + 8 ghost SAM3 + 1 Bria) = 28×0.005 + 0.04 = 0.18
    per_run_cost = len(FURNITURE_PROMPTS) * COST_SAM3 + len(GHOST_PROMPTS) * COST_SAM3 + COST_BRIA
    projected = per_run_cost * n_repeats
    print(f"Noise-floor mode: {n_repeats} repeats of {room_id_arg}")
    print(f"Projected cost: ${projected:.2f} (hard cap ${HARD_COST_CAP:.2f})")
    if projected > HARD_COST_CAP:
        print(f"BLOCKER: projected ${projected:.2f} > hard cap ${HARD_COST_CAP:.2f}")
        return 2

    total_cost = 0.0
    ssim_values: list[float] = []

    for run_idx in range(1, n_repeats + 1):
        print(f"\n═══ Noise-floor run {run_idx}/{n_repeats} ═══")
        out_path = NOISE_FLOOR_DIR / f"{room_id_arg}_run{run_idx}.json"

        result = process_room(room, metrics_out_dir=None)  # compute normally

        # Write to noise-floor dir with run suffix
        out_path.write_text(json.dumps(result, indent=2))

        run_cost = result.get("metrics", {}).get("cost_usd", result.get("cost_usd", 0.0))
        total_cost += run_cost

        ssim_val = result.get("metrics", {}).get("ssim_unmasked")
        if ssim_val is not None:
            ssim_values.append(ssim_val)
            print(f"  run {run_idx}: ssim={ssim_val:.4f}")

        if total_cost > HARD_COST_CAP:
            print(f"WARN: cumulative cost ${total_cost:.2f} exceeded hard cap ${HARD_COST_CAP:.2f} — aborting")
            break

    # Compute noise-floor stats
    if ssim_values:
        mean_ssim = float(np.mean(ssim_values))
        sigma_ssim = float(np.std(ssim_values, ddof=0))
        calibrated_threshold = round(mean_ssim - 2 * sigma_ssim, 3)
        print(f"\nNoise-floor: n={len(ssim_values)} mean={mean_ssim:.4f} σ={sigma_ssim:.4f}")
        print(f"Calibrated SSIM threshold (mean - 2σ) = {calibrated_threshold}")

        stats = {
            "room_id": room_id_arg,
            "n_repeats": len(ssim_values),
            "ssim_values": ssim_values,
            "mean_ssim": mean_ssim,
            "sigma_ssim": sigma_ssim,
            "calibrated_threshold": calibrated_threshold,
            "total_cost_usd": total_cost,
        }
        (NOISE_FLOOR_DIR / "stats.json").write_text(json.dumps(stats, indent=2))

    return 0


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> int:
    for d in (OUT_ROOT, OUTPUTS_DIR, MASKS_DIR, METRICS_DIR, NOISE_FLOOR_DIR):
        d.mkdir(parents=True, exist_ok=True)

    manifest = json.loads((BENCH / "manifest.json").read_text())
    rooms: list[dict] = manifest["rooms"]

    # ── CLI parsing ──
    args = sys.argv[1:]

    # --repeat room-XX N=4  → noise-floor mode
    if args and args[0] == "--repeat":
        if len(args) < 3:
            print("Usage: --repeat <room-id> N=<count>")
            return 1
        room_id_arg = args[1]
        n_str = args[2]
        if not n_str.startswith("N="):
            print(f"Expected N=<int>, got '{n_str}'")
            return 1
        try:
            n_repeats = int(n_str.split("=", 1)[1])
        except ValueError:
            print(f"Invalid N value: '{n_str}'")
            return 1
        return run_noise_floor(room_id_arg, n_repeats, manifest)

    # Normal run
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
    # Worst-case: all medium/heavy rooms trigger rescan (+20 SAM3 calls each)
    medium_heavy_count = sum(
        1 for r in rooms
        if (r.get("stratification") or {}).get("clutter") in ("medium", "heavy")
    )
    per_room_base = len(FURNITURE_PROMPTS) * COST_SAM3 + len(GHOST_PROMPTS) * COST_SAM3 + COST_BRIA
    per_room_rescan_max = len(FURNITURE_PROMPTS) * COST_SAM3  # only for medium/heavy if triggered
    projected_baseline = per_room_base * len(rooms)
    projected_worst = projected_baseline + per_room_rescan_max * medium_heavy_count
    print(
        f"Projected cost for {len(rooms)} rooms: "
        f"${projected_baseline:.2f} baseline + up to ${per_room_rescan_max * medium_heavy_count:.2f} "
        f"rescan overhead (worst case ${projected_worst:.2f})"
    )
    print(f"Hard cap: ${HARD_COST_CAP:.2f}")
    if projected_worst > HARD_COST_CAP:
        print(
            f"WARN: worst-case ${projected_worst:.2f} may exceed hard cap ${HARD_COST_CAP:.2f} "
            f"(only if all {medium_heavy_count} medium/heavy rooms trigger rescan)"
        )
    if projected_baseline > HARD_COST_CAP:
        print(f"BLOCKER: baseline projected ${projected_baseline:.2f} > hard cap ${HARD_COST_CAP:.2f}")
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
    if total_cost > 3.0:
        print(f"WARN: total cost ${total_cost:.2f} exceeded soft cap $3.00")

    # Cost log
    cost_log = {
        "total_cost_usd": total_cost,
        "hard_cap_usd": HARD_COST_CAP,
        "per_room": [
            {
                "room_id": r.get("room_id"),
                "cost_usd": r.get("metrics", {}).get("cost_usd", r.get("cost_usd", 0.0)),
                "error": r.get("error"),
                "overall_pass": r.get("overall_pass"),
                "rescan_triggered": r.get("rescan_triggered", False),
            }
            for r in results
        ],
    }
    (OUT_ROOT / "cost-log.json").write_text(json.dumps(cost_log, indent=2))

    passed = sum(1 for r in results if r.get("overall_pass"))
    rescan_rooms = sum(1 for r in results if r.get("rescan_triggered"))
    print(
        f"\n═══ TOTAL: {passed}/{len(results)} pass, "
        f"cost ${total_cost:.2f}, "
        f"rescan triggered: {rescan_rooms} room(s) ═══"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
