"""Aggregate per-room metrics into run-summary.md for Run 2.

Includes:
  1. Standard per-room table with 6 metric columns evaluated against
     calibrated thresholds (SSIM ≥0.97, ghost <1%, VP <3%, edge 0.7-1.3,
     lat ≤60s, cost ≤$0.50).
  2. Per-metric pass rate (X/15 per metric).
  3. Overall pass rate.
  4. Rescan stats: how many rooms triggered rescan, avg coverage before vs
     after, did rescan rooms outperform non-rescan rooms?
  5. H2 hard-exit table for room-01, room-09, room-11 vs Run 1.5 SSIM:
     improvement ≥0.02 → H2 may be partially mask-driven;
     none improve ≥0.02 → H2 confirmed Bria-architectural-drift.
  6. room-10 over-masking check: Run 1.5 vs Run 2 dilated coverage %.
  7. Gate decision:
     ≥13/15 → PROCEED TO RUN 3
     10–12/15 → MIXED
     <10/15 → FAIL
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BENCH = ROOT / "bench"

# Run 2 directories (write target)
OUT = BENCH / "run-2-empty-room"
METRICS_DIR = OUT / "metrics"
SUMMARY_PATH = OUT / "run-summary.md"

# Run 1.5 directories (read-only — do not modify)
RUN15_METRICS_DIR = BENCH / "run-1-5-empty-room" / "metrics"

manifest = json.loads((BENCH / "manifest.json").read_text())
rooms = manifest["rooms"]

# Run 2 calibrated thresholds (same as bench script)
THRESHOLDS = {
    "ssim_unmasked_min": 0.97,
    "ghost_area_max_pct": 1.0,
    "vp_shift_max_pct": 3.0,
    "edge_density_min": 0.7,
    "edge_density_max": 1.3,
    "latency_p95_max_s": 60.0,
    "cost_max_usd_per_room": 0.50,
}

# H2 hard-exit rooms confirmed in mask-audit.md
H2_ROOMS = ["room-01", "room-09", "room-11"]

# ── Load Run 2 results ────────────────────────────────────────────────────────
results: list[dict] = []
for r in rooms:
    p = METRICS_DIR / f"{r['id']}.json"
    if p.exists():
        results.append(json.loads(p.read_text()))
    else:
        results.append({"room_id": r["id"], "error": "missing metrics file"})

# ── Load Run 1.5 results (for H2 delta + room-10 check) ─────────────────────
run15_results: dict[str, dict] = {}
for r in rooms:
    p = RUN15_METRICS_DIR / f"{r['id']}.json"
    if p.exists():
        run15_results[r["id"]] = json.loads(p.read_text())

# ── Aggregate stats ───────────────────────────────────────────────────────────
total_cost = sum(r.get("metrics", {}).get("cost_usd", r.get("cost_usd", 0.0)) for r in results)
total_latency = sum(r.get("metrics", {}).get("total_latency_s", 0.0) for r in results)

strat_by_id = {r["id"]: r["stratification"] for r in rooms}


# ── Pass/fail helpers ─────────────────────────────────────────────────────────
def metric_passes(r: dict, metric_key: str) -> bool:
    """Evaluate a single metric against Run 2 calibrated thresholds."""
    m = r.get("metrics", {})
    if metric_key == "ssim_unmasked":
        v = m.get("ssim_unmasked")
        return v is not None and v >= THRESHOLDS["ssim_unmasked_min"]
    if metric_key == "ghost_furniture":
        v = m.get("ghost_furniture_area_pct")
        return v is not None and v < THRESHOLDS["ghost_area_max_pct"]
    if metric_key == "vp_shift":
        v = m.get("vp_shift_pct")
        return v is not None and v < THRESHOLDS["vp_shift_max_pct"]
    if metric_key == "edge_density":
        v = m.get("edge_density_ratio")
        return v is not None and THRESHOLDS["edge_density_min"] <= v <= THRESHOLDS["edge_density_max"]
    if metric_key == "latency":
        v = m.get("bria_latency_s")
        return v is not None and v <= THRESHOLDS["latency_p95_max_s"]
    if metric_key == "cost":
        v = m.get("cost_usd")
        return v is not None and v <= THRESHOLDS["cost_max_usd_per_room"]
    return False


def passes_run2(r: dict) -> bool:
    """Overall pass under Run 2 calibrated thresholds."""
    if r.get("error"):
        return False
    keys = ["ssim_unmasked", "ghost_furniture", "vp_shift", "edge_density", "latency", "cost"]
    return all(metric_passes(r, k) for k in keys)


METRIC_KEYS = ["ssim_unmasked", "ghost_furniture", "vp_shift", "edge_density", "latency", "cost"]
METRIC_LABELS = {
    "ssim_unmasked": f"SSIM ≥{THRESHOLDS['ssim_unmasked_min']}",
    "ghost_furniture": f"Ghost <{THRESHOLDS['ghost_area_max_pct']}%",
    "vp_shift": f"VP <{THRESHOLDS['vp_shift_max_pct']}%",
    "edge_density": f"EDR {THRESHOLDS['edge_density_min']}–{THRESHOLDS['edge_density_max']}",
    "latency": f"Lat ≤{THRESHOLDS['latency_p95_max_s']}s",
    "cost": f"Cost ≤${THRESHOLDS['cost_max_usd_per_room']}",
}

# ── Per-metric pass rates ─────────────────────────────────────────────────────
metric_pass_counts: dict[str, int] = {k: 0 for k in METRIC_KEYS}
for r in results:
    if r.get("error"):
        continue
    for k in METRIC_KEYS:
        if metric_passes(r, k):
            metric_pass_counts[k] += 1

n_rooms = len(results)
n_with_data = sum(1 for r in results if not r.get("error"))
passed_overall = sum(1 for r in results if passes_run2(r))

# ── Per-room table ────────────────────────────────────────────────────────────
def mark(v: bool) -> str:
    return "✓" if v else "✗"


def fmt_row(r: dict, strat: dict) -> str:
    m = r.get("metrics", {})
    stag = (
        f"{strat.get('clutter','?')[:1]}/"
        f"{strat.get('geometry','?')[:3]}/"
        f"{strat.get('texture','?')[:5]}/"
        f"{strat.get('lighting','?')[:5]}"
    )
    if r.get("error"):
        return f"| {r['room_id']} | {stag} | ERROR: {r['error'][:40]} |"

    ssim = m.get("ssim_unmasked")
    ghost = m.get("ghost_furniture_area_pct")
    vp = m.get("vp_shift_pct")
    edr = m.get("edge_density_ratio")
    lat = m.get("bria_latency_s")
    cost = m.get("cost_usd", 0.0)
    rescan = "R" if r.get("rescan_triggered") else ""

    ssim_str = f"{ssim:.3f}" if ssim is not None else "—"
    ghost_str = f"{ghost:.1f}%" if ghost is not None else "—"
    vp_str = f"{vp:.1f}%" if vp is not None else "—"
    edr_str = f"{edr:.2f}" if edr is not None else "—"
    lat_str = f"{lat:.1f}s" if lat is not None else "—"

    overall = passes_run2(r)
    return (
        f"| {r['room_id']}{rescan} | {stag} | "
        f"{ssim_str}{mark(metric_passes(r,'ssim_unmasked'))} | "
        f"{ghost_str}{mark(metric_passes(r,'ghost_furniture'))} | "
        f"{vp_str}{mark(metric_passes(r,'vp_shift'))} | "
        f"{edr_str}{mark(metric_passes(r,'edge_density'))} | "
        f"{lat_str}{mark(metric_passes(r,'latency'))} | "
        f"${cost:.3f}{mark(metric_passes(r,'cost'))} | "
        f"**{mark(overall)}** |"
    )


rows = [fmt_row(r, strat_by_id.get(r["room_id"], {})) for r in results]

# ── Rescan stats ──────────────────────────────────────────────────────────────
rescan_rooms_data = [r for r in results if r.get("rescan_triggered")]
non_rescan_rooms_data = [r for r in results if not r.get("rescan_triggered") and not r.get("error")]

n_rescan = len(rescan_rooms_data)
rescan_pass = sum(1 for r in rescan_rooms_data if passes_run2(r))
non_rescan_pass = sum(1 for r in non_rescan_rooms_data if passes_run2(r))

avg_cov_before = (
    sum(r.get("coverage_before_rescan") or 0 for r in rescan_rooms_data) / n_rescan
    if n_rescan else 0.0
)
avg_cov_after = (
    sum(r.get("coverage_after_rescan") or 0 for r in rescan_rooms_data) / n_rescan
    if n_rescan else 0.0
)

rescan_ssim_vals = [
    r.get("metrics", {}).get("ssim_unmasked") or 0
    for r in rescan_rooms_data
    if not r.get("error")
]
non_rescan_ssim_vals = [
    r.get("metrics", {}).get("ssim_unmasked") or 0
    for r in non_rescan_rooms_data
    if not r.get("error")
]

avg_rescan_ssim = sum(rescan_ssim_vals) / len(rescan_ssim_vals) if rescan_ssim_vals else 0.0
avg_non_rescan_ssim = sum(non_rescan_ssim_vals) / len(non_rescan_ssim_vals) if non_rescan_ssim_vals else 0.0

# Did rescan rooms outperform non-rescan?
if n_rescan > 0 and non_rescan_rooms_data:
    rescan_outperforms = avg_rescan_ssim > avg_non_rescan_ssim
    rescan_comparison = (
        f"Rescan avg SSIM {avg_rescan_ssim:.4f} vs non-rescan avg SSIM {avg_non_rescan_ssim:.4f} — "
        + ("rescan rooms outperformed" if rescan_outperforms else "rescan rooms did NOT outperform non-rescan")
    )
else:
    rescan_comparison = "Insufficient data for comparison"

rescan_table_rows = []
for r in rescan_rooms_data:
    rid = r["room_id"]
    strat = strat_by_id.get(rid, {})
    before = r.get("coverage_before_rescan")
    after = r.get("coverage_after_rescan")
    ssim_v = r.get("metrics", {}).get("ssim_unmasked")
    rescan_table_rows.append(
        f"| {rid} | {strat.get('clutter','?')} | "
        f"{before:.1f}% | {after:.1f}% | "
        f"{(after - before):.1f}pp | "
        f"{f'{ssim_v:.4f}' if ssim_v is not None else '—'} | "
        f"{'PASS' if passes_run2(r) else 'FAIL'} |"
    )

# ── H2 hard-exit table ────────────────────────────────────────────────────────
h2_rows: list[str] = []
h2_all_improved_02 = True
h2_any_improved_02 = False

for rid in H2_ROOMS:
    r2 = next((r for r in results if r.get("room_id") == rid), None)
    r15 = run15_results.get(rid)
    ssim_15 = r15.get("metrics", {}).get("ssim_unmasked") if r15 else None
    ssim_2 = r2.get("metrics", {}).get("ssim_unmasked") if r2 and not r2.get("error") else None
    if ssim_15 is not None and ssim_2 is not None:
        delta = ssim_2 - ssim_15
        improved = delta >= 0.02
        if improved:
            h2_any_improved_02 = True
        else:
            h2_all_improved_02 = False
        h2_rows.append(
            f"| {rid} | {ssim_15:.4f} | {ssim_2:.4f} | {delta:+.4f} | {'YES' if improved else 'no'} |"
        )
    else:
        h2_all_improved_02 = False
        h2_rows.append(f"| {rid} | {'—' if ssim_15 is None else f'{ssim_15:.4f}'} | {'—' if ssim_2 is None else f'{ssim_2:.4f}'} | — | no |")

if h2_all_improved_02:
    h2_verdict = (
        "H2 may be partially mask-driven, re-evaluate. ALL three H2 rooms improved by ≥0.02 SSIM. "
        "Bria-architectural-drift hypothesis weakened — improved masking contributed meaningfully."
    )
elif h2_any_improved_02:
    h2_verdict = (
        "MIXED H2 signal. Some H2 rooms improved ≥0.02, others did not. "
        "Both mask quality and Bria drift likely contributing. Further investigation needed."
    )
else:
    h2_verdict = (
        "H2 confirmed as Bria-architectural-drift; mask iteration does not address it. "
        "NONE of room-01/09/11 improved by ≥0.02 SSIM with 24px dilation + rescan. "
        "Root cause is Bria VAE latent-space drift on complex room content, not mask coverage."
    )

# ── room-10 over-masking check ────────────────────────────────────────────────
r10_r2 = next((r for r in results if r.get("room_id") == "room-10"), None)
r10_r15 = run15_results.get("room-10")

r10_cov_r15 = r10_r15.get("mask_coverage_dilated_pct") if r10_r15 else None
r10_cov_r2 = r10_r2.get("mask_coverage_dilated_pct") if r10_r2 and not r10_r2.get("error") else None

if r10_cov_r15 is not None and r10_cov_r2 is not None:
    if r10_cov_r2 >= r10_cov_r15:
        r10_verdict = (
            f"Over-masking persists (Run 1.5: {r10_cov_r15:.1f}% → Run 2: {r10_cov_r2:.1f}%). "
            "24px dilation increased coverage further. H1 (mask coverage) flag on room-10 is a real concern."
        )
    elif 15.0 <= r10_cov_r2 <= 30.0:
        r10_verdict = (
            f"Over-masking transient — H1 false alarm in audit "
            f"(Run 1.5: {r10_cov_r15:.1f}% → Run 2: {r10_cov_r2:.1f}%). "
            "Coverage in 15–30% range is reasonable for this room."
        )
    else:
        r10_verdict = (
            f"Run 1.5: {r10_cov_r15:.1f}% → Run 2: {r10_cov_r2:.1f}%. "
            "Coverage outside expected range; inspect mask visually."
        )
else:
    r10_verdict = "Insufficient data to compare room-10 coverage across runs."

# ── Gate decision ─────────────────────────────────────────────────────────────
if passed_overall >= 13:
    gate = "PROCEED TO RUN 3 — full-pipeline test"
    gate_detail = f"≥13/15 pass rate achieved ({passed_overall}/15). Mask iteration sufficient for full-pipeline integration test."
elif passed_overall >= 10:
    gate = "MIXED — combine with Track 2 prompt-free probe results before proceeding"
    gate_detail = (
        f"10–12/15 pass rate ({passed_overall}/15). Neither clear success nor failure. "
        "Track 2 (prompt-free probe) results needed to determine if mask iteration is additive."
    )
else:
    gate = "FAIL — Bria mask-mode not viable primary; escalate to Canny+FLUX secondary"
    gate_detail = (
        f"<10/15 pass rate ({passed_overall}/15). Mask iteration alone insufficient. "
        "Recommend escalating to Canny+FLUX secondary path as described in §3.5."
    )

# ── Stratification breakdown ──────────────────────────────────────────────────
def group_pass(dim: str) -> dict[str, tuple[int, int]]:
    out: dict[str, list[int]] = defaultdict(list)
    for r in results:
        if "metrics" not in r:
            continue
        val = strat_by_id.get(r["room_id"], {}).get(dim, "unknown")
        out[val].append(1 if passes_run2(r) else 0)
    return {k: (sum(v), len(v)) for k, v in out.items()}


def strat_md(dim: str) -> str:
    g = group_pass(dim)
    return " · ".join(f"{k}: {p}/{t}" for k, (p, t) in sorted(g.items()))

# ── Failure mode summary ──────────────────────────────────────────────────────
failure_lines = []
for r in results:
    if passes_run2(r) or r.get("error"):
        if r.get("error"):
            failure_lines.append(f"- **{r['room_id']}** — ERROR: {r['error']}")
        continue
    m = r.get("metrics", {})
    strat = strat_by_id.get(r["room_id"], {})
    detail = []
    ssim_val = m.get("ssim_unmasked", 0.0)
    if ssim_val < THRESHOLDS["ssim_unmasked_min"]:
        detail.append(f"SSIM {ssim_val:.3f} < {THRESHOLDS['ssim_unmasked_min']}")
    ghost_val = m.get("ghost_furniture_area_pct", 0.0)
    if ghost_val >= THRESHOLDS["ghost_area_max_pct"]:
        detail.append(f"ghost {ghost_val:.1f}% ≥ {THRESHOLDS['ghost_area_max_pct']}%")
    vp_val = m.get("vp_shift_pct", 0.0)
    if vp_val >= THRESHOLDS["vp_shift_max_pct"]:
        detail.append(f"VP {vp_val:.1f}% ≥ {THRESHOLDS['vp_shift_max_pct']}%")
    edr_val = m.get("edge_density_ratio", 1.0)
    if not (THRESHOLDS["edge_density_min"] <= edr_val <= THRESHOLDS["edge_density_max"]):
        detail.append(f"EDR {edr_val:.2f} outside [{THRESHOLDS['edge_density_min']},{THRESHOLDS['edge_density_max']}]")
    lat_val = m.get("bria_latency_s", 0.0)
    if lat_val > THRESHOLDS["latency_p95_max_s"]:
        detail.append(f"lat {lat_val:.1f}s > {THRESHOLDS['latency_p95_max_s']}s")
    strat_str = "/".join(str(v) for v in strat.values())
    rescan_tag = " [RESCAN]" if r.get("rescan_triggered") else ""
    failure_lines.append(
        f"- **{r['room_id']}**{rescan_tag} ({strat_str}): {'; '.join(detail)}"
    )

# ── Write summary ─────────────────────────────────────────────────────────────
lines = [
    "# Phase 0.5 Run 2 — Empty-Room Bench Summary",
    "",
    "**Date:** 2026-04-20  ",
    "**Input:** 15 rooms from `bench/manifest.json`  ",
    "**Path tested:** Bria Eraser (`fal-ai/bria/eraser`) primary, SAM-3 furniture union (20 widened prompts) + **24px dilation** (was 16px)  ",
    "**New in Run 2:** Low-coverage rescan gate — medium/heavy clutter rooms with <20% primary coverage trigger second SAM-3 pass at score_threshold=0.20  ",
    f"**Total cost (15 rooms):** ${total_cost:.2f}  ",
    f"**Total wall-clock (sum of per-room):** {total_latency:.0f}s (run concurrent ×3)  ",
    f"**Overall pass rate:** {passed_overall}/{n_rooms}  ",
    "",
    "## Per-metric pass rates",
    "",
    "| Metric | Threshold | Pass count |",
    "|---|---|---|",
    *[
        f"| {METRIC_LABELS[k]} | — | {metric_pass_counts[k]}/{n_rooms} |"
        for k in METRIC_KEYS
    ],
    f"| **Overall** | all 6 | **{passed_overall}/{n_rooms}** |",
    "",
    "## Per-room results",
    "",
    "R = rescan triggered (second SAM-3 pass at score_threshold=0.20)",
    "",
    "| Room | Strat (C/G/T/L) | SSIM | Ghost | VP | EDR | Lat | Cost | **Pass** |",
    "|---|---|---|---|---|---|---|---|---|",
    *rows,
    "",
    f"**Overall pass rate:** {passed_overall}/{n_rooms}  ",
    "",
    "## Stratification analysis",
    "",
    f"- **Clutter:** {strat_md('clutter')}",
    f"- **Geometry:** {strat_md('geometry')}",
    f"- **Texture:** {strat_md('texture')}",
    f"- **Lighting:** {strat_md('lighting')}",
    "",
    "## Rescan stats (low-coverage gate)",
    "",
    f"- **Rooms that triggered rescan:** {n_rescan}/{n_rooms}",
    f"- **Avg coverage before rescan:** {avg_cov_before:.1f}%",
    f"- **Avg coverage after rescan:** {avg_cov_after:.1f}%",
    f"- **Rescan rooms pass rate:** {rescan_pass}/{n_rescan}" if n_rescan else "- No rooms triggered rescan",
    f"- **Non-rescan rooms pass rate:** {non_rescan_pass}/{len(non_rescan_rooms_data)}",
    f"- **Performance comparison:** {rescan_comparison}",
    "",
]

if rescan_table_rows:
    lines += [
        "### Per-room rescan detail",
        "",
        "| Room | Clutter | Cov Before | Cov After | Δ | SSIM | Pass |",
        "|---|---|---|---|---|---|---|",
        *rescan_table_rows,
        "",
    ]
else:
    lines += ["_(No rooms triggered the low-coverage rescan gate.)_", ""]

lines += [
    "## H2 hard-exit table — room-01, room-09, room-11",
    "",
    "These rooms were flagged as Bria-VAE-drift (H2) candidates in the mask audit.",
    "An improvement of ≥0.02 SSIM vs Run 1.5 would indicate mask quality was a",
    "contributing factor; no improvement confirms Bria architectural drift as root cause.",
    "",
    "| Room | Run 1.5 SSIM | Run 2 SSIM | Δ | ≥0.02 improvement? |",
    "|---|---|---|---|---|",
    *h2_rows,
    "",
    f"**H2 verdict:** {h2_verdict}",
    "",
    "## room-10 over-masking check",
    "",
    f"**Run 1.5 dilated coverage:** {f'{r10_cov_r15:.1f}%' if r10_cov_r15 is not None else '—'}  ",
    f"**Run 2 dilated coverage:** {f'{r10_cov_r2:.1f}%' if r10_cov_r2 is not None else '—'}  ",
    f"**Verdict:** {r10_verdict}",
    "",
    "## Failure mode summary",
    "",
    *(failure_lines or ["_(none — all rooms passed)_"]),
    "",
    "## Gate recommendation",
    "",
    f"**{gate}**",
    "",
    gate_detail,
    "",
    "### Gate decision tree applied",
    f"- ≥13/15 pass → PROCEED TO RUN 3",
    f"- 10–12/15 pass → MIXED",
    f"- <10/15 pass → FAIL",
    f"- Result: {passed_overall}/15 → **{gate.split(' — ')[0]}**",
    "",
    "## Cost reconciliation",
    "",
    f"- Per-room baseline: $0.180 (20 SAM-3 primary + 8 SAM-3 ghost + 1 Bria)  ",
    f"- Per-room rescan overhead: $0.100 (20 additional SAM-3 calls at $0.005 each)  ",
    f"- Rooms rescanned: {n_rescan} → rescan overhead: ${n_rescan * 0.10:.2f}  ",
    f"- 15-room total: ${total_cost:.2f}  ",
    f"- Hard cap: ${4.00:.2f}  ",
    f"- Status: {'WITHIN CAP' if total_cost <= 4.0 else 'EXCEEDED CAP'}",
    "",
]

SUMMARY_PATH.write_text("\n".join(lines))
print(f"Wrote {SUMMARY_PATH}")
print(
    f"Overall pass: {passed_overall}/{n_rooms} | "
    f"Per-metric: " + " | ".join(f"{METRIC_LABELS[k]}={metric_pass_counts[k]}/{n_rooms}" for k in METRIC_KEYS) + " | "
    f"Rescan rooms: {n_rescan} | "
    f"H2 verdict: {h2_verdict[:80]}… | "
    f"Total cost: ${total_cost:.2f}"
)
