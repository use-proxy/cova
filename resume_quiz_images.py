#!/usr/bin/env python3
"""
Cova Quiz Image Resume Script
Skips already-uploaded files and only generates missing ones.

Usage:
  python3 resume_quiz_images.py           # generate all missing Phase B
  python3 resume_quiz_images.py --dry-run # show what's missing without generating
"""

import os
import sys
import time
import argparse
import requests
import replicate
from supabase import create_client

REPLICATE_TOKEN = os.environ.get("REPLICATE_API_TOKEN")
SUPABASE_URL    = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

FLUX_MODEL   = "black-forest-labs/flux-pro"
IMAGE_WIDTH  = 1200
IMAGE_HEIGHT = 800
STORAGE_BUCKET = "quiz-images"

QUALITY_SUFFIX = (
    "Photorealistic interior photography, professionally staged, "
    "shot on medium format camera, natural light, no people, no text, "
    "ultra detailed, aspirational, magazine quality, 8K."
)

ROOMS = ["living-room", "bedroom", "dining-room", "kitchen", "home-office", "bathroom"]
DIMS  = [
    "colorTemperature", "colorSaturation", "density", "formality", "era",
    "material", "texture", "pattern", "lineQuality", "lightPreference",
    "nature", "culturalInfluence",
]
POLES = {"low": "0.15", "high": "0.85"}

# ── All Phase B prompts (copied from generate_quiz_images.py) ─────────────────
# Import from the original script to avoid duplication
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from generate_quiz_images import DIMENSION_POLES, build_phase_b_records
except ImportError:
    print("ERROR: generate_quiz_images.py must be in the same directory as this script.")
    print(f"Expected location: {os.path.dirname(os.path.abspath(__file__))}/generate_quiz_images.py")
    sys.exit(1)


def get_uploaded_files(supabase_client):
    """Returns a set of storage paths already uploaded."""
    uploaded = set()
    try:
        folders = supabase_client.storage.from_(STORAGE_BUCKET).list("comparisons", {"limit": 1000})
        for folder in folders:
            dim_name = folder["name"]
            files = supabase_client.storage.from_(STORAGE_BUCKET).list(
                f"comparisons/{dim_name}", {"limit": 1000}
            )
            for f in files:
                uploaded.add(f"comparisons/{dim_name}/{f['name']}")
    except Exception as e:
        print(f"WARNING: Could not fetch uploaded files: {e}")
    return uploaded


def generate_and_upload(record, supabase_client, dry_run=False):
    prompt = record["prompt"]
    path   = record["storage_path"]

    if dry_run:
        print(f"  [MISSING] {path}")
        return True

    try:
        output = replicate.run(
            FLUX_MODEL,
            input={
                "prompt": prompt,
                "width": IMAGE_WIDTH,
                "height": IMAGE_HEIGHT,
                "output_format": "webp",
                "output_quality": 90,
                "safety_tolerance": 2,
            }
        )
        image_url = str(output[0]) if isinstance(output, list) else str(output)
        img_bytes = requests.get(image_url, timeout=60).content

        supabase_client.storage.from_(STORAGE_BUCKET).upload(
            path=path,
            file=img_bytes,
            file_options={"content-type": "image/webp", "upsert": "true"},
        )
        print(f"  ✓ {path}")
        return True

    except Exception as e:
        print(f"  ✗ {path} — {e}")
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.dry_run:
        if not REPLICATE_TOKEN:
            print("ERROR: REPLICATE_API_TOKEN not set"); sys.exit(1)
        if not SUPABASE_URL or not SUPABASE_KEY:
            print("ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set"); sys.exit(1)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("Checking what's already uploaded...")
    uploaded = get_uploaded_files(supabase)
    print(f"Already uploaded: {len(uploaded)} files")

    all_records = build_phase_b_records()
    missing = [r for r in all_records if r["storage_path"] not in uploaded]

    print(f"Missing: {len(missing)}/720 files\n")

    if not missing:
        print("All Phase B images already uploaded.")
        return

    # Show breakdown by dimension
    from collections import Counter
    dim_counts = Counter(r["dimension"] for r in missing)
    print("Missing by dimension:")
    for dim, count in sorted(dim_counts.items()):
        print(f"  {dim}: {count}")
    print()

    if args.dry_run:
        print("Dry run — listing missing files:")
        for r in missing:
            print(f"  {r['storage_path']}")
        return

    print(f"Generating {len(missing)} missing images...\n")
    success = 0
    fail = 0
    for i, rec in enumerate(missing, 1):
        print(f"[{i}/{len(missing)}]", end=" ")
        ok = generate_and_upload(rec, supabase, dry_run=False)
        if ok:
            success += 1
        else:
            fail += 1
        time.sleep(0.5)

    print(f"\nDone. ✓ {success} succeeded, ✗ {fail} failed.")
    if fail > 0:
        print("Run the script again to retry failed images.")


if __name__ == "__main__":
    main()
