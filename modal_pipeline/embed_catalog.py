# DORMANT — Curated product catalog infrastructure
# Not used by active v9 product matching (Serper + Google Lens + client-side CLIP).
# Preserved for possible future use (preferred-supplier feature, fallback path, or v2 catalog matching).
# Last reviewed: 2026-04-19
# Active v9 path lives in apps/web/app/api/match/route.ts

"""
M6 CLIP Embedding Pipeline — Embeds product images via Replicate CLIP on Modal.
Run: modal run modal_pipeline/embed_catalog.py
"""

import modal
import os
import time

image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install("replicate==0.25.1", "requests")
)

app = modal.App("cova-catalog-embedder", image=image)

REPLICATE_MODEL = "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a"
BATCH_SIZE = 100  # Larger batches, fewer containers


def infer_styles(name: str, category: str) -> list[str]:
    """Infer style tags from product name and category keywords."""
    name_lower = name.lower()
    styles = []

    if any(k in name_lower for k in ["coastal", "beach", "ocean", "nautical", "rattan", "wicker", "seagrass", "driftwood", "linen", "natural fiber"]):
        styles.append("coastal")
    if any(k in name_lower for k in ["japandi", "japanese", "scandinavian", "minimalist", "oak", "walnut", "neutral", "zen", "bamboo"]):
        styles.append("japandi")
    if any(k in name_lower for k in ["bohemian", "boho", "eclectic", "macrame", "fringe", "tassel", "colorful", "vintage", "moroccan", "tribal", "kilim"]):
        styles.append("bohemian")
    if any(k in name_lower for k in ["minimalist", "modern", "clean", "simple", "sleek", "white", "black", "concrete", "steel", "lacquer"]):
        styles.append("minimalist")
    if any(k in name_lower for k in ["mid-century", "midcentury", "retro", "eames", "danish", "teak", "hairpin", "tulip"]):
        styles.append("mid_century")

    if not styles:
        styles = ["coastal", "japandi", "bohemian", "minimalist", "mid_century"]

    return styles


@app.function(
    secrets=[
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("replicate-credentials"),
    ],
    timeout=7200,
    retries=1,
    max_containers=2,  # Max 2 containers to stay under rate limit
)
def embed_products_batch(product_ids: list[str]) -> dict:
    """Embed a batch of products by fetching their image URLs and running CLIP."""
    import replicate
    import requests

    # Build Supabase client via REST API (simpler than SDK)
    sb_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    sb_headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    # Fetch products needing embedding
    # PostgREST IN filter
    ids_filter = ",".join(f'"{pid}"' for pid in product_ids)
    resp = requests.get(
        f"{sb_url}/rest/v1/products?select=id,name,image_url,category,retailer&id=in.({ids_filter})",
        headers={"apikey": sb_key, "Authorization": f"Bearer {sb_key}"},
        timeout=30,
    )
    products = resp.json() if resp.status_code == 200 else []

    embedded = 0
    failed = 0

    for product in products:
        try:
            output = replicate.run(
                REPLICATE_MODEL,
                input={"inputs": product["image_url"]},
            )
            if isinstance(output, list) and len(output) > 0:
                embedding = output[0].get("embedding")
                if embedding and len(embedding) == 768:
                    styles = infer_styles(product["name"], product["category"] or "")
                    # Update product with embedding and styles
                    update_resp = requests.patch(
                        f"{sb_url}/rest/v1/products?id=eq.{product['id']}",
                        headers=sb_headers,
                        json={
                            "clip_embedding": embedding,
                            "style_tags": styles,
                        },
                        timeout=30,
                    )
                    if update_resp.status_code in (200, 204):
                        embedded += 1
                    else:
                        print(f"[embed] Update failed {product['id']}: {update_resp.status_code}")
                        failed += 1
                else:
                    failed += 1
            else:
                failed += 1
            time.sleep(1.2)  # Rate limit: ~50 req/min per container, 2 containers = ~100/min
        except Exception as e:
            err_msg = str(e)
            if "429" in err_msg or "throttled" in err_msg:
                print(f"[embed] Rate limited, sleeping 10s...")
                time.sleep(10)
                # Retry once
                try:
                    output = replicate.run(REPLICATE_MODEL, input={"inputs": product["image_url"]})
                    if isinstance(output, list) and len(output) > 0:
                        embedding = output[0].get("embedding")
                        if embedding and len(embedding) == 768:
                            styles = infer_styles(product["name"], product["category"] or "")
                            requests.patch(
                                f"{sb_url}/rest/v1/products?id=eq.{product['id']}",
                                headers=sb_headers, json={"clip_embedding": embedding, "style_tags": styles},
                                timeout=30,
                            )
                            embedded += 1
                            time.sleep(1.2)
                            continue
                except:
                    pass
            print(f"[embed] Failed {product['id']}: {err_msg[:100]}")
            failed += 1
            time.sleep(2)

    return {"embedded": embedded, "failed": failed, "total": len(products)}


@app.local_entrypoint()
def main():
    """Fetch all unembedded product IDs and distribute across Modal containers."""
    import urllib.request
    import json
    from pathlib import Path

    # Load env
    env_path = Path(__file__).parent.parent / "apps" / "web" / ".env.local"
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition("=")
        if key and value:
            os.environ.setdefault(key.strip(), value.strip())

    sb_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    sb_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    def sb_get(path):
        req = urllib.request.Request(
            f"{sb_url}/rest/v1/{path}",
            headers={"apikey": sb_key, "Authorization": f"Bearer {sb_key}"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())

    # Fetch all product IDs without embeddings (paginated)
    all_ids = []
    offset = 0
    limit = 1000
    while True:
        batch = sb_get(f"products?select=id&clip_embedding=is.null&order=id&limit={limit}&offset={offset}")
        if not batch:
            break
        all_ids.extend([p["id"] for p in batch])
        if len(batch) < limit:
            break
        offset += limit

    total = len(all_ids)
    print(f"[embed] {total} products need embedding")

    if total == 0:
        print("[embed] Nothing to embed!")
        return

    # Split into batches
    batches = [all_ids[i:i + BATCH_SIZE] for i in range(0, total, BATCH_SIZE)]
    print(f"[embed] Running {len(batches)} batches of {BATCH_SIZE}")

    # Run batches in parallel on Modal
    results = list(embed_products_batch.map(batches, order_outputs=False))

    total_embedded = sum(r["embedded"] for r in results)
    total_failed = sum(r["failed"] for r in results)
    print(f"[embed] Complete — {total_embedded} embedded, {total_failed} failed out of {total}")
