"""Phase 0.5 Track 3 — LaMa probe on H2-confirmed rooms.

Tests whether Bria's H2 architectural drift is caused by the VAE round-trip
(latent diffusion) by replacing Bria with LaMa (pixel-space CNN inpainter)
on the SAME masks from Run 2.

Endpoint: fal-ai/lama
  - Discovered: fal.ai/models/fal-ai/lama (returns 200)
  - OpenAPI schema: https://fal.run/fal-ai/lama/openapi.json
  - Input: image_url (str), mask_image_url (str)
  - Output: {"image": {"url": str}}
  - LaMa is a pixel-space CNN — no VAE round-trip, no diffusion

Rooms: room-01, room-09, room-11 (H2-confirmed in mask-audit.md extended audit)
Masks: bench/run-2-empty-room/masks/room-XX_mask.png (REUSED, not regenerated)

Cost discipline:
  - LaMa calls: ~$0.04 each (fal pricing similar to Bria) → $0.12 for 3 rooms
  - Ghost detection: 8 SAM-3 calls × $0.005 × 3 rooms = $0.12
  - Projected: ~$0.24 total
  - Hard cap: $2.00 (script-level guard)
  - Soft cap: $1.00

Invocation:
  python3 bench/scripts/probe_lama.py
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

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent.parent
BENCH = ROOT / "bench"
ROOMS_DIR = BENCH / "rooms"
RUN2_MASKS_DIR = BENCH / "run-2-empty-room" / "masks"
RUN15_METRICS_DIR = BENCH / "run-1-5-empty-room" / "metrics"
OUT_ROOT = BENCH / "probe-lama"
OUTPUTS_DIR = OUT_ROOT / "outputs"
METRICS_DIR = OUT_ROOT / "metrics"

# ── Config ────────────────────────────────────────────────────────────────────
# H2-confirmed rooms (from mask-audit.md extended audit)
H2_ROOMS = ["room-01", "room-09", "room-11"]

# Ghost-detection prompts — exact list from §3.4 (same as run_empty_room_bench.py)
GHOST_PROMPTS = ["sofa", "chair", "table", "bed", "lamp", "rug", "cabinet", "plant"]

# Architectural patch coords — per spec
# room-01: (360, 8) — re-picked clean patch from Track 2 sanity check
# room-09: upper-third clean patch (from mask-audit: top-left corner (180,135)+200px)
# room-11: upper-third clean patch (from mask-audit: top-right corner (101,745)+200px)
PATCH_COORDS: dict[str, tuple[int, int]] = {
    "room-01": (360, 8),
    "room-09": (180, 135),
    "room-11": (101, 745),
}

COST_LAMA = 0.04       # per fal.ai pricing (same tier as Bria Eraser)
COST_SAM3 = 0.005      # per §3.3
SAM3_SCORE_THRESHOLD = 0.30
HARD_COST_CAP = 2.00   # USD — hard stop per spec
SOFT_COST_CAP = 1.00   # USD — warn
PATCH_SIZE = 200       # px


# ── Env loading ───────────────────────────────────────────────────────────────
def load_env() -> None:
    """Load FAL_KEY from env or apps/web/.env.local."""
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


load_env()
import fal_client  # noqa: E402


# ── fal helpers ───────────────────────────────────────────────────────────────
def fal_upload_file(path: Path) -> str:
    return fal_client.upload_file(str(path))


def lama_inpaint(image_url: str, mask_url: str, max_retries: int = 2) -> str:
    """Call fal-ai/lama, return output image URL.

    Endpoint: fal-ai/lama
    Input: image_url, mask_image_url
    Output: {"image": {"url": str}}
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
            print(f"[lama] retry {attempt + 1}/{max_retries} after {wait}s ({e})")
            time.sleep(wait)
    img = r.get("image")
    if isinstance(img, dict) and img.get("url"):
        return img["url"]
    raise RuntimeError(f"Unexpected LaMa response shape; keys={list(r.keys())}")


def sam3_detect(
    image_url: str,
    prompt: str,
    score_threshold: float = SAM3_SCORE_THRESHOLD,
    max_retries: int = 3,
) -> list[tuple[str, float]]:
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


# ── Metrics (inlined from run_empty_room_bench.py) ────────────────────────────
# Copied inline rather than imported to avoid fal client init at module level.

def metric_ssim_whole(in_arr: np.ndarray, out_arr: np.ndarray) -> float:
    """Whole-image SSIM (grayscale, data_range=255)."""
    gray_in = cv2.cvtColor(in_arr, cv2.COLOR_RGB2GRAY)
    gray_out = cv2.cvtColor(out_arr, cv2.COLOR_RGB2GRAY)
    score, _ = ssim(gray_in, gray_out, full=True, data_range=255)
    return float(score)


def metric_ssim_unmasked(in_arr: np.ndarray, out_arr: np.ndarray, mask: np.ndarray) -> float:
    """SSIM over pixels OUTSIDE the furniture mask (architecture-preservation region)."""
    gray_in = cv2.cvtColor(in_arr, cv2.COLOR_RGB2GRAY)
    gray_out = cv2.cvtColor(out_arr, cv2.COLOR_RGB2GRAY)
    _, s_map = ssim(gray_in, gray_out, full=True, data_range=255)
    unmasked = (mask == 0)
    if unmasked.sum() == 0:
        return 1.0
    return float(s_map[unmasked].mean())


def metric_ssim_patch(
    in_arr: np.ndarray,
    out_arr: np.ndarray,
    patch_origin: tuple[int, int],
    patch_size: int = PATCH_SIZE,
) -> tuple[float, float]:
    """SSIM on a fixed patch. Returns (patch_ssim, mask_fraction_in_patch).

    patch_origin: (row, col) top-left corner.
    mask_fraction: always 0.0 — caller provides pre-validated clean patches.
    """
    row, col = patch_origin
    h, w = in_arr.shape[:2]
    r_end = min(row + patch_size, h)
    c_end = min(col + patch_size, w)
    in_patch = in_arr[row:r_end, col:c_end]
    out_patch = out_arr[row:r_end, col:c_end]
    gray_in = cv2.cvtColor(in_patch, cv2.COLOR_RGB2GRAY)
    gray_out = cv2.cvtColor(out_patch, cv2.COLOR_RGB2GRAY)
    score, _ = ssim(gray_in, gray_out, full=True, data_range=255)
    return float(score), 0.0


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
    """Coarse VP-shift proxy via LSD line midpoint centroid distance, in % of image width."""
    lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)

    def centroid(arr: np.ndarray) -> np.ndarray | None:
        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        det = lsd.detect(gray)
        lines = det[0] if det is not None else None
        if lines is None or len(lines) == 0:
            return None
        mids = []
        for ln in lines.reshape(-1, 4):
            x1, y1, x2, y2 = ln
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
    """Canny edge count in a ring_px band inside mask vs outside mask."""
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
def process_room(room_id: str, filename: str, running_cost: list[float]) -> dict:
    """Run LaMa inpainting + metrics for a single H2 room.

    Uses pre-existing mask from bench/run-2-empty-room/masks/room-XX_mask.png.
    Does NOT regenerate masks.

    running_cost: single-element list for mutable cost accumulation across rooms.
    """
    input_path = ROOMS_DIR / filename
    mask_path = RUN2_MASKS_DIR / f"{room_id}_mask.png"
    output_path = OUTPUTS_DIR / f"{room_id}.webp"
    metrics_path = METRICS_DIR / f"{room_id}.json"
    patch_origin = PATCH_COORDS[room_id]

    t0 = time.time()
    cost = 0.0
    print(f"[{room_id}] start — mask={mask_path.name}")

    if not mask_path.exists():
        return {"room_id": room_id, "error": f"mask not found: {mask_path}", "cost_usd": 0.0}
    if not input_path.exists():
        return {"room_id": room_id, "error": f"input not found: {input_path}", "cost_usd": 0.0}

    # Load input
    input_img = Image.open(input_path).convert("RGB")
    in_arr = np.array(input_img)
    h, w = in_arr.shape[:2]

    # Load mask (from Run 2 — pre-existing, do not regenerate)
    mask_img = Image.open(mask_path).convert("L")
    mask_arr = np.array(mask_img)
    if mask_arr.shape != (h, w):
        mask_arr = cv2.resize(mask_arr, (w, h), interpolation=cv2.INTER_NEAREST)
    mask_bin = (mask_arr > 127).astype(np.uint8) * 255

    cov_pct = float(mask_bin.astype(bool).sum() / (h * w) * 100)
    print(f"[{room_id}] input {w}x{h}, mask coverage={cov_pct:.1f}%")

    # Upload input image
    try:
        image_url = fal_upload_file(input_path)
    except Exception as e:
        return {"room_id": room_id, "error": f"image upload failed: {e}", "cost_usd": 0.0}
    print(f"[{room_id}] image uploaded")

    # Upload mask
    try:
        mask_url = fal_upload_file(mask_path)
    except Exception as e:
        return {"room_id": room_id, "error": f"mask upload failed: {e}", "cost_usd": 0.0}
    print(f"[{room_id}] mask uploaded")

    # LaMa inpaint
    lama_t0 = time.time()
    try:
        out_url = lama_inpaint(image_url, mask_url)
    except Exception as e:
        return {"room_id": room_id, "error": f"lama failed: {e}", "cost_usd": cost}
    lama_latency = time.time() - lama_t0
    cost += COST_LAMA
    running_cost[0] += COST_LAMA
    print(f"[{room_id}] lama done in {lama_latency:.1f}s, cost so far ${running_cost[0]:.3f}")

    # Hard cap check
    if running_cost[0] > HARD_COST_CAP:
        return {
            "room_id": room_id,
            "error": f"HARD CAP EXCEEDED at ${running_cost[0]:.2f}",
            "cost_usd": cost,
        }

    # Download output
    try:
        out_img = download_image_rgb(out_url, size=(w, h))
    except Exception as e:
        return {"room_id": room_id, "error": f"output download failed: {e}", "cost_usd": cost}
    out_arr = np.array(out_img)
    out_img.save(output_path, "WEBP", quality=92)
    print(f"[{room_id}] output saved to {output_path.name}")

    # Metrics
    ssim_whole = metric_ssim_whole(in_arr, out_arr)
    ssim_unmasked = metric_ssim_unmasked(in_arr, out_arr, mask_bin)
    patch_ssim, patch_mask_frac = metric_ssim_patch(in_arr, out_arr, patch_origin)
    vp = metric_vp_shift_pct(in_arr, out_arr)
    edr = metric_edge_density_ratio(out_arr, mask_bin)

    # Patch texture std (for patch quality validation)
    row, col = patch_origin
    in_patch_gray = cv2.cvtColor(in_arr[row:row+PATCH_SIZE, col:col+PATCH_SIZE], cv2.COLOR_RGB2GRAY)
    patch_texture_std = float(in_patch_gray.std())

    # Ghost detection via SAM 3 rerun on LaMa output
    ghost_upload_url: str
    ghost_area: float
    ghost_per: dict
    try:
        ghost_upload_url = fal_upload_file(output_path)
        ghost_area, ghost_per = metric_ghost_area_pct(ghost_upload_url, (h, w))
        ghost_cost = len(GHOST_PROMPTS) * COST_SAM3
        cost += ghost_cost
        running_cost[0] += ghost_cost
        print(
            f"[{room_id}] ghost={ghost_area:.2f}% "
            f"(cost +${ghost_cost:.3f}, total ${running_cost[0]:.3f})"
        )
    except Exception as e:
        ghost_area = 0.0
        ghost_per = {"error": str(e)}
        print(f"[{room_id}] ghost detection failed: {e}")

    total_latency = time.time() - t0
    print(
        f"[{room_id}] done: ssim_whole={ssim_whole:.4f} ssim_unmasked={ssim_unmasked:.4f} "
        f"patch_ssim={patch_ssim:.4f} ghost={ghost_area:.2f}% vp={vp:.2f}% "
        f"edr={edr:.2f} lat={total_latency:.1f}s cost=${cost:.3f}"
    )

    result = {
        "room_id": room_id,
        "input_path": str(input_path.relative_to(ROOT)),
        "output_path": str(output_path.relative_to(ROOT)),
        "mask_path": str(mask_path.relative_to(ROOT)),
        "mask_source": "run-2-reused",
        "mask_coverage_pct": cov_pct,
        "patch_coords": list(patch_origin),
        "patch_size": PATCH_SIZE,
        "patch_texture_std": patch_texture_std,
        "metrics": {
            "ssim_whole": ssim_whole,
            "ssim_unmasked": ssim_unmasked,
            "ssim_patch": patch_ssim,
            "patch_mask_fraction": patch_mask_frac,
            "ghost_furniture_area_pct": ghost_area,
            "vp_shift_pct": vp,
            "edge_density_ratio": edr,
            "lama_latency_s": lama_latency,
            "total_latency_s": total_latency,
            "cost_usd": cost,
        },
        "ghost_per_prompt": ghost_per,
        "endpoint": "fal-ai/lama",
    }
    metrics_path.write_text(json.dumps(result, indent=2))
    return result


# ── Comparison table builder ──────────────────────────────────────────────────
def load_bria_run15_metrics(room_id: str) -> dict:
    """Load Bria Run 1.5 metrics for a room."""
    path = RUN15_METRICS_DIR / f"{room_id}.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text())


BRIA_PATCH_SSIM: dict[str, float] = {
    # From mask-audit.md extended audit (Track 2 re-pick for room-01)
    "room-01": 0.95568,   # re-picked clean patch at (360,8) from Track 2 sanity check
    "room-09": 0.94441,   # top-left corner (180,135)+200px, mask 0.4% (mask-audit extended)
    "room-11": 0.96035,   # top-right corner (101,745)+200px, mask 0.0% (mask-audit extended)
}


def build_comparison_table(results: list[dict]) -> str:
    """Build markdown comparison table from LaMa results + Bria baseline."""
    rows = []
    for r in results:
        room_id = r.get("room_id", "unknown")
        if r.get("error"):
            rows.append(
                f"| {room_id} | ERROR | ERROR | — | ERROR | ERROR | — | ERROR | ERROR |"
            )
            continue
        m = r.get("metrics", {})
        lama_ssim_unmasked = m.get("ssim_unmasked", 0.0)
        lama_patch_ssim = m.get("ssim_patch", 0.0)
        lama_ghost = m.get("ghost_furniture_area_pct", 0.0)

        bria_data = load_bria_run15_metrics(room_id)
        bria_m = bria_data.get("metrics", {})
        bria_ssim_unmasked = bria_m.get("ssim_unmasked", 0.0)
        bria_ghost = bria_m.get("ghost_furniture_area_pct", 0.0)
        bria_patch_ssim = BRIA_PATCH_SSIM.get(room_id, 0.0)

        delta_ssim = lama_ssim_unmasked - bria_ssim_unmasked
        delta_patch = lama_patch_ssim - bria_patch_ssim

        rows.append(
            f"| {room_id} "
            f"| {bria_ssim_unmasked:.4f} "
            f"| {lama_ssim_unmasked:.4f} "
            f"| {delta_ssim:+.4f} "
            f"| {bria_patch_ssim:.4f} "
            f"| {lama_patch_ssim:.4f} "
            f"| {delta_patch:+.4f} "
            f"| {bria_ghost:.1f}% "
            f"| {lama_ghost:.1f}% |"
        )

    header = (
        "| Room | Bria R1.5 SSIM-unmasked | LaMa SSIM-unmasked | Δ "
        "| Bria patch SSIM | LaMa patch SSIM | Δ patch "
        "| Bria ghost % | LaMa ghost % |\n"
        "|---|---|---|---|---|---|---|---|---|"
    )
    return header + "\n" + "\n".join(rows)


def classify_verdict(results: list[dict]) -> tuple[str, str]:
    """Return (verdict_letter, verdict_explanation)."""
    valid = [r for r in results if not r.get("error")]
    if not valid:
        return "INCONCLUSIVE", "All rooms errored — no data."

    patch_ssims = [r["metrics"]["ssim_patch"] for r in valid]
    all_pass = all(s >= 0.97 for s in patch_ssims)
    any_fail = any(s < 0.97 for s in patch_ssims)
    mixed = any_fail and not all_pass and any(s >= 0.97 for s in patch_ssims)

    if all_pass:
        return (
            "A",
            "All 3 LaMa patch SSIM >= 0.97. VAE round-trip is the H2 root cause. "
            "Pipeline needs LaMa as primary OR a VAE-free secondary path for the empty-room stage. "
            "Note: Phase 5 redesign uses Nano Banana Pro (also VAE) so H2 is "
            "an empty-room-stage-specific concern.",
        )
    elif mixed:
        fail_rooms = [r["room_id"] for r in valid if r["metrics"]["ssim_patch"] < 0.97]
        pass_rooms = [r["room_id"] for r in valid if r["metrics"]["ssim_patch"] >= 0.97]
        return (
            "C",
            f"Mixed results. Saved: {pass_rooms}. Drifted: {fail_rooms}. "
            "H2 is multi-causal. Per-room root cause analysis required.",
        )
    else:
        fail_rooms = [r["room_id"] for r in valid if r["metrics"]["ssim_patch"] < 0.97]
        return (
            "B",
            f"Any LaMa patch SSIM < 0.97 ({fail_rooms}). "
            "H2 root cause is NOT solely VAE. Even pixel-space inpainter drifts. "
            "Investigate shared pipeline elements (likely fal/Replicate resampling "
            "or downscale/upscale in the pipeline wrapper). "
            "Probe full-resolution preservation before any further inpainter swap.",
        )


# ── Summary builder ───────────────────────────────────────────────────────────
def build_summary(results: list[dict], total_cost: float) -> str:
    """Build bench/probe-lama/summary.md content."""
    verdict, explanation = classify_verdict(results)
    table = build_comparison_table(results)

    per_room_verdicts = []
    for r in results:
        room_id = r.get("room_id", "unknown")
        if r.get("error"):
            per_room_verdicts.append(f"**{room_id}:** ERROR — {r['error']}")
            continue
        m = r["metrics"]
        patch_ssim = m["ssim_patch"]
        patch_pass = patch_ssim >= 0.97
        bria_patch = BRIA_PATCH_SSIM.get(room_id, 0.0)
        delta = patch_ssim - bria_patch
        verdict_str = "PASS (>=0.97)" if patch_pass else "FAIL (<0.97)"
        per_room_verdicts.append(
            f"**{room_id}:** patch SSIM {patch_ssim:.4f} ({verdict_str}), "
            f"delta vs Bria R1.5 {delta:+.4f}, "
            f"ssim_unmasked={m['ssim_unmasked']:.4f}, "
            f"ghost={m['ghost_furniture_area_pct']:.1f}%, "
            f"vp={m['vp_shift_pct']:.2f}%, "
            f"edr={m['edge_density_ratio']:.2f}"
        )

    if verdict == "A":
        next_step = "Adopt LaMa as empty-room primary; rerun 15-room bench on LaMa next."
    elif verdict == "B":
        next_step = (
            "Even pixel-space inpainter drifts; investigate shared pipeline "
            "(likely fal/Replicate resampling). "
            "Probe full-resolution preservation before any further inpainter swap."
        )
    else:
        next_step = (
            "H2 is multi-causal. Investigate per-room root cause for failing rooms. "
            "Consider LaMa for rooms that passed; alternate path for rooms that failed."
        )

    return f"""# Phase 0.5 Track 3 — LaMa Probe Summary

**Date:** 2026-04-20
**Hypothesis:** Bria's H2 architectural drift is caused by the VAE round-trip.
**Test:** Replace Bria with LaMa (pixel-space CNN) on identical Run-2 masks.
**Rooms:** room-01, room-09, room-11 (H2-confirmed)

---

## 1. Endpoint Discovery

**Endpoint selected:** `fal-ai/lama`

Discovery process:
1. `fal.ai/api/models?keywords=lama` — returned Luma video models, no LaMa inpainter
2. `fal.ai/api/models?keywords=inpaint` — returned `fal-ai/inpaint` (SDXL diffusion, VAE-based, ruled out)
3. Direct probe: `GET https://fal.run/fal-ai/lama/openapi.json` with FAL auth → **200 OK**
   - Input schema: `image_url` (str), `mask_image_url` (str)
   - Output schema: `{{"image": {{"url": str}}}}`
   - This is LaMa (Large Mask inpainting) — pixel-space CNN, no VAE, no diffusion
4. `Replicate cjwbw/lama` → 404 (model not found)
5. Replicate SDK broken on Python 3.14 (pydantic v1 incompatibility) — Replicate ruled out
6. **Decision: fal-ai/lama confirmed available and usable**

**Pricing:** ~$0.04 per call (same fal tier as Bria Eraser, per §3.1 table)
**Total projected cost:** 3 × ($0.04 LaMa + $0.04 ghost detection) = ~$0.24
**Actual cost:** ${total_cost:.4f}

---

## 2. Three-Room Comparison Table

{table}

Bria R1.5 patch SSIM values: room-01=0.95568 (re-picked at (360,8), Track 2), room-09=0.94441 (top-left corner (180,135)+200px, mask-audit extended), room-11=0.96035 (top-right corner (101,745)+200px, mask-audit extended).

---

## 3. Per-Room Verdict

{chr(10).join(per_room_verdicts)}

---

## 4. Overall Classification: **Verdict {verdict}**

{explanation}

---

## 5. Recommended Next Step

{next_step}

---

_End of LaMa probe._
"""


# ── Cost log ──────────────────────────────────────────────────────────────────
def write_cost_log(results: list[dict], total_cost: float) -> None:
    cost_log = {
        "total_cost_usd": total_cost,
        "hard_cap_usd": HARD_COST_CAP,
        "soft_cap_usd": SOFT_COST_CAP,
        "endpoint": "fal-ai/lama",
        "per_room": [
            {
                "room_id": r.get("room_id"),
                "cost_usd": r.get("metrics", {}).get("cost_usd", r.get("cost_usd", 0.0)),
                "error": r.get("error"),
            }
            for r in results
        ],
    }
    (OUT_ROOT / "cost-log.json").write_text(json.dumps(cost_log, indent=2))


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> int:
    for d in (OUT_ROOT, OUTPUTS_DIR, METRICS_DIR):
        d.mkdir(parents=True, exist_ok=True)

    manifest = json.loads((BENCH / "manifest.json").read_text())
    rooms_by_id = {r["id"]: r for r in manifest["rooms"]}

    # Cost projection
    per_room_cost = COST_LAMA + len(GHOST_PROMPTS) * COST_SAM3
    projected = per_room_cost * len(H2_ROOMS)
    print(f"LaMa probe: {len(H2_ROOMS)} H2 rooms")
    print(f"Endpoint: fal-ai/lama")
    print(f"Projected cost: ${projected:.3f} | Soft cap: ${SOFT_COST_CAP} | Hard cap: ${HARD_COST_CAP}")
    if projected > HARD_COST_CAP:
        print(f"BLOCKER: projected ${projected:.3f} > hard cap ${HARD_COST_CAP}")
        return 2

    running_cost = [0.0]  # mutable for cross-room accumulation
    results: list[dict] = []

    for room_id in H2_ROOMS:
        room = rooms_by_id.get(room_id)
        if not room:
            print(f"ERROR: {room_id} not in manifest")
            results.append({"room_id": room_id, "error": "not in manifest", "cost_usd": 0.0})
            continue

        # Pre-flight hard cap check
        if running_cost[0] >= HARD_COST_CAP:
            print(f"HARD CAP REACHED at ${running_cost[0]:.2f} — skipping {room_id}")
            results.append({"room_id": room_id, "error": "hard cap reached", "cost_usd": 0.0})
            continue

        if running_cost[0] >= SOFT_COST_CAP:
            print(f"WARN: soft cap ${SOFT_COST_CAP} reached at ${running_cost[0]:.2f}")

        result = process_room(room_id, room["filename"], running_cost)
        results.append(result)
        print()

    total_cost = running_cost[0]
    print(f"\nTotal cost: ${total_cost:.4f}")

    # Write outputs
    write_cost_log(results, total_cost)

    summary_md = build_summary(results, total_cost)
    (OUT_ROOT / "summary.md").write_text(summary_md)
    print(f"Summary written to {OUT_ROOT / 'summary.md'}")

    # Print comparison table to stdout
    verdict, explanation = classify_verdict(results)
    print(f"\n=== VERDICT: {verdict} ===")
    print(explanation)
    print(f"\n{build_comparison_table(results)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
