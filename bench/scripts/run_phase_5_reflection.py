"""Phase 5 — Reflection + retry loop (Task 5.7).

For every base-run room that failed the Collov gate, re-renders with
tuned parameters and re-scores via the judge. Up to 2 iterations per
room; stops when beats_collov == true or the iteration ceiling is hit.

Diagnostic signal from the base run (2026-04-21): 7 of 7 failures share
a single root cause — the judge flags "complete room transformation"
when FLUX strength=0.82 rewrites architecture on rooms with distinctive
features (piano, sloped attic, gallery wall, popcorn ceiling, etc.).
The empty-room shell already preserves architecture; lowering strength
keeps more of that shell.

Strategy (per-iteration, applied cumulatively):

Iteration 1 — Architecture preservation:
  * strength_override: 0.70  (was 0.82 — primary lever, judge-identified)
  * guidance_override: 4.2   (nudges generation toward prompt semantics
    so style_fidelity doesn't regress when strength drops)
  * Heavier archetype vocabulary (appended via prompt_override built from
    the service's D_full_activation template + extra nouns).
  * LoRA scale bump: 1.12 (pushes style through at lower strength)

Iteration 2 — Parameter sweep:
  * strength_override: 0.62
  * guidance_override: 5.0
  * LoRA scale bump: 1.20 (capped by the service)
  * Seed rotation: original_seed + 1000

Invocation:
    python3 bench/scripts/run_phase_5_reflection.py                    # all failing rooms
    python3 bench/scripts/run_phase_5_reflection.py room-04 room-09    # subset
    python3 bench/scripts/run_phase_5_reflection.py --iterations 2     # default 2

Outputs:
    bench/phase-5-redesign/reflection/room-XX_iteration_log.json
    bench/phase-5-redesign/reflection/outputs/room-XX_iterN.jpg
    bench/phase-5-redesign/metrics/room-XX.json                (best-of written back)
    bench/phase-5-redesign/judge/judge_runs/iterN/room-XX.json (per-iter judge)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_phase_5_judge import score_room as judge_score_room  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
METRICS_DIR = ROOT / "bench" / "phase-5-redesign" / "metrics"
OUTPUTS_DIR = ROOT / "bench" / "phase-5-redesign" / "outputs"
REFLECT_DIR = ROOT / "bench" / "phase-5-redesign" / "reflection"
REFLECT_OUT = REFLECT_DIR / "outputs"
REFLECT_DIR.mkdir(parents=True, exist_ok=True)
REFLECT_OUT.mkdir(parents=True, exist_ok=True)

REDESIGN_URL = os.getenv(
    "COVA_REDESIGN_URL",
    "https://cova-interior--cova-redesign-redesign-api.modal.run",
)
REQUEST_TIMEOUT_S = 300.0

# Extra vocabulary per archetype — appended to the service's built prompt
# via prompt_override. Heavier noun density than ARCHETYPE_VOCAB in
# redesign.py. Not in the service because prod requests should stay terse;
# reflection is opt-in.
EXTRA_VOCAB: dict[str, str] = {
    "COVAJAPANDI": (
        "low-profile platform bed, shoji-inspired screen, washi paper lampshade, "
        "ikebana arrangement, handthrown stoneware, tatami texture, "
        "muted earth tones, zen negative space"
    ),
    "COVASCANDINAV": (
        "pale birch wood, sheepskin throw, woven basket, mid-gray felt, "
        "hygge candle grouping, matte white ceramics, sheer linen curtain, "
        "single bold black accent"
    ),
    "COVABIOPHILIC": (
        "cascading philodendron, hanging pothos, terracotta planter, "
        "mossy wall panel, limewash walls, travertine side table, "
        "jute floor, green filtered light"
    ),
    "COVAMINIMAL": (
        "single sculptural armchair, hidden storage doors, recessed shadow lines, "
        "low-slung platform sofa, matte black hardware, concrete floor, "
        "generous wall void, disciplined asymmetry"
    ),
    "COVAMIDCENTURY": (
        "walnut sputnik chandelier, mustard velvet armchair, teak credenza, "
        "hairpin-legged table, geometric atomic rug, brass starburst mirror, "
        "burnt orange accent, record shelf"
    ),
    "COVACOASTAL": (
        "whitewashed shiplap, bleached oak floor, rope-wrapped lamp, "
        "sea glass bowl, sheer white linen curtains, jute rug, driftwood accent, "
        "soft blue cushion"
    ),
    "COVABOHEMIAN": (
        "macrame wall hanging, Moroccan berber rug layered over jute, "
        "rattan hanging chair, brass moroccan lantern, embroidered throw pillows, "
        "terracotta vase cluster, dried pampas grass, gallery of framed textiles"
    ),
    "COVAINDUSTRIAL": (
        "exposed red brick wall, blackened steel shelf brackets, reclaimed oak plank, "
        "Edison pendant cluster, cast iron hardware, leather Chesterfield, "
        "galvanized pipe detail, weathered concrete"
    ),
    "COVAFARMHOUSE": (
        "shiplap accent wall, reclaimed barnwood beam, wrought iron pendant, "
        "vintage stoneware crock, linen slipcover, windsor chair, "
        "braided jute rug, farmhouse sink"
    ),
    "COVAARTDECO": (
        "lacquered black cabinet with brass inlay, fluted glass sconce, "
        "emerald velvet wingback, polished brass bar cart, "
        "geometric fan-pattern rug, black marble tabletop, "
        "dramatic gold chandelier, chevron pattern"
    ),
}


def load_metrics(room_id: str) -> dict[str, Any]:
    path = METRICS_DIR / f"{room_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"missing metrics: {path}")
    return json.loads(path.read_text())


def build_reflection_prompt(archetype: str, base_prompt: str) -> str:
    """Take the service-built prompt and inject extra archetype vocabulary.

    Drops the trailing trigger-suffix, appends the extra nouns, then
    restores the trigger-suffix so trigger-word position stays canonical.
    """
    extra = EXTRA_VOCAB.get(archetype)
    if not extra:
        return base_prompt
    # Service template: "<3x trigger> <base> <suffix 2x trigger>". Split on the
    # last occurrence of "interior " to capture the trigger suffix, inject
    # extra vocab before it.
    words = base_prompt.split()
    # Find the split index just before the suffix "trigger interior trigger interior".
    # The trigger is 5-char cv-word + " interior"; suffix starts 4 tokens from end.
    if len(words) >= 4:
        body = " ".join(words[:-4])
        tail = " ".join(words[-4:])
        return f"{body}, {extra} {tail}"
    return f"{base_prompt}, {extra}"


def apply_iteration_params(
    iteration: int,
    base_metrics: dict[str, Any],
    extra_vocab_prompt: str,
) -> dict[str, Any]:
    """Return the API call payload for iteration N (1-indexed)."""
    archetype = base_metrics["archetype"]
    room_type = base_metrics.get("room_type", "room")
    empty_url = base_metrics["empty_room_url"]
    base_seed = int(base_metrics.get("seed", 42))

    if iteration == 1:
        return {
            "empty_room_url": empty_url,
            "archetype_key": archetype,
            "budget_max": 3000.0,
            "room_type": room_type,
            "seed": base_seed,
            "strength_override": 0.70,
            "guidance_override": 4.2,
            "lora_scale_multiplier": 1.12,
            "prompt_override": extra_vocab_prompt,
        }
    elif iteration == 2:
        return {
            "empty_room_url": empty_url,
            "archetype_key": archetype,
            "budget_max": 3000.0,
            "room_type": room_type,
            "seed": base_seed + 1000,
            "strength_override": 0.62,
            "guidance_override": 5.0,
            "lora_scale_multiplier": 1.20,
            "prompt_override": extra_vocab_prompt,
        }
    else:
        raise ValueError(f"unsupported iteration: {iteration}")


def call_redesign(payload: dict[str, Any]) -> dict[str, Any]:
    r = requests.post(
        f"{REDESIGN_URL}/v1/generate_redesign", json=payload, timeout=REQUEST_TIMEOUT_S
    )
    if r.status_code != 200:
        raise RuntimeError(f"redesign {r.status_code}: {r.text[:500]}")
    return r.json()


def reflect_one_room(room_id: str, max_iterations: int = 2) -> dict[str, Any]:
    base = load_metrics(room_id)
    log_path = REFLECT_DIR / f"{room_id}_iteration_log.json"
    previous_log: dict[str, Any] = {}
    if log_path.exists():
        previous_log = json.loads(log_path.read_text())

    # Start from base (iter 0) result.
    iterations: list[dict[str, Any]] = []
    base_judge = base.get("judge_details") or {}
    iterations.append(
        {
            "iteration": 0,
            "provider": base.get("provider"),
            "render_local_path": base.get("render_local_path"),
            "scores": {
                k: base_judge.get(k)
                for k in (
                    "architectural_integrity",
                    "photorealism",
                    "style_fidelity",
                    "editorial_quality",
                    "spatial_composition",
                    "object_coherence",
                    "composite",
                )
            },
            "beats_collov": base_judge.get("beats_collov", False),
            "changes_applied": [],
        }
    )

    best = iterations[0]
    final_status = "pass" if base_judge.get("beats_collov") else "in_progress"
    extra_prompt = build_reflection_prompt(
        base["archetype"], base.get("prompt_used", "")
    )

    for i in range(1, max_iterations + 1):
        if final_status == "pass":
            break
        try:
            payload = apply_iteration_params(i, base, extra_prompt)
            print(
                f"[reflect] {room_id} iter{i}  str={payload['strength_override']}  "
                f"guid={payload['guidance_override']}  lora*={payload['lora_scale_multiplier']}  "
                f"seed={payload['seed']}"
            )
            body = call_redesign(payload)
            render_url = body["redesign_url"]
            out_path = REFLECT_OUT / f"{room_id}_iter{i}.jpg"
            out_path.write_bytes(requests.get(render_url, timeout=60).content)

            # Judge against the reflection render (not the base render).
            judge_artifact = judge_score_room(
                room_id, run_label=f"iter{i}", render_override=out_path
            )
            parsed = judge_artifact["parsed"]

            record = {
                "iteration": i,
                "render_url": render_url,
                "render_local_path": str(out_path.relative_to(ROOT)),
                "params": {
                    "strength": payload["strength_override"],
                    "guidance_scale": payload["guidance_override"],
                    "lora_scale_multiplier": payload["lora_scale_multiplier"],
                    "seed": payload["seed"],
                    "prompt_override": True,
                },
                "scores": {
                    k: parsed.get(k)
                    for k in (
                        "architectural_integrity",
                        "photorealism",
                        "style_fidelity",
                        "editorial_quality",
                        "spatial_composition",
                        "object_coherence",
                        "composite",
                    )
                },
                "beats_collov": parsed.get("beats_collov", False),
                "failure_modes": parsed.get("failure_modes", []),
                "provider": body.get("provider"),
                "cost_usd": body.get("cost_usd"),
                "latency_ms": body.get("latency_ms"),
                "changes_applied": {
                    1: [
                        "strength 0.82→0.70 (architectural preservation)",
                        "guidance 3.5→4.2",
                        "lora_scale_multiplier=1.12",
                        "prompt vocabulary strengthened",
                    ],
                    2: [
                        "strength 0.82→0.62",
                        "guidance 3.5→5.0",
                        "lora_scale_multiplier=1.20",
                        "seed rotated (+1000)",
                        "prompt vocabulary strengthened",
                    ],
                }[i],
            }
            iterations.append(record)

            new_composite = float(parsed.get("composite", 0.0))
            best_composite = float(best["scores"].get("composite") or 0.0)
            if new_composite > best_composite:
                best = record

            if parsed.get("beats_collov"):
                final_status = "pass"
                break
        except Exception as exc:  # noqa: BLE001
            iterations.append(
                {
                    "iteration": i,
                    "error": f"{type(exc).__name__}:{exc}",
                    "beats_collov": False,
                }
            )
            print(f"[reflect] {room_id} iter{i} ERROR: {exc}")

    if final_status != "pass":
        final_status = "fail_after_iterations" if iterations[-1].get("iteration") else "unchanged"

    log = {
        "room_id": room_id,
        "archetype": base["archetype"],
        "iterations": iterations,
        "best_iteration": best.get("iteration"),
        "best_composite": best["scores"].get("composite"),
        "best_beats_collov": best.get("beats_collov", False),
        "final_status": final_status,
        "generated_at_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    # Merge log (preserving previous attempts if any).
    if previous_log.get("iterations"):
        # Append if we ran more attempts this time.
        log["history"] = previous_log.get("history", []) + [previous_log]
    log_path.write_text(json.dumps(log, indent=2))

    # Merge best-of-iteration into the per-room metrics if it beats the base.
    base_composite = float((base.get("judge_details") or {}).get("composite") or 0.0)
    if (
        best.get("iteration", 0) > 0
        and float(best["scores"].get("composite") or 0.0) > base_composite
    ):
        base["best_of_iteration"] = best["iteration"]
        base["best_render_local_path"] = best.get("render_local_path")
        base["best_beats_collov"] = best.get("beats_collov")
        base["best_scores"] = best.get("scores")
        base["reflection_final_status"] = final_status
        (METRICS_DIR / f"{room_id}.json").write_text(json.dumps(base, indent=2))

    print(
        f"[reflect] {room_id} DONE  final={final_status}  "
        f"best_iter={best.get('iteration')}  best_comp={best['scores'].get('composite')}"
    )
    return log


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rooms", nargs="*")
    ap.add_argument("--iterations", type=int, default=2)
    args = ap.parse_args()

    if args.rooms:
        rids = args.rooms
    else:
        # Default: all rooms where base judge did not beat Collov.
        rids = []
        for p in sorted(METRICS_DIR.glob("room-*.json")):
            d = json.loads(p.read_text())
            details = d.get("judge_details") or {}
            if not details.get("beats_collov", False):
                rids.append(p.stem)

    print(f"[reflect] running {len(rids)} rooms (up to {args.iterations} iters each)")
    logs = []
    for rid in rids:
        try:
            logs.append(reflect_one_room(rid, max_iterations=args.iterations))
        except Exception as exc:
            print(f"[reflect] {rid} FATAL: {exc}")
            logs.append({"room_id": rid, "error": str(exc)})

    # Summary
    passed = sum(1 for l in logs if l.get("final_status") == "pass")
    print()
    print(f"[reflect] DONE  {passed}/{len(logs)} rooms now beat Collov")
    return 0


if __name__ == "__main__":
    sys.exit(main())
