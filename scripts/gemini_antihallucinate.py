#!/usr/bin/env python3
"""Gemini anti-hallucination pipeline — last iteration before committing.

Pipeline per room:
  1. Contextual pre-pass (Claude Vision) — describes what's adjacent to each
     removable item so the editor knows what to paint.
  2. Gemini edit with injected removal_context + CRITICAL RULE anti-hallucination clause.
  3. Strict verdict (emptiness audit).
  4. If residuals — one retry with "image still contains [items]" prompt.
  5. Final verdict.

Targets: rooms 02, 05, 09, 10, 11, 14.

Output: /tmp/empty-room-bakeoff/gemini-antihallucinate/gallery.html
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
from scripts.gemini_bench import call_nano_banana_pro_edit  # noqa: E402
from scripts.gemini_retry_experiment import strict_audit  # noqa: E402

logger = logging.getLogger("gemini-antihal")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")

OUT_DIR = Path("/tmp/empty-room-bakeoff/gemini-antihallucinate")
OUT_DIR.mkdir(parents=True, exist_ok=True)
PRIOR_DIR = Path("/tmp/empty-room-bakeoff/gemini-retry")

BENCH_DIR = ROOT / "bench" / "rooms"
TARGET_IDS = ["room-02", "room-05", "room-09", "room-10", "room-11", "room-14"]

COST_CAP = 6.0
COST_CLAUDE_PREPASS = 0.03
COST_CLAUDE_AUDIT = 0.05
COST_GEMINI = 0.25
MAX_RETRIES = 1  # one retry per room

_COST = 0.0


def add_cost(x: float) -> None:
    global _COST
    _COST += x


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

PREPASS_PROMPT = """You are describing a room photo to help an image editor remove furniture and clutter without hallucinating new features. For each removable item in this image, describe what is immediately adjacent to it (the wall surface, color, texture) so the editor knows exactly what to paint when the item is removed. Keep descriptions concrete.

Return STRICT JSON only:
{
  "removal_context": [
    {
      "item": "specific description of a removable item",
      "adjacent_context": "concrete description of the wall / floor / ceiling surface that borders the item — its color, material, and any architectural features that ARE present or ARE NOT present in that area"
    }
  ]
}

Example of good adjacent_context:
- "The curtain is mounted on a white wall. The wall above, to the left, and to the right of the curtain is flat white paint. There is no door, window, or architectural feature visible where the curtain sits — it is mounted on a plain wall section."
- "The sofa is placed against a plain painted wall. The wall color is light beige and continues uninterrupted above and to the sides of the sofa. There is no fireplace, shelf, or architectural feature on this wall section — it is a plain painted wall."

Cover every removable item in the image. If two items share the same context, list them separately — the editor needs a distinct entry per item to remove correctly."""


ANTI_HALLUCINATION_CLAUSE = (
    "CRITICAL RULE FOR WHAT TO PAINT BEHIND REMOVED ITEMS: When you remove an item, extend the existing wall, floor, or ceiling material that is adjacent to it. "
    "Match the existing paint color, texture, and material exactly. "
    "DO NOT add any new architectural features. DO NOT add doors where there were no doors. "
    "DO NOT add windows where there were no windows. DO NOT add fireplaces, shelves, alcoves, niches, or any other permanent feature that wasn't clearly visible in the input image. "
    "If a curtain covered part of a wall, extend that wall exactly — do not invent what might have been behind the curtain. "
    "If furniture was against a wall, extend that same wall behind where the furniture was — do not add any feature on that wall."
)


BASE_REMOVE_INSTRUCTION = (
    "Remove all furniture, bedding, rugs, clothing, electronics, personal items, "
    "decor, plants, lamps, posters, and clutter from this room. Keep the exact same "
    "walls, wall color, ceiling, ceiling fixtures, floor, floor material, windows, "
    "window treatments, doors, built-ins, architectural features, wall text, and "
    "camera angle. The result should be a completely empty barren room with only "
    "the architecture visible."
)


def build_main_prompt(removal_context: list[dict]) -> str:
    lines = []
    for entry in removal_context or []:
        item = str(entry.get("item", "")).strip()
        adj = str(entry.get("adjacent_context", "")).strip()
        if item and adj:
            lines.append(f"  - ITEM: {item}\n    PAINT HERE: {adj}")
    context_block = "\n".join(lines) if lines else "  (no specific items flagged by pre-pass)"

    return f"""{BASE_REMOVE_INSTRUCTION}

WHAT TO PAINT WHERE ITEMS WERE — for each removable item, this is the exact surface that should appear in the output:
{context_block}

{ANTI_HALLUCINATION_CLAUSE}"""


def build_retry_prompt(residuals: list[str]) -> str:
    items = ", ".join(str(x).strip() for x in residuals if str(x).strip())
    return (
        f"The image still contains: {items}. "
        "Remove each of these specifically while keeping everything else exactly as-is. "
        + ANTI_HALLUCINATION_CLAUSE
    )


# ---------------------------------------------------------------------------
# Claude pre-pass
# ---------------------------------------------------------------------------

def claude_prepass(input_bgr: np.ndarray) -> dict:
    import anthropic  # type: ignore
    client = anthropic.Anthropic()
    ok, buf = cv2.imencode(".png", input_bgr)
    if not ok:
        raise RuntimeError("png encode")
    b64 = base64.b64encode(buf.tobytes()).decode("ascii")
    resp = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=2500,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
                    {"type": "text", "text": PREPASS_PROMPT},
                ],
            }
        ],
    )
    add_cost(COST_CLAUDE_PREPASS)
    t = resp.content[0].text.strip() if resp.content else ""
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        if t.endswith("```"):
            t = t[:-3]
        if t.startswith("json\n"):
            t = t[5:]
    s, e = t.find("{"), t.rfind("}")
    if s < 0 or e <= s:
        raise RuntimeError(f"prepass JSON parse: {t[:300]}")
    return json.loads(t[s:e + 1])


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

        # Step 1 — contextual pre-pass
        context = claude_prepass(pre.working_bgr)
        (OUT_DIR / f"{short_id}_context.json").write_text(json.dumps(context, indent=2))
        removal_context = context.get("removal_context", [])

        # Step 2 — Gemini edit with anti-hal + context
        main_prompt = build_main_prompt(removal_context)
        (OUT_DIR / f"{short_id}_main_prompt.txt").write_text(main_prompt)

        fal_url = upload_image_to_fal(pre.working_bgr)
        out_url = call_nano_banana_pro_edit(fal_url, main_prompt)
        add_cost(COST_GEMINI)
        v1_bgr = download_image_to_bgr(out_url, (H, W))
        v1_rel = f"{short_id}_v1.png"
        cv2.imwrite(str(OUT_DIR / v1_rel), v1_bgr)

        # Step 3 — strict audit
        v1_audit = strict_audit(v1_bgr)
        # strict_audit already accounts its own $0.03 via gemini_retry_experiment's accounting,
        # but we use a different cost constant here — update for accuracy
        add_cost(COST_CLAUDE_AUDIT - 0.03)
        logger.info("%s v1 — score=%s residuals=%d",
                    short_id, v1_audit.get("score"), len(v1_audit.get("residual_items") or []))

        iterations = [{
            "iteration": "v1 (anti-hal + context)",
            "output_rel": v1_rel,
            "audit": v1_audit,
        }]

        retry_rel = None
        retry_audit = None
        # Step 4 — retry if residuals
        if v1_audit.get("residual_items"):
            retry_prompt = build_retry_prompt(v1_audit["residual_items"])
            (OUT_DIR / f"{short_id}_retry_prompt.txt").write_text(retry_prompt)

            v1_fal_url = upload_image_to_fal(v1_bgr)
            retry_out_url = call_nano_banana_pro_edit(v1_fal_url, retry_prompt)
            add_cost(COST_GEMINI)
            retry_bgr = download_image_to_bgr(retry_out_url, (H, W))
            retry_rel = f"{short_id}_retry.png"
            cv2.imwrite(str(OUT_DIR / retry_rel), retry_bgr)

            retry_audit = strict_audit(retry_bgr)
            add_cost(COST_CLAUDE_AUDIT - 0.03)
            logger.info("%s retry — score=%s residuals=%d",
                        short_id, retry_audit.get("score"), len(retry_audit.get("residual_items") or []))

            iterations.append({
                "iteration": "retry (specific items)",
                "output_rel": retry_rel,
                "audit": retry_audit,
                "residuals_input": v1_audit["residual_items"],
            })

        elapsed = time.time() - t0
        return {
            "room": room_path.stem,
            "short_id": short_id,
            "status": "ok",
            "input_rel": f"{short_id}_input.png",
            "context": context,
            "context_rel": f"{short_id}_context.json",
            "main_prompt_rel": f"{short_id}_main_prompt.txt",
            "iterations": iterations,
            "final_score": iterations[-1]["audit"].get("score"),
            "final_residuals": iterations[-1]["audit"].get("residual_items", []),
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

def _copy_prior_final(short_id: str) -> str | None:
    """Find the last iteration from the gemini-retry experiment as the reference."""
    # The retry experiment saved final outputs as _retryN.png or _v1.png
    # We want the LAST one (highest N, or _v1 if no retries).
    candidates = [
        PRIOR_DIR / f"{short_id}_retry2.png",
        PRIOR_DIR / f"{short_id}_retry1.png",
        PRIOR_DIR / f"{short_id}_v1.png",
    ]
    src = next((p for p in candidates if p.exists()), None)
    if not src:
        return None
    dst = OUT_DIR / f"{short_id}_prior_final.png"
    dst.write_bytes(src.read_bytes())
    return dst.name


def _score_cls(s):
    if not isinstance(s, (int, float)):
        return ""
    return "good" if s >= 8 else ("meh" if s >= 5 else "bad")


def generate_html(rows: list[dict], cost: float, elapsed: float) -> str:
    clean_count = sum(1 for r in rows if r.get("status") == "ok" and r.get("final_score") == 10)
    stuck_count = sum(1 for r in rows if r.get("status") == "ok" and isinstance(r.get("final_score"), int) and r["final_score"] < 7)
    retry_used = sum(1 for r in rows if r.get("status") == "ok" and len(r.get("iterations", [])) > 1)

    score_lines = []
    for r in rows:
        if r["status"] != "ok":
            score_lines.append(f"<li><b>{r['short_id']}</b>: FAIL</li>")
            continue
        its = r["iterations"]
        prog = " → ".join(
            f"<span class='score {_score_cls(it['audit'].get('score'))}'>{it['audit'].get('score')}/10</span>"
            for it in its
        )
        resid = r.get("final_residuals", [])
        score_lines.append(
            f"<li><b>{r['short_id']}</b>: {prog} — final residuals: {', '.join(resid) if resid else '∅'}</li>"
        )

    summary = f"""<div class="summary">
  <h2 style="margin-top:0">Anti-hallucination + contextual pre-pass — {len(rows)} rooms</h2>
  <table class="sumtab">
    <tr><td>Fully clean (score = 10)</td><td><b class="good">{clean_count}</b> / {len(rows)}</td></tr>
    <tr><td>Below passing threshold (score &lt; 7)</td><td><b class="bad">{stuck_count}</b></td></tr>
    <tr><td>Retry used (v1 → retry path)</td><td>{retry_used}</td></tr>
    <tr><td>Cost / elapsed</td><td>${cost:.2f} / cap ${COST_CAP:.0f} &middot; {elapsed:.0f}s</td></tr>
  </table>
  <div style="margin-top:12px"><b>Score progression per room:</b></div>
  <ul>{''.join(score_lines)}</ul>
</div>"""

    # Per-room block — 5 cells: input | prior | new | context JSON | final verdict JSON
    room_blocks = []
    for r in rows:
        sid = r["short_id"]
        if r["status"] != "ok":
            room_blocks.append(f"<div class='row fail'><h3>{r['room']}</h3><div>FAIL: {r.get('error','')}</div></div>")
            continue

        prior_img = _copy_prior_final(sid)
        its = r["iterations"]
        final_it = its[-1]
        final_img_rel = final_it["output_rel"]
        final_audit = final_it["audit"]
        final_audit_pretty = json.dumps(final_audit, indent=2)
        context_pretty = json.dumps(r["context"], indent=2)
        final_residuals = final_audit.get("residual_items", [])
        final_score = final_audit.get("score", "—")

        # Optional: show v1 output too if retry was used (before retry)
        v1_it_html = ""
        if len(its) > 1:
            v1_it = its[0]
            v1_pretty = json.dumps(v1_it["audit"], indent=2)
            v1_it_html = f"""<div class="cell">
    <div class="label">v1 (pre-retry) — <span class="score {_score_cls(v1_it['audit'].get('score'))}">{v1_it['audit'].get('score')}/10</span></div>
    <img src="{v1_it['output_rel']}">
    <details><summary>v1 audit</summary><pre>{v1_pretty}</pre></details>
  </div>"""

        room_blocks.append(f"""<div class="row">
  <h3>{r['room']} &nbsp; final <span class="score {_score_cls(final_score)}">{final_score}/10</span>
  &nbsp; <span class="elapsed">{r['elapsed_s']}s &middot; {len(its)} iteration(s)</span></h3>
  <div class="grid5">
    <div class="cell">
      <div class="label">INPUT</div>
      <img src="{r['input_rel']}">
    </div>
    <div class="cell">
      <div class="label">Previous Gemini retry output (no anti-hal)</div>
      {f'<img src="{prior_img}">' if prior_img else '<div class="empty">prior not found</div>'}
    </div>
    <div class="cell">
      <div class="label">New output (anti-hal + context) — <span class="score {_score_cls(final_score)}">{final_score}/10</span></div>
      <img src="{final_img_rel}">
      {'<div class="flag bad">residual: ' + ', '.join(final_residuals[:4]) + '</div>' if final_residuals else '<div class="flag good">clean — no residuals</div>'}
    </div>
    <div class="cell">
      <div class="label">Pre-pass context JSON</div>
      <pre>{context_pretty}</pre>
    </div>
    <div class="cell">
      <div class="label">Final verdict JSON</div>
      <pre>{final_audit_pretty}</pre>
    </div>
  </div>
  {v1_it_html}
</div>""")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Gemini anti-hallucination experiment</title>
<style>
  body {{ background: #0a0a0a; color: #e5e5e5; font-family: -apple-system, 'Segoe UI', sans-serif; padding: 24px; max-width: 2400px; margin: 0 auto; }}
  h1, h2, h3 {{ font-weight: 500; }}
  .summary {{ background: #141414; padding: 20px 24px; border-radius: 8px; margin-bottom: 32px; font-size: 13px; line-height: 1.8; }}
  .sumtab {{ width: 100%; border-collapse: collapse; font-family: 'SF Mono', monospace; font-size: 12px; }}
  .sumtab td {{ padding: 6px 10px; border-bottom: 1px solid #232323; vertical-align: top; }}
  .sumtab td:first-child {{ color: #888; width: 280px; }}
  .row {{ background: #141414; border-radius: 8px; padding: 16px; margin-bottom: 24px; border: 1px solid #232323; }}
  .row.fail {{ border-color: #ff6b6b; color: #ff6b6b; }}
  .row h3 {{ margin-top: 0; color: #ddd; font-size: 14px; }}
  .grid5 {{ display: grid; grid-template-columns: 1fr 1fr 1fr 1.1fr 1.1fr; gap: 12px; }}
  .cell img {{ width: 100%; border-radius: 6px; object-fit: contain; max-height: 320px; background: #000; display: block; }}
  .cell .empty {{ height: 240px; background: #0a0a0a; border: 1px dashed #333; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #666; font-size: 11px; }}
  .label {{ font-size: 12px; font-weight: 500; margin-bottom: 8px; color: #f5f5f5; }}
  .cell pre {{ margin: 0; font-size: 10px; line-height: 1.4; color: #aaa; background: #000; padding: 8px; border-radius: 4px; max-height: 320px; overflow-y: auto; white-space: pre-wrap; }}
  .flag {{ font-size: 10px; margin-top: 8px; padding: 5px 8px; border-radius: 4px; font-family: monospace; }}
  .flag.bad {{ background: rgba(255,107,107,0.08); color: #ff6b6b; }}
  .flag.good {{ background: rgba(74,222,128,0.06); color: #4ade80; }}
  .score {{ font-weight: 600; font-family: monospace; }}
  .score.good, .good {{ color: #4ade80; }}
  .score.meh, .meh {{ color: #fbbf24; }}
  .score.bad, .bad {{ color: #ff6b6b; }}
  .elapsed {{ color: #666; font-size: 11px; font-family: monospace; margin-left: 10px; }}
  details {{ margin-top: 8px; }}
  summary {{ font-size: 11px; color: #888; cursor: pointer; }}
  ul li {{ margin: 4px 0; }}
</style></head>
<body>
<h1>Gemini anti-hallucination + contextual pre-pass</h1>
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
    (OUT_DIR / "gemini_antihallucinate_results.json").write_text(
        json.dumps({"rows": rows, "total_cost_usd": round(_COST, 3),
                    "total_elapsed_s": round(elapsed, 1)}, indent=2, default=str)
    )
    html = generate_html(rows, _COST, elapsed)
    (OUT_DIR / "gallery.html").write_text(html)
    logger.info("done — $%.2f, %.0fs", _COST, elapsed)
    logger.info("HTML: file://%s", OUT_DIR / "gallery.html")


if __name__ == "__main__":
    main()
