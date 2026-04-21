"""Phase 2 — cova-empty-room service bench (15 rooms).

Calls the production `cova-empty-room` Modal endpoint per room and
aggregates end-to-end metrics. Uploads each local bench room to fal
first (same pattern as Run 3) then sends its fal URL to the service.

Invocation:
  python3 bench/scripts/run_phase_2_service_bench.py                # all
  python3 bench/scripts/run_phase_2_service_bench.py room-01        # one
  python3 bench/scripts/run_phase_2_service_bench.py --smoke        # pilot
"""
from __future__ import annotations

import io
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent.parent
BENCH = ROOT / "bench"
ROOMS_DIR = BENCH / "rooms"
OUT_ROOT = BENCH / "phase-2-empty-room"
METRICS_DIR = OUT_ROOT / "metrics"
OUTPUTS_DIR = OUT_ROOT / "outputs"
OUT_ROOT.mkdir(parents=True, exist_ok=True)
METRICS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

SERVICE_URL = os.getenv(
    "COVA_EMPTY_ROOM_URL",
    "https://cova-interior--cova-empty-room-emptyroom-api.modal.run",
)
REQUEST_TIMEOUT_S = 180.0
HARD_COST_CAP = 10.0
MAX_PARALLEL = int(os.getenv("PHASE2_BENCH_PARALLEL", "3"))


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


def upload_local_to_fal(path: Path) -> str:
    return fal_client.upload_file(str(path))


def call_service(image_url: str, user_id: str | None = None) -> tuple[int, dict]:
    t0 = time.perf_counter()
    r = requests.post(
        f"{SERVICE_URL}/v1/generate_empty_room",
        json={"image_url": image_url, "user_id": user_id},
        timeout=REQUEST_TIMEOUT_S,
    )
    wall_latency_ms = int((time.perf_counter() - t0) * 1000)
    try:
        body = r.json()
    except Exception:
        body = {"text": r.text[:500]}
    body["_wall_latency_ms"] = wall_latency_ms
    return r.status_code, body


def process_room(room: dict) -> dict:
    room_id = room["id"]
    filename = room["filename"]
    path = ROOMS_DIR / filename
    print(f"[{room_id}] ▶ start", flush=True)
    t_room0 = time.perf_counter()

    try:
        fal_url = upload_local_to_fal(path)
    except Exception as exc:  # noqa: BLE001
        return {
            "room_id": room_id,
            "error": f"fal upload failed: {exc}",
            "overall_pass": False,
        }

    status, body = call_service(fal_url)
    wall_latency_ms = body.pop("_wall_latency_ms", None)

    result: dict = {
        "room_id": room_id,
        "input_fal_url": fal_url,
        "http_status": status,
        "wall_latency_ms": wall_latency_ms,
        "wall_latency_s": (wall_latency_ms or 0) / 1000.0,
        "stratification": room.get("stratification"),
    }

    if status == 200:
        for k in (
            "empty_room_url",
            "mask_coverage_raw_pct",
            "mask_coverage_dilated_pct",
            "inpainter_used",
            "router_threshold_pct",
            "architectural_patch_ssim",
            "patch_coordinates",
            "patch_clean",
            "partial_failures",
            "latency_ms",
            "cost_usd",
        ):
            result[k] = body.get(k)

        # Download output snapshot for visual review (small cost, ~200KB/room)
        try:
            empty_url = body.get("empty_room_url")
            if empty_url:
                r = requests.get(empty_url, timeout=60)
                r.raise_for_status()
                out_path = OUTPUTS_DIR / f"{room_id}.webp"
                out_path.write_bytes(r.content)
                result["output_local_path"] = str(out_path.relative_to(ROOT))
        except Exception as exc:  # noqa: BLE001
            result["output_download_error"] = str(exc)

        # Pass gates per Phase 2 acceptance criteria
        ssim_val = result.get("architectural_patch_ssim") or 0.0
        cost_val = result.get("cost_usd") or 0.0
        lat_val = result.get("latency_ms") or 0
        result["pass_per_metric"] = {
            "architectural_patch_ssim": ssim_val >= 0.80,
            "cost": cost_val <= 0.30,
            "latency_p95": lat_val <= 45_000,
        }
        result["overall_pass"] = all(result["pass_per_metric"].values())
    else:
        result["error"] = body
        result["overall_pass"] = False

    total = time.perf_counter() - t_room0
    result["bench_wall_s"] = total
    print(
        f"[{room_id}] ← status={status} "
        f"pass={result.get('overall_pass')} "
        f"inpainter={result.get('inpainter_used')} "
        f"cov={result.get('mask_coverage_dilated_pct')!r} "
        f"ssim={result.get('architectural_patch_ssim')!r} "
        f"cost=${result.get('cost_usd') or 0:.3f} "
        f"lat={result.get('latency_ms')}ms",
        flush=True,
    )
    (METRICS_DIR / f"{room_id}.json").write_text(json.dumps(result, indent=2))
    return result


def main() -> int:
    manifest = json.loads((BENCH / "manifest.json").read_text())
    rooms: list[dict] = manifest["rooms"]

    args = sys.argv[1:]
    if args:
        if args[0] == "--smoke":
            rooms = [r for r in rooms if r["id"] == "room-01"]
        elif args[0] == "--skip-existing":
            rooms = [r for r in rooms if not (METRICS_DIR / f"{r['id']}.json").exists()]
        else:
            targets = set(args[0].split(","))
            rooms = [r for r in rooms if r["id"] in targets]
    if not rooms:
        print("no rooms to process")
        return 0

    projected = 0.21 * len(rooms)
    print(f"Projected cost: ~${projected:.2f} over {len(rooms)} rooms (hard cap ${HARD_COST_CAP})")
    if projected > HARD_COST_CAP:
        print("BLOCKER: projected cost exceeds hard cap")
        return 2

    results: list[dict] = []
    total_running_cost = 0.0
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL) as ex:
        futs = {ex.submit(process_room, r): r for r in rooms}
        for fut in as_completed(futs):
            try:
                result = fut.result()
                results.append(result)
                total_running_cost += result.get("cost_usd") or 0.0
                if total_running_cost > HARD_COST_CAP:
                    print(
                        f"HARD CAP EXCEEDED at ${total_running_cost:.2f} — cancelling"
                    )
                    ex.shutdown(wait=False, cancel_futures=True)
                    break
            except Exception as exc:  # noqa: BLE001
                r = futs[fut]
                print(f"[{r['id']}] CATASTROPHIC: {exc}")
                results.append({"room_id": r["id"], "error": str(exc), "overall_pass": False})

    order = {r["id"]: i for i, r in enumerate(manifest["rooms"])}
    results.sort(key=lambda x: order.get(x.get("room_id"), 999))

    # Aggregate
    lats = sorted(
        [r["latency_ms"] for r in results if r.get("latency_ms") is not None]
    )

    def pct(p: float) -> float | None:
        if not lats:
            return None
        idx = min(len(lats) - 1, int(len(lats) * p / 100))
        return float(lats[idx])

    summary = {
        "service_url": SERVICE_URL,
        "n_rooms": len(results),
        "passed": sum(1 for r in results if r.get("overall_pass")),
        "total_cost_usd": sum(r.get("cost_usd") or 0 for r in results),
        "latency_ms_p50": pct(50),
        "latency_ms_p95": pct(95),
        "latency_ms_p99": pct(99),
        "inpainter_routing": {
            "lama": sum(1 for r in results if r.get("inpainter_used") == "lama"),
            "bria": sum(1 for r in results if r.get("inpainter_used") == "bria"),
            "short_circuit": sum(1 for r in results if r.get("inpainter_used") == "short_circuit"),
        },
        "architectural_patch_ssim": {
            "min": min(
                [r.get("architectural_patch_ssim") for r in results if r.get("architectural_patch_ssim") is not None],
                default=None,
            ),
            "max": max(
                [r.get("architectural_patch_ssim") for r in results if r.get("architectural_patch_ssim") is not None],
                default=None,
            ),
            "mean": (
                sum(r.get("architectural_patch_ssim") or 0 for r in results)
                / max(1, sum(1 for r in results if r.get("architectural_patch_ssim") is not None))
            ),
            "pass_count_gte_080": sum(
                1 for r in results if (r.get("architectural_patch_ssim") or 0) >= 0.80
            ),
        },
        "errors": [r for r in results if r.get("error") is not None],
    }
    (OUT_ROOT / "bench_results.json").write_text(json.dumps({"summary": summary, "rooms": results}, indent=2))
    print("\n══════════════════════════════════════════════════════════")
    print(json.dumps(summary, indent=2))
    print("══════════════════════════════════════════════════════════")
    return 0


if __name__ == "__main__":
    sys.exit(main())
