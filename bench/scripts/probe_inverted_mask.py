"""Phase 0.5 — Inverted-mask probe.

Test 'keep architecture, erase everything else' strategy on 3 hardest
failure rooms: room-02 (piano/high-freq floor, LaMa drift), room-11
(green-velvet 51% coverage, Bria failure), room-14 (stacked-stone,
low SSIM 0.43 in Run 3).

Strategy:
  SAM 3 detects architectural elements (wall/ceiling/floor/window/etc.)
  → union → dilate 8px (keep_dilated)
  → invert → dilate 8px (erase_mask passed to Bria)

Cost model:
  14 SAM3 calls × $0.005 = $0.07/room × 3 rooms = $0.21
  Bria $0.04/room × 3 = $0.12
  Total projected: ~$0.33. Cap $0.50, hard stop $1.00.

Invocation:
  python3 bench/scripts/probe_inverted_mask.py
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
from PIL import Image, ImageDraw, ImageFont
from skimage.metrics import structural_similarity as ssim  # type: ignore

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent.parent
BENCH = ROOT / "bench"
ROOMS_DIR = BENCH / "rooms"
RUN3_METRICS_DIR = BENCH / "run-3-empty-room" / "metrics"

PROBE_DIR = BENCH / "probe-inverted-mask"
OUTPUTS_DIR = PROBE_DIR / "outputs"
MASKS_DIR = PROBE_DIR / "masks"
TRIPTYCH_DIR = PROBE_DIR / "triptych"

# ── Constants ─────────────────────────────────────────────────────────────────
TARGET_ROOMS = ["room-02", "room-11", "room-14"]

# 14 architectural prompts — the 'keep' class.
ARCH_PROMPTS = [
    "wall",
    "ceiling",
    "floor",
    "window",
    "door",
    "window frame",
    "built-in cabinet",
    "fireplace",
    "radiator",
    "baseboard",
    "crown molding",
    "exposed beam",
    "wainscoting",
    "staircase railing",
]
assert len(ARCH_PROMPTS) == 14, f"Expected 14 arch prompts, got {len(ARCH_PROMPTS)}"

COST_SAM3 = 0.005
COST_BRIA = 0.04
SAM3_SCORE_THRESHOLD = 0.30
KEEP_DILATION_PX = 8
ERASE_DILATION_PX = 8
SOFT_COST_CAP = 0.50
HARD_COST_CAP = 1.00

# Kept-patch search candidate fractions — checked in order, pick lowest-std patch.
# Upper-third center, top-left, top-right + 4 spaced positions at y=H/12.
PATCH_CANDIDATES_FRAC = [
    (1 / 3, 1 / 2),   # upper-third center
    (1 / 6, 1 / 4),   # top-left
    (1 / 6, 3 / 4),   # top-right
    (1 / 12, 1 / 6),  # y=H/12 left
    (1 / 12, 2 / 6),  # y=H/12 center-left
    (1 / 12, 4 / 6),  # y=H/12 center-right
    (1 / 12, 5 / 6),  # y=H/12 right
]
PATCH_SIZE = 200
KEEP_PIX_THRESH = 0.95   # fraction of patch pixels that must be in keep mask
ERASE_ZERO_THRESH = 0.95  # fraction of patch pixels that must be outside erase mask


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
            print(f"[sam3] '{prompt}' retry {attempt + 1}/{max_retries} after {wait}s ({e})")
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
    """Call fal-ai/bria/eraser, return (output_image_url, raw_response).

    Convention: white = region to erase. Matching existing bench harness usage.
    """
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
            print(f"[bria] retry {attempt + 1}/{max_retries} after {wait}s ({e})")
            time.sleep(wait)
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


# ── Mask helpers ──────────────────────────────────────────────────────────────
def dilate_mask(mask: np.ndarray, px: int) -> np.ndarray:
    if px == 0:
        return mask.copy()
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (px * 2 + 1, px * 2 + 1))
    return cv2.dilate(mask, k, iterations=1)


def build_arch_keep_mask(
    image_url: str,
    shape: tuple[int, int],
    prompts: list[str],
    score_threshold: float = SAM3_SCORE_THRESHOLD,
) -> tuple[np.ndarray, dict[str, Any], int]:
    """Run SAM-3 for each architectural prompt in parallel, union ALL masks above threshold.

    Unlike the furniture masking (which takes only the best mask per prompt),
    architectural elements are often disjoint regions (e.g., left wall + right wall +
    ceiling are all separate). We union ALL masks above threshold per prompt to capture
    the full architectural extent.

    Returns: (union_mask, per_prompt_info, calls_made)
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
                info[p] = {"error": str(e), "hits": 0}
                continue

            kept = [(u, s) for (u, s) in results if s >= score_threshold]
            if not kept:
                info[p] = {"hits": 0}
                continue

            # Union ALL kept masks (not just best) — architecture has many disjoint regions.
            downloaded = 0
            total_cov = 0.0
            for url, score in kept:
                try:
                    m = download_mask_png(url, (h, w))
                    union = np.maximum(union, m)
                    cov_pct = float(m.astype(bool).sum() / (h * w) * 100)
                    total_cov += cov_pct
                    downloaded += 1
                except Exception:
                    continue

            info[p] = {
                "hits": len(kept),
                "downloaded": downloaded,
                "scores": [round(s, 3) for _, s in kept],
                "total_coverage_pct": round(total_cov, 2),
            }

    return union, info, calls_made


# ── Kept-patch SSIM ───────────────────────────────────────────────────────────
def find_kept_patch(
    keep_mask: np.ndarray,
    erase_mask: np.ndarray,
    in_arr: np.ndarray,
    patch_size: int = PATCH_SIZE,
) -> tuple[tuple[int, int, int, int] | None, float]:
    """Find a patch inside the kept (architectural) region with uniform texture.

    Returns (y0, x0, y1, x1) of best patch, or None if no candidate qualifies.
    Also returns the std of the chosen patch (lower = more uniform texture).
    """
    h, w = keep_mask.shape
    gray = cv2.cvtColor(in_arr, cv2.COLOR_RGB2GRAY)
    best_coords = None
    best_std = float("inf")

    for (yf, xf) in PATCH_CANDIDATES_FRAC:
        cy = int(yf * h)
        cx = int(xf * w)
        y0 = max(0, cy - patch_size // 2)
        x0 = max(0, cx - patch_size // 2)
        y1 = min(h, y0 + patch_size)
        x1 = min(w, x0 + patch_size)
        if (y1 - y0) < patch_size // 2 or (x1 - x0) < patch_size // 2:
            continue

        patch_keep = keep_mask[y0:y1, x0:x1]
        patch_erase = erase_mask[y0:y1, x0:x1]
        patch_area = (y1 - y0) * (x1 - x0)

        keep_frac = float((patch_keep > 0).sum() / patch_area)
        erase_zero_frac = float((patch_erase == 0).sum() / patch_area)

        if keep_frac < KEEP_PIX_THRESH or erase_zero_frac < ERASE_ZERO_THRESH:
            continue

        patch_gray = gray[y0:y1, x0:x1]
        std = float(patch_gray.std())
        if std < best_std:
            best_std = std
            best_coords = (y0, x0, y1, x1)

    return best_coords, best_std


def compute_patch_ssim(
    in_arr: np.ndarray,
    out_arr: np.ndarray,
    coords: tuple[int, int, int, int],
) -> float:
    y0, x0, y1, x1 = coords
    patch_in = cv2.cvtColor(in_arr[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY)
    patch_out = cv2.cvtColor(out_arr[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY)
    score, _ = ssim(patch_in, patch_out, full=True, data_range=255)
    return float(score)


# ── Verdict heuristic ─────────────────────────────────────────────────────────
def compute_verdict(kept_patch_ssim: float | None, erased_pct: float) -> str:
    """Programmatic heuristic — not a real visual assessment.

    coherent:  kept-patch SSIM >= 0.99 AND erased% <= 80%
    partial:   kept-patch SSIM in [0.95, 0.99)
    broken:    kept-patch SSIM < 0.95 OR erased% > 85% OR no patch found
    """
    if kept_patch_ssim is None:
        return "broken (no kept patch found)"
    if erased_pct > 85.0:
        return f"broken (over-erased {erased_pct:.1f}%>85%)"
    if kept_patch_ssim >= 0.99:
        return "coherent"
    if kept_patch_ssim >= 0.95:
        return "partial"
    return f"broken (kept-patch SSIM {kept_patch_ssim:.4f}<0.95)"


# ── Triptych builder ──────────────────────────────────────────────────────────
def build_triptych(
    input_img: Image.Image,
    erase_mask: np.ndarray,
    output_img: Image.Image,
    room_id: str,
    out_path: Path,
) -> None:
    """Three panels: INPUT | ERASE MASK OVERLAY | BRIA OUTPUT with captions."""
    W, H = input_img.size

    # Build overlay panel: input with erase mask shown as 50% red tint
    in_arr = np.array(input_img.convert("RGB"))
    overlay_arr = in_arr.copy()
    erase_bool = erase_mask > 127
    overlay_arr[erase_bool, 0] = np.clip(
        overlay_arr[erase_bool, 0].astype(np.int32) // 2 + 128, 0, 255
    ).astype(np.uint8)
    overlay_arr[erase_bool, 1] = (overlay_arr[erase_bool, 1] // 2).astype(np.uint8)
    overlay_arr[erase_bool, 2] = (overlay_arr[erase_bool, 2] // 2).astype(np.uint8)
    overlay_img = Image.fromarray(overlay_arr)

    # Resize output to match input dimensions
    out_resized = output_img.resize((W, H), Image.LANCZOS)

    # Caption strip constants
    cap_h = 36
    sep_w = 4
    panel_w = W
    total_w = panel_w * 3 + sep_w * 2
    total_h = H + cap_h

    canvas = Image.new("RGB", (total_w, total_h), (0, 0, 0))

    # Place panels + separators
    panels = [input_img.resize((W, H)), overlay_img.resize((W, H)), out_resized]
    captions = ["INPUT", "ERASE MASK OVERLAY", "BRIA OUTPUT"]
    for i, (panel, cap) in enumerate(zip(panels, captions)):
        x_off = i * (panel_w + sep_w)
        canvas.paste(panel, (x_off, 0))
        # Caption strip (white text on black, already black background)
        draw = ImageDraw.Draw(canvas)
        # Use default PIL font — no external font dependency
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 18)
        except Exception:
            font = ImageFont.load_default()
        text_bbox = draw.textbbox((0, 0), cap, font=font)
        text_w = text_bbox[2] - text_bbox[0]
        text_x = x_off + (panel_w - text_w) // 2
        text_y = H + (cap_h - (text_bbox[3] - text_bbox[1])) // 2
        draw.text((text_x, text_y), cap, fill=(255, 255, 255), font=font)

    canvas.save(str(out_path), "PNG")


# ── Per-room pipeline ─────────────────────────────────────────────────────────
def process_room(
    room: dict,
    running_cost: list[float],  # mutable single-element list for shared cost tracking
) -> dict:
    room_id = room["id"]
    filename = room["filename"]
    input_path = ROOMS_DIR / filename

    print(f"\n[{room_id}] ▶ start  (running cost so far: ${running_cost[0]:.3f})")

    t0 = time.time()
    cost = 0.0

    # Load input image
    input_img = Image.open(input_path).convert("RGB")
    in_arr = np.array(input_img)
    h, w = in_arr.shape[:2]

    # Upload input
    try:
        image_url = fal_upload_file(input_path)
    except Exception as e:
        return {"room_id": room_id, "error": f"upload failed: {e}", "cost_usd": cost}
    print(f"[{room_id}] uploaded ({w}x{h})")

    # Step 1 — SAM 3 architectural keep-mask (union ALL masks above threshold per prompt)
    print(f"[{room_id}] Step 1: SAM 3 architectural prompts ({len(ARCH_PROMPTS)} prompts)…")
    raw_keep_mask, arch_info, n_calls = build_arch_keep_mask(
        image_url, (h, w), ARCH_PROMPTS, score_threshold=SAM3_SCORE_THRESHOLD
    )
    cost += n_calls * COST_SAM3
    running_cost[0] += n_calls * COST_SAM3

    hits_count = sum(1 for v in arch_info.values() if v.get("hits", 0) > 0)
    print(
        f"[{room_id}] arch prompts: {hits_count}/{len(ARCH_PROMPTS)} had hits, "
        f"cost so far ${cost:.3f}"
    )

    if running_cost[0] > SOFT_COST_CAP:
        print(f"WARN: running cost ${running_cost[0]:.3f} exceeds soft cap ${SOFT_COST_CAP}")
    if running_cost[0] > HARD_COST_CAP:
        return {
            "room_id": room_id,
            "error": f"hard cost cap ${HARD_COST_CAP} reached at SAM3 phase",
            "cost_usd": cost,
        }

    # Step 2 — Build erase mask
    # keep_dilated: architecture protected with 8px softening
    keep_dilated = dilate_mask(raw_keep_mask, KEEP_DILATION_PX)
    # erase_mask: everything not in keep_dilated, further dilated 8px for seam softening
    erase_raw = (255 - keep_dilated).astype(np.uint8)
    erase_mask = dilate_mask(erase_raw, ERASE_DILATION_PX)

    erased_pct = float(erase_mask.astype(bool).sum() / (h * w) * 100)
    kept_pct = 100.0 - erased_pct
    print(f"[{room_id}] erase mask: erased={erased_pct:.1f}%  kept={kept_pct:.1f}%")

    # Warn if SAM 3 produced essentially no architectural mask (all zero)
    if raw_keep_mask.astype(bool).sum() == 0:
        print(f"[{room_id}] WARN: SAM 3 returned zero architectural masks — will over-erase")

    # Save masks
    keep_mask_path = MASKS_DIR / f"{room_id}_keep.png"
    erase_mask_path = MASKS_DIR / f"{room_id}_erase.png"
    Image.fromarray(keep_dilated).save(str(keep_mask_path))
    Image.fromarray(erase_mask).save(str(erase_mask_path))

    # Upload erase mask for Bria
    try:
        erase_mask_url = fal_upload_file(erase_mask_path)
    except Exception as e:
        return {"room_id": room_id, "error": f"erase mask upload failed: {e}", "cost_usd": cost}

    # Step 3 — Bria eraser
    print(f"[{room_id}] Step 3: Bria erase…")
    bria_t0 = time.time()
    try:
        out_url, _bria_resp = bria_eraser(image_url, erase_mask_url)
    except Exception as e:
        return {"room_id": room_id, "error": f"bria failed: {e}", "cost_usd": cost}
    bria_latency = time.time() - bria_t0
    cost += COST_BRIA
    running_cost[0] += COST_BRIA
    print(f"[{room_id}] Bria done in {bria_latency:.1f}s. Running cost ${running_cost[0]:.3f}")

    if running_cost[0] > HARD_COST_CAP:
        # Still save what we have before aborting
        print(f"ABORT: running cost ${running_cost[0]:.3f} > hard cap ${HARD_COST_CAP}")
        return {
            "room_id": room_id,
            "error": f"hard cost cap reached after Bria (${running_cost[0]:.3f})",
            "cost_usd": cost,
        }

    # Download output
    try:
        out_img = download_image_rgb(out_url, size=(w, h))
    except Exception as e:
        return {"room_id": room_id, "error": f"output download failed: {e}", "cost_usd": cost}
    out_arr = np.array(out_img)

    # Step 4 — Save output
    output_path = OUTPUTS_DIR / f"{room_id}_output.webp"
    out_img.save(str(output_path), "WEBP", quality=92)

    # Step 5 — Metrics

    # a. Erased area %
    erased_area_pct = float(erase_mask.astype(bool).sum() / (h * w) * 100)

    # b. Kept-region architectural-patch SSIM
    patch_coords, patch_std = find_kept_patch(keep_dilated, erase_mask, in_arr)
    if patch_coords is not None:
        kept_patch_ssim = compute_patch_ssim(in_arr, out_arr, patch_coords)
        patch_y0, patch_x0, patch_y1, patch_x1 = patch_coords
        patch_coords_str = f"y={patch_y0}:{patch_y1}, x={patch_x0}:{patch_x1}"
    else:
        kept_patch_ssim = None
        patch_coords_str = "none found"
        patch_std = float("nan")
        print(f"[{room_id}] WARN: no qualifying kept-region patch found")

    # c. Per-prompt hits log
    hits_log = {
        p: {
            "hits": arch_info[p].get("hits", 0),
            "scores": arch_info[p].get("scores", []),
            "total_coverage_pct": arch_info[p].get("total_coverage_pct", 0.0),
            "error": arch_info[p].get("error"),
        }
        for p in ARCH_PROMPTS
    }

    # d. Visual verdict (programmatic heuristic)
    verdict = compute_verdict(kept_patch_ssim, erased_area_pct)

    # Step 6 — Comparison to Run 3
    run3_ssim = None
    run3_metrics_path = RUN3_METRICS_DIR / f"{room_id}.json"
    if run3_metrics_path.exists():
        try:
            run3_data = json.loads(run3_metrics_path.read_text())
            run3_ssim = run3_data.get("metrics", {}).get("ssim_unmasked")
        except Exception:
            pass

    # Step 7 — Failure mode flagging
    failure_note = ""
    if kept_patch_ssim is not None and kept_patch_ssim < 0.95:
        zero_hit_prompts = [p for p in ARCH_PROMPTS if arch_info[p].get("hits", 0) == 0]
        if zero_hit_prompts:
            failure_note = f"SAM3 missed: {', '.join(zero_hit_prompts)}"
        else:
            failure_note = "SAM3 had hits but Bria VAE drifted kept region"
    elif erased_area_pct > 85.0:
        zero_hit_prompts = [p for p in ARCH_PROMPTS if arch_info[p].get("hits", 0) == 0]
        failure_note = f"over-erased ({erased_area_pct:.1f}%); SAM3 missed: {zero_hit_prompts}"

    total_latency = time.time() - t0
    print(
        f"[{room_id}] done. erased={erased_area_pct:.1f}% patch_ssim={kept_patch_ssim} "
        f"verdict={verdict} lat={total_latency:.1f}s cost=${cost:.3f}"
    )

    # Step 4 — Triptych
    triptych_path = TRIPTYCH_DIR / f"{room_id}.png"
    try:
        build_triptych(input_img, erase_mask, out_img, room_id, triptych_path)
    except Exception as e:
        print(f"[{room_id}] triptych build failed: {e}")

    return {
        "room_id": room_id,
        "input_path": str(input_path.relative_to(ROOT)),
        "output_path": str(output_path.relative_to(ROOT)),
        "keep_mask_path": str(keep_mask_path.relative_to(ROOT)),
        "erase_mask_path": str(erase_mask_path.relative_to(ROOT)),
        "triptych_path": str(triptych_path.relative_to(ROOT)),
        "erased_area_pct": round(erased_area_pct, 2),
        "kept_area_pct": round(100.0 - erased_area_pct, 2),
        "arch_hits_count": hits_count,
        "arch_total_prompts": len(ARCH_PROMPTS),
        "kept_patch_coords": patch_coords_str,
        "kept_patch_std": round(patch_std, 2) if not (isinstance(patch_std, float) and patch_std != patch_std) else None,
        "kept_patch_ssim": round(kept_patch_ssim, 6) if kept_patch_ssim is not None else None,
        "run3_ssim_unmasked": round(run3_ssim, 6) if run3_ssim is not None else None,
        "verdict": verdict,
        "failure_note": failure_note,
        "per_prompt_hits": hits_log,
        "bria_latency_s": round(bria_latency, 1),
        "total_latency_s": round(total_latency, 1),
        "cost_usd": round(cost, 4),
    }


# ── Summary writer ────────────────────────────────────────────────────────────
def write_summary(results: list[dict], total_cost: float) -> None:
    summary_path = PROBE_DIR / "summary.md"
    lines: list[str] = []

    lines.append("# Phase 0.5 — Inverted-Mask Probe: Summary\n")

    # 1. Hypothesis
    lines.append("## 1. Hypothesis\n")
    lines.append(
        "Prior bench runs masked furniture (positive selection) and asked the inpainter "
        "to remove it. Failure modes: Bria mask-mode drifts unmasked architectural pixels "
        "(H2); LaMa collapses on >40% mask coverage (room-11); LaMa drifts on "
        "high-frequency-texture inputs (room-02 piano floor, room-14 stacked stone); "
        "SAM 3 furniture mask is incomplete on cluttered scenes.\n\n"
        "Inverted-mask flips the framing: SAM 3 segments architectural elements "
        "(wall/ceiling/floor/window/etc.); we invert to get an erase-everything-else mask; "
        "pass to Bria. The inpainter has a complete furniture-region to fill rather than "
        "chasing missed furniture instances. Architecture is explicitly kept via the SAM 3 "
        "architectural mask.\n"
    )

    # 2. Per-room table
    lines.append("## 2. Per-Room Results\n")
    lines.append(
        "| Room | Erased % | Kept-patch coords | Kept-patch std | "
        "Kept-patch SSIM | Run 3 SSIM (whole) | Verdict | Failure note |"
    )
    lines.append("|------|----------|-------------------|----------------|-----------------|---------------------|---------|--------------|")
    for r in results:
        if r.get("error"):
            lines.append(
                f"| {r['room_id']} | ERR | — | — | — | — | ERROR: {r['error']} | — |"
            )
            continue
        lines.append(
            f"| {r['room_id']} "
            f"| {r.get('erased_area_pct', '?')}% "
            f"| {r.get('kept_patch_coords', '?')} "
            f"| {r.get('kept_patch_std', '?')} "
            f"| {r.get('kept_patch_ssim', '?')} "
            f"| {r.get('run3_ssim_unmasked', '?')} "
            f"| {r.get('verdict', '?')} "
            f"| {r.get('failure_note', '') or '—'} |"
        )
    lines.append("")

    # 3. Per-prompt SAM 3 hits
    lines.append("## 3. Per-Prompt SAM 3 Hits\n")
    lines.append("| Prompt | " + " | ".join(r["room_id"] for r in results if not r.get("error")) + " |")
    lines.append("|--------|" + "|".join("--------" for r in results if not r.get("error")) + "|")
    ok_results = [r for r in results if not r.get("error")]
    for prompt in ARCH_PROMPTS:
        cells = []
        for r in ok_results:
            info = r.get("per_prompt_hits", {}).get(prompt, {})
            h = info.get("hits", 0)
            cov = info.get("total_coverage_pct", 0.0)
            cells.append(f"{h} hit(s), {cov:.1f}%" if h > 0 else "0 hits")
        lines.append(f"| {prompt} | " + " | ".join(cells) + " |")
    lines.append("")

    # 4. Triptych references
    lines.append("## 4. Triptych References\n")
    for r in results:
        if not r.get("error") and r.get("triptych_path"):
            lines.append(f"- **{r['room_id']}**: `{r['triptych_path']}`")
    lines.append("")

    # 5. Comparison to Run 3
    lines.append("## 5. Comparison to Run 3\n")
    lines.append(
        "> Note: kept-patch SSIM (this probe) measures a 200x200 architectural patch "
        "inside the kept region only. Run 3 ssim_unmasked covers all pixels outside the "
        "furniture mask — a different denominator. Direction is informative; absolute values "
        "are not directly comparable.\n"
    )
    for r in results:
        if r.get("error"):
            lines.append(f"- **{r['room_id']}**: ERROR — {r['error']}")
            continue
        probe_ssim = r.get("kept_patch_ssim")
        run3_ssim = r.get("run3_ssim_unmasked")
        if probe_ssim is not None and run3_ssim is not None:
            delta = probe_ssim - run3_ssim
            direction = "higher" if delta > 0 else "lower"
            lines.append(
                f"- **{r['room_id']}**: probe kept-patch SSIM={probe_ssim:.4f} vs "
                f"Run 3 whole-unmasked SSIM={run3_ssim:.4f} ({direction} by {abs(delta):.4f}). "
                f"Verdict: {r.get('verdict', '?')}. {r.get('failure_note', '')}"
            )
        else:
            lines.append(
                f"- **{r['room_id']}**: probe_ssim={probe_ssim} run3_ssim={run3_ssim}. "
                f"Verdict: {r.get('verdict', '?')}."
            )
    lines.append("")

    # 6. Recommendation
    lines.append("## 6. Recommendation\n")
    ok = [r for r in results if not r.get("error")]
    coherent = [r for r in ok if r.get("verdict", "").startswith("coherent")]
    partial = [r for r in ok if r.get("verdict", "").startswith("partial")]
    broken = [r for r in ok if not r.get("verdict", "").startswith(("coherent", "partial"))]

    n_coherent = len(coherent)

    if n_coherent == 3:
        rec = (
            "**A — All 3 coherent.** Pivot to inverted-mask. Rerun full 15-room bench "
            "under inverted-mask + Bria. Estimated cost ~$1.50."
        )
    elif n_coherent in (1, 2):
        failed_ids = [r["room_id"] for r in broken + partial]
        reasons = "; ".join(
            f"{r['room_id']}: {r.get('failure_note') or r.get('verdict')}"
            for r in broken + partial
        )
        rec = (
            f"**B — {n_coherent}/3 coherent.** Hybrid decision. Inverted-mask works for "
            f"{[r['room_id'] for r in coherent]}; failed on {failed_ids} because {reasons}. "
            "Recommend testing on 5 more diverse rooms before committing pipeline change."
        )
    else:
        rec = (
            "**C — None coherent.** Inverted-mask does not solve the failure modes. "
            "Next probe: FLUX-Fill on the same 3 rooms (positive-mask furniture removal "
            "with diffusion) at ~$0.30 to test whether the issue is inpainter quality "
            "vs masking strategy."
        )

    lines.append(rec)
    lines.append("")
    lines.append(f"**Total cost: ${total_cost:.4f}**\n")

    summary_path.write_text("\n".join(lines))
    print(f"\nSummary written: {summary_path}")


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> int:
    for d in (PROBE_DIR, OUTPUTS_DIR, MASKS_DIR, TRIPTYCH_DIR):
        d.mkdir(parents=True, exist_ok=True)

    manifest = json.loads((BENCH / "manifest.json").read_text())
    all_rooms: list[dict] = manifest["rooms"]
    rooms = [r for r in all_rooms if r["id"] in TARGET_ROOMS]

    if len(rooms) != len(TARGET_ROOMS):
        found = [r["id"] for r in rooms]
        missing = [x for x in TARGET_ROOMS if x not in found]
        print(f"ERROR: rooms not found in manifest: {missing}")
        return 1

    # Cost projection
    per_room_cost = len(ARCH_PROMPTS) * COST_SAM3 + COST_BRIA
    projected = per_room_cost * len(rooms)
    print(
        f"Inverted-mask probe: {len(rooms)} rooms\n"
        f"Cost projection: ${per_room_cost:.3f}/room × {len(rooms)} = ${projected:.3f}\n"
        f"Hard cap: ${HARD_COST_CAP:.2f}  Soft cap: ${SOFT_COST_CAP:.2f}"
    )
    if projected > SOFT_COST_CAP:
        print(f"WARN: projected ${projected:.3f} exceeds soft cap ${SOFT_COST_CAP}")
    if projected > HARD_COST_CAP:
        print(f"BLOCKER: projected ${projected:.3f} exceeds hard cap ${HARD_COST_CAP}")
        return 2

    # Shared running cost tracker (mutable list to allow mutation in threads)
    running_cost: list[float] = [0.0]

    results: list[dict] = []
    # Process rooms sequentially to enable running cost gate between rooms.
    # (Parallel would make the hard stop less responsive.)
    for room in rooms:
        result = process_room(room, running_cost)
        results.append(result)
        if running_cost[0] > HARD_COST_CAP:
            print(f"HARD CAP REACHED (${running_cost[0]:.3f}) — stopping after {room['id']}")
            break

    # Cost log
    total_cost = running_cost[0]
    cost_log = {
        "total_cost_usd": round(total_cost, 4),
        "hard_cap_usd": HARD_COST_CAP,
        "soft_cap_usd": SOFT_COST_CAP,
        "projected_cost_usd": round(projected, 4),
        "rooms_processed": len(results),
        "per_room": [
            {
                "room_id": r.get("room_id"),
                "cost_usd": r.get("cost_usd"),
                "erased_area_pct": r.get("erased_area_pct"),
                "kept_patch_ssim": r.get("kept_patch_ssim"),
                "verdict": r.get("verdict"),
                "error": r.get("error"),
            }
            for r in results
        ],
    }
    (PROBE_DIR / "cost-log.json").write_text(json.dumps(cost_log, indent=2))
    print(f"\nCost log: {PROBE_DIR / 'cost-log.json'}")
    print(f"Total cost: ${total_cost:.4f}")

    # Summary
    write_summary(results, total_cost)

    # Print compact verdict table
    print("\n┌── Verdict Table ──────────────────────────────────────────────┐")
    for r in results:
        if r.get("error"):
            print(f"│ {r['room_id']}: ERROR — {r['error'][:60]}")
        else:
            print(
                f"│ {r['room_id']}: erased={r.get('erased_area_pct')}% "
                f"ssim={r.get('kept_patch_ssim')} "
                f"run3_ssim={r.get('run3_ssim_unmasked')} "
                f"verdict={r.get('verdict')}"
            )
    print("└──────────────────────────────────────────────────────────────┘")

    return 0


if __name__ == "__main__":
    sys.exit(main())
