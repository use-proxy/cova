#!/usr/bin/env python3
"""Gemini conditional routing — occlusion assessment gates whether to use the
anti-hallucination pipeline or the standard v1 prompt.

Pipeline:
  1. Occlusion assessment (Claude) — cheap binary router
  2. Branch:
       - needs_anti_hallucination=true → contextual pre-pass + anti-hal prompt
       - needs_anti_hallucination=false → standard v1 static prompt
  3. Strict emptiness audit
  4. One retry if residuals (with anti-hal clause if originally routed to anti-hal)

Targets: rooms 02, 05, 09, 10, 11, 14.

Output: /tmp/empty-room-bakeoff/gemini-conditional/gallery.html
"""

from __future__ import annotations

import base64
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

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from modal_pipeline.empty_room_v3 import (  # noqa: E402
    _load_fal_key,
    preprocess,
    upload_image_to_fal,
)
from scripts.empty_room_bakeoff import (  # noqa: E402
    _load_anthropic_key,
    download_image_to_bgr,
)
from scripts.gemini_bench import call_nano_banana_pro_edit, GEMINI_PROMPT  # noqa: E402
from scripts.gemini_retry_experiment import strict_audit  # noqa: E402
from scripts.gemini_antihallucinate import (  # noqa: E402
    claude_prepass,
    build_main_prompt,
    build_retry_prompt as build_retry_prompt_antihal,
    ANTI_HALLUCINATION_CLAUSE,
)

logger = logging.getLogger("gemini-cond")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")

OUT_DIR = Path("/tmp/empty-room-bakeoff/gemini-conditional")
OUT_DIR.mkdir(parents=True, exist_ok=True)

BENCH_DIR = ROOT / "bench" / "rooms"
TARGET_IDS = ["room-02", "room-05", "room-09", "room-10", "room-11", "room-14"]

COST_CAP = 4.0
COST_OCCLUSION = 0.02
COST_PREPASS = 0.03
COST_GEMINI = 0.25
COST_AUDIT = 0.05

_COST = 0.0


def add_cost(x: float) -> None:
    global _COST
    _COST += x


# ---------------------------------------------------------------------------
# Step 1: occlusion assessment
# ---------------------------------------------------------------------------

OCCLUSION_PROMPT = """Analyze this room photo. Determine whether removing the furniture and clutter would require the image editor to paint in significant wall, floor, or ceiling regions that are currently covered. This is true when items are mounted on walls, when furniture is pushed flush against walls blocking them, when curtains or drapes cover wall sections, or when large freestanding items occlude architectural regions.

This is false when items are freestanding in the middle of the room with walls fully visible behind them, when items are small and don't block significant architecture, or when there's nothing significant behind the items being removed.

Return STRICT JSON only:
{
  "needs_anti_hallucination": true/false,
  "reason": "one-line explanation",
  "items_causing_occlusion": ["list of specific items if true, empty array if false"]
}"""


def claude_occlusion_assess(input_bgr: np.ndarray) -> dict:
    import anthropic  # type: ignore
    client = anthropic.Anthropic()
    ok, buf = cv2.imencode(".png", input_bgr)
    if not ok:
        raise RuntimeError("png encode")
    b64 = base64.b64encode(buf.tobytes()).decode("ascii")
    resp = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=768,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
                    {"type": "text", "text": OCCLUSION_PROMPT},
                ],
            }
        ],
    )
    add_cost(COST_OCCLUSION)
    t = resp.content[0].text.strip() if resp.content else ""
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        if t.endswith("```"):
            t = t[:-3]
        if t.startswith("json\n"):
            t = t[5:]
    s, e = t.find("{"), t.rfind("}")
    if s < 0 or e <= s:
        return {"needs_anti_hallucination": True, "reason": "parse_fail", "items_causing_occlusion": []}
    return json.loads(t[s:e + 1])


# ---------------------------------------------------------------------------
# Simple retry prompt (standard path — no anti-hal clause)
# ---------------------------------------------------------------------------

def build_retry_prompt_standard(residuals: list[str]) -> str:
    items = ", ".join(str(x).strip() for x in residuals if str(x).strip())
    return (
        f"The image still contains: {items}. "
        "Remove each of these specifically while keeping walls, floor, ceiling, "
        "windows, doors, and all other architectural features exactly the same."
    )


# ---------------------------------------------------------------------------
# Per-room pipeline
# ---------------------------------------------------------------------------

def process_room(room_path: Path) -> dict:
    short_id = room_path.stem.split("_")[0]
    t0 = time.time()
    try:
        pre = preprocess(str(room_path))
        H, W = pre.working_bgr.shape[:2]
        cv2.imwrite(str(OUT_DIR / f"{short_id}_input.png"), pre.working_bgr)

        # Step 1 — occlusion assessment
        assessment = claude_occlusion_assess(pre.working_bgr)
        (OUT_DIR / f"{short_id}_occlusion.json").write_text(json.dumps(assessment, indent=2))
        needs_antihal = bool(assessment.get("needs_anti_hallucination"))
        path_taken = "anti-hallucination" if needs_antihal else "standard"
        logger.info("%s → %s (%s)", short_id, path_taken, assessment.get("reason", ""))

        # Step 2 — branch
        context: dict | None = None
        if needs_antihal:
            context = claude_prepass(pre.working_bgr)
            (OUT_DIR / f"{short_id}_context.json").write_text(json.dumps(context, indent=2))
            main_prompt = build_main_prompt(context.get("removal_context", []))
        else:
            main_prompt = GEMINI_PROMPT

        (OUT_DIR / f"{short_id}_main_prompt.txt").write_text(main_prompt)

        # Step 3 — Gemini edit
        fal_url = upload_image_to_fal(pre.working_bgr)
        out_url = call_nano_banana_pro_edit(fal_url, main_prompt)
        add_cost(COST_GEMINI)
        v1_bgr = download_image_to_bgr(out_url, (H, W))
        v1_rel = f"{short_id}_v1.png"
        cv2.imwrite(str(OUT_DIR / v1_rel), v1_bgr)

        # Step 4 — strict audit
        v1_audit = strict_audit(v1_bgr)
        add_cost(COST_AUDIT - 0.03)  # strict_audit charges 0.03; bump to 0.05

        iterations = [{
            "iteration": f"v1 ({path_taken})",
            "output_rel": v1_rel,
            "audit": v1_audit,
        }]
        logger.info(
            "%s v1 — score=%s residuals=%d",
            short_id, v1_audit.get("score"), len(v1_audit.get("residual_items") or []),
        )

        # Step 5 — one retry if residuals
        if v1_audit.get("residual_items"):
            retry_builder = build_retry_prompt_antihal if needs_antihal else build_retry_prompt_standard
            retry_prompt = retry_builder(v1_audit["residual_items"])
            (OUT_DIR / f"{short_id}_retry_prompt.txt").write_text(retry_prompt)

            v1_fal_url = upload_image_to_fal(v1_bgr)
            retry_out_url = call_nano_banana_pro_edit(v1_fal_url, retry_prompt)
            add_cost(COST_GEMINI)
            retry_bgr = download_image_to_bgr(retry_out_url, (H, W))
            retry_rel = f"{short_id}_retry.png"
            cv2.imwrite(str(OUT_DIR / retry_rel), retry_bgr)

            retry_audit = strict_audit(retry_bgr)
            add_cost(COST_AUDIT - 0.03)
            iterations.append({
                "iteration": "retry",
                "output_rel": retry_rel,
                "audit": retry_audit,
                "residuals_input": v1_audit["residual_items"],
            })
            logger.info(
                "%s retry — score=%s residuals=%d",
                short_id, retry_audit.get("score"), len(retry_audit.get("residual_items") or []),
            )

        elapsed = time.time() - t0
        final_it = iterations[-1]
        return {
            "room": room_path.stem,
            "short_id": short_id,
            "status": "ok",
            "path": path_taken,
            "occlusion_assessment": assessment,
            "context": context,
            "iterations": iterations,
            "final_score": final_it["audit"].get("score"),
            "final_residuals": final_it["audit"].get("residual_items", []),
            "input_rel": f"{short_id}_input.png",
            "elapsed_s": round(elapsed, 1),
        }
    except Exception as exc:  # noqa: BLE001
        logger.error("%s FAILED: %s\n%s", short_id, exc, traceback.format_exc())
        return {
            "room": room_path.stem, "short_id": short_id,
            "status": "fail", "error": f"{type(exc).__name__}: {exc}",
        }


# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------

def _score_cls(s):
    if not isinstance(s, (int, float)):
        return ""
    return "good" if s >= 8 else ("meh" if s >= 5 else "bad")


def generate_html(rows: list[dict], cost: float, elapsed: float) -> str:
    ok = [r for r in rows if r["status"] == "ok"]
    antihal_rows = [r for r in ok if r["path"] == "anti-hallucination"]
    standard_rows = [r for r in ok if r["path"] == "standard"]
    clean = sum(1 for r in ok if r.get("final_score") == 10)
    retry_used = sum(1 for r in ok if len(r.get("iterations", [])) > 1)

    routing_table = "".join(
        f"<tr><td><b>{r['short_id']}</b></td>"
        f"<td class='{'meh' if r['path'] == 'anti-hallucination' else 'good'}'>{r['path']}</td>"
        f"<td>{r['occlusion_assessment'].get('reason', '')}</td>"
        f"<td><span class='score {_score_cls(r['final_score'])}'>{r['final_score']}/10</span></td>"
        f"<td>{len(r.get('iterations', []))}</td>"
        f"<td>{r['elapsed_s']}s</td></tr>"
        for r in ok
    )

    summary = f"""<div class="summary">
  <h2 style="margin-top:0">Conditional routing — {len(rows)} rooms</h2>
  <table class="sumtab">
    <tr><td>Routed to anti-hallucination path</td><td><b>{len(antihal_rows)}</b>: {', '.join(r['short_id'] for r in antihal_rows) or '—'}</td></tr>
    <tr><td>Routed to standard path</td><td><b>{len(standard_rows)}</b>: {', '.join(r['short_id'] for r in standard_rows) or '—'}</td></tr>
    <tr><td>Fully clean (score = 10)</td><td><b class="good">{clean}</b> / {len(ok)}</td></tr>
    <tr><td>Retry used</td><td>{retry_used}</td></tr>
    <tr><td>Cost / elapsed</td><td>${cost:.2f} / cap ${COST_CAP:.0f} &middot; {elapsed:.0f}s</td></tr>
  </table>
  <div style="margin-top:16px"><b>Routing decisions:</b></div>
  <table class="routetab">
    <thead><tr><th>Room</th><th>Path</th><th>Reason</th><th>Final</th><th>Iters</th><th>Time</th></tr></thead>
    <tbody>{routing_table}</tbody>
  </table>
</div>"""

    # Per-room blocks: 5 cells per row — [input | occlusion JSON | path+prompt | final output | final verdict JSON]
    room_blocks = []
    for r in rows:
        sid = r["short_id"]
        if r["status"] != "ok":
            room_blocks.append(f"<div class='row fail'><h3>{r['room']}</h3><div>FAIL: {r.get('error','')}</div></div>")
            continue

        its = r["iterations"]
        final_it = its[-1]
        final_audit = final_it["audit"]
        final_score = final_audit.get("score", "—")
        final_residuals = final_audit.get("residual_items", [])
        assessment_pretty = json.dumps(r["occlusion_assessment"], indent=2)
        final_audit_pretty = json.dumps(final_audit, indent=2)

        path = r["path"]
        path_badge_cls = "meh" if path == "anti-hallucination" else "good"

        # If retry was used, show both v1 and retry stacked in the output cell
        if len(its) > 1:
            output_cell_inner = f"""
      <div class="sub-label">v1 ({its[0]['audit'].get('score')}/10)</div>
      <img src="{its[0]['output_rel']}" style="max-height:180px">
      <div class="sub-label" style="margin-top:8px">retry ({final_score}/10)</div>
      <img src="{final_it['output_rel']}" style="max-height:180px">
"""
        else:
            _final_rel = final_it["output_rel"]
            output_cell_inner = f'<img src="{_final_rel}">'

        path_detail = (
            f"<details><summary>pre-pass context JSON</summary><pre>{json.dumps(r['context'], indent=2)}</pre></details>"
            if r["context"] else ""
        )

        room_blocks.append(f"""<div class="row">
  <h3>{r['room']} &nbsp; <span class="score {path_badge_cls}">{path}</span> &nbsp; final <span class="score {_score_cls(final_score)}">{final_score}/10</span> &nbsp; <span class="elapsed">{r['elapsed_s']}s &middot; {len(its)} iter(s)</span></h3>
  <div class="grid5">
    <div class="cell">
      <div class="label">INPUT</div>
      <img src="{r['input_rel']}">
    </div>
    <div class="cell">
      <div class="label">Occlusion assessment</div>
      <pre>{assessment_pretty}</pre>
    </div>
    <div class="cell">
      <div class="label">Path taken: <span class="score {path_badge_cls}">{path}</span></div>
      <div class="notes">{r['occlusion_assessment'].get('reason', '')}</div>
      {path_detail}
      <details><summary>main prompt sent to Gemini</summary><pre class="prompt">{(OUT_DIR / f'{sid}_main_prompt.txt').read_text()}</pre></details>
    </div>
    <div class="cell">
      <div class="label">Final output — <span class="score {_score_cls(final_score)}">{final_score}/10</span></div>
      {output_cell_inner}
      {'<div class="flag bad">residual: ' + ', '.join(final_residuals[:4]) + '</div>' if final_residuals else '<div class="flag good">clean</div>'}
    </div>
    <div class="cell">
      <div class="label">Final verdict JSON</div>
      <pre>{final_audit_pretty}</pre>
    </div>
  </div>
</div>""")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Gemini conditional routing</title>
<style>
  body {{ background: #0a0a0a; color: #e5e5e5; font-family: -apple-system, 'Segoe UI', sans-serif; padding: 24px; max-width: 2400px; margin: 0 auto; }}
  h1, h2, h3 {{ font-weight: 500; }}
  .summary {{ background: #141414; padding: 20px 24px; border-radius: 8px; margin-bottom: 32px; font-size: 13px; line-height: 1.8; }}
  .sumtab, .routetab {{ width: 100%; border-collapse: collapse; font-family: 'SF Mono', monospace; font-size: 12px; margin-top: 8px; }}
  .sumtab td, .routetab td, .routetab th {{ padding: 6px 10px; border-bottom: 1px solid #232323; vertical-align: top; text-align: left; }}
  .sumtab td:first-child {{ color: #888; width: 260px; }}
  .routetab th {{ color: #888; font-weight: 500; }}
  .row {{ background: #141414; border-radius: 8px; padding: 16px; margin-bottom: 24px; border: 1px solid #232323; }}
  .row.fail {{ border-color: #ff6b6b; color: #ff6b6b; }}
  .row h3 {{ margin-top: 0; color: #ddd; font-size: 14px; }}
  .grid5 {{ display: grid; grid-template-columns: 1fr 1.1fr 1.1fr 1fr 1.1fr; gap: 12px; }}
  .cell img {{ width: 100%; border-radius: 6px; object-fit: contain; max-height: 340px; background: #000; display: block; }}
  .cell .notes {{ font-size: 11px; color: #bbb; padding: 8px; background: #0a0a0a; border-radius: 4px; margin-bottom: 8px; line-height: 1.4; }}
  .label {{ font-size: 12px; font-weight: 500; margin-bottom: 8px; color: #f5f5f5; }}
  .sub-label {{ font-size: 10px; color: #888; margin-bottom: 4px; font-family: monospace; }}
  .cell pre {{ margin: 0; font-size: 10px; line-height: 1.4; color: #aaa; background: #000; padding: 8px; border-radius: 4px; max-height: 320px; overflow-y: auto; white-space: pre-wrap; }}
  .cell pre.prompt {{ max-height: 220px; }}
  .flag {{ font-size: 10px; margin-top: 8px; padding: 5px 8px; border-radius: 4px; font-family: monospace; }}
  .flag.bad {{ background: rgba(255,107,107,0.08); color: #ff6b6b; }}
  .flag.good {{ background: rgba(74,222,128,0.06); color: #4ade80; }}
  .score {{ font-weight: 600; font-family: monospace; }}
  .score.good, .good {{ color: #4ade80; }}
  .score.meh, .meh {{ color: #fbbf24; }}
  .score.bad, .bad {{ color: #ff6b6b; }}
  .elapsed {{ color: #666; font-size: 11px; font-family: monospace; margin-left: 10px; }}
  details summary {{ font-size: 11px; color: #888; cursor: pointer; margin-top: 8px; }}
</style></head>
<body>
<h1>Gemini conditional routing — occlusion-gated anti-hallucination</h1>
{summary}
<h2>Per-room traces</h2>
{chr(10).join(room_blocks)}
</body></html>"""
    return html


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    t0 = time.time()
    _load_fal_key()
    _load_anthropic_key()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise RuntimeError("ANTHROPIC_API_KEY missing")

    all_rooms = sorted(BENCH_DIR.glob("room-*.webp"))
    rooms = [p for p in all_rooms if p.stem.split("_")[0] in TARGET_IDS]
    logger.info("targeting %d rooms: %s", len(rooms), [p.name for p in rooms])

    rows: list[dict] = [None] * len(rooms)  # type: ignore
    with ThreadPoolExecutor(max_workers=3) as ex:
        futs = {ex.submit(process_room, p): i for i, p in enumerate(rooms)}
        for fut in as_completed(futs):
            i = futs[fut]
            if _COST > COST_CAP:
                rows[i] = {"room": rooms[i].stem, "short_id": rooms[i].stem.split("_")[0],
                           "status": "fail", "error": f"cost cap (${_COST:.2f})"}
                continue
            rows[i] = fut.result()
            logger.info("running cost: $%.2f", _COST)

    for i, r in enumerate(rows):
        if r is None:
            rows[i] = {"room": rooms[i].stem, "short_id": rooms[i].stem.split("_")[0],
                       "status": "fail", "error": "no result"}

    elapsed = time.time() - t0
    (OUT_DIR / "gemini_conditional_results.json").write_text(
        json.dumps({"rows": rows, "total_cost_usd": round(_COST, 3),
                    "total_elapsed_s": round(elapsed, 1)}, indent=2, default=str)
    )
    html = generate_html(rows, _COST, elapsed)
    (OUT_DIR / "gallery.html").write_text(html)
    logger.info("done — $%.2f, %.0fs", _COST, elapsed)
    logger.info("HTML: file://%s", OUT_DIR / "gallery.html")


if __name__ == "__main__":
    main()
