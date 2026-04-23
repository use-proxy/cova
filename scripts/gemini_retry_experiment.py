#!/usr/bin/env python3
"""Gemini retry experiment — strict audit + max 2 specific-item retries per room.

Targets: rooms 02, 05, 09, 10, 11, 14 (the user's list of "any that aren't
clearly passing" across prior runs).

Pipeline per room:
  1. v1 Gemini call with static prompt
  2. Strict emptiness audit (Claude) → residual_items + score
  3. If residuals → retry1 Gemini with specific items listed, audit
  4. If still residuals → retry2 Gemini with current residuals, audit

Max 2 retries per room. Save every iteration.

Output: /tmp/empty-room-bakeoff/gemini-retry/gallery.html
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

logger = logging.getLogger("gemini-retry")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")

OUT_DIR = Path("/tmp/empty-room-bakeoff/gemini-retry")
OUT_DIR.mkdir(parents=True, exist_ok=True)
GEMINI_BENCH_DIR = Path("/tmp/empty-room-bakeoff/gemini-bench")

BENCH_DIR = ROOT / "bench" / "rooms"
TARGET_IDS = ["room-02", "room-05", "room-09", "room-10", "room-11", "room-14"]

COST_CAP = 8.0
COST_GEMINI = 0.25
COST_STRICT_AUDIT = 0.03
MAX_RETRIES = 2  # v1 + up to 2 retries = 3 generations max

_COST = 0.0


def add_cost(x: float) -> None:
    global _COST
    _COST += x


# ---------------------------------------------------------------------------
# Strict emptiness audit
# ---------------------------------------------------------------------------

STRICT_AUDIT_PROMPT = """You are a strict emptiness auditor. List every single visible item in this image that is NOT part of the building structure.

Building structure means: walls, floor, ceiling, permanent windows with architectural treatments like shutters or honeycomb blinds, doors, door frames, crown molding, baseboards, wainscoting, wall-integrated LED strips, permanent ceiling fixtures (fans, chandeliers, pendant lights, recessed lights), exposed beams, genuinely built-in cabinetry integrated flush into walls, radiators, vents, electrical outlets, light switches, wall text or architectural signage.

Everything else must be listed — freestanding furniture, wall-mounted shelves regardless of how they look, TVs even if mounted, freestanding electric fireplaces, area rugs, curtains, drapes, plants, lamps, art, photos, clothing, personal items, any decor.

Return STRICT JSON only:
{
  "residual_items": ["specific descriptions of each non-structural item — e.g. 'dark gaming chair on right side', 'wooden floating shelf with framed photo above fireplace'"],
  "score": <integer 0-10 where 10 means residual_items is empty>
}"""


def strict_audit(output_bgr: np.ndarray) -> dict:
    import anthropic  # type: ignore
    client = anthropic.Anthropic()
    ok, buf = cv2.imencode(".png", output_bgr)
    if not ok:
        raise RuntimeError("png encode")
    b64 = base64.b64encode(buf.tobytes()).decode("ascii")
    resp = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
                    {"type": "text", "text": STRICT_AUDIT_PROMPT},
                ],
            }
        ],
    )
    add_cost(COST_STRICT_AUDIT)
    t = resp.content[0].text.strip() if resp.content else ""
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        if t.endswith("```"):
            t = t[:-3]
        if t.startswith("json\n"):
            t = t[5:]
    s, e = t.find("{"), t.rfind("}")
    if s < 0 or e <= s:
        return {"residual_items": [], "score": 10, "_raw": t[:300]}
    try:
        return json.loads(t[s:e + 1])
    except json.JSONDecodeError:
        return {"residual_items": [], "score": 10, "_raw": t[:300]}


def build_retry_prompt(residual_items: list[str]) -> str:
    items = ", ".join(str(x).strip() for x in residual_items if str(x).strip())
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

        iterations: list[dict] = []
        current_bgr = pre.working_bgr
        current_is_v1 = True

        # --- Iteration 0 (v1 static prompt) ---
        fal_url_v1 = upload_image_to_fal(pre.working_bgr)
        v1_out_url = call_nano_banana_pro_edit(fal_url_v1, GEMINI_PROMPT)
        add_cost(COST_GEMINI)
        v1_bgr = download_image_to_bgr(v1_out_url, (H, W))
        v1_rel = f"{short_id}_v1.png"
        cv2.imwrite(str(OUT_DIR / v1_rel), v1_bgr)
        v1_audit = strict_audit(v1_bgr)
        iterations.append({
            "iteration": "v1",
            "prompt_label": "static v1 prompt",
            "output_rel": v1_rel,
            "audit": v1_audit,
        })
        logger.info(
            "%s v1 — score=%s residuals=%d",
            short_id, v1_audit.get("score"), len(v1_audit.get("residual_items") or []),
        )
        current_bgr = v1_bgr

        # --- Retry iterations (max 2) ---
        for retry_idx in range(1, MAX_RETRIES + 1):
            prev_audit = iterations[-1]["audit"]
            residuals = prev_audit.get("residual_items") or []
            if not residuals:
                logger.info("%s: no residuals after iter %s — stopping", short_id, iterations[-1]["iteration"])
                break

            prompt = build_retry_prompt(residuals)
            (OUT_DIR / f"{short_id}_retry{retry_idx}_prompt.txt").write_text(prompt)

            fal_url_cur = upload_image_to_fal(current_bgr)
            retry_out_url = call_nano_banana_pro_edit(fal_url_cur, prompt)
            add_cost(COST_GEMINI)
            retry_bgr = download_image_to_bgr(retry_out_url, (H, W))
            retry_rel = f"{short_id}_retry{retry_idx}.png"
            cv2.imwrite(str(OUT_DIR / retry_rel), retry_bgr)

            retry_audit = strict_audit(retry_bgr)
            iterations.append({
                "iteration": f"retry{retry_idx}",
                "prompt_label": f"retry {retry_idx} — residuals from iter {iterations[-1]['iteration']}",
                "prompt_rel": f"{short_id}_retry{retry_idx}_prompt.txt",
                "output_rel": retry_rel,
                "audit": retry_audit,
                "residuals_input": residuals,
            })
            logger.info(
                "%s retry%d — score=%s residuals=%d",
                short_id, retry_idx, retry_audit.get("score"),
                len(retry_audit.get("residual_items") or []),
            )
            current_bgr = retry_bgr

        elapsed = time.time() - t0
        return {
            "room": room_path.stem,
            "short_id": short_id,
            "status": "ok",
            "input_rel": f"{short_id}_input.png",
            "iterations": iterations,
            "final_score": iterations[-1]["audit"].get("score"),
            "final_residual_count": len(iterations[-1]["audit"].get("residual_items") or []),
            "n_retries_used": len(iterations) - 1,
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


def _copy_prior_gemini_v1(short_id: str) -> str | None:
    """Copy from the /tmp/empty-room-bakeoff/gemini-bench/ run for reference if needed.
    (We also run a fresh v1 in this experiment, so this is not strictly needed.)"""
    src = GEMINI_BENCH_DIR / f"{short_id}_gemini.png"
    if not src.exists():
        return None
    dst = OUT_DIR / f"{short_id}_prior_gemini_bench_v1.png"
    dst.write_bytes(src.read_bytes())
    return dst.name


def generate_html(rows: list[dict], cost: float, elapsed: float) -> str:
    ok_rows = [r for r in rows if r["status"] == "ok"]

    # Summary lines
    score_prog_lines = []
    retry_helped = 0
    retry_neutral = 0
    retry_hurt = 0
    clean_at_v1 = 0
    clean_after_retries = 0
    stuck = 0

    for r in ok_rows:
        its = r["iterations"]
        v1_score = its[0]["audit"].get("score", 0)
        final_score = r["final_score"]
        if v1_score == 10:
            clean_at_v1 += 1
        elif final_score == 10:
            clean_after_retries += 1

        if final_score > v1_score:
            retry_helped += 1
        elif final_score == v1_score:
            retry_neutral += 1
        else:
            retry_hurt += 1

        if final_score < 7 and v1_score < 7:
            stuck += 1

        prog = " → ".join(
            f"<span class='score {_score_cls(it['audit'].get('score'))}'>{it['audit'].get('score')}/10</span>"
            for it in its
        )
        score_prog_lines.append(
            f"<li><b>{r['short_id']}</b>: {prog} (residuals: {', '.join(its[-1]['audit'].get('residual_items', [])) or '∅'})</li>"
        )

    summary = f"""<div class="summary">
  <h2 style="margin-top:0">Gemini retry experiment — {len(ok_rows)}/{len(rows)} rooms, max {MAX_RETRIES} retries</h2>
  <table class="sumtab">
    <tr><td>Clean at v1 (score 10, no retries needed)</td><td><b>{clean_at_v1}</b></td></tr>
    <tr><td>Clean after retry (score 10 only after ≥1 retry)</td><td><b>{clean_after_retries}</b></td></tr>
    <tr><td>Stuck below threshold (final score &lt; 7)</td><td><b class="bad">{stuck}</b></td></tr>
    <tr><td>Retry improved score</td><td><span class="good">{retry_helped}</span></td></tr>
    <tr><td>Retry neutral (same score)</td><td>{retry_neutral}</td></tr>
    <tr><td>Retry hurt (regressed)</td><td><span class="bad">{retry_hurt}</span></td></tr>
    <tr><td>Cost / elapsed</td><td>${cost:.2f} / cap ${COST_CAP:.0f} &middot; {elapsed:.0f}s</td></tr>
  </table>
  <div style="margin-top:12px"><b>Score progression per room:</b></div>
  <ul>{''.join(score_prog_lines)}</ul>
</div>"""

    # Per-room blocks — variable number of cells (1 input + 2×N iteration cells)
    room_blocks = []
    for r in rows:
        sid = r["short_id"]
        if r["status"] != "ok":
            room_blocks.append(f"<div class='row fail'><h3>{r['room']}</h3><div>FAIL: {r.get('error','')}</div></div>")
            continue

        its = r["iterations"]
        n_its = len(its)

        # Build cells: input cell + (image + verdict) pair per iteration
        cells = [f"""<div class="cell input">
  <div class="label">INPUT</div>
  <img src="{r['input_rel']}">
</div>"""]

        for it in its:
            audit = it["audit"]
            score = audit.get("score", "—")
            residuals = audit.get("residual_items", [])
            pretty = json.dumps(audit, indent=2)
            residuals_from = it.get("residuals_input")
            source_note = (
                f"<div class='source'>fed these residuals: {', '.join(residuals_from[:5])}{'…' if len(residuals_from) > 5 else ''}</div>"
                if residuals_from else ""
            )

            cells.append(f"""<div class="cell output">
  <div class="label">{it['iteration']} output — <span class="score {_score_cls(score)}">{score}/10</span></div>
  {source_note}
  <img src="{it['output_rel']}">
</div>
<div class="cell verdict">
  <div class="label">{it['iteration']} verdict (strict audit)</div>
  <pre>{pretty}</pre>
  {'<div class="flag bad">residual: ' + ', '.join(residuals[:4]) + '</div>' if residuals else '<div class="flag good">clean — no residuals</div>'}
</div>""")

        room_blocks.append(f"""<div class="row">
  <h3>{r['room']} &nbsp; v1 <span class="score {_score_cls(its[0]['audit'].get('score'))}">{its[0]['audit'].get('score')}/10</span>
  → final <span class="score {_score_cls(r['final_score'])}">{r['final_score']}/10</span>
  &nbsp; <span class="elapsed">{r['elapsed_s']}s &middot; {r['n_retries_used']} retry iteration(s)</span></h3>
  <div class="grid" style="grid-template-columns: 1fr repeat({n_its}, 1fr 1fr);">
    {chr(10).join(cells)}
  </div>
</div>""")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Gemini retry experiment</title>
<style>
  body {{ background: #0a0a0a; color: #e5e5e5; font-family: -apple-system, 'Segoe UI', sans-serif; padding: 24px; max-width: 2400px; margin: 0 auto; }}
  h1, h2, h3 {{ font-weight: 500; }}
  .summary {{ background: #141414; padding: 20px 24px; border-radius: 8px; margin-bottom: 32px; font-size: 13px; line-height: 1.8; }}
  .sumtab {{ width: 100%; border-collapse: collapse; font-family: 'SF Mono', monospace; font-size: 12px; }}
  .sumtab td {{ padding: 6px 10px; border-bottom: 1px solid #232323; vertical-align: top; }}
  .sumtab td:first-child {{ color: #888; width: 340px; }}
  .row {{ background: #141414; border-radius: 8px; padding: 16px; margin-bottom: 24px; border: 1px solid #232323; }}
  .row.fail {{ border-color: #ff6b6b; color: #ff6b6b; }}
  .row h3 {{ margin-top: 0; color: #ddd; font-size: 14px; }}
  .grid {{ display: grid; gap: 12px; }}
  .cell img {{ width: 100%; border-radius: 6px; object-fit: contain; max-height: 320px; background: #000; display: block; }}
  .label {{ font-size: 12px; font-weight: 500; margin-bottom: 8px; color: #f5f5f5; }}
  .cell.verdict pre {{ margin: 0; font-size: 10px; line-height: 1.4; color: #aaa; background: #000; padding: 8px; border-radius: 4px; max-height: 260px; overflow-y: auto; white-space: pre-wrap; }}
  .source {{ font-size: 10px; color: #888; font-family: monospace; padding: 4px 8px; background: #0a0a0a; border-radius: 4px; margin-bottom: 8px; }}
  .flag {{ font-size: 10px; margin-top: 8px; padding: 5px 8px; border-radius: 4px; font-family: monospace; }}
  .flag.bad {{ background: rgba(255,107,107,0.08); color: #ff6b6b; }}
  .flag.good {{ background: rgba(74,222,128,0.06); color: #4ade80; }}
  .score {{ font-weight: 600; font-family: monospace; }}
  .score.good, .good {{ color: #4ade80; }}
  .score.meh, .meh {{ color: #fbbf24; }}
  .score.bad, .bad {{ color: #ff6b6b; }}
  .elapsed {{ color: #666; font-size: 11px; font-family: monospace; margin-left: 10px; }}
  ul li {{ margin: 4px 0; }}
</style></head>
<body>
<h1>Gemini retry experiment — strict audit + targeted-item retry</h1>
{summary}
<h2>Per-room iteration trace</h2>
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
    (OUT_DIR / "gemini_retry_results.json").write_text(
        json.dumps({"rows": rows, "total_cost_usd": round(_COST, 3),
                    "total_elapsed_s": round(elapsed, 1)}, indent=2, default=str)
    )
    html = generate_html(rows, _COST, elapsed)
    (OUT_DIR / "gallery.html").write_text(html)
    logger.info("done — $%.2f, %.0fs", _COST, elapsed)
    logger.info("HTML: file://%s", OUT_DIR / "gallery.html")


if __name__ == "__main__":
    main()
