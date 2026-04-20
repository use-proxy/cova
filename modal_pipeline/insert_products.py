#!/usr/bin/env python3
# DORMANT — Curated product catalog infrastructure
# Not used by active v9 product matching (Serper + Google Lens + client-side CLIP).
# Preserved for possible future use (preferred-supplier feature, fallback path, or v2 catalog matching).
# Last reviewed: 2026-04-19
# Active v9 path lives in apps/web/app/api/match/route.ts

"""
Re-process raw Apify datasets with correct Supabase column mapping and insert.
"""

import json
import os
import re
import urllib.request
import urllib.error
from pathlib import Path

APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://xdeacbmkdwqrwxonqaqh.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
CATALOG_DIR = Path(__file__).parent / "catalog_data"

HEADERS_SUPA = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

ETSY_DATASETS = [
    "loZ8rAHDKq2EQ5dTW", "fIeZuuKBLrJdyXuQM", "krqY0hG0wNcdVATKK",
    "b1SdqvIJQIykI1QAl", "IGh4u2lgEerrRaAge", "Pc6yPR2xQPtp3pwua",
    "oL6xt9efk83HtWyfK", "k0ppoNC7QKYDVMDWE", "a98SBVbPHLnJeVl3d",
    "bOtLtndIQPcb3L8d3",
]

OVERSTOCK_DATASETS = [
    "QvsVcfi0r3BGwHuAe", "84cwKKKz8WPUcLp12", "RYb5Aj9ZGCNftPcBr",
    "kQYDy4xVQ7LkA0wBd", "oUtH5uNdyWoZV4SRI", "ye5bxKbpNNM75phmh",
    "Ax4k1re2Lxzg9uBgw", "TUfKHVdVEhWHdX3Mf", "bi72XUcjPjgcwgsVD",
    "afgwaEQTTcj48SWhs",
]

# Etsy categories - home/furniture relevant keywords
ETSY_RELEVANT = [
    "sofa", "couch", "loveseat", "chair", "armchair", "rocker", "table",
    "rug", "carpet", "mat", "runner", "lamp", "light", "lantern",
    "pillow", "cushion", "blanket", "throw", "basket", "storage",
    "organizer", "shelf", "vase", "ceramic", "pot", "planter",
    "wall art", "hanging", "tapestry", "macrame", "mirror", "candle",
    "curtain", "decor", "sculpture", "clock", "frame", "bookend",
    "tray", "bowl", "cabinet", "dresser", "bench", "ottoman",
    "stool", "desk", "bed", "nightstand", "woven", "rattan",
    "bamboo", "wood", "furniture", "chandelier", "pendant",
]

ETSY_CAT = {
    "sofa": ["sofa", "couch", "loveseat", "settee"],
    "accent_chair": ["chair", "armchair", "rocker", "rocking chair"],
    "coffee_table": ["coffee table", "side table", "end table"],
    "rug": ["rug", "carpet", "mat", "runner"],
    "floor_lamp": ["floor lamp", "standing lamp"],
    "table_lamp": ["table lamp", "desk lamp", "lamp", "light", "lantern"],
    "soft_furnishing": ["pillow", "cushion", "blanket", "throw"],
    "storage": ["basket", "storage", "organizer", "shelf", "bin"],
    "decor": ["vase", "ceramic", "pot", "planter", "candle", "sculpture", "bowl", "tray"],
    "wall_art": ["wall art", "hanging", "tapestry", "macrame", "print", "poster", "wall decor", "frame"],
    "mirror": ["mirror"],
}

OVERSTOCK_CAT = {
    "sofa": ["sofa", "sectional", "loveseat", "couch", "futon"],
    "accent_chair": ["accent chair", "armchair", "recliner", "club chair", "wingback"],
    "coffee_table": ["coffee table"],
    "side_table": ["side table", "end table", "accent table"],
    "dining_table": ["dining table", "kitchen table"],
    "dining_chair": ["dining chair", "bar stool", "counter stool"],
    "bed": ["bed", "bed frame", "headboard", "platform bed"],
    "dresser": ["dresser", "chest", "drawer"],
    "nightstand": ["nightstand", "night stand", "bedside table"],
    "desk": ["desk", "writing desk", "computer desk"],
    "bookshelf": ["bookshelf", "bookcase", "shelving", "shelf unit", "etagere"],
    "storage": ["storage", "cabinet", "sideboard", "buffet", "credenza"],
    "rug": ["rug", "area rug", "carpet", "runner"],
    "floor_lamp": ["floor lamp"],
    "table_lamp": ["table lamp", "desk lamp"],
    "ceiling_light": ["ceiling light", "chandelier", "pendant", "flush mount"],
    "mirror": ["mirror"],
    "window_treatment": ["curtain", "blind", "drape", "shade"],
    "soft_furnishing": ["pillow", "throw", "blanket", "cushion"],
    "wall_art": ["wall art", "frame", "canvas", "print", "wall decor"],
    "decor": ["planter", "vase", "decorative", "sculpture"],
    "ottoman": ["ottoman", "bench", "pouf"],
    "media_unit": ["tv stand", "media console", "entertainment center"],
}


def fetch_dataset(dataset_id):
    items = []
    offset = 0
    while True:
        url = f"https://api.apify.com/v2/datasets/{dataset_id}/items?token={APIFY_TOKEN}&offset={offset}&limit=1000&format=json"
        req = urllib.request.Request(url)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                batch = json.loads(resp.read())
                if not batch:
                    break
                items.extend(batch)
                if len(batch) < 1000:
                    break
                offset += 1000
        except Exception as e:
            print(f"  Error fetching {dataset_id}: {e}")
            break
    return items


def parse_price(val):
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val) if val > 0 else None
    if isinstance(val, str):
        cleaned = re.sub(r'[^\d.]', '', val.replace(',', ''))
        try:
            p = float(cleaned)
            return p if p > 0 else None
        except (ValueError, TypeError):
            return None
    return None


def categorize(name, mapping, default="decor"):
    name_lower = name.lower()
    for cat, keywords in mapping.items():
        for kw in keywords:
            if kw in name_lower:
                return cat
    return default


def is_home_relevant(name):
    """Check if an Etsy product is home/furniture relevant."""
    name_lower = name.lower()
    return any(kw in name_lower for kw in ETSY_RELEVANT)


def supabase_insert_batch(rows):
    body = json.dumps(rows).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/products",
        data=body,
        headers=HEADERS_SUPA,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return True
    except urllib.error.HTTPError as e:
        err = e.read().decode()[:500]
        print(f"  Insert error {e.code}: {err}")
        return False


def insert_products(products, retailer):
    print(f"  Inserting {len(products)} {retailer} products...")
    total = 0
    for i in range(0, len(products), 200):
        batch = products[i:i + 200]
        if supabase_insert_batch(batch):
            total += len(batch)
            print(f"  Batch {i//200+1}: {len(batch)} ok ({total} total)")
        else:
            for row in batch:
                if supabase_insert_batch([row]):
                    total += 1
    print(f"  {retailer}: {total} inserted")
    return total


def main():
    print("=" * 60)
    print("COLLECTING AND INSERTING PRODUCTS")
    print("=" * 60)

    # ── ETSY ──
    print("\n--- ETSY ---")
    all_raw = []
    for ds_id in ETSY_DATASETS:
        items = fetch_dataset(ds_id)
        print(f"  Dataset {ds_id}: {len(items)} items")
        all_raw.extend(items)
    print(f"  Total raw: {len(all_raw)}")

    etsy_products = []
    seen_ids = set()  # Deduplicate by listingId instead of name
    seen_names = set()
    skipped_irrelevant = 0
    skipped_no_price = 0
    skipped_dup = 0

    for item in all_raw:
        # Use listingId for dedup
        lid = item.get("listingId")
        if lid and lid in seen_ids:
            skipped_dup += 1
            continue
        if lid:
            seen_ids.add(lid)

        name = (item.get("name") or item.get("title") or "").strip()[:500]
        if not name:
            continue

        # Also dedup by name
        nkey = name.lower().strip()
        if nkey in seen_names:
            skipped_dup += 1
            continue
        seen_names.add(nkey)

        # Relevance filter - skip non-home items
        if not is_home_relevant(name):
            skipped_irrelevant += 1
            continue

        price = parse_price(item.get("price") or item.get("originalPrice"))
        if not price or price <= 0:
            skipped_no_price += 1
            continue

        image_url = item.get("imageUrl") or item.get("image") or item.get("thumbnailUrl")
        if not image_url:
            continue

        product_url = item.get("url") or item.get("link")
        if not product_url:
            continue

        url_str = str(product_url)
        etsy_products.append({
            "external_id": f"etsy_{lid}" if lid else f"etsy_{hash(name) % 10**10}",
            "name": name,
            "retailer": "etsy",
            "price": round(price, 2),
            "currency": "USD",
            "image_url": str(image_url),
            "affiliate_url": url_str,
            "affiliate_url_base": url_str,
            "category": categorize(name, ETSY_CAT, "decor"),
            "style_tags": [],
            "in_stock": True,
            "active": True,
        })

    print(f"  Skipped: {skipped_dup} duplicates, {skipped_irrelevant} irrelevant, {skipped_no_price} no price")
    print(f"  Normalized: {len(etsy_products)}")

    with open(CATALOG_DIR / "etsy_products.json", "w") as f:
        json.dump(etsy_products, f)

    etsy_inserted = insert_products(etsy_products, "etsy") if etsy_products else 0

    # ── OVERSTOCK ──
    print("\n--- OVERSTOCK ---")
    all_raw = []
    for ds_id in OVERSTOCK_DATASETS:
        items = fetch_dataset(ds_id)
        print(f"  Dataset {ds_id}: {len(items)} items")
        all_raw.extend(items)
    print(f"  Total raw: {len(all_raw)}")

    overstock_products = []
    seen_ids = set()
    seen_names = set()

    for item in all_raw:
        pid = item.get("productId")
        if pid and pid in seen_ids:
            continue
        if pid:
            seen_ids.add(pid)

        name = (item.get("productTitle") or item.get("title") or item.get("name") or "").strip()[:500]
        if not name:
            continue

        nkey = name.lower().strip()
        if nkey in seen_names:
            continue
        seen_names.add(nkey)

        price = parse_price(item.get("currentPrice") or item.get("price") or item.get("salePrice"))
        if not price or price <= 0 or price > 5000:
            continue

        image_url = item.get("imageUrl") or item.get("image")
        if not image_url:
            continue

        product_url = item.get("productUrl") or item.get("url") or item.get("link")
        if not product_url:
            continue

        url_str = str(product_url)
        overstock_products.append({
            "external_id": f"overstock_{pid}" if pid else f"overstock_{hash(name) % 10**10}",
            "name": name,
            "retailer": "overstock",
            "price": round(price, 2),
            "currency": "USD",
            "image_url": str(image_url),
            "affiliate_url": url_str,
            "affiliate_url_base": url_str,
            "category": categorize(name, OVERSTOCK_CAT, "other"),
            "style_tags": [],
            "in_stock": True,
            "active": True,
        })

    print(f"  Normalized: {len(overstock_products)}")

    with open(CATALOG_DIR / "overstock_products.json", "w") as f:
        json.dump(overstock_products, f)

    overstock_inserted = insert_products(overstock_products, "overstock") if overstock_products else 0

    # ── SUMMARY ──
    print("\n" + "=" * 60)
    print(f"ETSY:      {len(etsy_products)} normalized, {etsy_inserted} inserted")
    print(f"OVERSTOCK: {len(overstock_products)} normalized, {overstock_inserted} inserted")
    print("=" * 60)

    return {"etsy": etsy_inserted, "overstock": overstock_inserted}


if __name__ == "__main__":
    main()
