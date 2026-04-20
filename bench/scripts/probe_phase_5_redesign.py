"""Phase 0.5 Path B — Phase 5 redesign probe on Run 3 empty-room outputs.

Tests whether redesign quality correlates with empty-room input quality, using
6 rooms spanning the Run 3 quality spectrum (clean: 01/09; medium: 03/07;
broken: 02/11).

Endpoint: fal-ai/nano-banana-pro (image-to-image via image_urls)
LoRA: NOT USED — COVAJAPANDI LoRA not yet trained (Phase 4 blocked on Phase 0).
      Using Warm Japandi text prompt as substitute. Findings about correlation
      are still informative; absolute quality scores may be lower than
      production redesign with LoRA.

Cost budget: soft cap $5, hard stop $8.

Invocation:
  python3 bench/scripts/probe_phase_5_redesign.py

Outputs:
  bench/phase-5-probe/redesign/room-XX.webp
  bench/phase-5-probe/metrics/room-XX.json
  bench/phase-5-probe/triptych/room-XX.png
  bench/phase-5-probe/summary.md
  bench/phase-5-probe/cost-log.json
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
import cv2  # type: ignore
import numpy as np
import requests
from PIL import Image, ImageDraw, ImageFont
from skimage.metrics import structural_similarity as ssim  # type: ignore

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent.parent
BENCH = ROOT / "bench"
ROOMS_DIR = BENCH / "rooms"
RUN3_OUTPUTS = BENCH / "run-3-empty-room" / "outputs"
RUN3_METRICS = BENCH / "run-3-empty-room" / "metrics"
RUN3_MASKS = BENCH / "run-3-empty-room" / "masks"
PROBE_DIR = BENCH / "phase-5-probe"
REDESIGN_DIR = PROBE_DIR / "redesign"
METRICS_DIR = PROBE_DIR / "metrics"
TRIPTYCH_DIR = PROBE_DIR / "triptych"

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PROBE_ROOMS = ["room-01", "room-02", "room-03", "room-07", "room-09", "room-11"]
ROOM_FILENAMES = {
    "room-01": "room-01_bedroom-cat-popcorn.webp",
    "room-02": "room-02_livingroom-piano-joydivision.webp",
    "room-03": "room-03_livingroom-leather-herringbone.webp",
    "room-07": "room-07_bedroom-desk-carpet.webp",
    "room-09": "room-09_gaming-led-popcorn.webp",
    "room-11": "room-11_green-velvet-gallery.webp",
}
ROOM_CLASS = {
    "room-01": "clean",
    "room-09": "clean",
    "room-03": "medium",
    "room-07": "medium",
    "room-02": "broken",
    "room-11": "broken",
}

ENDPOINT = "fal-ai/nano-banana-pro"
# Per-call cost estimate for Nano Banana Pro (image-to-image, 1K resolution)
COST_PER_REDESIGN_USD = 0.045  # estimated; actual from endpoint response if available
COST_PER_JUDGE_USD = 0.005     # Haiku 4.5 vision, ~3000 input + 200 output tokens

SOFT_CAP_USD = 5.0
HARD_CAP_USD = 8.0

WARM_JAPANDI_PROMPT = (
    "warm japandi interior design, light wood furniture, soft beige and cream tones, "
    "low-profile sofa, paper lantern lighting, natural linen textiles, indoor plants, "
    "tatami-inspired floor mats, minimal decor, soft diffused natural light, "
    "photorealistic, architectural digest style"
)

JUDGE_RUBRIC = """You are a design QA judge. Rate the attached interior design image on 5 axes, 1-5 each (5 = excellent, 1 = unacceptable). Return strictly valid JSON, no commentary.

Axes:
- style_match: how clearly the image reflects warm japandi style (light wood, soft beige/cream, low-profile furniture, paper lantern lighting, natural textiles, minimal decor, indoor plants)
- architectural_fidelity: are walls, ceiling, floor, windows, doors structurally coherent (no warped lines, no impossible geometry, no melted seams)
- furniture_plausibility: do the furniture pieces look real (not floating, correct proportions, sensible placement, no visual artifacts in the furniture itself)
- lighting_coherence: are shadows and highlights consistent with a single light source direction; no impossible illumination
- composition: overall visual balance and framing as an interior design render

Return: {"style_match": int, "architectural_fidelity": int, "furniture_plausibility": int, "lighting_coherence": int, "composition": int, "rationale": "<=30 words"}"""

PATCH_SIZE = 200
MASK_OVERLAP_THRESHOLD = 0.05


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
            if k in ("FAL_KEY", "ANTHROPIC_API_KEY") and not os.getenv(k):
                os.environ[k] = v


load_env_keys()
import fal_client  # noqa: E402  (needs FAL_KEY set first)


# ---------------------------------------------------------------------------
# Cost tracking
# ---------------------------------------------------------------------------
_cost_log: list[dict[str, Any]] = []
_total_cost = 0.0


def record_cost(room_id: str, call_type: str, cost_usd: float, note: str = "") -> None:
    global _total_cost
    _total_cost += cost_usd
    _cost_log.append({
        "room_id": room_id,
        "call_type": call_type,
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
    out = PROBE_DIR / "cost-log.json"
    out.write_text(json.dumps({"entries": _cost_log, "total_usd": _total_cost}, indent=2))


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------
def load_image_bgr(path: Path) -> np.ndarray:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(f"Could not load: {path}")
    return img


def load_mask_gray(path: Path) -> np.ndarray:
    mask = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if mask is None:
        raise FileNotFoundError(f"Could not load mask: {path}")
    return mask


def resize_to_match(img: np.ndarray, target_h: int, target_w: int) -> np.ndarray:
    if img.shape[0] == target_h and img.shape[1] == target_w:
        return img
    return cv2.resize(img, (target_w, target_h), interpolation=cv2.INTER_LINEAR)


def bgr_to_pil(img_bgr: np.ndarray) -> Image.Image:
    return Image.fromarray(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))


def pil_to_bgr(img: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def pil_to_base64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    buf.seek(0)
    return base64.standard_b64encode(buf.read()).decode("utf-8")


# ---------------------------------------------------------------------------
# Patch SSIM helpers (same logic as lama_patch_audit.py)
# ---------------------------------------------------------------------------
def generate_patch_candidates(H: int, W: int, patch_size: int) -> list[tuple[int, int]]:
    candidates = []
    cx = max(0, W // 2 - patch_size // 2)
    cy = max(0, H // 12)
    candidates.append((cx, cy))
    candidates.append((0, 0))
    candidates.append((max(0, W - patch_size), 0))
    y_fixed = max(0, H // 12)
    for frac_x in [1 / 8, 3 / 8, 5 / 8, 7 / 8]:
        x = int(frac_x * W) - patch_size // 2
        x = max(0, min(W - patch_size, x))
        candidates.append((x, y_fixed))
    candidates.append((max(0, W // 2 - patch_size // 2), max(0, H // 6)))
    seen: set[tuple[int, int]] = set()
    unique: list[tuple[int, int]] = []
    for c in candidates:
        key = (c[0] // 10, c[1] // 10)
        if key not in seen:
            seen.add(key)
            unique.append(c)
    return unique


def patch_mask_overlap(mask_gray: np.ndarray, x: int, y: int, patch_size: int) -> float:
    ph = min(patch_size, mask_gray.shape[0] - y)
    pw = min(patch_size, mask_gray.shape[1] - x)
    if ph <= 0 or pw <= 0:
        return 1.0
    patch = mask_gray[y : y + ph, x : x + pw]
    return float(np.mean(patch > 128))


def patch_texture_std(img_gray: np.ndarray, x: int, y: int, patch_size: int) -> float:
    ph = min(patch_size, img_gray.shape[0] - y)
    pw = min(patch_size, img_gray.shape[1] - x)
    if ph <= 0 or pw <= 0:
        return 9999.0
    patch = img_gray[y : y + ph, x : x + pw]
    return float(np.std(patch))


def compute_patch_ssim(
    original_bgr: np.ndarray,
    redesign_bgr: np.ndarray,
    mask_gray: np.ndarray,
) -> tuple[float, tuple[int, int], bool]:
    """Compute architectural-patch SSIM between original input and redesign output.

    Returns (ssim_value, (x, y), clean_patch_available).
    """
    H, W = original_bgr.shape[:2]
    orig_gray = cv2.cvtColor(original_bgr, cv2.COLOR_BGR2GRAY)
    redesign_resized = resize_to_match(redesign_bgr, H, W)
    redesign_gray = cv2.cvtColor(redesign_resized, cv2.COLOR_BGR2GRAY)
    mask_resized = resize_to_match(mask_gray, H, W) if mask_gray.shape[:2] != (H, W) else mask_gray

    candidates = generate_patch_candidates(H, W, PATCH_SIZE)
    results = []
    for cx, cy in candidates:
        overlap = patch_mask_overlap(mask_resized, cx, cy, PATCH_SIZE)
        std_val = patch_texture_std(orig_gray, cx, cy, PATCH_SIZE)
        results.append((cx, cy, overlap, std_val))

    clean = [(x, y, ov, sd) for (x, y, ov, sd) in results if ov < MASK_OVERLAP_THRESHOLD]
    if clean:
        best = min(clean, key=lambda r: r[3])
        bx, by, _, _ = best
        clean_available = True
    else:
        best = min(results, key=lambda r: r[2])
        bx, by, _, _ = best
        clean_available = False

    ph = min(PATCH_SIZE, H - by)
    pw = min(PATCH_SIZE, W - bx)
    orig_patch = orig_gray[by : by + ph, bx : bx + pw]
    redesign_patch = redesign_gray[by : by + ph, bx : bx + pw]
    ssim_val = float(ssim(orig_patch, redesign_patch, data_range=255))
    return ssim_val, (bx, by), clean_available


# ---------------------------------------------------------------------------
# VP shift helper (same logic as run_empty_room_bench.py)
# ---------------------------------------------------------------------------
def compute_vp_shift(original_bgr: np.ndarray, redesign_bgr: np.ndarray) -> float:
    """Compute VP shift as % of image diagonal."""
    H, W = original_bgr.shape[:2]
    redesign_resized = resize_to_match(redesign_bgr, H, W)
    orig_gray = cv2.cvtColor(original_bgr, cv2.COLOR_BGR2GRAY)
    redesign_gray = cv2.cvtColor(redesign_resized, cv2.COLOR_BGR2GRAY)
    orig_edges = cv2.Canny(orig_gray, 50, 150)
    redesign_edges = cv2.Canny(redesign_gray, 50, 150)

    def detect_vp(edges: np.ndarray) -> tuple[float, float]:
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=50, minLineLength=50, maxLineGap=10)
        if lines is None:
            return float(W / 2), float(H / 2)
        h_lines = [l for l in lines if abs(l[0][3] - l[0][1]) < 20]
        v_lines = [l for l in lines if abs(l[0][2] - l[0][0]) < 20]
        vp_x = float(np.mean([l[0][0] for l in v_lines]) if v_lines else W / 2)
        vp_y = float(np.mean([l[0][1] for l in h_lines]) if h_lines else H / 2)
        return vp_x, vp_y

    orig_vp = detect_vp(orig_edges)
    redesign_vp = detect_vp(redesign_edges)
    diag = np.sqrt(H**2 + W**2)
    shift = np.sqrt((orig_vp[0] - redesign_vp[0]) ** 2 + (orig_vp[1] - redesign_vp[1]) ** 2)
    return float(shift / diag * 100.0)


# ---------------------------------------------------------------------------
# Step 1: Redesign via Nano Banana Pro
# ---------------------------------------------------------------------------
def redesign_room(room_id: str) -> tuple[Path | None, float, str]:
    """Upload empty-room image, call redesign endpoint, return (output_path, latency, error).

    Returns (Path, latency_s, "") on success or (None, 0.0, error_msg) on failure.
    """
    empty_room_path = RUN3_OUTPUTS / f"{room_id}.webp"
    if not empty_room_path.exists():
        return None, 0.0, f"Empty-room output not found: {empty_room_path}"

    # Upload to fal storage
    try:
        image_url = fal_client.upload_file(str(empty_room_path))
        print(f"  [{room_id}] uploaded empty-room -> {image_url[:60]}...")
    except Exception as e:
        return None, 0.0, f"Upload failed: {e}"

    seed = 42 + int(room_id.split("-")[1])  # deterministic: 43 for room-01, etc.

    args: dict[str, Any] = {
        "prompt": WARM_JAPANDI_PROMPT,
        "image_urls": [image_url],
        "seed": seed,
        "num_images": 1,
        "output_format": "jpeg",
        "safety_tolerance": "5",  # lenient — interior design content
        "sync_mode": False,
    }

    for attempt in range(2):
        try:
            t0 = time.time()
            result = fal_client.subscribe(
                ENDPOINT,
                arguments=args,
                with_logs=False,
            )
            latency = time.time() - t0
            break
        except Exception as e:
            if attempt == 1:
                return None, 0.0, f"Redesign call failed after 2 attempts: {e}"
            print(f"  [{room_id}] redesign retry (attempt {attempt+1}): {e}")
            time.sleep(3)

    # Parse result
    images = result.get("images") or []
    if not images:
        return None, latency, f"No images in result: {result}"

    img_data = images[0]
    img_url = img_data.get("url") if isinstance(img_data, dict) else None
    if not img_url:
        return None, latency, f"No URL in image result: {img_data}"

    # Download and save
    try:
        resp = requests.get(img_url, timeout=60)
        resp.raise_for_status()
        pil_img = Image.open(io.BytesIO(resp.content)).convert("RGB")
    except Exception as e:
        return None, latency, f"Download failed: {e}"

    out_path = REDESIGN_DIR / f"{room_id}.webp"
    pil_img.save(str(out_path), format="WEBP", quality=85)
    print(f"  [{room_id}] redesign saved -> {out_path.name} ({pil_img.width}x{pil_img.height})")

    record_cost(room_id, "redesign", COST_PER_REDESIGN_USD, note=f"seed={seed} latency={latency:.1f}s")
    return out_path, latency, ""


# ---------------------------------------------------------------------------
# Step 2: Metrics
# ---------------------------------------------------------------------------
def compute_metrics(room_id: str, redesign_path: Path, latency_s: float) -> dict[str, Any]:
    """Compute patch SSIM, VP shift, and MLLM judge scores."""
    original_filename = ROOM_FILENAMES[room_id]
    original_path = ROOMS_DIR / original_filename
    run3_metric_path = RUN3_METRICS / f"{room_id}.json"
    mask_path = RUN3_MASKS / f"{room_id}_mask.png"

    # Load images
    original_bgr = load_image_bgr(original_path)
    redesign_bgr = load_image_bgr(redesign_path)
    H_orig, W_orig = original_bgr.shape[:2]

    try:
        mask_gray = load_mask_gray(mask_path)
    except Exception:
        mask_gray = np.zeros((H_orig, W_orig), dtype=np.uint8)

    # Load run3 metrics for reference
    with open(run3_metric_path) as f:
        run3_data = json.load(f)
    run3_metrics = run3_data.get("metrics", {})
    empty_room_patch_ssim = run3_metrics.get("ssim_unmasked", None)

    # a. Patch SSIM (original vs redesign)
    patch_ssim, (px, py), clean_patch = compute_patch_ssim(original_bgr, redesign_bgr, mask_gray)

    # b. VP shift (original vs redesign)
    vp_shift = compute_vp_shift(original_bgr, redesign_bgr)

    # c. MLLM judge
    judge_scores = call_mllm_judge(room_id, redesign_path)

    return {
        "room_id": room_id,
        "room_class": ROOM_CLASS[room_id],
        "original_path": str(original_path.relative_to(ROOT)),
        "empty_room_path": str((RUN3_OUTPUTS / f"{room_id}.webp").relative_to(ROOT)),
        "redesign_path": str(redesign_path.relative_to(ROOT)),
        "empty_room_patch_ssim": empty_room_patch_ssim,
        "redesign_patch_ssim": patch_ssim,
        "patch_position": {"x": px, "y": py},
        "clean_patch_available": clean_patch,
        "vp_shift_pct": vp_shift,
        "mllm_judge": judge_scores,
        "latency_s": latency_s,
        "cost_usd": COST_PER_REDESIGN_USD + (COST_PER_JUDGE_USD if judge_scores else 0.0),
        "original_dims": {"w": W_orig, "h": H_orig},
    }


def call_mllm_judge(room_id: str, redesign_path: Path, retry: bool = False) -> dict[str, Any] | None:
    """Call Haiku 4.5 vision with the redesign image + QA rubric. Returns parsed scores or None."""
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not anthropic_key:
        print(f"  [{room_id}] ANTHROPIC_API_KEY missing — skipping judge")
        return None

    # Load and compress redesign image to 1024px/0.8 quality per CLAUDE.md
    pil_img = Image.open(redesign_path).convert("RGB")
    max_dim = 1024
    if pil_img.width > max_dim or pil_img.height > max_dim:
        ratio = min(max_dim / pil_img.width, max_dim / pil_img.height)
        new_w = int(pil_img.width * ratio)
        new_h = int(pil_img.height * ratio)
        pil_img = pil_img.resize((new_w, new_h), Image.LANCZOS)

    img_b64 = pil_to_base64(pil_img)  # JPEG quality 0.8

    rubric = JUDGE_RUBRIC
    if retry:
        rubric = (
            JUDGE_RUBRIC
            + "\n\nCRITICAL: You MUST return ONLY valid JSON. No prose. No markdown. "
            + 'Start your response with "{" and end with "}".'
        )

    client = anthropic.Anthropic(api_key=anthropic_key)
    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": img_b64,
                            },
                        },
                        {"type": "text", "text": rubric},
                    ],
                }
            ],
        )
    except Exception as e:
        print(f"  [{room_id}] Anthropic API error: {e}")
        return None

    raw_text = response.content[0].text if response.content else ""
    record_cost(room_id, "mllm_judge", COST_PER_JUDGE_USD)

    # Parse JSON
    try:
        # Strip markdown fences if present
        text = raw_text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]) if lines[-1].startswith("```") else "\n".join(lines[1:])
        scores = json.loads(text)
        # Validate expected keys
        expected = {"style_match", "architectural_fidelity", "furniture_plausibility", "lighting_coherence", "composition"}
        if not expected.issubset(scores.keys()):
            raise ValueError(f"Missing keys: {expected - set(scores.keys())}")
        return scores
    except (json.JSONDecodeError, ValueError) as e:
        print(f"  [{room_id}] judge JSON parse failed: {e}. Raw: {raw_text[:100]}")
        if not retry:
            print(f"  [{room_id}] retrying judge with stricter instruction...")
            return call_mllm_judge(room_id, redesign_path, retry=True)
        print(f"  [{room_id}] judge null after retry")
        return None


# ---------------------------------------------------------------------------
# Step 3: Triptych builder
# ---------------------------------------------------------------------------
def build_triptych(room_id: str, redesign_path: Path) -> Path:
    """Build side-by-side triptych: original | empty-room | redesign."""
    original_path = ROOMS_DIR / ROOM_FILENAMES[room_id]
    empty_room_path = RUN3_OUTPUTS / f"{room_id}.webp"

    orig_img = Image.open(original_path).convert("RGB")
    empty_img = Image.open(empty_room_path).convert("RGB")
    redesign_img = Image.open(redesign_path).convert("RGB")

    # Normalize all panels to same height
    TARGET_H = 512
    def resize_to_h(img: Image.Image, target_h: int) -> Image.Image:
        ratio = target_h / img.height
        new_w = int(img.width * ratio)
        return img.resize((new_w, target_h), Image.LANCZOS)

    orig_img = resize_to_h(orig_img, TARGET_H)
    empty_img = resize_to_h(empty_img, TARGET_H)
    redesign_img = resize_to_h(redesign_img, TARGET_H)

    CAPTION_H = 36
    PADDING = 8

    total_w = orig_img.width + empty_img.width + redesign_img.width + 4 * PADDING
    total_h = TARGET_H + CAPTION_H + 2 * PADDING

    canvas = Image.new("RGB", (total_w, total_h), color=(0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    # Try to load a font; fall back to default
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size=18)
    except Exception:
        font = ImageFont.load_default()

    captions = ["USER INPUT", "EMPTY-ROOM (Run 3)", "REDESIGN (Warm Japandi)"]
    panels = [orig_img, empty_img, redesign_img]
    x_cursor = PADDING
    for panel, caption in zip(panels, captions):
        canvas.paste(panel, (x_cursor, PADDING))
        # White caption on black strip at bottom of panel
        cap_y = PADDING + TARGET_H
        draw.rectangle([x_cursor, cap_y, x_cursor + panel.width, cap_y + CAPTION_H], fill=(0, 0, 0))
        # Center text
        try:
            bbox = draw.textbbox((0, 0), caption, font=font)
            text_w = bbox[2] - bbox[0]
            text_h = bbox[3] - bbox[1]
        except Exception:
            text_w, text_h = len(caption) * 8, 14
        tx = x_cursor + (panel.width - text_w) // 2
        ty = cap_y + (CAPTION_H - text_h) // 2
        draw.text((tx, ty), caption, fill=(255, 255, 255), font=font)
        x_cursor += panel.width + PADDING

    out_path = TRIPTYCH_DIR / f"{room_id}.png"
    canvas.save(str(out_path), format="PNG")
    print(f"  [{room_id}] triptych saved -> {out_path.name}")
    return out_path


# ---------------------------------------------------------------------------
# Step 4: Summary builder
# ---------------------------------------------------------------------------
def build_summary(all_metrics: list[dict[str, Any]]) -> None:
    lines: list[str] = []
    lines.append("# Phase 5 Redesign Probe — Summary")
    lines.append("")
    lines.append("## 1. Endpoint Discovered")
    lines.append("")
    lines.append(f"- **Endpoint:** `{ENDPOINT}` (fal.ai)")
    lines.append(f"- **Model:** Nano Banana Pro (image-to-image via `image_urls`)")
    lines.append(f"- **Per-call cost estimate:** ${COST_PER_REDESIGN_USD:.3f} (1K resolution, 1 image)")
    lines.append("")

    lines.append("## 2. LoRA Caveat")
    lines.append("")
    lines.append(
        "**IMPORTANT:** The COVAJAPANDI LoRA referenced in the production redesign pipeline "
        "does NOT exist yet. Phase 4 (custom LoRA training) is blocked on Phase 0.5. "
        "This probe uses a base-model + text prompt substitution:"
    )
    lines.append("")
    lines.append(f"> {WARM_JAPANDI_PROMPT}")
    lines.append("")
    lines.append(
        "Findings about redesign-vs-empty-room correlation are still informative. "
        "Absolute quality scores may be lower than production redesign with the trained LoRA."
    )
    lines.append("")

    lines.append("## 3. Per-Room Results Table")
    lines.append("")
    header = (
        "| Room | Class | Empty-room SSIM | Redesign patch SSIM | VP shift% "
        "| style_match | arch_fid | furn_plaus | lighting | composition | judge mean |"
    )
    separator = "|------|-------|-----------------|---------------------|----------|-----------|---------|-----------|---------  |-------------|------------|"
    lines.append(header)
    lines.append(separator)

    axis_keys = ["style_match", "architectural_fidelity", "furniture_plausibility", "lighting_coherence", "composition"]
    axis_abbrev = ["style_match", "arch_fid", "furn_plaus", "lighting", "composition"]

    all_judge_scores: list[dict[str, Any]] = []

    for m in all_metrics:
        room_id = m["room_id"]
        cls = m["room_class"]
        er_ssim = f"{m['empty_room_patch_ssim']:.4f}" if m.get("empty_room_patch_ssim") else "n/a"
        rd_ssim = f"{m['redesign_patch_ssim']:.4f}" if m.get("redesign_patch_ssim") is not None else "n/a"
        vp = f"{m['vp_shift_pct']:.1f}" if m.get("vp_shift_pct") is not None else "n/a"

        judge = m.get("mllm_judge")
        if judge:
            scores = [judge.get(k, 0) for k in axis_keys]
            mean_score = sum(scores) / len(scores)
            score_strs = [str(judge.get(k, "n/a")) for k in axis_keys]
            mean_str = f"{mean_score:.2f}"
            all_judge_scores.append(judge)
        else:
            score_strs = ["n/a"] * 5
            mean_str = "n/a"

        row = f"| {room_id} | {cls} | {er_ssim} | {rd_ssim} | {vp} | {' | '.join(score_strs)} | {mean_str} |"
        lines.append(row)

    lines.append("")

    lines.append("## 4. Mean MLLM Judge Per Axis")
    lines.append("")
    if all_judge_scores:
        for k, abbr in zip(axis_keys, axis_abbrev):
            vals = [s[k] for s in all_judge_scores if k in s and isinstance(s[k], (int, float))]
            mean = sum(vals) / len(vals) if vals else None
            if mean is not None:
                lines.append(f"- **{abbr}:** {mean:.2f} (n={len(vals)})")
    else:
        lines.append("- No judge scores available.")
    lines.append("")

    lines.append("## 5. Correlation Analysis")
    lines.append("")

    clean_rooms = [m for m in all_metrics if m["room_class"] == "clean"]
    broken_rooms = [m for m in all_metrics if m["room_class"] == "broken"]
    medium_rooms = [m for m in all_metrics if m["room_class"] == "medium"]

    def mean_judge(rooms: list[dict[str, Any]]) -> float | None:
        scores = []
        for m in rooms:
            j = m.get("mllm_judge")
            if j:
                s = [j.get(k, 0) for k in axis_keys]
                scores.append(sum(s) / len(s))
        return sum(scores) / len(scores) if scores else None

    clean_mean = mean_judge(clean_rooms)
    broken_mean = mean_judge(broken_rooms)
    medium_mean = mean_judge(medium_rooms)

    q1 = "Unknown — no judge scores"
    q2 = "Unknown — no judge scores"
    q3 = "Not determinable — no judge scores"

    if clean_mean is not None:
        q1 = f"Clean rooms (01, 09) mean judge score: **{clean_mean:.2f}**. {'YES — clean inputs produce clean redesigns.' if clean_mean >= 4.0 else 'NO — clean inputs do not consistently produce judge-mean >= 4.0.'}"
    if broken_mean is not None:
        q2 = f"Broken rooms (02, 11) mean judge score: **{broken_mean:.2f}**. {'YES — broken inputs produce broken redesigns (judge mean < 3.0).' if broken_mean < 3.0 else 'NO — redesign partially compensates for broken empty-room inputs (judge mean >= 3.0).'}"

    # Critical signal: broken room that produced good redesign
    critical_rooms = [
        m for m in all_metrics
        if m["room_class"] == "broken"
        and m.get("mllm_judge")
        and sum(m["mllm_judge"].get(k, 0) for k in axis_keys) / len(axis_keys) >= 4.0
    ]
    if critical_rooms:
        names = ", ".join(r["room_id"] for r in critical_rooms)
        q3 = (
            f"YES — **{names}** produced a good redesign (judge mean >= 4.0) despite "
            "a broken empty-room input. This is the strongest evidence that redesign "
            "compensates for empty-room imperfection."
        )
    else:
        if any(m.get("mllm_judge") for m in broken_rooms):
            q3 = "NO — no broken empty-room input produced a redesign with judge mean >= 4.0."
        # else remains unknown

    lines.append(f"**Q1 — Do clean rooms produce clean redesigns (judge mean >= 4.0)?**")
    lines.append(f"{q1}")
    lines.append("")
    lines.append(f"**Q2 — Do broken rooms produce broken redesigns (judge mean < 3.0)?**")
    lines.append(f"{q2}")
    lines.append("")
    lines.append(f"**Q3 — Critical signal: broken empty-room -> good redesign (judge mean >= 4.0)?**")
    lines.append(f"{q3}")
    lines.append("")

    lines.append("## 6. Failure Mode Propagation")
    lines.append("")
    low_arch_fid = [
        m for m in all_metrics
        if m.get("mllm_judge") and m["mllm_judge"].get("architectural_fidelity", 5) < 4
    ]
    if low_arch_fid:
        for m in low_arch_fid:
            j = m["mllm_judge"]
            rationale = j.get("rationale", "")
            er_ssim = m.get("empty_room_patch_ssim")
            er_ssim_str = f"{er_ssim:.4f}" if er_ssim else "n/a"
            lines.append(
                f"- **{m['room_id']}** (class={m['room_class']}, arch_fid={j.get('architectural_fidelity')}, "
                f"empty-room patch SSIM={er_ssim_str}): {rationale}"
            )
    else:
        lines.append("No redesigns scored below 4 on architectural_fidelity.")
    lines.append("")

    lines.append("## 7. Triptych References")
    lines.append("")
    for m in all_metrics:
        room_id = m["room_id"]
        triptych_path = TRIPTYCH_DIR / f"{room_id}.png"
        if triptych_path.exists():
            lines.append(f"- [{room_id}](triptych/{room_id}.png)")
    lines.append("")

    lines.append("## 8. Recommendation")
    lines.append("")

    # Determine verdict
    all_scored = [m for m in all_metrics if m.get("mllm_judge")]
    if not all_scored:
        verdict = "UNKNOWN"
        recommendation = "No judge scores available — cannot determine verdict."
    else:
        scored_means = []
        for m in all_scored:
            j = m["mllm_judge"]
            s = [j.get(k, 0) for k in axis_keys]
            scored_means.append(sum(s) / len(s))

        overall_mean = sum(scored_means) / len(scored_means)

        # Check if means track empty-room class
        def judge_mean_for(m: dict[str, Any]) -> float | None:
            j = m.get("mllm_judge")
            if not j:
                return None
            s = [j.get(k, 0) for k in axis_keys]
            return sum(s) / len(s)

        clean_scored = [judge_mean_for(m) for m in clean_rooms if judge_mean_for(m) is not None]
        broken_scored = [judge_mean_for(m) for m in broken_rooms if judge_mean_for(m) is not None]
        medium_scored = [judge_mean_for(m) for m in medium_rooms if judge_mean_for(m) is not None]

        clean_avg = sum(clean_scored) / len(clean_scored) if clean_scored else None
        broken_avg = sum(broken_scored) / len(broken_scored) if broken_scored else None

        if overall_mean >= 3.8 and (broken_avg is None or broken_avg >= 3.5):
            verdict = "ROBUST"
            recommendation = (
                "**Robust** — judge mean is high across all room classes "
                f"(overall mean={overall_mean:.2f}). Empty-room stage is good enough; "
                "declare locked, move to Phase 5 full bench."
            )
        elif broken_avg is not None and broken_avg < 3.0 and (clean_avg is None or clean_avg >= 4.0):
            verdict = "FRAGILE"
            failures = []
            for m in all_metrics:
                jm = judge_mean_for(m)
                if jm is not None and jm < 3.5:
                    j = m.get("mllm_judge", {})
                    low_axes = [k for k in axis_keys if isinstance(j.get(k), (int, float)) and j[k] < 4]
                    failures.append(f"{m['room_id']} (class={m['room_class']}, axes={low_axes})")
            failure_str = "; ".join(failures) if failures else "see table"
            recommendation = (
                f"**Fragile** — judge scores track empty-room quality "
                f"(clean={clean_avg:.2f}, broken={broken_avg:.2f}). "
                "Empty-room iteration justified. Specific failures to fix: "
                + failure_str + "."
            )
        else:
            verdict = "MIXED"
            propagated = []
            compensated = []
            for m in all_metrics:
                jm = judge_mean_for(m)
                if m["room_class"] == "broken" and jm is not None:
                    if jm >= 4.0:
                        compensated.append(m["room_id"])
                    else:
                        propagated.append(m["room_id"])
            recommendation = (
                f"**Mixed** — some empty-room failures propagate ({', '.join(propagated) or 'none'}), "
                f"others are compensated by redesign ({', '.join(compensated) or 'none'}). "
                "Document: propagated fail modes are candidates for empty-room iteration; "
                "compensated fail modes are acceptable at current empty-room quality."
            )

    lines.append(f"**Verdict:** {verdict}")
    lines.append("")
    lines.append(recommendation)
    lines.append("")

    lines.append("## 9. Cost Reconciliation")
    lines.append("")
    lines.append(f"- Redesign calls: {len(all_metrics)} × ~${COST_PER_REDESIGN_USD:.3f} = ${len(all_metrics) * COST_PER_REDESIGN_USD:.3f}")
    judge_calls = sum(1 for m in all_metrics if m.get("mllm_judge"))
    lines.append(f"- MLLM judge calls: {judge_calls} × ~${COST_PER_JUDGE_USD:.3f} = ${judge_calls * COST_PER_JUDGE_USD:.3f}")
    lines.append(f"- **Total tracked cost: ${_total_cost:.3f}**")
    lines.append(f"- Soft cap: ${SOFT_CAP_USD:.2f} | Hard cap: ${HARD_CAP_USD:.2f}")
    lines.append("")

    summary_path = PROBE_DIR / "summary.md"
    summary_path.write_text("\n".join(lines))
    print(f"\nSummary written to {summary_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    print("=" * 70)
    print("Phase 0.5 Path B — Phase 5 Redesign Probe")
    print(f"Endpoint: {ENDPOINT}")
    print(f"Rooms: {', '.join(PROBE_ROOMS)}")
    print(f"Cost caps: soft=${SOFT_CAP_USD}, hard=${HARD_CAP_USD}")
    print("=" * 70)

    all_metrics: list[dict[str, Any]] = []

    for room_id in PROBE_ROOMS:
        print(f"\n[{room_id}] Processing (class={ROOM_CLASS[room_id]})...")

        # Step 1: Redesign
        redesign_path, latency, error = redesign_room(room_id)
        if error:
            print(f"  [{room_id}] SKIPPED — redesign error: {error}")
            all_metrics.append({
                "room_id": room_id,
                "room_class": ROOM_CLASS[room_id],
                "error": error,
                "mllm_judge": None,
            })
            continue

        # Step 2: Metrics
        try:
            metrics = compute_metrics(room_id, redesign_path, latency)
        except Exception as e:
            print(f"  [{room_id}] Metrics computation error: {e}")
            metrics = {
                "room_id": room_id,
                "room_class": ROOM_CLASS[room_id],
                "error": str(e),
                "latency_s": latency,
                "mllm_judge": None,
            }

        # Save per-room metrics
        metrics_out = METRICS_DIR / f"{room_id}.json"
        metrics_out.write_text(json.dumps(metrics, indent=2))
        all_metrics.append(metrics)

        # Step 3: Triptych
        try:
            build_triptych(room_id, redesign_path)
        except Exception as e:
            print(f"  [{room_id}] Triptych error (non-fatal): {e}")

        # Print quick summary
        judge = metrics.get("mllm_judge")
        if judge:
            axis_keys = ["style_match", "architectural_fidelity", "furniture_plausibility", "lighting_coherence", "composition"]
            scores = [judge.get(k, 0) for k in axis_keys]
            mean = sum(scores) / len(scores)
            print(
                f"  [{room_id}] patch_ssim={metrics.get('redesign_patch_ssim', '?'):.4f} "
                f"vp_shift={metrics.get('vp_shift_pct', '?'):.1f}% "
                f"judge_mean={mean:.2f} rationale='{judge.get('rationale', '')[:60]}'"
            )
        else:
            print(
                f"  [{room_id}] patch_ssim={metrics.get('redesign_patch_ssim', '?'):.4f} "
                f"vp_shift={metrics.get('vp_shift_pct', '?'):.1f}% judge=null"
            )

    # Step 4: Summary
    build_summary(all_metrics)

    # Write cost log
    write_cost_log()

    print("\n" + "=" * 70)
    print(f"Probe complete. Total cost: ${_total_cost:.3f}")
    print(f"Results in: {PROBE_DIR}")
    print("=" * 70)


if __name__ == "__main__":
    main()
