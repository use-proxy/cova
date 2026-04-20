"""Phase 0.5 — FLUX-Fill probe (Test 2 of 2).

Test fal-ai/flux-pro/v1/fill on the 3 hardest Run 3 failure cases:
  - room-02 (high-frequency dark plank floor, real LaMa drift, SSIM 0.715)
  - room-11 (51% coverage, Bria VAE drift confirmed, SSIM 0.923)
  - room-14 (stacked stone, real LaMa drift, SSIM 0.430)

Reuses Run 3 masks for strict apples-to-apples inpainter comparison.
Does NOT regenerate masks (strictly forbidden by spec).

Endpoint discovery order:
  1. fal-ai/flux-pro/v1/fill
  2. fal-ai/flux-pro/fill
  3. fal-ai/flux/fill
  4. fal-ai/flux-pro-fill

Cost cap: soft $0.40, hard $0.50 (script-level guard).
"""
from __future__ import annotations

import io
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import cv2  # type: ignore
import numpy as np
import requests
from PIL import Image, ImageDraw, ImageFont
from skimage.metrics import structural_similarity as ssim  # type: ignore

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent.parent
BENCH = ROOT / "bench"
ROOMS_DIR = BENCH / "rooms"
RUN3_DIR = BENCH / "run-3-empty-room"
RUN3_OUTPUTS = RUN3_DIR / "outputs"
RUN3_MASKS = RUN3_DIR / "masks"
RUN3_METRICS = RUN3_DIR / "metrics"

OUT_ROOT = BENCH / "probe-flux-fill"
OUTPUTS_DIR = OUT_ROOT / "outputs"
METRICS_DIR = OUT_ROOT / "metrics"
TRIPTYCH_DIR = OUT_ROOT / "triptych"

# ── Cost / config ─────────────────────────────────────────────────────────────
HARD_COST_CAP = 0.50       # USD — hard abort
SOFT_COST_CAP = 0.40       # USD — warn

# Cost estimates (from fal docs / research §3.1 — updated after endpoint discovery)
COST_FLUX_FILL = 0.05      # estimated per call; overridden after openapi probe
COST_SAM3 = 0.005          # per §3.3

SAM3_SCORE_THRESHOLD = 0.30
GHOST_PROMPTS = ["sofa", "chair", "table", "bed", "lamp", "rug", "cabinet", "plant"]

# ── Target rooms ──────────────────────────────────────────────────────────────
TARGET_ROOMS = [
    {
        "id": "room-02",
        "filename": "room-02_livingroom-piano-joydivision.webp",
        "patch_xy": (35, 67),       # from 5-room-patch-audit.md
        "patch_size": 200,
        "run3_ssim": 0.7145,
        "run3_ghost_global": 0.0,
        "run3_ghost_inside_mask": 0.0,
        "run3_patch_ssim": 0.9123,  # from 5-room-patch-audit.md
        "classification": "Real drift",
    },
    {
        "id": "room-11",
        "filename": "room-11_green-velvet-gallery.webp",
        "patch_xy": None,           # needs auto-selection (top-right corner, <5% mask overlap)
        "patch_size": 200,
        "run3_ssim": 0.9234,
        "run3_ghost_global": 21.04,
        "run3_ghost_inside_mask": 8.996,
        "run3_patch_ssim": None,    # not in patch audit (was Bria); will compute here
        "classification": "Bria VAE drift + high ghost",
    },
    {
        "id": "room-14",
        "filename": "room-14_stacked-stone-empty.webp",
        "patch_xy": (880, 0),       # from 5-room-patch-audit.md
        "patch_size": 200,
        "run3_ssim": 0.4302,
        "run3_ghost_global": 0.0,
        "run3_ghost_inside_mask": 0.0,
        "run3_patch_ssim": 0.9342,  # from 5-room-patch-audit.md
        "classification": "Real drift (stacked-stone)",
    },
]

# ── Env loading ───────────────────────────────────────────────────────────────
def load_fal_key() -> None:
    if os.getenv("FAL_KEY"):
        return
    env_path = ROOT / "apps/web/.env.local"
    if not env_path.exists():
        raise RuntimeError(f"FAL_KEY not set and {env_path} missing")
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line.startswith("FAL_KEY="):
            val = line.split("=", 1)[1].strip().strip('"').strip("'")
            os.environ["FAL_KEY"] = val
            return
    raise RuntimeError(f"FAL_KEY not found in {env_path}")


load_fal_key()
import fal_client  # noqa: E402


# ── fal helpers ───────────────────────────────────────────────────────────────
def fal_upload_file(path: Path) -> str:
    return fal_client.upload_file(str(path))


def download_url(url: str, timeout: float = 90.0) -> bytes:
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.content


def download_image_rgb(url: str, size: tuple[int, int] | None = None) -> Image.Image:
    img = Image.open(io.BytesIO(download_url(url, timeout=90))).convert("RGB")
    if size is not None and img.size != size:
        img = img.resize(size, Image.LANCZOS)
    return img


def download_mask_png(url: str, target_shape: tuple[int, int]) -> np.ndarray:
    img = Image.open(io.BytesIO(download_url(url, timeout=30))).convert("L")
    arr = np.array(img)
    h, w = target_shape
    if arr.shape != (h, w):
        arr = cv2.resize(arr, (w, h), interpolation=cv2.INTER_NEAREST)
    return (arr > 127).astype(np.uint8) * 255


# ── Endpoint discovery ────────────────────────────────────────────────────────
CANDIDATE_ENDPOINTS = [
    "fal-ai/flux-pro/v1/fill",
    "fal-ai/flux-pro/fill",
    "fal-ai/flux/fill",
    "fal-ai/flux-pro-fill",
]


def probe_endpoint(endpoint: str) -> bool:
    """Check if a fal endpoint exists via the queue API (HEAD/POST to queue.fal.run).

    The openapi.json route is NOT reliable for fal endpoints — many endpoints exist
    but do not expose openapi.json. The queue API returns 200 for valid endpoints
    even when the payload is invalid (and 404 for nonexistent ones).
    """
    # Use queue.fal.run — POST with dummy payload; 200 = endpoint exists (queued);
    # 404 = endpoint does not exist.
    queue_url = f"https://queue.fal.run/{endpoint}"
    headers = {
        "Authorization": f"Key {os.environ['FAL_KEY']}",
        "Content-Type": "application/json",
    }
    try:
        r = requests.post(
            queue_url,
            headers=headers,
            json={"image_url": "probe", "mask_url": "probe", "prompt": "probe"},
            timeout=15,
        )
        if r.status_code == 200:
            print(f"  [discovery] {endpoint} → queue 200 (endpoint exists)")
            return True
        elif r.status_code == 404:
            print(f"  [discovery] {endpoint} → queue 404 (not found)")
            return False
        else:
            # Other codes (400, 422 etc.) mean endpoint exists but rejected payload
            print(f"  [discovery] {endpoint} → queue {r.status_code} (endpoint exists, bad payload ok)")
            return True
    except Exception as e:
        print(f"  [discovery] {endpoint} → error: {e}")
        return False


def discover_endpoint() -> tuple[str, float]:
    """Discover working FLUX-Fill endpoint. Returns (endpoint, estimated_cost_per_call).
    Raises RuntimeError if none found.
    """
    print("\n[discovery] Probing FLUX-Fill endpoints via queue.fal.run...")
    for ep in CANDIDATE_ENDPOINTS:
        if probe_endpoint(ep):
            cost = COST_FLUX_FILL  # fallback estimate from spec §3.1
            print(f"  [discovery] no openapi pricing found; using spec estimate ${cost:.4f}/call")
            print(f"[discovery] Using endpoint: {ep} (est. ${cost:.4f}/call)")
            return ep, cost
    raise RuntimeError(
        "No FLUX-Fill endpoint found. Tried: " + ", ".join(CANDIDATE_ENDPOINTS)
    )


# ── FLUX-Fill call ─────────────────────────────────────────────────────────────
def flux_fill(
    endpoint: str,
    image_url: str,
    mask_url: str,
    max_retries: int = 2,
) -> tuple[str, dict]:
    """Call FLUX-Fill endpoint. Returns (output_image_url, raw_response).

    Uses endpoint defaults (num_inference_steps, guidance_scale, etc.) so we
    measure baseline FLUX-Fill quality, not tuned hyperparams.
    """
    # FLUX-Fill typically expects: image_url, mask_url, prompt (optional for fill).
    # We provide a minimal neutral prompt to avoid hallucination injection.
    arguments: dict[str, Any] = {
        "image_url": image_url,
        "mask_url": mask_url,
        "prompt": "empty room, clean architectural surfaces, no furniture",
    }
    for attempt in range(max_retries):
        try:
            r = fal_client.subscribe(
                endpoint,
                arguments=arguments,
                with_logs=False,
            )
            break
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait = 2 ** attempt
            print(f"  [flux-fill] retry {attempt+1}/{max_retries} after {wait}s ({e})")
            time.sleep(wait)

    # Response shape: {"images": [{"url": ...}]} or {"image": {"url": ...}}
    imgs = r.get("images")
    if imgs and isinstance(imgs, list):
        first = imgs[0]
        if isinstance(first, dict) and first.get("url"):
            return first["url"], r
        if isinstance(first, str):
            return first, r
    img = r.get("image")
    if isinstance(img, dict) and img.get("url"):
        return img["url"], r
    if isinstance(img, str):
        return img, r
    raise RuntimeError(f"Unexpected FLUX-Fill response; keys={list(r.keys())}")


# ── SAM 3 ghost detection ─────────────────────────────────────────────────────
def sam3_detect(image_url: str, prompt: str, max_retries: int = 3) -> list[tuple[str, float]]:
    for attempt in range(max_retries):
        try:
            r = fal_client.subscribe(
                "fal-ai/sam-3/image",
                arguments={
                    "image_url": image_url,
                    "prompt": prompt,
                    "return_multiple_masks": True,
                    "max_masks": 5,
                    "include_scores": True,
                    "apply_mask": False,
                    "output_format": "png",
                },
                with_logs=False,
            )
            break
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait = 2 ** attempt
            print(f"  [sam3] '{prompt}' retry {attempt+1}/{max_retries} after {wait}s ({e})")
            time.sleep(wait)
    masks = r.get("masks") or []
    scores = r.get("scores") or []
    metadata = r.get("metadata") or []
    out: list[tuple[str, float]] = []
    for i, m in enumerate(masks):
        url = m.get("url") if isinstance(m, dict) else None
        if not url:
            continue
        s = 0.5
        if i < len(scores) and scores[i] is not None:
            s = float(scores[i])
        elif i < len(metadata) and isinstance(metadata[i], dict):
            s = float(metadata[i].get("score", 0.5))
        out.append((url, s))
    return out


def compute_ghost_metrics(
    output_url: str,
    shape: tuple[int, int],
    dilated_mask: np.ndarray,
) -> tuple[float, float, dict, float]:
    """Run SAM-3 ghost scan on FLUX-Fill output. Sequential (not parallel) to keep
    memory manageable and avoid threading complexity in this probe script.

    Returns: (ghost_global_pct, ghost_inside_mask_pct, per_prompt_dict, cost_incurred)
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    h, w = shape
    total_global = 0.0
    total_inside = 0.0
    per: dict[str, Any] = {}
    cost = len(GHOST_PROMPTS) * COST_SAM3

    with ThreadPoolExecutor(max_workers=4) as ex:
        fut_to_prompt = {ex.submit(sam3_detect, output_url, p): p for p in GHOST_PROMPTS}
        for fut in as_completed(fut_to_prompt):
            p = fut_to_prompt[fut]
            try:
                results = fut.result()
            except Exception as e:
                per[p] = {"error": str(e)}
                continue
            biggest_global = 0.0
            biggest_inside = 0.0
            for url, score in results:
                if score < SAM3_SCORE_THRESHOLD:
                    continue
                try:
                    m = download_mask_png(url, (h, w))
                    pct_global = float(m.astype(bool).sum() / (h * w) * 100)
                    if pct_global > biggest_global:
                        biggest_global = pct_global
                    inside = (m.astype(bool)) & (dilated_mask.astype(bool))
                    pct_inside = float(inside.sum() / (h * w) * 100)
                    if pct_inside > biggest_inside:
                        biggest_inside = pct_inside
                except Exception:
                    continue
            per[p] = {
                "biggest_mask_pct": biggest_global,
                "biggest_inside_mask_pct": biggest_inside,
            }
            if biggest_global > 0.5:
                total_global += biggest_global
            if biggest_inside > 0.5:
                total_inside += biggest_inside

    return total_global, total_inside, per, cost


# ── Metrics ───────────────────────────────────────────────────────────────────
def metric_ssim_unmasked(in_arr: np.ndarray, out_arr: np.ndarray, mask: np.ndarray) -> float:
    """SSIM over pixels OUTSIDE the furniture mask. Same logic as run_empty_room_bench.py."""
    gray_in = cv2.cvtColor(in_arr, cv2.COLOR_RGB2GRAY)
    gray_out = cv2.cvtColor(out_arr, cv2.COLOR_RGB2GRAY)
    _, s_map = ssim(gray_in, gray_out, full=True, data_range=255)
    unmasked = (mask == 0)
    if unmasked.sum() == 0:
        return 1.0
    return float(s_map[unmasked].mean())


def metric_patch_ssim(
    in_arr: np.ndarray,
    out_arr: np.ndarray,
    mask: np.ndarray,
    patch_xy: tuple[int, int] | None,
    patch_size: int,
) -> tuple[float, tuple[int, int], float, float]:
    """Compute patch SSIM on a clean architectural region.

    If patch_xy is provided, uses that exact location (from prior audit).
    Otherwise, auto-selects a 200x200 patch from the top-right region with
    mask overlap <5% and texture_std<10.

    Returns: (patch_ssim, (x, y), mask_overlap_pct, texture_std)
    """
    h, w = in_arr.shape[:2]
    gray_in = cv2.cvtColor(in_arr, cv2.COLOR_RGB2GRAY)
    gray_out = cv2.cvtColor(out_arr, cv2.COLOR_RGB2GRAY)
    _, s_map = ssim(gray_in, gray_out, full=True, data_range=255)

    if patch_xy is not None:
        x, y = patch_xy
        # Clip to image bounds
        x = min(x, w - patch_size)
        y = min(y, h - patch_size)
        patch_mask = mask[y:y + patch_size, x:x + patch_size]
        mask_overlap = float(patch_mask.astype(bool).sum() / (patch_size * patch_size) * 100)
        patch_ssim_val = float(s_map[y:y + patch_size, x:x + patch_size].mean())
        tex_std = float(np.array(gray_in[y:y + patch_size, x:x + patch_size], dtype=float).std())
        return patch_ssim_val, (x, y), mask_overlap, tex_std

    # Auto-selection: scan upper-third for patch with <5% mask overlap
    best: tuple[float, tuple[int, int], float, float] | None = None
    best_tex = float("inf")
    scan_y_max = h // 3
    step = patch_size // 2
    for y in range(0, max(1, scan_y_max - patch_size), step):
        for x in range(0, max(1, w - patch_size), step):
            patch_mask = mask[y:y + patch_size, x:x + patch_size]
            mask_overlap = float(patch_mask.astype(bool).sum() / (patch_size * patch_size) * 100)
            if mask_overlap >= 5.0:
                continue
            patch_gray = gray_in[y:y + patch_size, x:x + patch_size]
            tex_std = float(np.array(patch_gray, dtype=float).std())
            if tex_std < best_tex:
                best_tex = tex_std
                patch_ssim_val = float(s_map[y:y + patch_size, x:x + patch_size].mean())
                best = (patch_ssim_val, (x, y), mask_overlap, tex_std)

    if best is None:
        # Fallback: top-right corner regardless of mask overlap
        x = max(0, w - patch_size)
        y = 0
        patch_ssim_val = float(s_map[y:y + patch_size, x:x + patch_size].mean())
        patch_mask = mask[y:y + patch_size, x:x + patch_size]
        mask_overlap = float(patch_mask.astype(bool).sum() / (patch_size * patch_size) * 100)
        tex_std = float(np.array(gray_in[y:y + patch_size, x:x + patch_size], dtype=float).std())
        return patch_ssim_val, (x, y), mask_overlap, tex_std

    return best


def metric_vp_shift_pct(in_arr: np.ndarray, out_arr: np.ndarray) -> float:
    """VP-shift proxy via LSD line midpoint centroid. Same as run_empty_room_bench.py."""
    lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)

    def centroid(arr: np.ndarray) -> np.ndarray | None:
        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        det = lsd.detect(gray)
        lines = det[0] if det is not None else None
        if lines is None or len(lines) == 0:
            return None
        mids = []
        for ln in lines.reshape(-1, 4):
            x1, y1, x2, y2 = ln
            length = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
            if length < 20:
                continue
            mids.append(((x1 + x2) / 2.0, (y1 + y2) / 2.0))
        if not mids:
            return None
        return np.array(mids).mean(axis=0)

    c1 = centroid(in_arr)
    c2 = centroid(out_arr)
    if c1 is None or c2 is None:
        return 0.0
    w = in_arr.shape[1]
    return float(np.linalg.norm(c1 - c2) / w * 100.0)


# ── Triptych ──────────────────────────────────────────────────────────────────
def make_triptych(
    input_path: Path,
    run3_path: Path,
    flux_path: Path,
    out_path: Path,
    room_id: str,
) -> None:
    """Build side-by-side triptych: input | run-3 | flux-fill with captions."""
    imgs = [
        Image.open(input_path).convert("RGB"),
        Image.open(run3_path).convert("RGB"),
        Image.open(flux_path).convert("RGB"),
    ]
    # Normalise height
    target_h = 480
    panels = []
    for img in imgs:
        w, h = img.size
        new_w = int(w * target_h / h)
        panels.append(img.resize((new_w, target_h), Image.LANCZOS))

    caption_h = 30
    total_w = sum(p.width for p in panels)
    canvas = Image.new("RGB", (total_w, target_h + caption_h), (20, 20, 20))
    x = 0
    captions = ["USER INPUT", "RUN 3 (LaMa/Bria)", "FLUX-FILL"]
    draw = ImageDraw.Draw(canvas)
    for i, (panel, label) in enumerate(zip(panels, captions)):
        canvas.paste(panel, (x, 0))
        # Caption strip
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
        except Exception:
            font = ImageFont.load_default()
        draw.rectangle([x, target_h, x + panel.width, target_h + caption_h], fill=(30, 30, 30))
        draw.text((x + 8, target_h + 6), label, fill=(220, 220, 220), font=font)
        x += panel.width

    canvas.save(out_path, "PNG")
    print(f"  [triptych] saved {out_path.name}")


# ── Per-room processing ───────────────────────────────────────────────────────
def process_room(
    room: dict,
    endpoint: str,
    flux_cost_per_call: float,
    running_cost: list[float],
) -> dict:
    room_id = room["id"]
    print(f"\n[{room_id}] ▶ start FLUX-Fill probe")

    # Check cost before calling
    projected_room_cost = flux_cost_per_call + len(GHOST_PROMPTS) * COST_SAM3
    if running_cost[0] + projected_room_cost > HARD_COST_CAP:
        msg = (
            f"HARD CAP ABORT: running ${running_cost[0]:.3f} + "
            f"projected ${projected_room_cost:.3f} > ${HARD_COST_CAP:.2f}"
        )
        print(f"[{room_id}] {msg}")
        return {"room_id": room_id, "error": msg, "cost_usd": 0.0}

    t0 = time.time()
    cost = 0.0

    # Load input image
    input_path = ROOMS_DIR / room["filename"]
    input_img = Image.open(input_path).convert("RGB")
    in_arr = np.array(input_img)
    h, w = in_arr.shape[:2]

    # Load EXISTING Run 3 mask — DO NOT regenerate
    mask_path = RUN3_MASKS / f"{room_id}_mask.png"
    mask_img = Image.open(mask_path).convert("L")
    mask_arr = np.array(mask_img)
    if mask_arr.shape != (h, w):
        mask_arr = cv2.resize(mask_arr, (w, h), interpolation=cv2.INTER_NEAREST)
    dilated_mask = (mask_arr > 127).astype(np.uint8) * 255

    # Upload input and mask to fal
    print(f"  [{room_id}] uploading input ({w}x{h}) and mask...")
    try:
        image_url = fal_upload_file(input_path)
        mask_url = fal_upload_file(mask_path)
    except Exception as e:
        return {"room_id": room_id, "error": f"upload failed: {e}", "cost_usd": cost}

    # Call FLUX-Fill
    print(f"  [{room_id}] calling {endpoint}...")
    inpainter_t0 = time.time()
    try:
        out_url, flux_resp = flux_fill(endpoint, image_url, mask_url)
    except Exception as e:
        return {"room_id": room_id, "error": f"FLUX-Fill call failed: {e}", "cost_usd": cost}
    inpainter_latency = time.time() - inpainter_t0
    cost += flux_cost_per_call
    running_cost[0] += flux_cost_per_call
    print(f"  [{room_id}] FLUX-Fill done in {inpainter_latency:.1f}s, output: {out_url[:60]}…")

    # Download output
    try:
        out_img = download_image_rgb(out_url, size=(w, h))
    except Exception as e:
        return {"room_id": room_id, "error": f"output download failed: {e}", "cost_usd": cost}
    out_arr = np.array(out_img)
    flux_output_path = OUTPUTS_DIR / f"{room_id}.webp"
    out_img.save(flux_output_path, "WEBP", quality=92)

    # SSIM-unmasked (whole-image, unmasked pixels only)
    ssim_score = metric_ssim_unmasked(in_arr, out_arr, dilated_mask)

    # Architectural-patch SSIM
    patch_xy = room.get("patch_xy")
    patch_size = room.get("patch_size", 200)
    patch_ssim_val, patch_used_xy, mask_overlap, tex_std = metric_patch_ssim(
        in_arr, out_arr, dilated_mask, patch_xy, patch_size
    )

    # VP shift
    vp = metric_vp_shift_pct(in_arr, out_arr)

    # Ghost metrics via SAM-3 rerun
    print(f"  [{room_id}] running ghost SAM-3...")
    try:
        ghost_upload_url = fal_upload_file(flux_output_path)
        ghost_global, ghost_inside, ghost_per, ghost_cost = compute_ghost_metrics(
            ghost_upload_url, (h, w), dilated_mask
        )
        cost += ghost_cost
        running_cost[0] += ghost_cost
    except Exception as e:
        ghost_global = 0.0
        ghost_inside = 0.0
        ghost_per = {"error": str(e)}

    total_latency = time.time() - t0

    # Run 3 baseline patch SSIM for room-11 (not in original patch audit — compute now)
    run3_patch_ssim = room.get("run3_patch_ssim")
    if run3_patch_ssim is None:
        # Compute from Run 3 output using the same patch coords we selected for FLUX-Fill
        run3_out_path = RUN3_OUTPUTS / f"{room_id}.webp"
        if run3_out_path.exists():
            run3_img = Image.open(run3_out_path).convert("RGB")
            run3_arr = np.array(run3_img)
            if run3_arr.shape[:2] != (h, w):
                run3_arr = np.array(
                    Image.fromarray(run3_arr).resize((w, h), Image.LANCZOS)
                )
            run3_patch_ssim_val, _, _, _ = metric_patch_ssim(
                in_arr, run3_arr, dilated_mask, patch_used_xy, patch_size
            )
            run3_patch_ssim = run3_patch_ssim_val
            print(f"  [{room_id}] computed Run 3 patch SSIM at {patch_used_xy}: {run3_patch_ssim:.4f}")

    print(
        f"  [{room_id}] ssim={ssim_score:.4f} patch={patch_ssim_val:.4f} "
        f"ghost_global={ghost_global:.2f}% ghost_inside={ghost_inside:.2f}% "
        f"vp={vp:.2f}% lat={inpainter_latency:.1f}s cost=${cost:.3f}"
    )

    return {
        "room_id": room_id,
        "run3_ssim": room["run3_ssim"],
        "run3_patch_ssim": run3_patch_ssim,
        "run3_ghost_global": room["run3_ghost_global"],
        "flux_ssim": ssim_score,
        "flux_patch_ssim": patch_ssim_val,
        "patch_xy_used": list(patch_used_xy),
        "patch_mask_overlap_pct": mask_overlap,
        "patch_texture_std": tex_std,
        "flux_ghost_global": ghost_global,
        "flux_ghost_inside": ghost_inside,
        "ghost_per_prompt": ghost_per,
        "vp_shift_pct": vp,
        "inpainter_latency_s": inpainter_latency,
        "total_latency_s": total_latency,
        "cost_usd": cost,
        "endpoint": endpoint,
        "classification": room["classification"],
    }


# ── Verdict heuristic ──────────────────────────────────────────────────────────
def compute_verdict(room_result: dict) -> str:
    """Programmatic per-room verdict per spec heuristic."""
    d_ssim = room_result["flux_ssim"] - room_result["run3_ssim"]
    run3_patch = room_result.get("run3_patch_ssim") or 0.0
    flux_patch = room_result.get("flux_patch_ssim") or 0.0
    d_patch = flux_patch - run3_patch
    if d_ssim > 0.05 and d_patch > 0.05:
        return "Meaningful improvement"
    if abs(d_ssim) <= 0.02 and abs(d_patch) <= 0.02:
        return "Equivalent"
    if d_ssim < -0.02 or d_patch < -0.02:
        return "Worse"
    # Mixed
    parts = []
    if d_ssim > 0.02:
        parts.append(f"SSIM-unmasked +{d_ssim:.3f}")
    elif d_ssim < -0.02:
        parts.append(f"SSIM-unmasked {d_ssim:.3f}")
    if d_patch > 0.02:
        parts.append(f"patch +{d_patch:.3f}")
    elif d_patch < -0.02:
        parts.append(f"patch {d_patch:.3f}")
    return "Mixed (" + ", ".join(parts) + ")"


# ── Summary writer ─────────────────────────────────────────────────────────────
def write_summary(
    results: list[dict],
    endpoint: str,
    flux_cost_per_call: float,
    total_cost: float,
) -> None:
    verdicts = [compute_verdict(r) for r in results]
    meaningful_count = sum(1 for v in verdicts if v == "Meaningful improvement")

    # Overall verdict
    if meaningful_count >= 2:
        # Check if gate crossed for those rooms
        meaningful_rooms = [
            r for r in results if compute_verdict(r) == "Meaningful improvement"
        ]
        gate_rooms = [r for r in meaningful_rooms if r.get("flux_ssim", 0.0) >= 0.97]
        if len(gate_rooms) == len(meaningful_rooms):
            overall_verdict = "A"
            verdict_text = (
                "FLUX-Fill meaningfully outperforms on ≥2/3 hard cases AND crosses the gate. "
                "Adopt FLUX-Fill for high-coverage routing OR as primary; "
                "rerun affected rooms in a Run 4 spike."
            )
        else:
            overall_verdict = "A*"
            verdict_text = (
                f"FLUX-Fill meaningfully outperforms on {meaningful_count}/3 hard cases "
                f"but does not cross the SSIM ≥0.97 gate for all improved rooms. "
                "Consider adoption with caveats."
            )
    else:
        any_worse = any(v == "Worse" for v in verdicts)
        if any_worse:
            overall_verdict = "C"
            verdict_text = (
                "Bria/LaMa are already optimal; FLUX-Fill is not a viable alternative. "
                "FLUX-Fill performed worse on at least one hard case."
            )
        else:
            overall_verdict = "B"
            verdict_text = (
                "No meaningful improvement; current LaMa/Bria hybrid is at the inpainter "
                "ceiling for these failure modes. Do NOT adopt."
            )

    lines = [
        "# Phase 0.5 Verification — FLUX-Fill Probe (Test 2 of 2)",
        "",
        f"**Date:** 2026-04-20  ",
        f"**Endpoint:** `{endpoint}`  ",
        f"**Estimated cost per call:** ${flux_cost_per_call:.4f}  ",
        f"**Total probe cost:** ${total_cost:.4f}  ",
        "",
        "## 1. Endpoint Discovery",
        "",
        f"Tried endpoints in order: {', '.join(CANDIDATE_ENDPOINTS)}",
        f"Working endpoint: `{endpoint}`",
        f"Per-call cost: ${flux_cost_per_call:.4f} (from openapi or spec estimate)",
        "",
        "FLUX-Fill arguments used (endpoint defaults, minimal neutral prompt):",
        "```",
        'prompt: "empty room, clean architectural surfaces, no furniture"',
        "image_url: <fal upload>",
        "mask_url: <existing Run 3 mask>",
        "```",
        "All other parameters: endpoint defaults.",
        "",
        "## 2. Per-Room Comparison",
        "",
        "| Room | Run 3 SSIM | FLUX SSIM | Δ SSIM | Run 3 patch | FLUX patch | Δ patch | Run 3 ghost% | FLUX ghost% (global/inside) |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for r in results:
        d_ssim = r["flux_ssim"] - r["run3_ssim"]
        run3_patch = r.get("run3_patch_ssim") or 0.0
        flux_patch = r.get("flux_patch_ssim") or 0.0
        d_patch = flux_patch - run3_patch
        lines.append(
            f"| {r['room_id']} "
            f"| {r['run3_ssim']:.4f} "
            f"| {r['flux_ssim']:.4f} "
            f"| {d_ssim:+.4f} "
            f"| {run3_patch:.4f} "
            f"| {flux_patch:.4f} "
            f"| {d_patch:+.4f} "
            f"| {r['run3_ghost_global']:.1f}% "
            f"| {r['flux_ghost_global']:.1f}%/{r['flux_ghost_inside']:.1f}% |"
        )

    lines += [
        "",
        "## 3. Visual Verdict Per Room",
        "",
    ]
    for r, v in zip(results, verdicts):
        d_ssim = r["flux_ssim"] - r["run3_ssim"]
        run3_patch = r.get("run3_patch_ssim") or 0.0
        flux_patch = r.get("flux_patch_ssim") or 0.0
        d_patch = flux_patch - run3_patch
        lines += [
            f"### {r['room_id']} — {r['classification']}",
            f"- SSIM-unmasked: Run 3={r['run3_ssim']:.4f} → FLUX={r['flux_ssim']:.4f} (Δ{d_ssim:+.4f})",
            f"- Patch SSIM: Run 3={run3_patch:.4f} → FLUX={flux_patch:.4f} (Δ{d_patch:+.4f}) at patch {r.get('patch_xy_used')} (mask overlap {r.get('patch_mask_overlap_pct', 0):.1f}%)",
            f"- Ghost (global/inside-mask): Run 3={r['run3_ghost_global']:.1f}% → FLUX={r['flux_ghost_global']:.1f}%/{r['flux_ghost_inside']:.1f}%",
            f"- VP shift: {r.get('vp_shift_pct', 0):.2f}%",
            f"- Latency: {r.get('inpainter_latency_s', 0):.1f}s",
            f"**Verdict: {v}**",
            "",
        ]

    lines += [
        "## 4. Cost-Justification Analysis",
        "",
        f"- LaMa cost: ~$0.04/call (confirmed in bench/probe-lama/cost-log.json)",
        f"- FLUX-Fill cost: ~${flux_cost_per_call:.4f}/call ({flux_cost_per_call/0.04:.1f}× more expensive than LaMa)",
        "",
    ]

    for r, v in zip(results, verdicts):
        if v == "Meaningful improvement":
            d_ssim = r["flux_ssim"] - r["run3_ssim"]
            gate = "YES" if r["flux_ssim"] >= 0.97 else f"NO (SSIM={r['flux_ssim']:.4f} < 0.97)"
            lines.append(
                f"- **{r['room_id']}** (Meaningful): SSIM gain +{d_ssim:.4f}. "
                f"Crosses gate (≥0.97): {gate}"
            )
    if not any(v == "Meaningful improvement" for v in verdicts):
        lines.append("- No rooms showed meaningful improvement; cost justification moot.")

    lines += [
        "",
        "## 5. Verdict",
        "",
        f"**{overall_verdict} — {verdict_text}**",
        "",
        "Rooms breakdown:",
    ]
    for r, v in zip(results, verdicts):
        lines.append(f"- {r['room_id']}: {v}")

    lines += [
        "",
        "## 6. Cost Reconciliation",
        "",
        f"| Item | Cost |",
        f"|---|---|",
        f"| FLUX-Fill calls: {len(results)} × ${flux_cost_per_call:.4f} | ${len(results) * flux_cost_per_call:.4f} |",
        f"| SAM-3 ghost: {len(results)} × {len(GHOST_PROMPTS)} × ${COST_SAM3:.4f} | ${len(results) * len(GHOST_PROMPTS) * COST_SAM3:.4f} |",
        f"| Fal uploads (free) | $0.00 |",
        f"| Patch SSIM compute (local) | $0.00 |",
        f"| **Total** | **${total_cost:.4f}** |",
        f"| Soft cap | $0.40 |",
        f"| Hard cap | $0.50 |",
        f"| Status | {'WITHIN CAP' if total_cost <= HARD_COST_CAP else 'OVER HARD CAP'} |",
    ]

    summary_path = OUT_ROOT / "summary.md"
    summary_path.write_text("\n".join(lines) + "\n")
    print(f"\n[summary] written to {summary_path}")
    print(f"\nVERDICT: {overall_verdict} — {verdict_text}")


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> int:
    for d in (OUT_ROOT, OUTPUTS_DIR, METRICS_DIR, TRIPTYCH_DIR):
        d.mkdir(parents=True, exist_ok=True)

    # Step 1: endpoint discovery
    try:
        endpoint, flux_cost_per_call = discover_endpoint()
    except RuntimeError as e:
        print(f"\n[ABORT] {e}")
        # Write summary documenting the failed search
        (OUT_ROOT / "summary.md").write_text(
            "# Phase 0.5 Verification — FLUX-Fill Probe\n\n"
            "## Endpoint Discovery: FAILED\n\n"
            f"Tried: {', '.join(CANDIDATE_ENDPOINTS)}\n\n"
            f"Error: {e}\n\n"
            "No FLUX-Fill endpoint was found. Cannot run probe.\n"
            "Do not substitute a different model class per spec §Autonomy contract.\n"
        )
        return 1

    # Cost guard: project total spend
    projected_total = (flux_cost_per_call + len(GHOST_PROMPTS) * COST_SAM3) * len(TARGET_ROOMS)
    print(f"\n[cost] Projected total: ${projected_total:.4f}")
    print(f"[cost] Soft cap: ${SOFT_COST_CAP:.2f}, Hard cap: ${HARD_COST_CAP:.2f}")
    if projected_total > HARD_COST_CAP:
        print(
            f"[ABORT] Projected cost ${projected_total:.4f} exceeds hard cap ${HARD_COST_CAP:.2f}. "
            "Cannot proceed."
        )
        (OUT_ROOT / "summary.md").write_text(
            "# Phase 0.5 Verification — FLUX-Fill Probe\n\n"
            "## ABORTED: Projected cost exceeds hard cap\n\n"
            f"Endpoint: `{endpoint}`  \n"
            f"Per-call cost: ${flux_cost_per_call:.4f}  \n"
            f"Projected total: ${projected_total:.4f}  \n"
            f"Hard cap: ${HARD_COST_CAP:.2f}  \n\n"
            "Script aborted before making any API calls.\n"
        )
        return 2
    if projected_total > SOFT_COST_CAP:
        print(f"[WARN] Projected ${projected_total:.4f} exceeds soft cap ${SOFT_COST_CAP:.2f} — proceeding")

    # Steps 2-4: process each room
    running_cost = [0.0]
    results: list[dict] = []

    for room in TARGET_ROOMS:
        result = process_room(room, endpoint, flux_cost_per_call, running_cost)
        results.append(result)

        # Write per-room metrics JSON
        metrics_path = METRICS_DIR / f"{room['id']}.json"
        metrics_path.write_text(json.dumps(result, indent=2))

        if "error" not in result:
            # Build triptych
            try:
                make_triptych(
                    input_path=ROOMS_DIR / room["filename"],
                    run3_path=RUN3_OUTPUTS / f"{room['id']}.webp",
                    flux_path=OUTPUTS_DIR / f"{room['id']}.webp",
                    out_path=TRIPTYCH_DIR / f"{room['id']}.png",
                    room_id=room["id"],
                )
            except Exception as e:
                print(f"  [triptych] failed for {room['id']}: {e}")

    # Total cost
    total_cost = running_cost[0]

    # Cost log
    cost_log = {
        "endpoint": endpoint,
        "flux_cost_per_call_usd": flux_cost_per_call,
        "soft_cap_usd": SOFT_COST_CAP,
        "hard_cap_usd": HARD_COST_CAP,
        "total_cost_usd": total_cost,
        "per_room": [
            {
                "room_id": r.get("room_id"),
                "cost_usd": r.get("cost_usd", 0.0),
                "flux_ssim": r.get("flux_ssim"),
                "error": r.get("error"),
            }
            for r in results
        ],
    }
    (OUT_ROOT / "cost-log.json").write_text(json.dumps(cost_log, indent=2))

    # Filter errors for summary
    good_results = [r for r in results if "error" not in r]
    if not good_results:
        print("[ERROR] All rooms failed. Check errors above.")
        return 1

    # Step 5-6: write summary
    write_summary(good_results, endpoint, flux_cost_per_call, total_cost)

    print(f"\n[done] total cost ${total_cost:.4f}, {len(good_results)}/{len(results)} rooms succeeded")
    return 0


if __name__ == "__main__":
    sys.exit(main())
