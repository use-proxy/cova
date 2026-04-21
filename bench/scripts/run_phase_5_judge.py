"""Phase 5 — Collov-calibrated vision judge (Task 5.6).

Scores each Cova redesign render against the Collov AI reference
renders. Uses Claude Sonnet 4.5 with vision, 6 calibration axes + a
weighted composite, and a strict JSON-only response contract.

The 4 Collov PNGs in ``benchmarks/competitors/collovai/`` score ~7.1
composite per the calibration done in the phase-5 plan. Cova's gate:
``composite >= 7.5 AND style_fidelity >= 7.0``.

Writes:
  * ``bench/phase-5-redesign/metrics/room-XX.json`` — merges judge scores
    into the existing metrics JSON (preserves bench fields).
  * ``bench/phase-5-redesign/judge/judge_runs/<run-id>/room-XX.json`` —
    raw judge call per-room (diagnostic; reflection loop writes more).

Invocation:
    python3 bench/scripts/run_phase_5_judge.py                 # all 15
    python3 bench/scripts/run_phase_5_judge.py room-01 room-02 # subset
    python3 bench/scripts/run_phase_5_judge.py --run-id iter1  # custom run label
"""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent.parent
ROOMS_DIR = ROOT / "bench" / "rooms"
COLLOV_DIR = ROOT / "benchmarks" / "competitors" / "collovai"
OUT_ROOT = ROOT / "bench" / "phase-5-redesign"
METRICS_DIR = OUT_ROOT / "metrics"
OUTPUTS_DIR = OUT_ROOT / "outputs"
JUDGE_DIR = OUT_ROOT / "judge"
JUDGE_DIR.mkdir(parents=True, exist_ok=True)

JUDGE_MODEL = os.getenv("PHASE5_JUDGE_MODEL", "claude-sonnet-4-5")
JUDGE_MAX_TOKENS = 2048
JUDGE_TEMPERATURE = 0.0  # deterministic scoring
MAX_PARALLEL = int(os.getenv("PHASE5_JUDGE_PARALLEL", "3"))

# Human-readable archetype names for the judge prompt. These are
# internal-evaluation tooling only — not user-facing strings — so the
# CLAUDE.md Rule-8 forbidden-name guard does not apply here.
ARCHETYPE_LABELS: dict[str, str] = {
    "COVAJAPANDI":     "Warm Japandi",
    "COVASCANDINAV":   "Nordic Calm / Scandinavian Minimal",
    "COVABIOPHILIC":   "Biophilic Interior",
    "COVAMINIMAL":     "Pure Minimal",
    "COVAMIDCENTURY":  "Retro Mid-Century",
    "COVACOASTAL":     "Coastal Bright",
    "COVABOHEMIAN":    "Maximalist Eclectic / Bohemian",
    "COVAINDUSTRIAL":  "Industrial Loft",
    "COVAFARMHOUSE":   "Heritage / Farmhouse",
    "COVAARTDECO":     "Dark Moody Glam / Art Deco",
}


def load_api_key() -> None:
    if os.getenv("ANTHROPIC_API_KEY"):
        return
    for env_path in (ROOT / "apps/web/.env.local", ROOT / ".env.local"):
        if not env_path.exists():
            continue
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("ANTHROPIC_API_KEY="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                os.environ["ANTHROPIC_API_KEY"] = val
                return
    raise RuntimeError("ANTHROPIC_API_KEY not set")


load_api_key()
import anthropic  # noqa: E402

client = anthropic.Anthropic()


def describe_room(filename: str) -> str:
    """Extract human-readable room description from bench filename.

    e.g. ``room-01_bedroom-cat-popcorn.webp`` → ``bedroom with cat and
    popcorn ceiling``.
    """
    stem = Path(filename).stem
    m = re.match(r"room-\d+_(.+)$", stem)
    if not m:
        return "interior room"
    parts = [p for p in m.group(1).split("-") if p]
    cleaned: list[str] = []
    for p in parts:
        # Light expansion on well-known suffixes.
        cleaned.append(
            {
                "tv": "TV",
                "led": "LED accents",
                "popcorn": "popcorn ceiling",
                "bay": "bay window",
                "piano": "piano",
                "cat": "cat",
                "floral": "floral rug",
                "stacked": "stacked stone",
                "empty": "empty space",
            }.get(p, p)
        )
    if cleaned:
        return f"{cleaned[0]} with {' and '.join(cleaned[1:])}" if len(cleaned) > 1 else cleaned[0]
    return "interior room"


def _sniff_mime(data: bytes, suffix: str) -> str:
    """Identify media type by magic bytes, not file extension.

    We often write flux-general output with a .webp name though the actual
    bytes are JPEG; the Anthropic API rejects the mismatch. Detect from
    bytes first, fall back to extension, final fallback is jpeg.
    """
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:3] == b"GIF":
        return "image/gif"
    ext = suffix.lower().lstrip(".")
    if ext in ("jpg", "jpeg"):
        return "image/jpeg"
    if ext == "png":
        return "image/png"
    if ext == "webp":
        return "image/webp"
    return "image/jpeg"


def load_image_b64(path: Path) -> tuple[str, str]:
    """Return (mime_type, base64_data) for Anthropic's image content blocks."""
    data = path.read_bytes()
    mime = _sniff_mime(data, path.suffix)
    return mime, base64.standard_b64encode(data).decode("ascii")


def load_collov_references() -> list[dict[str, Any]]:
    """Return image content blocks for the 4 Collov calibration PNGs."""
    blocks: list[dict[str, Any]] = []
    for p in sorted(COLLOV_DIR.glob("collov_*.png")):
        mime, b64 = load_image_b64(p)
        blocks.append(
            {
                "type": "image",
                "source": {"type": "base64", "media_type": mime, "data": b64},
            }
        )
    if len(blocks) != 4:
        raise RuntimeError(
            f"expected 4 Collov reference PNGs in {COLLOV_DIR}, got {len(blocks)}"
        )
    return blocks


def build_prompt(archetype_label: str, room_description: str) -> str:
    """The exact judge prompt specified in the Phase 5 spec."""
    return f"""You are a professional interior design critic evaluating AI-generated room renders. You must be HARSH and DISCRIMINATING. Your scores will be used to gate a product launch.

You have been shown 4 reference renders produced by Collov AI as calibration:
[collov_1.png, collov_2.png, collov_3.png, collov_4.png]

Calibration context: The Collov renders score approximately 7.1/10 overall. They are technically competent but aesthetically generic. Collov's weakness is style fidelity — their renders could be from any AI tool. Their strength is architectural preservation and photorealism.

Now evaluate the Cova render. Score each axis 0–10. Do NOT give the benefit of the doubt. A 7.0 means "comparable to Collov." An 8.0 means "noticeably better than Collov." A 10 means "could be published in Architectural Digest."

AXES:

1. architectural_integrity (0-10)
Does the render preserve the original room's architecture (walls, ceiling, floor, windows, built-in features) without distortion, morphing, or warping?
- 9-10: Perfect preservation. Every architectural element is exact.
- 7-8: Minor softening or color shift but structure intact.
- 5-6: Visible distortion of walls, floor, or windows.
- 0-4: Architecture is broken. Geometry wrong. Fail.

2. photorealism (0-10)
Does this look like a real photograph taken with a camera?
- 9-10: Indistinguishable from professional photography. Perfect lighting, shadows, material textures.
- 7-8: Looks real but with minor AI tells (slightly too smooth surfaces, slightly off shadows).
- 5-6: Clearly AI-generated. Plastic textures, wrong shadows, oversaturated.
- 0-4: Obvious AI artifact. Not photorealistic.

3. style_fidelity (0-10)
Does the render actually look like the specified archetype (stated below)? Is the style COMMITTED and RECOGNIZABLE, or generic?
- 9-10: Any interior designer would immediately identify this style. Strong, opinionated, distinctive.
- 7-8: The style is present and recognizable, better than "generic neutral."
- 5-6: Weak style expression. Could be any of 3-4 different styles. Generic.
- 0-4: No discernible style. Could have been generated without any style instruction.
Collov reference scores ~5.5 on this axis. To score above 7, the render must be NOTICEABLY more style-committed than the Collov references.

4. editorial_quality (0-10)
Could this image appear in Apartment Therapy, Dezeen, or Architectural Digest?
- 9-10: Yes, without hesitation. Magazine-quality composition, lighting, and curation.
- 7-8: Would fit a design blog or high-quality listing. Professional but not editorial.
- 5-6: Looks like a nice AirBnB listing. Clean but not curated.
- 0-4: Stock photography feel. No editorial sensibility.
Collov reference scores ~6 on this axis.

5. spatial_composition (0-10)
Is the furniture arrangement believable and well-composed for the room?
- 9-10: Perfect. Furniture placed as a professional stager would arrange it. Clear focal points, balanced density.
- 7-8: Well-composed with minor oddities (slightly off-scale item, furniture touching wall unnaturally).
- 5-6: Acceptable but something is wrong — too sparse, too crowded, or awkward arrangement.
- 0-4: Composition fails. Floating objects, impossible furniture placement, completely wrong scale.

6. object_coherence (0-10)
Do all the objects in the render belong together? Do they form a unified design?
- 9-10: Every object was clearly chosen by a designer. Perfect material, color, and style consistency.
- 7-8: Objects mostly work together with 1-2 minor mismatches.
- 5-6: Noticeable style clashes (a modern sofa next to an ornate traditional lamp, etc.).
- 0-4: Random object selection. No coherent design intent.

IMPORTANT SCORING RULES:
- If architectural_integrity < 6, cap the overall composite at 6.0 regardless of other scores.
- If photorealism < 6, cap the overall composite at 6.5.
- A "safe" or "generic" render should score 5-6 on style_fidelity, NOT 7-8. Reserve 7+ for renders that are genuinely style-committed.
- Compare explicitly to the Collov references when assigning scores. If a Cova render looks the same as a Collov render, score it similarly (around 7.1 composite).

SPECIFIED ARCHETYPE FOR THIS RENDER: {archetype_label}
ORIGINAL ROOM: {room_description}

Respond in JSON only, no markdown, no explanation outside the JSON:
{{
  "architectural_integrity": <int 0-10>,
  "photorealism": <int 0-10>,
  "style_fidelity": <int 0-10>,
  "editorial_quality": <int 0-10>,
  "spatial_composition": <int 0-10>,
  "object_coherence": <int 0-10>,
  "composite": <float, weighted average: arch*0.25 + photo*0.20 + style*0.25 + edit*0.15 + spatial*0.10 + coherence*0.05>,
  "beats_collov": <bool, true if composite >= 7.5 AND style_fidelity >= 7.0>,
  "failure_modes": [<list of specific failure modes, empty if none>],
  "improvement_suggestions": [<list of specific, actionable suggestions for the reflection loop>],
  "collov_comparison": "<one sentence: how this render compares to the Collov reference renders specifically>"
}}"""


def parse_judge_response(text: str) -> dict[str, Any]:
    """Parse JSON judge response, handling light markdown-wrapping defensively."""
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t)
        t = re.sub(r"\s*```$", "", t)
    # Find first '{' and matching last '}'
    start = t.find("{")
    end = t.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"No JSON object found in judge response: {text[:200]}")
    return json.loads(t[start : end + 1])


def _call_with_retry(collov_blocks, prompt_text, render_block, max_retries=3) -> Any:
    last_err = None
    for attempt in range(max_retries):
        try:
            return client.messages.create(
                model=JUDGE_MODEL,
                max_tokens=JUDGE_MAX_TOKENS,
                temperature=JUDGE_TEMPERATURE,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            *collov_blocks,
                            render_block,
                            {"type": "text", "text": prompt_text},
                        ],
                    }
                ],
            )
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"judge_api:{type(last_err).__name__}:{last_err}") from last_err


def score_room(
    room_id: str, run_label: str = "base", render_override: Path | None = None
) -> dict[str, Any]:
    """Score one room's redesign via the judge.

    Merges the scores back into bench/phase-5-redesign/metrics/room-XX.json
    and writes the raw judge payload to the run_label subdirectory.
    """
    metrics_path = METRICS_DIR / f"{room_id}.json"
    if not metrics_path.exists():
        raise FileNotFoundError(f"missing bench metrics: {metrics_path}")
    metrics = json.loads(metrics_path.read_text())
    archetype = metrics["archetype"]
    archetype_label = ARCHETYPE_LABELS.get(archetype, archetype)
    room_type = metrics.get("room_type", "room")

    original_path = next(ROOMS_DIR.glob(f"{room_id}*"))
    room_description = (
        f"{room_type.replace('_', ' ')} — " + describe_room(original_path.name)
    )

    render_path = (
        render_override
        if render_override is not None
        else OUTPUTS_DIR / f"{room_id}_redesign.webp"
    )
    if not render_path.exists():
        raise FileNotFoundError(f"missing render: {render_path}")

    collov_blocks = load_collov_references()
    r_mime, r_b64 = load_image_b64(render_path)
    render_block = {
        "type": "image",
        "source": {"type": "base64", "media_type": r_mime, "data": r_b64},
    }
    prompt_text = build_prompt(archetype_label, room_description)

    t0 = time.perf_counter()
    resp = _call_with_retry(collov_blocks, prompt_text, render_block)
    wall_s = time.perf_counter() - t0
    text_block = next((b for b in resp.content if b.type == "text"), None)
    if not text_block:
        raise RuntimeError(f"judge: no text block in response ({resp.stop_reason})")
    parsed = parse_judge_response(text_block.text)

    # Record raw call artifact.
    run_dir = JUDGE_DIR / "judge_runs" / run_label
    run_dir.mkdir(parents=True, exist_ok=True)
    raw_artifact = {
        "room_id": room_id,
        "run_label": run_label,
        "archetype": archetype,
        "archetype_label": archetype_label,
        "model": JUDGE_MODEL,
        "input_render_sha_prefix": r_b64[:32],
        "input_render_path": str(render_path.relative_to(ROOT)),
        "wall_s": round(wall_s, 2),
        "stop_reason": resp.stop_reason,
        "usage": {
            "input_tokens": resp.usage.input_tokens,
            "output_tokens": resp.usage.output_tokens,
        },
        "raw_text": text_block.text,
        "parsed": parsed,
    }
    (run_dir / f"{room_id}.json").write_text(json.dumps(raw_artifact, indent=2))

    # Merge summary into room metrics (base run only — reflection runs keep
    # per-iteration scores in their own tree).
    if run_label == "base":
        metrics["judge_score"] = parsed.get("composite")
        metrics["judge_details"] = parsed
        metrics["judge_model"] = JUDGE_MODEL
        metrics_path.write_text(json.dumps(metrics, indent=2))

    beats = bool(parsed.get("beats_collov", False))
    composite = float(parsed.get("composite", 0.0))
    style = int(parsed.get("style_fidelity", 0))
    print(
        f"[judge:{run_label}] {room_id}  arch={archetype:16s}  "
        f"composite={composite:4.2f}  style={style:>2}  "
        f"beats_collov={beats}  "
        f"in/out={resp.usage.input_tokens}/{resp.usage.output_tokens}  "
        f"dt={wall_s:.1f}s"
    )
    return raw_artifact


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rooms", nargs="*")
    ap.add_argument("--run-id", default="base")
    ap.add_argument("--serial", action="store_true")
    args = ap.parse_args()

    if args.rooms:
        rids = args.rooms
    else:
        rids = sorted(
            p.stem for p in METRICS_DIR.glob("room-*.json")
        )

    print(f"[judge] model={JUDGE_MODEL}  run={args.run_id}  rooms={len(rids)}")
    results: list[dict] = []
    if args.serial:
        for rid in rids:
            try:
                results.append(score_room(rid, args.run_id))
            except Exception as exc:
                print(f"[judge] ERROR {rid}: {exc}")
                results.append({"room_id": rid, "error": str(exc)})
    else:
        with ThreadPoolExecutor(max_workers=MAX_PARALLEL) as ex:
            futs = {
                ex.submit(score_room, rid, args.run_id): rid for rid in rids
            }
            for fut in as_completed(futs):
                rid = futs[fut]
                try:
                    results.append(fut.result())
                except Exception as exc:
                    print(f"[judge] ERROR {rid}: {exc}")
                    results.append({"room_id": rid, "error": str(exc)})

    # Roll-up summary for this run label.
    parsed_results = [
        r for r in results if "parsed" in r and isinstance(r["parsed"], dict)
    ]
    beats = sum(1 for r in parsed_results if r["parsed"].get("beats_collov"))
    if parsed_results:
        mean_composite = sum(
            float(r["parsed"].get("composite", 0.0)) for r in parsed_results
        ) / len(parsed_results)
        mean_style = sum(
            int(r["parsed"].get("style_fidelity", 0)) for r in parsed_results
        ) / len(parsed_results)
    else:
        mean_composite = 0.0
        mean_style = 0.0
    rollup = {
        "run_label": args.run_id,
        "model": JUDGE_MODEL,
        "n_rooms": len(parsed_results),
        "n_beats_collov": beats,
        "mean_composite": round(mean_composite, 3),
        "mean_style_fidelity": round(mean_style, 3),
        "generated_at_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    rollup_path = JUDGE_DIR / f"rollup_{args.run_id}.json"
    rollup_path.write_text(json.dumps(rollup, indent=2))
    print()
    print(
        f"[judge] rollup run={args.run_id}  "
        f"beats_collov={beats}/{len(parsed_results)}  "
        f"mean_composite={mean_composite:.2f}  "
        f"mean_style={mean_style:.2f}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
