"""Phase 0.5 Verification — Path B Archetype Robustness (Test 1 of 2).

Tests whether the "redesign compensates for broken empty-room" signal holds
across 4 less-forgiving archetypes: Industrial Loft, Maximalist Eclectic,
Dark Moody Glam, Heritage Traditional.

Key differences from probe_phase_5_redesign.py (Path B, Run 3):
- Judge: Claude Sonnet 4.5 (NOT Haiku — Haiku saturated at 5/5 on Warm Japandi)
- Archetypes: 4 harder styles (no cvind/cvmax/cvdco/cvlux LoRAs yet)
- Rooms: room-02, room-11, room-15, room-05 (spanning quality spectrum)
- Cost caps: soft $1.50, hard $2.00

LoRA caveat: cvind, cvmax, cvdco, cvlux LoRAs do NOT exist yet.
Phase 4 (LoRA training) is blocked on Phase 0.5. This probe uses verbatim
text prompts in lieu of LoRAs. Absolute quality scores may be lower than
production redesign with trained LoRAs; archetype signal is still informative.

Endpoint: fal-ai/nano-banana-pro (same as Path B Run 3)
Fixed seed: 42 + room_id_int (e.g. room-02 -> seed=44)

Invocation:
  python3 bench/scripts/probe_phase_5_archetypes.py

Outputs:
  bench/phase-5-probe-2/redesign/room-XX.webp
  bench/phase-5-probe-2/metrics/room-XX.json
  bench/phase-5-probe-2/triptych/room-XX.png
  bench/phase-5-probe-2/summary.md
  bench/phase-5-probe-2/cost-log.json
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
PROBE_DIR = BENCH / "phase-5-probe-2"
REDESIGN_DIR = PROBE_DIR / "redesign"
METRICS_DIR = PROBE_DIR / "metrics"
TRIPTYCH_DIR = PROBE_DIR / "triptych"

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
ENDPOINT = "fal-ai/nano-banana-pro"

# Per-call cost estimates
COST_PER_REDESIGN_USD = 0.045  # NB-Pro image-to-image, ~1K resolution
COST_PER_JUDGE_USD = 0.025     # Sonnet 4.5 vision, ~3000 input + 300 output tokens

SOFT_CAP_USD = 1.50
HARD_CAP_USD = 2.00

PATCH_SIZE = 200
MASK_OVERLAP_THRESHOLD = 0.05

# ---------------------------------------------------------------------------
# Room × Archetype assignments
# ---------------------------------------------------------------------------
PROBE_ROOMS = ["room-02", "room-11", "room-15", "room-05"]

ROOM_FILENAMES = {
    "room-02": "room-02_livingroom-piano-joydivision.webp",
    "room-11": "room-11_green-velvet-gallery.webp",
    "room-15": "room-15_wood-paneling-twin-beds.webp",
    "room-05": "room-05_office-gallery-rug.webp",
}

# Archetype name for each room
ROOM_ARCHETYPE = {
    "room-02": "Industrial Loft",
    "room-11": "Maximalist Eclectic",
    "room-15": "Dark Moody Glam",
    "room-05": "Heritage Traditional",
}

# One-line archetype descriptions for judge substitution
ARCHETYPE_DESCRIPTION = {
    "room-02": "Industrial Loft — exposed brick, concrete floors, steel beams, edison bulbs, raw warehouse aesthetic",
    "room-11": "Maximalist Eclectic — layered patterned textiles, jewel-toned velvet, gallery wall, brass accents, abundant plants and objects",
    "room-15": "Dark Moody Glam — deep charcoal walls, black lacquered furniture, brass accents, midnight blue velvet, marble surfaces, crystal chandelier",
    "room-05": "Heritage Traditional — dark mahogany furniture, crown molding, persian carpet, wing-back chair, antique brass lamp, oil paintings in gilded frames",
}

# Verbatim archetype prompts per spec
ROOM_PROMPT = {
    "room-02": (
        "industrial loft interior design, exposed brick wall, raw concrete floor, "
        "blackened steel beams and pipes, edison bulb pendant lighting, distressed leather sofa, "
        "reclaimed wood coffee table, factory cart, vintage metal stools, warehouse aesthetic, "
        "large factory windows with steel frames, photorealistic, architectural digest style"
    ),
    "room-11": (
        "maximalist eclectic interior design, layered patterned textiles, jewel-toned velvet sofa, "
        "persian rug over moroccan rug, gallery wall with mixed art, brass and gold accents, "
        "indoor plants of varied species, vintage and contemporary furniture mix, saturated color palette, "
        "abundant decorative objects, photorealistic, world of interiors style"
    ),
    "room-15": (
        "dark moody glam interior design, deep charcoal walls, black lacquered furniture, "
        "brass and gold metallic accents, plush velvet upholstery in midnight blue, "
        "marble surfaces with dramatic veining, crystal chandelier, floor lamp with linen shade, "
        "dark wood floor, low ambient lighting, photorealistic, restoration hardware modern dark style"
    ),
    "room-05": (
        "heritage traditional interior design, dark mahogany furniture with carved details, "
        "crown molding and wainscoting, persian carpet in muted reds and golds, "
        "wing-back chair upholstered in toile, antique wooden side table, brass library lamp, "
        "oil paintings in gilded frames, oriental porcelain vases, "
        "classic English country house aesthetic, photorealistic, architectural digest style"
    ),
}

# Judge rubric template — <ARCHETYPE_DESCRIPTION> is substituted per room
JUDGE_RUBRIC_TEMPLATE = """You are a senior interior design critic with high standards. Rate the attached interior render on 5 axes. Use this scale strictly:

5 = indistinguishable from professional interior photography
4 = clearly above acceptable, minor polish issues only
3 = acceptable for production use; works but has flaws a designer would call out
2 = obvious defects (warped geometry, melted seams, implausible furniture, lighting inconsistency)
1 = unacceptable; user would reject this render

Be discriminating. If you find yourself rating everything 5, lower the bar — most renders have at least one polish issue. A 5 is rare. The expected mean is 3.5-4.0.

Axes:
- style_match: how clearly the image reflects the target style "<ARCHETYPE_DESCRIPTION>"
- architectural_fidelity: walls/ceiling/floor/windows/doors structurally coherent (no warped lines, no impossible geometry, no melted seams between regions)
- furniture_plausibility: furniture pieces look real and placed sensibly (correct proportions, not floating, no internal artifacts)
- lighting_coherence: shadows and highlights consistent with a single light source direction; no impossible illumination
- composition: visual balance, framing, viewpoint as an interior render

Return strictly valid JSON, no markdown, no commentary outside JSON:
{"style_match": int, "architectural_fidelity": int, "furniture_plausibility": int, "lighting_coherence": int, "composition": int, "rationale": "<=40 words explaining the lowest-scoring axis"}"""


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
# Patch SSIM helpers
# ---------------------------------------------------------------------------
def generate_patch_candidates(H: int, W: int, patch_size: int) -> list[tuple[int, int]]:
    candidates: list[tuple[int, int]] = []
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


def compute_patch_ssim_vs_run3(
    run3_bgr: np.ndarray,
    redesign_bgr: np.ndarray,
    mask_gray: np.ndarray,
) -> tuple[float, tuple[int, int], bool]:
    """Compute architectural-patch SSIM between run3 empty-room and redesign output."""
    H, W = run3_bgr.shape[:2]
    run3_gray = cv2.cvtColor(run3_bgr, cv2.COLOR_BGR2GRAY)
    redesign_resized = resize_to_match(redesign_bgr, H, W)
    redesign_gray = cv2.cvtColor(redesign_resized, cv2.COLOR_BGR2GRAY)
    mask_resized = resize_to_match(mask_gray, H, W) if mask_gray.shape[:2] != (H, W) else mask_gray

    candidates = generate_patch_candidates(H, W, PATCH_SIZE)
    results = []
    for cx, cy in candidates:
        overlap = patch_mask_overlap(mask_resized, cx, cy, PATCH_SIZE)
        std_val = patch_texture_std(run3_gray, cx, cy, PATCH_SIZE)
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
    run3_patch = run3_gray[by : by + ph, bx : bx + pw]
    redesign_patch = redesign_gray[by : by + ph, bx : bx + pw]
    ssim_val = float(ssim(run3_patch, redesign_patch, data_range=255))
    return ssim_val, (bx, by), clean_available


# ---------------------------------------------------------------------------
# Step 1: Redesign via Nano Banana Pro
# ---------------------------------------------------------------------------
def redesign_room(room_id: str) -> tuple[Path | None, float, str]:
    """Upload Run 3 empty-room image, call NB-Pro redesign, save output.

    Returns (output_path, latency_s, "") on success or (None, 0.0, error_msg).
    """
    empty_room_path = RUN3_OUTPUTS / f"{room_id}.webp"
    if not empty_room_path.exists():
        return None, 0.0, f"Run 3 empty-room output not found: {empty_room_path}"

    # Upload to fal storage
    try:
        image_url = fal_client.upload_file(str(empty_room_path))
        print(f"  [{room_id}] uploaded empty-room -> {image_url[:60]}...")
    except Exception as e:
        return None, 0.0, f"Upload failed: {e}"

    room_int = int(room_id.split("-")[1])
    seed = 42 + room_int  # deterministic per spec

    archetype = ROOM_ARCHETYPE[room_id]
    prompt = ROOM_PROMPT[room_id]
    print(f"  [{room_id}] archetype={archetype}, seed={seed}")

    args: dict[str, Any] = {
        "prompt": prompt,
        "image_urls": [image_url],
        "seed": seed,
        "num_images": 1,
        "output_format": "jpeg",
        "safety_tolerance": "5",
        "sync_mode": False,
    }

    result: dict[str, Any] = {}
    latency = 0.0
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
            print(f"  [{room_id}] redesign retry (attempt {attempt + 1}): {e}")
            time.sleep(3)

    images = result.get("images") or []
    if not images:
        return None, latency, f"No images in result: {result}"

    img_data = images[0]
    img_url = img_data.get("url") if isinstance(img_data, dict) else None
    if not img_url:
        return None, latency, f"No URL in image result: {img_data}"

    try:
        resp = requests.get(img_url, timeout=60)
        resp.raise_for_status()
        pil_img = Image.open(io.BytesIO(resp.content)).convert("RGB")
    except Exception as e:
        return None, latency, f"Download failed: {e}"

    # Resize to match input dims
    input_pil = Image.open(empty_room_path).convert("RGB")
    if pil_img.size != input_pil.size:
        pil_img = pil_img.resize(input_pil.size, Image.LANCZOS)

    out_path = REDESIGN_DIR / f"{room_id}.webp"
    pil_img.save(str(out_path), format="WEBP", quality=85)
    print(f"  [{room_id}] redesign saved -> {out_path.name} ({pil_img.width}x{pil_img.height}) latency={latency:.1f}s")

    record_cost(room_id, "redesign", COST_PER_REDESIGN_USD, note=f"seed={seed} latency={latency:.1f}s archetype={archetype}")
    return out_path, latency, ""


# ---------------------------------------------------------------------------
# Step 2: MLLM Judge (Sonnet 4.5)
# ---------------------------------------------------------------------------
def call_mllm_judge(room_id: str, redesign_path: Path, retry: bool = False) -> dict[str, Any] | None:
    """Call Claude Sonnet 4.5 vision with discriminating rubric. Returns parsed scores or None."""
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not anthropic_key:
        print(f"  [{room_id}] ANTHROPIC_API_KEY missing — skipping judge")
        return None

    archetype_desc = ARCHETYPE_DESCRIPTION[room_id]
    rubric = JUDGE_RUBRIC_TEMPLATE.replace("<ARCHETYPE_DESCRIPTION>", archetype_desc)

    if retry:
        rubric += (
            "\n\nCRITICAL: You MUST return ONLY valid JSON. No prose. No markdown. "
            'Start your response with "{" and end with "}".'
        )

    # Compress image to 1024px/0.8 quality per CLAUDE.md
    pil_img = Image.open(redesign_path).convert("RGB")
    img_b64 = pil_to_base64_jpeg(pil_img, max_dim=1024, quality=80)

    client = anthropic.Anthropic(api_key=anthropic_key)
    try:
        response = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=400,
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
    record_cost(room_id, "mllm_judge_sonnet45", COST_PER_JUDGE_USD, note=f"archetype={ROOM_ARCHETYPE[room_id]}")

    # Parse JSON — strip markdown fences if present
    try:
        text = raw_text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]) if lines[-1].startswith("```") else "\n".join(lines[1:])
        scores = json.loads(text)
        expected = {
            "style_match",
            "architectural_fidelity",
            "furniture_plausibility",
            "lighting_coherence",
            "composition",
        }
        if not expected.issubset(scores.keys()):
            raise ValueError(f"Missing keys: {expected - set(scores.keys())}")
        return scores
    except (json.JSONDecodeError, ValueError) as e:
        print(f"  [{room_id}] judge JSON parse failed: {e}. Raw: {raw_text[:120]}")
        if not retry:
            print(f"  [{room_id}] retrying judge with stricter instruction...")
            return call_mllm_judge(room_id, redesign_path, retry=True)
        print(f"  [{room_id}] judge null after retry — recording null")
        return None


# ---------------------------------------------------------------------------
# Step 2: Compute metrics
# ---------------------------------------------------------------------------
def compute_metrics(room_id: str, redesign_path: Path, latency_s: float) -> dict[str, Any]:
    """Compute patch SSIM (run3 vs redesign), VP shift, and MLLM judge scores."""
    run3_path = RUN3_OUTPUTS / f"{room_id}.webp"
    run3_metric_path = RUN3_METRICS / f"{room_id}.json"
    mask_path = RUN3_MASKS / f"{room_id}_mask.png"

    run3_bgr = load_image_bgr(run3_path)
    redesign_bgr = load_image_bgr(redesign_path)
    H_run3, W_run3 = run3_bgr.shape[:2]

    try:
        mask_gray = load_mask_gray(mask_path)
    except Exception:
        mask_gray = np.zeros((H_run3, W_run3), dtype=np.uint8)

    # Load run3 empty-room SSIM for reference
    empty_room_ssim: float | None = None
    if run3_metric_path.exists():
        with open(run3_metric_path) as f:
            run3_data = json.load(f)
        empty_room_ssim = run3_data.get("metrics", {}).get("ssim_unmasked", None)

    # a. Patch SSIM: run3 empty-room vs redesign
    patch_ssim, (px, py), clean_patch = compute_patch_ssim_vs_run3(run3_bgr, redesign_bgr, mask_gray)

    # b. MLLM judge (Sonnet 4.5)
    judge_scores = call_mllm_judge(room_id, redesign_path)

    archetype = ROOM_ARCHETYPE[room_id]

    return {
        "room_id": room_id,
        "archetype": archetype,
        "run3_path": str(run3_path.relative_to(ROOT)),
        "redesign_path": str(redesign_path.relative_to(ROOT)),
        "empty_room_ssim": empty_room_ssim,
        "patch_ssim_run3_vs_redesign": patch_ssim,
        "patch_position": {"x": px, "y": py},
        "clean_patch_available": clean_patch,
        "mllm_judge": judge_scores,
        "judge_model": "claude-sonnet-4-5",
        "latency_s": latency_s,
        "cost_usd": COST_PER_REDESIGN_USD + (COST_PER_JUDGE_USD if judge_scores else 0.0),
    }


# ---------------------------------------------------------------------------
# Step 3: Triptych builder
# ---------------------------------------------------------------------------
def build_triptych(room_id: str, redesign_path: Path) -> Path:
    """Build triptych: USER INPUT | EMPTY-ROOM (Run 3) | REDESIGN (<archetype>)."""
    original_filename = ROOM_FILENAMES[room_id]
    original_path = ROOMS_DIR / original_filename
    empty_room_path = RUN3_OUTPUTS / f"{room_id}.webp"
    archetype = ROOM_ARCHETYPE[room_id]

    orig_img = Image.open(original_path).convert("RGB")
    empty_img = Image.open(empty_room_path).convert("RGB")
    redesign_img = Image.open(redesign_path).convert("RGB")

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

    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size=18)
    except Exception:
        font = ImageFont.load_default()

    captions = [
        "USER INPUT",
        "EMPTY-ROOM (Run 3)",
        f"REDESIGN ({archetype})",
    ]
    panels = [orig_img, empty_img, redesign_img]
    x_cursor = PADDING
    for panel, caption in zip(panels, captions):
        canvas.paste(panel, (x_cursor, PADDING))
        cap_y = PADDING + TARGET_H
        draw.rectangle([x_cursor, cap_y, x_cursor + panel.width, cap_y + CAPTION_H], fill=(0, 0, 0))
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
AXIS_KEYS = [
    "style_match",
    "architectural_fidelity",
    "furniture_plausibility",
    "lighting_coherence",
    "composition",
]
AXIS_ABBREV = ["style_match", "arch_fid", "furn_plaus", "lighting", "composition"]


def judge_mean(scores: dict[str, Any]) -> float:
    vals = [scores.get(k, 0) for k in AXIS_KEYS]
    return sum(vals) / len(vals)


def build_summary(all_metrics: list[dict[str, Any]]) -> None:
    lines: list[str] = []
    lines.append("# Phase 0.5 Verification — Path B Archetype Robustness (Test 1 of 2)")
    lines.append("")

    # 1. Setup
    lines.append("## 1. Setup")
    lines.append("")
    lines.append(f"- **Endpoint:** `{ENDPOINT}` (fal.ai)")
    lines.append("- **Judge model:** `claude-sonnet-4-5` (Sonnet 4.5 — discriminating; Haiku saturated at 5/5 on Path B Warm Japandi)")
    lines.append("- **Fixed seed:** 42 + room_id_int (room-02=44, room-05=47, room-11=53, room-15=57)")
    lines.append("- **Cost caps:** soft $1.50 / hard $2.00")
    lines.append("")
    lines.append("### LoRA Caveat")
    lines.append("")
    lines.append(
        "**IMPORTANT:** LoRAs cvind (Industrial), cvmax (Maximalist), cvdco (Dark Moody), "
        "cvlux (Heritage/Luxury) do NOT exist yet. Phase 4 (custom LoRA training) is blocked "
        "on Phase 0.5. This probe uses verbatim text prompts in lieu of LoRAs. "
        "Absolute quality scores may be lower than production redesign with trained LoRAs; "
        "archetype robustness signal is still informative."
    )
    lines.append("")

    # 2. Per-room table
    lines.append("## 2. Per-Room Results")
    lines.append("")
    header = (
        "| Room | Archetype | Empty-room SSIM | style_match | arch_fid "
        "| furn_plaus | lighting | composition | judge mean | rationale |"
    )
    separator = "|------|-----------|-----------------|-------------|----------|-----------|---------  |-------------|------------|-----------|"
    lines.append(header)
    lines.append(separator)

    for m in all_metrics:
        room_id = m["room_id"]
        archetype = m.get("archetype", "?")
        er_ssim = f"{m['empty_room_ssim']:.4f}" if m.get("empty_room_ssim") is not None else "n/a"
        judge = m.get("mllm_judge")
        if judge:
            s_vals = [judge.get(k, 0) for k in AXIS_KEYS]
            jmean = sum(s_vals) / len(s_vals)
            score_strs = [str(judge.get(k, "n/a")) for k in AXIS_KEYS]
            mean_str = f"{jmean:.2f}"
            rationale = judge.get("rationale", "")[:60]
        else:
            score_strs = ["n/a"] * 5
            mean_str = "n/a"
            rationale = "judge null"

        row = (
            f"| {room_id} | {archetype} | {er_ssim} "
            f"| {' | '.join(score_strs)} | {mean_str} | {rationale} |"
        )
        lines.append(row)
    lines.append("")

    # 3. Mean per axis
    lines.append("## 3. Mean Per Axis (across 4 rooms)")
    lines.append("")
    all_scored = [m for m in all_metrics if m.get("mllm_judge")]
    if all_scored:
        for k, abbr in zip(AXIS_KEYS, AXIS_ABBREV):
            vals = [m["mllm_judge"].get(k) for m in all_scored if isinstance(m["mllm_judge"].get(k), (int, float))]
            mean = sum(vals) / len(vals) if vals else None
            if mean is not None:
                lines.append(f"- **{abbr}:** {mean:.2f} (n={len(vals)})")
        overall_vals = [judge_mean(m["mllm_judge"]) for m in all_scored]
        overall = sum(overall_vals) / len(overall_vals)
        lines.append(f"- **Overall mean:** {overall:.2f}")
    else:
        lines.append("- No judge scores available.")
    lines.append("")

    # 4. Comparison to Path B Warm Japandi
    lines.append("## 4. Comparison to Path B Warm Japandi (Haiku judge)")
    lines.append("")
    lines.append("Path B (Run 3, Warm Japandi, Haiku judge) results for reference:")
    lines.append("- All 6 rooms scored 5.00/5 mean — judge saturated; signal unreliable.")
    lines.append("- room-02 (broken): Haiku=5.00, room-11 (broken): Haiku=5.00")
    lines.append("")
    lines.append("**Key question: do room-02 and room-11 still produce acceptable redesigns (mean >= 3.0) under Sonnet + harder archetypes?**")
    lines.append("")
    for room_id in ["room-02", "room-11"]:
        m = next((x for x in all_metrics if x["room_id"] == room_id), None)
        if m and m.get("mllm_judge"):
            jm = judge_mean(m["mllm_judge"])
            verdict = "YES — acceptable (>= 3.0)" if jm >= 3.0 else "NO — below acceptable (<3.0)"
            lines.append(f"- **{room_id}** ({m['archetype']}): Sonnet mean={jm:.2f} → {verdict}")
        else:
            lines.append(f"- **{room_id}**: judge null — cannot assess")
    lines.append("")
    if all_scored:
        room02 = next((x for x in all_metrics if x["room_id"] == "room-02" and x.get("mllm_judge")), None)
        room11 = next((x for x in all_metrics if x["room_id"] == "room-11" and x.get("mllm_judge")), None)
        both_acceptable = (
            (room02 and judge_mean(room02["mllm_judge"]) >= 3.0) and
            (room11 and judge_mean(room11["mllm_judge"]) >= 3.0)
        )
        neither_acceptable = (
            (room02 and judge_mean(room02["mllm_judge"]) < 3.0) and
            (room11 and judge_mean(room11["mllm_judge"]) < 3.0)
        )
        if both_acceptable:
            lines.append(
                "**Verdict: signal HOLDS.** Both previously-broken empty-rooms (02, 11) produce "
                "acceptable redesigns (Sonnet mean >= 3.0) under harder archetypes. "
                "Redesign stage compensates for empty-room imperfection regardless of archetype."
            )
        elif neither_acceptable:
            lines.append(
                "**Verdict: signal FAILS.** Warm Japandi was unusually forgiving. "
                "Both broken empty-rooms (02, 11) produce below-acceptable redesigns under stricter archetypes."
            )
        else:
            lines.append(
                "**Verdict: signal PARTIAL.** One broken empty-room compensates, one does not. "
                "Archetype-specific sensitivity detected."
            )
    lines.append("")

    # 5. Differential archetype forgiveness
    lines.append("## 5. Differential Archetype Forgiveness")
    lines.append("")
    archetype_scores: dict[str, list[float]] = {}
    for m in all_metrics:
        archetype = m.get("archetype", "?")
        if m.get("mllm_judge"):
            archetype_scores.setdefault(archetype, []).append(judge_mean(m["mllm_judge"]))

    if archetype_scores:
        ranked = sorted(archetype_scores.items(), key=lambda x: sum(x[1]) / len(x[1]), reverse=True)
        lines.append("Ranked by mean judge score (most forgiving → least forgiving):")
        lines.append("")
        for i, (arch, scores_list) in enumerate(ranked):
            mean_val = sum(scores_list) / len(scores_list)
            rank_label = "Most forgiving" if i == 0 else ("Least forgiving" if i == len(ranked) - 1 else f"Rank {i + 1}")
            lines.append(f"{i + 1}. **{arch}** — mean={mean_val:.2f} ({rank_label})")
        lines.append("")
    else:
        lines.append("No scored rooms available for ranking.")
        lines.append("")

    # 6. Failure mode propagation
    lines.append("## 6. Failure Mode Propagation")
    lines.append("")
    low_scoring = [
        m for m in all_metrics
        if m.get("mllm_judge") and any(
            isinstance(m["mllm_judge"].get(k), (int, float)) and m["mllm_judge"][k] < 4
            for k in AXIS_KEYS
        )
    ]
    if low_scoring:
        for m in low_scoring:
            j = m["mllm_judge"]
            low_axes = {k: j[k] for k in AXIS_KEYS if isinstance(j.get(k), (int, float)) and j[k] < 4}
            rationale = j.get("rationale", "")
            er_ssim_str = f"{m['empty_room_ssim']:.4f}" if m.get("empty_room_ssim") is not None else "n/a"
            lines.append(
                f"- **{m['room_id']}** ({m.get('archetype', '?')}, empty-room SSIM={er_ssim_str}): "
                f"low axes={low_axes} — {rationale}"
            )
    else:
        lines.append("All scored redesigns achieved >= 4 on all axes. No propagated failures detected.")
    lines.append("")

    # 7. Triptych references
    lines.append("## 7. Triptych References")
    lines.append("")
    for m in all_metrics:
        room_id = m["room_id"]
        triptych_path = TRIPTYCH_DIR / f"{room_id}.png"
        if triptych_path.exists():
            archetype = m.get("archetype", "?")
            lines.append(f"- [{room_id} — {archetype}](triptych/{room_id}.png)")
    lines.append("")

    # 8. Cost reconciliation
    lines.append("## 8. Cost Reconciliation")
    lines.append("")
    n_redesign = len(all_metrics)
    n_judge = sum(1 for m in all_metrics if m.get("mllm_judge"))
    lines.append(f"- Redesign calls: {n_redesign} × ~${COST_PER_REDESIGN_USD:.3f} = ${n_redesign * COST_PER_REDESIGN_USD:.3f}")
    lines.append(f"- Sonnet 4.5 judge calls: {n_judge} × ~${COST_PER_JUDGE_USD:.3f} = ${n_judge * COST_PER_JUDGE_USD:.3f}")
    lines.append(f"- **Total tracked cost: ${_total_cost:.3f}**")
    lines.append(f"- Projected (from spec): ~$0.28")
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
    print("Phase 0.5 Verification — Path B Archetype Robustness (Test 1 of 2)")
    print(f"Endpoint: {ENDPOINT}")
    print(f"Judge: claude-sonnet-4-5 (discriminating)")
    print(f"Rooms: {', '.join(PROBE_ROOMS)}")
    print(f"Cost caps: soft=${SOFT_CAP_USD}, hard=${HARD_CAP_USD}")
    print("=" * 70)

    # Ensure output dirs exist
    REDESIGN_DIR.mkdir(parents=True, exist_ok=True)
    METRICS_DIR.mkdir(parents=True, exist_ok=True)
    TRIPTYCH_DIR.mkdir(parents=True, exist_ok=True)

    all_metrics: list[dict[str, Any]] = []

    for room_id in PROBE_ROOMS:
        archetype = ROOM_ARCHETYPE[room_id]
        print(f"\n[{room_id}] Processing archetype={archetype}...")

        # Step 1: Redesign
        redesign_path, latency, error = redesign_room(room_id)
        if error:
            print(f"  [{room_id}] SKIPPED — redesign error: {error}")
            all_metrics.append({
                "room_id": room_id,
                "archetype": archetype,
                "error": error,
                "mllm_judge": None,
            })
            continue

        # Step 2: Metrics + judge
        try:
            metrics = compute_metrics(room_id, redesign_path, latency)
        except Exception as e:
            print(f"  [{room_id}] Metrics error: {e}")
            metrics = {
                "room_id": room_id,
                "archetype": archetype,
                "error": str(e),
                "latency_s": latency,
                "mllm_judge": None,
            }

        metrics_out = METRICS_DIR / f"{room_id}.json"
        metrics_out.write_text(json.dumps(metrics, indent=2))
        all_metrics.append(metrics)

        # Step 3: Triptych
        try:
            build_triptych(room_id, redesign_path)
        except Exception as e:
            print(f"  [{room_id}] Triptych error (non-fatal): {e}")

        # Quick summary print
        judge = metrics.get("mllm_judge")
        if judge:
            jm = judge_mean(judge)
            print(
                f"  [{room_id}] judge_mean={jm:.2f} "
                f"rationale='{judge.get('rationale', '')[:60]}'"
            )
        else:
            print(f"  [{room_id}] judge=null")

    # Step 4: Summary
    build_summary(all_metrics)

    # Write cost log
    write_cost_log()

    print("\n" + "=" * 70)
    print(f"Probe complete. Total cost: ${_total_cost:.3f}")
    print(f"Results in: {PROBE_DIR}")
    print("=" * 70)

    # Final compact table for report back
    print("\n--- COMPACT RESULTS ---")
    for m in all_metrics:
        judge = m.get("mllm_judge")
        if judge:
            jm = judge_mean(judge)
            print(f"  {m['room_id']} ({m.get('archetype','?')}): judge_mean={jm:.2f}")
        else:
            print(f"  {m['room_id']} ({m.get('archetype','?')}): judge=null")
    print(f"  Total cost: ${_total_cost:.3f}")


if __name__ == "__main__":
    main()
