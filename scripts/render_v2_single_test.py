#!/usr/bin/env python3
"""Render v2 single-test — Phase 3 gate before Phase 4.

Flow:
  1. Upload benchmarks/target_room.jpg to fal.
  2. Call cova-empty-room-v2 → verify_truly_empty loop runs.
  3. Call cova-redesign-v2 with COVAJAPANDI (warm-japandi, material-axis, low-tier).
  4. Download redesign url → save /tmp/v2-test-render.jpg.
  5. Save intermediates (empty, pass1, pass2) + metadata to /tmp/v2-test-stages/.

Invocation:
    python3 scripts/render_v2_single_test.py [--archetype COVAJAPANDI] [--room-type bedroom]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
ROOM_FILE = ROOT / "benchmarks" / "target_room.jpg"
OUT_FINAL = Path("/tmp/v2-test-render.jpg")
OUT_STAGES_DIR = Path("/tmp/v2-test-stages")

EMPTY_ROOM_V2_URL = (
    "https://cova-interior--cova-empty-room-v2-emptyroomv2-api.modal.run"
)
REDESIGN_V2_URL = (
    "https://cova-interior--cova-redesign-v2-redesignv2-api.modal.run"
)


def load_fal_key() -> None:
    if os.getenv("FAL_KEY"):
        return
    for p in (ROOT / "apps/web/.env.local", ROOT / ".env.local"):
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            line = line.strip()
            if line.startswith("FAL_KEY="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                os.environ["FAL_KEY"] = val
                return
    raise RuntimeError("FAL_KEY not found")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archetype", default="COVAJAPANDI")
    parser.add_argument("--room-type", default="bedroom")
    parser.add_argument("--budget", type=float, default=3000.0)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if not ROOM_FILE.exists():
        print(f"FATAL: {ROOM_FILE} not found", file=sys.stderr)
        return 1
    OUT_STAGES_DIR.mkdir(parents=True, exist_ok=True)

    load_fal_key()
    import fal_client  # noqa: E402

    t0 = time.perf_counter()

    print(f"[v2] uploading {ROOM_FILE.name} to fal…")
    fal_url = fal_client.upload_file(str(ROOM_FILE))
    print(f"[v2] fal url: {fal_url}")

    # --- cova-empty-room-v2 ----------------------------------------------
    print("[v2] calling cova-empty-room-v2…")
    t1 = time.perf_counter()
    er = requests.post(
        f"{EMPTY_ROOM_V2_URL}/v1/generate_empty_room",
        json={
            "image_url": fal_url,
            "enable_verify_loop": True,
            "enable_coverage_short_circuit": True,
        },
        timeout=600,
    )
    er_dt = time.perf_counter() - t1
    if er.status_code != 200:
        print(f"[v2] FAIL empty-room-v2 {er.status_code}:\n{er.text[:1500]}")
        return 1
    er_body = er.json()
    empty_url = er_body["empty_room_url"]
    print(
        f"[v2] empty-room-v2 200 in {er_dt:.1f}s  "
        f"inpainter={er_body['inpainter_used']}  "
        f"verdict={er_body['verify_final_verdict']}  "
        f"iters={len(er_body['verify_iterations'])}  "
        f"cov_raw={er_body['mask_coverage_raw_pct']:.1f}%  "
        f"ssim={er_body['architectural_patch_ssim']:.3f}  "
        f"cost=${er_body['cost_usd']:.4f}"
    )
    if er_body.get("coverage_short_circuited"):
        print("[v2]   NOTE: coverage short-circuited (input was already near-empty)")

    # Save empty stage
    try:
        empty_bytes = requests.get(empty_url, timeout=60).content
        (OUT_STAGES_DIR / "1_empty.jpg").write_bytes(empty_bytes)
    except Exception as exc:
        print(f"[v2]   warn: could not save empty stage: {exc}")

    # --- cova-redesign-v2 -------------------------------------------------
    print(f"[v2] calling cova-redesign-v2  archetype={args.archetype}  room={args.room_type}…")
    t2 = time.perf_counter()
    rd = requests.post(
        f"{REDESIGN_V2_URL}/v1/generate_redesign",
        json={
            "empty_room_url": empty_url,
            "archetype_key": args.archetype,
            "budget_max": args.budget,
            "room_type": args.room_type,
            "seed": args.seed,
            "enable_pass2": True,
            "enable_controlnet": True,
        },
        timeout=900,
    )
    rd_dt = time.perf_counter() - t2
    if rd.status_code != 200:
        print(f"[v2] FAIL redesign-v2 {rd.status_code}:\n{rd.text[:1500]}")
        return 1
    rd_body = rd.json()
    print(
        f"[v2] redesign-v2 200 in {rd_dt:.1f}s  "
        f"provider={rd_body['provider']}  "
        f"slug={rd_body['style_slug']}  axis={rd_body['density_axis']}  "
        f"tier={rd_body['density_tier']}  "
        f"trigger={rd_body['primary_trigger']}  "
        f"loras={len(rd_body['loras_used'])}  "
        f"cost=${rd_body['cost_usd']:.4f}  "
        f"inference_s={rd_body.get('lora_inference_time_s_pass1')}"
    )
    if rd_body.get("provider_fallback_reason"):
        print(f"[v2]   fallback_reason: {rd_body['provider_fallback_reason']}")

    # Save intermediate stages
    try:
        if rd_body.get("pass1_url"):
            b = requests.get(rd_body["pass1_url"], timeout=60).content
            (OUT_STAGES_DIR / "2_pass1_hero.jpg").write_bytes(b)
        if rd_body.get("pass2a_url"):
            b = requests.get(rd_body["pass2a_url"], timeout=60).content
            (OUT_STAGES_DIR / "3_pass2a_plant_sparse.jpg").write_bytes(b)
        if rd_body.get("pass2_url"):
            b = requests.get(rd_body["pass2_url"], timeout=60).content
            (OUT_STAGES_DIR / "3_pass2_decor.jpg").write_bytes(b)
    except Exception as exc:
        print(f"[v2]   warn: could not save intermediate stages: {exc}")

    # Download final render
    print(f"[v2] downloading final render to {OUT_FINAL}…")
    final_bytes = requests.get(rd_body["redesign_url"], timeout=120).content
    OUT_FINAL.write_bytes(final_bytes)
    print(f"[v2]   saved {len(final_bytes)} bytes → {OUT_FINAL}")

    # Save combined metadata
    total_cost = er_body["cost_usd"] + rd_body["cost_usd"]
    total_dt = time.perf_counter() - t0
    summary = {
        "source_file": str(ROOM_FILE),
        "archetype_key": args.archetype,
        "room_type": args.room_type,
        "seed": args.seed,
        "fal_upload_url": fal_url,
        "stages": {
            "original": str(ROOM_FILE),
            "empty": str(OUT_STAGES_DIR / "1_empty.jpg"),
            "pass1_hero": str(OUT_STAGES_DIR / "2_pass1_hero.jpg"),
            "pass2a_plant_sparse": str(OUT_STAGES_DIR / "3_pass2a_plant_sparse.jpg"),
            "pass2_decor": str(OUT_STAGES_DIR / "3_pass2_decor.jpg"),
            "final": str(OUT_FINAL),
        },
        "urls": {
            "fal_upload": fal_url,
            "empty": empty_url,
            "pass1": rd_body.get("pass1_url"),
            "pass2a": rd_body.get("pass2a_url"),
            "pass2": rd_body.get("pass2_url"),
            "final": rd_body["redesign_url"],
        },
        "empty_room": er_body,
        "redesign": rd_body,
        "wall_latency_total_s": round(total_dt, 1),
        "wall_latency_empty_s": round(er_dt, 1),
        "wall_latency_redesign_s": round(rd_dt, 1),
        "cost_total_usd": round(total_cost, 4),
        "cost_empty_usd": round(er_body["cost_usd"], 4),
        "cost_redesign_usd": round(rd_body["cost_usd"], 4),
    }
    (OUT_STAGES_DIR / "metadata.json").write_text(json.dumps(summary, indent=2))

    print(f"\n[v2] === Render v2 single test complete ===")
    print(f"[v2] total latency: {total_dt:.1f}s  (empty {er_dt:.1f}s + redesign {rd_dt:.1f}s)")
    print(f"[v2] total cost:    ${total_cost:.4f}  (empty ${er_body['cost_usd']:.4f} + redesign ${rd_body['cost_usd']:.4f})")
    print(f"[v2] final render:  {OUT_FINAL}")
    print(f"[v2] stages dir:    {OUT_STAGES_DIR}")
    print(f"[v2] metadata:      {OUT_STAGES_DIR}/metadata.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
