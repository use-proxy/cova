#!/usr/bin/env python3
"""Kontext v2 — pre-flight architectural feature extraction → dynamic
CRITICALLY-PRESERVE instruction prompt → Kontext → Claude verdict.

Reuses v1 outputs from /tmp/empty-room-bakeoff/kontext-bench/ for side-by-side
comparison. Does NOT touch v1 artifacts.

Output: /tmp/empty-room-bakeoff/kontext-v2/bench.html
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
from scripts.kontext_bench import (  # noqa: E402
    claude_verdict,
)

logger = logging.getLogger("kontext-v2")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")

OUT_DIR = Path("/tmp/empty-room-bakeoff/kontext-v2")
INV_DIR = OUT_DIR / "inventories"
V1_DIR = Path("/tmp/empty-room-bakeoff/kontext-bench")
for d in (OUT_DIR, INV_DIR):
    d.mkdir(parents=True, exist_ok=True)

BENCH_DIR = ROOT / "bench" / "rooms"
COST_CAP = 8.0
COST_CLAUDE_EXTRACT = 0.03
COST_CLAUDE_VERDICT = 0.02
COST_KONTEXT = 0.17

ROOMS_TO_SHOW_INVENTORY = {"room-02", "room-09", "room-10", "room-14", "room-12"}

_COST = 0.0


def add_cost(x: float) -> None:
    global _COST
    _COST += x


EXTRACTION_PROMPT = """You are inventorying the architectural and distinctive features of this room photograph so that a downstream image-editor can be instructed NOT to change them when removing furniture.

Return STRICT JSON only (no markdown fences, no prose):
{
  "statement_walls": ["specific descriptions of visually distinctive walls — e.g. 'exposed red-brick wall on left side', 'wood paneling half-wall on right', 'stacked stone fireplace wall', 'green velvet accent wall behind bed', 'wall with LED strip lighting along ceiling'"],
  "fixtures_to_preserve": ["built-ins, ceiling fans, pendant lights, chandeliers, wall sconces, radiators, vents, TVs mounted, mirrors mounted, fireplaces, mantels, windows with blinds/shutters, wall text or lettering, permanent signage, exposed beams, crown molding, wainscoting, baseboards"],
  "window_count_and_positions": "e.g. '1 large bay window on back wall, 2 casement windows on left wall'",
  "distinctive_features": ["anything unusual — popcorn ceiling, sloped attic ceiling, arched doorway, herringbone floor pattern, gallery wall spot, any custom or non-generic architectural element"],
  "wall_color_description": "specific description — e.g. 'warm off-white / cream', 'sage green matte paint', 'cool grey-blue'",
  "floor_material": "e.g. 'medium-oak hardwood with visible grain', 'grey porcelain tile', 'beige wall-to-wall carpet', 'polished concrete'",
  "ceiling_description": "e.g. 'white flat ceiling with pendant light', 'sloped white attic ceiling', 'popcorn ceiling with one recessed fixture'",
  "camera_framing": "e.g. 'straight-on eye-level view from doorway', 'wide-angle 3/4 view from corner of room'"
}

Be specific and concrete. Name visual traits an image editor would need to preserve pixel-for-pixel. If a field doesn't apply, use an empty array or the string "none observed".
"""


def call_claude_extract(input_bgr: np.ndarray) -> dict:
    import anthropic  # type: ignore
    client = anthropic.Anthropic()
    ok, buf = cv2.imencode(".png", input_bgr)
    if not ok:
        raise RuntimeError("png encode")
    b64 = base64.b64encode(buf.tobytes()).decode("ascii")

    resp = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
                    {"type": "text", "text": EXTRACTION_PROMPT},
                ],
            }
        ],
    )
    add_cost(COST_CLAUDE_EXTRACT)
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
    raise RuntimeError(f"extraction JSON parse failed: {t[:300]}")


def build_dynamic_prompt(inv: dict) -> str:
    """Compose an instruction prompt with a CRITICALLY PRESERVE section built from
    the Claude-extracted inventory."""

    def flatten_list(label: str, values) -> list[str]:
        if not values:
            return []
        if isinstance(values, str):
            return [f"{label}: {values}"]
        out = []
        for v in values:
            v = str(v).strip()
            if v and v.lower() != "none observed":
                out.append(f"{label}: {v}")
        return out

    preserve_lines: list[str] = []
    preserve_lines += flatten_list("statement wall", inv.get("statement_walls"))
    preserve_lines += flatten_list("fixture", inv.get("fixtures_to_preserve"))
    preserve_lines += flatten_list("distinctive feature", inv.get("distinctive_features"))

    windows = inv.get("window_count_and_positions")
    if windows and str(windows).lower() not in ("none observed", "none"):
        preserve_lines.append(f"windows: {windows}")

    wall_color = inv.get("wall_color_description")
    if wall_color and str(wall_color).lower() not in ("none observed", "none"):
        preserve_lines.append(f"wall color: {wall_color}")

    floor = inv.get("floor_material")
    if floor and str(floor).lower() not in ("none observed", "none"):
        preserve_lines.append(f"floor material: {floor}")

    ceiling = inv.get("ceiling_description")
    if ceiling and str(ceiling).lower() not in ("none observed", "none"):
        preserve_lines.append(f"ceiling: {ceiling}")

    camera = inv.get("camera_framing", "")

    preserve_block = "\n".join(f"  - DO NOT change / DO NOT remove: {line}" for line in preserve_lines)

    return f"""Remove all furniture, bedding, rugs, clothing, backpacks, boxes, electronics, personal items, decor, plants, lamps, posters, and clutter from this room. The result must be a completely empty barren room with only the architecture visible, as if the occupants moved out and the room was professionally cleaned and vacuumed.

CRITICALLY PRESERVE (do not alter, repaint, or remove any of these — they are architectural, not furniture):
{preserve_block or "  - (no distinctive features detected — preserve generic walls/floor/ceiling/windows as-is)"}

Also keep exactly unchanged: walls, wall texture, ceiling, floor, all windows and window frames, doors, door frames, crown molding, baseboards, wainscoting, built-in shelves, built-in cabinets, fireplaces, mantels, radiators, vents, wall text or letters, permanent signage, exposed brick, stone walls, wood paneling, beams.

Same camera angle, same lighting direction and intensity, same room dimensions, same perspective. {('Camera framing: ' + camera) if camera else ''}"""


def process_room(room_path: Path) -> dict:
    short_id = room_path.stem.split("_")[0]
    t0 = time.time()
    try:
        pre = preprocess(str(room_path))
        input_path = OUT_DIR / f"{short_id}_input.png"
        cv2.imwrite(str(input_path), pre.working_bgr)

        # Step 1: extract inventory
        inv = call_claude_extract(pre.working_bgr)
        inv_path = INV_DIR / f"{short_id}.json"
        inv_path.write_text(json.dumps(inv, indent=2))

        # Step 2: build dynamic prompt
        prompt = build_dynamic_prompt(inv)
        (OUT_DIR / f"{short_id}_prompt.txt").write_text(prompt)

        # Step 3: run Kontext
        fal_url = upload_image_to_fal(pre.working_bgr)
        out_url = call_flux_kontext(fal_url, prompt)
        add_cost(COST_KONTEXT)
        output_bgr = download_image_to_bgr(
            out_url, (pre.working_bgr.shape[0], pre.working_bgr.shape[1])
        )
        output_path = OUT_DIR / f"{short_id}_empty.png"
        cv2.imwrite(str(output_path), output_bgr)

        # Step 4: Claude verdict
        verdict = claude_verdict(pre.working_bgr, output_bgr)
        add_cost(-0.03 + COST_CLAUDE_VERDICT)  # kontext_bench charges 0.03; correct the delta

        elapsed = time.time() - t0
        logger.info(
            "%s done in %.1fs — v2 score=%s/10  v: %s",
            short_id, elapsed, verdict.get("quality_score"),
            verdict.get("one_line_verdict", "")[:70],
        )
        return {
            "room": room_path.stem,
            "short_id": short_id,
            "status": "ok",
            "input_rel": f"{short_id}_input.png",
            "v2_output_rel": f"{short_id}_empty.png",
            "v1_output_abs": str(V1_DIR / f"{short_id}_empty.png"),
            "v1_input_abs": str(V1_DIR / f"{short_id}_input.png"),
            "inventory": inv,
            "inventory_rel": f"inventories/{short_id}.json",
            "prompt_rel": f"{short_id}_prompt.txt",
            "verdict": verdict,
            "elapsed_s": round(elapsed, 1),
        }
    except Exception as exc:  # noqa: BLE001
        logger.error("%s FAILED: %s\n%s", short_id, exc, traceback.format_exc())
        return {
            "room": room_path.stem, "short_id": short_id,
            "status": "fail", "error": f"{type(exc).__name__}: {exc}",
        }


def load_v1_scores() -> dict:
    """Read v1 kontext_bench results for comparison."""
    p = V1_DIR / "kontext_bench_results.json"
    if not p.exists():
        return {}
    data = json.loads(p.read_text())
    return {r["short_id"]: r for r in data.get("rows", []) if r.get("status") == "ok"}


def _copy_v1_images_into_v2(rows: list[dict]) -> None:
    """Copy v1 outputs into v2 dir so the HTML can load them relatively."""
    for r in rows:
        if r["status"] != "ok":
            continue
        src_in = Path(r["v1_input_abs"])
        src_out = Path(r["v1_output_abs"])
        if src_in.exists():
            dst = OUT_DIR / f"{r['short_id']}_v1_input.png"
            dst.write_bytes(src_in.read_bytes())
        if src_out.exists():
            dst = OUT_DIR / f"{r['short_id']}_v1_empty.png"
            dst.write_bytes(src_out.read_bytes())


def generate_html(rows: list[dict], v1_by_id: dict, total_cost: float, elapsed: float) -> str:
    ok_rows = [r for r in rows if r["status"] == "ok"]
    v2_scores = [r["verdict"].get("quality_score", 0) for r in ok_rows if isinstance(r["verdict"].get("quality_score"), (int, float))]
    v1_scores_list = []
    deltas = []
    improved = 0
    regressed = 0
    same = 0
    for r in ok_rows:
        sid = r["short_id"]
        v2s = r["verdict"].get("quality_score", 0)
        v1e = v1_by_id.get(sid, {})
        v1s = v1e.get("verdict", {}).get("quality_score", None) if v1e else None
        if v1s is None:
            continue
        v1_scores_list.append(v1s)
        delta = v2s - v1s
        deltas.append((sid, v1s, v2s, delta))
        if delta > 0:
            improved += 1
        elif delta < 0:
            regressed += 1
        else:
            same += 1

    v2_mean = (sum(v2_scores) / len(v2_scores)) if v2_scores else 0.0
    v1_mean = (sum(v1_scores_list) / len(v1_scores_list)) if v1_scores_list else 0.0
    v2_8plus = sum(1 for s in v2_scores if s >= 8)
    v1_8plus = sum(1 for s in v1_scores_list if s >= 8)

    def _delta_tr(sid, v1, v2, d):
        dclass = "good" if d > 0 else ("bad" if d < 0 else "")
        dsign = "+" if d > 0 else ""
        return f"<tr><td>{sid}</td><td>{v1}/10</td><td>{v2}/10</td><td class='{dclass}'>{dsign}{d}</td></tr>"
    delta_lines = "".join(_delta_tr(*row) for row in sorted(deltas, key=lambda x: -x[3]))

    summary = f"""<div class="summary">
  <h2 style="margin-top:0">v1 → v2 Comparison Summary</h2>
  <div><b>Rooms:</b> {len(ok_rows)}/{len(rows)} succeeded</div>
  <div><b>v1 mean Claude score:</b> {v1_mean:.2f} / 10 &middot; <b>v2 mean:</b> {v2_mean:.2f} / 10 &middot; <b>Δ:</b> {v2_mean - v1_mean:+.2f}</div>
  <div><b>Rooms ≥ 8/10:</b> v1={v1_8plus} → v2={v2_8plus}</div>
  <div><b>Improved / Same / Regressed:</b> <span class="good">{improved}</span> / {same} / <span class="bad">{regressed}</span></div>
  <div><b>Cost:</b> ${total_cost:.2f} / cap ${COST_CAP:.0f} &middot; <b>Elapsed:</b> {elapsed:.0f}s</div>
  <table class="deltatab">
    <thead><tr><th>Room</th><th>v1 score</th><th>v2 score</th><th>Δ</th></tr></thead>
    <tbody>{delta_lines}</tbody>
  </table>
</div>"""

    # Main gallery: 3 cols [input | v1 | v2] + verdict summary
    main_rows = []
    for r in rows:
        sid = r["short_id"]
        if r["status"] != "ok":
            main_rows.append(f"""<div class="row fail">
  <div class="name">{r['room']}</div><div class="error">FAIL: {r.get('error', '')}</div>
</div>""")
            continue
        v = r["verdict"]
        v1e = v1_by_id.get(sid, {})
        v1v = v1e.get("verdict", {}) if v1e else {}
        v1_score = v1v.get("quality_score", "—")
        v2_score = v.get("quality_score", "—")
        delta_str = ""
        if isinstance(v1_score, (int, float)) and isinstance(v2_score, (int, float)):
            d = v2_score - v1_score
            delta_str = f"<span class='{'good' if d > 0 else ('bad' if d < 0 else '')}'>Δ{'+' if d > 0 else ''}{d}</span>"

        def score_cls(s):
            if not isinstance(s, (int, float)):
                return ""
            return "good" if s >= 8 else ("meh" if s >= 5 else "bad")

        v1_residual = v1v.get("residual_items_visible", [])
        v2_residual = v.get("residual_items_visible", [])
        v1_arch_changes = v1v.get("architecture_changes", [])
        v2_arch_changes = v.get("architecture_changes", [])

        main_rows.append(f"""<div class="row3">
  <div class="room-header"><b>{r['room']}</b> &nbsp; v1 <span class="score {score_cls(v1_score)}">{v1_score}/10</span> → v2 <span class="score {score_cls(v2_score)}">{v2_score}/10</span> &nbsp; {delta_str} &nbsp; <span class="elapsed">{r['elapsed_s']}s</span></div>
  <div class="grid3">
    <div class="cell">
      <div class="label">INPUT</div>
      <img src="{r['input_rel']}" alt="input">
    </div>
    <div class="cell">
      <div class="label">v1 Kontext (static prompt) — <span class="score {score_cls(v1_score)}">{v1_score}/10</span></div>
      <img src="{sid}_v1_empty.png" alt="v1 output">
      <div class="vsmall">{v1v.get('one_line_verdict', '')}</div>
      {('<div class="flag bad">residual: ' + ", ".join(v1_residual[:4]) + '</div>') if v1_residual else ''}
      {('<div class="flag meh">arch changed: ' + ", ".join(v1_arch_changes[:3]) + '</div>') if v1_arch_changes else ''}
    </div>
    <div class="cell">
      <div class="label">v2 Kontext (+ feature extraction) — <span class="score {score_cls(v2_score)}">{v2_score}/10</span></div>
      <img src="{r['v2_output_rel']}" alt="v2 output">
      <div class="vsmall">{v.get('one_line_verdict', '')}</div>
      {('<div class="flag bad">residual: ' + ", ".join(v2_residual[:4]) + '</div>') if v2_residual else ''}
      {('<div class="flag meh">arch changed: ' + ", ".join(v2_arch_changes[:3]) + '</div>') if v2_arch_changes else ''}
    </div>
  </div>
</div>""")

    # Focused inventory section for flagged rooms
    focus_sections = []
    for r in rows:
        if r["status"] != "ok":
            continue
        sid = r["short_id"]
        if sid not in ROOMS_TO_SHOW_INVENTORY:
            continue
        inv_pretty = json.dumps(r["inventory"], indent=2)
        prompt_text = (OUT_DIR / r["prompt_rel"]).read_text() if (OUT_DIR / r["prompt_rel"]).exists() else ""
        v = r["verdict"]
        v1e = v1_by_id.get(sid, {})
        v1v = v1e.get("verdict", {}) if v1e else {}
        v1_score = v1v.get("quality_score", "—")
        v2_score = v.get("quality_score", "—")

        def score_cls(s):
            if not isinstance(s, (int, float)):
                return ""
            return "good" if s >= 8 else ("meh" if s >= 5 else "bad")

        focus_sections.append(f"""<div class="focus">
  <h3>{r['room']} — v1 <span class="score {score_cls(v1_score)}">{v1_score}/10</span> → v2 <span class="score {score_cls(v2_score)}">{v2_score}/10</span></h3>
  <div class="focus-grid">
    <div class="cell">
      <div class="label">INPUT</div>
      <img src="{r['input_rel']}">
    </div>
    <div class="cell">
      <div class="label">v1 output</div>
      <img src="{sid}_v1_empty.png">
      <div class="vsmall">{v1v.get('one_line_verdict', '')}</div>
    </div>
    <div class="cell">
      <div class="label">v2 output</div>
      <img src="{r['v2_output_rel']}">
      <div class="vsmall">{v.get('one_line_verdict', '')}</div>
    </div>
    <div class="cell inventory">
      <div class="label">Extracted inventory ({r['inventory_rel']})</div>
      <pre>{inv_pretty}</pre>
      <details><summary>dynamic prompt sent to Kontext</summary><pre class="prompt">{prompt_text}</pre></details>
    </div>
  </div>
</div>""")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Kontext v2 — feature-extraction-conditioned</title>
<style>
  body {{ background: #0a0a0a; color: #e5e5e5; font-family: -apple-system, 'Segoe UI', sans-serif; padding: 24px; max-width: 2000px; margin: 0 auto; }}
  h1, h2, h3 {{ font-weight: 500; }}
  .summary {{ background: #141414; padding: 20px 24px; border-radius: 8px; margin-bottom: 32px; font-size: 13px; line-height: 1.8; font-family: 'SF Mono', monospace; }}
  .summary b {{ color: #f5f5f5; }}
  .deltatab {{ width: auto; border-collapse: collapse; margin-top: 12px; font-size: 12px; }}
  .deltatab th, .deltatab td {{ padding: 4px 12px; border-bottom: 1px solid #232323; text-align: left; }}
  .deltatab th {{ color: #888; }}
  .row3 {{ background: #141414; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #232323; }}
  .room-header {{ font-size: 14px; margin-bottom: 10px; color: #ddd; }}
  .grid3 {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }}
  .cell img {{ width: 100%; border-radius: 6px; object-fit: contain; max-height: 360px; background: #000; display: block; }}
  .label {{ font-size: 12px; font-weight: 500; margin-bottom: 8px; color: #f5f5f5; }}
  .vsmall {{ font-size: 11px; margin-top: 8px; color: #aaa; padding: 8px; background: #0a0a0a; border-radius: 4px; line-height: 1.4; }}
  .flag {{ font-size: 10px; margin-top: 6px; padding: 5px 8px; border-radius: 4px; font-family: monospace; }}
  .flag.bad {{ background: rgba(255,107,107,0.08); color: #ff6b6b; }}
  .flag.meh {{ background: rgba(251,191,36,0.08); color: #fbbf24; }}
  .score {{ font-weight: 600; font-family: monospace; }}
  .score.good, .good {{ color: #4ade80; }}
  .score.meh, .meh {{ color: #fbbf24; }}
  .score.bad, .bad {{ color: #ff6b6b; }}
  .elapsed {{ color: #666; font-size: 11px; font-family: monospace; }}
  .focus {{ background: #141414; border-radius: 8px; padding: 20px; margin-bottom: 24px; border: 2px solid #3b82f6; }}
  .focus-grid {{ display: grid; grid-template-columns: 1fr 1fr 1fr 1.5fr; gap: 16px; }}
  .focus-grid img {{ max-height: 280px; }}
  .inventory pre {{ background: #0a0a0a; padding: 10px; border-radius: 4px; font-size: 10px; color: #aaa; max-height: 380px; overflow-y: auto; line-height: 1.4; }}
  .prompt {{ font-size: 10px !important; max-height: 260px !important; white-space: pre-wrap; }}
  details summary {{ font-size: 11px; color: #888; cursor: pointer; margin-top: 8px; }}
  .row.fail {{ background: #141414; border: 1px solid #ff6b6b; padding: 16px; border-radius: 8px; color: #ff6b6b; }}
</style></head>
<body>
<h1>Kontext v2 — pre-flight feature extraction (Step 1)</h1>
{summary}

<h2>All 15 rooms — [input | v1 static prompt | v2 feature-extraction prompt]</h2>
{chr(10).join(main_rows)}

<h2>Flagged rooms — inventory side-by-side (02, 09, 10, 12, 14)</h2>
{chr(10).join(focus_sections)}
</body></html>
"""
    return html


def main() -> None:
    t0 = time.time()
    _load_fal_key()
    _load_anthropic_key()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise RuntimeError("ANTHROPIC_API_KEY not set — required for extraction + verdict")

    rooms = sorted(BENCH_DIR.glob("room-*.webp"))
    logger.info("found %d bench rooms", len(rooms))

    rows: list[dict] = [None] * len(rooms)  # type: ignore
    with ThreadPoolExecutor(max_workers=3) as ex:
        futs = {ex.submit(process_room, p): i for i, p in enumerate(rooms)}
        for fut in as_completed(futs):
            i = futs[fut]
            if _COST > COST_CAP:
                logger.warning("cost cap exceeded")
                rows[i] = {"room": rooms[i].stem, "short_id": rooms[i].stem.split("_")[0],
                           "status": "fail", "error": f"cost cap (${_COST:.2f})"}
                continue
            rows[i] = fut.result()
            logger.info("running cost: $%.2f", _COST)

    for i, r in enumerate(rows):
        if r is None:
            rows[i] = {"room": rooms[i].stem, "short_id": rooms[i].stem.split("_")[0],
                       "status": "fail", "error": "no result"}

    _copy_v1_images_into_v2(rows)
    v1_by_id = load_v1_scores()

    elapsed = time.time() - t0
    (OUT_DIR / "kontext_v2_results.json").write_text(
        json.dumps({"rows": rows, "total_cost_usd": round(_COST, 3), "total_elapsed_s": round(elapsed, 1)},
                   indent=2, default=str)
    )

    html = generate_html(rows, v1_by_id, _COST, elapsed)
    (OUT_DIR / "bench.html").write_text(html)
    logger.info("done — cost $%.2f, elapsed %.0fs", _COST, elapsed)
    logger.info("HTML: file://%s", OUT_DIR / "bench.html")


if __name__ == "__main__":
    main()
