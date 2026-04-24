#!/usr/bin/env python3
"""Gemini 3 (nano-banana-pro/edit) empty-room bench across all 15 bench rooms.

Static v1 prompt. No feature extraction, no retry. Single call per room.
Side-by-side comparison with Kontext v1 outputs.

Output: /tmp/empty-room-bakeoff/gemini-bench/gallery.html
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
from scripts.kontext_bench import claude_verdict  # noqa: E402

logger = logging.getLogger("gemini-bench")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")

OUT_DIR = Path("/tmp/empty-room-bakeoff/gemini-bench")
OUT_DIR.mkdir(parents=True, exist_ok=True)
KONTEXT_V1_DIR = Path("/tmp/empty-room-bakeoff/kontext-bench")

BENCH_DIR = ROOT / "bench" / "rooms"
COST_CAP = 5.0
COST_GEMINI_EDIT = 0.25  # nano-banana-pro/edit estimate
COST_CLAUDE_VERDICT = 0.03

PASS_THRESHOLD = 7  # Claude quality_score >= 7 counts as "passed"

_COST = 0.0


def add_cost(x: float) -> None:
    global _COST
    _COST += x


GEMINI_PROMPT = (
    "Remove all furniture, bedding, rugs, clothing, electronics, personal items, "
    "decor, plants, lamps, posters, and clutter from this room. Keep the exact "
    "same walls, wall color, ceiling, ceiling fixtures, floor, floor material, "
    "windows, window treatments, doors, built-ins, architectural features, wall "
    "text, and camera angle. The result should be a completely empty barren room "
    "with only the architecture visible."
)


def call_nano_banana_pro_edit(image_url: str, prompt: str) -> str:
    import fal_client  # type: ignore

    last_err: Exception | None = None
    for attempt in range(3):
        try:
            r = fal_client.subscribe(
                "fal-ai/nano-banana-pro/edit",
                arguments={"prompt": prompt, "image_urls": [image_url]},
                with_logs=False,
                client_timeout=240.0,
            )
            images = r.get("images") or []
            if not images:
                raise RuntimeError(f"nb-pro no images: {list(r.keys())}")
            first = images[0] if isinstance(images[0], dict) else {"url": images[0]}
            url = first.get("url")
            if not url:
                raise RuntimeError(f"nb-pro no url: {first}")
            return url
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < 2:
                time.sleep(1.5 * (2 ** attempt))
    raise RuntimeError(f"nano-banana-pro/edit: {type(last_err).__name__}: {last_err}")


def process_room(room_path: Path) -> dict:
    short_id = room_path.stem.split("_")[0]
    t0 = time.time()
    try:
        pre = preprocess(str(room_path))
        input_rel = f"{short_id}_input.png"
        cv2.imwrite(str(OUT_DIR / input_rel), pre.working_bgr)

        fal_url = upload_image_to_fal(pre.working_bgr)
        out_url = call_nano_banana_pro_edit(fal_url, GEMINI_PROMPT)
        add_cost(COST_GEMINI_EDIT)

        output_bgr = download_image_to_bgr(
            out_url, (pre.working_bgr.shape[0], pre.working_bgr.shape[1])
        )
        output_rel = f"{short_id}_gemini.png"
        cv2.imwrite(str(OUT_DIR / output_rel), output_bgr)

        verdict = claude_verdict(pre.working_bgr, output_bgr)
        # claude_verdict charges COST_CLAUDE (0.03) internally via bakeoff helper
        # — already covered by COST_CLAUDE_VERDICT above

        elapsed = time.time() - t0
        logger.info(
            "%s done %.1fs — gemini=%s/10 — %s",
            short_id, elapsed, verdict.get("quality_score"),
            verdict.get("one_line_verdict", "")[:80],
        )
        return {
            "room": room_path.stem,
            "short_id": short_id,
            "status": "ok",
            "input_rel": input_rel,
            "gemini_rel": output_rel,
            "verdict": verdict,
            "elapsed_s": round(elapsed, 1),
        }
    except Exception as exc:  # noqa: BLE001
        logger.error("%s FAILED: %s\n%s", short_id, exc, traceback.format_exc())
        return {
            "room": room_path.stem, "short_id": short_id,
            "status": "fail", "error": f"{type(exc).__name__}: {exc}",
        }


def load_kontext_v1() -> dict:
    p = KONTEXT_V1_DIR / "kontext_bench_results.json"
    if not p.exists():
        return {}
    data = json.loads(p.read_text())
    return {r["short_id"]: r for r in data.get("rows", []) if r.get("status") == "ok"}


def _copy_kontext_v1_output(short_id: str) -> str | None:
    src = KONTEXT_V1_DIR / f"{short_id}_empty.png"
    if not src.exists():
        return None
    dst = OUT_DIR / f"{short_id}_kontext_v1.png"
    dst.write_bytes(src.read_bytes())
    return dst.name


def _score_cls(s) -> str:
    if not isinstance(s, (int, float)):
        return ""
    return "good" if s >= 8 else ("meh" if s >= 5 else "bad")


def generate_html(rows: list[dict], v1_by_id: dict, cost: float, elapsed: float) -> str:
    # Compute pass/fail categorization for summary table
    gemini_pass_ids: list[str] = []
    kontext_pass_ids: list[str] = []
    gemini_wins: list[tuple[str, int, int]] = []
    kontext_wins: list[tuple[str, int, int]] = []
    both_pass: list[str] = []
    both_fail: list[str] = []
    tie_pairs: list[tuple[str, int, int]] = []

    for r in rows:
        if r["status"] != "ok":
            continue
        sid = r["short_id"]
        gs = r["verdict"].get("quality_score")
        v1e = v1_by_id.get(sid)
        ks = v1e["verdict"].get("quality_score") if v1e else None

        g_pass = isinstance(gs, (int, float)) and gs >= PASS_THRESHOLD
        k_pass = isinstance(ks, (int, float)) and ks >= PASS_THRESHOLD
        if g_pass:
            gemini_pass_ids.append(sid)
        if k_pass:
            kontext_pass_ids.append(sid)
        if isinstance(gs, (int, float)) and isinstance(ks, (int, float)):
            if gs > ks:
                gemini_wins.append((sid, ks, gs))
            elif ks > gs:
                kontext_wins.append((sid, ks, gs))
            else:
                tie_pairs.append((sid, ks, gs))
        if g_pass and k_pass:
            both_pass.append(sid)
        elif not g_pass and not k_pass:
            both_fail.append(sid)

    # Recommendation
    if len(gemini_pass_ids) >= 13:
        recommendation = f"<span class='good'>COMMIT TO GEMINI</span> — passes on {len(gemini_pass_ids)}/15 rooms (≥13 threshold met)."
    elif abs(len(gemini_pass_ids) - len(kontext_pass_ids)) <= 1:
        recommendation = (
            f"<span class='meh'>BUILD HYBRID</span> — Kontext {len(kontext_pass_ids)}/15, Gemini "
            f"{len(gemini_pass_ids)}/15. Run Kontext first, retry with Gemini on verdict-fail, "
            f"mask-based fallback on both-fail."
        )
    elif len(gemini_pass_ids) > len(kontext_pass_ids):
        recommendation = (
            f"<span class='meh'>LEAN GEMINI</span> — Gemini {len(gemini_pass_ids)}/15 vs Kontext "
            f"{len(kontext_pass_ids)}/15. Hybrid may still be warranted."
        )
    else:
        recommendation = (
            f"<span class='meh'>STAY KONTEXT</span> — Kontext {len(kontext_pass_ids)}/15 vs Gemini "
            f"{len(gemini_pass_ids)}/15. Gemini isn't a clear upgrade here."
        )

    gemini_wins_sorted = sorted(gemini_wins, key=lambda x: x[2] - x[1], reverse=True)
    kontext_wins_sorted = sorted(kontext_wins, key=lambda x: x[1] - x[2], reverse=True)

    def _pair_list(pairs: list[tuple[str, int, int]]) -> str:
        if not pairs:
            return "<i>none</i>"
        return ", ".join(f"<b>{sid}</b> (K {k} → G {g})" for (sid, k, g) in pairs)

    summary = f"""<div class="summary">
  <h2 style="margin-top:0">Summary — {len(rows)} rooms, threshold = {PASS_THRESHOLD}/10</h2>
  <table class="sumtab">
    <tr><td>Kontext v1 passed</td><td><b>{len(kontext_pass_ids)}/15</b>: {', '.join(kontext_pass_ids) or '—'}</td></tr>
    <tr><td>Gemini passed</td><td><b>{len(gemini_pass_ids)}/15</b>: {', '.join(gemini_pass_ids) or '—'}</td></tr>
    <tr><td>Gemini &gt; Kontext</td><td>{_pair_list(gemini_wins_sorted)}</td></tr>
    <tr><td>Kontext &gt; Gemini</td><td>{_pair_list(kontext_wins_sorted)}</td></tr>
    <tr><td>Tie on score</td><td>{_pair_list(tie_pairs)}</td></tr>
    <tr><td>Both pass (≥{PASS_THRESHOLD})</td><td>{', '.join(both_pass) or '—'}</td></tr>
    <tr><td>Both fail (&lt;{PASS_THRESHOLD})</td><td><span class="bad">{', '.join(both_fail) or '—'}</span></td></tr>
    <tr><td>Cost / elapsed</td><td>${cost:.2f} / cap ${COST_CAP:.0f} &middot; {elapsed:.0f}s</td></tr>
  </table>
  <div class="reco">Recommendation: {recommendation}</div>
</div>"""

    row_html = []
    for r in rows:
        sid = r["short_id"]
        if r["status"] != "ok":
            row_html.append(f"""<div class="row fail">
  <div class="name">{r['room']}</div><div class="error">FAIL: {r.get('error','')}</div>
</div>""")
            continue
        v = r["verdict"]
        gs = v.get("quality_score", "—")
        v1e = v1_by_id.get(sid)
        v1v = v1e["verdict"] if v1e else {}
        ks = v1v.get("quality_score", "—")

        kontext_img = _copy_kontext_v1_output(sid)

        delta_str = ""
        if isinstance(gs, (int, float)) and isinstance(ks, (int, float)):
            d = gs - ks
            cls = "good" if d > 0 else ("bad" if d < 0 else "")
            delta_str = f"<span class='{cls}'>Δ{'+' if d > 0 else ''}{d}</span>"

        g_residual = v.get("residual_items_visible", [])
        g_arch_changes = v.get("architecture_changes", [])
        pretty = json.dumps(v, indent=2)

        row_html.append(f"""<div class="row">
  <div class="row-header">
    <b>{r['room']}</b> &nbsp; Kontext v1 <span class="score {_score_cls(ks)}">{ks}/10</span> vs Gemini <span class="score {_score_cls(gs)}">{gs}/10</span> {delta_str}
    <span class="elapsed">{r['elapsed_s']}s</span>
  </div>
  <div class="grid4">
    <div class="cell">
      <div class="label">INPUT</div>
      <img src="{r['input_rel']}">
    </div>
    <div class="cell">
      <div class="label">Kontext v1 — <span class="score {_score_cls(ks)}">{ks}/10</span></div>
      {f'<img src="{kontext_img}">' if kontext_img else '<div class="empty">(kontext v1 output not available)</div>'}
      <div class="vs">{v1v.get('one_line_verdict','')}</div>
    </div>
    <div class="cell">
      <div class="label">Gemini (nano-banana-pro/edit) — <span class="score {_score_cls(gs)}">{gs}/10</span></div>
      <img src="{r['gemini_rel']}">
      <div class="vs">{v.get('one_line_verdict','')}</div>
      {('<div class="flag bad">residual: ' + ", ".join(g_residual[:4]) + '</div>') if g_residual else ''}
      {('<div class="flag meh">arch changes: ' + ", ".join(g_arch_changes[:3]) + '</div>') if g_arch_changes else ''}
    </div>
    <div class="cell verdict-cell">
      <div class="label">Claude verdict JSON (Gemini)</div>
      <pre>{pretty}</pre>
    </div>
  </div>
</div>""")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Gemini vs Kontext — empty-room bench</title>
<style>
  body {{ background: #0a0a0a; color: #e5e5e5; font-family: -apple-system, 'Segoe UI', sans-serif; padding: 24px; max-width: 2200px; margin: 0 auto; }}
  h1, h2 {{ font-weight: 500; }}
  .summary {{ background: #141414; padding: 20px 24px; border-radius: 8px; margin-bottom: 32px; font-size: 13px; line-height: 1.8; }}
  .sumtab {{ width: 100%; border-collapse: collapse; font-family: 'SF Mono', monospace; font-size: 12px; }}
  .sumtab td {{ padding: 6px 10px; border-bottom: 1px solid #232323; vertical-align: top; }}
  .sumtab td:first-child {{ color: #888; width: 200px; }}
  .reco {{ margin-top: 16px; padding: 12px 16px; background: #0a0a0a; border-radius: 6px; font-size: 13px; }}
  .row {{ background: #141414; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #232323; }}
  .row.fail {{ border-color: #ff6b6b; color: #ff6b6b; }}
  .row-header {{ font-size: 14px; margin-bottom: 12px; color: #ddd; }}
  .grid4 {{ display: grid; grid-template-columns: 1fr 1fr 1fr 1.1fr; gap: 14px; }}
  .cell img {{ width: 100%; border-radius: 6px; object-fit: contain; max-height: 360px; background: #000; display: block; }}
  .cell .empty {{ height: 260px; background: #0a0a0a; border: 1px dashed #333; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #666; font-size: 11px; }}
  .verdict-cell pre {{ margin: 0; font-size: 10px; line-height: 1.4; color: #aaa; background: #000; padding: 10px; border-radius: 4px; max-height: 360px; overflow-y: auto; }}
  .label {{ font-size: 12px; font-weight: 500; margin-bottom: 8px; color: #f5f5f5; }}
  .vs {{ font-size: 11px; color: #aaa; padding: 8px; background: #0a0a0a; border-radius: 4px; margin-top: 8px; line-height: 1.4; }}
  .flag {{ font-size: 10px; margin-top: 6px; padding: 5px 8px; border-radius: 4px; font-family: monospace; }}
  .flag.bad {{ background: rgba(255,107,107,0.08); color: #ff6b6b; }}
  .flag.meh {{ background: rgba(251,191,36,0.08); color: #fbbf24; }}
  .score {{ font-weight: 600; font-family: monospace; }}
  .score.good, .good {{ color: #4ade80; }}
  .score.meh, .meh {{ color: #fbbf24; }}
  .score.bad, .bad {{ color: #ff6b6b; }}
  .elapsed {{ color: #666; font-size: 11px; font-family: monospace; margin-left: 10px; }}
</style></head>
<body>
<h1>Gemini 3 (nano-banana-pro/edit) vs Kontext v1 — 15-room bench</h1>
{summary}
<h2>Per-room comparison — [input | Kontext v1 | Gemini | verdict JSON]</h2>
{chr(10).join(row_html)}
</body></html>"""
    return html


def main() -> None:
    t0 = time.time()
    _load_fal_key()
    _load_anthropic_key()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise RuntimeError("ANTHROPIC_API_KEY missing")

    rooms = sorted(BENCH_DIR.glob("room-*.webp"))
    logger.info("found %d rooms", len(rooms))

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

    v1_by_id = load_kontext_v1()
    elapsed = time.time() - t0
    (OUT_DIR / "gemini_bench_results.json").write_text(
        json.dumps({"rows": rows, "total_cost_usd": round(_COST, 3),
                    "total_elapsed_s": round(elapsed, 1)}, indent=2, default=str)
    )

    html = generate_html(rows, v1_by_id, _COST, elapsed)
    (OUT_DIR / "gallery.html").write_text(html)
    logger.info("done — $%.2f, %.0fs", _COST, elapsed)
    logger.info("HTML: file://%s", OUT_DIR / "gallery.html")


if __name__ == "__main__":
    main()
