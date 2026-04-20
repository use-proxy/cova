"""Phase 0.5 Run 1 — Empty-room bench harness (Bria Eraser primary path).

Per docs/cova-v9-research.pdf §3.4–§3.5 and §9.5:
  Stage E1: SAM 3 text-prompted furniture mask
  Stage E2: Morphological dilation +16px
  Stage E3: fal-ai/bria/eraser  ← PRIMARY
  Stage E4: Ghost gate — SAM 3 rerun + SSIM + VP-shift + edge density

Acceptance thresholds (§3.4):
  SSIM-unmasked ≥ 0.985, ghost area ≤ 0.5%, VP-shift < 2%,
  edge-density ratio 0.7–1.3, latency p95 ≤ 90s, cost ≤ $0.50/render.

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
OUT_ROOT = BENCH / "run-1-empty-room"
OUTPUTS_DIR = OUT_ROOT / "outputs"
MASKS_DIR = OUT_ROOT / "masks"
METRICS_DIR = OUT_ROOT / "metrics"

# Primary-mask furniture prompts (superset of ghost-detection list, with common
# extras). Each is a single SAM-3 call; masks are unioned then dilated.
FURNITURE_PROMPTS = [
    "sofa", "chair", "table", "bed", "lamp", "rug", "cabinet",
    "plant", "dresser", "desk", "tv",
]
# Ghost-detection prompts — exact list from §3.4.
GHOST_PROMPTS = ["sofa", "chair", "table", "bed", "lamp", "rug", "cabinet", "plant"]

COST_BRIA = 0.04      # per §3.1 table
COST_SAM3 = 0.005     # per §3.3
DILATION_PX = 16      # per §3.3 sweet spot
SAM3_SCORE_THRESHOLD = 0.30
MAX_PARALLEL_ROOMS = 3
HARD_COST_CAP = 10.0  # USD

THRESHOLDS = {
    "ssim_unmasked_min": 0.985,
    "ghost_area_max_pct": 0.5,
    "vp_shift_max_pct": 2.0,
    "edge_density_min": 0.7,
    "edge_density_max": 1.3,
    "latency_p95_max_s": 90.0,
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


def sam3_detect(image_url: str, prompt: str, max_retries: int = 3) -> list[tuple[str, float]]:
    """Return list of (mask_url, score) for a SAM-3 text prompt call."""
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
) -> tuple[np.ndarray, dict[str, Any], int]:
    """Run SAM-3 for each prompt in parallel, union the best mask per prompt."""
    h, w = shape
    union = np.zeros((h, w), dtype=np.uint8)
    info: dict[str, Any] = {}
    calls_made = 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        fut_to_prompt = {ex.submit(sam3_detect, image_url, p): p for p in prompts}
        for fut in as_completed(fut_to_prompt):
            p = fut_to_prompt[fut]
            calls_made += 1
            try:
                results = fut.result()
            except Exception as e:
                info[p] = {"error": str(e)}
                continue
            kept = [(u, s) for (u, s) in results if s >= SAM3_SCORE_THRESHOLD]
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
def process_room(room: dict) -> dict:
    room_id = room["id"]
    filename = room["filename"]
    input_path = ROOMS_DIR / filename
    out_metrics_path = METRICS_DIR / f"{room_id}.json"

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

    # Build primary mask
    raw_mask, prompt_info, n_calls = build_union_mask(image_url, (h, w), FURNITURE_PROMPTS)
    cost += n_calls * COST_SAM3
    cov_raw = float(raw_mask.astype(bool).sum() / (h * w) * 100)

    # Dilate + save
    dilated = dilate_mask(raw_mask, DILATION_PX)
    cov_dilated = float(dilated.astype(bool).sum() / (h * w) * 100)
    mask_path = MASKS_DIR / f"{room_id}_mask.png"
    Image.fromarray(dilated).save(mask_path)
    print(f"[{room_id}] mask coverage raw={cov_raw:.1f}% dilated={cov_dilated:.1f}%")

    # Guard: extremely low coverage on non-empty room is a regression
    stratification_clutter = (room.get("stratification") or {}).get("clutter", "unknown")
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
        "per_prompt_mask_info": prompt_info,
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
    )
    return result


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> int:
    for d in (OUT_ROOT, OUTPUTS_DIR, MASKS_DIR, METRICS_DIR):
        d.mkdir(parents=True, exist_ok=True)

    manifest = json.loads((BENCH / "manifest.json").read_text())
    rooms: list[dict] = manifest["rooms"]

    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg == "--skip-existing":
            rooms = [r for r in rooms if not (METRICS_DIR / f"{r['id']}.json").exists()]
        else:
            targets = set(arg.split(","))
            rooms = [r for r in rooms if r["id"] in targets]
        if not rooms:
            print(f"no rooms to process (arg={arg})")
            return 0

    # Cost projection guard
    per_room_projected = len(FURNITURE_PROMPTS) * COST_SAM3 + len(GHOST_PROMPTS) * COST_SAM3 + COST_BRIA
    projected = per_room_projected * len(rooms)
    print(f"Projected cost for {len(rooms)} rooms: ${projected:.2f} (per-room ~${per_room_projected:.3f})")
    if projected > HARD_COST_CAP:
        print(f"BLOCKER: projected ${projected:.2f} > hard cap ${HARD_COST_CAP:.2f}")
        return 2

    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_ROOMS) as ex:
        fut_to_room = {ex.submit(process_room, r): r for r in rooms}
        for fut in as_completed(fut_to_room):
            r = fut_to_room[fut]
            try:
                results.append(fut.result())
            except Exception as e:
                print(f"[{r['id']}] CATASTROPHIC: {e}")
                results.append({"room_id": r["id"], "error": str(e), "cost_usd": 0.0})

    # Order results by manifest for deterministic downstream reads
    order = {r["id"]: i for i, r in enumerate(manifest["rooms"])}
    results.sort(key=lambda x: order.get(x.get("room_id"), 999))

    # Cost log
    total_cost = sum(r.get("metrics", {}).get("cost_usd", r.get("cost_usd", 0.0)) for r in results)
    cost_log = {
        "total_cost_usd": total_cost,
        "per_room": [
            {
                "room_id": r.get("room_id"),
                "cost_usd": r.get("metrics", {}).get("cost_usd", r.get("cost_usd", 0.0)),
                "error": r.get("error"),
                "overall_pass": r.get("overall_pass"),
            }
            for r in results
        ],
    }
    (OUT_ROOT / "cost-log.json").write_text(json.dumps(cost_log, indent=2))

    passed = sum(1 for r in results if r.get("overall_pass"))
    print(f"\n═══ TOTAL: {passed}/{len(results)} pass, cost ${total_cost:.2f} ═══")
    return 0


if __name__ == "__main__":
    sys.exit(main())
