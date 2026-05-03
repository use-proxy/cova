#!/usr/bin/env python3
"""Canny ablation test for fal-ai/flux-general.

Tests the hypothesis that canny ControlNet causes silhouette ambiguity
(fan→pendant, tile→terracotta, window→frame) by comparing depth-only,
canny-only, mixed, and no-CN variants.

Source: IMG_01 (tiled bedroom, popcorn ceiling, ceiling fan).

Usage:
    python modal_pipeline/canny_ablation_test.py --dry-run
    python modal_pipeline/canny_ablation_test.py
    python modal_pipeline/canny_ablation_test.py --source-image-url https://...
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import requests

# ---------------------------------------------------------------------------
# Constants (locked across all variants)
# ---------------------------------------------------------------------------

FAL_SYNC_URL = "https://fal.run/fal-ai/flux-general"
FAL_QUEUE_URL = "https://queue.fal.run/fal-ai/flux-general"
FAL_DEPTH_URL = "https://fal.run/fal-ai/imageutils/depth"
FAL_CANNY_URL = "https://fal.run/fal-ai/image-preprocessors/canny"
FAL_UPLOAD_INITIATE = "https://rest.alpha.fal.ai/storage/upload/initiate-multipart"

SYNC_TIMEOUT_S = 120
QUEUE_POLL_INTERVAL_S = 5
QUEUE_MAX_WAIT_S = 300

PROMPT = (
    "cvwmn modern Japandi bedroom, warm wood floors, paper lantern pendant, "
    "minimal furniture, editorial photography"
)
GUIDANCE_SCALE = 3.5
NUM_INFERENCE_STEPS = 28
IMAGE_SIZE = "square_hd"
SEED = 42
LORA_SCALE = 0.65  # production cap (NOT 0.85 from prior tests)

REPO_ROOT = Path(__file__).resolve().parent.parent

IMG01_CANDIDATES = [
    REPO_ROOT / "docs" / "gallery" / "original" / f"IMG_01.{ext}"
    for ext in ("jpg", "jpeg", "png", "webp")
]

ENV_FILE_CANDIDATES = [
    REPO_ROOT / ".env.local",
    REPO_ROOT / ".env",
    REPO_ROOT / "apps" / "web" / ".env.local",
    REPO_ROOT / "apps" / "web" / ".env",
    REPO_ROOT / "modal_pipeline" / ".env",
]


# ---------------------------------------------------------------------------
# Pre-flight: FAL_KEY
# ---------------------------------------------------------------------------


def _resolve_fal_key() -> str:
    key = os.environ.get("FAL_KEY")
    if key:
        print("FAL_KEY resolved from: environment variable")
        return key

    for path in ENV_FILE_CANDIDATES:
        if not path.exists():
            continue
        try:
            text = path.read_text()
            for line in text.splitlines():
                stripped = line.strip()
                if stripped.startswith("#"):
                    continue
                match = re.match(r"^FAL_KEY\s*=\s*(.+)$", stripped)
                if match:
                    val = match.group(1).strip().strip("'\"")
                    if val:
                        print(f"FAL_KEY resolved from: {path}")
                        return val
        except OSError:
            continue

    checked = "env, " + ", ".join(str(p) for p in ENV_FILE_CANDIDATES)
    print(f"FAL_KEY not found. Checked: {checked}. Set FAL_KEY=... and re-run.")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Pre-flight: source image
# ---------------------------------------------------------------------------


def _resolve_source_image(cli_url: str | None) -> str:
    if cli_url:
        print(f"Source image: CLI override URL")
        return cli_url

    for path in IMG01_CANDIDATES:
        if path.exists():
            data = path.read_bytes()
            size_kb = len(data) / 1024
            ext = path.suffix.lstrip(".")
            if ext == "jpg":
                ext = "jpeg"
            b64 = base64.b64encode(data).decode("ascii")
            data_url = f"data:image/{ext};base64,{b64}"
            print(f"Source image: {path} ({size_kb:.1f} KB, encoded as data URL)")
            return data_url

    print("Source image not found. Checked:")
    for p in IMG01_CANDIDATES:
        print(f"  {p}")
    sys.exit(1)


def _upload_to_fal_storage(image_path: Path, fal_key: str) -> str:
    ext = image_path.suffix.lstrip(".")
    mime = f"image/{ext}" if ext != "jpg" else "image/jpeg"
    data = image_path.read_bytes()

    resp = requests.post(
        FAL_UPLOAD_INITIATE,
        headers={
            "Authorization": f"Key {fal_key}",
            "Content-Type": "application/json",
        },
        json={"content_type": mime, "file_name": image_path.name},
        timeout=30,
    )
    resp.raise_for_status()
    info = resp.json()
    upload_url = info["upload_url"]
    file_url = info["file_url"]

    requests.put(
        upload_url,
        data=data,
        headers={"Content-Type": mime},
        timeout=60,
    ).raise_for_status()

    print(f"Uploaded to fal storage: {file_url}")
    return file_url


# ---------------------------------------------------------------------------
# Parse LORA_REGISTRY from redesign.py
# ---------------------------------------------------------------------------


def _parse_lora_registry() -> dict[str, Any]:
    redesign_path = REPO_ROOT / "modal_pipeline" / "redesign.py"
    if not redesign_path.exists():
        print(f"ERROR: {redesign_path} not found")
        sys.exit(1)

    text = redesign_path.read_text()
    pattern = r'"COVAJAPANDI"\s*:\s*\{([^}]+)\}'
    match = re.search(pattern, text)
    if not match:
        reg_start = text.find("LORA_REGISTRY")
        if reg_start >= 0:
            block_end = text.find("\n}", reg_start)
            print("Could not parse COVAJAPANDI. LORA_REGISTRY block:")
            print(text[reg_start : block_end + 2])
        else:
            print("LORA_REGISTRY not found in redesign.py")
        sys.exit(1)

    block = match.group(1)
    url_match = re.search(r'"url"\s*:\s*"([^"]+)"', block)
    trigger_match = re.search(r'"trigger"\s*:\s*"([^"]+)"', block)

    if not url_match:
        print(f"Could not extract LoRA URL from COVAJAPANDI block:\n{block}")
        sys.exit(1)

    url = url_match.group(1)
    trigger = trigger_match.group(1) if trigger_match else None

    print(f"COVAJAPANDI LoRA URL: {url[:80]}...")
    if trigger:
        print(f"COVAJAPANDI trigger: {trigger}")

    return {"url": url, "trigger": trigger}


# ---------------------------------------------------------------------------
# Depth + Canny preprocessing
# ---------------------------------------------------------------------------


def _generate_depth(image_url: str, fal_key: str) -> str | None:
    print("\n--- Generating depth map ---")
    try:
        resp = requests.post(
            FAL_DEPTH_URL,
            headers={
                "Authorization": f"Key {fal_key}",
                "Content-Type": "application/json",
            },
            json={"image_url": image_url},
            timeout=120,
        )
        if resp.status_code != 200:
            print(f"Depth generation failed: {resp.status_code} {resp.text[:300]}")
            return None
        data = resp.json()
        url = (data.get("image") or {}).get("url")
        if url:
            print(f"Depth URL: {url[:80]}...")
        else:
            print(f"Depth response missing image URL: {list(data.keys())}")
        return url
    except Exception as exc:
        print(f"Depth generation error: {exc}")
        return None


def _generate_canny(image_url: str, fal_key: str) -> str | None:
    print("\n--- Generating canny map ---")
    try:
        resp = requests.post(
            FAL_CANNY_URL,
            headers={
                "Authorization": f"Key {fal_key}",
                "Content-Type": "application/json",
            },
            json={
                "image_url": image_url,
                "low_threshold": 50,
                "high_threshold": 150,
            },
            timeout=120,
        )
        if resp.status_code != 200:
            print(f"Canny generation failed: {resp.status_code} {resp.text[:300]}")
            return None
        data = resp.json()
        url = (data.get("image") or {}).get("url") or data.get("image_url")
        if url:
            print(f"Canny URL: {url[:80]}...")
        else:
            print(f"Canny response missing image URL: {list(data.keys())}")
        return url
    except Exception as exc:
        print(f"Canny generation error: {exc}")
        return None


# ---------------------------------------------------------------------------
# fal API call (sync with queue fallback)
# ---------------------------------------------------------------------------


def _call_fal(
    payload: dict[str, Any],
    fal_key: str,
    endpoint_sync: str = FAL_SYNC_URL,
    endpoint_queue: str = FAL_QUEUE_URL,
) -> dict[str, Any]:
    headers = {
        "Authorization": f"Key {fal_key}",
        "Content-Type": "application/json",
    }

    try:
        resp = requests.post(
            endpoint_sync,
            headers=headers,
            json=payload,
            timeout=SYNC_TIMEOUT_S,
        )
        return {
            "status_code": resp.status_code,
            "body": resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {"raw": resp.text},
            "elapsed_s": resp.elapsed.total_seconds(),
            "mode": "sync",
        }
    except requests.exceptions.Timeout:
        print("  Sync timed out, falling back to queue...")
    except requests.exceptions.ConnectionError as exc:
        print(f"  Sync connection error ({exc}), falling back to queue...")

    resp = requests.post(
        endpoint_queue,
        headers=headers,
        json=payload,
        timeout=30,
    )
    if resp.status_code != 200:
        return {
            "status_code": resp.status_code,
            "body": resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {"raw": resp.text},
            "elapsed_s": resp.elapsed.total_seconds(),
            "mode": "queue_submit_failed",
        }

    queue_data = resp.json()
    request_id = queue_data.get("request_id")
    status_url = queue_data.get("status_url") or f"https://queue.fal.run/fal-ai/flux-general/requests/{request_id}/status"
    result_url = queue_data.get("response_url") or f"https://queue.fal.run/fal-ai/flux-general/requests/{request_id}"

    print(f"  Queue request_id: {request_id}")

    t0 = time.monotonic()
    while time.monotonic() - t0 < QUEUE_MAX_WAIT_S:
        time.sleep(QUEUE_POLL_INTERVAL_S)
        try:
            st = requests.get(status_url, headers=headers, timeout=15).json()
            status = st.get("status", "UNKNOWN")
            print(f"  Queue status: {status}")
            if status == "COMPLETED":
                result_resp = requests.get(result_url, headers=headers, timeout=30)
                return {
                    "status_code": result_resp.status_code,
                    "body": result_resp.json(),
                    "elapsed_s": time.monotonic() - t0,
                    "mode": "queue",
                }
            if status in ("FAILED", "CANCELLED"):
                return {
                    "status_code": 500,
                    "body": st,
                    "elapsed_s": time.monotonic() - t0,
                    "mode": "queue_failed",
                }
        except Exception as exc:
            print(f"  Queue poll error: {exc}")

    return {
        "status_code": 504,
        "body": {"error": "queue_timeout", "request_id": request_id},
        "elapsed_s": time.monotonic() - t0,
        "mode": "queue_timeout",
    }


# ---------------------------------------------------------------------------
# Download result image
# ---------------------------------------------------------------------------


def _download_image(url: str, dest: Path) -> bool:
    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
        print(f"  Saved: {dest.name} ({len(resp.content) / 1024:.0f} KB)")
        return True
    except Exception as exc:
        print(f"  Download failed: {exc}")
        return False


# ---------------------------------------------------------------------------
# Variant builders — 6 variants testing the canny hypothesis
# ---------------------------------------------------------------------------


def _build_v1_depth_only(
    image_url: str, depth_url: str, lora_url: str,
) -> dict[str, Any]:
    """T1.V1: Depth ONLY, conditioning_scale=0.6, end_percentage=1.0"""
    return {
        "image_url": image_url,
        "prompt": PROMPT,
        "guidance_scale": GUIDANCE_SCALE,
        "num_inference_steps": NUM_INFERENCE_STEPS,
        "image_size": IMAGE_SIZE,
        "seed": SEED,
        "output_format": "jpeg",
        "enable_safety_checker": False,
        "loras": [{"path": lora_url, "scale": LORA_SCALE}],
        "controlnet_unions": [
            {
                "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                "controls": [
                    {
                        "control_image_url": depth_url,
                        "control_mode": "depth",
                        "conditioning_scale": 0.6,
                        "end_percentage": 1.0,
                    },
                ],
            }
        ],
    }


def _build_v2_depth_early_release(
    image_url: str, depth_url: str, lora_url: str,
) -> dict[str, Any]:
    """T1.V2: Depth ONLY, conditioning_scale=0.5, end_percentage=0.6
    Depth releases at step ~17/28, LoRA finishes alone."""
    return {
        "image_url": image_url,
        "prompt": PROMPT,
        "guidance_scale": GUIDANCE_SCALE,
        "num_inference_steps": NUM_INFERENCE_STEPS,
        "image_size": IMAGE_SIZE,
        "seed": SEED,
        "output_format": "jpeg",
        "enable_safety_checker": False,
        "loras": [{"path": lora_url, "scale": LORA_SCALE}],
        "controlnet_unions": [
            {
                "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                "controls": [
                    {
                        "control_image_url": depth_url,
                        "control_mode": "depth",
                        "conditioning_scale": 0.5,
                        "end_percentage": 0.6,
                    },
                ],
            }
        ],
    }


def _build_v3_depth_weak_canny(
    image_url: str, depth_url: str, canny_url: str, lora_url: str,
) -> dict[str, Any]:
    """T1.V3: Depth+Canny, conditioning_scale=0.6/0.3, end_percentage=1.0
    Canny present but weak — does some canny help?"""
    return {
        "image_url": image_url,
        "prompt": PROMPT,
        "guidance_scale": GUIDANCE_SCALE,
        "num_inference_steps": NUM_INFERENCE_STEPS,
        "image_size": IMAGE_SIZE,
        "seed": SEED,
        "output_format": "jpeg",
        "enable_safety_checker": False,
        "loras": [{"path": lora_url, "scale": LORA_SCALE}],
        "controlnet_unions": [
            {
                "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                "controls": [
                    {
                        "control_image_url": depth_url,
                        "control_mode": "depth",
                        "conditioning_scale": 0.6,
                        "end_percentage": 1.0,
                    },
                    {
                        "control_image_url": canny_url,
                        "control_mode": "canny",
                        "conditioning_scale": 0.3,
                        "end_percentage": 1.0,
                    },
                ],
            }
        ],
    }


def _build_v4_both_early_release(
    image_url: str, depth_url: str, canny_url: str, lora_url: str,
) -> dict[str, Any]:
    """T1.V4: Depth+Canny, conditioning_scale=0.5/0.5, end_percentage=0.4
    Both CN release at step ~11/28 — research's recommended profile."""
    return {
        "image_url": image_url,
        "prompt": PROMPT,
        "guidance_scale": GUIDANCE_SCALE,
        "num_inference_steps": NUM_INFERENCE_STEPS,
        "image_size": IMAGE_SIZE,
        "seed": SEED,
        "output_format": "jpeg",
        "enable_safety_checker": False,
        "loras": [{"path": lora_url, "scale": LORA_SCALE}],
        "controlnet_unions": [
            {
                "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                "controls": [
                    {
                        "control_image_url": depth_url,
                        "control_mode": "depth",
                        "conditioning_scale": 0.5,
                        "end_percentage": 0.4,
                    },
                    {
                        "control_image_url": canny_url,
                        "control_mode": "canny",
                        "conditioning_scale": 0.5,
                        "end_percentage": 0.4,
                    },
                ],
            }
        ],
    }


def _build_v5_canny_only(
    image_url: str, canny_url: str, lora_url: str,
) -> dict[str, Any]:
    """T1.V5: Canny ONLY, conditioning_scale=0.5, end_percentage=1.0
    Opposite extreme — canny without depth."""
    return {
        "image_url": image_url,
        "prompt": PROMPT,
        "guidance_scale": GUIDANCE_SCALE,
        "num_inference_steps": NUM_INFERENCE_STEPS,
        "image_size": IMAGE_SIZE,
        "seed": SEED,
        "output_format": "jpeg",
        "enable_safety_checker": False,
        "loras": [{"path": lora_url, "scale": LORA_SCALE}],
        "controlnet_unions": [
            {
                "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                "controls": [
                    {
                        "control_image_url": canny_url,
                        "control_mode": "canny",
                        "conditioning_scale": 0.5,
                        "end_percentage": 1.0,
                    },
                ],
            }
        ],
    }


def _build_v6_no_cn(
    image_url: str, lora_url: str,
) -> dict[str, Any]:
    """T1.V6: No CN at all, just LoRA + img2img at strength=0.7
    Floor for comparison — what does LoRA alone produce?"""
    return {
        "image_url": image_url,
        "prompt": PROMPT,
        "guidance_scale": GUIDANCE_SCALE,
        "num_inference_steps": NUM_INFERENCE_STEPS,
        "image_size": IMAGE_SIZE,
        "seed": SEED,
        "strength": 0.7,
        "output_format": "jpeg",
        "enable_safety_checker": False,
        "loras": [{"path": lora_url, "scale": LORA_SCALE}],
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


VARIANT_DEFS = [
    ("V1", "Depth only, scale=0.6, end=1.0"),
    ("V2", "Depth only, scale=0.5, end=0.6"),
    ("V3", "Depth+Canny, scale=0.6/0.3, end=1.0"),
    ("V4", "Depth+Canny, scale=0.5/0.5, end=0.4"),
    ("V5", "Canny only, scale=0.5, end=1.0"),
    ("V6", "No CN, LoRA+img2img strength=0.7"),
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Canny ablation test")
    parser.add_argument("--source-image-url", type=str, default=None)
    parser.add_argument("--output-dir", type=str, default=None)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print all 6 variant payloads as JSON and exit without API calls",
    )
    args = parser.parse_args()

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = (
        Path(args.output_dir)
        if args.output_dir
        else (REPO_ROOT / "docs" / "debug" / f"canny_ablation_{ts}")
    )
    results_dir = output_dir / "results"
    results_dir.mkdir(parents=True, exist_ok=True)
    print(f"Output dir: {output_dir}")
    print(f"Results dir: {results_dir}\n")

    # Pre-flight
    fal_key = None if args.dry_run else _resolve_fal_key()
    source_url = _resolve_source_image(args.source_image_url)
    lora_info = _parse_lora_registry()
    lora_url = lora_info["url"]

    print(f"\nLocked constants:")
    print(f"  PROMPT: {PROMPT}")
    print(f"  GUIDANCE_SCALE: {GUIDANCE_SCALE}")
    print(f"  NUM_INFERENCE_STEPS: {NUM_INFERENCE_STEPS}")
    print(f"  IMAGE_SIZE: {IMAGE_SIZE}")
    print(f"  SEED: {SEED}")
    print(f"  LORA_SCALE: {LORA_SCALE}")

    # ---------------------------------------------------------------------------
    # Dry-run: placeholders, no API calls
    # ---------------------------------------------------------------------------
    if args.dry_run:
        PH_DEPTH = "https://placeholder.invalid/depth.png"
        PH_CANNY = "https://placeholder.invalid/canny.png"

        payloads = [
            _build_v1_depth_only(source_url, PH_DEPTH, lora_url),
            _build_v2_depth_early_release(source_url, PH_DEPTH, lora_url),
            _build_v3_depth_weak_canny(source_url, PH_DEPTH, PH_CANNY, lora_url),
            _build_v4_both_early_release(source_url, PH_DEPTH, PH_CANNY, lora_url),
            _build_v5_canny_only(source_url, PH_CANNY, lora_url),
            _build_v6_no_cn(source_url, lora_url),
        ]

        for (tag, name), payload in zip(VARIANT_DEFS, payloads):
            display = json.loads(json.dumps(payload))
            if isinstance(display.get("image_url"), str) and display["image_url"].startswith("data:"):
                display["image_url"] = display["image_url"][:60] + "...<data_url_truncated>"
            print(f"\n{'='*70}")
            print(f"T1.{tag}: {name}")
            print(f"{'='*70}")
            print(json.dumps(display, indent=2))

        print(f"\n{'='*70}")
        print("DRY-RUN complete. No fal API calls made. Exit 0.")
        print(f"{'='*70}")
        sys.exit(0)

    # ---------------------------------------------------------------------------
    # Real run: preprocess, then run all 6 variants
    # ---------------------------------------------------------------------------

    preprocess_url = source_url
    used_fal_upload = False

    # Generate depth map
    depth_url = _generate_depth(preprocess_url, fal_key)
    if depth_url is None and not used_fal_upload and source_url.startswith("data:"):
        print("Depth failed with data URL -- uploading to fal storage...")
        for path in IMG01_CANDIDATES:
            if path.exists():
                preprocess_url = _upload_to_fal_storage(path, fal_key)
                used_fal_upload = True
                break
        depth_url = _generate_depth(preprocess_url, fal_key)

    if depth_url is None:
        print("\nFATAL: Could not generate depth map. Cannot proceed.")
        sys.exit(1)

    # Generate canny map
    canny_url = _generate_canny(preprocess_url, fal_key)
    if canny_url is None and not used_fal_upload and source_url.startswith("data:"):
        print("Canny failed with data URL -- uploading to fal storage...")
        for path in IMG01_CANDIDATES:
            if path.exists():
                preprocess_url = _upload_to_fal_storage(path, fal_key)
                used_fal_upload = True
                break
        canny_url = _generate_canny(preprocess_url, fal_key)

    if canny_url is None:
        print("\nFATAL: Could not generate canny map. Cannot proceed.")
        sys.exit(1)

    # Save original image
    for path in IMG01_CANDIDATES:
        if path.exists():
            import shutil
            shutil.copy2(path, results_dir / "00_original.jpg")
            print(f"\nCopied original to: {results_dir / '00_original.jpg'}")
            break

    # Use uploaded URL for generation if needed
    gen_url = preprocess_url if used_fal_upload else source_url

    # Build all 6 variant payloads
    payloads = [
        _build_v1_depth_only(gen_url, depth_url, lora_url),
        _build_v2_depth_early_release(gen_url, depth_url, lora_url),
        _build_v3_depth_weak_canny(gen_url, depth_url, canny_url, lora_url),
        _build_v4_both_early_release(gen_url, depth_url, canny_url, lora_url),
        _build_v5_canny_only(gen_url, canny_url, lora_url),
        _build_v6_no_cn(gen_url, lora_url),
    ]

    results: list[dict[str, Any]] = []

    for (tag, name), payload in zip(VARIANT_DEFS, payloads):
        print(f"\n{'='*70}")
        print(f"=== T1.{tag}: {name} ===")
        print(f"{'='*70}")

        # Print payload (redact data URLs)
        display = json.loads(json.dumps(payload))
        if isinstance(display.get("image_url"), str) and display["image_url"].startswith("data:"):
            display["image_url"] = display["image_url"][:60] + "...<truncated>"
        print(json.dumps(display, indent=2))

        t0 = time.monotonic()
        entry: dict[str, Any] = {"variant": tag, "name": name}

        try:
            resp = _call_fal(payload, fal_key)
            elapsed = resp["elapsed_s"]
            status = resp["status_code"]
            body = resp["body"]

            entry["status_code"] = status
            entry["elapsed_s"] = round(elapsed, 2)
            entry["mode"] = resp["mode"]

            if 200 <= status < 300:
                imgs = body.get("images") or []
                img_url = None
                if imgs:
                    first = imgs[0]
                    if isinstance(first, dict):
                        img_url = first.get("url")
                    elif isinstance(first, str):
                        img_url = first
                if not img_url:
                    img_obj = body.get("image")
                    if isinstance(img_obj, dict):
                        img_url = img_obj.get("url")

                print(f"\nPASS  |  image: {img_url}")
                print(f"  elapsed: {elapsed:.1f}s  mode: {resp['mode']}")
                entry["result"] = "PASS"
                entry["image_url"] = img_url

                # Download result image
                if img_url:
                    _download_image(
                        img_url,
                        results_dir / f"T1_{tag}.jpg",
                    )
            else:
                print(f"\nFAIL  |  status: {status}")
                print(f"  elapsed: {elapsed:.1f}s  mode: {resp['mode']}")
                print(f"  response body:")
                print(json.dumps(body, indent=2))
                entry["result"] = "FAIL"
                entry["response"] = body

        except Exception as exc:
            import traceback
            elapsed = time.monotonic() - t0
            tb = traceback.format_exc()
            print(f"\nERROR  |  {type(exc).__name__}: {exc}")
            print(f"  elapsed: {elapsed:.1f}s")
            entry["result"] = "ERROR"
            entry["error"] = str(exc)
            entry["elapsed_s"] = round(elapsed, 2)

        # Save per-variant JSON
        save_entry = json.loads(json.dumps(entry, default=str))
        out_path = output_dir / f"T1_{tag}.json"
        out_path.write_text(json.dumps(save_entry, indent=2, default=str))

        results.append(entry)

    # ---------------------------------------------------------------------------
    # Summary table
    # ---------------------------------------------------------------------------

    print(f"\n\n{'='*90}")
    print("SUMMARY TABLE — Track 1 Canny Ablation")
    print(f"{'='*90}")
    print(
        f"{'Variant':<10} {'CN Mode':<28} {'Depth':<8} {'Canny':<8} "
        f"{'end%':<8} {'Result':<8} {'Time':<8}"
    )
    print("-" * 90)

    cn_desc = {
        "V1": ("Depth only",          "0.6", "-",   "1.0"),
        "V2": ("Depth only (release)", "0.5", "-",   "0.6"),
        "V3": ("Depth+weak Canny",     "0.6", "0.3", "1.0"),
        "V4": ("Both early release",   "0.5", "0.5", "0.4"),
        "V5": ("Canny only",           "-",   "0.5", "1.0"),
        "V6": ("No CN (img2img 0.7)",  "-",   "-",   "-"),
    }

    for r in results:
        tag = r["variant"]
        desc, d_s, c_s, end = cn_desc[tag]
        result = r.get("result", "?")
        elapsed = f"{r.get('elapsed_s', 0):.1f}s"
        print(
            f"T1.{tag:<7} {desc:<28} {d_s:<8} {c_s:<8} "
            f"{end:<8} {result:<8} {elapsed}"
        )

    print(f"\nAll LoRA scale: {LORA_SCALE} | Seed: {SEED} | Steps: {NUM_INFERENCE_STEPS}")
    print(f"Results saved to: {results_dir}")
    print(f"\nTRACK 1 COMPLETE -- awaiting review.")


if __name__ == "__main__":
    main()
