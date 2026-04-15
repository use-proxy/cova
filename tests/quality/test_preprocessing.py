"""
Preprocessing validation test.
Runs 5 test images through preprocess_room_photo and reports before/after stats.

Usage:
    python tests/quality/test_preprocessing.py

Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in environment.
Modal must be authenticated (modal token set).
"""

import io
import os
import sys
import json
import time
from typing import Optional

# ---------------------------------------------------------------------------
# 5 test images covering the key scenarios
# ---------------------------------------------------------------------------

TEST_IMAGES = [
    {
        "label": "dark_room",
        "description": "Low-light living room — should trigger DarkIR",
        # Dark interior from Unsplash (CC0)
        "url": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200&q=80",
        "room_id": "test-preprocess-dark",
    },
    {
        "label": "cluttered_room",
        "description": "Cluttered bedroom — CLAHE + sharpening test",
        "url": "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80",
        "room_id": "test-preprocess-clutter",
    },
    {
        "label": "normal_room",
        "description": "Well-lit living room — minimal corrections expected",
        "url": "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?w=1200&q=80",
        "room_id": "test-preprocess-normal",
    },
    {
        "label": "overexposed_room",
        "description": "Overexposed white room — gamma darkening expected",
        "url": "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200&q=80",
        "room_id": "test-preprocess-bright",
    },
    {
        "label": "warm_cast_room",
        "description": "Warm orange-cast room — white balance correction expected",
        "url": "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1200&q=80",
        "room_id": "test-preprocess-warm",
    },
]


# ---------------------------------------------------------------------------
# Measurement helpers (no OpenCV dependency — use Pillow)
# ---------------------------------------------------------------------------

def _download_bytes(url: str) -> bytes:
    import urllib.request
    with urllib.request.urlopen(url, timeout=30) as resp:
        return resp.read()


def _measure_image(img_bytes: bytes) -> dict:
    """Return brightness and contrast measurements for an image."""
    from PIL import Image, ImageStat
    import math

    img = Image.open(io.BytesIO(img_bytes)).convert("L")
    stat = ImageStat.Stat(img)
    mean = stat.mean[0]
    stddev = stat.stddev[0]
    return {
        "brightness": round(mean, 2),
        "contrast_stddev": round(stddev, 2),
        "width": img.width,
        "height": img.height,
    }


# ---------------------------------------------------------------------------
# Main test runner
# ---------------------------------------------------------------------------

def run_tests():
    print("=" * 60)
    print("Cova Preprocessing Validation")
    print("=" * 60)

    # Import Modal function
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "modal_pipeline"))
    from preprocessing import preprocess_room_photo  # type: ignore[import]

    results = []

    for test in TEST_IMAGES:
        label = test["label"]
        url = test["url"]
        room_id = test["room_id"]

        print(f"\n[{label}] {test['description']}")
        print(f"  Input URL: {url[:70]}...")

        # Before measurements
        try:
            before_bytes = _download_bytes(url)
            before_stats = _measure_image(before_bytes)
        except Exception as e:
            print(f"  ERROR downloading input: {e}")
            continue

        print(f"  Before → brightness={before_stats['brightness']}, contrast={before_stats['contrast_stddev']}, size={before_stats['width']}×{before_stats['height']}")

        # Run preprocessing
        t0 = time.time()
        try:
            preprocessed_url = preprocess_room_photo.remote(url, room_id)
            elapsed = time.time() - t0
        except Exception as e:
            print(f"  ERROR running preprocess_room_photo: {e}")
            results.append({
                "label": label,
                "status": "error",
                "error": str(e),
                "before": before_stats,
            })
            continue

        # After measurements
        try:
            after_bytes = _download_bytes(preprocessed_url)
            after_stats = _measure_image(after_bytes)
        except Exception as e:
            print(f"  ERROR downloading result: {e}")
            after_stats = {}

        brightness_delta = (
            round(after_stats.get("brightness", 0) - before_stats["brightness"], 2)
            if after_stats
            else None
        )
        contrast_delta = (
            round(after_stats.get("contrast_stddev", 0) - before_stats["contrast_stddev"], 2)
            if after_stats
            else None
        )

        print(f"  After  → brightness={after_stats.get('brightness', '?')}, contrast={after_stats.get('contrast_stddev', '?')}, size={after_stats.get('width', '?')}×{after_stats.get('height', '?')}")
        print(f"  Delta  → brightness Δ{'+' if (brightness_delta or 0) >= 0 else ''}{brightness_delta}, contrast Δ{'+' if (contrast_delta or 0) >= 0 else ''}{contrast_delta}")
        print(f"  Time   → {elapsed:.1f}s")
        print(f"  URL    → {preprocessed_url[:80]}...")

        results.append({
            "label": label,
            "description": test["description"],
            "status": "ok",
            "before": before_stats,
            "after": after_stats,
            "brightness_delta": brightness_delta,
            "contrast_delta": contrast_delta,
            "elapsed_s": round(elapsed, 1),
            "input_url": url,
            "output_url": preprocessed_url,
        })

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for r in results:
        status_icon = "✓" if r["status"] == "ok" else "✗"
        print(f"  {status_icon} {r['label']}: {r.get('description', '')}")
        if r["status"] == "ok":
            print(f"      brightness Δ{'+' if (r.get('brightness_delta') or 0) >= 0 else ''}{r.get('brightness_delta')}  contrast Δ{'+' if (r.get('contrast_delta') or 0) >= 0 else ''}{r.get('contrast_delta')}  ({r.get('elapsed_s')}s)")
            print(f"      output: {r.get('output_url', '')[:80]}")
        else:
            print(f"      ERROR: {r.get('error', 'unknown')}")

    # Persist results to JSON for CI
    out_path = os.path.join(os.path.dirname(__file__), "preprocessing_results.json")
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nFull results saved to: {out_path}")

    return results


if __name__ == "__main__":
    run_tests()
