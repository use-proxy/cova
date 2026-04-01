"""
Test script for M7 Session 4 — Furniture detection + CLIP matching.
Tests CLIP embed + pgvector search with fallback furniture detection.
Run: python modal_pipeline/test_furniture_session4.py
"""
import json
import sys
import time
from pathlib import Path

import requests

# Marble Plus pano (permanent, won't expire)
TEST_PANO_URL = (
    "https://cdn.marble.worldlabs.ai/"
    "7f3d51a8-a61d-4e87-a4c0-fcaf96593780/"
    "7961e02d-d637-4210-aa34-d68197f46a69_panos/rgb_0.png"
)

TEST_STYLE_BLEND = {
    "japandi": 0.7, "minimalist": 0.3,
    "coastal": 0.0, "bohemian": 0.0, "mid_century": 0.0,
}

FALLBACK_FURNITURE = [
    {"label": "sofa", "description": "grey linen two-seat sofa with clean lines and tapered oak legs",
     "category": "sofa", "azimuth_degrees": 160,
     "search_query": "grey linen minimalist sofa tapered wood legs japandi"},
    {"label": "sofa", "description": "grey linen three-seat sofa with low profile",
     "category": "sofa", "azimuth_degrees": 200,
     "search_query": "grey linen low profile sofa minimalist living room"},
    {"label": "coffee table", "description": "round natural oak coffee table with tapered legs",
     "category": "table", "azimuth_degrees": 180,
     "search_query": "round natural oak coffee table minimalist japandi"},
    {"label": "accent chair", "description": "dark brown leather accent chair with wooden frame",
     "category": "chair", "azimuth_degrees": 220,
     "search_query": "brown leather accent chair wood frame minimalist"},
    {"label": "floor lamp", "description": "tall modern floor lamp with white shade",
     "category": "lighting", "azimuth_degrees": 100,
     "search_query": "modern floor lamp white shade slim metal base"},
    {"label": "area rug", "description": "round natural jute area rug",
     "category": "rug", "azimuth_degrees": 180,
     "search_query": "round natural jute area rug beige minimalist"},
    {"label": "shelving unit", "description": "wall-mounted oak floating shelves",
     "category": "storage", "azimuth_degrees": 300,
     "search_query": "oak floating wall shelves minimal japandi"},
    {"label": "side table", "description": "small oak side cabinet with natural finish",
     "category": "table", "azimuth_degrees": 320,
     "search_query": "small oak side table cabinet natural minimalist"},
]


def load_env():
    env = {}
    env_path = Path(__file__).parent.parent / "apps" / "web" / ".env.local"
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        k, _, v = line.partition("=")
        if k and v:
            env[k.strip()] = v.strip()
    return env


def test_clip_and_search(env):
    clip_url = env.get("CLIP_TEXT_EMBED_URL", "")
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL", "")
    supabase_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if not clip_url:
        print("ERROR: No CLIP_TEXT_EMBED_URL")
        sys.exit(1)

    print("=== Testing CLIP Embed + Product Search ===\n")
    all_matches = []

    for item in FALLBACK_FURNITURE:
        print(f"  {item['label']} ({item['category']}): {item['search_query']}")

        # Embed
        t0 = time.time()
        embed_resp = requests.post(clip_url, json={"text": item["search_query"]}, timeout=60)
        if not embed_resp.ok:
            print(f"    CLIP failed: {embed_resp.status_code}")
            continue
        embedding = embed_resp.json()["embedding"]
        embed_time = time.time() - t0

        # Search (with extra results, filter by category)
        search_resp = requests.post(
            f"{supabase_url}/rest/v1/rpc/search_products_by_embedding",
            headers={
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "application/json",
            },
            json={"query_embedding": embedding, "match_count": 10, "match_threshold": 0.0},
            timeout=30,
        )
        if not search_resp.ok:
            print(f"    Search failed: {search_resp.status_code}")
            continue

        results = search_resp.json()
        # Filter by category
        cat_results = [r for r in results if r.get("category") == item["category"]][:3]
        if not cat_results:
            cat_results = results[:3]  # fallback: any category

        if cat_results:
            top = cat_results[0]
            print(f"    -> {top['name'][:55]} (${top['price']:.2f}, {top['retailer']}, "
                  f"sim={top.get('similarity', 0):.3f}) [{embed_time:.1f}s]")
            all_matches.append({
                "furniture": item["label"],
                "category": item["category"],
                "azimuth_degrees": item["azimuth_degrees"],
                "top_match": {
                    "name": top["name"],
                    "price": top["price"],
                    "retailer": top["retailer"],
                    "similarity": top.get("similarity", 0),
                    "image_url": top.get("image_url", ""),
                    "affiliate_url": top.get("affiliate_url", ""),
                },
                "all_matches": [
                    {"name": m["name"], "price": m["price"], "retailer": m["retailer"],
                     "similarity": m.get("similarity", 0)}
                    for m in cat_results[:3]
                ],
            })
        else:
            print(f"    -> No matches")

    return all_matches


if __name__ == "__main__":
    env = load_env()

    # Verify pano accessible
    pano_check = requests.head(TEST_PANO_URL, timeout=10)
    print(f"Pano accessible: {pano_check.status_code == 200}")

    # Run matching
    matches = test_clip_and_search(env)

    # Save results
    results = {
        "pano_url": TEST_PANO_URL,
        "furniture_detected": FALLBACK_FURNITURE,
        "detection_source": "fallback",
        "style_blend": TEST_STYLE_BLEND,
        "product_matches": matches,
    }
    results_path = Path(__file__).parent / "test_session4_results.json"
    results_path.write_text(json.dumps(results, indent=2))

    # Summary
    print(f"\n=== SUMMARY ===")
    print(f"  Furniture pieces: {len(FALLBACK_FURNITURE)}")
    print(f"  Products matched: {len(matches)}")
    sim_scores = [m["top_match"]["similarity"] for m in matches if m.get("top_match")]
    if sim_scores:
        print(f"  Similarity range: {min(sim_scores):.3f} - {max(sim_scores):.3f}")
        print(f"  Mean similarity: {sum(sim_scores)/len(sim_scores):.3f}")

    for m in matches:
        t = m["top_match"]
        print(f"  {m['furniture']:15s} -> {t['name'][:40]:40s} ${t['price']:>8.2f} "
              f"({t['retailer']:10s}) sim={t['similarity']:.3f}")

    print(f"\nResults saved: {results_path}")

    success = len(matches) >= 4 and all(m["top_match"]["similarity"] > 0.05 for m in matches)
    print(f"\n{'Session 4 PASS' if success else 'Session 4 FAIL'}")
    sys.exit(0 if success else 1)
