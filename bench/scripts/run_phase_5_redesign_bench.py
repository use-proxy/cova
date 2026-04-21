"""Phase 5 — cova-redesign 15-room bench (Task 5.5).

For each of the 15 bench rooms:
  1. Look up the empty-room URL from Phase 2 metrics (reuses cached
     cova-empty-room outputs; those URLs are immutable for ~60 days).
  2. Call cova-redesign with the BENCH_ASSIGNMENT archetype.
  3. Save the redesign webp, a per-room JSON metadata blob, and a
     triptych (original | empty | redesign).
  4. Aggregate into ``bench/phase-5-redesign/bench_results.json``.

Invocation:
    python3 bench/scripts/run_phase_5_redesign_bench.py                # all
    python3 bench/scripts/run_phase_5_redesign_bench.py room-01        # one
    python3 bench/scripts/run_phase_5_redesign_bench.py --smoke        # 3 rooms

Env overrides:
    COVA_REDESIGN_URL          service base
    PHASE5_BENCH_PARALLEL      concurrency (default 3)
    PHASE5_SEED                fixed seed for reproducibility
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parent.parent.parent
ROOMS_DIR = ROOT / "bench" / "rooms"
PHASE2_METRICS = ROOT / "bench" / "phase-2-empty-room" / "metrics"
PHASE2_OUTPUTS = ROOT / "bench" / "phase-2-empty-room" / "outputs"

OUT_ROOT = ROOT / "bench" / "phase-5-redesign"
OUTPUTS_DIR = OUT_ROOT / "outputs"
METRICS_DIR = OUT_ROOT / "metrics"
TRIPTYCH_DIR = OUT_ROOT / "triptychs"
for d in (OUT_ROOT, OUTPUTS_DIR, METRICS_DIR, TRIPTYCH_DIR):
    d.mkdir(parents=True, exist_ok=True)

REDESIGN_URL = os.getenv(
    "COVA_REDESIGN_URL",
    "https://cova-interior--cova-redesign-redesign-api.modal.run",
)
REQUEST_TIMEOUT_S = 300.0
MAX_PARALLEL = int(os.getenv("PHASE5_BENCH_PARALLEL", "3"))
FIXED_SEED = int(os.getenv("PHASE5_SEED", "42"))
HARD_COST_CAP = 12.0

# Task 5.5 archetype assignments — each of 10 archetypes appears >=1,
# mix of light/dark/textured rooms, coverage of bedroom/living/office/loft.
BENCH_ASSIGNMENTS: dict[str, str] = {
    "room-01": "COVAJAPANDI",
    "room-02": "COVAMIDCENTURY",
    "room-03": "COVACOASTAL",
    "room-04": "COVABOHEMIAN",
    "room-05": "COVAFARMHOUSE",
    "room-06": "COVAMINIMAL",
    "room-07": "COVAJAPANDI",
    "room-08": "COVABOHEMIAN",
    "room-09": "COVAINDUSTRIAL",
    "room-10": "COVAARTDECO",
    "room-11": "COVASCANDINAV",
    "room-12": "COVAMIDCENTURY",
    "room-13": "COVAINDUSTRIAL",
    "room-14": "COVAARTDECO",
    "room-15": "COVAFARMHOUSE",
}
# COVABIOPHILIC is absent from Task 5.5 bench — add a manual pass on
# room-06 below if needed; per research doc §4 the other 10 archetypes
# cover the spanning evaluation space.

ROOM_TYPES: dict[str, str] = {
    "room-01": "bedroom",
    "room-02": "living_room",
    "room-03": "living_room",
    "room-04": "bedroom",
    "room-05": "home_office",
    "room-06": "living_room",
    "room-07": "bedroom",
    "room-08": "living_room",
    "room-09": "bedroom",
    "room-10": "living_room",
    "room-11": "living_room",
    "room-12": "bedroom",
    "room-13": "living_room",
    "room-14": "living_room",
    "room-15": "bedroom",
}


def load_empty_room_metadata(room_id: str) -> dict[str, Any]:
    """Load phase-2 empty-room metrics; fall back to None if missing."""
    path = PHASE2_METRICS / f"{room_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"Phase 2 metrics missing: {path}")
    return json.loads(path.read_text())


def call_redesign(
    empty_room_url: str,
    archetype_key: str,
    room_type: str,
    seed: int,
    budget_max: float = 3000.0,
) -> tuple[int, dict]:
    t0 = time.perf_counter()
    r = requests.post(
        f"{REDESIGN_URL}/v1/generate_redesign",
        json={
            "empty_room_url": empty_room_url,
            "archetype_key": archetype_key,
            "budget_max": budget_max,
            "room_type": room_type,
            "seed": seed,
        },
        timeout=REQUEST_TIMEOUT_S,
    )
    wall_latency_ms = int((time.perf_counter() - t0) * 1000)
    try:
        body = r.json()
    except Exception:
        body = {"text": r.text[:500]}
    body["_wall_latency_ms"] = wall_latency_ms
    return r.status_code, body


def download_image(url: str, dest: Path) -> None:
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    dest.write_bytes(r.content)


def build_triptych(
    room_id: str,
    original_path: Path,
    empty_path: Path,
    redesign_path: Path,
    out_path: Path,
) -> None:
    """Original | Empty-Room | Redesign side-by-side, fixed 640px height."""
    from PIL import Image, ImageDraw, ImageFont

    target_h = 640
    labels = ("Original", "Empty Room", f"{room_id} Redesign")
    images = []
    for p in (original_path, empty_path, redesign_path):
        img = Image.open(p).convert("RGB")
        w, h = img.size
        new_w = int(w * target_h / h)
        images.append(img.resize((new_w, target_h), Image.LANCZOS))

    label_strip = 34
    total_w = sum(im.width for im in images)
    canvas = Image.new("RGB", (total_w, target_h + label_strip), "white")
    x = 0
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20)
    except OSError:
        font = ImageFont.load_default()
    for im, label in zip(images, labels):
        canvas.paste(im, (x, label_strip))
        draw.text((x + 8, 6), label, fill="black", font=font)
        x += im.width
    canvas.save(out_path, "PNG", optimize=True)


def process_room(
    room_id: str, seed: int, skip_existing: bool = False
) -> dict[str, Any]:
    """End-to-end: empty-room URL → redesign → triptych."""
    metrics_path = METRICS_DIR / f"{room_id}.json"
    if skip_existing and metrics_path.exists():
        existing = json.loads(metrics_path.read_text())
        if existing.get("status") == "ok":
            print(f"[{room_id}] SKIP (already ok)")
            return existing

    archetype = BENCH_ASSIGNMENTS[room_id]
    room_type = ROOM_TYPES[room_id]
    t0 = time.perf_counter()

    try:
        er_meta = load_empty_room_metadata(room_id)
        empty_room_url = er_meta["empty_room_url"]
    except Exception as exc:
        return {
            "room_id": room_id,
            "archetype": archetype,
            "status": "error",
            "error": f"empty_room_lookup:{type(exc).__name__}:{exc}",
            "wall_latency_s": 0.0,
        }

    print(f"[{room_id}] {archetype} — calling redesign (seed={seed})…")
    status, body = call_redesign(empty_room_url, archetype, room_type, seed)
    if status != 200:
        return {
            "room_id": room_id,
            "archetype": archetype,
            "status": "error",
            "http_status": status,
            "error": body,
            "empty_room_url": empty_room_url,
        }

    render_url = body["redesign_url"]
    render_path = OUTPUTS_DIR / f"{room_id}_redesign.webp"
    try:
        download_image(render_url, render_path)
    except Exception as exc:
        return {
            "room_id": room_id,
            "archetype": archetype,
            "status": "error",
            "error": f"download:{type(exc).__name__}:{exc}",
            "http_status": status,
            "body": body,
        }

    # Triptych
    try:
        original_path = next(ROOMS_DIR.glob(f"{room_id}*"))
        empty_path = PHASE2_OUTPUTS / f"{room_id}.webp"
        triptych_path = TRIPTYCH_DIR / f"{room_id}.png"
        build_triptych(room_id, original_path, empty_path, render_path, triptych_path)
    except Exception as exc:
        print(f"[{room_id}] WARN triptych failed: {exc}")
        triptych_path = None

    wall_s = time.perf_counter() - t0
    result = {
        "room_id": room_id,
        "archetype": archetype,
        "room_type": room_type,
        "status": "ok",
        "empty_room_url": empty_room_url,
        "render_url": render_url,
        "render_local_path": str(render_path.relative_to(ROOT)),
        "triptych_local_path": str(triptych_path.relative_to(ROOT)) if triptych_path else None,
        "provider": body["provider"],
        "provider_fallback_reason": body.get("provider_fallback_reason"),
        "primary_trigger": body["primary_trigger"],
        "loras_used": body["loras_used"],
        "prompt_used": body["prompt_used"],
        "seed": seed,
        "strength": body["strength"],
        "guidance_scale": body["guidance_scale"],
        "num_inference_steps": body["num_inference_steps"],
        "image_width": body["image_width"],
        "image_height": body["image_height"],
        "service_latency_ms": body["latency_ms"],
        "wall_latency_ms": body.get("_wall_latency_ms"),
        "wall_latency_s": round(wall_s, 2),
        "cost_usd": body["cost_usd"],
        "judge_score": None,
        "generated_at_iso": body["generated_at_iso"],
    }
    metrics_path.write_text(json.dumps(result, indent=2))
    print(
        f"[{room_id}] OK  provider={result['provider']}  "
        f"loras={len(result['loras_used'])}  "
        f"cost=${result['cost_usd']:.4f}  wall={wall_s:.1f}s"
    )
    return result


def aggregate(results: list[dict[str, Any]]) -> dict[str, Any]:
    ok = [r for r in results if r.get("status") == "ok"]
    err = [r for r in results if r.get("status") != "ok"]
    total_cost = sum(r.get("cost_usd", 0.0) for r in ok)
    flux_count = sum(1 for r in ok if r.get("provider") == "flux-general")
    nb_count = sum(1 for r in ok if r.get("provider") == "nano-banana-pro")
    agg = {
        "generated_at_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "n_rooms_attempted": len(results),
        "n_rooms_ok": len(ok),
        "n_rooms_error": len(err),
        "providers": {
            "flux-general": flux_count,
            "nano-banana-pro": nb_count,
        },
        "total_render_cost_usd": round(total_cost, 4),
        "seed": FIXED_SEED,
        "results": results,
    }
    (OUT_ROOT / "bench_results.json").write_text(json.dumps(agg, indent=2))
    return agg


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rooms", nargs="*", help="Optional room-ids to run")
    ap.add_argument("--smoke", action="store_true", help="Run 3 rooms only")
    ap.add_argument("--skip-existing", action="store_true",
                    help="Skip rooms with ok metrics on disk")
    ap.add_argument("--serial", action="store_true", help="Disable parallelism")
    args = ap.parse_args()

    if args.smoke:
        room_ids = ["room-01", "room-06", "room-10"]  # light/dark/busy mix
    elif args.rooms:
        room_ids = args.rooms
    else:
        room_ids = sorted(BENCH_ASSIGNMENTS.keys())

    print(f"[bench] running {len(room_ids)} rooms, parallel={1 if args.serial else MAX_PARALLEL}")

    results: list[dict[str, Any]] = []
    if args.serial:
        for rid in room_ids:
            results.append(process_room(rid, FIXED_SEED + int(rid.split("-")[1]), args.skip_existing))
    else:
        with ThreadPoolExecutor(max_workers=MAX_PARALLEL) as ex:
            futures = {
                ex.submit(
                    process_room,
                    rid,
                    FIXED_SEED + int(rid.split("-")[1]),
                    args.skip_existing,
                ): rid
                for rid in room_ids
            }
            for fut in as_completed(futures):
                rid = futures[fut]
                try:
                    results.append(fut.result())
                except Exception as exc:
                    results.append(
                        {
                            "room_id": rid,
                            "archetype": BENCH_ASSIGNMENTS.get(rid, "?"),
                            "status": "error",
                            "error": f"worker:{type(exc).__name__}:{exc}",
                        }
                    )

    results.sort(key=lambda r: r.get("room_id", ""))
    agg = aggregate(results)
    print()
    print(f"[bench] DONE  ok={agg['n_rooms_ok']}/{agg['n_rooms_attempted']}  "
          f"flux-general={agg['providers']['flux-general']}  "
          f"nb-pro={agg['providers']['nano-banana-pro']}  "
          f"cost=${agg['total_render_cost_usd']:.4f}")
    if agg["total_render_cost_usd"] > HARD_COST_CAP:
        print(f"[bench] WARN cost ${agg['total_render_cost_usd']:.2f} exceeds cap ${HARD_COST_CAP}")
    return 0 if agg["n_rooms_ok"] == agg["n_rooms_attempted"] else 2


if __name__ == "__main__":
    sys.exit(main())
