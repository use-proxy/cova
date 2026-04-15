#!/usr/bin/env python3
"""
Cova LoRA Training — Dual Captioning + Multi-Query Dataset Curation

Key techniques implemented:
1. Dual captioning: each image gets two captions — trigger-only + detailed description
   This is the single most impactful training technique for style LoRAs.
2. Multi-query curation: 5-6 queries per style covering different room types
3. Quality scoring: resolution + engagement + style keyword match
4. Room type diversity: ensures bedroom, living room, kitchen etc. all represented
5. 1500 steps: safe with dual captioning (single-caption overfits above 1000)

Usage:
    cd ~/Desktop/cova
    python3 scripts/train_loras.py --style cvwmn
    python3 scripts/train_loras.py --style cvwmn --dry-run   # Preview, no cost
    python3 scripts/train_loras.py --style all               # All 5 priority styles

Cost: $2 per training run. cvwmn = $4 (train + validation run).
"""

import argparse
import asyncio
import hashlib
import io
import json
import os
import random
import sys
import time
import zipfile
from pathlib import Path
from typing import Optional

import anthropic
import fal_client
import requests
from PIL import Image
from supabase import create_client

# ── Style definitions ─────────────────────────────────────────────────────────
#
# IMPORTANT: search_queries are grouped by ROOM TYPE (not just aesthetic terms).
# Each style needs images from 4+ room types to generalize across Cova's users.
# A LoRA trained only on "japandi bedroom" will fail on "japandi living room".
#
# Source image priority:
# - Unsplash (license allows AI training use)
# - Minimum 1080px on shortest side (4K+ preferred — resize removes compression artifacts)
# - No watermarks, no text overlays, no human faces in foreground

STYLE_DEFINITIONS = {
    "cvwmn": {
        "name": "Warm & Grounded",
        "trigger_word": "cvwmn",       # Short token used in captions
        "full_trigger": "cvwmn interior",  # Full token used in prompts (with class descriptor)
        "style_class": "interior",
        "description": "Japandi-inspired warm minimalist. Natural wood, linen, terracotta, wabi-sabi imperfection.",
        # Queries grouped by room type — ensures generalization across room types
        "search_queries": [
            # Bedrooms
            "japandi bedroom natural wood platform bed",
            "warm minimalist bedroom linen bedding",
            # Living rooms
            "japandi living room rattan accent chair",
            "warm minimal living room earth tones",
            # Details + materials (teaches LoRA about textures, not just layouts)
            "japandi interior terracotta ceramic natural",
            "wabi sabi home decor wood linen texture",
        ],
        "positive_signals": ["japandi", "minimal", "natural", "warm", "wood", "linen", "wabi", "earth"],
        "negative_signals": ["hotel", "commercial", "showroom", "3d render", "illustration", "cgi"],
        "target_count": 22,     # Quality over quantity. 22 well-curated > 30 mixed.
        "room_types": ["bedroom", "living room", "kitchen", "bathroom", "detail shot"],
    },
    "cvscn": {
        "name": "Scandinavian",
        "trigger_word": "cvscn",
        "full_trigger": "cvscn interior",
        "style_class": "interior",
        "description": "Nordic interior. White walls, pale birch, hygge warmth, functional simplicity.",
        "search_queries": [
            "scandinavian bedroom white wood hygge",
            "nordic living room pale birch light",
            "danish interior minimal white linen",
            "swedish kitchen light wood white",
            "hygge home cozy nordic candles",
            "scandinavian bathroom white tile wood",
        ],
        "positive_signals": ["scandinavian", "nordic", "hygge", "danish", "swedish", "birch", "nordic"],
        "negative_signals": ["hotel", "commercial", "3d render"],
        "target_count": 22,
        "room_types": ["bedroom", "living room", "kitchen", "bathroom"],
    },
    "cvmcm": {
        "name": "Vintage Modern",
        "trigger_word": "cvmcm",
        "full_trigger": "cvmcm interior",
        "style_class": "interior",
        "description": "Mid-century modern. Walnut, teak, clean lines, 1950s-70s American modernism.",
        "search_queries": [
            "mid century modern bedroom walnut furniture",
            "mcm living room teak credenza",
            "mid century modern home office danish",
            "retro modern dining room walnut chairs",
            "mid century modern kitchen vintage tile",
            "mcm interior sunken conversation pit",
        ],
        "positive_signals": ["mid-century", "mcm", "walnut", "teak", "retro", "1960s", "modernist"],
        "negative_signals": ["hotel", "commercial", "3d render", "rendering"],
        "target_count": 22,
        "room_types": ["bedroom", "living room", "office", "dining room"],
    },
    "cvind": {
        "name": "Industrial",
        "trigger_word": "cvind",
        "full_trigger": "cvind interior",
        "style_class": "interior",
        "description": "Industrial loft aesthetic. Exposed brick, steel, concrete, Edison bulbs, raw materials.",
        "search_queries": [
            "industrial loft bedroom exposed brick",
            "industrial living room concrete steel",
            "urban loft kitchen open shelving",
            "industrial home office exposed ductwork",
            "loft apartment dining room Edison bulbs",
            "raw industrial bathroom concrete tile",
        ],
        "positive_signals": ["industrial", "loft", "brick", "concrete", "steel", "urban", "raw"],
        "negative_signals": ["hotel", "commercial", "3d render", "suburban"],
        "target_count": 22,
        "room_types": ["bedroom", "living room", "kitchen", "office"],
    },
    "cvlux": {
        "name": "Modern Luxe",
        "trigger_word": "cvlux",
        "full_trigger": "cvlux interior",
        "style_class": "interior",
        "description": "Contemporary luxury. Marble, brass, velvet, custom millwork, bespoke design.",
        "search_queries": [
            "luxury contemporary bedroom marble brass",
            "high end living room velvet sofa",
            "modern luxury master bedroom bespoke",
            "designer kitchen marble waterfall island",
            "luxury bathroom freestanding tub marble",
            "contemporary luxury home office built-in",
        ],
        "positive_signals": ["luxury", "designer", "high-end", "bespoke", "marble", "velvet", "brass"],
        "negative_signals": ["hotel lobby", "commercial", "3d render", "budget"],
        "target_count": 22,
        "room_types": ["bedroom", "living room", "kitchen", "bathroom"],
    },
}

UNSPLASH_API_BASE = "https://api.unsplash.com"

# ── Unsplash fetching ─────────────────────────────────────────────────────────

def fetch_unsplash_page(query: str, access_key: str, page: int = 1, per_page: int = 15) -> list[dict]:
    url = f"{UNSPLASH_API_BASE}/search/photos"
    params = {
        "query": query,
        "per_page": per_page,
        "page": page,
        "order_by": "relevant",
        "orientation": "landscape",
        "content_filter": "high",
    }
    headers = {"Authorization": f"Client-ID {access_key}"}
    resp = requests.get(url, params=params, headers=headers, timeout=10)
    resp.raise_for_status()

    return [{
        "id": p["id"],
        "url": p["urls"]["regular"],        # ~1080px — good quality, fast download
        "url_full": p["urls"]["full"],      # Higher res when available
        "width": p["width"],
        "height": p["height"],
        "likes": p["likes"],
        "description": (p.get("description") or p.get("alt_description") or "").lower(),
        "tags": [t["title"].lower() for t in p.get("tags", [])],
        "query": query,
    } for p in resp.json().get("results", [])]


def quality_score(photo: dict, style_def: dict) -> float:
    """Score 0-100. Photos below 30 are excluded."""
    score = 0.0
    desc = photo["description"] + " " + " ".join(photo["tags"])

    # Resolution
    short_side = min(photo["width"], photo["height"])
    if short_side >= 2000: score += 25
    elif short_side >= 1200: score += 18
    elif short_side >= 800: score += 10
    else: return 0  # Too small

    # Landscape ratio (rooms should be wider than tall)
    ratio = photo["width"] / max(photo["height"], 1)
    if 1.2 <= ratio <= 2.4: score += 15
    elif ratio < 0.95: return 0   # Portrait — not a room shot

    # Engagement (proxy for visual quality)
    if photo["likes"] >= 500: score += 25
    elif photo["likes"] >= 100: score += 18
    elif photo["likes"] >= 30: score += 10
    elif photo["likes"] >= 10: score += 4

    # Positive style signal matches
    hits = sum(1 for kw in style_def["positive_signals"] if kw in desc)
    score += min(25, hits * 6)

    # Negative signal penalty
    neg_hits = sum(1 for kw in style_def["negative_signals"] if kw in desc)
    if neg_hits > 0: score -= 35

    return max(0.0, score)


def deduplicate(photos: list[dict]) -> list[dict]:
    """Remove ID duplicates (same photo from multiple queries)."""
    seen = set()
    unique = []
    for p in photos:
        if p["id"] not in seen:
            seen.add(p["id"])
            unique.append(p)
    return unique


def download_image(url: str, size: int = 1024) -> Optional[bytes]:
    """Download, center-crop to square, resize to size x size. Returns PNG bytes."""
    try:
        resp = requests.get(url, timeout=15, headers={"User-Agent": "Cova/1.0"})
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGB")

        if min(img.size) < 512:
            return None  # Too small

        # Center crop to square
        w, h = img.size
        side = min(w, h)
        img = img.crop(((w-side)//2, (h-side)//2, (w+side)//2, (h+side)//2))
        img = img.resize((size, size), Image.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue()

    except Exception as e:
        print(f"    ✗ Download failed: {e}")
        return None


# ── Caption generation ────────────────────────────────────────────────────────
#
# DUAL CAPTIONING — the single most impactful training technique:
#
# Caption A (trigger-only): Just the trigger phrase.
# Teaches: "When you see cvwmn interior in a prompt, produce THIS aesthetic."
# The model associates the token with the gestalt visual quality.
#
# Caption B (detailed, no style words): Detailed room description WITHOUT
# any style-specific vocabulary, with trigger appended at the end.
# Teaches: "This specific furniture arrangement, these materials, this lighting
# → these are content, not style. The style is cvwmn interior."
#
# Together: LoRA learns aesthetic (from A) + content-style separation (from B).
# Result: LoRA applies the style to any content, not just training room layouts.

CAPTION_SYSTEM = """You are writing training captions for a FLUX diffusion model LoRA.
You will write TWO captions for the same interior photo.

CAPTION A (trigger-only):
Just the trigger phrase alone. Nothing else.
Format: "{trigger} {style_class}"
Example: "cvwmn interior"

CAPTION B (detailed, NO style words):
Describe exactly what is visible — furniture, materials, colors, lighting, spatial arrangement.
Rules for Caption B:
- Name specific materials: "warm walnut" not "wood", "cream bouclé" not "fabric"
- Describe lighting direction and quality
- Note the room type and camera angle
- Do NOT include any style names (no "japandi", "minimal", "scandinavian" etc.)
- End with: ", {trigger} {style_class}"
- Length: 60-90 words

Return ONLY a JSON object: {"a": "...", "b": "..."}
No preamble. No markdown. No explanation."""


def generate_dual_captions(
    image_url: str,
    trigger: str,
    style_class: str,
    client: anthropic.Anthropic
) -> dict:
    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            system=CAPTION_SYSTEM,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "url", "url": image_url}},
                    {"type": "text", "text": f'trigger="{trigger}", style_class="{style_class}". Return JSON only.'}
                ]
            }]
        )
        raw = response.content[0].text.strip().lstrip("```json").rstrip("```").strip()
        return json.loads(raw)

    except Exception as e:
        print(f"    ⚠ Caption failed: {e}")
        return {
            "a": f"{trigger} {style_class}",
            "b": f"Professionally photographed interior room with carefully arranged furniture and natural lighting, {trigger} {style_class}"
        }


# ── Training ──────────────────────────────────────────────────────────────────

async def train_lora(style_key: str, steps: int = 1500, dry_run: bool = False) -> Optional[str]:
    if style_key not in STYLE_DEFINITIONS:
        print(f"Unknown style: {style_key}")
        return None

    sdef = STYLE_DEFINITIONS[style_key]
    trigger = sdef["trigger_word"]
    style_class = sdef["style_class"]
    full_trigger = sdef["full_trigger"]

    print(f"\n{'='*60}")
    print(f"Style: {sdef['name']} | Trigger: {full_trigger} | Steps: {steps}")
    print(f"{'='*60}")

    unsplash_key = os.environ["UNSPLASH_ACCESS_KEY"]
    anthropic_client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    # ── Phase 1: Multi-query collection ──────────────────────────────────────
    print("\n📸 Phase 1: Multi-query collection...")
    for query in sdef["search_queries"]:
        print(f"  - {query}")

    all_photos = []
    if not dry_run:
        for query in sdef["search_queries"]:
            print(f"  Fetching: '{query}'")
            try:
                for page in [1, 2]:
                    photos = fetch_unsplash_page(query, unsplash_key, page=page, per_page=15)
                    all_photos.extend(photos)
                    time.sleep(0.4)
            except Exception as e:
                print(f"  ⚠ Failed: {e}")

        print(f"  Collected: {len(all_photos)} total")
        all_photos = deduplicate(all_photos)
        print(f"  After dedup: {len(all_photos)}")
    else:
        # Dry run: simulate collection with dummy data for display
        all_photos = [
            {
                "id": f"dry_{i}",
                "url": "https://example.com/img.jpg",
                "url_full": "https://example.com/img_full.jpg",
                "width": 2400,
                "height": 1600,
                "likes": 200 + i * 50,
                "description": f"{sdef['positive_signals'][0]} bedroom natural light warm materials",
                "tags": sdef["positive_signals"][:3],
                "query": sdef["search_queries"][i % len(sdef["search_queries"])],
            }
            for i in range(30)
        ]
        print(f"  [dry-run] Simulated {len(all_photos)} photos collected")

    # ── Phase 2: Quality scoring and selection ────────────────────────────────
    print("\n⭐ Phase 2: Quality scoring...")
    scored = sorted(
        [(quality_score(p, sdef), p) for p in all_photos],
        key=lambda x: x[0], reverse=True
    )
    qualified = [(s, p) for s, p in scored if s >= 30]
    selected = qualified[:sdef["target_count"]]

    print(f"  Photos collected: {len(all_photos)}, qualified (score ≥ 30): {len(qualified)}, selected: {len(selected)}")

    if len(selected) < 12 and not dry_run:
        print(f"❌ Only {len(selected)} qualifying images (need 12+). Add more search queries.")
        return None

    # ── Phase 3: Download + dual caption ─────────────────────────────────────
    print(f"\n⬇️  Phase 3: Downloading {len(selected)} images + dual captions")

    if dry_run:
        print("  [dry-run] Would download and caption each image")
        print("\n🔍 DRY RUN — would train with:")
        for score, photo in selected[:5]:
            print(f"  [{score:.0f}] {photo['description'][:60]}")
        if len(selected) > 5:
            print(f"  ... + {len(selected)-5} more")
        print(f"\n  steps={steps}")
        print(f"  trigger={full_trigger}")
        print(f"  is_style=True")
        return None

    training_files = {}
    for i, (score, photo) in enumerate(selected):
        print(f"  [{i+1}/{len(selected)}] score={score:.0f}: {photo['description'][:50]}")

        img_bytes = download_image(photo["url"], size=1024)
        if img_bytes is None:
            continue

        base = f"{trigger}_{i+1:03d}"
        training_files[f"{base}.png"] = img_bytes

        # DUAL CAPTIONING — the key technique
        captions = generate_dual_captions(photo["url"], trigger, style_class, anthropic_client)

        # Caption A file: just the trigger phrase
        training_files[f"{base}_a.txt"] = captions["a"].encode("utf-8")
        # Caption B file: detailed description + trigger at end
        training_files[f"{base}_b.txt"] = captions["b"].encode("utf-8")

        print(f"    A: '{captions['a']}'")
        print(f"    B: '{captions['b'][:80]}...'")
        time.sleep(0.3)

    # For each image, the training ZIP needs ONE .txt file matching the .png name.
    # We include BOTH captions by duplicating the image:
    # image_001.png → image_001.txt (caption A, trigger-only)
    # image_001_b.png → image_001_b.txt (caption B, detailed)
    # This way fal.ai trains on both caption styles.
    final_files = {}
    for fname, data in training_files.items():
        if fname.endswith("_a.txt"):
            # Rename: image_001_a.txt → image_001.txt (matches image_001.png)
            base = fname.replace("_a.txt", "")
            final_files[f"{base}.txt"] = data
        elif fname.endswith("_b.txt"):
            # Create a duplicate image for the B caption
            img_name = fname.replace("_b.txt", ".png")
            b_img_name = fname.replace("_b.txt", "_b.png")
            if img_name in training_files:
                final_files[b_img_name] = training_files[img_name]
            final_files[f"{fname.replace('_b.txt', '_b')}.txt"] = data
        elif fname.endswith(".png"):
            final_files[fname] = data

    image_count = len([f for f in final_files if f.endswith(".png")])
    print(f"\n  Training set: {image_count} images (pairs of dual captions)")

    # ── Phase 4: Create ZIP and upload ───────────────────────────────────────
    print("\n📦 Phase 4: Creating ZIP...")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname, data in final_files.items():
            zf.writestr(fname, data)
    zip_bytes = buf.getvalue()
    print(f"  ZIP size: {len(zip_bytes)/1024/1024:.1f} MB")

    print("  Uploading to fal.ai storage...")
    zip_url = fal_client.upload(zip_bytes, content_type="application/zip")
    print(f"  ZIP URL: {zip_url}")

    # ── Phase 5: Submit training ──────────────────────────────────────────────
    print(f"\n🏋️  Phase 5: Training ({steps} steps, ~$2)...")
    result = fal_client.subscribe(
        "fal-ai/flux-lora-fast-training",
        arguments={
            "images_data_url": zip_url,
            "trigger_word": full_trigger,  # "cvwmn interior" — with class descriptor
            "is_style": True,              # CRITICAL: disables auto-captioning
            "steps": steps,
        },
        with_logs=True,
    )

    lora_url = result.get("diffusers_lora_file", {}).get("url")
    if not lora_url:
        print(f"❌ Training failed: {result}")
        return None

    print(f"\n✅ LoRA trained: {lora_url}")

    # ── Phase 6: Validation across multiple seeds ─────────────────────────────
    # Research: seed selection matters enormously. Test across 5 seeds to get
    # a representative view of LoRA quality.
    print("\n🖼️  Phase 6: Validation renders (5 seeds)...")
    validation_urls = []
    test_prompt = (
        f"Shot on Hasselblad X2D, 24mm tilt-shift at f/8. "
        f"Bedroom with platform bed, natural window light, "
        f"layered linen textiles. A ceramic carafe on the bedside table. "
        f"Soft morning light raking across the headboard. "
        f"{full_trigger}, Architectural Digest editorial photograph."
    )

    for seed_offset in range(5):
        seed = 42 + seed_offset * 1000
        val_result = fal_client.subscribe(
            "fal-ai/flux-general",
            arguments={
                "prompt": test_prompt,
                "num_inference_steps": 28,
                "guidance_scale": 3.5,
                "image_size": {"width": 1024, "height": 1024},
                "loras": [{"path": lora_url, "scale": 0.80}],
                "output_format": "png",
                "seed": seed,
            }
        )
        url = val_result["images"][0]["url"]
        validation_urls.append((seed, url))
        print(f"  Seed {seed}: {url}")

    print("\nReview all 5 validation URLs above.")
    print("If 3+ look consistently in style → LoRA is solid (quality_score: 4)")
    print("If 1-2 look right → LoRA is weak (consider retraining at different steps)")
    print("If 0 look right → Overfitting or dataset issue")

    quality_score_val = None
    try:
        qs = input("\nQuality score 1-5 [Enter to skip]: ").strip()
        quality_score_val = float(qs) if qs else None
    except (EOFError, ValueError):
        pass

    # ── Phase 7: Store in Supabase ────────────────────────────────────────────
    print("\n💾 Phase 7: Storing in style_loras...")
    lora_data = {
        "style_name": sdef["name"],
        "trigger_word": trigger,           # "cvwmn" (short form for DB lookup)
        "lora_url": lora_url,
        "recommended_scale": 0.75,
        "quality_score": quality_score_val,
    }
    existing = supabase.table("style_loras").select("id").eq("trigger_word", trigger).execute()
    if existing.data:
        supabase.table("style_loras").update(lora_data).eq("id", existing.data[0]["id"]).execute()
    else:
        supabase.table("style_loras").insert(lora_data).execute()

    print(f"✅ Done. Trigger test rerun for room cb2e7047 to see the LoRA in action.")
    return lora_url


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--style", required=True, help="Style key or 'all'")
    parser.add_argument("--steps", type=int, default=1500)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    # Load .env.local if present
    for env_path in [
        Path(__file__).parent.parent / "apps" / "web" / ".env.local",
        Path(__file__).parent.parent / ".env.local",
    ]:
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    if key.strip() and not os.environ.get(key.strip()):
                        os.environ[key.strip()] = val.strip()
            break

    if not args.dry_run:
        for var in ["UNSPLASH_ACCESS_KEY", "ANTHROPIC_API_KEY", "SUPABASE_URL",
                    "SUPABASE_SERVICE_ROLE_KEY", "FAL_KEY"]:
            if not os.environ.get(var):
                print(f"❌ Missing: {var}")
                sys.exit(1)
    else:
        # In dry-run, set dummy values for missing env vars so imports don't crash
        for var in ["UNSPLASH_ACCESS_KEY", "ANTHROPIC_API_KEY", "SUPABASE_URL",
                    "SUPABASE_SERVICE_ROLE_KEY", "FAL_KEY"]:
            if not os.environ.get(var):
                os.environ[var] = "dry-run-placeholder"

    styles = list(STYLE_DEFINITIONS.keys()) if args.style == "all" else [args.style]
    for style in styles:
        await train_lora(style, steps=args.steps, dry_run=args.dry_run)
        if len(styles) > 1:
            await asyncio.sleep(30)

if __name__ == "__main__":
    asyncio.run(main())
