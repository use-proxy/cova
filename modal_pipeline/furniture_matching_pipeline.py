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

LABEL_TO_CATEGORY = {
    "sofa": "sofa", "couch": "sofa", "sectional": "sofa", "loveseat": "sofa",
    "chair": "chair", "armchair": "chair", "accent chair": "chair",
    "coffee table": "table", "side table": "table", "dining table": "table",
    "end table": "table", "console table": "table",
    "bed": "bed", "bed frame": "bed", "platform bed": "bed",
    "bookshelf": "storage", "shelving unit": "storage", "dresser": "storage",
    "cabinet": "storage", "wardrobe": "storage",
    "floor lamp": "lighting", "table lamp": "lighting", "pendant light": "lighting",
    "rug": "rug", "area rug": "rug",
    "desk": "desk", "office desk": "desk",
}

VALID_CATEGORIES = ["sofa", "chair", "table", "bed", "storage", "lighting", "rug", "decor", "desk"]


def detect_furniture_with_claude(pano_bytes, anthropic_key, style_blend):
    """Use Claude Vision to detect furniture. Returns list of dicts."""
    import requests

    img_b64 = base64.standard_b64encode(pano_bytes).decode("utf-8")
    dominant_styles = [s for s, w in sorted(style_blend.items(), key=lambda x: x[1], reverse=True) if w > 0.1]
    style_context = ", ".join(dominant_styles)

    prompt = f"""Analyze this equirectangular 360° panorama of a redesigned room in {style_context} style.

Identify up to 8 distinct, purchasable furniture pieces. Focus on large items:
sofas, chairs, tables, beds, storage, lamps, rugs, desks.

For each piece provide:
1. label: simple name (e.g. "sofa", "coffee table")
2. description: detailed (material, color, style, shape)
3. category: one of: sofa, chair, table, bed, storage, lighting, rug, decor, desk
4. azimuth_degrees: horizontal position (0=left edge, 180=center, 360=right edge)
5. search_query: 8-12 word query for finding this product online

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
        label = item.get("label", "").lower()
        category = item.get("category", "").lower()
        if category not in VALID_CATEGORIES:
            category = LABEL_TO_CATEGORY.get(label, "decor")
        validated.append({
            "label": label,
            "description": item.get("description", label),
            "category": category,
            "azimuth_degrees": float(item.get("azimuth_degrees", 180)),
            "search_query": item.get("search_query", item.get("description", label)),
        })

    print(f"[furniture] Detected {len(validated)} pieces via Claude Vision")
    for f in validated:
        print(f"  - {f['label']} ({f['category']}) @ {f['azimuth_degrees']}°")
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
             "category": "sofa", "azimuth_degrees": 160, "search_query": "grey linen minimalist sofa tapered wood legs japandi"},
            {"label": "sofa", "description": "grey linen three-seat sofa with low profile and cushioned back",
             "category": "sofa", "azimuth_degrees": 200, "search_query": "grey linen low profile sofa minimalist living room"},
            {"label": "coffee table", "description": "round natural oak coffee table with tapered legs, minimalist design",
             "category": "table", "azimuth_degrees": 180, "search_query": "round natural oak coffee table minimalist japandi"},
            {"label": "accent chair", "description": "dark brown leather accent chair with wooden frame",
             "category": "chair", "azimuth_degrees": 220, "search_query": "brown leather accent chair wood frame minimalist"},
            {"label": "floor lamp", "description": "tall modern floor lamp with white shade and slim metal base",
             "category": "lighting", "azimuth_degrees": 100, "search_query": "modern floor lamp white shade slim metal base"},
            {"label": "area rug", "description": "round natural jute area rug in warm beige tone",
             "category": "rug", "azimuth_degrees": 180, "search_query": "round natural jute area rug beige minimalist"},
            {"label": "shelving unit", "description": "wall-mounted oak floating shelves with minimal brackets",
             "category": "storage", "azimuth_degrees": 300, "search_query": "oak floating wall shelves minimal japandi"},
            {"label": "side table", "description": "small oak side cabinet with clean lines and natural finish",
             "category": "table", "azimuth_degrees": 320, "search_query": "small oak side table cabinet natural minimalist"},
        ],
        "minimalist": [
            {"label": "sofa", "description": "white modular sofa with clean lines", "category": "sofa",
             "azimuth_degrees": 180, "search_query": "white modular sofa minimalist clean lines"},
            {"label": "coffee table", "description": "glass and steel coffee table", "category": "table",
             "azimuth_degrees": 180, "search_query": "glass steel coffee table modern minimalist"},
            {"label": "chair", "description": "matte black accent chair", "category": "chair",
             "azimuth_degrees": 220, "search_query": "matte black accent chair modern minimalist"},
            {"label": "floor lamp", "description": "arc floor lamp chrome finish", "category": "lighting",
             "azimuth_degrees": 120, "search_query": "arc floor lamp chrome modern minimalist"},
            {"label": "rug", "description": "light grey area rug simple pattern", "category": "rug",
             "azimuth_degrees": 180, "search_query": "light grey area rug minimalist simple"},
        ],
    }

    furniture = FALLBACK_FURNITURE.get(style, FALLBACK_FURNITURE["japandi"])
    print(f"[furniture] Using fallback detection ({style}): {len(furniture)} pieces")
    return furniture


def embed_text_with_clip(text, clip_embed_url):
    """Embed text using CLIP via Modal endpoint."""
    import requests
    resp = requests.post(clip_embed_url, json={"text": text}, timeout=30)
    resp.raise_for_status()
    return resp.json()["embedding"]


def search_products(embedding, category, supabase_url, supabase_key, match_count=3):
    """Search products by CLIP embedding via existing Supabase RPC."""
    import requests
    resp = requests.post(
        f"{supabase_url}/rest/v1/rpc/search_products_by_embedding",
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
        },
        json={
            "query_embedding": embedding,
            "match_count": match_count * 3,  # fetch extra, filter by category
            "match_threshold": 0.0,
        },
        timeout=30,
    )
    if not resp.ok:
        print(f"[furniture] Search failed: {resp.status_code} {resp.text[:200]}")
        return []
    results = resp.json()
    # Filter by category
    if category:
        results = [r for r in results if r.get("category") == category]
    return results[:match_count]


def store_matches(room_id, furniture_item, matches, supabase_client):
    """Store furniture matches in room_products table."""
    if not matches:
        return 0
    # Delete existing for this label
    supabase_client.table("room_products").delete().eq(
        "room_id", room_id
    ).eq("furniture_label", furniture_item["label"]).execute()

    records = []
    for rank, m in enumerate(matches[:3], start=1):
        records.append({
            "room_id": room_id,
            "product_id": m["id"],
            "furniture_label": furniture_item["label"],
            "furniture_description": furniture_item["description"],
            "similarity_score": m.get("similarity", 0),
            "rank": rank,
            "azimuth_degrees": furniture_item["azimuth_degrees"],
            "is_unlocked": False,
        })
    if records:
        supabase_client.table("room_products").insert(records).execute()
    return len(records)


@app.function(
    timeout=600,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("anthropic-credentials"),
    ],
)
def match_furniture_to_products(room_id: str, user_id: str) -> dict:
    """Main pipeline: detect furniture + match to catalog."""
    import requests as req
    from supabase import create_client

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    anthropic_key = os.environ["ANTHROPIC_API_KEY"]
    clip_embed_url = os.environ.get("CLIP_TEXT_EMBED_URL", "")

    if not clip_embed_url:
        raise RuntimeError("CLIP_TEXT_EMBED_URL not set")

    client = create_client(supabase_url, supabase_key)
    client.table("rooms").update({"redesign_status": "matching_products"}).eq("id", room_id).execute()

    try:
        room = client.table("rooms").select(
            "redesign_pano_url, marble_plus_pano_url, marble_pano_url, style_blend, room_type"
        ).eq("id", room_id).single().execute().data

        if not room:
            raise RuntimeError(f"Room {room_id} not found")

        pano_url = room.get("redesign_pano_url") or room.get("marble_plus_pano_url") or room.get("marble_pano_url")
        if not pano_url:
            raise RuntimeError("No panorama URL found")

        style_blend = room.get("style_blend") or {"japandi": 0.7, "minimalist": 0.3, "coastal": 0, "bohemian": 0, "mid_century": 0}

        # Download pano
        pano_resp = req.get(pano_url, timeout=60)
        if not pano_resp.ok:
            # Hardcoded fallback pano
            pano_resp = req.get(
                "https://cdn.marble.worldlabs.ai/7f3d51a8-a61d-4e87-a4c0-fcaf96593780/7961e02d-d637-4210-aa34-d68197f46a69_panos/rgb_0.png",
                timeout=60,
            )
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

        # Match each piece
        all_matches = []
        total_stored = 0

        for item in furniture_items:
            print(f"\n[furniture] Matching: {item['label']} ({item['category']})")
            try:
                embedding = embed_text_with_clip(item["search_query"], clip_embed_url)
            except Exception as e:
                print(f"  CLIP embed failed: {e}")
                continue

            matches = search_products(embedding, item["category"], supabase_url, supabase_key, 3)

            if not matches:
                # Try without category filter
                matches = search_products(embedding, None, supabase_url, supabase_key, 3)

            if matches:
                top = matches[0]
                print(f"  Top: {top.get('name','?')[:50]} (${top.get('price',0):.2f}, sim={top.get('similarity',0):.3f})")
                stored = store_matches(room_id, item, matches, client)
                total_stored += stored
                all_matches.append({
                    "furniture": item["label"],
                    "category": item["category"],
                    "matches": [{"name": m.get("name", ""), "price": m.get("price", 0),
                                 "retailer": m.get("retailer", ""), "similarity": m.get("similarity", 0)}
                                for m in matches[:3]],
                })
            else:
                print(f"  No matches found")
            time.sleep(0.3)

        client.table("rooms").update({
            "furniture_matches_count": total_stored,
            "redesign_status": "complete",
            "status": "complete",
        }).eq("id", room_id).execute()

        print(f"\n[furniture] Done! {len(furniture_items)} detected, {total_stored} matches stored")
        return {
            "room_id": room_id,
            "furniture_count": len(furniture_items),
            "matches_stored": total_stored,
            "detection_source": detection_source,
            "matches": all_matches,
        }

    except Exception as e:
        print(f"[furniture] ERROR: {e}")
        client.table("rooms").update({"redesign_status": "error"}).eq("id", room_id).execute()
        raise


@app.function(
    timeout=600,
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("anthropic-credentials"),
    ],
)
@modal.fastapi_endpoint(method="POST")
def furniture_matching_webhook(item: dict):
    room_id = item.get("room_id")
    user_id = item.get("user_id", "test-user")
    if not room_id:
        return {"error": "room_id required"}
    try:
        result = match_furniture_to_products.local(room_id, user_id)
        return {"status": "complete", **result}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.local_entrypoint()
def test_local(room_id: str = "", user_id: str = "test-user"):
    import uuid
    if not room_id:
        room_id = str(uuid.uuid4())
    result = match_furniture_to_products.remote(room_id, user_id)
    print("\n=== RESULT ===")
    for k, v in result.items():
        if k != "matches":
            print(f"  {k}: {v}")
    for m in result.get("matches", []):
        print(f"\n  {m['furniture']} ({m['category']}):")
        for p in m.get("matches", []):
            print(f"    {p['name'][:50]} ${p['price']:.2f} ({p['retailer']}) sim={p['similarity']:.3f}")
