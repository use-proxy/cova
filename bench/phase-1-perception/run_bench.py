"""Phase 1 Task 1.6 — 15-room bench for cova-perception.

Runs /detect_preservation_spec, /encode_sam2_for_cache, and
/depth_anything_v2 against every room in ``bench/rooms/``.

Outputs:
  * bench/phase-1-perception/outputs/room-XX_preservation.json
  * bench/phase-1-perception/outputs/room-XX_sam2_meta.json
  * bench/phase-1-perception/outputs/room-XX_depth.json
  * bench/phase-1-perception/bench_results.json  (aggregate)
"""

from __future__ import annotations

import json
import os
import statistics
import sys
import time
from pathlib import Path
from typing import Any

import fal_client  # type: ignore
import requests

ENDPOINT = "https://cova-interior--cova-perception-perception-api.modal.run"
BENCH_USER_ID = os.getenv(
    "BENCH_USER_ID", "863c7799-accd-42e6-bac2-d4697b111542"
)
OUT_DIR = Path("bench/phase-1-perception/outputs")
OUT_DIR.mkdir(parents=True, exist_ok=True)

FAL_SAM3_PRICE_USD = 0.003
FAL_DEPTH_PRICE_USD = 0.005  # fal imageutils/depth
# Modal A10G on-demand is $1.10/hr; a 3s call ≈ $0.0009 wall-clock charge.
MODAL_A10G_USD_PER_S = 1.10 / 3600.0


def ensure_fal_key() -> None:
    if os.getenv("FAL_KEY"):
        return
    for cand in (Path("apps/web/.env.local"), Path(".env.local")):
        if cand.exists():
            for line in cand.read_text().splitlines():
                if line.startswith("FAL_KEY="):
                    os.environ["FAL_KEY"] = line.split("=", 1)[1].strip()
                    return


def hit(path: str, body: dict, *, timeout: int = 300) -> tuple[int, Any, float]:
    t0 = time.perf_counter()
    try:
        r = requests.post(f"{ENDPOINT}{path}", json=body, timeout=timeout)
    except Exception as exc:  # noqa: BLE001
        return 0, {"transport_error": f"{type(exc).__name__}: {exc}"}, time.perf_counter() - t0
    dt = time.perf_counter() - t0
    try:
        j = r.json()
    except Exception:
        j = {"raw": r.text[:1000]}
    return r.status_code, j, dt


def run_one_room(room_id: str, path: Path) -> dict:
    print(f"\n=== {room_id} ({path.name}) ===")
    upload_url = fal_client.upload_file(str(path))
    out: dict[str, Any] = {
        "room_id": room_id,
        "filename": path.name,
        "image_url": upload_url,
    }

    # 1. preservation_spec
    s, j, dt = hit("/v1/detect_preservation_spec", {"image_url": upload_url})
    out["detect_preservation_spec"] = {
        "status": s,
        "wall_s": dt,
        "server_latency_ms": j.get("latency_ms") if isinstance(j, dict) else None,
        "detections": (
            len(j.get("keep_class_detections", []))
            if isinstance(j, dict) and s == 200 else None
        ),
        "face_in_frame": (
            len(j.get("face_in_frame_flags", []))
            if isinstance(j, dict) and s == 200 else None
        ),
        "wall_text": (
            len(j.get("wall_text_flags", []))
            if isinstance(j, dict) and s == 200 else None
        ),
        "partial_failures": (
            j.get("partial_failures", []) if isinstance(j, dict) else []
        ),
    }
    if s == 200:
        (OUT_DIR / f"{room_id}_preservation.json").write_text(json.dumps(j, indent=2))
    else:
        out["detect_preservation_spec"]["error_body"] = str(j)[:500]
    print(
        f"  detect:  status={s} wall={dt:.2f}s "
        f"server_ms={out['detect_preservation_spec']['server_latency_ms']} "
        f"det={out['detect_preservation_spec']['detections']} "
        f"faces={out['detect_preservation_spec']['face_in_frame']} "
        f"text={out['detect_preservation_spec']['wall_text']} "
        f"fails={len(out['detect_preservation_spec']['partial_failures'])}"
    )

    # 2. encode_sam2
    s, j, dt = hit(
        "/v1/encode_sam2_for_cache",
        {"image_url": upload_url, "user_id": BENCH_USER_ID},
    )
    out["encode_sam2_for_cache"] = {
        "status": s,
        "wall_s": dt,
        "server_latency_ms": j.get("latency_ms") if isinstance(j, dict) else None,
        "size_bytes": j.get("embedding_size_bytes") if isinstance(j, dict) else None,
        "shape": j.get("embedding_shape") if isinstance(j, dict) else None,
        "row_id": j.get("supabase_row_id") if isinstance(j, dict) else None,
    }
    if s == 200:
        # Don't write the full base64 blob — it's 2 MiB × 15 rooms.
        meta = {k: v for k, v in j.items() if k != "embedding_bytes_b64"}
        (OUT_DIR / f"{room_id}_sam2_meta.json").write_text(json.dumps(meta, indent=2))
    else:
        out["encode_sam2_for_cache"]["error_body"] = str(j)[:500]
    print(
        f"  sam2:    status={s} wall={dt:.2f}s "
        f"server_ms={out['encode_sam2_for_cache']['server_latency_ms']} "
        f"size={out['encode_sam2_for_cache']['size_bytes']}"
    )

    # 3. depth
    s, j, dt = hit("/v1/depth_anything_v2", {"image_url": upload_url})
    out["depth_anything_v2"] = {
        "status": s,
        "wall_s": dt,
        "server_latency_ms": j.get("latency_ms") if isinstance(j, dict) else None,
        "depth_url": j.get("depth_url") if isinstance(j, dict) else None,
    }
    if s == 200:
        (OUT_DIR / f"{room_id}_depth.json").write_text(json.dumps(j, indent=2))
    else:
        out["depth_anything_v2"]["error_body"] = str(j)[:500]
    print(
        f"  depth:   status={s} wall={dt:.2f}s "
        f"server_ms={out['depth_anything_v2']['server_latency_ms']}"
    )

    return out


def aggregate(per_room: list[dict]) -> dict:
    def pcts(vals: list[float]) -> dict:
        if not vals:
            return {"n": 0}
        vs = sorted(vals)
        n = len(vs)
        return {
            "n": n,
            "min": vs[0],
            "p50": statistics.median(vs),
            "p95": vs[min(n - 1, int(n * 0.95))],
            "p99": vs[min(n - 1, int(n * 0.99))],
            "max": vs[-1],
            "mean": statistics.fmean(vs),
        }

    detect_server_ms = [
        r["detect_preservation_spec"]["server_latency_ms"]
        for r in per_room
        if r["detect_preservation_spec"]["status"] == 200
        and r["detect_preservation_spec"]["server_latency_ms"] is not None
    ]
    sam2_server_ms = [
        r["encode_sam2_for_cache"]["server_latency_ms"]
        for r in per_room
        if r["encode_sam2_for_cache"]["status"] == 200
        and r["encode_sam2_for_cache"]["server_latency_ms"] is not None
    ]
    depth_server_ms = [
        r["depth_anything_v2"]["server_latency_ms"]
        for r in per_room
        if r["depth_anything_v2"]["status"] == 200
        and r["depth_anything_v2"]["server_latency_ms"] is not None
    ]
    sam2_sizes = [
        r["encode_sam2_for_cache"]["size_bytes"]
        for r in per_room
        if r["encode_sam2_for_cache"]["status"] == 200
        and r["encode_sam2_for_cache"]["size_bytes"] is not None
    ]

    # Cost per call estimates.
    # detect: 15 SAM 3 calls + ~0.5s Modal A10G server time (warm)
    # sam2: Modal A10G only (~1s)
    # depth: 1 fal depth call + tiny Modal overhead
    warm_detect_s = (
        statistics.fmean([m / 1000 for m in detect_server_ms]) if detect_server_ms else 0
    )
    warm_sam2_s = (
        statistics.fmean([m / 1000 for m in sam2_server_ms]) if sam2_server_ms else 0
    )
    warm_depth_s = (
        statistics.fmean([m / 1000 for m in depth_server_ms]) if depth_server_ms else 0
    )
    cost_detect = 15 * FAL_SAM3_PRICE_USD + warm_detect_s * MODAL_A10G_USD_PER_S
    cost_sam2 = warm_sam2_s * MODAL_A10G_USD_PER_S
    cost_depth = FAL_DEPTH_PRICE_USD + warm_depth_s * MODAL_A10G_USD_PER_S

    partial_failures_flat = []
    for r in per_room:
        partial_failures_flat.extend(r["detect_preservation_spec"]["partial_failures"])

    total_calls = len(per_room) * 3
    total_cost = len(per_room) * (cost_detect + cost_sam2 + cost_depth)

    return {
        "per_endpoint_server_latency_ms": {
            "detect_preservation_spec": pcts([float(x) for x in detect_server_ms]),
            "encode_sam2_for_cache": pcts([float(x) for x in sam2_server_ms]),
            "depth_anything_v2": pcts([float(x) for x in depth_server_ms]),
        },
        "sam2_embedding_bytes": pcts([float(x) for x in sam2_sizes]),
        "sam2_max_bytes_cap": 2 * 1024 * 1024,
        "per_call_cost_estimate_usd": {
            "detect_preservation_spec": cost_detect,
            "encode_sam2_for_cache": cost_sam2,
            "depth_anything_v2": cost_depth,
        },
        "bench_total_cost_estimate_usd": total_cost,
        "bench_total_calls": total_calls,
        "partial_failures_total": len(partial_failures_flat),
        "partial_failures_sample": partial_failures_flat[:10],
        "acceptance": {
            "p95_detect_under_3s": bool(
                detect_server_ms
                and pcts([float(x) for x in detect_server_ms])["p95"] <= 3000
            ),
            "all_sam2_under_2mib": bool(
                sam2_sizes and max(sam2_sizes) <= 2 * 1024 * 1024
            ),
            "cost_under_0_02_per_call": bool(
                (total_cost / total_calls) <= 0.02
            ),
            "cost_detect_under_0_02": cost_detect <= 0.02,
        },
    }


def main() -> int:
    ensure_fal_key()
    rooms = sorted(Path("bench/rooms").glob("room-*.webp"))
    if not rooms:
        print("no rooms found", file=sys.stderr)
        return 2
    print(f"Running bench against {len(rooms)} rooms → {ENDPOINT}")

    per_room: list[dict] = []
    t_bench0 = time.perf_counter()
    for p in rooms:
        rid = p.stem.split("_")[0]
        per_room.append(run_one_room(rid, p))
    bench_wall_s = time.perf_counter() - t_bench0

    agg = aggregate(per_room)
    out = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "endpoint": ENDPOINT,
        "bench_user_id": BENCH_USER_ID,
        "rooms_run": len(rooms),
        "bench_wall_seconds": bench_wall_s,
        "per_room": per_room,
        "aggregate": agg,
    }
    (Path("bench/phase-1-perception") / "bench_results.json").write_text(
        json.dumps(out, indent=2)
    )
    print("\n=== AGGREGATE ===")
    print(json.dumps(agg, indent=2))
    print(f"\nbench wall {bench_wall_s:.1f}s ({len(rooms)} rooms)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
