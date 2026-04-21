"""Re-run failing rooms with Stage B enabled + tuned accessory mask.

Targets the 9 rooms that failed Run 1. Merges results back into
bench-results.json.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from run_render_upgrade_bench import (
    BENCH_ROOMS, run_room, OUT_DIR, CRITIQUE_DIR, upload_input_image,
    call_empty_room, call_redesign, evaluate_render_vs_collov, COLLOV_REFS,
    HARD_KEYS, append_cost,
)

FAILS = {"room-04", "room-06", "room-07", "room-08", "room-11", "room-12", "room-13", "room-14", "room-15"}


def run_room_with_stage_b(room_id: str, image_path: Path, archetype: str, room_type: str, max_retries: int = 2) -> dict:
    import hashlib
    print(f"\n=== {room_id} [rerun+stage_b]  {archetype} / {room_type} ===", flush=True)

    uploaded = upload_input_image(image_path)
    print(f"  uploaded: {uploaded}", flush=True)

    empty = call_empty_room(uploaded)
    empty_url = empty["empty_room_url"]
    print(f"  empty: {empty_url}  inpainter={empty.get('inpainter_used')}  "
          f"cov={empty.get('mask_coverage_raw_pct'):.1f}%", flush=True)

    room_dir = OUT_DIR / room_id
    room_dir.mkdir(parents=True, exist_ok=True)
    try:
        (room_dir / "empty.jpg").write_bytes(httpx.get(empty_url, timeout=60).content)
    except Exception:
        pass

    base_seed = int(hashlib.md5(f"stage_b:{room_id}{archetype}".encode()).hexdigest()[:7], 16)

    for attempt in range(1, max_retries + 1):
        seed = base_seed + (attempt - 1) * 1000
        red = call_redesign(empty_url, archetype, room_type, seed=seed, enable_stage_b=True)
        url = red["redesign_url"]
        print(
            f"  [attempt {attempt}] redesign: provider={red.get('provider')} "
            f"stage_b={red.get('stage_b_used')} inf_time={red.get('lora_inference_time_s')}s url={url}",
            flush=True,
        )
        try:
            (room_dir / f"redesign_stageb_attempt{attempt}.jpg").write_bytes(
                httpx.get(url, timeout=120).content
            )
        except Exception as exc:
            print(f"  warn: save failed {exc}")

        try:
            crit = evaluate_render_vs_collov(
                image_path, url, COLLOV_REFS, archetype, room_type,
                attempt, is_target_room=False,
            )
        except Exception as exc:
            print(f"  judge failed: {exc}")
            crit = {"error": str(exc), "iteration": attempt, "cova_render_url": url, "overall_pass": False}

        (CRITIQUE_DIR / room_id).mkdir(parents=True, exist_ok=True)
        (CRITIQUE_DIR / room_id / f"stageb_attempt_{attempt}.json").write_text(json.dumps(crit, indent=2))

        if crit.get("overall_pass"):
            print(f"  ✅ {room_id} PASSED attempt {attempt}", flush=True)
            return {
                "status": "pass",
                "attempts": attempt,
                "critique": crit,
                "render_url": url,
                "provider": red.get("provider"),
                "inference_time_s": red.get("lora_inference_time_s"),
                "empty_room_url": empty_url,
                "rerun_tier": "stage_b",
            }
        fails = [k for k in HARD_KEYS if isinstance(crit.get(k), dict) and crit[k].get("score") == "FAIL"]
        print(f"  ❌ attempt {attempt} FAIL  hard_fails={fails}  pref={crit.get('designer_preference')}")

    return {
        "status": "fail",
        "attempts": max_retries,
        "critique": crit,
        "render_url": url,
        "empty_room_url": empty_url,
        "rerun_tier": "stage_b",
    }


def main():
    # Load current results
    results_path = ROOT / "docs" / "render-upgrade" / "bench-results.json"
    results = json.loads(results_path.read_text())

    for (rid, rel_path, arch, room_type) in BENCH_ROOMS:
        if rid not in FAILS:
            continue
        img_path = ROOT / rel_path
        if not img_path.exists():
            continue
        try:
            new = run_room_with_stage_b(rid, img_path, arch, room_type, max_retries=2)
            # Only overwrite if the rerun passed OR if new status is better than old
            old = results.get(rid, {})
            if new.get("status") == "pass" or old.get("status") != "pass":
                results[rid] = new
            # Persist after each room
            results_path.write_text(json.dumps(results, indent=2))
        except Exception as exc:
            print(f"ROOM {rid} error: {exc}")

    # Final summary
    passes = sum(1 for v in results.values() if v.get("status") == "pass")
    fails = sum(1 for v in results.values() if v.get("status") == "fail")
    print(f"\n=== FINAL after stage_b rerun: pass={passes}  fail={fails} ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
