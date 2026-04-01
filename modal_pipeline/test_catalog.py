"""
Cova M2 — Seed Catalog Validation
Tests pgvector cosine similarity search against existing products table.

Usage:
    python modal_pipeline/test_catalog.py "japandi sofa natural wood"
    python modal_pipeline/test_catalog.py "bohemian rug colorful"
    python modal_pipeline/test_catalog.py "minimalist white desk"

Requires:
    pip install supabase replicate
    SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local
    REPLICATE_API_TOKEN in apps/web/.env.local
"""

import os
import sys
from pathlib import Path


def load_env():
    """Load environment variables from apps/web/.env.local."""
    env_path = Path(__file__).parent.parent / "apps" / "web" / ".env.local"
    if not env_path.exists():
        print(f"Error: {env_path} not found")
        sys.exit(1)
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition("=")
        if key and value:
            os.environ.setdefault(key.strip(), value.strip())


def get_clip_embedding(text: str) -> list[float]:
    """Generate a 768-dim CLIP text embedding using Replicate."""
    import replicate

    output = replicate.run(
        "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
        input={"inputs": text},
    )

    # Output is a list of dicts with 'embedding' key
    if isinstance(output, list) and len(output) > 0:
        return output[0]["embedding"]
    raise ValueError(f"Unexpected CLIP output format: {type(output)}")


def search_products(embedding: list[float], limit: int = 10) -> list[dict]:
    """Run pgvector cosine similarity search against products table."""
    from supabase import create_client

    client = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    # Use the existing RPC function
    result = client.rpc(
        "search_products_by_embedding",
        {
            "query_embedding": embedding,
            "match_threshold": 0.3,
            "match_count": limit,
        },
    ).execute()

    if result.data:
        return result.data

    # Fallback: raw SQL via PostgREST if RPC fails
    print("Warning: RPC failed, trying direct query...")
    embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"
    result = client.rpc(
        "search_products_by_embedding",
        {
            "query_embedding": embedding_str,
            "match_threshold": 0.1,
            "match_count": limit,
        },
    ).execute()

    return result.data or []


def main():
    if len(sys.argv) < 2:
        print("Usage: python test_catalog.py <search query>")
        print('Example: python test_catalog.py "japandi sofa natural wood"')
        sys.exit(1)

    query = " ".join(sys.argv[1:])
    load_env()

    print(f"\nQuery: {query!r}")
    print("Generating CLIP embedding via Replicate...")

    embedding = get_clip_embedding(query)
    print(f"Embedding: {len(embedding)} dimensions")

    print(f"\nSearching {len(embedding)}-dim vectors in products table...")
    results = search_products(embedding)

    if not results:
        print("\nNo results found. Check:")
        print("  - products table has clip_embedding values")
        print("  - search_products_by_embedding RPC exists")
        print("  - match_threshold is not too high")
        return

    print(f"\n{'='*80}")
    print(f"Top {len(results)} results for: {query!r}")
    print(f"{'='*80}\n")

    for i, p in enumerate(results, 1):
        similarity = p.get("similarity", "N/A")
        if isinstance(similarity, float):
            similarity = f"{similarity:.4f}"

        print(f"  {i:2d}. {p.get('name', 'Unknown')}")
        print(f"      Retailer: {p.get('retailer', '?')}  |  Price: ${p.get('price', '?')}")
        print(f"      Category: {p.get('category', '?')}")
        print(f"      Similarity: {similarity}")
        print(f"      Styles: {p.get('style_tags', [])}")
        print(f"      Image: {p.get('image_url', 'N/A')}")
        print()


if __name__ == "__main__":
    main()
