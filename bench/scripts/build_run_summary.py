"""Aggregate per-room metrics into run-summary.md for Run 3.

Includes:
  1. Standard per-room table with Inpainter column and dual ghost reporting.
     LaMa rows evaluated on ghost_inside_mask_pct; Bria rows on ghost_furniture_area_pct.
  2. Per-metric pass rate (X/15 per metric).
  3. Overall pass rate.
  4. Per-inpainter pass-rate table (LaMa vs Bria) with per-metric breakdown.
  5. Router policy assessment (LaMa-only / Bria-only / hybrid / broken).
  6. H2 hard-exit retest: room-01, room-09, room-11 vs Run 1.5 SSIM.
  7. Gate decision:
     ≥13/15 → EMPTY-ROOM STAGE LOCKED — proceed to Phase 5 (redesign bench)
     10–12/15 → inspect failures, PROCEED WITH DOCUMENTED CAVEAT or INVESTIGATE
     <10/15 → HALT
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BENCH = ROOT / "bench"

# Run 3 directories (write target)
OUT = BENCH / "run-3-empty-room"
METRICS_DIR = OUT / "metrics"
SUMMARY_PATH = OUT / "run-summary.md"

# Run 1.5 directories (read-only — H2 retest baseline)
RUN15_METRICS_DIR = BENCH / "run-1-5-empty-room" / "metrics"

manifest = json.loads((BENCH / "manifest.json").read_text())
rooms = manifest["rooms"]

# Run 3 thresholds (same as Run 2 calibrated)
THRESHOLDS = {
    "ssim_unmasked_min": 0.97,
    "ghost_area_max_pct": 1.0,
    "vp_shift_max_pct": 3.0,
    "edge_density_min": 0.7,
    "edge_density_max": 1.3,
    "latency_p95_max_s": 60.0,
    "cost_max_usd_per_room": 0.50,
}

# H2 hard-exit rooms (Run 1.5 → Run 3 retest)
H2_ROOMS = ["room-01", "room-09", "room-11"]

# ── Load Run 3 results ────────────────────────────────────────────────────────
results: list[dict] = []
for r in rooms:
    p = METRICS_DIR / f"{r['id']}.json"
    if p.exists():
        results.append(json.loads(p.read_text()))
    else:
        results.append({"room_id": r["id"], "error": "missing metrics file"})

# ── Load Run 1.5 results (for H2 retest) ─────────────────────────────────────
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
def ghost_value_for_room(r: dict) -> float | None:
    """Return the ghost value that should be used for pass/fail for this room.

    LaMa rows: ghost_inside_mask_pct (avoids false positives from preserved unmasked furniture)
    Bria rows: ghost_furniture_area_pct (unchanged from Run 2)
    """
    m = r.get("metrics", {})
    inpainter = r.get("inpainter", "bria")
    if inpainter == "lama":
        return m.get("ghost_inside_mask_pct")
    return m.get("ghost_furniture_area_pct")


def metric_passes(r: dict, metric_key: str) -> bool:
    """Evaluate a single metric against Run 3 calibrated thresholds."""
    m = r.get("metrics", {})
    if metric_key == "ssim_unmasked":
        v = m.get("ssim_unmasked")
        return v is not None and v >= THRESHOLDS["ssim_unmasked_min"]
    if metric_key == "ghost_furniture":
        v = ghost_value_for_room(r)
        return v is not None and v < THRESHOLDS["ghost_area_max_pct"]
    if metric_key == "vp_shift":
        v = m.get("vp_shift_pct")
        return v is not None and v < THRESHOLDS["vp_shift_max_pct"]
    if metric_key == "edge_density":
        v = m.get("edge_density_ratio")
        return v is not None and THRESHOLDS["edge_density_min"] <= v <= THRESHOLDS["edge_density_max"]
    if metric_key == "latency":
        v = m.get("inpainter_latency_s")
        return v is not None and v <= THRESHOLDS["latency_p95_max_s"]
    if metric_key == "cost":
        v = m.get("cost_usd")
        return v is not None and v <= THRESHOLDS["cost_max_usd_per_room"]
    return False


def passes_run3(r: dict) -> bool:
    """Overall pass under Run 3 calibrated thresholds."""
    if r.get("error"):
        return False
    keys = ["ssim_unmasked", "ghost_furniture", "vp_shift", "edge_density", "latency", "cost"]
    return all(metric_passes(r, k) for k in keys)


METRIC_KEYS = ["ssim_unmasked", "ghost_furniture", "vp_shift", "edge_density", "latency", "cost"]
METRIC_LABELS = {
    "ssim_unmasked": f"SSIM ≥{THRESHOLDS['ssim_unmasked_min']}",
    "ghost_furniture": f"Ghost <{THRESHOLDS['ghost_area_max_pct']}% (LaMa=inside-mask, Bria=global)",
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
passed_overall = sum(1 for r in results if passes_run3(r))

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
        return f"| {r['room_id']} | — | {stag} | ERROR: {r['error'][:40]} |"

    inpainter = r.get("inpainter", "?")
    ssim = m.get("ssim_unmasked")
    ghost_global = m.get("ghost_furniture_area_pct")
    ghost_in_mask = m.get("ghost_inside_mask_pct")
    ghost_eval = ghost_value_for_room(r)
    vp = m.get("vp_shift_pct")
    edr = m.get("edge_density_ratio")
    lat = m.get("inpainter_latency_s")
    cost = m.get("cost_usd", 0.0)

    ssim_str = f"{ssim:.3f}" if ssim is not None else "—"
    # Ghost column: show global/inside-mask pair so reader can see both
    # Mark pass/fail based on the per-inpainter metric
    ghost_str = (
        f"g:{ghost_global:.1f}%/m:{ghost_in_mask:.1f}%"
        if ghost_global is not None and ghost_in_mask is not None
        else "—"
    )
    vp_str = f"{vp:.1f}%" if vp is not None else "—"
    edr_str = f"{edr:.2f}" if edr is not None else "—"
    lat_str = f"{lat:.1f}s" if lat is not None else "—"

    overall = passes_run3(r)
    return (
        f"| {r['room_id']} | {inpainter} | {stag} | "
        f"{ssim_str}{mark(metric_passes(r,'ssim_unmasked'))} | "
        f"{ghost_str}{mark(metric_passes(r,'ghost_furniture'))} | "
        f"{vp_str}{mark(metric_passes(r,'vp_shift'))} | "
        f"{edr_str}{mark(metric_passes(r,'edge_density'))} | "
        f"{lat_str}{mark(metric_passes(r,'latency'))} | "
        f"${cost:.3f}{mark(metric_passes(r,'cost'))} | "
        f"**{mark(overall)}** |"
    )


rows = [fmt_row(r, strat_by_id.get(r["room_id"], {})) for r in results]

# ── Per-inpainter pass-rate table ─────────────────────────────────────────────
lama_results = [r for r in results if r.get("inpainter") == "lama" and not r.get("error")]
bria_results = [r for r in results if r.get("inpainter") == "bria" and not r.get("error")]

lama_pass = sum(1 for r in lama_results if passes_run3(r))
bria_pass = sum(1 for r in bria_results if passes_run3(r))

lama_metric_pass: dict[str, int] = {k: sum(1 for r in lama_results if metric_passes(r, k)) for k in METRIC_KEYS}
bria_metric_pass: dict[str, int] = {k: sum(1 for r in bria_results if metric_passes(r, k)) for k in METRIC_KEYS}

# ── Router policy assessment ─────────────────────────────────────────────────
n_lama = len(lama_results)
n_bria = len(bria_results)

lama_rate = lama_pass / n_lama if n_lama > 0 else 0.0
bria_rate = bria_pass / n_bria if n_bria > 0 else 0.0

ROUTER_HIGH_PASS = 0.80  # ≥80% = "high rate"
ROUTER_LOW_PASS = 0.50   # <50% = "failing"

if n_lama > 0 and n_bria > 0:
    if lama_rate >= ROUTER_HIGH_PASS and bria_rate < ROUTER_LOW_PASS:
        router_assessment = (
            "Hybrid router is doing useful work; 35% threshold is sensible starting point. "
            "LaMa handles low-coverage rooms well; Bria is failing high-coverage rooms (expected — "
            "H2 VAE drift confirmed). Consider LaMa-only if most rooms are low-coverage, "
            "or investigate higher-coverage fallback."
        )
    elif lama_rate >= ROUTER_HIGH_PASS and bria_rate >= ROUTER_HIGH_PASS:
        router_assessment = (
            "Both inpainters passing at high rate — router may not be necessary. "
            "LaMa-only or Bria-only might suffice. If LaMa passes on all rooms it handles, "
            "consider using LaMa with a coverage cap."
        )
    elif lama_rate < ROUTER_LOW_PASS and bria_rate < ROUTER_LOW_PASS:
        router_assessment = (
            "Both inpainters failing — router doesn't address the underlying problem. "
            "Failures are not coverage-related. Investigate whether failures cluster on "
            "specific geometry types, lighting conditions, or prompt-list gaps."
        )
    else:
        router_assessment = (
            f"Mixed results: LaMa {lama_pass}/{n_lama} ({lama_rate:.0%}), "
            f"Bria {bria_pass}/{n_bria} ({bria_rate:.0%}). "
            "Partial benefit from routing. Review per-room failure modes."
        )
elif n_lama > 0:
    router_assessment = f"No Bria rooms were routed — all {n_lama} rooms had coverage ≤35%. LaMa pass rate: {lama_pass}/{n_lama}."
elif n_bria > 0:
    router_assessment = f"No LaMa rooms were routed — all {n_bria} rooms had coverage >35%. Bria pass rate: {bria_pass}/{n_bria}."
else:
    router_assessment = "No rooms completed successfully — cannot assess router policy."

# ── H2 hard-exit retest ───────────────────────────────────────────────────────
# room-01: expect LaMa-routed (24.7% coverage) → SSIM improvement vs Run 1.5
# room-09: expect LaMa-routed (24.9% coverage) → SSIM improvement vs Run 1.5
# room-11: expect Bria-routed (50.7% coverage) → similar to Run 1.5 (no improvement expected)
h2_rows: list[str] = []
h2_deltas: dict[str, float | None] = {}

for rid in H2_ROOMS:
    r3 = next((r for r in results if r.get("room_id") == rid), None)
    r15 = run15_results.get(rid)
    ssim_15 = r15.get("metrics", {}).get("ssim_unmasked") if r15 else None
    ssim_3 = r3.get("metrics", {}).get("ssim_unmasked") if r3 and not r3.get("error") else None
    inp = r3.get("inpainter", "?") if r3 and not r3.get("error") else "—"
    if ssim_15 is not None and ssim_3 is not None:
        delta = ssim_3 - ssim_15
        h2_deltas[rid] = delta
        h2_rows.append(
            f"| {rid} | {inp} | {ssim_15:.4f} | {ssim_3:.4f} | {delta:+.4f} |"
        )
    else:
        h2_deltas[rid] = None
        h2_rows.append(
            f"| {rid} | {inp} | "
            f"{'—' if ssim_15 is None else f'{ssim_15:.4f}'} | "
            f"{'—' if ssim_3 is None else f'{ssim_3:.4f}'} | — |"
        )

# ── Gate decision ─────────────────────────────────────────────────────────────
bria_fail_rooms = [r for r in bria_results if not passes_run3(r)]
lama_fail_rooms = [r for r in lama_results if not passes_run3(r)]

if passed_overall >= 13:
    gate = "EMPTY-ROOM STAGE LOCKED — proceed to Phase 5 (redesign bench)"
    gate_detail = (
        f"≥13/15 pass rate achieved ({passed_overall}/15). "
        "Hybrid router is production-ready for empty-room stage."
    )
elif passed_overall >= 10:
    # Distinguish between high-coverage Bria failures vs LaMa failures
    if len(bria_fail_rooms) > 0 and len(lama_fail_rooms) == 0:
        gate = "PROCEED WITH DOCUMENTED CAVEAT — high-coverage rooms have known H2 limitation"
        gate_detail = (
            f"10–12/15 pass rate ({passed_overall}/15). "
            f"Failures are all Bria-routed (high-coverage) rooms with known H2 drift. "
            f"LaMa-routed rooms pass cleanly. "
            f"Caveat: rooms with >35% dilated coverage will exhibit Bria VAE drift in empty-room stage."
        )
    elif len(lama_fail_rooms) > 0:
        gate = "INVESTIGATE — LaMa is misbehaving on rooms it should handle"
        gate_detail = (
            f"10–12/15 pass rate ({passed_overall}/15). "
            f"LaMa-routed rooms failing: {[r['room_id'] for r in lama_fail_rooms]}. "
            "These should be low-coverage rooms where LaMa excels. Inspect outputs for "
            "masking errors or unusual room content."
        )
    else:
        gate = "MIXED — inspect failures before proceeding"
        gate_detail = (
            f"10–12/15 pass rate ({passed_overall}/15). "
            "Mixed failure pattern. Review per-room failure modes."
        )
else:
    gate = "HALT — hybrid routing isn't solving the problem; surface for review before further spend"
    gate_detail = (
        f"<10/15 pass rate ({passed_overall}/15). "
        "Hybrid routing is not achieving acceptable quality. "
        "Options: expand prompt list, investigate non-coverage failure modes, "
        "or escalate to Canny+FLUX secondary path from §3.5."
    )

# ── Stratification breakdown ──────────────────────────────────────────────────
def group_pass(dim: str) -> dict[str, tuple[int, int]]:
    out: dict[str, list[int]] = defaultdict(list)
    for r in results:
        if "metrics" not in r:
            continue
        val = strat_by_id.get(r["room_id"], {}).get(dim, "unknown")
        out[val].append(1 if passes_run3(r) else 0)
    return {k: (sum(v), len(v)) for k, v in out.items()}


def strat_md(dim: str) -> str:
    g = group_pass(dim)
    return " · ".join(f"{k}: {p}/{t}" for k, (p, t) in sorted(g.items()))


# ── Failure mode summary ──────────────────────────────────────────────────────
failure_lines = []
for r in results:
    if passes_run3(r) or r.get("error"):
        if r.get("error"):
            failure_lines.append(f"- **{r['room_id']}** — ERROR: {r['error']}")
        continue
    m = r.get("metrics", {})
    strat = strat_by_id.get(r["room_id"], {})
    inpainter = r.get("inpainter", "?")
    detail = []
    ssim_val = m.get("ssim_unmasked", 0.0)
    if ssim_val < THRESHOLDS["ssim_unmasked_min"]:
        detail.append(f"SSIM {ssim_val:.3f} < {THRESHOLDS['ssim_unmasked_min']}")
    ghost_eval = ghost_value_for_room(r)
    ghost_metric = r.get("ghost_metric_used", "ghost_furniture_area_pct")
    if ghost_eval is not None and ghost_eval >= THRESHOLDS["ghost_area_max_pct"]:
        detail.append(f"ghost ({ghost_metric}) {ghost_eval:.1f}% ≥ {THRESHOLDS['ghost_area_max_pct']}%")
    vp_val = m.get("vp_shift_pct", 0.0)
    if vp_val >= THRESHOLDS["vp_shift_max_pct"]:
        detail.append(f"VP {vp_val:.1f}% ≥ {THRESHOLDS['vp_shift_max_pct']}%")
    edr_val = m.get("edge_density_ratio", 1.0)
    if not (THRESHOLDS["edge_density_min"] <= edr_val <= THRESHOLDS["edge_density_max"]):
        detail.append(f"EDR {edr_val:.2f} outside [{THRESHOLDS['edge_density_min']},{THRESHOLDS['edge_density_max']}]")
    lat_val = m.get("inpainter_latency_s", 0.0)
    if lat_val > THRESHOLDS["latency_p95_max_s"]:
        detail.append(f"lat {lat_val:.1f}s > {THRESHOLDS['latency_p95_max_s']}s")
    strat_str = "/".join(str(v) for v in strat.values())
    failure_lines.append(
        f"- **{r['room_id']}** [{inpainter}] ({strat_str}): {'; '.join(detail)}"
    )

# ── Write summary ─────────────────────────────────────────────────────────────
lines = [
    "# Phase 0.5 Run 3 — Empty-Room Bench Summary (Hybrid LaMa/Bria Router)",
    "",
    "**Date:** 2026-04-20  ",
    "**Input:** 15 rooms from `bench/manifest.json`  ",
    "**Path tested:** Hybrid router — dilated coverage ≤35% → LaMa (`fal-ai/lama`), >35% → Bria (`fal-ai/bria/eraser`)  ",
    "**SAM-3:** 20-prompt furniture union + 24px dilation (unchanged from Run 2)  ",
    "**Ghost metric:** LaMa rows use `ghost_inside_mask_pct`; Bria rows use `ghost_furniture_area_pct` (unchanged)  ",
    "**Rescan gate:** REMOVED — Run 2 showed 0pp coverage gain across all triggered rooms  ",
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
    (
        "Ghost column shows `g:<global>%/m:<inside-mask>%`. "
        "Pass/fail mark uses `ghost_inside_mask_pct` for LaMa rows and `ghost_furniture_area_pct` for Bria rows. "
        "See context: LaMa preserves unmasked pixels exactly — global ghost detects real unmasked furniture "
        "(false positive). Inside-mask ghost isolates true inpainting artifacts."
    ),
    "",
    "| Room | Inpainter | Strat (C/G/T/L) | SSIM | Ghost (g/m) | VP | EDR | Lat | Cost | **Pass** |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    *rows,
    "",
    f"**Overall pass rate:** {passed_overall}/{n_rooms}  ",
    "",
    "## Per-inpainter pass-rate table",
    "",
    "| Inpainter | Rooms routed | Passed | Pass rate |",
    "|---|---|---|---|",
    f"| LaMa | {n_lama} | {lama_pass} | {lama_rate:.0%} |",
    f"| Bria | {n_bria} | {bria_pass} | {bria_rate:.0%} |",
    f"| **Total** | **{n_lama + n_bria}** | **{lama_pass + bria_pass}** | **{(lama_pass + bria_pass) / max(1, n_lama + n_bria):.0%}** |",
    "",
    "### Per-metric breakdown within each inpainter group",
    "",
    "| Metric | LaMa pass | Bria pass |",
    "|---|---|---|",
    *[
        f"| {METRIC_LABELS[k]} | {lama_metric_pass[k]}/{n_lama} | {bria_metric_pass[k]}/{n_bria} |"
        for k in METRIC_KEYS
    ],
    "",
    "## Router policy assessment",
    "",
    f"**Router threshold:** {35.0}% dilated coverage (provisional — Phase 1 hardening will calibrate)  ",
    f"**LaMa rooms:** {n_lama} | **Bria rooms:** {n_bria}  ",
    "",
    router_assessment,
    "",
    "## H2 hard-exit retest (Run 1.5 → Run 3 delta)",
    "",
    "Expected behavior:",
    "- room-01 (24.7% coverage): LaMa-routed → substantial SSIM improvement over Bria Run 1.5",
    "- room-09 (24.9% coverage): LaMa-routed → substantial SSIM improvement over Bria Run 1.5",
    "- room-11 (50.7% coverage): Bria-routed → similar to Run 1.5 (Bria handles high-coverage; no improvement expected from routing)",
    "",
    "| Room | Inpainter | Run 1.5 SSIM | Run 3 SSIM | Δ |",
    "|---|---|---|---|---|",
    *h2_rows,
    "",
    "## Stratification analysis",
    "",
    f"- **Clutter:** {strat_md('clutter')}",
    f"- **Geometry:** {strat_md('geometry')}",
    f"- **Texture:** {strat_md('texture')}",
    f"- **Lighting:** {strat_md('lighting')}",
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
    f"- ≥13/15 → EMPTY-ROOM STAGE LOCKED — proceed to Phase 5",
    f"- 10–12/15 → inspect failures → PROCEED WITH DOCUMENTED CAVEAT or INVESTIGATE",
    f"- <10/15 → HALT",
    f"- Result: {passed_overall}/15 → **{gate.split(' — ')[0]}**",
    "",
    "## Cost reconciliation",
    "",
    f"- Per-room cost: $0.180 (20 SAM-3 primary + 8 SAM-3 ghost + 1 inpainter @ $0.04)  ",
    f"- Rescan gate: REMOVED (was $0.10/room overhead, 0pp benefit)  ",
    f"- LaMa rooms: {n_lama} × $0.180 = ${n_lama * 0.180:.2f}  ",
    f"- Bria rooms: {n_bria} × $0.180 = ${n_bria * 0.180:.2f}  ",
    f"- 15-room total: ${total_cost:.2f}  ",
    f"- Hard cap: ${6.00:.2f}  ",
    f"- Status: {'WITHIN CAP' if total_cost <= 6.0 else 'EXCEEDED CAP'}",
    "",
]

SUMMARY_PATH.write_text("\n".join(lines))
print(f"Wrote {SUMMARY_PATH}")
print(
    f"Overall pass: {passed_overall}/{n_rooms} | "
    f"LaMa: {lama_pass}/{n_lama} ({lama_rate:.0%}) | "
    f"Bria: {bria_pass}/{n_bria} ({bria_rate:.0%}) | "
    f"Total cost: ${total_cost:.2f} | "
    f"Gate: {gate.split(' — ')[0]}"
)
