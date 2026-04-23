#!/usr/bin/env python3
"""Phase A diagnostic — reproduces the target_room failure stage-by-stage.

Writes everything to /tmp/diag-phase-a/:

  input.jpg                                 — EXIF-transposed working input (1024)
  01_remove_mask_BINARY.png                 — exact mask passed to inpainter (pre-feather)
  02_protect_mask.png                       — architecture+wall-items+OCR protect
  03_feather_alpha.png                      — feathered alpha (only used at composite)
  04_padded_crop_input.png                  — 1024×1024 crop sent to inpainter
  05_padded_crop_mask_BINARY.png            — 1024×1024 binary mask sent to inpainter
  06_lama_raw_1024.png                      — raw LaMa output at 1024 (pre-composite)
  07_flux_fill_raw_1024.png                 — raw FLUX Fill output at 1024 (pre-composite)
  08_lama_pasted_back.png                   — LaMa unresized + pasted back (no composite)
  09_flux_pasted_back.png                   — FLUX Fill unresized + pasted back (no composite)
  10_lama_composite.png                     — LaMa after feather alpha composite
  11_flux_composite.png                     — FLUX Fill after feather alpha composite
  12_sam3_residual_@0.15_lama.png           — SAM-3 at threshold 0.15 on LaMa output
  12_sam3_residual_@0.30_lama.png           — SAM-3 at threshold 0.30 on LaMa output
  13_sam3_residual_@0.15_flux.png           — SAM-3 at threshold 0.15 on FLUX output
  13_sam3_residual_@0.30_flux.png           — SAM-3 at threshold 0.30 on FLUX output
  diag_report.json                          — all numeric metrics (SSIM, residual counts)

Prints a summary table comparing LaMa vs FLUX Fill and what SAM-3 finds at
lower thresholds.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import sys
import time
from pathlib import Path

import cv2  # type: ignore
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from modal_pipeline.empty_room_v3 import (  # noqa: E402
    _crop_and_resize_to_1024,
    _unresize_from_pad,
    build_protect_mask,
    build_remove_mask,
    call_flux_fill,
    call_lama,
    call_sam3,
    composite_inpaint,
    create_detection_overlay,
    download_mask,
    feather_mask,
    preprocess,
    run_detection,
    upload_image_to_fal,
    _load_fal_key,
)

logger = logging.getLogger("diag")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

OUT_DIR = Path("/tmp/diag-phase-a")
TARGET = ROOT / "benchmarks" / "target_room.jpg"

# Verify-style prompts but we'll test across thresholds
VERIFY_PROMPTS = (
    "sofa", "couch", "armchair", "chair", "bed", "dresser",
    "table lamp", "floor lamp", "coffee table", "side table",
    "nightstand", "desk", "rug", "plant", "pillow", "clutter",
    "backpack", "bag", "clothing", "box",
)


def mask_ssim(input_bgr: np.ndarray, output_bgr: np.ndarray, binary_mask: np.ndarray) -> float:
    """Compute SSIM *inside the remove mask* between input and output.

    If output truly replaced the furniture, SSIM should be low (< 0.5).
    If output is basically a blended ghost, SSIM will be high (> 0.7).

    Uses scikit-image's SSIM on the masked grayscale region.
    """
    from skimage.metrics import structural_similarity as ssim

    in_gray = cv2.cvtColor(input_bgr, cv2.COLOR_BGR2GRAY)
    out_gray = cv2.cvtColor(output_bgr, cv2.COLOR_BGR2GRAY)

    mask_bool = binary_mask > 0
    if not mask_bool.any():
        return 1.0

    # Full-image SSIM map, then average within mask region
    full_ssim, full_map = ssim(in_gray, out_gray, data_range=255, full=True)
    return float(full_map[mask_bool].mean())


def sam3_residual_mask(
    image_url: str,
    threshold: float,
    shape: tuple[int, int],
    protect_mask: np.ndarray | None = None,
) -> tuple[np.ndarray, int, list[str], float]:
    """Run SAM-3 on all verify prompts at a given threshold, return unioned
    mask (uint8), big-component count, and which prompts triggered."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    H, W = shape
    union = np.zeros((H, W), dtype=np.uint8)
    triggered: list[str] = []

    with ThreadPoolExecutor(max_workers=16) as ex:
        futs = {ex.submit(call_sam3, image_url, p, threshold): p for p in VERIFY_PROMPTS}
        url_pool: list[tuple[str, str]] = []
        for fut in as_completed(futs):
            p = futs[fut]
            try:
                res = fut.result()
            except Exception as exc:  # noqa: BLE001
                logger.warning("sam3 verify %s failed: %s", p, exc)
                continue
            if res:
                triggered.append(f"{p}:{len(res)}")
                for (url, score) in res:
                    url_pool.append((p, url))

    if url_pool:
        with ThreadPoolExecutor(max_workers=12) as ex:
            dl_futs = {ex.submit(download_mask, u, (H, W)): p for (p, u) in url_pool}
            for fut in as_completed(dl_futs):
                try:
                    m = fut.result()
                    union = np.maximum(union, m)
                except Exception:  # noqa: BLE001
                    pass

    # Subtract protect mask so we don't double-count architecture
    if protect_mask is not None:
        union = np.where(protect_mask > 0, 0, union).astype(np.uint8)

    # Count big components
    num, labels = cv2.connectedComponents(union)
    big = 0
    area_frac = 0.0
    for i in range(1, num):
        frac = float((labels == i).sum()) / float(H * W)
        if frac >= 0.005:
            big += 1
            area_frac += frac

    return union, big, triggered, area_frac


def main() -> int:
    _load_fal_key()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    report: dict = {}

    # ---- Stage 1: preprocess + detection ---------------------------------
    logger.info("=" * 70)
    logger.info("STAGE 1 — preprocess + detection")
    pre = preprocess(str(TARGET))
    H, W = pre.working_bgr.shape[:2]
    cv2.imwrite(str(OUT_DIR / "input.jpg"), pre.working_bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])

    t_det_0 = time.time()
    det, fal_input_url = run_detection(pre.working_rgb)
    t_det = time.time() - t_det_0
    report["detection"] = {
        "seconds": round(t_det, 1),
        "fal_input_url": fal_input_url,
        "m2f_classes": sorted(det.architecture_masks.keys()),
        "m2f_areas_pct": det.architecture_areas_pct,
        "n_protect_wall_items": len(det.protect_wall_items),
        "n_remove_furniture_masks": len(det.remove_furniture),
        "ocr_regions": [{"label": r.label, "bbox": [r.x, r.y, r.w, r.h]} for r in det.ocr_regions],
        "cost_usd": det.cost_usd,
    }

    # ---- Stage 2: masks ---------------------------------------------------
    logger.info("STAGE 2 — mask arbitration")
    protect_mask = build_protect_mask(det, (H, W))
    remove_mask = build_remove_mask(det, protect_mask, (H, W))
    feather = feather_mask(remove_mask, sigma=6.0)

    # Verify the mask going to inpainter IS binary
    unique_vals = np.unique(remove_mask)
    logger.info("remove_mask unique values (should be {0,255}): %s", unique_vals.tolist())
    report["mask"] = {
        "remove_mask_unique_values": unique_vals.tolist(),
        "remove_mask_is_binary": bool(set(unique_vals.tolist()).issubset({0, 255})),
        "remove_mask_coverage_pct": round(float((remove_mask > 0).sum() / remove_mask.size * 100), 2),
        "protect_mask_coverage_pct": round(float((protect_mask > 0).sum() / protect_mask.size * 100), 2),
        "feather_alpha_unique_count": int(np.unique(feather).size),
        "feather_min": float(feather.min()),
        "feather_max": float(feather.max()),
    }

    cv2.imwrite(str(OUT_DIR / "01_remove_mask_BINARY.png"), remove_mask)
    cv2.imwrite(str(OUT_DIR / "02_protect_mask.png"), protect_mask)
    cv2.imwrite(str(OUT_DIR / "03_feather_alpha.png"), (feather * 255).astype(np.uint8))
    overlay = create_detection_overlay(pre.working_bgr, remove_mask, protect_mask)
    cv2.imwrite(str(OUT_DIR / "00_overlay.jpg"), overlay, [cv2.IMWRITE_JPEG_QUALITY, 92])

    # ---- Stage 3: crop + prepare the actual inpainter payload ------------
    logger.info("STAGE 3 — crop and resize to 1024x1024")
    padded_crop_bgr, padded_crop_mask, meta = _crop_and_resize_to_1024(pre.working_bgr, remove_mask)
    mask_unique = np.unique(padded_crop_mask)
    logger.info(
        "padded_crop_mask unique (should be {0,255}): %s  shape=%s",
        mask_unique.tolist(), padded_crop_mask.shape,
    )
    report["padded_crop"] = {
        "shape": list(padded_crop_bgr.shape),
        "mask_unique": mask_unique.tolist(),
        "mask_is_binary": bool(set(mask_unique.tolist()).issubset({0, 255})),
        "meta": {
            "y1": meta.y1, "y2": meta.y2, "x1": meta.x1, "x2": meta.x2,
            "pad_top": meta.pad_top, "pad_left": meta.pad_left,
            "scale": meta.scale, "orig_crop_hw": [meta.orig_crop_h, meta.orig_crop_w],
        },
    }
    cv2.imwrite(str(OUT_DIR / "04_padded_crop_input.png"), padded_crop_bgr)
    cv2.imwrite(str(OUT_DIR / "05_padded_crop_mask_BINARY.png"), padded_crop_mask)

    # Upload crop + mask (shared by both inpainters)
    img_url = upload_image_to_fal(padded_crop_bgr)
    mask_url = upload_image_to_fal(padded_crop_mask)
    logger.info("fal img_url: %s", img_url[:80])
    logger.info("fal mask_url: %s", mask_url[:80])

    # ---- Stage 4: call both inpainters ----------------------------------
    logger.info("STAGE 4a — calling LaMa")
    t0 = time.time()
    lama_url = call_lama(img_url, mask_url)
    lama_t = time.time() - t0
    logger.info("STAGE 4b — calling FLUX Fill")
    t0 = time.time()
    flux_url = call_flux_fill(img_url, mask_url, steps=50, guidance=20.0)
    flux_t = time.time() - t0

    # Download raw 1024x1024 outputs
    import requests
    from PIL import Image as PILImage

    def _fetch_as_bgr(url: str) -> np.ndarray:
        raw = requests.get(url, timeout=120).content
        pil = PILImage.open(__import__("io").BytesIO(raw)).convert("RGB")
        arr = np.array(pil)
        if arr.shape[:2] != (1024, 1024):
            arr = cv2.resize(arr, (1024, 1024), interpolation=cv2.INTER_LANCZOS4)
        return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)

    lama_raw_1024 = _fetch_as_bgr(lama_url)
    flux_raw_1024 = _fetch_as_bgr(flux_url)
    cv2.imwrite(str(OUT_DIR / "06_lama_raw_1024.png"), lama_raw_1024)
    cv2.imwrite(str(OUT_DIR / "07_flux_fill_raw_1024.png"), flux_raw_1024)
    report["inpaint"] = {
        "lama_seconds": round(lama_t, 1),
        "flux_seconds": round(flux_t, 1),
        "lama_url": lama_url,
        "flux_url": flux_url,
    }

    # ---- Stage 5: paste back + composite ---------------------------------
    logger.info("STAGE 5 — paste back + composite")

    def _paste_back(raw_1024: np.ndarray) -> np.ndarray:
        out_crop = _unresize_from_pad(raw_1024, meta)
        full = pre.working_bgr.copy()
        full[meta.y1:meta.y2, meta.x1:meta.x2] = out_crop
        return full

    lama_pasted = _paste_back(lama_raw_1024)
    flux_pasted = _paste_back(flux_raw_1024)
    cv2.imwrite(str(OUT_DIR / "08_lama_pasted_back.png"), lama_pasted)
    cv2.imwrite(str(OUT_DIR / "09_flux_pasted_back.png"), flux_pasted)

    lama_composite = composite_inpaint(pre.working_bgr, lama_pasted, feather)
    flux_composite = composite_inpaint(pre.working_bgr, flux_pasted, feather)
    cv2.imwrite(str(OUT_DIR / "10_lama_composite.png"), lama_composite)
    cv2.imwrite(str(OUT_DIR / "11_flux_composite.png"), flux_composite)

    # ---- Stage 6: mask-region SSIM metrics -------------------------------
    logger.info("STAGE 6 — mask-region SSIM")

    # Against pasted-back (no composite) to see what the inpainter delivered
    lama_pasted_mssim = mask_ssim(pre.working_bgr, lama_pasted, remove_mask)
    flux_pasted_mssim = mask_ssim(pre.working_bgr, flux_pasted, remove_mask)
    # Against composite (with feather) to see what the user sees
    lama_comp_mssim = mask_ssim(pre.working_bgr, lama_composite, remove_mask)
    flux_comp_mssim = mask_ssim(pre.working_bgr, flux_composite, remove_mask)
    # Raw 1024 vs padded crop input — truest "did inpainter replace content" measure
    lama_raw_mssim = mask_ssim(padded_crop_bgr, lama_raw_1024, padded_crop_mask)
    flux_raw_mssim = mask_ssim(padded_crop_bgr, flux_raw_1024, padded_crop_mask)

    report["mask_region_ssim"] = {
        "LaMa": {
            "raw_1024_vs_crop_input": round(lama_raw_mssim, 4),
            "pasted_back_vs_original": round(lama_pasted_mssim, 4),
            "composite_vs_original": round(lama_comp_mssim, 4),
        },
        "FLUX_Fill": {
            "raw_1024_vs_crop_input": round(flux_raw_mssim, 4),
            "pasted_back_vs_original": round(flux_pasted_mssim, 4),
            "composite_vs_original": round(flux_comp_mssim, 4),
        },
        "interpretation": "If composite_vs_original > 0.70, the pipeline didn't actually replace — it ghost-blended.",
    }

    # ---- Stage 7: SAM-3 at thresholds 0.15 and 0.30 ---------------------
    logger.info("STAGE 7 — rerun SAM-3 on outputs at 0.15 and 0.30")

    lama_url_up = upload_image_to_fal(lama_composite)
    flux_url_up = upload_image_to_fal(flux_composite)

    lama_015, lama_015_n, lama_015_trig, lama_015_area = sam3_residual_mask(
        lama_url_up, 0.15, (H, W), protect_mask
    )
    lama_030, lama_030_n, lama_030_trig, lama_030_area = sam3_residual_mask(
        lama_url_up, 0.30, (H, W), protect_mask
    )
    flux_015, flux_015_n, flux_015_trig, flux_015_area = sam3_residual_mask(
        flux_url_up, 0.15, (H, W), protect_mask
    )
    flux_030, flux_030_n, flux_030_trig, flux_030_area = sam3_residual_mask(
        flux_url_up, 0.30, (H, W), protect_mask
    )

    cv2.imwrite(str(OUT_DIR / "12_sam3_residual_@0.15_lama.png"), lama_015)
    cv2.imwrite(str(OUT_DIR / "12_sam3_residual_@0.30_lama.png"), lama_030)
    cv2.imwrite(str(OUT_DIR / "13_sam3_residual_@0.15_flux.png"), flux_015)
    cv2.imwrite(str(OUT_DIR / "13_sam3_residual_@0.30_flux.png"), flux_030)

    report["sam3_residual"] = {
        "LaMa": {
            "threshold_0.15": {"big_components": lama_015_n, "area_pct": round(lama_015_area * 100, 3), "triggered": lama_015_trig},
            "threshold_0.30": {"big_components": lama_030_n, "area_pct": round(lama_030_area * 100, 3), "triggered": lama_030_trig},
        },
        "FLUX_Fill": {
            "threshold_0.15": {"big_components": flux_015_n, "area_pct": round(flux_015_area * 100, 3), "triggered": flux_015_trig},
            "threshold_0.30": {"big_components": flux_030_n, "area_pct": round(flux_030_area * 100, 3), "triggered": flux_030_trig},
        },
    }

    # ---- Summary --------------------------------------------------------
    print()
    print("=" * 72)
    print("DIAGNOSTIC SUMMARY — target_room")
    print("=" * 72)
    print(f"Detection: {t_det:.1f}s  ({report['detection']['n_remove_furniture_masks']} remove masks, "
          f"{report['detection']['n_protect_wall_items']} protect-wall, OCR={[r.label for r in det.ocr_regions]})")
    print(f"Mask: remove={report['mask']['remove_mask_coverage_pct']}% protect={report['mask']['protect_mask_coverage_pct']}% "
          f"binary?={report['mask']['remove_mask_is_binary']}")
    print()
    print(f"{'':<18} {'raw vs crop-in':>16} {'pasted vs orig':>16} {'composite vs orig':>18}")
    print(f"{'LaMa SSIM':<18} {lama_raw_mssim:>16.4f} {lama_pasted_mssim:>16.4f} {lama_comp_mssim:>18.4f}")
    print(f"{'FLUX Fill SSIM':<18} {flux_raw_mssim:>16.4f} {flux_pasted_mssim:>16.4f} {flux_comp_mssim:>18.4f}")
    print(f"{'':<18} (low = replaced, high = ghost)")
    print()
    print(f"SAM-3 residual on COMPOSITE output:")
    print(f"  LaMa   @0.30: {lama_030_n} big components, {lama_030_area*100:.2f}% area  triggered: {lama_030_trig}")
    print(f"  LaMa   @0.15: {lama_015_n} big components, {lama_015_area*100:.2f}% area  triggered: {lama_015_trig}")
    print(f"  FLUX   @0.30: {flux_030_n} big components, {flux_030_area*100:.2f}% area  triggered: {flux_030_trig}")
    print(f"  FLUX   @0.15: {flux_015_n} big components, {flux_015_area*100:.2f}% area  triggered: {flux_015_trig}")
    print()

    (OUT_DIR / "diag_report.json").write_text(json.dumps(report, indent=2, default=str))
    print(f"Full report:  {OUT_DIR / 'diag_report.json'}")
    print(f"Artifacts:    {OUT_DIR}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
