#!/usr/bin/env python3
"""Kontext probe test — minimum viable image-edit architecture test.

No LoRA, no ControlNet, no fingerprint, no anchor lookup.
Just three Kontext calls with different prompts to see if
image-edit architecture preserves the user's room.

Source: IMG_01 (docs/gallery/original/IMG_01.jpg).
Endpoint: fal-ai/flux-pro/kontext

Usage:
    python modal_pipeline/kontext_probe_test.py --dry-run
    python modal_pipeline/kontext_probe_test.py
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

FAL_SYNC_URL = "https://fal.run/fal-ai/flux-pro/kontext"
FAL_QUEUE_SUBMIT_URL = "https://queue.fal.run/fal-ai/flux-pro/kontext"

SYNC_TIMEOUT_S = 120
QUEUE_POLL_INTERVAL_S = 5
QUEUE_MAX_WAIT_S = 300

GUIDANCE_SCALE = 3.5
NUM_INFERENCE_STEPS = 28
SEED = 42
OUTPUT_FORMAT = "jpeg"
ASPECT_RATIO = "1:1"

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
# Variants
# ---------------------------------------------------------------------------

VARIANTS: list[dict[str, str]] = [
    {
        "id": "K1",
        "label": "minimal",
        "prompt": (
            "Apply Japandi interior design style to this bedroom while "
            "preserving the room's architecture, fixtures, and layout."
        ),
    },
    {
        "id": "K2",
        "label": "explicit",
        "prompt": (
            "Apply Japandi interior design style to this bedroom: warm "
            "off-white plaster walls, linen bedding in neutral tones, a low teak "
            "nightstand, a paper lantern reading light, minimal decor. "
            "Preserve exactly: the tile floor with its existing pattern, the "
            "popcorn ceiling, the ceiling fan in its current position with its "
            "blade count, both windows with their blinds, the crucifix on the "
            "wall, the camera angle, and the overall room proportions."
        ),
    },
    {
        "id": "K3",
        "label": "finishes_only",
        "prompt": (
            "Restyle only the soft furnishings (bed linens, decorative "
            "pillows, area rug) and add modest decor (a paper lantern reading "
            "light, a single ceramic vase) in Japandi style. Do not change the "
            "floor, walls, ceiling, fan, windows, or any architectural element. "
            "Keep the same camera angle and room layout."
        ),
    },
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


def _resolve_source_image() -> tuple[str, Path]:
    """Returns (data_url, local_path)."""
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
            return data_url, path

    print("Source image not found. Checked:")
    for p in IMG01_CANDIDATES:
        print(f"  {p}")
    sys.exit(1)


# ---------------------------------------------------------------------------
# API call helpers
# ---------------------------------------------------------------------------


def _build_payload(prompt: str, image_data_url: str) -> dict[str, Any]:
    return {
        "prompt": prompt,
        "image_url": image_data_url,
        "guidance_scale": GUIDANCE_SCALE,
        "num_inference_steps": NUM_INFERENCE_STEPS,
        "seed": SEED,
        "output_format": OUTPUT_FORMAT,
        "aspect_ratio": ASPECT_RATIO,
    }


def _pretty_payload(payload: dict[str, Any]) -> str:
    """Pretty-print payload with truncated data URL."""
    display = dict(payload)
    img = display.get("image_url", "")
    if img.startswith("data:"):
        display["image_url"] = img[:60] + "...<truncated>"
    return json.dumps(display, indent=2)


def _call_fal(
    payload: dict[str, Any], fal_key: str, variant_id: str
) -> dict[str, Any]:
    headers = {
        "Authorization": f"Key {fal_key}",
        "Content-Type": "application/json",
    }

    # Try sync first
    print(f"  [{variant_id}] Calling sync endpoint...")
    t0 = time.time()
    try:
        resp = requests.post(
            FAL_SYNC_URL,
            headers=headers,
            json=payload,
            timeout=SYNC_TIMEOUT_S,
        )
        elapsed = time.time() - t0
        if resp.status_code == 200:
            result = resp.json()
            result["_elapsed_s"] = round(elapsed, 1)
            result["_mode"] = "sync"
            return result
        elif resp.status_code == 422:
            # Validation error — no point queuing
            return {
                "_error": True,
                "_status": resp.status_code,
                "_body": resp.text,
                "_elapsed_s": round(elapsed, 1),
                "_mode": "sync",
            }
        else:
            print(f"  [{variant_id}] Sync returned {resp.status_code}, falling back to queue...")
    except requests.exceptions.Timeout:
        elapsed = time.time() - t0
        print(f"  [{variant_id}] Sync timed out after {elapsed:.0f}s, falling back to queue...")

    # Queue fallback
    print(f"  [{variant_id}] Submitting to queue...")
    t0 = time.time()
    resp = requests.post(
        FAL_QUEUE_SUBMIT_URL,
        headers=headers,
        json=payload,
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        return {
            "_error": True,
            "_status": resp.status_code,
            "_body": resp.text,
            "_elapsed_s": round(time.time() - t0, 1),
            "_mode": "queue-submit",
        }

    queue_data = resp.json()
    request_id = queue_data.get("request_id")
    status_url = queue_data.get("status_url")
    response_url = queue_data.get("response_url")

    if not request_id:
        return {
            "_error": True,
            "_body": "No request_id in queue response",
            "_raw": queue_data,
            "_elapsed_s": round(time.time() - t0, 1),
            "_mode": "queue-submit",
        }

    print(f"  [{variant_id}] Queued: request_id={request_id}")

    # Poll for completion
    deadline = time.time() + QUEUE_MAX_WAIT_S
    while time.time() < deadline:
        time.sleep(QUEUE_POLL_INTERVAL_S)
        try:
            poll = requests.get(
                status_url or f"https://queue.fal.run/fal-ai/flux-pro/kontext/requests/{request_id}/status",
                headers=headers,
                timeout=15,
            )
            if poll.status_code == 200:
                poll_data = poll.json()
                status = poll_data.get("status", "")
                print(f"  [{variant_id}] Queue status: {status}")
                if status == "COMPLETED":
                    # Fetch result
                    result_resp = requests.get(
                        response_url or f"https://queue.fal.run/fal-ai/flux-pro/kontext/requests/{request_id}",
                        headers=headers,
                        timeout=30,
                    )
                    elapsed = time.time() - t0
                    if result_resp.status_code == 200:
                        result = result_resp.json()
                        result["_elapsed_s"] = round(elapsed, 1)
                        result["_mode"] = "queue"
                        return result
                    else:
                        return {
                            "_error": True,
                            "_status": result_resp.status_code,
                            "_body": result_resp.text,
                            "_elapsed_s": round(elapsed, 1),
                            "_mode": "queue-result",
                        }
                elif status == "FAILED":
                    return {
                        "_error": True,
                        "_body": json.dumps(poll_data),
                        "_elapsed_s": round(time.time() - t0, 1),
                        "_mode": "queue-failed",
                    }
        except requests.exceptions.RequestException as e:
            print(f"  [{variant_id}] Poll error: {e}")

    return {
        "_error": True,
        "_body": f"Queue timed out after {QUEUE_MAX_WAIT_S}s",
        "_elapsed_s": round(time.time() - t0, 1),
        "_mode": "queue-timeout",
    }


# ---------------------------------------------------------------------------
# Download result image
# ---------------------------------------------------------------------------


def _download_image(url: str, dest: Path) -> bool:
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
        print(f"  Downloaded: {dest} ({len(resp.content) / 1024:.1f} KB)")
        return True
    except Exception as e:
        print(f"  Download failed: {e}")
        return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Kontext probe test")
    parser.add_argument("--dry-run", action="store_true", help="Print payloads and exit")
    args = parser.parse_args()

    print("=" * 60)
    print("KONTEXT PROBE TEST — minimum viable image-edit test")
    print("=" * 60)
    print()

    # Pre-flight
    fal_key = None if args.dry_run else _resolve_fal_key()
    image_data_url, image_path = _resolve_source_image()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = REPO_ROOT / "docs" / "debug" / f"kontext_probe_{timestamp}"
    results_dir = output_dir / "results"
    results_dir.mkdir(parents=True, exist_ok=True)
    print(f"Output dir: {output_dir}")
    print()

    # Copy original
    import shutil
    orig_dest = results_dir / "00_original.jpg"
    shutil.copy2(image_path, orig_dest)
    print(f"Copied original to: {orig_dest}")
    print()

    # Build all payloads
    payloads = []
    for variant in VARIANTS:
        payload = _build_payload(variant["prompt"], image_data_url)
        payloads.append((variant, payload))

    # Print payloads
    for variant, payload in payloads:
        print(f"--- {variant['id']}: {variant['label']} ---")
        print(_pretty_payload(payload))
        print()

    if args.dry_run:
        print("DRY RUN — exiting without API calls.")
        return

    # Run variants sequentially
    results_summary: list[dict[str, Any]] = []

    for variant, payload in payloads:
        vid = variant["id"]
        label = variant["label"]
        print(f"{'=' * 60}")
        print(f"Running {vid} — {label}")
        print(f"{'=' * 60}")

        result = _call_fal(payload, fal_key, vid)

        # Save raw response
        response_path = output_dir / f"{vid}_{label}.json"
        # Remove data URL from saved response to keep files small
        save_result = dict(result)
        response_path.write_text(json.dumps(save_result, indent=2, default=str))
        print(f"  Response saved: {response_path}")

        if result.get("_error"):
            print(f"  FAIL — {vid} {label}")
            print(f"    Status: {result.get('_status', 'N/A')}")
            print(f"    Body: {result.get('_body', 'N/A')[:500]}")
            results_summary.append({
                "variant": vid,
                "label": label,
                "status": "FAIL",
                "elapsed_s": result.get("_elapsed_s", "N/A"),
                "image_url": None,
            })
        else:
            # Extract image URL
            images = result.get("images", [])
            image_url = images[0].get("url") if images else result.get("image", {}).get("url")
            elapsed = result.get("_elapsed_s", "N/A")
            mode = result.get("_mode", "unknown")

            print(f"  PASS — {vid} {label}")
            print(f"    Elapsed: {elapsed}s ({mode})")
            print(f"    Image URL: {image_url}")

            # Download
            if image_url:
                dest = results_dir / f"{vid}_{label}.jpg"
                _download_image(image_url, dest)

            results_summary.append({
                "variant": vid,
                "label": label,
                "status": "PASS",
                "elapsed_s": elapsed,
                "image_url": image_url,
            })

        print()

    # Summary table
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"{'Variant':<10} {'Label':<18} {'Status':<8} {'Elapsed':<10} {'Image URL'}")
    print("-" * 100)
    for r in results_summary:
        url_display = (r["image_url"] or "N/A")[:60]
        print(f"{r['variant']:<10} {r['label']:<18} {r['status']:<8} {r['elapsed_s']!s:<10} {url_display}")
    print()
    print("PROBE COMPLETE — awaiting review.")


if __name__ == "__main__":
    main()
