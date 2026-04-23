#!/usr/bin/env python3
"""FLUX Kontext instruction-edit bench — run the same empty-room prompt across
all 15 bench rooms, capture Claude Vision verdicts, emit HTML gallery.

Output: /tmp/empty-room-bakeoff/kontext-bench/bench.html
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import cv2  # type: ignore
import numpy as np
import requests  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from modal_pipeline.empty_room_v3 import (  # noqa: E402
    _load_fal_key,
    preprocess,
    upload_image_to_fal,
)
from scripts.empty_room_bakeoff import (  # noqa: E402
    _load_anthropic_key,
    call_flux_kontext,
    download_image_to_bgr,
)

logger = logging.getLogger("kontext-bench")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

OUT_DIR = Path("/tmp/empty-room-bakeoff/kontext-bench")
OUT_DIR.mkdir(parents=True, exist_ok=True)

BENCH_DIR = ROOT / "bench" / "rooms"
COST_CAP = 5.0
COST_KONTEXT = 0.17
COST_CLAUDE = 0.03

_COST = 0.0


def add_cost(x: float) -> None:
    global _COST
    _COST += x


INSTRUCTION_PROMPT = (
    "Remove all furniture, bedding, rugs, clothing, backpacks, boxes, electronics, "
    "personal items, decor, plants, lamps, posters, and clutter from this room. "
    "Keep the exact same walls, wall color, wall texture, ceiling, ceiling color, "
    "ceiling fan, pendant lights, chandeliers, recessed lights, floor, floor material, "
    "windows, window frames, window blinds, shutters, curtains if architectural, "
    "doors, door frames, crown molding, baseboards, wainscoting, built-in shelves, "
    "built-in cabinets, fireplaces, mantels, radiators, vents, wall text, wall letters, "
    "permanent signage, exposed brick, stone walls, wood paneling, beams, and all "
    "architectural features exactly as they are. The result should be a completely "
    "empty barren room with only the architecture visible, as if the occupants moved "
    "out and the room was professionally cleaned and vacuumed. Same camera angle, "
    "same lighting, same room dimensions."
)

CLAUDE_VERDICT_PROMPT = """You are evaluating whether an AI successfully removed ALL furniture and clutter from a room photo while preserving the architecture.

INPUT (original room): first image
OUTPUT (attempted empty room): second image

Evaluate the OUTPUT strictly:

1. Is the OUTPUT truly empty? It should contain ONLY walls, floor, ceiling, windows (with blinds/shutters if architectural), doors, built-ins, ceiling fans, ceiling fixtures, wall text if architectural, and architectural features (moldings, radiators, vents).

2. It should contain NOTHING ELSE — no furniture, no bedding, no rugs, no clothing, no electronics, no plants, no backpacks, no clutter. Also no GHOSTS or blurred remnants of removed items.

3. Is the architecture preserved? Walls should be same color, floor same material, ceiling features same, windows same, fan same, wall text same.

Return STRICT JSON only:
{
  "is_empty": true/false,
  "residual_items_visible": ["list of items still visible"],
  "ghost_artifacts_visible": ["list of blurred remnants or outlines"],
  "architecture_preserved": true/false,
  "architecture_changes": ["list of changed elements"],
  "quality_score": 0-10,
  "one_line_verdict": "string"
}"""


def claude_verdict(input_bgr: np.ndarray, output_bgr: np.ndarray) -> dict:
    import anthropic  # type: ignore
    client = anthropic.Anthropic()

    def to_b64(bgr: np.ndarray) -> str:
        ok, buf = cv2.imencode(".png", bgr)
        if not ok:
            raise RuntimeError("png encode")
        return base64.b64encode(buf.tobytes()).decode("ascii")

    try:
        resp = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": "image/png", "data": to_b64(input_bgr)},
                        },
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": "image/png", "data": to_b64(output_bgr)},
                        },
                        {"type": "text", "text": CLAUDE_VERDICT_PROMPT},
                    ],
                }
            ],
        )
        add_cost(COST_CLAUDE)
        t = resp.content[0].text.strip() if resp.content else ""
        if t.startswith("```"):
            t = t.split("\n", 1)[1] if "\n" in t else t
            if t.endswith("```"):
                t = t[:-3]
            if t.startswith("json\n"):
                t = t[5:]
        s, e = t.find("{"), t.rfind("}")
        if s >= 0 and e > s:
            return json.loads(t[s:e + 1])
        return {"quality_score": 0, "one_line_verdict": "parse_fail", "_raw": t[:300]}
    except Exception as exc:  # noqa: BLE001
        logger.warning("claude verdict failed: %s", exc)
        return {"quality_score": 0, "one_line_verdict": f"error: {exc}"}


def process_room(room_path: Path) -> dict:
    """Run Kontext + verdict on one room. Returns dict summary."""
    room_id = room_path.stem  # e.g. room-01_bedroom-cat-popcorn
    # Use just the "room-XX" prefix for the filename as the user requested
    short_id = room_id.split("_")[0]  # room-01

    t0 = time.time()
    try:
        pre = preprocess(str(room_path))
        # Save working input copy for HTML
        input_path = OUT_DIR / f"{short_id}_input.png"
        cv2.imwrite(str(input_path), pre.working_bgr)

        fal_url = upload_image_to_fal(pre.working_bgr)
        out_url = call_flux_kontext(fal_url, INSTRUCTION_PROMPT)
        add_cost(COST_KONTEXT)

        output_bgr = download_image_to_bgr(out_url, (pre.working_bgr.shape[0], pre.working_bgr.shape[1]))
        output_path = OUT_DIR / f"{short_id}_empty.png"
        cv2.imwrite(str(output_path), output_bgr)

        verdict = claude_verdict(pre.working_bgr, output_bgr)

        elapsed = time.time() - t0
        logger.info(
            "%s done in %.1fs — score=%s/10 verdict=%s",
            short_id, elapsed, verdict.get("quality_score"),
            verdict.get("one_line_verdict", "")[:80],
        )
        return {
            "room": room_id,
            "short_id": short_id,
            "status": "ok",
            "input_rel": f"{short_id}_input.png",
            "output_rel": f"{short_id}_empty.png",
            "verdict": verdict,
            "elapsed_s": round(elapsed, 1),
        }
    except Exception as exc:  # noqa: BLE001
        logger.error("%s FAILED: %s\n%s", room_id, exc, traceback.format_exc())
        return {
            "room": room_id,
            "short_id": short_id,
            "status": "fail",
            "error": f"{type(exc).__name__}: {exc}",
        }


def generate_html(rows: list[dict], total_cost: float, total_elapsed: float) -> str:
    ok_rows = [r for r in rows if r["status"] == "ok"]
    fail_rows = [r for r in rows if r["status"] != "ok"]
    scores = [r["verdict"].get("quality_score", 0) for r in ok_rows if isinstance(r["verdict"].get("quality_score"), (int, float))]

    score_8_plus = sum(1 for s in scores if s >= 8)
    residual_count = sum(1 for r in ok_rows if r["verdict"].get("residual_items_visible"))
    arch_drift = sum(1 for r in ok_rows if not r["verdict"].get("architecture_preserved", True))

    avg_score = (sum(scores) / len(scores)) if scores else 0.0

    summary_html = f"""<div class="summary">
  <div><b>Rooms:</b> {len(ok_rows)}/{len(rows)} succeeded</div>
  <div><b>Claude quality score ≥ 8:</b> {score_8_plus} / {len(ok_rows)}</div>
  <div><b>Rooms with residual items (Claude-flagged):</b> {residual_count} / {len(ok_rows)}</div>
  <div><b>Rooms with architectural drift (Claude-flagged):</b> {arch_drift} / {len(ok_rows)}</div>
  <div><b>Mean Claude score:</b> {avg_score:.2f} / 10</div>
  <div><b>Total cost:</b> ${total_cost:.2f} / cap $5</div>
  <div><b>Total runtime:</b> {total_elapsed:.0f}s</div>
</div>"""

    row_html = []
    for r in rows:
        short = r["short_id"]
        if r["status"] != "ok":
            row_html.append(f"""<div class="row fail">
  <div class="name">{r["room"]}</div>
  <div class="error">FAIL: {r.get("error", "")}</div>
</div>""")
            continue
        v = r["verdict"]
        score = v.get("quality_score", 0)
        is_empty = v.get("is_empty", False)
        arch_ok = v.get("architecture_preserved", False)
        verdict_line = v.get("one_line_verdict", "")
        residual = v.get("residual_items_visible", [])
        ghosts = v.get("ghost_artifacts_visible", [])
        arch_changes = v.get("architecture_changes", [])

        score_class = "good" if score >= 8 else ("meh" if score >= 5 else "bad")
        pretty = json.dumps(v, indent=2)

        row_html.append(f"""<div class="row">
  <div class="cell input">
    <div class="label">INPUT — {r["room"]}</div>
    <img src="{r["input_rel"]}" alt="input">
  </div>
  <div class="cell output">
    <div class="label">Kontext output ({r["elapsed_s"]}s)</div>
    <img src="{r["output_rel"]}" alt="output">
  </div>
  <div class="cell verdict">
    <div class="label">Claude verdict — <span class="score {score_class}">{score}/10</span></div>
    <div class="flags">
      <span class="{'good' if is_empty else 'bad'}">empty: {is_empty}</span>
      <span class="{'good' if arch_ok else 'bad'}">arch preserved: {arch_ok}</span>
    </div>
    <div class="one-line">{verdict_line}</div>
    {('<div class="list bad">residual: ' + ", ".join(residual) + '</div>') if residual else ''}
    {('<div class="list bad">ghosts: ' + ", ".join(ghosts) + '</div>') if ghosts else ''}
    {('<div class="list meh">arch changes: ' + ", ".join(arch_changes) + '</div>') if arch_changes else ''}
    <details><summary>raw JSON</summary><pre>{pretty}</pre></details>
  </div>
</div>""")

    html = f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>FLUX Kontext Bench — 15 rooms</title>
<style>
  body {{ background: #0a0a0a; color: #e5e5e5; font-family: -apple-system, 'Segoe UI', sans-serif; padding: 24px; max-width: 1800px; margin: 0 auto; }}
  h1, h2 {{ font-weight: 500; }}
  .summary {{ background: #141414; padding: 16px 24px; border-radius: 8px; margin-bottom: 32px; font-family: 'SF Mono', Consolas, monospace; font-size: 13px; line-height: 1.9; }}
  .summary b {{ color: #f5f5f5; }}
  .row {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px; background: #141414; border-radius: 8px; padding: 16px; border: 1px solid #232323; }}
  .row.fail {{ grid-template-columns: 1fr; color: #ff6b6b; }}
  .cell img {{ width: 100%; border-radius: 6px; display: block; object-fit: contain; max-height: 420px; background: #000; }}
  .label {{ font-size: 13px; font-weight: 500; margin-bottom: 10px; color: #f5f5f5; }}
  .verdict {{ font-size: 12px; line-height: 1.5; color: #bbb; }}
  .score.good {{ color: #4ade80; font-weight: 600; }}
  .score.meh {{ color: #fbbf24; font-weight: 600; }}
  .score.bad {{ color: #ff6b6b; font-weight: 600; }}
  .flags {{ margin: 8px 0; display: flex; gap: 12px; font-size: 11px; font-family: monospace; }}
  .flags span {{ padding: 2px 8px; border-radius: 4px; }}
  .flags .good {{ background: rgba(74,222,128,0.1); color: #4ade80; }}
  .flags .bad {{ background: rgba(255,107,107,0.1); color: #ff6b6b; }}
  .one-line {{ font-size: 12px; padding: 8px; background: #0a0a0a; border-radius: 4px; margin-bottom: 8px; }}
  .list {{ font-size: 11px; margin-top: 6px; font-family: monospace; padding: 6px 8px; border-radius: 4px; }}
  .list.bad {{ background: rgba(255,107,107,0.08); color: #ff6b6b; }}
  .list.meh {{ background: rgba(251,191,36,0.08); color: #fbbf24; }}
  details {{ margin-top: 8px; }}
  summary {{ font-size: 11px; color: #888; cursor: pointer; }}
  pre {{ font-size: 10px; color: #aaa; background: #0a0a0a; padding: 10px; border-radius: 4px; overflow-x: auto; max-height: 300px; }}
</style></head>
<body>
<h1>FLUX Kontext Instruction-Edit Bench — 15 rooms, single prompt</h1>
{summary_html}
<h2>Per-room results</h2>
{chr(10).join(row_html)}
</body></html>
"""
    return html


def main() -> None:
    t0 = time.time()
    _load_fal_key()
    _load_anthropic_key()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        logger.warning("ANTHROPIC_API_KEY missing — verdicts will fail")

    rooms = sorted(BENCH_DIR.glob("room-*.webp"))
    logger.info("found %d bench rooms: %s", len(rooms), [r.name for r in rooms])

    # Run Kontext calls in parallel (3-way) to cut wall time; each call is ~60s
    rows: list[dict] = [None] * len(rooms)  # type: ignore
    with ThreadPoolExecutor(max_workers=3) as ex:
        futs = {ex.submit(process_room, p): i for i, p in enumerate(rooms)}
        for fut in as_completed(futs):
            i = futs[fut]
            if _COST > COST_CAP:
                logger.warning("cost cap exceeded, cancelling remainder")
                rows[i] = {"room": rooms[i].stem, "short_id": rooms[i].stem.split("_")[0],
                           "status": "fail", "error": f"cost cap (${_COST:.2f})"}
                continue
            rows[i] = fut.result()
            logger.info("running cost: $%.2f", _COST)

    # Backfill any None entries defensively
    for i, r in enumerate(rows):
        if r is None:
            rows[i] = {"room": rooms[i].stem, "short_id": rooms[i].stem.split("_")[0],
                       "status": "fail", "error": "no result"}

    elapsed = time.time() - t0
    (OUT_DIR / "kontext_bench_results.json").write_text(
        json.dumps({"rows": rows, "total_cost_usd": round(_COST, 3),
                    "total_elapsed_s": round(elapsed, 1)}, indent=2, default=str)
    )

    html = generate_html(rows, _COST, elapsed)
    (OUT_DIR / "bench.html").write_text(html)

    logger.info("done — total cost $%.2f, elapsed %.0fs", _COST, elapsed)
    logger.info("HTML: file://%s", OUT_DIR / "bench.html")


if __name__ == "__main__":
    main()
