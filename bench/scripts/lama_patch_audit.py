"""
lama_patch_audit.py — Phase 0.5 architectural-patch SSIM audit.

Runs locally, $0 spend. Reads Run 3 inputs/masks/outputs, computes
architectural-patch SSIM on a clean 200x200 wall/ceiling patch for each
of the 5 LaMa-routed rooms that failed whole-image SSIM >= 0.97.

Outputs:
  bench/run-3-empty-room/vp-diagnostic/patches/room-XX_patch.png  (5 files)
  bench/run-3-empty-room/vp-diagnostic/5-room-patch-audit.md
"""

import json
import os
import sys
import numpy as np
import cv2
from skimage.metrics import structural_similarity as ssim

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BENCH_ROOT = os.path.join(os.path.dirname(__file__), "..", "run-3-empty-room")
ROOMS_DIR = os.path.join(os.path.dirname(__file__), "..", "rooms")
METRICS_DIR = os.path.join(BENCH_ROOT, "metrics")
MASKS_DIR = os.path.join(BENCH_ROOT, "masks")
OUTPUTS_DIR = os.path.join(BENCH_ROOT, "outputs")
PATCHES_DIR = os.path.join(BENCH_ROOT, "vp-diagnostic", "patches")
AUDIT_MD = os.path.join(BENCH_ROOT, "vp-diagnostic", "5-room-patch-audit.md")
MANIFEST_PATH = os.path.join(os.path.dirname(__file__), "..", "manifest.json")

PATCH_SIZE = 200
MASK_OVERLAP_THRESHOLD = 0.05  # 5%

# Failing rooms (LaMa + SSIM < 0.97)
FAILING_ROOMS = ["room-02", "room-04", "room-07", "room-10", "room-14"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_manifest():
    with open(MANIFEST_PATH) as f:
        data = json.load(f)
    return {r["id"]: r["filename"] for r in data["rooms"]}


def load_metrics(room_id):
    path = os.path.join(METRICS_DIR, f"{room_id}.json")
    with open(path) as f:
        return json.load(f)


def load_image_bgr(path):
    """Load image as BGR uint8 with OpenCV; handles webp."""
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(f"Could not load image: {path}")
    return img


def load_mask_gray(path):
    """Load mask as grayscale uint8."""
    mask = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if mask is None:
        raise FileNotFoundError(f"Could not load mask: {path}")
    return mask


def resize_to_match(img, target_h, target_w):
    """Resize img to (target_h, target_w) if needed."""
    if img.shape[0] == target_h and img.shape[1] == target_w:
        return img
    return cv2.resize(img, (target_w, target_h), interpolation=cv2.INTER_LINEAR)


def generate_candidates(H, W, patch_size):
    """
    Generate 8 candidate top-left corners for patch placement.
    All candidates land in the upper third of the image.
    """
    upper_third_y_limit = H // 3 - patch_size
    if upper_third_y_limit <= 0:
        upper_third_y_limit = 0

    candidates = []

    # Upper-third center
    cx = max(0, W // 2 - patch_size // 2)
    cy = max(0, H // 12)
    candidates.append((cx, cy))

    # Top-left corner
    candidates.append((0, 0))

    # Top-right corner
    candidates.append((max(0, W - patch_size), 0))

    # 4 spread across upper third at y = H//12
    y_fixed = max(0, H // 12)
    for frac_x in [1/8, 3/8, 5/8, 7/8]:
        x = int(frac_x * W) - patch_size // 2
        x = max(0, min(W - patch_size, x))
        candidates.append((x, y_fixed))

    # One mid-upper: y = H//6
    candidates.append((max(0, W // 2 - patch_size // 2), max(0, H // 6)))

    # Deduplicate
    seen = set()
    unique = []
    for c in candidates:
        key = (c[0] // 10, c[1] // 10)
        if key not in seen:
            seen.add(key)
            unique.append(c)
    return unique


def patch_mask_overlap(mask_gray, x, y, patch_size):
    """Return fraction of patch pixels that are masked (mask > 128)."""
    ph = min(patch_size, mask_gray.shape[0] - y)
    pw = min(patch_size, mask_gray.shape[1] - x)
    if ph <= 0 or pw <= 0:
        return 1.0
    patch = mask_gray[y:y+ph, x:x+pw]
    return float(np.mean(patch > 128))


def patch_texture_std(img_gray, x, y, patch_size):
    """Return std of grayscale pixel values in patch."""
    ph = min(patch_size, img_gray.shape[0] - y)
    pw = min(patch_size, img_gray.shape[1] - x)
    if ph <= 0 or pw <= 0:
        return 9999.0
    patch = img_gray[y:y+ph, x:x+pw]
    return float(np.std(patch))


def select_best_patch(img_gray, mask_gray, H, W, patch_size):
    """
    Return (x, y, mask_overlap, texture_std, clean_patch_available).
    Prefers lowest texture_std among candidates with mask_overlap < 5%.
    Falls back to lowest mask_overlap if none qualify.
    """
    candidates = generate_candidates(H, W, patch_size)
    results = []
    for (cx, cy) in candidates:
        overlap = patch_mask_overlap(mask_gray, cx, cy, patch_size)
        std = patch_texture_std(img_gray, cx, cy, patch_size)
        results.append((cx, cy, overlap, std))

    clean = [(x, y, ov, sd) for (x, y, ov, sd) in results if ov < MASK_OVERLAP_THRESHOLD]
    if clean:
        best = min(clean, key=lambda r: r[3])
        return best[0], best[1], best[2], best[3], True
    else:
        # Fallback: lowest overlap
        best = min(results, key=lambda r: r[2])
        return best[0], best[1], best[2], best[3], False


def compute_patch_ssim(input_gray, output_gray, x, y, patch_size):
    """Compute SSIM on the patch region."""
    ph = min(patch_size, input_gray.shape[0] - y)
    pw = min(patch_size, input_gray.shape[1] - x)
    p_in = input_gray[y:y+ph, x:x+pw]
    p_out = output_gray[y:y+ph, x:x+pw]
    val = ssim(p_in, p_out, data_range=255, full=False)
    return float(val)


def save_patch_visualization(img_bgr, x, y, patch_size, room_id, mask_pct, std_val, out_path):
    """Save input image with green box around patch and caption."""
    vis = img_bgr.copy()
    # Draw green rectangle (3px)
    cv2.rectangle(vis, (x, y), (x + patch_size, y + patch_size), (0, 200, 0), 3)
    # Caption near bottom
    caption = f"patch ({x},{y}) std={std_val:.1f} mask={mask_pct*100:.1f}%"
    H, W = vis.shape[:2]
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = max(0.5, min(1.0, W / 1200))
    thickness = max(1, int(font_scale * 2))
    text_y = max(H - 20, 30)
    # Shadow for readability
    cv2.putText(vis, caption, (12, text_y + 2), font, font_scale, (0, 0, 0), thickness + 2, cv2.LINE_AA)
    cv2.putText(vis, caption, (12, text_y), font, font_scale, (0, 220, 0), thickness, cv2.LINE_AA)
    cv2.imwrite(out_path, vis)


def classify(patch_ssim_val, clean_patch):
    if not clean_patch:
        return "Inconclusive (no clean patch)"
    if patch_ssim_val < 0.98:
        return "Real drift"
    elif patch_ssim_val >= 0.99:
        return "Measurement artifact"
    else:
        return "Inconclusive"


# ---------------------------------------------------------------------------
# Main audit
# ---------------------------------------------------------------------------

def run_audit():
    os.makedirs(PATCHES_DIR, exist_ok=True)
    manifest = load_manifest()

    rows = []

    for room_id in FAILING_ROOMS:
        print(f"\n--- Processing {room_id} ---")

        # Load metrics
        metrics_data = load_metrics(room_id)
        whole_ssim = metrics_data["metrics"]["ssim_unmasked"]

        # Input image
        filename = manifest[room_id]
        input_path = os.path.join(ROOMS_DIR, filename)
        input_bgr = load_image_bgr(input_path)
        H, W = input_bgr.shape[:2]
        input_gray = cv2.cvtColor(input_bgr, cv2.COLOR_BGR2GRAY)

        # Mask
        mask_path = os.path.join(MASKS_DIR, f"{room_id}_mask.png")
        mask_gray = load_mask_gray(mask_path)
        mask_gray = resize_to_match(mask_gray, H, W)

        # Output
        output_path = os.path.join(OUTPUTS_DIR, f"{room_id}.webp")
        output_bgr = load_image_bgr(output_path)
        output_bgr = resize_to_match(output_bgr, H, W)
        output_gray = cv2.cvtColor(output_bgr, cv2.COLOR_BGR2GRAY)

        # Select patch
        px, py, mask_ov, tex_std, clean = select_best_patch(input_gray, mask_gray, H, W, PATCH_SIZE)
        print(f"  Patch: ({px},{py}) mask_overlap={mask_ov*100:.1f}% texture_std={tex_std:.1f} clean={clean}")

        # Compute patch SSIM
        p_ssim = compute_patch_ssim(input_gray, output_gray, px, py, PATCH_SIZE)
        print(f"  Whole SSIM: {whole_ssim:.4f}  Patch SSIM: {p_ssim:.4f}")

        # Save visualization
        viz_path = os.path.join(PATCHES_DIR, f"{room_id}_patch.png")
        save_patch_visualization(input_bgr, px, py, PATCH_SIZE, room_id, mask_ov, tex_std, viz_path)
        print(f"  Saved visualization: {viz_path}")

        gap = p_ssim - whole_ssim
        label = classify(p_ssim, clean)
        print(f"  Classification: {label} (gap={gap:+.4f})")

        rows.append({
            "room_id": room_id,
            "patch_x": px,
            "patch_y": py,
            "mask_pct": mask_ov * 100,
            "tex_std": tex_std,
            "whole_ssim": whole_ssim,
            "patch_ssim": p_ssim,
            "gap": gap,
            "clean": clean,
            "label": label,
        })

    # Determine aggregate verdict
    artifact_count = sum(1 for r in rows if r["label"] == "Measurement artifact")
    real_drift_count = sum(1 for r in rows if r["label"] == "Real drift")
    inconclusive_count = sum(1 for r in rows if "Inconclusive" in r["label"])

    if artifact_count >= 4:
        verdict = "A"
        verdict_text = (
            "Empty-room pipeline is solid; metric stack (specifically SSIM-unmasked) is the bottleneck. "
            "The unmasked region in the metric definition leaks into preserved-furniture pixels (H1-style). "
            "Recommend proceeding to Phase 5 with revised SSIM evaluation: use architectural-patch SSIM as gate metric, "
            "not whole-image SSIM-unmasked."
        )
        recommendation = (
            "Adopt architectural-patch SSIM (clean wall/ceiling region) as the primary gate metric for Phase 5; "
            "retire whole-image SSIM-unmasked as a pass/fail criterion."
        )
    elif real_drift_count >= 4:
        verdict = "B"
        # Find correlates for conjecture
        drift_rooms = [r for r in rows if r["label"] == "Real drift"]
        verdict_text = (
            "Second failure mode beyond H2 confirmed. Investigate before Phase 5. "
            "Conjecture: LaMa drift in these rooms may correlate with high-contrast textures or non-white/non-neutral "
            "wall surfaces (e.g., dark stone, wood paneling, sloped ceilings) that fall outside LaMa's training distribution, "
            "causing hallucination of texture continuity at inpainting boundaries."
        )
        recommendation = (
            "Profile failing rooms for wall texture complexity and run targeted LaMa ablation with extended context window "
            "before proceeding to Phase 5."
        )
    else:
        verdict = "C"
        parts = [f"{r['room_id']}: {r['label']}" for r in rows]
        verdict_text = f"Per-room split: {'; '.join(parts)}. Recommend: treat artifact rooms as metric-stack issues (revise gate to patch SSIM); investigate real-drift rooms individually for texture/lighting correlation."
        recommendation = (
            "Split handling: apply patch-SSIM gate for artifact rooms; run targeted inpainter ablation for real-drift rooms."
        )

    write_markdown(rows, verdict, verdict_text, recommendation)
    print(f"\nAudit complete. Verdict: {verdict}")
    print(f"Report: {AUDIT_MD}")
    return verdict, rows


def write_markdown(rows, verdict, verdict_text, recommendation):
    lines = []
    lines.append("# 5-Room LaMa Architectural-Patch Audit")
    lines.append("")
    lines.append("**Phase:** 0.5 — Run 3 SSIM failure diagnosis")
    lines.append("**Date:** 2026-04-20")
    lines.append("**Cost:** $0 (pure local computation)")
    lines.append("")

    # Section 1: Identified rooms
    lines.append("## 1. Identified Rooms")
    lines.append("")
    lines.append("Rooms with `inpainter == lama` AND `metrics.ssim_unmasked < 0.97` in Run 3:")
    lines.append("")
    lines.append("| Room | Whole SSIM (unmasked) |")
    lines.append("|---|---|")
    for r in rows:
        lines.append(f"| {r['room_id']} | {r['whole_ssim']:.4f} |")
    lines.append("")

    # Section 2: Per-room table
    lines.append("## 2. Per-Room Patch Analysis")
    lines.append("")
    lines.append("Patch size: 200×200 px, selected from upper-third region, mask overlap < 5% preferred (lowest texture std among qualifying candidates).")
    lines.append("")
    lines.append("| Room | Patch (x,y) | Mask % in patch | Texture std | Whole SSIM | Patch SSIM | Gap | Classification |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for r in rows:
        clean_note = "" if r["clean"] else " *(no clean patch)*"
        lines.append(
            f"| {r['room_id']} | ({r['patch_x']},{r['patch_y']}) | {r['mask_pct']:.1f}% | {r['tex_std']:.1f} | "
            f"{r['whole_ssim']:.4f} | {r['patch_ssim']:.4f} | {r['gap']:+.4f} | **{r['label']}**{clean_note} |"
        )
    lines.append("")

    # Classification key
    lines.append("**Classification key:**")
    lines.append("- Patch SSIM < 0.98 → **Real drift**")
    lines.append("- Patch SSIM ≥ 0.99 → **Measurement artifact** (clean architecture preserved; whole-image drift concentrated in mask-boundary / preserved-furniture pixels)")
    lines.append("- 0.98 ≤ patch SSIM < 0.99 → **Inconclusive**")
    lines.append("- No candidate with mask overlap < 5% → **Inconclusive (no clean patch)**")
    lines.append("")

    # Section 3: Patch images
    lines.append("## 3. Patch Visualizations")
    lines.append("")
    lines.append("Green box = chosen 200×200 architectural patch. Caption shows location, texture std, and mask overlap.")
    lines.append("")
    for r in rows:
        room_id = r["room_id"]
        lines.append(f"### {room_id}")
        lines.append(f"![{room_id} patch](patches/{room_id}_patch.png)")
        lines.append("")

    # Section 4: Aggregate verdict
    lines.append("## 4. Aggregate Verdict")
    lines.append("")
    lines.append(f"**Verdict: {verdict}**")
    lines.append("")
    lines.append(verdict_text)
    lines.append("")

    # Count summary
    artifact_count = sum(1 for r in rows if r["label"] == "Measurement artifact")
    real_drift_count = sum(1 for r in rows if r["label"] == "Real drift")
    inconclusive_count = len(rows) - artifact_count - real_drift_count
    lines.append(f"- Measurement artifact: {artifact_count}/5")
    lines.append(f"- Real drift: {real_drift_count}/5")
    lines.append(f"- Inconclusive: {inconclusive_count}/5")
    lines.append("")
    lines.append(f"**Recommendation:** {recommendation}")
    lines.append("")

    # Section 5: Cost reconciliation
    lines.append("## 5. Cost Reconciliation")
    lines.append("")
    lines.append("| Item | Cost |")
    lines.append("|---|---|")
    lines.append("| Local SSIM computation (skimage, cv2) | $0.00 |")
    lines.append("| Network calls | $0.00 |")
    lines.append("| **Total** | **$0.00** |")
    lines.append("")

    with open(AUDIT_MD, "w") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    verdict, rows = run_audit()
    sys.exit(0)
