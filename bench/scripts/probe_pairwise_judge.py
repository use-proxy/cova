"""Phase 0.5 Pairwise Verification — Sonnet 4.5 Pairwise Preference Judge.

Tests 8 strategic pairs across 3 sets:
  Set A: same archetype, different empty-room quality
  Set B: same broken empty-room, different archetypes
  Set C: cross-comparisons (broken+hard vs clean+easy)

Each pair is judged twice (position-swapped) to neutralize position bias.
16 API calls total.

Cost cap: soft $0.50, hard $1.00

Invocation:
  python3 bench/scripts/probe_pairwise_judge.py

Outputs:
  bench/phase-5-probe/pairwise-results.json   (raw responses)
  bench/phase-5-probe/pairwise-analysis.md    (analysis doc)
  bench/phase-5-probe/pairwise-cost-log.json  (cost log)
"""
from __future__ import annotations

import base64
import io
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import anthropic
from PIL import Image

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent.parent
BENCH = ROOT / "bench"
PROBE_A = BENCH / "phase-5-probe" / "redesign"
PROBE_B = BENCH / "phase-5-probe-2" / "redesign"
OUT_DIR = BENCH / "phase-5-probe"

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
MODEL = "claude-sonnet-4-5"
COST_PER_JUDGE_USD = 0.025  # ~3000 input (2 images) + 300 output tokens Sonnet
SOFT_CAP_USD = 0.50
HARD_CAP_USD = 1.00

# ---------------------------------------------------------------------------
# Strategic pairs definition (exactly as specified)
# ---------------------------------------------------------------------------
PAIRS: list[dict[str, Any]] = [
    # Set A — same archetype (Warm Japandi), different empty-room quality
    {
        "pair_id": "A1",
        "set": "A",
        "image1_path": str(PROBE_A / "room-01.webp"),
        "image2_path": str(PROBE_A / "room-02.webp"),
        "image1_label": "WJ room-01 (clean empty)",
        "image2_label": "WJ room-02 (broken empty)",
        "note": "Same archetype Warm Japandi; clean vs broken empty-room",
    },
    {
        "pair_id": "A2",
        "set": "A",
        "image1_path": str(PROBE_A / "room-09.webp"),
        "image2_path": str(PROBE_A / "room-11.webp"),
        "image1_label": "WJ room-09 (clean empty)",
        "image2_label": "WJ room-11 (broken empty)",
        "note": "Same archetype Warm Japandi; clean vs broken empty-room",
    },
    {
        "pair_id": "A3",
        "set": "A",
        "image1_path": str(PROBE_A / "room-03.webp"),
        "image2_path": str(PROBE_A / "room-07.webp"),
        "image1_label": "WJ room-03 (medium)",
        "image2_label": "WJ room-07 (medium)",
        "note": "Same archetype Warm Japandi; both medium empty-room quality",
    },
    # Set B — same broken empty-room, different archetypes
    {
        "pair_id": "B1",
        "set": "B",
        "image1_path": str(PROBE_A / "room-02.webp"),
        "image2_path": str(PROBE_B / "room-02.webp"),
        "image1_label": "room-02 Warm Japandi",
        "image2_label": "room-02 Industrial Loft",
        "note": "Same broken empty-room; WJ vs Industrial Loft archetype",
    },
    {
        "pair_id": "B2",
        "set": "B",
        "image1_path": str(PROBE_A / "room-11.webp"),
        "image2_path": str(PROBE_B / "room-11.webp"),
        "image1_label": "room-11 Warm Japandi",
        "image2_label": "room-11 Maximalist Eclectic",
        "note": "Same broken empty-room; WJ vs Maximalist Eclectic archetype",
    },
    # Set C — cross-comparisons
    {
        "pair_id": "C1",
        "set": "C",
        "image1_path": str(PROBE_B / "room-02.webp"),
        "image2_path": str(PROBE_A / "room-01.webp"),
        "image1_label": "Industrial Loft room-02 (broken empty + hard archetype)",
        "image2_label": "WJ room-01 (clean empty + easy archetype)",
        "note": "Cross: broken+hard vs clean+easy",
    },
    {
        "pair_id": "C2",
        "set": "C",
        "image1_path": str(PROBE_B / "room-11.webp"),
        "image2_path": str(PROBE_A / "room-09.webp"),
        "image1_label": "Maximalist Eclectic room-11 (broken+hard)",
        "image2_label": "WJ room-09 (clean+easy)",
        "note": "Cross: broken+hard vs clean+easy",
    },
    {
        "pair_id": "C3",
        "set": "C",
        "image1_path": str(PROBE_B / "room-15.webp"),
        "image2_path": str(PROBE_B / "room-05.webp"),
        "image1_label": "Dark Moody Glam room-15",
        "image2_label": "Heritage Traditional room-05",
        "note": "Archetype-vs-archetype on similar empty-room quality",
    },
]

PAIRWISE_PROMPT = """You are evaluating two interior design renders. They were generated for the same archetype goal or comparable design quality. Identify which is BETTER overall, considering architectural fidelity, style coherence, furniture plausibility, composition, and lighting.

Respond with exactly one of:
- "A is better"
- "B is better"
- "Tie"

Then one sentence (<=25 words) explaining the key differentiator.

Format your response as JSON: {"verdict": "<one of the three above>", "reason": "<one sentence>"}"""

# ---------------------------------------------------------------------------
# Env loading
# ---------------------------------------------------------------------------
def load_env_keys() -> None:
    env_path = ROOT / "apps/web/.env.local"
    if not env_path.exists():
        raise RuntimeError(f".env.local not found at {env_path}")
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k == "ANTHROPIC_API_KEY" and not os.getenv(k):
                os.environ[k] = v


load_env_keys()

# ---------------------------------------------------------------------------
# Cost tracking
# ---------------------------------------------------------------------------
_cost_log: list[dict[str, Any]] = []
_total_cost = 0.0


def record_cost(pair_id: str, order: str, cost_usd: float, note: str = "") -> None:
    global _total_cost
    _total_cost += cost_usd
    _cost_log.append({
        "pair_id": pair_id,
        "order": order,
        "cost_usd": cost_usd,
        "cumulative_usd": _total_cost,
        "note": note,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    if _total_cost > SOFT_CAP_USD:
        print(f"[WARN] Cumulative cost ${_total_cost:.2f} exceeds soft cap ${SOFT_CAP_USD:.2f}")
    if _total_cost > HARD_CAP_USD:
        print(f"[ABORT] Cumulative cost ${_total_cost:.2f} exceeds hard cap ${HARD_CAP_USD:.2f}. Stopping.")
        write_cost_log()
        sys.exit(1)


def write_cost_log() -> None:
    out = OUT_DIR / "pairwise-cost-log.json"
    out.write_text(json.dumps({"entries": _cost_log, "total_usd": _total_cost}, indent=2))


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------
def pil_to_base64_jpeg(img: Image.Image, max_dim: int = 1024, quality: int = 80) -> str:
    """Compress image to max_dim/quality before base64 encoding per CLAUDE.md."""
    if img.width > max_dim or img.height > max_dim:
        ratio = min(max_dim / img.width, max_dim / img.height)
        new_w = int(img.width * ratio)
        new_h = int(img.height * ratio)
        img = img.resize((new_w, new_h), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    return base64.standard_b64encode(buf.read()).decode("utf-8")


# ---------------------------------------------------------------------------
# Judge call
# ---------------------------------------------------------------------------
def call_judge(
    pair_id: str,
    order_label: str,
    img_a_path: str,
    img_b_path: str,
    retry: bool = False,
) -> dict[str, Any] | None:
    """Call Sonnet 4.5 with two images (A then B). Returns parsed verdict or None."""
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not anthropic_key:
        print(f"  [{pair_id}|{order_label}] ANTHROPIC_API_KEY missing — skipping")
        return None

    prompt = PAIRWISE_PROMPT
    if retry:
        prompt += (
            '\n\nCRITICAL: Return ONLY valid JSON. No prose. No markdown. '
            'Start your response with "{" and end with "}".'
        )

    # Load and compress both images
    try:
        img_a = Image.open(img_a_path).convert("RGB")
        img_b = Image.open(img_b_path).convert("RGB")
    except Exception as e:
        print(f"  [{pair_id}|{order_label}] Image load error: {e}")
        return None

    img_a_b64 = pil_to_base64_jpeg(img_a)
    img_b_b64 = pil_to_base64_jpeg(img_b)

    client = anthropic.Anthropic(api_key=anthropic_key)
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=200,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Image A:",
                        },
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": img_a_b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": "Image B:",
                        },
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": img_b_b64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
    except Exception as e:
        print(f"  [{pair_id}|{order_label}] Anthropic API error: {e}")
        return None

    raw_text = response.content[0].text if response.content else ""
    record_cost(pair_id, order_label, COST_PER_JUDGE_USD, note=f"retry={retry}")

    # Parse JSON
    try:
        text = raw_text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]) if lines[-1].startswith("```") else "\n".join(lines[1:])
        parsed = json.loads(text)
        verdict = parsed.get("verdict", "")
        reason = parsed.get("reason", "")
        if verdict not in ("A is better", "B is better", "Tie"):
            raise ValueError(f"Invalid verdict: {verdict!r}")
        return {"verdict": verdict, "reason": reason, "raw": raw_text}
    except (json.JSONDecodeError, ValueError) as e:
        print(f"  [{pair_id}|{order_label}] JSON parse failed: {e}. Raw: {raw_text[:120]}")
        if not retry:
            print(f"  [{pair_id}|{order_label}] retrying with stricter instruction...")
            time.sleep(1)
            return call_judge(pair_id, order_label, img_a_path, img_b_path, retry=True)
        print(f"  [{pair_id}|{order_label}] null after retry")
        return None


# ---------------------------------------------------------------------------
# Consolidated verdict logic
# ---------------------------------------------------------------------------
def consolidate_verdict(
    pair: dict[str, Any],
    order1_result: dict[str, Any] | None,
    order2_result: dict[str, Any] | None,
) -> dict[str, Any]:
    """
    Order 1: A=image1, B=image2
    Order 2: A=image2, B=image1  (swapped)

    Image1 wins if:
      order1_result verdict = "A is better" AND order2_result verdict = "B is better"
    Image2 wins if:
      order1_result verdict = "B is better" AND order2_result verdict = "A is better"
    Genuine tie if:
      both returned "Tie", OR the two orderings disagreed (position bias)
    Inconclusive if either result is None
    """
    if order1_result is None or order2_result is None:
        return {
            "consolidated": "Inconclusive",
            "reason": "One or both judge calls returned null",
        }

    v1 = order1_result["verdict"]
    v2 = order2_result["verdict"]

    if v1 == "Tie" and v2 == "Tie":
        return {
            "consolidated": "Genuine tie",
            "reason": "Both orderings returned Tie",
        }

    # Image1 wins: order1 says A (image1), order2 says B (image1 is now B in order2)
    if v1 == "A is better" and v2 == "B is better":
        return {
            "consolidated": "Image1 wins",
            "reason": order1_result["reason"],
        }

    # Image2 wins: order1 says B (image2), order2 says A (image2 is now A in order2)
    if v1 == "B is better" and v2 == "A is better":
        return {
            "consolidated": "Image2 wins",
            "reason": order1_result["reason"],
        }

    # Any other combination = position bias / disagreement
    return {
        "consolidated": "Genuine tie",
        "reason": f"Position-bias detected: order1={v1!r}, order2={v2!r}",
    }


# ---------------------------------------------------------------------------
# Analysis doc builder
# ---------------------------------------------------------------------------
def build_analysis_md(all_results: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    lines.append("# Phase 0.5 Pairwise Verification — Analysis")
    lines.append("")
    lines.append("**Date:** 2026-04-20")
    lines.append(f"**Judge model:** `{MODEL}` (Sonnet 4.5)")
    lines.append("**Protocol:** 8 strategic pairs, each judged twice with position swap (16 API calls)")
    lines.append(f"**Cost caps:** soft ${SOFT_CAP_USD:.2f} / hard ${HARD_CAP_USD:.2f}")
    lines.append("")

    # -----------------------------------------------------------------------
    # Section 1: Setup
    # -----------------------------------------------------------------------
    lines.append("## 1. Setup")
    lines.append("")
    lines.append("**Pairs and their purpose:**")
    lines.append("")
    lines.append("| Set | Pair | Image1 | Image2 | Purpose |")
    lines.append("|-----|------|--------|--------|---------|")
    for p in PAIRS:
        lines.append(
            f"| {p['set']} | {p['pair_id']} | {p['image1_label']} | {p['image2_label']} | {p['note']} |"
        )
    lines.append("")
    lines.append("**Position-swap protocol:** Each pair is judged in both orderings:")
    lines.append("- Order 1: Image1 = A, Image2 = B")
    lines.append("- Order 2: Image2 = A, Image1 = B (swapped)")
    lines.append("")
    lines.append("**Consolidated verdict rules:**")
    lines.append("- **Image1 wins**: both orderings agree on Image1 (Order1=A is better, Order2=B is better)")
    lines.append("- **Image2 wins**: both orderings agree on Image2 (Order1=B is better, Order2=A is better)")
    lines.append("- **Genuine tie**: both calls returned Tie, OR orderings disagreed (position-bias detected)")
    lines.append("- **Inconclusive**: any judge call returned null")
    lines.append("")

    # -----------------------------------------------------------------------
    # Section 2: Per-pair results table
    # -----------------------------------------------------------------------
    lines.append("## 2. Per-Pair Results")
    lines.append("")
    lines.append("| Pair | Image1 | Image2 | Order 1 verdict | Order 2 verdict | Consolidated | Reason |")
    lines.append("|------|--------|--------|-----------------|-----------------|--------------|--------|")

    for r in all_results:
        pair = r["pair"]
        o1 = r.get("order1_result")
        o2 = r.get("order2_result")
        consolidated = r["consolidated"]

        o1_v = o1["verdict"] if o1 else "null"
        o2_v = o2["verdict"] if o2 else "null"
        reason = consolidated["reason"][:80] if consolidated.get("reason") else ""

        lines.append(
            f"| {pair['pair_id']} | {pair['image1_label']} | {pair['image2_label']} "
            f"| {o1_v} | {o2_v} | {consolidated['consolidated']} | {reason} |"
        )
    lines.append("")

    # -----------------------------------------------------------------------
    # Section 3: Set A analysis
    # -----------------------------------------------------------------------
    lines.append("## 3. Set A Analysis — Empty-Room Quality Within Same Archetype")
    lines.append("")
    lines.append("**Question:** Does clean empty-room quality predict better redesign within Warm Japandi?")
    lines.append("")
    lines.append("In Set A, Image1 is always the cleaner/better empty-room. Image1 wins = clean wins.")
    lines.append("")

    set_a = [r for r in all_results if r["pair"]["set"] == "A"]
    image1_wins = sum(1 for r in set_a if r["consolidated"]["consolidated"] == "Image1 wins")
    image2_wins = sum(1 for r in set_a if r["consolidated"]["consolidated"] == "Image2 wins")
    ties = sum(1 for r in set_a if r["consolidated"]["consolidated"] == "Genuine tie")
    inconclusive = sum(1 for r in set_a if r["consolidated"]["consolidated"] == "Inconclusive")

    lines.append(f"| Outcome | Count |")
    lines.append(f"|---------|-------|")
    lines.append(f"| Image1 wins (clean wins) | {image1_wins} |")
    lines.append(f"| Image2 wins (broken wins) | {image2_wins} |")
    lines.append(f"| Genuine tie | {ties} |")
    lines.append(f"| Inconclusive | {inconclusive} |")
    lines.append("")

    # Interpret Set A
    clean_wins_fraction = image1_wins / len(set_a) if set_a else 0
    if clean_wins_fraction >= 2 / 3:
        lines.append(
            "**Finding: Empty-room quality matters more than Path B suggested.** "
            f"Clean empty-rooms won {image1_wins}/{len(set_a)} pairs. "
            "Path B's robustness signal is weakened — the judge can discriminate "
            "within the same archetype when empty-room quality differs."
        )
    elif (ties + inconclusive) / len(set_a) >= 2 / 3 or image1_wins <= 1:
        lines.append(
            "**Finding: Path B robustness signal reinforced.** "
            f"Clean vs broken empty-rooms produced mostly ties/inconclusive ({ties + inconclusive}/{len(set_a)}). "
            "Empty-room quality does not consistently predict redesign quality within the same archetype. "
            "The 'redesign compensates for broken empty-room' signal corroborated by pairwise discrimination."
        )
    else:
        lines.append(
            "**Finding: Mixed signal.** "
            f"Clean rooms won {image1_wins}/{len(set_a)} pairs, with {ties} ties. "
            "Weak trend toward clean rooms being better, but not strong enough to revise the robustness signal."
        )
    lines.append("")

    # -----------------------------------------------------------------------
    # Section 4: Set B analysis
    # -----------------------------------------------------------------------
    lines.append("## 4. Set B Analysis — Archetype Choice on Same Broken Empty-Room")
    lines.append("")
    lines.append("**Question:** Does archetype choice affect redesign quality on the same broken empty-room?")
    lines.append("")
    lines.append("In Set B, Image1 is Warm Japandi (easier archetype), Image2 is a harder archetype.")
    lines.append("")

    set_b = [r for r in all_results if r["pair"]["set"] == "B"]
    for r in set_b:
        pair = r["pair"]
        c = r["consolidated"]["consolidated"]
        reason = r["consolidated"].get("reason", "")[:80]
        lines.append(f"- **{pair['pair_id']}** ({pair['image1_label']} vs {pair['image2_label']}): **{c}** — {reason}")
    lines.append("")

    wj_wins = sum(1 for r in set_b if r["consolidated"]["consolidated"] == "Image1 wins")
    hard_wins = sum(1 for r in set_b if r["consolidated"]["consolidated"] == "Image2 wins")
    b_ties = sum(1 for r in set_b if r["consolidated"]["consolidated"] in ("Genuine tie", "Inconclusive"))

    if wj_wins > hard_wins and wj_wins >= len(set_b) // 2:
        lines.append(
            f"**Pattern: Warm Japandi tends to produce better redesigns on broken empty-rooms** "
            f"({wj_wins} WJ wins vs {hard_wins} harder-archetype wins, {b_ties} ties). "
            "Some archetypes are easier for the model on degraded inputs."
        )
    elif hard_wins > wj_wins:
        lines.append(
            f"**Pattern: Harder archetypes won or matched WJ** "
            f"({hard_wins} harder-archetype wins vs {wj_wins} WJ wins, {b_ties} ties). "
            "Archetype choice does not penalize quality on broken empty-rooms."
        )
    else:
        lines.append(
            f"**Pattern: No consistent archetype advantage** "
            f"({wj_wins} WJ wins, {hard_wins} harder-archetype wins, {b_ties} ties). "
            "Archetype choice does not materially affect redesign quality on broken empty-rooms."
        )
    lines.append("")

    # -----------------------------------------------------------------------
    # Section 5: Set C analysis
    # -----------------------------------------------------------------------
    lines.append("## 5. Set C Analysis — Cross-Comparisons (Compound Effect)")
    lines.append("")
    lines.append("**Question:** Does the compound (broken+hard) combination lose to (clean+easy)?")
    lines.append("")
    lines.append("C1 and C2 test broken+hard vs clean+easy directly. C3 isolates archetype-vs-archetype on similar quality.")
    lines.append("")

    set_c = [r for r in all_results if r["pair"]["set"] == "C"]
    for r in set_c:
        pair = r["pair"]
        c = r["consolidated"]["consolidated"]
        reason = r["consolidated"].get("reason", "")[:80]
        lines.append(f"- **{pair['pair_id']}** ({pair['image1_label']} vs {pair['image2_label']}): **{c}** — {reason}")
    lines.append("")

    # C1+C2: broken+hard (Image1) vs clean+easy (Image2). Image2 wins = compound matters.
    c12 = [r for r in set_c if r["pair"]["pair_id"] in ("C1", "C2")]
    compound_matters = sum(1 for r in c12 if r["consolidated"]["consolidated"] == "Image2 wins")
    compound_doesnt = sum(1 for r in c12 if r["consolidated"]["consolidated"] == "Image1 wins")
    c12_ties = len(c12) - compound_matters - compound_doesnt

    if compound_matters >= 1:
        lines.append(
            f"**C1/C2 finding:** The compound (broken+hard) factor loses to (clean+easy) in "
            f"{compound_matters}/{len(c12)} cross-pairs. Even when each factor alone may not hurt, "
            "the combination does show a quality gap when discriminated pairwise."
        )
    else:
        lines.append(
            f"**C1/C2 finding:** The compound (broken+hard) factor does not consistently lose — "
            f"{compound_doesnt} broken+hard wins, {c12_ties} ties. "
            "Compound effect is not detectable at this sample size."
        )
    lines.append("")

    c3 = next((r for r in set_c if r["pair"]["pair_id"] == "C3"), None)
    if c3:
        lines.append(
            f"**C3 (Dark Moody Glam vs Heritage Traditional):** {c3['consolidated']['consolidated']} — "
            f"{c3['consolidated'].get('reason', '')[:80]}"
        )
    lines.append("")

    # -----------------------------------------------------------------------
    # Section 6: Saturation check
    # -----------------------------------------------------------------------
    lines.append("## 6. Saturation Check")
    lines.append("")

    total_pairs = len(all_results)
    total_genuine_ties = sum(
        1 for r in all_results
        if r["consolidated"]["consolidated"] in ("Genuine tie", "Inconclusive")
    )
    total_discriminated = total_pairs - total_genuine_ties

    lines.append(f"- Total pairs: {total_pairs}")
    lines.append(f"- Genuine ties / Inconclusive: {total_genuine_ties}")
    lines.append(f"- Discriminated (Image1 or Image2 wins): {total_discriminated}")
    lines.append("")

    if total_genuine_ties >= 6:
        lines.append(
            f"**Saturation detected.** {total_genuine_ties}/{total_pairs} pairs resulted in "
            "genuine ties or inconclusive outcomes. Sonnet 4.5 is largely saturated on this "
            "visual discrimination rubric. Pairwise judgment did not resolve the absolute-score "
            "uniformity uncertainty — the judge cannot reliably distinguish between redesigns "
            "at this quality level."
        )
    else:
        lines.append(
            f"**No saturation detected.** Only {total_genuine_ties}/{total_pairs} pairs were "
            f"ties/inconclusive; {total_discriminated} pairs were clearly discriminated. "
            "Pairwise judging successfully forced discrimination where absolute scoring failed."
        )
    lines.append("")

    # -----------------------------------------------------------------------
    # Section 7: Updated closure confidence
    # -----------------------------------------------------------------------
    lines.append("## 7. Updated Closure Confidence")
    lines.append("")

    # Determine confidence based on Set A outcome
    if clean_wins_fraction >= 2 / 3:
        confidence = 6
        justification = (
            f"Set A showed clean empty-rooms winning {image1_wins}/{len(set_a)} pairwise comparisons within "
            "the same archetype. This weakens Path B's robustness signal — empty-room quality does appear to "
            "predict redesign quality when archetypes are held constant. The previously stated 7/10 was "
            "overoptimistic; 6/10 reflects the reduced confidence in the 'redesign always compensates' claim."
        )
    elif total_genuine_ties >= 6:
        confidence = 7
        justification = (
            f"Set A produced {image1_wins} Image1 wins, {image2_wins} Image2 wins, {ties} ties — "
            "no strong direction. Saturation ({total_genuine_ties}/{total_pairs} ties overall) means "
            "pairwise judging did not resolve the absolute-score uniformity uncertainty from the prior probe. "
            "Confidence stays at 7/10: robustness signal is plausible but unconfirmed by discrimination."
        )
    else:
        confidence = 8
        justification = (
            f"Set A produced mixed/tie results ({image1_wins} clean wins, {image2_wins} broken wins, {ties} ties), "
            "confirming Path B's robustness signal: broken empty-rooms produce comparable redesigns to clean ones. "
            f"Set C discrimination ({compound_matters}/{len(c12)} compound-effect pairs) provides additional signal. "
            "Pairwise judging corroborated the robustness finding; confidence rises from 7/10 to 8/10."
        )

    lines.append(f"**Updated closure confidence: {confidence}/10**")
    lines.append("")
    lines.append(justification)
    lines.append("")

    # -----------------------------------------------------------------------
    # Section 8: Cost
    # -----------------------------------------------------------------------
    lines.append("## 8. Cost Reconciliation")
    lines.append("")
    n_calls = len(_cost_log)
    lines.append(f"- API calls completed: {n_calls}")
    lines.append(f"- Estimated cost per call: ~${COST_PER_JUDGE_USD:.3f}")
    lines.append(f"- **Total tracked cost: ${_total_cost:.3f}**")
    lines.append(f"- Projected (from spec): ~$0.40 (8 pairs × 2 orderings × $0.025)")
    lines.append(f"- Soft cap: ${SOFT_CAP_USD:.2f} | Hard cap: ${HARD_CAP_USD:.2f}")
    lines.append("")

    return "\n".join(lines), confidence


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    print("=" * 70)
    print("Phase 0.5 Pairwise Verification — Sonnet 4.5 Judge")
    print(f"Model: {MODEL}")
    print(f"Pairs: {len(PAIRS)}")
    print(f"Total calls: {len(PAIRS) * 2} (each pair judged twice, position-swapped)")
    print(f"Cost caps: soft=${SOFT_CAP_USD}, hard=${HARD_CAP_USD}")
    print("=" * 70)

    # Verify all images exist before starting
    missing: list[str] = []
    for pair in PAIRS:
        for key in ("image1_path", "image2_path"):
            p = pair[key]
            if not Path(p).exists():
                missing.append(p)
    if missing:
        print("ERROR: Missing images:")
        for m in missing:
            print(f"  {m}")
        sys.exit(1)
    print("All images verified.")

    all_results: list[dict[str, Any]] = []

    for pair in PAIRS:
        pair_id = pair["pair_id"]
        print(f"\n[{pair_id}] {pair['note']}")
        print(f"  Image1: {pair['image1_label']}")
        print(f"  Image2: {pair['image2_label']}")

        # Order 1: Image1=A, Image2=B
        print(f"  Order 1 (Image1=A, Image2=B)...")
        order1_result = call_judge(
            pair_id,
            "order1",
            pair["image1_path"],
            pair["image2_path"],
        )
        if order1_result:
            print(f"  Order 1 verdict: {order1_result['verdict']} — {order1_result['reason'][:60]}")
        else:
            print(f"  Order 1: null")

        time.sleep(0.5)  # brief pause between calls

        # Order 2: Image2=A, Image1=B (swapped)
        print(f"  Order 2 (Image2=A, Image1=B, swapped)...")
        order2_result = call_judge(
            pair_id,
            "order2",
            pair["image2_path"],
            pair["image1_path"],
        )
        if order2_result:
            print(f"  Order 2 verdict: {order2_result['verdict']} — {order2_result['reason'][:60]}")
        else:
            print(f"  Order 2: null")

        consolidated = consolidate_verdict(pair, order1_result, order2_result)
        print(f"  Consolidated: {consolidated['consolidated']} — {consolidated['reason'][:70]}")

        all_results.append({
            "pair": pair,
            "order1_result": order1_result,
            "order2_result": order2_result,
            "consolidated": consolidated,
        })

    # Write raw results
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    raw_output: list[dict[str, Any]] = []
    for r in all_results:
        # Serialize — strip non-JSON-serializable Path objects from pair
        pair_copy = {k: v for k, v in r["pair"].items()}
        raw_output.append({
            "pair": pair_copy,
            "order1_result": r["order1_result"],
            "order2_result": r["order2_result"],
            "consolidated": r["consolidated"],
        })

    results_path = OUT_DIR / "pairwise-results.json"
    results_path.write_text(json.dumps(raw_output, indent=2))
    print(f"\nRaw results written to {results_path}")

    # Build analysis doc
    analysis_content, confidence = build_analysis_md(all_results)
    analysis_path = OUT_DIR / "pairwise-analysis.md"
    analysis_path.write_text(analysis_content)
    print(f"Analysis doc written to {analysis_path}")

    # Write cost log
    write_cost_log()

    # Compact verdict table
    print("\n--- COMPACT VERDICT TABLE ---")
    print(f"{'Pair':<6} {'Consolidated':<18} {'Reason'}")
    print("-" * 70)
    for r in all_results:
        pair_id = r["pair"]["pair_id"]
        c = r["consolidated"]["consolidated"]
        reason = r["consolidated"].get("reason", "")[:50]
        print(f"{pair_id:<6} {c:<18} {reason}")

    print(f"\nTotal cost: ${_total_cost:.3f}")
    print(f"Updated closure confidence: {confidence}/10")
    print("=" * 70)

    return all_results, confidence, _total_cost


if __name__ == "__main__":
    main()
