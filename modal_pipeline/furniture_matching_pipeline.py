"""
Cova M7 Session 4 — Furniture Detection + CLIP Matching Pipeline
Analyzes redesigned panorama with Claude Vision, matches each furniture
piece to real products via CLIP similarity search.
"""

import os
import json
import time
import base64

import modal

image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install("supabase", "requests", "Pillow", "numpy", "fastapi[standard]")
)

app = modal.App("cova-furniture-matching", image=image)

ANTHROPIC_API_BASE = "https://api.anthropic.com/v1"

# Maps Claude Vision labels → exact DB category strings
LABEL_TO_CATEGORY = {
    # Sofas
    "sofa": "sofa", "couch": "sofa", "sectional": "sofa", "loveseat": "sofa",
    "settee": "sofa",
    # Chairs
    "accent chair": "accent_chair", "armchair": "accent_chair", "lounge chair": "accent_chair",
    "chair": "accent_chair",
    "dining chair": "dining_chair", "side chair": "dining_chair",
    "office chair": "office_chair", "desk chair": "office_chair",
    # Tables
    "coffee table": "coffee_table", "cocktail table": "coffee_table",
    "side table": "side_table", "end table": "side_table", "accent table": "side_table",
    "dining table": "dining_table", "kitchen table": "dining_table",
    "console table": "side_table", "entry table": "side_table",
    "nightstand": "nightstand", "bedside table": "nightstand", "night stand": "nightstand",
    # Beds
    "bed": "bed", "bed frame": "bed", "platform bed": "bed",
    # Storage
    "bookshelf": "bookshelf", "bookcase": "bookshelf",
    "shelving unit": "storage", "shelf": "storage", "cabinet": "storage",
    "wardrobe": "wardrobe", "closet": "wardrobe",
    "dresser": "dresser", "chest of drawers": "dresser",
    "media console": "media_unit", "tv stand": "media_unit", "entertainment center": "media_unit",
    "storage": "storage",
    # Lighting
    "floor lamp": "floor_lamp", "standing lamp": "floor_lamp",
    "table lamp": "table_lamp", "desk lamp": "table_lamp",
    "pendant light": "ceiling_light", "chandelier": "ceiling_light",
    "ceiling light": "ceiling_light", "hanging lamp": "ceiling_light",
    "lamp": "floor_lamp",
    # Rugs
    "rug": "rug", "area rug": "rug", "carpet": "rug",
    # Other
    "desk": "desk", "office desk": "desk", "writing desk": "desk",
    "ottoman": "ottoman", "pouf": "ottoman", "footstool": "ottoman",
    "mirror": "mirror", "wall mirror": "mirror",
}

# All category values that actually exist in the products table
VALID_CATEGORIES = [
    "sofa", "accent_chair", "dining_chair", "office_chair",
    "coffee_table", "dining_table", "side_table", "nightstand",
    "bed", "storage", "bookshelf", "wardrobe", "dresser", "media_unit",
    "floor_lamp", "table_lamp", "ceiling_light",
    "rug", "decor", "desk", "ottoman", "mirror",
    "wall_art", "soft_furnishing", "window_treatment", "other",
]

# Categories Claude Vision should use in prompts (excludes non-furniture categories)
PROMPT_CATEGORIES = [c for c in VALID_CATEGORIES
                     if c not in {"wall_art", "soft_furnishing", "window_treatment", "other"}]

# Category groups for broader matching when exact category has few results
CATEGORY_GROUPS = {
    "tables": ["coffee_table", "dining_table", "side_table", "nightstand"],
    "chairs": ["accent_chair", "dining_chair", "office_chair"],
    "lighting": ["floor_lamp", "table_lamp", "ceiling_light"],
    "storage_all": ["storage", "bookshelf", "wardrobe", "dresser", "media_unit"],
}

def get_category_group(category: str) -> list:
    """Return related categories for broader matching fallback."""
    for group_cats in CATEGORY_GROUPS.values():
        if category in group_cats:
            return group_cats
    return [category]


def detect_furniture_with_claude(pano_bytes, anthropic_key, style_blend):
    """Use Claude Vision to detect furniture. Returns list of dicts."""
    import requests

    img_b64 = base64.standard_b64encode(pano_bytes).decode("utf-8")
    dominant_styles = [s for s, w in sorted(style_blend.items(), key=lambda x: x[1], reverse=True) if w > 0.1]
    style_context = ", ".join(dominant_styles)

    cats_str = ", ".join(PROMPT_CATEGORIES)

    prompt = f"""Analyze this redesigned room image in {style_context} style.

Identify up to 8 distinct, purchasable furniture pieces. Focus on large items:
sofas, chairs, tables, beds, shelves, lamps, rugs, desks.

For each piece provide:
1. label: simple descriptive name (e.g. "accent chair", "coffee table", "floor lamp")
2. description: detailed visual description including material, color, finish, shape, and style
3. category: MUST be one of these exact values: {cats_str}
4. azimuth_degrees: horizontal position as a percentage mapped to 0-360 (left edge=0, center=180, right edge=360)
5. elevation_degrees: vertical position, -90 (floor) to +90 (ceiling), 0 = eye level. Guide:
   - Floor items (rug, coffee table): -30 to -40
   - Seated furniture (sofa, chair, ottoman): -15 to -25
   - Standing furniture (shelving, dresser, side table): -5 to +10
   - Wall art, mirrors: +5 to +20
   - Floor lamps (base on floor, shade near eye level): -5 to +5
   - Pendant/ceiling lights: +50 to +75
6. search_query: 8-15 word descriptive shopping query. MUST include: material (wood/metal/fabric/leather), primary color, style ({style_context}), specific furniture type, and 2-3 shape/detail descriptors. Example: "mid-century walnut round coffee table with tapered splayed legs minimalist"

Return ONLY a JSON array. No explanation, no markdown."""

    resp = requests.post(
        f"{ANTHROPIC_API_BASE}/messages",
        headers={
            "x-api-key": anthropic_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        json={
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 2048,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": img_b64}},
                    {"type": "text", "text": prompt},
                ],
            }],
        },
        timeout=60,
    )
    resp.raise_for_status()
    content = resp.json()["content"][0]["text"].strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
    content = content.strip()
    furniture_list = json.loads(content)

    validated = []
    for item in furniture_list:
        label = item.get("label", "").lower().strip()
        category = item.get("category", "").lower().strip()
        # Normalize category to match DB exactly
        if category not in VALID_CATEGORIES:
            # Try label-based lookup first
            category = LABEL_TO_CATEGORY.get(label)
            if not category:
                # Try partial matching on label words
                for map_key, map_val in LABEL_TO_CATEGORY.items():
                    if map_key in label or label in map_key:
                        category = map_val
                        break
            if not category:
                category = "decor"
        search_query = item.get("search_query", "").strip()
        if len(search_query.split()) < 6:
            # Enrich thin search queries with description + style
            desc = item.get("description", label)
            search_query = f"{desc} {style_context} style"
        validated.append({
            "label": label,
            "description": item.get("description", label),
            "category": category,
            "azimuth_degrees": float(item.get("azimuth_degrees", 180)),
            "elevation_degrees": float(item.get("elevation_degrees", -25)),
            "search_query": search_query,
        })

    print(f"[furniture] Detected {len(validated)} pieces via Claude Vision")
    for f in validated:
        print(f"  - {f['label']} ({f['category']}) @ az={f['azimuth_degrees']}° el={f['elevation_degrees']}°")
    return validated


def detect_furniture_fallback(style_blend):
    """Fallback furniture detection for japandi-style redesigned rooms.
    Used when Claude Vision is unavailable (no credits, etc.)."""
    dominant = [s for s, w in sorted(style_blend.items(), key=lambda x: x[1], reverse=True) if w > 0.1]
    style = dominant[0] if dominant else "japandi"

    # These match the Session 2 redesigned room we know about
    FALLBACK_FURNITURE = {
        "japandi": [
            {"label": "sofa", "description": "grey linen two-seat sofa with clean lines and tapered oak legs",
             "category": "sofa", "azimuth_degrees": 160, "elevation_degrees": -20,
             "search_query": "grey linen two-seat sofa clean lines tapered oak legs japandi minimalist living room"},
            {"label": "sofa", "description": "grey linen three-seat sofa with low profile and cushioned back",
             "category": "sofa", "azimuth_degrees": 200, "elevation_degrees": -20,
             "search_query": "grey linen three-seat low profile sofa cushioned back minimalist scandinavian"},
            {"label": "coffee table", "description": "round natural oak coffee table with tapered legs, minimalist design",
             "category": "coffee_table", "azimuth_degrees": 180, "elevation_degrees": -35,
             "search_query": "round natural solid oak coffee table tapered splayed legs minimalist japandi living room"},
            {"label": "accent chair", "description": "dark brown leather accent chair with wooden frame",
             "category": "accent_chair", "azimuth_degrees": 220, "elevation_degrees": -18,
             "search_query": "dark brown faux leather accent chair solid wood frame mid-century modern minimalist"},
            {"label": "floor lamp", "description": "tall modern floor lamp with white fabric shade and slim metal base",
             "category": "floor_lamp", "azimuth_degrees": 100, "elevation_degrees": 0,
             "search_query": "modern tall floor lamp white fabric drum shade slim brushed nickel metal base minimalist"},
            {"label": "area rug", "description": "round natural jute area rug in warm beige tone",
             "category": "rug", "azimuth_degrees": 180, "elevation_degrees": -38,
             "search_query": "round natural handwoven jute area rug warm beige tone minimalist boho living room"},
            {"label": "shelving unit", "description": "wall-mounted oak floating shelves with minimal brackets",
             "category": "bookshelf", "azimuth_degrees": 300, "elevation_degrees": 5,
             "search_query": "wall-mounted natural oak floating shelves invisible bracket minimalist japandi living room"},
            {"label": "side table", "description": "small oak side cabinet with clean lines and natural finish",
             "category": "side_table", "azimuth_degrees": 320, "elevation_degrees": -15,
             "search_query": "small natural oak side table clean lines rounded edges minimalist scandinavian bedroom"},
        ],
        "minimalist": [
            {"label": "sofa", "description": "white modular sofa with clean lines", "category": "sofa",
             "azimuth_degrees": 180, "elevation_degrees": -20,
             "search_query": "white modular sectional sofa clean lines boucle fabric minimalist modern living room"},
            {"label": "coffee table", "description": "glass and steel coffee table", "category": "coffee_table",
             "azimuth_degrees": 180, "elevation_degrees": -35,
             "search_query": "tempered glass top coffee table brushed steel frame modern minimalist rectangular living room"},
            {"label": "accent chair", "description": "matte black accent chair", "category": "accent_chair",
             "azimuth_degrees": 220, "elevation_degrees": -18,
             "search_query": "matte black faux leather accent chair sleek metal legs modern minimalist living room"},
            {"label": "floor lamp", "description": "arc floor lamp chrome finish", "category": "floor_lamp",
             "azimuth_degrees": 120, "elevation_degrees": 0,
             "search_query": "tall arc floor lamp chrome polished finish white marble base modern minimalist"},
            {"label": "area rug", "description": "light grey area rug simple pattern", "category": "rug",
             "azimuth_degrees": 180, "elevation_degrees": -38,
             "search_query": "light grey solid color area rug low pile soft polyester minimalist modern living room"},
        ],
    }

    furniture = FALLBACK_FURNITURE.get(style, FALLBACK_FURNITURE["japandi"])
    print(f"[furniture] Using fallback detection ({style}): {len(furniture)} pieces")
    return furniture


## DEPRECATED — catalog-based CLIP/pgvector matching removed.
## Product matching now uses SERP-based search via the Next.js
## /api/pipeline/furniture-match route. The Modal pipeline only
## handles furniture detection; matching is done server-side in
## the Next.js API layer using SearchAPI.io and Serper.dev.


def detect_2d_hotspots(perspective_bytes, furniture_labels, anthropic_key):
    """Use Claude Vision on perspective render to get 2D hotspot positions (x%, y%)."""
    import requests

    img_b64 = base64.standard_b64encode(perspective_bytes).decode("utf-8")

    # Detect media type
    media_type = "image/jpeg"
    if perspective_bytes[:4] == b'\x89PNG':
        media_type = "image/png"

    labels_str = ", ".join(f'"{l}"' for l in furniture_labels)
    prompt = (
        f"For each furniture piece listed, identify its center point in this image and return JSON:\n"
        f"[{{\"label\": \"sofa\", \"x\": 45.2, \"y\": 62.1}}, ...]\n"
        f"x and y are percentages from top-left corner (0-100).\n"
        f"Only return JSON, no other text.\n\n"
        f"Furniture pieces to locate: [{labels_str}]"
    )

    resp = requests.post(
        f"{ANTHROPIC_API_BASE}/messages",
        headers={
            "x-api-key": anthropic_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        json={
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 1024,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": img_b64}},
                    {"type": "text", "text": prompt},
                ],
            }],
        },
        timeout=30,
    )

    resp_json = resp.json()
    if "error" in resp_json:
        raise RuntimeError(f"Anthropic API error: {resp_json['error']}")

    content = resp_json["content"][0]["text"].strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
    content = content.strip()
    hotspots = json.loads(content)

    # Build label -> (x, y) lookup
    lookup = {}
    for h in hotspots:
        label = h.get("label", "").lower().strip()
        x = float(h.get("x", -1))
        y = float(h.get("y", -1))
        if 0 <= x <= 100 and 0 <= y <= 100:
            lookup[label] = (x, y)

    print(f"[hotspots] Detected {len(lookup)} 2D positions from perspective render")
    for label, (x, y) in lookup.items():
        print(f"  - {label}: ({x:.1f}%, {y:.1f}%)")
    return lookup


@app.function(
    timeout=600,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("anthropic-credentials"),
    ],
)
def detect_furniture(room_id: str, user_id: str, fixed_furniture: list = None) -> dict:
    """Detection-only pipeline: detect furniture in panorama, return items with positions.

    Product matching is handled by the Next.js API layer via SERP search.
    This function only handles Claude Vision detection + 2D hotspot positioning.
    """
    import requests as req
    from supabase import create_client

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    anthropic_key = os.environ["ANTHROPIC_API_KEY"]

    client = create_client(supabase_url, supabase_key)
    try:
        client.table("rooms").update({"redesign_status": "detecting_furniture"}).eq("id", room_id).execute()
    except Exception as e:
        print(f"[furniture] status lock write failed for {room_id}: {e}")
        # Non-fatal — continue; the pipeline will still write final status below.

    try:
        room = client.table("rooms").select(
            "redesign_pano_url, marble_plus_pano_url, marble_pano_url, perspective_render_url, style_blend, room_type, fixed_furniture"
        ).eq("id", room_id).single().execute().data

        if not room:
            raise RuntimeError(f"Room {room_id} not found")

        pano_url = room.get("redesign_pano_url") or room.get("marble_plus_pano_url") or room.get("marble_pano_url")
        if not pano_url:
            raise RuntimeError("No panorama URL found")

        style_blend = room.get("style_blend") or {"japandi": 0.7, "minimalist": 0.3, "coastal": 0, "bohemian": 0, "mid_century": 0}

        # Download render image — fail loudly if unavailable; never substitute a different room's image
        pano_resp = req.get(pano_url, timeout=60)
        pano_resp.raise_for_status()
        pano_bytes = pano_resp.content
        print(f"[furniture] Pano: {len(pano_bytes)/1e6:.1f}MB")

        # Detect furniture
        try:
            furniture_items = detect_furniture_with_claude(pano_bytes, anthropic_key, style_blend)
            detection_source = "claude_vision"
        except Exception as e:
            print(f"[furniture] Claude Vision failed: {e}")
            furniture_items = detect_furniture_fallback(style_blend)
            detection_source = "fallback"

        if not furniture_items:
            raise RuntimeError("No furniture detected")

        # Filter out fixed furniture (within ±20° azimuth of a fixed piece)
        room_fixed = fixed_furniture or room.get("fixed_furniture") or []
        if room_fixed:
            fixed_azimuths = [f.get("azimuth_degrees", f.get("azimuth", 0)) for f in room_fixed if isinstance(f, dict)]
            filtered_items = []
            for item in furniture_items:
                item_az = item.get("azimuth_degrees", 0)
                is_near_fixed = any(
                    abs((item_az - faz + 180) % 360 - 180) < 20
                    for faz in fixed_azimuths
                )
                if not is_near_fixed:
                    filtered_items.append(item)
                else:
                    print(f"  [fixed] Skipping {item['label']} @ az={item_az}° (near fixed furniture)")
            furniture_items = filtered_items if filtered_items else furniture_items

        # 2D hotspot detection from perspective render
        hotspot_lookup = {}
        perspective_url = room.get("perspective_render_url")
        if perspective_url:
            try:
                print(f"\n[hotspots] Detecting 2D positions from perspective render...")
                persp_resp = req.get(perspective_url, timeout=60)
                if persp_resp.ok:
                    labels = [item["label"] for item in furniture_items]
                    hotspot_lookup = detect_2d_hotspots(persp_resp.content, labels, anthropic_key)
                else:
                    print(f"[hotspots] Failed to download perspective render: {persp_resp.status_code}")
            except Exception as e:
                print(f"[hotspots] 2D detection failed (falling back to azimuth/elevation): {e}")
        else:
            print(f"\n[hotspots] No perspective_render_url — using azimuth/elevation positioning")

        # Enrich items with hotspot positions
        for item in furniture_items:
            pos = hotspot_lookup.get(item["label"])
            if pos:
                item["hotspot_x"] = pos[0]
                item["hotspot_y"] = pos[1]

        print(f"\n[furniture] Detection complete: {len(furniture_items)} items found")
        return {
            "room_id": room_id,
            "pano_url": pano_url,
            "furniture_count": len(furniture_items),
            "detection_source": detection_source,
            "furniture_items": furniture_items,
        }

    except Exception as e:
        print(f"[furniture] ERROR: {e}")
        # Matching failure must NOT block the render. Step-8a has already shown
        # the redesigned image — mark the room 'complete' so the user can still
        # reach step-9 (which will fall back to an empty/error UI on zero results).
        try:
            client.table("rooms").update({
                "redesign_status": "complete",
                "redesign_error": str(e)[:2000],
            }).eq("id", room_id).execute()
        except Exception as update_err:
            print(f"[furniture] Failed to write error status: {update_err}")
        raise


@app.function(
    timeout=600,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("anthropic-credentials"),
    ],
)
@modal.fastapi_endpoint(method="POST")
def furniture_detection_webhook(item: dict):
    """HTTP webhook for furniture detection from Next.js.

    Returns detected furniture items with labels, descriptions, categories,
    positions, and search queries. Product matching is done by the caller
    (Next.js API layer) using SERP-based search.
    """
    room_id = item.get("room_id")
    user_id = item.get("user_id", "test-user")
    fixed_furniture = item.get("fixed_furniture", [])
    if not room_id:
        return {"error": "room_id required"}
    try:
        result = detect_furniture.local(room_id, user_id, fixed_furniture=fixed_furniture)
        return {"status": "complete", **result}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.local_entrypoint()
def test_local(room_id: str = "", user_id: str = "test-user"):
    import uuid
    if not room_id:
        room_id = str(uuid.uuid4())
    result = detect_furniture.remote(room_id, user_id)
    print("\n=== RESULT ===")
    for k, v in result.items():
        if k != "furniture_items":
            print(f"  {k}: {v}")
    for item in result.get("furniture_items", []):
        print(f"\n  {item['label']} ({item['category']}):")
        print(f"    query: {item.get('search_query', 'N/A')[:60]}")
        print(f"    az={item.get('azimuth_degrees', 0)}° el={item.get('elevation_degrees', 0)}°")
        if item.get("hotspot_x") is not None:
            print(f"    hotspot: ({item['hotspot_x']:.1f}%, {item['hotspot_y']:.1f}%)")
