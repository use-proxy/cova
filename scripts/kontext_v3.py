#!/usr/bin/env python3
"""Kontext v3 — two-category extraction + retry-on-residual loop.

Experiment 1: Claude classifies features into:
  - architecturally_fixed_features (built-in / integrated → PRESERVE EXACTLY)
  - freestanding_items_to_remove (furniture/decor regardless of prominence → REMOVE)

Experiment 2: After Kontext, verify with Claude. If residuals listed, run a
second targeted Kontext call naming those residuals.

Applied only to rooms 10, 11, 14. Output:
  /tmp/empty-room-bakeoff/kontext-v3/gallery.html
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
    call_flux_kontext,
    download_image_to_bgr,
)
from scripts.kontext_bench import claude_verdict  # noqa: E402

logger = logging.getLogger("kontext-v3")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")

OUT_DIR = Path("/tmp/empty-room-bakeoff/kontext-v3")
OUT_DIR.mkdir(parents=True, exist_ok=True)
V2_DIR = Path("/tmp/empty-room-bakeoff/kontext-v2")

BENCH_DIR = ROOT / "bench" / "rooms"
TARGET_IDS = ["room-10", "room-11", "room-14"]

COST_CAP = 5.0
COST_CLAUDE_EXTRACT = 0.03
COST_CLAUDE_VERIFY = 0.02
COST_CLAUDE_VERDICT = 0.02
COST_KONTEXT = 0.17

_COST = 0.0


def add_cost(x: float) -> None:
    global _COST
    _COST += x


# ---------------------------------------------------------------------------
# Claude: two-category extraction
# ---------------------------------------------------------------------------

TWO_CAT_EXTRACTION_PROMPT = """You are categorizing every visible item and surface in this room photograph into two lists. This categorization drives an image editor that must remove freestanding items while preserving architecture pixel-for-pixel.

Return STRICT JSON only (no markdown, no prose):
{
  "architecturally_fixed_features": ["specific descriptions of items integrated into the building structure"],
  "freestanding_items_to_remove": ["specific descriptions of furniture and decor regardless of how distinctive they look"],
  "wall_color_description": "string",
  "floor_material": "string",
  "ceiling_description": "string",
  "camera_framing": "string"
}

CLASSIFICATION RULES — apply these strictly:

  architecturally_fixed_features includes ONLY:
    - stone, brick, wood-paneled, or tiled walls that are the building's own surface
    - built-in shelving that is part of the wall (floor-to-ceiling, recessed into drywall, integrated with trim)
    - permanent crown molding, baseboards, wainscoting
    - plantation shutters, honeycomb/cellular blinds mounted inside the window frame
    - wall-integrated LED strips (recessed into a cove or ceiling channel, NOT applied to the surface)
    - radiators, HVAC vents, air-supply registers
    - genuinely built-in fireplaces (masonry, recessed into the wall, with integrated mantel)
    - permanent ceiling fixtures (recessed cans, integrated pendants, coffered/tray ceilings, beams)
    - permanent wall signage or architectural wall text (carved, painted on, or mounted by the builder)
    - windows, window frames, doors, door frames

  freestanding_items_to_remove includes EVERYTHING else that is in the room, specifically including:
    - sofas, chairs, armchairs, benches, stools, ottomans
    - beds, mattresses, headboards (unless headboard is a wall-mounted architectural panel)
    - tables of every kind (coffee, side, dining, console, desk)
    - dressers, wardrobes, nightstands
    - freestanding shelving, bookshelves not built into the wall
    - media consoles, TV stands
    - wall-mounted TVs — REMOVABLE even though attached to the wall
    - electric fireplace units that aren't built into masonry — FURNITURE not architecture
    - loose curtains, drapes, valances
    - area rugs, mats, runners
    - lamps (table, floor, desk), pendant lamps on a cord that plugs in
    - plants, vases, flower arrangements
    - art, posters, framed photos, mirrors (unless the mirror is recessed/built-in)
    - clothing, backpacks, bags, shoes
    - books, magazines, electronics, game consoles
    - pillows, throw blankets, cushions
    - anything else on the floor or on a surface

Explicitly: expensive, distinctive, or prominent does NOT mean architectural. A velvet sofa is freestanding furniture even if it's the visual anchor of the room. A wall-mounted TV is removable even though it's attached to the wall. An electric fireplace unit is freestanding furniture even though it looks like a fireplace. An accent wall treatment applied as wallpaper or a sticker is NOT architectural — only the underlying wall is.

Be specific. Instead of "furniture", write "black leather armchair on left with chrome base". Instead of "lights", write "brass pendant light with glass globe hanging over dining table".
"""


def claude_extract_two_cat(input_bgr: np.ndarray) -> dict:
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
                    {"type": "text", "text": TWO_CAT_EXTRACTION_PROMPT},
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
    if s < 0 or e <= s:
        raise RuntimeError(f"extract JSON parse: {t[:300]}")
    return json.loads(t[s:e + 1])


def build_v3_prompt(inv: dict) -> str:
    fixed = inv.get("architecturally_fixed_features") or []
    freestanding = inv.get("freestanding_items_to_remove") or []
    wall = inv.get("wall_color_description", "")
    floor = inv.get("floor_material", "")
    ceiling = inv.get("ceiling_description", "")
    camera = inv.get("camera_framing", "")

    preserve_block = "\n".join(
        f"  - {f}" for f in fixed if str(f).strip() and str(f).strip().lower() != "none observed"
    ) or "  - (none specifically flagged — preserve generic walls/floor/ceiling/windows)"

    remove_block = "\n".join(
        f"  - {f}" for f in freestanding if str(f).strip() and str(f).strip().lower() != "none observed"
    ) or "  - (none specifically flagged)"

    return f"""You are editing this room photograph. Produce an output that is the same room with all freestanding items removed and all architectural features preserved exactly.

PRESERVE EXACTLY — these are architectural, do NOT repaint, relocate, or remove any of them:
{preserve_block}

Also preserve: wall color ({wall}), floor material ({floor}), ceiling ({ceiling}), windows and window frames, doors, crown molding, baseboards, and every other permanent building feature.

REMOVE SPECIFICALLY — these are freestanding items the occupants could take with them. Remove each one and fill the space underneath with the preserved wall/floor surface:
{remove_block}

Also remove: any other furniture, bedding, rugs, clothing, bags, personal items, decor, plants, lamps, or clutter that may be visible.

The result must be a completely empty barren room with only the architecture visible, as if the occupants moved out and the room was professionally cleaned and vacuumed. Same camera angle, same lighting direction and intensity, same room dimensions and perspective. {('Camera framing: ' + camera) if camera else ''}"""


# ---------------------------------------------------------------------------
# Claude: residual verification (for retry loop)
# ---------------------------------------------------------------------------

VERIFICATION_PROMPT = """You are inspecting an image that was supposed to be an empty room. Tell me what freestanding items — if any — are still visible.

Freestanding items include: furniture, electronics, rugs, curtains, lamps, plants, art on walls, decor, clothing, clutter, pillows, blankets, wall-mounted TVs, and electric fireplace units that aren't built into masonry.

Architectural features that should REMAIN are: walls, floor, ceiling, windows, window frames, doors, built-in shelves, integrated fireplaces (masonry only), crown molding, baseboards, wainscoting, permanent ceiling fixtures (recessed cans, integrated pendants), radiators, vents, exposed brick, stone, wood paneling, and beams. Do NOT list these as residuals.

Return STRICT JSON only:
{
  "has_residuals": true/false,
  "residual_items": ["specific descriptions of each freestanding item still visible — e.g. 'dark gaming chair on right side', 'black media console below wall TV'"]
}"""


def claude_verify_residuals(output_bgr: np.ndarray) -> dict:
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
                    {"type": "text", "text": VERIFICATION_PROMPT},
                ],
            }
        ],
    )
    add_cost(COST_CLAUDE_VERIFY)
    t = resp.content[0].text.strip() if resp.content else ""
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        if t.endswith("```"):
            t = t[:-3]
        if t.startswith("json\n"):
            t = t[5:]
    s, e = t.find("{"), t.rfind("}")
    if s < 0 or e <= s:
        return {"has_residuals": False, "residual_items": [], "_raw": t[:300]}
    return json.loads(t[s:e + 1])


def build_retry_prompt(residual_items: list[str]) -> str:
    items = "\n".join(f"  - {x}" for x in residual_items if str(x).strip())
    return f"""The image still contains these freestanding items that must be removed:
{items}

Remove these items specifically. Fill the space each one occupied with the surrounding wall, floor, and ceiling surfaces. Keep everything else in the image exactly as-is — do not change the walls, floor, ceiling, windows, built-ins, lighting, camera angle, or any other architectural feature. Do not add anything new."""


# ---------------------------------------------------------------------------
# Per-room pipeline
# ---------------------------------------------------------------------------

def process_room(room_path: Path) -> dict:
    short_id = room_path.stem.split("_")[0]
    t0 = time.time()
    try:
        pre = preprocess(str(room_path))
        input_rel = f"{short_id}_input.png"
        cv2.imwrite(str(OUT_DIR / input_rel), pre.working_bgr)

        # Step 1 — two-category extraction
        inv = claude_extract_two_cat(pre.working_bgr)
        (OUT_DIR / f"{short_id}_inventory.json").write_text(json.dumps(inv, indent=2))

        # Step 2 — dynamic prompt
        v3_prompt = build_v3_prompt(inv)
        (OUT_DIR / f"{short_id}_v3_prompt.txt").write_text(v3_prompt)

        # Step 3 — first Kontext call
        fal_url = upload_image_to_fal(pre.working_bgr)
        v3_out_url = call_flux_kontext(fal_url, v3_prompt)
        add_cost(COST_KONTEXT)
        v3_bgr = download_image_to_bgr(v3_out_url, (pre.working_bgr.shape[0], pre.working_bgr.shape[1]))
        v3_rel = f"{short_id}_v3_output.png"
        cv2.imwrite(str(OUT_DIR / v3_rel), v3_bgr)

        v3_verdict = claude_verdict(pre.working_bgr, v3_bgr)
        # claude_verdict internally adds COST_CLAUDE ($0.03); adjust to our rate
        add_cost(COST_CLAUDE_VERDICT - 0.03)

        # Step 4 — verify residuals
        verify = claude_verify_residuals(v3_bgr)
        (OUT_DIR / f"{short_id}_verify.json").write_text(json.dumps(verify, indent=2))

        # Step 5 — retry if residuals
        retry_rel = None
        retry_verdict = None
        retry_prompt_txt = None
        retry_verify = None
        if verify.get("has_residuals") and verify.get("residual_items"):
            retry_prompt_txt = build_retry_prompt(verify["residual_items"])
            (OUT_DIR / f"{short_id}_retry_prompt.txt").write_text(retry_prompt_txt)

            # Upload v3 output as input for the retry call
            v3_fal_url = upload_image_to_fal(v3_bgr)
            retry_out_url = call_flux_kontext(v3_fal_url, retry_prompt_txt)
            add_cost(COST_KONTEXT)
            retry_bgr = download_image_to_bgr(retry_out_url, (pre.working_bgr.shape[0], pre.working_bgr.shape[1]))
            retry_rel = f"{short_id}_retry_output.png"
            cv2.imwrite(str(OUT_DIR / retry_rel), retry_bgr)

            retry_verdict = claude_verdict(pre.working_bgr, retry_bgr)
            add_cost(COST_CLAUDE_VERDICT - 0.03)

            retry_verify = claude_verify_residuals(retry_bgr)
            (OUT_DIR / f"{short_id}_retry_verify.json").write_text(json.dumps(retry_verify, indent=2))

        elapsed = time.time() - t0
        logger.info(
            "%s done %.1fs — v3=%s/10 residuals=%s retry=%s",
            short_id, elapsed, v3_verdict.get("quality_score"),
            len(verify.get("residual_items") or []),
            (retry_verdict.get("quality_score") if retry_verdict else "skipped"),
        )
        return {
            "room": room_path.stem,
            "short_id": short_id,
            "status": "ok",
            "input_rel": input_rel,
            "inventory": inv,
            "v3_prompt_rel": f"{short_id}_v3_prompt.txt",
            "v3_output_rel": v3_rel,
            "v3_verdict": v3_verdict,
            "verify": verify,
            "retry_prompt_rel": (f"{short_id}_retry_prompt.txt" if retry_prompt_txt else None),
            "retry_output_rel": retry_rel,
            "retry_verdict": retry_verdict,
            "retry_verify": retry_verify,
            "elapsed_s": round(elapsed, 1),
        }
    except Exception as exc:  # noqa: BLE001
        logger.error("%s FAILED: %s\n%s", short_id, exc, traceback.format_exc())
        return {"room": room_path.stem, "short_id": short_id, "status": "fail", "error": f"{type(exc).__name__}: {exc}"}


# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------

def _copy_v2_output(short_id: str) -> str | None:
    src = V2_DIR / f"{short_id}_empty.png"
    if not src.exists():
        return None
    dst_name = f"{short_id}_v2_output.png"
    (OUT_DIR / dst_name).write_bytes(src.read_bytes())
    return dst_name


def load_v2_verdict(short_id: str) -> dict | None:
    p = V2_DIR / "kontext_v2_results.json"
    if not p.exists():
        return None
    data = json.loads(p.read_text())
    for r in data.get("rows", []):
        if r.get("short_id") == short_id and r.get("status") == "ok":
            return r.get("verdict")
    return None


def _score_cls(s):
    if not isinstance(s, (int, float)):
        return ""
    return "good" if s >= 8 else ("meh" if s >= 5 else "bad")


def generate_html(rows: list[dict], cost: float, elapsed: float) -> str:
    room_blocks = []
    summary_lines = []

    for r in rows:
        sid = r["short_id"]
        if r["status"] != "ok":
            room_blocks.append(f"<div class='row fail'><h3>{r['room']}</h3><div>FAIL: {r.get('error','')}</div></div>")
            continue

        v2_rel = _copy_v2_output(sid)
        v2v = load_v2_verdict(sid) or {}
        v2_score = v2v.get("quality_score", "—")
        v3_score = r["v3_verdict"].get("quality_score", "—")
        retry_score = r.get("retry_verdict", {}).get("quality_score", None) if r.get("retry_verdict") else None

        summary_lines.append(
            f"<li><b>{sid}</b>: v2 <span class='score {_score_cls(v2_score)}'>{v2_score}/10</span> → "
            f"v3 <span class='score {_score_cls(v3_score)}'>{v3_score}/10</span>"
            + (f" → retry <span class='score {_score_cls(retry_score)}'>{retry_score}/10</span>" if retry_score is not None else " (no retry — no residuals detected)")
            + "</li>"
        )

        inv_pretty = json.dumps(r["inventory"], indent=2)
        verify_pretty = json.dumps(r.get("verify") or {}, indent=2)
        retry_verify_pretty = json.dumps(r.get("retry_verify") or {}, indent=2)
        v3_prompt = (OUT_DIR / r["v3_prompt_rel"]).read_text() if r.get("v3_prompt_rel") else ""
        retry_prompt = (OUT_DIR / r["retry_prompt_rel"]).read_text() if r.get("retry_prompt_rel") else ""

        retry_cell = (
            f"""<div class="cell">
      <div class="label">Retry output (v3 + residual fix) — <span class="score {_score_cls(retry_score)}">{retry_score}/10</span></div>
      <img src="{r['retry_output_rel']}" alt="retry">
      <div class="vs">{r['retry_verdict'].get('one_line_verdict','')}</div>
      <details><summary>retry prompt (residuals fed back)</summary><pre>{retry_prompt}</pre></details>
      <details><summary>post-retry verification</summary><pre>{retry_verify_pretty}</pre></details>
    </div>"""
            if retry_score is not None else
            """<div class="cell skipped">
      <div class="label">Retry skipped</div>
      <div class="vs">No residuals flagged by post-v3 verification.</div>
    </div>"""
        )

        residual_items = r.get("verify", {}).get("residual_items", [])
        residual_html = (
            f"<div class='flag bad'>residuals flagged: " + ", ".join(residual_items[:6]) + "</div>"
            if residual_items else "<div class='flag good'>no residuals flagged</div>"
        )

        room_blocks.append(f"""<div class="row">
  <h3>{r['room']} &nbsp; v2 <span class="score {_score_cls(v2_score)}">{v2_score}/10</span> → v3 <span class="score {_score_cls(v3_score)}">{v3_score}/10</span>{' → retry <span class="score ' + _score_cls(retry_score) + '">' + str(retry_score) + '/10</span>' if retry_score is not None else ''} &nbsp; <span class="elapsed">{r['elapsed_s']}s</span></h3>
  <div class="grid4">
    <div class="cell">
      <div class="label">INPUT</div>
      <img src="{r['input_rel']}">
    </div>
    <div class="cell">
      <div class="label">v2 output (single-category extraction)</div>
      {'<img src="' + v2_rel + '">' if v2_rel else '<div class="empty">v2 output not available</div>'}
      <div class="vs">{v2v.get('one_line_verdict','')}</div>
    </div>
    <div class="cell">
      <div class="label">v3 output (two-category PRESERVE / REMOVE) — <span class="score {_score_cls(v3_score)}">{v3_score}/10</span></div>
      <img src="{r['v3_output_rel']}">
      <div class="vs">{r['v3_verdict'].get('one_line_verdict','')}</div>
      {residual_html}
    </div>
    {retry_cell}
  </div>
  <div class="inventory-block">
    <details open>
      <summary>Two-category inventory (what Claude flagged as fixed vs freestanding)</summary>
      <pre>{inv_pretty}</pre>
    </details>
    <details>
      <summary>v3 dynamic prompt (what was sent to Kontext)</summary>
      <pre class="prompt">{v3_prompt}</pre>
    </details>
    <details>
      <summary>Post-v3 residual verification</summary>
      <pre>{verify_pretty}</pre>
    </details>
  </div>
</div>""")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Kontext v3 — two-category + retry loop</title>
<style>
  body {{ background: #0a0a0a; color: #e5e5e5; font-family: -apple-system, 'Segoe UI', sans-serif; padding: 24px; max-width: 2200px; margin: 0 auto; }}
  h1, h2, h3 {{ font-weight: 500; }}
  .summary {{ background: #141414; padding: 20px 24px; border-radius: 8px; margin-bottom: 32px; font-family: 'SF Mono', monospace; font-size: 13px; line-height: 1.9; }}
  .summary b, .summary li {{ color: #e5e5e5; }}
  .summary ul {{ margin: 8px 0 0 0; padding-left: 24px; }}
  .row {{ background: #141414; border-radius: 8px; padding: 16px; margin-bottom: 24px; border: 1px solid #232323; }}
  .row.fail {{ border-color: #ff6b6b; color: #ff6b6b; }}
  .grid4 {{ display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 14px; }}
  .cell img {{ width: 100%; border-radius: 6px; object-fit: contain; max-height: 360px; background: #000; display: block; }}
  .cell.skipped {{ opacity: 0.55; border: 1px dashed #333; padding: 12px; border-radius: 6px; }}
  .cell.skipped .label {{ color: #999; }}
  .cell .empty {{ height: 260px; background: #0a0a0a; border: 1px dashed #333; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #666; }}
  .label {{ font-size: 12px; font-weight: 500; margin-bottom: 8px; color: #f5f5f5; }}
  .vs {{ font-size: 11px; color: #aaa; padding: 8px; background: #0a0a0a; border-radius: 4px; margin-top: 8px; line-height: 1.4; }}
  .score {{ font-weight: 600; font-family: monospace; }}
  .score.good, .good {{ color: #4ade80; }}
  .score.meh, .meh {{ color: #fbbf24; }}
  .score.bad, .bad {{ color: #ff6b6b; }}
  .elapsed {{ color: #666; font-size: 11px; font-family: monospace; margin-left: 8px; }}
  .flag {{ font-size: 10px; margin-top: 8px; padding: 6px 8px; border-radius: 4px; font-family: monospace; }}
  .flag.bad {{ background: rgba(255,107,107,0.08); color: #ff6b6b; }}
  .flag.good {{ background: rgba(74,222,128,0.06); color: #4ade80; }}
  .inventory-block {{ margin-top: 14px; background: #0a0a0a; border-radius: 6px; padding: 8px 12px; }}
  .inventory-block details {{ margin: 6px 0; }}
  .inventory-block summary {{ font-size: 12px; color: #9aa3b5; cursor: pointer; padding: 4px 0; }}
  pre {{ background: #000; padding: 10px; border-radius: 4px; font-size: 10px; color: #aaa; overflow-x: auto; max-height: 360px; line-height: 1.4; }}
  pre.prompt {{ white-space: pre-wrap; }}
</style></head>
<body>
<h1>Kontext v3 — two-category extraction + retry-on-residual</h1>
<div class="summary">
  <div><b>Rooms:</b> {', '.join(r['short_id'] for r in rows if r['status']=='ok')}</div>
  <div><b>Total cost:</b> ${cost:.2f} / cap ${COST_CAP:.0f} &middot; <b>Elapsed:</b> {elapsed:.0f}s</div>
  <div style="margin-top:12px"><b>Score progression:</b></div>
  <ul>{''.join(summary_lines)}</ul>
</div>
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
    (OUT_DIR / "kontext_v3_results.json").write_text(
        json.dumps({"rows": rows, "total_cost_usd": round(_COST, 3), "total_elapsed_s": round(elapsed, 1)},
                   indent=2, default=str)
    )

    html = generate_html(rows, _COST, elapsed)
    (OUT_DIR / "gallery.html").write_text(html)
    logger.info("done — $%.2f, %.0fs", _COST, elapsed)
    logger.info("HTML: file://%s", OUT_DIR / "gallery.html")


if __name__ == "__main__":
    main()
