#!/usr/bin/env python3
"""Cova V3 Phase A bench runner.

Runs the strict-inpaint empty-room pipeline against 16 bench rooms and
generates an HTML gallery at /tmp/render-v3-phase-a/gallery.html for
user review.

  python3 scripts/run_phase_a_bench.py
  python3 scripts/run_phase_a_bench.py --rooms room-01 target_room
  python3 scripts/run_phase_a_bench.py --cost-cap 30 --max-retries 3

Stops immediately if cumulative cost exceeds --cost-cap (default $30).
Does NOT proceed to Phase B — gallery + exit.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Any

import cv2  # type: ignore
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from modal_pipeline.empty_room_v3 import (  # noqa: E402
    PipelineResult,
    create_detection_overlay,
    run_phase_a,
)

logger = logging.getLogger("phase-a-bench")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

BENCH_DIR = Path("/tmp/render-v3-phase-a")
ROOMS_DIR = ROOT / "bench" / "rooms"
TARGET_ROOM = ROOT / "benchmarks" / "target_room.jpg"


def discover_rooms() -> list[Path]:
    """All 15 bench rooms + the DAKSH target room = 16."""
    rooms: list[Path] = []
    if TARGET_ROOM.exists():
        rooms.append(TARGET_ROOM)
    if ROOMS_DIR.exists():
        for p in sorted(ROOMS_DIR.glob("room-*.webp")):
            rooms.append(p)
    return rooms


def room_id(p: Path) -> str:
    return p.stem


def save_intermediates(result: PipelineResult, out_dir: Path, stem: str, input_bgr: Any) -> dict[str, str]:
    """Write overlay, masks, final. Returns paths relative to gallery root."""
    out_dir.mkdir(parents=True, exist_ok=True)
    inter_dir = out_dir / "intermediates"
    inter_dir.mkdir(parents=True, exist_ok=True)
    out_outputs = out_dir / "outputs"
    out_outputs.mkdir(parents=True, exist_ok=True)
    inputs_dir = out_dir / "inputs"
    inputs_dir.mkdir(parents=True, exist_ok=True)

    # Write a copy of input at working resolution so gallery <img> works
    # regardless of heic/webp support in browser
    input_path = inputs_dir / f"{stem}.jpg"
    cv2.imwrite(str(input_path), input_bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])

    # Final output
    final_path = out_outputs / f"{stem}_empty.jpg"
    cv2.imwrite(str(final_path), result.final_bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])

    # Overlay at working resolution
    working_bgr = cv2.cvtColor(result.detection.architecture_masks.get("wall", np.zeros((10,10))), cv2.COLOR_GRAY2BGR) if False else None
    # Recompute overlay using a working-size snapshot
    # We rebuild the overlay on the working composite so sizes match
    working_input_path = inter_dir / f"{stem}_working_input.jpg"
    # result carries detection but not working-input. Reconstruct via protect mask shape.
    H, W = result.protect_mask.shape[:2]
    # We'll re-read from the working-dim input later via result.working_composite_bgr's shape as size guide
    # For the overlay, we need an input_bgr sized to (H, W). Resize the original.
    if input_bgr.shape[:2] != (H, W):
        working_input = cv2.resize(input_bgr, (W, H), interpolation=cv2.INTER_AREA)
    else:
        working_input = input_bgr
    cv2.imwrite(str(working_input_path), working_input, [cv2.IMWRITE_JPEG_QUALITY, 92])

    overlay = create_detection_overlay(working_input, result.remove_mask, result.protect_mask)
    overlay_path = inter_dir / f"{stem}_overlay.jpg"
    cv2.imwrite(str(overlay_path), overlay, [cv2.IMWRITE_JPEG_QUALITY, 92])

    # Masks
    protect_path = inter_dir / f"{stem}_protect_mask.png"
    cv2.imwrite(str(protect_path), result.protect_mask)
    remove_path = inter_dir / f"{stem}_remove_mask.png"
    cv2.imwrite(str(remove_path), result.remove_mask)
    feather_path = inter_dir / f"{stem}_feather.png"
    cv2.imwrite(str(feather_path), (result.feather_alpha * 255).astype(np.uint8))

    return {
        "input": f"inputs/{stem}.jpg",
        "overlay": f"intermediates/{stem}_overlay.jpg",
        "empty": f"outputs/{stem}_empty.jpg",
        "protect_mask": f"intermediates/{stem}_protect_mask.png",
        "remove_mask": f"intermediates/{stem}_remove_mask.png",
        "feather": f"intermediates/{stem}_feather.png",
    }


def render_html(results: list[dict], out_path: Path) -> None:
    total = len(results)
    passed = len([r for r in results if r["status"] == "PASS"])
    soft_passed = len([r for r in results if r["status"] == "SOFT_PASS"])
    failed = total - passed - soft_passed
    total_attempts = sum(r.get("attempts", 0) for r in results)
    total_cost = sum(r.get("cost_usd", 0.0) for r in results)

    rows: list[str] = []
    for r in results:
        if r["status"] in ("PASS", "SOFT_PASS"):
            pass_cls = "status-pass" if r["status"] == "PASS" else "status-soft"
            pass_label = r["status"]
            row = f"""
<div class="room">
  <div class="room-header">
    <div class="room-id">{r["room_id"]}</div>
    <div class="{pass_cls}">{pass_label}</div>
  </div>
  <div class="row">
    <div class="cell">
      <div class="cell-label">Input</div>
      <img src="{r["paths"]["input"]}">
    </div>
    <div class="cell">
      <div class="cell-label">Detection (red = remove, green = protect)</div>
      <img src="{r["paths"]["overlay"]}">
    </div>
    <div class="cell">
      <div class="cell-label">Empty Output</div>
      <img src="{r["paths"]["empty"]}">
    </div>
  </div>
  <div class="meta">
    <div class="meta-item"><span class="meta-key">Attempts:</span><span class="meta-val">{r.get("attempts", 0)}</span></div>
    <div class="meta-item"><span class="meta-key">ΔE outside:</span><span class="meta-val">{r.get("qa_delta_e", 0):.4f}</span></div>
    <div class="meta-item"><span class="meta-key">Residual furniture:</span><span class="meta-val">{r.get("residual_count", 0)} ({r.get("residual_area_pct", 0):.2f}%)</span></div>
    <div class="meta-item"><span class="meta-key">OCR preserved:</span><span class="meta-val">{r.get("ocr_preserved", True)}</span></div>
    <div class="meta-item"><span class="meta-key">Arch IoU:</span><span class="meta-val">{r.get("architecture_iou", 1.0):.3f}</span></div>
    <div class="meta-item"><span class="meta-key">Mask SSIM:</span><span class="meta-val">{r.get("mask_region_ssim", 1.0):.3f}</span></div>
    <div class="meta-item"><span class="meta-key">Cost:</span><span class="meta-val">${r.get("cost_usd", 0):.4f}</span></div>
    <div class="meta-item"><span class="meta-key">Duration:</span><span class="meta-val">{r.get("duration_s", 0):.1f}s</span></div>
    <div class="meta-item"><span class="meta-key">Short-circuit:</span><span class="meta-val">{r.get("short_circuited", False)}</span></div>
  </div>
  <div class="meta small">
    <div class="meta-item"><span class="meta-key">Failure modes:</span><span class="meta-val">{", ".join(r.get("failure_modes", [])) or "-"}</span></div>
  </div>
</div>"""
        else:
            err = r.get("error", "?")
            row = f"""
<div class="room">
  <div class="room-header">
    <div class="room-id">{r["room_id"]}</div>
    <div class="status-fail">FAIL</div>
  </div>
  <div class="row">
    <div class="cell">
      <div class="cell-label">Input</div>
      <img src="{r.get("paths", {}).get("input", "")}">
    </div>
    <div class="cell" style="grid-column: span 2;">
      <div class="cell-label">Error</div>
      <pre style="color:#ff9a9a; white-space: pre-wrap; font-size: 12px;">{err[:1200]}</pre>
    </div>
  </div>
</div>"""
        rows.append(row)

    html = f"""<!DOCTYPE html>
<html>
<head>
<title>Cova V3 Phase A — Empty Room Verification Gallery</title>
<style>
  body {{ font-family: -apple-system, sans-serif; margin: 0; padding: 24px; background: #0a0a0a; color: #e5e5e5; }}
  h1 {{ font-weight: 300; letter-spacing: -0.5px; }}
  .summary {{ display: flex; gap: 32px; padding: 24px; background: #141414; border-radius: 12px; margin-bottom: 32px; flex-wrap: wrap; }}
  .stat {{ display: flex; flex-direction: column; }}
  .stat-value {{ font-size: 32px; font-weight: 300; }}
  .stat-label {{ font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; }}
  .room {{ background: #141414; border-radius: 12px; padding: 20px; margin-bottom: 24px; }}
  .room-header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }}
  .room-id {{ font-size: 18px; font-weight: 500; }}
  .status-pass {{ background: #1f4d2e; color: #4ade80; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; }}
  .status-soft {{ background: #3d3a1f; color: #f9d071; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; }}
  .status-fail {{ background: #4d1f1f; color: #ff6b6b; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; }}
  .row {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }}
  .cell {{ display: flex; flex-direction: column; }}
  .cell img {{ width: 100%; border-radius: 8px; }}
  .cell-label {{ font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }}
  .meta {{ font-size: 12px; color: #888; margin-top: 12px; display: flex; gap: 20px; flex-wrap: wrap; }}
  .meta.small {{ font-size: 11px; color: #666; }}
  .meta-item {{ display: flex; gap: 6px; }}
  .meta-key {{ color: #666; }}
  .meta-val {{ color: #ccc; font-family: 'SF Mono', Menlo, monospace; }}
</style>
</head>
<body>
<h1>Cova V3 Phase A — Empty Room Verification</h1>
<div class="summary">
  <div class="stat"><div class="stat-value">{total}</div><div class="stat-label">Total rooms</div></div>
  <div class="stat"><div class="stat-value">{passed}</div><div class="stat-label">Passed</div></div>
  <div class="stat"><div class="stat-value">{soft_passed}</div><div class="stat-label">Soft-pass</div></div>
  <div class="stat"><div class="stat-value">{failed}</div><div class="stat-label">Failed</div></div>
  <div class="stat"><div class="stat-value">{total_attempts}</div><div class="stat-label">Total attempts</div></div>
  <div class="stat"><div class="stat-value">${total_cost:.2f}</div><div class="stat-label">Total cost</div></div>
</div>
{"".join(rows)}
</body>
</html>"""
    out_path.write_text(html)


def process_one(
    room_path: Path,
    bench_dir: Path,
    max_retries: int,
    skip_verify: bool,
) -> dict[str, Any]:
    """Run Phase A on a single room; returns result dict ready for gallery."""
    stem = room_id(room_path)
    logger.info("=" * 70)
    logger.info("ROOM: %s", stem)

    try:
        pipeline_res = run_phase_a(
            str(room_path),
            tmp_dir=bench_dir,
            run_verify=not skip_verify,
            max_retries=max_retries,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Pipeline crash for %s", stem)
        # Save the input so the gallery has something to show
        try:
            input_bgr = cv2.imread(str(room_path), cv2.IMREAD_COLOR)
            if input_bgr is None:
                from PIL import Image, ImageOps
                pil = ImageOps.exif_transpose(Image.open(str(room_path))).convert("RGB")
                input_bgr = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
            inputs_dir = bench_dir / "inputs"
            inputs_dir.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(inputs_dir / f"{stem}.jpg"), input_bgr, [cv2.IMWRITE_JPEG_QUALITY, 85])
            paths = {"input": f"inputs/{stem}.jpg"}
        except Exception:  # noqa: BLE001
            paths = {}
        return {
            "room_id": stem,
            "status": "FAIL",
            "error": f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}",
            "paths": paths,
        }

    # Save intermediates
    input_bgr = cv2.imread(str(room_path), cv2.IMREAD_COLOR)
    if input_bgr is None:
        from PIL import Image, ImageOps
        pil = ImageOps.exif_transpose(Image.open(str(room_path))).convert("RGB")
        input_bgr = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    paths = save_intermediates(pipeline_res, bench_dir, stem, input_bgr)

    v = pipeline_res.verify
    if v.passed:
        status = "PASS"
    elif pipeline_res.short_circuited:
        status = "PASS"
    elif v.residual_furniture_count == 0 and v.architecture_iou >= 0.92 and v.ocr_preserved:
        # Close enough — flag as soft-pass for review
        status = "SOFT_PASS"
    else:
        status = "FAIL"

    return {
        "room_id": stem,
        "status": status,
        "paths": paths,
        "attempts": pipeline_res.attempts,
        "qa_delta_e": pipeline_res.qa_outside_delta_e,
        "residual_count": v.residual_furniture_count,
        "residual_area_pct": v.residual_furniture_area_pct,
        "ocr_preserved": v.ocr_preserved,
        "ocr_missing": v.ocr_missing,
        "architecture_iou": v.architecture_iou,
        "mask_region_ssim": v.mask_region_ssim,
        "failure_modes": v.failure_modes,
        "cost_usd": pipeline_res.cost_usd,
        "duration_s": pipeline_res.duration_s,
        "short_circuited": pipeline_res.short_circuited,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cost-cap", type=float, default=30.0)
    parser.add_argument("--max-retries", type=int, default=3)
    parser.add_argument("--rooms", nargs="*", default=None,
                        help="Optional subset of room stems to process")
    parser.add_argument("--skip-verify", action="store_true",
                        help="Skip the verify_output call (cheaper dry-run)")
    parser.add_argument("--out-dir", default=str(BENCH_DIR))
    args = parser.parse_args()

    bench_dir = Path(args.out_dir)
    bench_dir.mkdir(parents=True, exist_ok=True)

    all_rooms = discover_rooms()
    if args.rooms:
        wanted = set(args.rooms)
        rooms = [p for p in all_rooms if p.stem in wanted or p.name in wanted]
    else:
        rooms = all_rooms
    logger.info("Processing %d rooms; cost cap $%.2f", len(rooms), args.cost_cap)

    t0 = time.time()
    running_cost = 0.0
    results: list[dict] = []

    for i, room_path in enumerate(rooms):
        logger.info("[%d/%d] %s — running_cost=$%.2f", i + 1, len(rooms), room_path.name, running_cost)
        if running_cost > args.cost_cap:
            logger.error("COST CAP EXCEEDED: $%.2f > $%.2f — halting", running_cost, args.cost_cap)
            results.append({
                "room_id": room_id(room_path),
                "status": "FAIL",
                "error": f"Cost cap ${args.cost_cap} exceeded",
                "paths": {},
            })
            break

        res = process_one(room_path, bench_dir, args.max_retries, args.skip_verify)
        results.append(res)
        running_cost += float(res.get("cost_usd", 0.0))

        # Write incremental gallery so user can see progress
        render_html(results, bench_dir / "gallery.html")
        (bench_dir / "results.json").write_text(json.dumps(results, indent=2, default=str))
        (bench_dir / "cost-log.json").write_text(json.dumps({
            "total_cost_usd": round(running_cost, 4),
            "rooms_processed": i + 1,
            "cost_cap": args.cost_cap,
        }, indent=2))

    total_time = time.time() - t0
    total_passed = len([r for r in results if r["status"] == "PASS"])
    total_soft = len([r for r in results if r["status"] == "SOFT_PASS"])
    total_failed = len([r for r in results if r["status"] == "FAIL"])

    logger.info("=" * 70)
    logger.info("PHASE A SUMMARY")
    logger.info("  Rooms: %d", len(results))
    logger.info("  PASS: %d", total_passed)
    logger.info("  SOFT_PASS: %d", total_soft)
    logger.info("  FAIL: %d", total_failed)
    logger.info("  Total cost: $%.2f", running_cost)
    logger.info("  Total time: %.1fs", total_time)
    logger.info("  Gallery: file://%s/gallery.html", bench_dir)

    render_html(results, bench_dir / "gallery.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
