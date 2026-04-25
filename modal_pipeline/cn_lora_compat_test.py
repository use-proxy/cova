#!/usr/bin/env python3
"""CN + LoRA compatibility test for fal-ai/flux-general.

Standalone diagnostic — runs locally, calls fal REST API directly.
Tests whether ControlNet Union + LoRAs can coexist in a single call.

Usage:
    python modal_pipeline/cn_lora_compat_test.py
    python modal_pipeline/cn_lora_compat_test.py --source-image-url https://...
    python modal_pipeline/cn_lora_compat_test.py --output-dir /tmp/test
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
# Constants
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

# Repo root (this script lives in modal_pipeline/)
REPO_ROOT = Path(__file__).resolve().parent.parent

# Paths to check for source image
IMG01_CANDIDATES = [
    REPO_ROOT / "docs" / "gallery" / "original" / f"IMG_01.{ext}"
    for ext in ("jpg", "jpeg", "png", "webp")
]

# Paths to check for FAL_KEY
ENV_FILE_CANDIDATES = [
    REPO_ROOT / ".env.local",
    REPO_ROOT / ".env",
    REPO_ROOT / "apps" / "web" / ".env.local",
    REPO_ROOT / "apps" / "web" / ".env",
    REPO_ROOT / "modal_pipeline" / ".env",
]


# ---------------------------------------------------------------------------
# Pre-flight A: Resolve FAL_KEY
# ---------------------------------------------------------------------------


def _resolve_fal_key() -> str:
    # 1. Environment variable
    key = os.environ.get("FAL_KEY")
    if key:
        print(f"FAL_KEY resolved from: environment variable")
        return key

    # 2. Walk .env files
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

    # 3. Fail
    checked = "env, " + ", ".join(str(p) for p in ENV_FILE_CANDIDATES)
    print(
        f"FAL_KEY not found. Checked: {checked}. "
        f"Set FAL_KEY=... and re-run."
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Pre-flight B: Resolve source image
# ---------------------------------------------------------------------------


def _resolve_source_image(cli_url: str | None) -> str:
    """Returns image URL (remote or data URL)."""
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
    """Fallback: upload file to fal storage if data URLs fail."""
    ext = image_path.suffix.lstrip(".")
    mime = f"image/{ext}" if ext != "jpg" else "image/jpeg"
    data = image_path.read_bytes()

    # Initiate upload
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

    # Upload bytes
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
    """Extract COVAJAPANDI entry from LORA_REGISTRY in redesign.py."""
    redesign_path = REPO_ROOT / "modal_pipeline" / "redesign.py"
    if not redesign_path.exists():
        print(f"ERROR: {redesign_path} not found")
        sys.exit(1)

    text = redesign_path.read_text()

    # Find the COVAJAPANDI block
    pattern = r'"COVAJAPANDI"\s*:\s*\{([^}]+)\}'
    match = re.search(pattern, text)
    if not match:
        # Print the LORA_REGISTRY block for manual inspection
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
    """Generate depth map via fal API."""
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
    """Generate canny edge map via fal API."""
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
) -> dict[str, Any]:
    """Call fal-ai/flux-general sync, fall back to queue on timeout."""
    headers = {
        "Authorization": f"Key {fal_key}",
        "Content-Type": "application/json",
    }

    # Try sync first
    try:
        resp = requests.post(
            FAL_SYNC_URL,
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

    # Queue fallback
    resp = requests.post(
        FAL_QUEUE_URL,
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
# Variant builders
# ---------------------------------------------------------------------------


def _build_variant_a(
    image_url: str,
    depth_url: str,
    canny_url: str,
    lora_url: str,
) -> dict[str, Any]:
    """CN Union (depth+canny) + LoRA at 0.85"""
    return {
        "image_url": image_url,
        "prompt": PROMPT,
        "guidance_scale": GUIDANCE_SCALE,
        "num_inference_steps": NUM_INFERENCE_STEPS,
        "image_size": IMAGE_SIZE,
        "seed": SEED,
        "output_format": "jpeg",
        "enable_safety_checker": False,
        "loras": [{"path": lora_url, "scale": 0.85}],
        "controlnet_unions": [
            {
                "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                "controls": [
                    {
                        "control_image_url": depth_url,
                        "control_mode": "depth",
                        "conditioning_scale": 0.60,
                    },
                    {
                        "control_image_url": canny_url,
                        "control_mode": "canny",
                        "conditioning_scale": 0.50,
                    },
                ],
            }
        ],
    }


def _build_variant_b(
    image_url: str,
    depth_url: str,
    canny_url: str,
) -> dict[str, Any]:
    """CN Union (depth+canny), NO LoRA"""
    return {
        "image_url": image_url,
        "prompt": PROMPT,
        "guidance_scale": GUIDANCE_SCALE,
        "num_inference_steps": NUM_INFERENCE_STEPS,
        "image_size": IMAGE_SIZE,
        "seed": SEED,
        "output_format": "jpeg",
        "enable_safety_checker": False,
        "controlnet_unions": [
            {
                "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                "controls": [
                    {
                        "control_image_url": depth_url,
                        "control_mode": "depth",
                        "conditioning_scale": 0.60,
                    },
                    {
                        "control_image_url": canny_url,
                        "control_mode": "canny",
                        "conditioning_scale": 0.50,
                    },
                ],
            }
        ],
    }


def _build_variant_c(
    image_url: str,
    lora_url: str,
) -> dict[str, Any]:
    """LoRA at 0.85, NO ControlNet"""
    return {
        "image_url": image_url,
        "prompt": PROMPT,
        "guidance_scale": GUIDANCE_SCALE,
        "num_inference_steps": NUM_INFERENCE_STEPS,
        "image_size": IMAGE_SIZE,
        "seed": SEED,
        "output_format": "jpeg",
        "enable_safety_checker": False,
        "loras": [{"path": lora_url, "scale": 0.85}],
    }


def _build_variant_d(
    image_url: str,
    canny_url: str,
    lora_url: str,
) -> dict[str, Any]:
    """Single ControlNet (canny only, NOT Union) + LoRA at 0.85"""
    return {
        "image_url": image_url,
        "prompt": PROMPT,
        "guidance_scale": GUIDANCE_SCALE,
        "num_inference_steps": NUM_INFERENCE_STEPS,
        "image_size": IMAGE_SIZE,
        "seed": SEED,
        "output_format": "jpeg",
        "enable_safety_checker": False,
        "loras": [{"path": lora_url, "scale": 0.85}],
        "controlnets": [
            {
                "path": "InstantX/FLUX.1-dev-Controlnet-Canny",
                "control_image_url": canny_url,
                "conditioning_scale": 0.50,
            }
        ],
    }


def _build_variant_e(
    image_url: str,
    depth_url: str,
    canny_url: str,
    lora_url: str,
) -> dict[str, Any]:
    """CN Union (depth+canny) + LoRA at 0.30"""
    return {
        "image_url": image_url,
        "prompt": PROMPT,
        "guidance_scale": GUIDANCE_SCALE,
        "num_inference_steps": NUM_INFERENCE_STEPS,
        "image_size": IMAGE_SIZE,
        "seed": SEED,
        "output_format": "jpeg",
        "enable_safety_checker": False,
        "loras": [{"path": lora_url, "scale": 0.30}],
        "controlnet_unions": [
            {
                "path": "InstantX/FLUX.1-dev-Controlnet-Union",
                "controls": [
                    {
                        "control_image_url": depth_url,
                        "control_mode": "depth",
                        "conditioning_scale": 0.60,
                    },
                    {
                        "control_image_url": canny_url,
                        "control_mode": "canny",
                        "conditioning_scale": 0.50,
                    },
                ],
            }
        ],
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="CN + LoRA compatibility test")
    parser.add_argument("--source-image-url", type=str, default=None)
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print all 5 variant payloads as JSON and exit without API calls",
    )
    args = parser.parse_args()

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = Path(args.output_dir) if args.output_dir else (REPO_ROOT / "docs" / "debug" / f"cn_lora_test_{ts}")
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"Output dir: {output_dir}\n")

    # Pre-flight A: FAL_KEY (skip for dry-run — no API calls needed)
    fal_key = None if args.dry_run else _resolve_fal_key()

    # Pre-flight B: source image
    source_url = _resolve_source_image(args.source_image_url)

    # Parse LoRA registry
    lora_info = _parse_lora_registry()
    lora_url = lora_info["url"]

    # ---------------------------------------------------------------------------
    # Dry-run mode: use placeholders, skip all fal API calls
    # ---------------------------------------------------------------------------
    if args.dry_run:
        PLACEHOLDER_DEPTH = "https://placeholder.invalid/depth.png"
        PLACEHOLDER_CANNY = "https://placeholder.invalid/canny.png"
        # Truncate data URLs for display
        display_source = source_url
        if display_source.startswith("data:"):
            display_source = display_source[:60] + "...<data_url_truncated>"

        variants: list[tuple[str, str, dict[str, Any]]] = [
            ("A", "CN Union (d+c) + LoRA 0.85", _build_variant_a(source_url, PLACEHOLDER_DEPTH, PLACEHOLDER_CANNY, lora_url)),
            ("B", "CN Union (d+c), no LoRA", _build_variant_b(source_url, PLACEHOLDER_DEPTH, PLACEHOLDER_CANNY)),
            ("C", "LoRA 0.85, no CN", _build_variant_c(source_url, lora_url)),
            ("D", "Single CN (canny) + LoRA 0.85", _build_variant_d(source_url, PLACEHOLDER_CANNY, lora_url)),
            ("E", "CN Union (d+c) + LoRA 0.30", _build_variant_e(source_url, PLACEHOLDER_DEPTH, PLACEHOLDER_CANNY, lora_url)),
        ]

        for letter, name, payload in variants:
            display_payload = json.loads(json.dumps(payload))
            # Truncate data URLs for readability
            for key in ("image_url",):
                if isinstance(display_payload.get(key), str) and display_payload[key].startswith("data:"):
                    display_payload[key] = display_payload[key][:60] + "...<data_url_truncated>"
            print(f"\n{'='*60}")
            print(f"Variant {letter}: {name}")
            print(f"{'='*60}")
            print(json.dumps(display_payload, indent=2))

        print(f"\n{'='*60}")
        print("DRY-RUN complete. No fal API calls made. Exit 0.")
        print(f"{'='*60}")
        sys.exit(0)

    # ---------------------------------------------------------------------------
    # Real run: generate depth + canny via fal, then run all variants
    # ---------------------------------------------------------------------------
    preprocess_url = source_url
    used_fal_upload = False

    # Generate depth map
    depth_url = _generate_depth(preprocess_url, fal_key)
    if depth_url is None and not used_fal_upload and source_url.startswith("data:"):
        print("Depth failed with data URL — uploading to fal storage as fallback...")
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
        print("Canny failed with data URL — uploading to fal storage as fallback...")
        for path in IMG01_CANDIDATES:
            if path.exists():
                preprocess_url = _upload_to_fal_storage(path, fal_key)
                used_fal_upload = True
                break
        canny_url = _generate_canny(preprocess_url, fal_key)

    if canny_url is None:
        print("\nFATAL: Could not generate canny map. Cannot proceed.")
        sys.exit(1)

    # Use the uploaded URL for flux-general calls too (if we had to upload)
    gen_url = preprocess_url if used_fal_upload else source_url

    # Build variants
    variants: list[tuple[str, str, dict[str, Any]]] = [
        ("A", "CN Union (d+c) + LoRA 0.85", _build_variant_a(gen_url, depth_url, canny_url, lora_url)),
        ("B", "CN Union (d+c), no LoRA", _build_variant_b(gen_url, depth_url, canny_url)),
        ("C", "LoRA 0.85, no CN", _build_variant_c(gen_url, lora_url)),
        ("D", "Single CN (canny) + LoRA 0.85", _build_variant_d(gen_url, canny_url, lora_url)),
        ("E", "CN Union (d+c) + LoRA 0.30", _build_variant_e(gen_url, depth_url, canny_url, lora_url)),
    ]

    results: list[dict[str, Any]] = []

    for letter, name, payload in variants:
        print(f"\n{'='*60}")
        print(f"=== Variant {letter}: {name} ===")
        print(f"{'='*60}")

        # Print payload (redact data URLs for readability)
        display_payload = json.loads(json.dumps(payload))
        if isinstance(display_payload.get("image_url"), str) and display_payload["image_url"].startswith("data:"):
            display_payload["image_url"] = display_payload["image_url"][:60] + "...<truncated>"
        print(json.dumps(display_payload, indent=2))

        t0 = time.monotonic()
        result_entry: dict[str, Any] = {
            "variant": letter,
            "name": name,
            "request": payload,
        }

        try:
            resp = _call_fal(payload, fal_key)
            elapsed = resp["elapsed_s"]
            status = resp["status_code"]
            body = resp["body"]

            result_entry["status_code"] = status
            result_entry["response"] = body
            result_entry["elapsed_s"] = round(elapsed, 2)
            result_entry["mode"] = resp["mode"]

            if 200 <= status < 300:
                # Extract image URL from response
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
                result_entry["result"] = "PASS"
                result_entry["image_url"] = img_url
            else:
                print(f"\nFAIL  |  status: {status}")
                print(f"  elapsed: {elapsed:.1f}s  mode: {resp['mode']}")
                print(f"  response body (verbatim):")
                print(json.dumps(body, indent=2))
                result_entry["result"] = "FAIL"

        except Exception as exc:
            import traceback
            elapsed = time.monotonic() - t0
            tb = traceback.format_exc()
            print(f"\nERROR  |  {type(exc).__name__}: {exc}")
            print(f"  elapsed: {elapsed:.1f}s")
            print(f"  traceback:\n{tb}")
            result_entry["result"] = "ERROR"
            result_entry["error"] = str(exc)
            result_entry["traceback"] = tb
            result_entry["elapsed_s"] = round(elapsed, 2)

        # Save per-variant JSON
        # Strip data URLs from saved request to keep files small
        save_entry = json.loads(json.dumps(result_entry, default=str))
        req_saved = save_entry.get("request", {})
        if isinstance(req_saved.get("image_url"), str) and len(req_saved["image_url"]) > 500:
            req_saved["image_url"] = req_saved["image_url"][:60] + "...<data_url_truncated>"
        out_path = output_dir / f"{letter}_{name.replace(' ', '_').replace('(', '').replace(')', '').replace(',', '')[:40]}.json"
        out_path.write_text(json.dumps(save_entry, indent=2, default=str))

        results.append(result_entry)

    # ---------------------------------------------------------------------------
    # Summary table
    # ---------------------------------------------------------------------------

    print(f"\n\n{'='*70}")
    print("SUMMARY TABLE")
    print(f"{'='*70}")
    print(f"{'Variant':<10} {'LoRA':<8} {'ControlNet':<18} {'Result':<8} {'Time':<8} {'Notes'}")
    print("-" * 70)

    for r in results:
        letter = r["variant"]
        lora_col = {
            "A": "0.85",
            "B": "-",
            "C": "0.85",
            "D": "0.85",
            "E": "0.30",
        }[letter]
        cn_col = {
            "A": "Union d+c",
            "B": "Union d+c",
            "C": "-",
            "D": "Single canny",
            "E": "Union d+c",
        }[letter]
        result = r.get("result", "?")
        elapsed = f"{r.get('elapsed_s', 0):.1f}s"
        notes = r.get("image_url", "")[:50] if result == "PASS" else (r.get("error", "") or "")[:50]
        print(f"{letter:<10} {lora_col:<8} {cn_col:<18} {result:<8} {elapsed:<8} {notes}")

    # ---------------------------------------------------------------------------
    # Recommendation
    # ---------------------------------------------------------------------------

    r_map = {r["variant"]: r.get("result") for r in results}
    a_pass = r_map.get("A") == "PASS"
    b_pass = r_map.get("B") == "PASS"
    c_pass = r_map.get("C") == "PASS"
    d_pass = r_map.get("D") == "PASS"
    e_pass = r_map.get("E") == "PASS"

    print(f"\n{'='*70}")
    print("RECOMMENDATION")
    print(f"{'='*70}")

    if not b_pass or not c_pass:
        print(
            "Sanity baseline broken -- issue is not CN+LoRA but something "
            "more fundamental (auth, image URL, account quota). Investigate "
            "before drawing conclusions."
        )
    elif a_pass:
        print(
            "Two-pass architecture is unnecessary. Collapse to single-pass "
            "and remove Pass 1b. Expected ~50% latency and cost reduction."
        )
    elif d_pass and not a_pass:
        print(
            "Conflict is ControlNet Union specific. Switch to single "
            "ControlNet (canny + separate depth call, or just canny) and "
            "keep single-pass."
        )
    elif e_pass and not a_pass and not d_pass:
        print(
            "Conflict is LoRA-scale-dependent. Try single-pass at scale "
            "0.3-0.5 and re-evaluate style alignment."
        )
    elif not a_pass and not d_pass and not e_pass:
        print(
            "Original diagnosis confirmed. Two-pass architecture is "
            "justified. Proceed with strength 0.30 / 0.40 smoke test on "
            "the V6 baseline."
        )
    else:
        print(f"Mixed results — review per-variant outputs manually.")
        print(f"  A={r_map.get('A')} B={r_map.get('B')} C={r_map.get('C')} D={r_map.get('D')} E={r_map.get('E')}")

    print(f"\nAll results saved to: {output_dir}")


if __name__ == "__main__":
    main()
