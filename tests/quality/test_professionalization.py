"""
Restoration Quality Test
=========================
Runs test photos through the full preprocessing + restoration chain
and saves before/after pairs to tests/quality/professionalization/.

Uses non-generative models only (NAFNet deblur + photo restoration).
No FLUX. No hallucination risk.

Usage:
    python tests/quality/test_professionalization.py

    # or with explicit photo URLs:
    python tests/quality/test_professionalization.py \
        --photos <url1> <url2> ...

    # or with the Supabase test image:
    python tests/quality/test_professionalization.py \
        --photos "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/test/room_converted.jpeg"

Each test photo is checked to confirm:
  - Room layout matches original (furniture in same positions)
  - Lighting looks cleaner/more evenly exposed
  - No style changes visible
  - Walls and floors unchanged
  - Colors look natural (not over-saturated)

Results are saved as side-by-side JPEG pairs:
    tests/quality/professionalization/<n>_before.jpg
    tests/quality/professionalization/<n>_after.jpg
    tests/quality/professionalization/summary.json
"""

import argparse
import json
import sys
import time
import uuid
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "professionalization"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# 10 default Unsplash interior photos (varied rooms — living, bedroom, kitchen)
DEFAULT_TEST_PHOTOS = [
    "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1200",  # living room
    "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200",  # sofa room
    "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200",  # bedroom
    "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200",  # kitchen
    "https://images.unsplash.com/photo-1560448204-603b3fc33ddc?w=1200",  # living 2
    "https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?w=1200",  # bedroom 2
    "https://images.unsplash.com/photo-1600121848594-d8644e57abab?w=1200",  # modern living
    "https://images.unsplash.com/photo-1583845112203-29329902332e?w=1200",  # dining
    "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=1200",  # white bedroom
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200",  # cozy room
]


def download(url: str) -> bytes:
    import requests
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return resp.content


def save_image(img_bytes: bytes, path: Path) -> None:
    path.write_bytes(img_bytes)
    print(f"  Saved: {path.name} ({len(img_bytes) // 1024}KB)")


def run_test(photo_url: str, index: int, dry_run: bool = False) -> dict:
    """
    Run one photo through preprocessing + restoration.
    Returns a result dict with URLs and timing.
    """
    room_id = f"test-restore-{index:02d}-{uuid.uuid4().hex[:6]}"
    result = {
        "index": index,
        "room_id": room_id,
        "photo_url": photo_url,
        "status": "pending",
    }

    try:
        print(f"\n[{index:02d}] Room: {room_id}")
        print(f"      Input: {photo_url[:80]}...")

        if dry_run:
            print("      DRY RUN — skipping Modal calls")
            result["status"] = "dry_run"
            return result

        t0 = time.time()

        # 1. Download original for before-image
        orig_bytes = download(photo_url)
        save_image(orig_bytes, OUTPUT_DIR / f"{index:02d}_before.jpg")

        # 2. Preprocessing (Modal) — OpenCV fixes
        import modal
        preprocess_fn = modal.Function.from_name(
            "cova-preprocessing-pipeline", "preprocess_room_photo"
        )
        preprocessed_url = preprocess_fn.remote(photo_url, room_id)
        print(f"      Preprocessed: {preprocessed_url[:60]}... ({time.time()-t0:.1f}s)")

        # 3. Restoration (Modal) — NAFNet deblur + photo restoration, conditional
        restore_fn = modal.Function.from_name(
            "cova-restoration-pipeline", "restore_room_photo"
        )
        t1 = time.time()
        restored_url = restore_fn.remote(preprocessed_url, room_id)
        elapsed_restore = time.time() - t1

        if restored_url == preprocessed_url:
            print(f"      Restoration: SKIPPED (image quality sufficient)")
            result["skipped"] = True
        else:
            print(f"      Restored: {restored_url[:60]}... ({elapsed_restore:.1f}s)")
            result["skipped"] = False

        after_bytes = download(restored_url)
        save_image(after_bytes, OUTPUT_DIR / f"{index:02d}_after.jpg")

        result.update({
            "status": "ok",
            "preprocessed_url": preprocessed_url,
            "restored_url": restored_url,
            "elapsed_s": round(time.time() - t0, 1),
            "restore_elapsed_s": round(elapsed_restore, 1),
        })

    except Exception as e:
        print(f"      ERROR: {e}")
        result["status"] = "error"
        result["error"] = str(e)

    return result


def main():
    parser = argparse.ArgumentParser(description="Test restoration pass quality")
    parser.add_argument("--photos", nargs="*", help="Custom photo URLs (overrides defaults)")
    parser.add_argument("--dry-run", action="store_true", help="Skip Modal calls, just validate setup")
    args = parser.parse_args()

    photos = args.photos or DEFAULT_TEST_PHOTOS
    print(f"Running {len(photos)} photos through restoration chain")
    print(f"Output: {OUTPUT_DIR}/")
    if args.dry_run:
        print("DRY RUN MODE — Modal functions will not be called")

    results = []
    for i, url in enumerate(photos, start=1):
        r = run_test(url, i, dry_run=args.dry_run)
        results.append(r)

    # Summary
    ok = sum(1 for r in results if r["status"] == "ok")
    skipped = sum(1 for r in results if r.get("skipped"))
    err = sum(1 for r in results if r["status"] == "error")
    dry = sum(1 for r in results if r["status"] == "dry_run")

    summary = {
        "total": len(results),
        "ok": ok,
        "restored": ok - skipped,
        "skipped_quality_ok": skipped,
        "error": err,
        "dry_run": dry,
        "results": results,
    }
    summary_path = OUTPUT_DIR / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2))
    print(f"\n{'='*60}")
    print(f"Results: {ok} OK ({ok - skipped} restored, {skipped} skipped) / {err} ERRORS / {dry} DRY RUN")
    print(f"Summary: {summary_path}")
    print(f"\nOpen {OUTPUT_DIR}/ in Finder to review before/after pairs.")
    print("ACCEPTANCE CRITERION: after images should look same room with better exposure/sharpness.")
    print("No style changes, no new furniture, no altered colors.")

    if err > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
