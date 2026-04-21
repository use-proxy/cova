#!/usr/bin/env python3
"""Phase 3: SAM 3 diagnostic - find what furniture is and isn't detected."""

from __future__ import annotations

import io
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import fal_client as fc
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent


def _load_env():
    env_path = ROOT / "apps/web/.env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if "=" not in line or line.startswith("#"):
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        if k == "FAL_KEY" and not os.getenv(k):
            os.environ[k] = v


_load_env()

# Comprehensive prompt list - cast wide net.
ALL_PROMPTS = [
    # Beds and sleeping
    "bed", "bed frame", "mattress", "pillow", "blanket", "quilt", "comforter",
    "bedding", "platform bed", "trundle bed", "storage bed", "daybed",
    # Seating
    "chair", "office chair", "desk chair", "gaming chair", "stool",
    "armchair", "rocking chair", "folding chair",
    # Storage
    "dresser", "drawer", "chest of drawers", "nightstand", "bedside table",
    "cabinet", "wardrobe", "closet organizer", "rolling cart", "storage unit",
    "bookshelf", "bookcase", "shelf", "shelving unit", "drawer unit",
    # Desk/work
    "desk", "table", "writing table", "computer desk",
    # Living room
    "sofa", "couch", "loveseat", "coffee table", "side table", "ottoman",
    "tv stand", "media console", "entertainment center",
    # Decor/clutter
    "rug", "area rug", "carpet mat",
    "lamp", "floor lamp", "desk lamp", "table lamp", "light",
    "plant", "potted plant", "flower pot",
    "backpack", "bag", "tote bag", "luggage",
    "clothes", "clothing", "laundry", "shirt", "jacket",
    "shoes", "sneakers", "footwear",
    "boxes", "cardboard box", "storage box",
    "electronics", "monitor", "computer", "laptop", "keyboard",
    "speaker", "headphones",
    "cable", "power cord", "wire", "charger",
    "picture frame", "photo frame", "artwork", "poster",
    "string lights", "fairy lights", "hanging photos",
    "mirror", "wall mirror",
    "curtain", "drape",
    "toy", "decoration", "knick knack",
    # Catch-alls
    "furniture", "object", "clutter", "item",
]


def main():
    target = ROOT / "benchmarks/target_room.jpg"
    raw = target.read_bytes()
    # Downscale before upload — saves SAM3 inference time on a 6.8MB image.
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    if max(img.size) > 1600:
        scale = 1600 / max(img.size)
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    upload_bytes = buf.getvalue()
    img_url = fc.upload(upload_bytes, "image/jpeg")
    print(f"Target room uploaded ({len(upload_bytes):,} bytes, {img.size}): {img_url}")

    results = {}
    hits = []
    misses = []

    def call_one(prompt: str):
        try:
            r = fc.subscribe(
                "fal-ai/sam-3/image",
                arguments={
                    "image_url": img_url,
                    "prompt": prompt,
                    "return_multiple_masks": True,
                    "include_scores": True,
                    "apply_mask": False,
                },
            )
            masks = r.get("masks") or []
            scores = r.get("scores") or []
            boxes = r.get("boxes") or []
            top = float(scores[0]) if scores else 0.0
            return prompt, {
                "detected": len(masks) > 0 and top > 0.05,
                "num_masks": len(masks),
                "top_score": top,
                "all_scores": [float(s) for s in scores][:5],
                "num_boxes": len(boxes),
            }
        except Exception as exc:  # noqa: BLE001
            return prompt, {"detected": False, "error": str(exc)[:200]}

    print(f"running {len(ALL_PROMPTS)} prompts in parallel (max 16)...")
    with ThreadPoolExecutor(max_workers=16) as ex:
        futs = {ex.submit(call_one, p): p for p in ALL_PROMPTS}
        for fut in as_completed(futs):
            prompt, res = fut.result()
            results[prompt] = res
            if res.get("detected"):
                hits.append(prompt)
                print(f"  HIT  | {prompt:30s} | {res['num_masks']} masks | score={res['top_score']:.3f}")
            elif res.get("error"):
                print(f"  ERR  | {prompt:30s} | {res['error']}")
                misses.append(prompt)
            else:
                misses.append(prompt)

    print(f"\n{'=' * 60}")
    print(f"DETECTED ({len(hits)}/{len(ALL_PROMPTS)}): {hits}")
    print(f"\nMISSED ({len(misses)}/{len(ALL_PROMPTS)}): {misses}")

    # Identify high-score hits (>0.5) — these are the strongest signals.
    strong = [p for p in hits if results[p].get("top_score", 0) > 0.5]
    weak = [p for p in hits if 0.05 < results[p].get("top_score", 0) <= 0.5]
    print(f"\nSTRONG ({len(strong)}, score > 0.5): {strong}")
    print(f"WEAK ({len(weak)}, score 0.05-0.5): {weak}")

    out = ROOT / "docs/pipeline-fix/sam3-diagnostic.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump(
            {
                "img_url": img_url,
                "results": results,
                "hits": hits,
                "misses": misses,
                "strong_hits": strong,
                "weak_hits": weak,
            },
            f,
            indent=2,
        )

    print(f"\nSaved to {out}")
    print(f"Reusable image URL: {img_url}")


if __name__ == "__main__":
    main()
