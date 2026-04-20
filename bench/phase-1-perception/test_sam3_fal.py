"""Phase 1 Task 1.2 — SAM 3 fal endpoint probe.

Runs fal-ai/sam-3/image against room-01 and room-09 with the
architectural + keep-class prompt set from research §9.1-6.1,
measures latency, and emits cost + decision data.

Writes results to bench/phase-1-perception/sam3_fal_results.json.

Run:
    FAL_KEY=... python bench/phase-1-perception/test_sam3_fal.py
"""

from __future__ import annotations

import json
import os
import statistics
import sys
import time
from pathlib import Path

import fal_client  # type: ignore

# Per research §9.1-6.1 — architectural + keep classes that SAM 3 must surface.
KEEP_CLASS_PROMPTS: list[str] = [
    "ceiling fan",
    "framed photograph",
    "picture frame",
    "mirror",
    "fireplace",
    "crown molding",
    "exposed brick",
    "exposed beam",
    "wainscoting",
    "arched doorway",
    "bay window",
    "built-in bookshelf",
    "wall letters",
    "wall text",
    "radiator",
]

ROOMS: list[tuple[str, Path]] = [
    ("room-01", Path("bench/rooms/room-01_bedroom-cat-popcorn.webp")),
    ("room-09", Path("bench/rooms/room-09_gaming-led-popcorn.webp")),
]

# fal SAM 3 published price (per fal.ai/models/fal-ai/sam-3/image pricing page
# at time of Phase 1 audit, 2026-04-20). Keep as input constant so we can
# revise if fal changes the rate card.
FAL_SAM3_PRICE_USD = 0.003  # per call


def ensure_api_key() -> None:
    if not os.getenv("FAL_KEY"):
        # fall back to .env.local parse — simple, no dotenv dep
        for candidate in (Path("apps/web/.env.local"), Path(".env.local")):
            if candidate.exists():
                for line in candidate.read_text().splitlines():
                    if line.startswith("FAL_KEY="):
                        os.environ["FAL_KEY"] = line.split("=", 1)[1].strip()
                        break
                if os.getenv("FAL_KEY"):
                    break
    if not os.getenv("FAL_KEY"):
        print("ERROR: FAL_KEY not set", file=sys.stderr)
        sys.exit(2)


def call_sam3(image_url: str, prompt: str) -> dict:
    t0 = time.perf_counter()
    try:
        r = fal_client.subscribe(
            "fal-ai/sam-3/image",
            arguments={
                "image_url": image_url,
                "prompt": prompt,
                "return_multiple_masks": True,
                "max_masks": 3,
                "include_scores": True,
                "apply_mask": False,
                "output_format": "png",
            },
            with_logs=False,
        )
        dt = time.perf_counter() - t0
        masks = r.get("masks") or []
        scores = r.get("scores") or []
        return {
            "prompt": prompt,
            "latency_s": dt,
            "num_masks": len(masks),
            "scores": [float(s) for s in scores if s is not None][:3],
            "error": None,
        }
    except Exception as exc:  # noqa: BLE001
        dt = time.perf_counter() - t0
        return {
            "prompt": prompt,
            "latency_s": dt,
            "num_masks": 0,
            "scores": [],
            "error": f"{type(exc).__name__}: {exc}",
        }


def main() -> int:
    ensure_api_key()
    results: dict = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "endpoint": "fal-ai/sam-3/image",
        "rooms": {},
    }
    all_latencies: list[float] = []
    total_calls = 0

    for room_id, path in ROOMS:
        if not path.exists():
            print(f"SKIP: {path} missing", file=sys.stderr)
            continue
        print(f"[{room_id}] uploading {path}...")
        image_url = fal_client.upload_file(str(path))
        print(f"[{room_id}] url={image_url}")

        per_prompt: list[dict] = []
        for prompt in KEEP_CLASS_PROMPTS:
            r = call_sam3(image_url, prompt)
            total_calls += 1
            all_latencies.append(r["latency_s"])
            print(
                f"  [{room_id}] {prompt!r:28s}  "
                f"{r['latency_s']:5.2f}s  masks={r['num_masks']}  err={r['error']}"
            )
            per_prompt.append(r)

        # Aggregate per room: latency is the wall-clock sum of serial calls.
        # For Phase 1 production we parallelize; this is a baseline measurement.
        serial_total = sum(r["latency_s"] for r in per_prompt)
        per_room_summary = {
            "image_url": image_url,
            "prompts_run": len(per_prompt),
            "serial_total_s": serial_total,
            "p50_per_prompt_s": statistics.median(
                [r["latency_s"] for r in per_prompt]
            ),
            "max_per_prompt_s": max(r["latency_s"] for r in per_prompt),
            "per_prompt": per_prompt,
        }
        results["rooms"][room_id] = per_room_summary
        print(
            f"[{room_id}] serial total={serial_total:.2f}s  "
            f"p50/prompt={per_room_summary['p50_per_prompt_s']:.2f}s"
        )

    # Global latency summary (per-call, across all prompts × rooms)
    if all_latencies:
        all_latencies.sort()
        p50 = statistics.median(all_latencies)
        p95_idx = max(0, int(len(all_latencies) * 0.95) - 1)
        p95 = all_latencies[p95_idx]
        results["global"] = {
            "total_calls": total_calls,
            "p50_per_call_s": p50,
            "p95_per_call_s": p95,
            "mean_per_call_s": statistics.mean(all_latencies),
            "estimated_usd": total_calls * FAL_SAM3_PRICE_USD,
            "parallel_p95_projection_s": p95,
            "serial_all_prompts_p95_projection_s": p95 * len(KEEP_CLASS_PROMPTS),
        }

    out = Path("bench/phase-1-perception/sam3_fal_results.json")
    out.write_text(json.dumps(results, indent=2))
    print(f"\nWrote {out}")
    if "global" in results:
        g = results["global"]
        print(
            f"Global: calls={g['total_calls']}  p50={g['p50_per_call_s']:.2f}s  "
            f"p95={g['p95_per_call_s']:.2f}s  spend≈${g['estimated_usd']:.2f}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
