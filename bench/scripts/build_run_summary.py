"""Aggregate per-room metrics into run-summary.md + stratification analysis."""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BENCH = ROOT / "bench"
OUT = BENCH / "run-1-empty-room"
METRICS_DIR = OUT / "metrics"
SUMMARY_PATH = OUT / "run-summary.md"

manifest = json.loads((BENCH / "manifest.json").read_text())
rooms = manifest["rooms"]

results: list[dict] = []
for r in rooms:
    p = METRICS_DIR / f"{r['id']}.json"
    if p.exists():
        results.append(json.loads(p.read_text()))
    else:
        results.append({"room_id": r["id"], "error": "missing metrics file"})

total_cost = sum(r.get("metrics", {}).get("cost_usd", r.get("cost_usd", 0.0)) for r in results)
total_latency = sum(r.get("metrics", {}).get("total_latency_s", 0.0) for r in results)
passed_ids = [r["room_id"] for r in results if r.get("overall_pass")]
passed = len(passed_ids)

# Near-pass analysis
ssim_vals = [(r["room_id"], r.get("metrics", {}).get("ssim_unmasked", 0)) for r in results if "metrics" in r]
mean_ssim = sum(s for _, s in ssim_vals) / len(ssim_vals) if ssim_vals else 0.0

def fmt_row(r: dict, strat: dict) -> str:
    m = r.get("metrics", {})
    pm = r.get("pass_per_metric", {})
    stag = f"{strat.get('clutter','?')[:1]}/{strat.get('geometry','?')[:3]}/{strat.get('texture','?')[:5]}/{strat.get('lighting','?')[:5]}"
    def mark(v: bool | None) -> str:
        return "✓" if v else "✗"
    ssim = m.get("ssim_unmasked")
    ghost = m.get("ghost_furniture_area_pct")
    vp = m.get("vp_shift_pct")
    edr = m.get("edge_density_ratio")
    lat = m.get("bria_latency_s")
    cost = m.get("cost_usd", 0.0)
    if r.get("error"):
        return f"| {r['room_id']} | {stag} | ERROR: {r['error'][:30]} |"
    return (
        f"| {r['room_id']} | {stag} | "
        f"{ssim:.3f}{mark(pm.get('ssim_unmasked'))} | "
        f"{ghost:.1f}%{mark(pm.get('ghost_furniture'))} | "
        f"{vp:.1f}%{mark(pm.get('vp_shift'))} | "
        f"{edr:.2f}{mark(pm.get('edge_density'))} | "
        f"{lat:.1f}s{mark(pm.get('latency'))} | "
        f"${cost:.3f}{mark(pm.get('cost'))} | "
        f"**{mark(r.get('overall_pass'))}** |"
    )

strat_by_id = {r["id"]: r["stratification"] for r in rooms}
rows = [fmt_row(r, strat_by_id.get(r["room_id"], {})) for r in results]

# Stratification breakdown
def group_pass(dim: str) -> dict[str, tuple[int, int]]:
    out: dict[str, list[int]] = defaultdict(list)
    for r in results:
        if "overall_pass" not in r:
            continue
        val = strat_by_id.get(r["room_id"], {}).get(dim, "unknown")
        out[val].append(1 if r["overall_pass"] else 0)
    return {k: (sum(v), len(v)) for k, v in out.items()}

def strat_md(dim: str) -> str:
    g = group_pass(dim)
    return " · ".join(f"{k}: {p}/{t}" for k, (p, t) in g.items())

# Failure mode summary
failure_lines = []
for r in results:
    if r.get("overall_pass") or r.get("error"):
        if r.get("error"):
            failure_lines.append(f"- **{r['room_id']}** — ERROR: {r['error']}")
        continue
    pm = r.get("pass_per_metric", {})
    m = r.get("metrics", {})
    failed = [k for k, v in pm.items() if not v]
    strat = strat_by_id.get(r["room_id"], {})
    detail = []
    if "ssim_unmasked" in failed:
        detail.append(f"SSIM {m['ssim_unmasked']:.3f} < 0.985")
    if "ghost_furniture" in failed:
        detail.append(f"ghost {m['ghost_furniture_area_pct']:.1f}% > 0.5%")
    if "vp_shift" in failed:
        detail.append(f"VP {m['vp_shift_pct']:.1f}% ≥ 2%")
    if "edge_density" in failed:
        detail.append(f"EDR {m['edge_density_ratio']:.2f} outside [0.7,1.3]")
    strat_str = "/".join(str(v) for v in strat.values())
    failure_lines.append(f"- **{r['room_id']}** ({strat_str}): {'; '.join(detail)}")

# Near-misses (would pass if one threshold relaxed slightly)
near_miss = []
for r in results:
    if r.get("overall_pass") or r.get("error"):
        continue
    pm = r.get("pass_per_metric", {})
    n_fail = sum(1 for v in pm.values() if not v)
    if n_fail == 1:
        only_failed = [k for k, v in pm.items() if not v][0]
        near_miss.append(f"- **{r['room_id']}** failed only on `{only_failed}`")

# Gate decision
if passed >= 13:
    gate = "✅ **PROCEED TO RUN 2** — ≥13/15 pass, gate met"
elif passed >= 10:
    gate = "⚠️ **MIXED** — 10-12/15 pass. Review failure modes with Daksh before Run 2"
else:
    gate = (
        "❌ **FAIL — PRIMARY PATH INADEQUATE** — <10/15 pass on §3.4 strict thresholds. "
        "Daksh decides: test Canny+FLUX secondary, test LaMa tertiary, or reconsider architecture."
    )

lines = [
    "# Phase 0.5 Run 1 — Empty-Room Bench Summary",
    "",
    "**Date:** 2026-04-20  ",
    "**Input:** 15 rooms from `bench/manifest.json`  ",
    f"**Path tested:** Bria Eraser (`fal-ai/bria/eraser`) primary, SAM-3 furniture union + 16px dilation  ",
    f"**Total cost:** ${total_cost:.2f} (target ≤ $5, hard cap $10)  ",
    f"**Total wall-clock (sum of per-room):** {total_latency:.0f}s (run concurrent ×3)  ",
    f"**Pass rate:** {passed}/15 rooms (gate: ≥13)  ",
    f"**Mean SSIM-unmasked:** {mean_ssim:.4f} (§3.4 rollup needs ≥ 0.99)  ",
    "",
    "## Per-room results",
    "",
    "| Room | Strat (clutter/geom/tex/light) | SSIM ≥0.985 | Ghost ≤0.5% | VP <2% | EDR 0.7–1.3 | Lat ≤90s | Cost ≤$0.50 | **PASS** |",
    "|---|---|---|---|---|---|---|---|---|",
    *rows,
    "",
    "## Stratification analysis (pass counts)",
    "",
    f"- **Clutter:** {strat_md('clutter')}",
    f"- **Geometry:** {strat_md('geometry')}",
    f"- **Texture:** {strat_md('texture')}",
    f"- **Lighting:** {strat_md('lighting')}",
    "",
    "## Failure mode summary",
    "",
    *(failure_lines or ["_(none)_"]),
    "",
    "## Near-misses (single-metric failures)",
    "",
    *(near_miss or ["_(none)_"]),
    "",
    "## Gate decision",
    "",
    gate,
    "",
    "## Open questions for Daksh",
    "",
    "1. **Is §3.4 SSIM-unmasked ≥ 0.985 realistic for amateur phone photography?** Control room-06 (near-empty bay window) hit SSIM 0.985 exactly — the threshold is at the noise floor of Bria's resampling/compression pipeline even without meaningful erasure. Any real erasure pushes it lower.",
    "2. **SAM-3 furniture coverage is frequently incomplete.** Room-13 (2.3% raw) and room-14 (1.3% raw) are flagged as low-coverage — the furniture those rooms contain (exposed brick furniture, stacked-stone built-ins) may need different prompts. Should the primary-mask prompt list be expanded (ottoman, bench, stool, bookshelf, artwork, curtains) or should we accept that SAM-3 is a lower-bound and dilation compensates?",
    "3. **Ghost-furniture failures correlate with high-texture inputs.** Rooms with patterned rugs / wood paneling (room-05 21.6%, room-15 15.1%) trigger more ghosts, suggesting Bria's generative continuation mis-reads texture as furniture silhouette.",
    "4. **VP-shift proxy.** My implementation is a line-midpoint centroid distance, not true RANSAC vanishing-point estimation. Values are on an unknown scale — the 2% threshold may not map cleanly. Research §3.4 says \"LSD line detector\" without specifying the VP aggregation. Flagging this as a metric-implementation ambiguity, not a Bria failure.",
    "5. **Recommendation for Run 2:** Before testing fallbacks, consider (a) widening the §3.4 SSIM threshold to 0.97 based on empirical ceiling, (b) expanding the SAM-3 prompt list, (c) A/B against `fal-ai/bria/eraser` prompt-free mode if it exists (our current run passes explicit mask).",
    "",
    "## Per-room cost reconciliation",
    "",
    f"Per-room projected: ${len(rooms) * 0.135 / len(rooms):.3f} (11 SAM-3 primary + 8 SAM-3 ghost + 1 Bria)  ",
    f"Per-room observed: ${total_cost/len(results):.3f} avg  ",
    f"Total: ${total_cost:.2f}",
    "",
]

SUMMARY_PATH.write_text("\n".join(lines))
print(f"Wrote {SUMMARY_PATH}")
print(f"Pass rate: {passed}/{len(results)} | mean SSIM: {mean_ssim:.4f} | total cost: ${total_cost:.2f}")
