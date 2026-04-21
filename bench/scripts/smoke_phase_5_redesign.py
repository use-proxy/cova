"""Phase 5 — cova-redesign smoke test (Task 5.4).

Uploads room-01 to fal, calls cova-empty-room, then calls cova-redesign
with COVAJAPANDI. Verifies 200 response, valid render_url, LoRA stack
activation, and latency. Output written to
``bench/phase-5-redesign/smoke/``.

Invocation:
    python3 bench/scripts/smoke_phase_5_redesign.py
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent.parent
ROOMS_DIR = ROOT / "bench" / "rooms"
OUT_DIR = ROOT / "bench" / "phase-5-redesign" / "smoke"
OUT_DIR.mkdir(parents=True, exist_ok=True)

EMPTY_ROOM_URL = os.getenv(
    "COVA_EMPTY_ROOM_URL",
    "https://cova-interior--cova-empty-room-emptyroom-api.modal.run",
)
REDESIGN_URL = os.getenv(
    "COVA_REDESIGN_URL",
    "https://cova-interior--cova-redesign-redesign-api.modal.run",
)


def load_fal_key() -> None:
    if os.getenv("FAL_KEY"):
        return
    for env_path in (ROOT / "apps/web/.env.local", ROOT / ".env.local"):
        if not env_path.exists():
            continue
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("FAL_KEY="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                os.environ["FAL_KEY"] = val
                return
    raise RuntimeError("FAL_KEY not set and no .env.local file contains it")


load_fal_key()
import fal_client  # noqa: E402


def main() -> int:
    room_file = next(ROOMS_DIR.glob("room-01*"))
    print(f"[smoke] uploading {room_file.name} to fal…")
    t0 = time.perf_counter()
    fal_image_url = fal_client.upload_file(str(room_file))
    print(f"[smoke] uploaded in {time.perf_counter() - t0:.1f}s → {fal_image_url}")

    print("[smoke] calling cova-empty-room…")
    t1 = time.perf_counter()
    er = requests.post(
        f"{EMPTY_ROOM_URL}/v1/generate_empty_room",
        json={"image_url": fal_image_url},
        timeout=180,
    )
    er_dt = time.perf_counter() - t1
    if er.status_code != 200:
        print(f"[smoke] FAIL empty-room {er.status_code}: {er.text[:500]}")
        return 1
    er_body = er.json()
    empty_url = er_body["empty_room_url"]
    print(
        f"[smoke] empty-room 200 in {er_dt:.1f}s  inpainter={er_body['inpainter_used']}  "
        f"cov_dilated={er_body['mask_coverage_dilated_pct']:.1f}%  ssim={er_body['architectural_patch_ssim']:.3f}"
    )

    print("[smoke] calling cova-redesign COVAJAPANDI…")
    t2 = time.perf_counter()
    rd = requests.post(
        f"{REDESIGN_URL}/v1/generate_redesign",
        json={
            "empty_room_url": empty_url,
            "archetype_key": "COVAJAPANDI",
            "budget_max": 3000.0,
            "room_type": "bedroom",
            "seed": 42,
        },
        timeout=300,
    )
    rd_dt = time.perf_counter() - t2
    if rd.status_code != 200:
        print(f"[smoke] FAIL redesign {rd.status_code}: {rd.text[:800]}")
        return 1
    rd_body = rd.json()
    print(
        f"[smoke] redesign 200 in {rd_dt:.1f}s  provider={rd_body['provider']}  "
        f"primary_trigger={rd_body['primary_trigger']}  loras_used={len(rd_body['loras_used'])}  "
        f"cost=${rd_body['cost_usd']:.4f}"
    )

    # Save the render
    render_url = rd_body["redesign_url"]
    render_bytes = requests.get(render_url, timeout=60).content
    out_img = OUT_DIR / "room-01_redesign.webp"
    out_img.write_bytes(render_bytes)
    print(f"[smoke] render saved → {out_img}")

    # Save the metadata
    metadata = {
        "room": "room-01",
        "archetype": "COVAJAPANDI",
        "empty_room": er_body,
        "redesign": rd_body,
        "wall_latency_empty_room_s": round(er_dt, 2),
        "wall_latency_redesign_s": round(rd_dt, 2),
    }
    (OUT_DIR / "room-01.json").write_text(json.dumps(metadata, indent=2))

    # Gates
    fails = []
    if rd_body["provider"] == "nano-banana-pro":
        fails.append(f"Expected flux-general, got fallback ({rd_body['provider_fallback_reason']})")
    style_loras = [l for l in rd_body["loras_used"] if l.get("trigger") is not None]
    if len(style_loras) == 0:
        fails.append("No style LoRAs in stack")
    if rd_body["primary_trigger"] != "cvwmn":
        fails.append(f"Expected primary_trigger=cvwmn, got {rd_body['primary_trigger']}")

    # Latency note — first-warm call may exceed 60s due to cold start; budget 120s.
    latency_warn = ""
    if rd_body["latency_ms"] > 60000:
        latency_warn = (
            f" (WARN: {rd_body['latency_ms']/1000:.1f}s > 60s — likely cold start; "
            f"rerun warm to confirm warm latency)"
        )

    if fails:
        print(f"[smoke] FAIL: {'; '.join(fails)}")
        return 1
    print(f"[smoke] PASS — latency {rd_body['latency_ms']/1000:.1f}s{latency_warn}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
