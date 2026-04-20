#!/usr/bin/env python3
# DORMANT — Curated product catalog infrastructure
# Not used by active v9 product matching (Serper + Google Lens + client-side CLIP).
# Preserved for possible future use (preferred-supplier feature, fallback path, or v2 catalog matching).
# Last reviewed: 2026-04-19
# Active v9 path lives in apps/web/app/api/match/route.ts

"""
M6 Catalog Scraper — Scrapes retailers via Apify and inserts into Supabase.
Run: python3 modal_pipeline/scrape_catalog.py

Uses unbuffered output for real-time logging.
"""

import sys
import requests
import time
import json
import os
import re
import uuid
from pathlib import Path
from typing import Optional

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ENV_PATH = Path(__file__).parent.parent / "apps" / "web" / ".env.local"
DATA_DIR = Path(__file__).parent / "catalog_data"
DATA_DIR.mkdir(exist_ok=True)

def load_env():
    env = {}
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition("=")
        if key and value:
            env[key.strip()] = value.strip()
    return env

ENV = load_env()
APIFY_TOKEN = ENV["APIFY_API_TOKEN"]
SUPABASE_URL = ENV["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# ---------------------------------------------------------------------------
# Category normalization
# ---------------------------------------------------------------------------

CATEGORY_MAP = {
    "sofa": "sofa", "sectional": "sofa", "loveseat": "sofa", "couch": "sofa",
    "sleeper": "sofa",
    "accent chair": "accent_chair", "armchair": "accent_chair", "lounge chair": "accent_chair",
    "arm chair": "accent_chair", "wing chair": "accent_chair",
    "coffee table": "coffee_table",
    "side table": "side_table", "end table": "side_table", "accent table": "side_table",
    "console table": "side_table",
    "dining table": "dining_table",
    "dining chair": "dining_chair",
    "bed": "bed", "bed frame": "bed", "headboard": "bed",
    "dresser": "dresser", "chest of drawers": "dresser",
    "nightstand": "nightstand", "bedside table": "nightstand", "night stand": "nightstand",
    "wardrobe": "wardrobe", "armoire": "wardrobe",
    "desk": "desk", "writing desk": "desk",
    "office chair": "office_chair", "task chair": "office_chair",
    "bookshelf": "bookshelf", "shelving": "bookshelf", "bookcase": "bookshelf",
    "storage": "storage", "cabinet": "storage", "sideboard": "storage",
    "credenza": "storage", "buffet": "storage",
    "rug": "rug", "area rug": "rug", "runner": "rug",
    "floor lamp": "floor_lamp",
    "table lamp": "table_lamp",
    "pendant light": "ceiling_light", "chandelier": "ceiling_light",
    "ceiling light": "ceiling_light", "pendant": "ceiling_light",
    "mirror": "mirror", "wall mirror": "mirror",
    "curtain": "window_treatment", "curtains": "window_treatment",
    "blind": "window_treatment", "drape": "window_treatment",
    "pillow": "soft_furnishing", "throw": "soft_furnishing", "blanket": "soft_furnishing",
    "wall art": "wall_art", "canvas": "wall_art",
    "planter": "decor", "vase": "decor",
    "ottoman": "ottoman", "pouf": "ottoman", "bench": "ottoman",
    "tv stand": "media_unit", "media console": "media_unit",
    "entertainment center": "media_unit",
}


def normalize_category(name: str, raw_category: str = "") -> str:
    text = f"{raw_category} {name}".lower()
    for key in sorted(CATEGORY_MAP.keys(), key=len, reverse=True):
        if key in text:
            return CATEGORY_MAP[key]
    return "other"


def extract_price(raw) -> Optional[float]:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    if isinstance(raw, str):
        cleaned = re.sub(r'[^0-9.]', '', raw.split('-')[0].split('–')[0])
        try:
            return float(cleaned)
        except (ValueError, TypeError):
            return None
    return None


def dedupe_by_name(products: list[dict]) -> list[dict]:
    seen = set()
    deduped = []
    for p in products:
        key = p["name"].lower().strip()
        if key not in seen:
            seen.add(key)
            deduped.append(p)
    return deduped


# ---------------------------------------------------------------------------
# Apify runner
# ---------------------------------------------------------------------------

def run_apify_actor(actor_id: str, run_input: dict, label: str = "",
                    timeout_minutes: int = 30, max_items: int = 10000) -> list[dict]:
    actor_id_url = actor_id.replace("/", "~")
    print(f"\n[apify] Starting {label or actor_id}...")

    resp = requests.post(
        f"https://api.apify.com/v2/acts/{actor_id_url}/runs",
        params={"token": APIFY_TOKEN},
        json=run_input,
        timeout=60,
    )
    resp.raise_for_status()
    run_id = resp.json()["data"]["id"]
    print(f"[apify] Run ID: {run_id}")

    deadline = time.time() + timeout_minutes * 60
    while time.time() < deadline:
        time.sleep(15)
        status_resp = requests.get(
            f"https://api.apify.com/v2/actor-runs/{run_id}",
            params={"token": APIFY_TOKEN},
            timeout=30,
        )
        status = status_resp.json()["data"]["status"]
        print(f"[apify] {label}: {status}", flush=True)
        if status == "SUCCEEDED":
            break
        if status in ("FAILED", "ABORTED", "TIMED-OUT"):
            print(f"[apify] WARNING: {label} ended with {status}")
            break
    else:
        print(f"[apify] WARNING: {label} timed out after {timeout_minutes}min")

    # Fetch dataset
    all_items = []
    offset = 0
    limit = 1000
    while offset < max_items:
        items_resp = requests.get(
            f"https://api.apify.com/v2/actor-runs/{run_id}/dataset/items",
            params={"token": APIFY_TOKEN, "format": "json", "limit": limit, "offset": offset},
            timeout=120,
        )
        if items_resp.status_code != 200:
            break
        batch = items_resp.json()
        if not batch:
            break
        all_items.extend(batch)
        if len(batch) < limit:
            break
        offset += limit

    print(f"[apify] {label}: got {len(all_items)} raw items")
    return all_items


def start_apify_actor(actor_id: str, run_input: dict, label: str = "") -> str:
    """Start an Apify actor asynchronously and return run_id."""
    actor_id_url = actor_id.replace("/", "~")
    print(f"[apify] Starting async: {label or actor_id}...")

    resp = requests.post(
        f"https://api.apify.com/v2/acts/{actor_id_url}/runs",
        params={"token": APIFY_TOKEN},
        json=run_input,
        timeout=60,
    )
    resp.raise_for_status()
    run_id = resp.json()["data"]["id"]
    print(f"[apify] {label} run_id: {run_id}")
    return run_id


def wait_for_run(run_id: str, label: str = "", timeout_minutes: int = 30) -> str:
    """Wait for Apify run to complete. Returns final status."""
    deadline = time.time() + timeout_minutes * 60
    while time.time() < deadline:
        time.sleep(15)
        resp = requests.get(
            f"https://api.apify.com/v2/actor-runs/{run_id}",
            params={"token": APIFY_TOKEN},
            timeout=30,
        )
        status = resp.json()["data"]["status"]
        if status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
            print(f"[apify] {label}: {status}")
            return status
    print(f"[apify] {label}: timed out")
    return "TIMED-OUT"


def fetch_run_results(run_id: str, max_items: int = 10000) -> list[dict]:
    all_items = []
    offset = 0
    limit = 1000
    while offset < max_items:
        resp = requests.get(
            f"https://api.apify.com/v2/actor-runs/{run_id}/dataset/items",
            params={"token": APIFY_TOKEN, "format": "json", "limit": limit, "offset": offset},
            timeout=120,
        )
        if resp.status_code != 200:
            break
        batch = resp.json()
        if not batch:
            break
        all_items.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return all_items


# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------

def insert_products(products: list[dict], retailer: str) -> int:
    """Insert products matching actual Supabase schema.
    Required NOT NULL columns: external_id, name, retailer, affiliate_url_base
    """
    inserted = 0
    batch_size = 500
    for i in range(0, len(products), batch_size):
        batch = products[i:i+batch_size]
        rows = []
        for p in batch:
            price = p["price"]
            if price < 100:
                price_tier = "budget"
            elif price < 500:
                price_tier = "mid"
            elif price < 1200:
                price_tier = "premium"
            else:
                price_tier = "luxury"

            product_url = p.get("product_url", "")
            ext_id = p.get("asin") or p.get("external_id") or str(uuid.uuid4())[:12]

            rows.append({
                "external_id": ext_id,
                "name": p["name"][:500],
                "retailer": p["retailer"],
                "price": p["price"],
                "currency": "USD",
                "category": p["category"],
                "image_url": p["image_url"],
                "affiliate_url_base": product_url.split("?")[0] if product_url else "",
                "affiliate_url": product_url,
                "style_tags": p.get("style_tags", []),
                "price_tier": price_tier,
                "in_stock": p.get("in_stock", True),
            })
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/products",
            headers=SUPABASE_HEADERS,
            json=rows,
            timeout=60,
        )
        if resp.status_code in (200, 201):
            inserted += len(rows)
        else:
            print(f"[supabase] Insert error batch {i//batch_size}: {resp.status_code} {resp.text[:300]}")
    print(f"[supabase] Inserted {inserted}/{len(products)} for {retailer}")
    return inserted


def get_product_count() -> int:
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/products?select=id",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Prefer": "count=exact",
            "Range": "0-0",
        },
        timeout=15,
    )
    cr = resp.headers.get("content-range", "*/0")
    return int(cr.split("/")[-1])


# ---------------------------------------------------------------------------
# Amazon — axesso_data/amazon-search-scraper
# Verified: returns productDescription, asin, price, imgUrl, dpUrl
# ---------------------------------------------------------------------------

def scrape_amazon() -> list[dict]:
    keywords = [
        "modern sofa furniture", "sectional couch living room",
        "accent chair", "loveseat furniture",
        "coffee table living room", "side table end table",
        "dining table set", "dining chairs set of 4",
        "queen bed frame", "king bed frame headboard",
        "bedroom dresser", "nightstand bedside table",
        "office desk home", "ergonomic office chair",
        "bookshelf modern", "storage cabinet",
        "area rug 8x10", "area rug 5x7",
        "floor lamp modern", "table lamp bedroom",
        "pendant light kitchen", "chandelier dining room",
        "wall mirror large decorative",
        "blackout curtains", "window blinds",
        "ottoman storage", "tv stand media console",
        "throw pillow decorative", "wall art canvas",
    ]

    search_inputs = [
        {"keyword": kw, "domainCode": "com", "maxPages": 5, "category": "aps"}
        for kw in keywords
    ]

    raw = run_apify_actor(
        "axesso_data/amazon-search-scraper",
        {"input": search_inputs},
        label="amazon",
        timeout_minutes=45,
    )

    products = []
    for item in raw:
        name = item.get("productDescription") or item.get("title") or ""
        price = extract_price(item.get("price"))
        image = item.get("imgUrl") or item.get("imageUrl") or ""
        asin = item.get("asin") or ""
        dp_url = item.get("dpUrl") or ""

        if dp_url and not dp_url.startswith("http"):
            url = f"https://www.amazon.com{dp_url}"
        else:
            url = dp_url

        if asin and not url:
            url = f"https://www.amazon.com/dp/{asin}"

        # Add affiliate tag
        if url and "tag=" not in url:
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}tag=cova03-20"

        if not name or not price or not image or not url:
            continue
        if price < 25 or price > 5000:
            continue

        products.append({
            "name": name.strip()[:500],
            "retailer": "amazon",
            "price": round(price, 2),
            "image_url": image,
            "product_url": url,
            "category": normalize_category(name),
            "asin": asin or None,
            "in_stock": True,
        })

    return dedupe_by_name(products)


# ---------------------------------------------------------------------------
# IKEA — shahidirfan/Ikea-Product-Scraper
# Verified: returns name, price, image, url
# Runs multiple categories in parallel
# ---------------------------------------------------------------------------

def scrape_ikea() -> list[dict]:
    categories = [
        "sofas", "armchairs", "coffee tables", "side tables",
        "dining tables", "dining chairs", "beds", "dressers",
        "nightstands", "desks", "office chairs", "bookshelves",
        "rugs", "floor lamps", "table lamps", "pendant lights",
        "mirrors", "curtains", "storage cabinets", "tv stands",
    ]

    all_products = []
    # Run in small batches (3 at a time) to avoid 502 errors
    batch_size = 3
    for batch_start in range(0, len(categories), batch_size):
        batch_cats = categories[batch_start:batch_start + batch_size]
        runs = []
        for cat in batch_cats:
            run_id = start_apify_actor(
                "shahidirfan/Ikea-Product-Scraper",
                {
                    "country": "us",
                    "language": "en",
                    "category": cat,
                    "maxProducts": 200,
                    "maxPages": 10,
                    "proxyConfiguration": {"useApifyProxy": True, "apifyProxyGroups": ["RESIDENTIAL"]},
                },
                label=f"ikea-{cat}",
            )
            runs.append((cat, run_id))
            time.sleep(3)

        for cat, run_id in runs:
            status = wait_for_run(run_id, label=f"ikea-{cat}", timeout_minutes=10)
            if status == "SUCCEEDED":
                items = fetch_run_results(run_id)
                print(f"[ikea] {cat}: {len(items)} items")
                for item in items:
                    name = item.get("name") or ""
                    price = extract_price(item.get("price"))
                    image = item.get("image") or ""
                    url = item.get("url") or ""

                    if not name or not price or not image or not url:
                        continue
                    if price < 10 or price > 5000:
                        continue

                    all_products.append({
                        "name": name.strip(),
                        "retailer": "ikea",
                        "price": round(price, 2),
                        "image_url": image,
                        "product_url": url,
                        "category": normalize_category(name, item.get("categoryPathText", "")),
                        "in_stock": True,
                    })

    return dedupe_by_name(all_products)


# ---------------------------------------------------------------------------
# Wayfair — sovereigntaylor/wayfair-scraper
# Needs residential proxies
# ---------------------------------------------------------------------------

def scrape_wayfair() -> list[dict]:
    """Use 123webdata/wayfair-scraper (paid, $0.005/result) with category URLs."""
    category_urls = [
        "https://www.wayfair.com/furniture/sb0/sofas-c413892.html",
        "https://www.wayfair.com/furniture/sb0/accent-chairs-c413898.html",
        "https://www.wayfair.com/furniture/sb0/coffee-tables-c413978.html",
        "https://www.wayfair.com/furniture/sb0/end-side-tables-c413974.html",
        "https://www.wayfair.com/furniture/sb0/dining-tables-c413960.html",
        "https://www.wayfair.com/furniture/sb0/dining-chairs-c413964.html",
        "https://www.wayfair.com/furniture/sb0/beds-c413836.html",
        "https://www.wayfair.com/furniture/sb0/dressers-c413854.html",
        "https://www.wayfair.com/furniture/sb0/nightstands-c413856.html",
        "https://www.wayfair.com/furniture/sb0/desks-c413866.html",
        "https://www.wayfair.com/furniture/sb0/office-chairs-c413870.html",
        "https://www.wayfair.com/furniture/sb0/bookcases-c413846.html",
        "https://www.wayfair.com/rugs/sb0/area-rugs-c215385.html",
        "https://www.wayfair.com/lighting/sb0/floor-lamps-c413509.html",
        "https://www.wayfair.com/lighting/sb0/table-lamps-c413519.html",
        "https://www.wayfair.com/lighting/sb0/chandeliers-c413480.html",
        "https://www.wayfair.com/decor-pillows/sb0/mirrors-c413744.html",
        "https://www.wayfair.com/furniture/sb0/ottomans-poufs-c413916.html",
        "https://www.wayfair.com/furniture/sb0/tv-stands-c413934.html",
    ]

    raw = run_apify_actor(
        "123webdata/wayfair-scraper",
        {
            "categoryUrls": category_urls,
            "maxResultsPerScrape": 4000,
            "usePagination": True,
        },
        label="wayfair",
        timeout_minutes=30,
    )

    products = []
    for item in raw:
        name = item.get("name") or item.get("title") or item.get("productName") or ""
        price = extract_price(
            item.get("price") or item.get("salePrice") or
            item.get("currentPrice") or item.get("regularPrice")
        )
        image = (item.get("image") or item.get("imageUrl") or
                 item.get("mainImage") or item.get("thumbnail") or "")
        url = item.get("url") or item.get("productUrl") or item.get("link") or ""

        if not name or not price or not image or not url:
            continue
        if price < 25 or price > 5000:
            continue

        products.append({
            "name": name.strip()[:500],
            "retailer": "wayfair",
            "price": round(price, 2),
            "image_url": image,
            "product_url": url if url.startswith("http") else f"https://www.wayfair.com{url}",
            "category": normalize_category(name, item.get("category", "")),
            "in_stock": True,
        })

    return dedupe_by_name(products)


# ---------------------------------------------------------------------------
# Etsy — rigelbytes/etsy-scraper
# Verified input format: startUrls + maxProducts
# ---------------------------------------------------------------------------

def scrape_etsy() -> list[dict]:
    urls = [
        "https://www.etsy.com/search?q=modern+sofa&min=25&max=5000",
        "https://www.etsy.com/search?q=accent+chair+furniture&min=25",
        "https://www.etsy.com/search?q=coffee+table+wood&min=25",
        "https://www.etsy.com/search?q=dining+table+modern&min=25",
        "https://www.etsy.com/search?q=bed+frame+wood&min=50",
        "https://www.etsy.com/search?q=bookshelf+modern&min=25",
        "https://www.etsy.com/search?q=handmade+area+rug&min=25",
        "https://www.etsy.com/search?q=floor+lamp+modern&min=25",
        "https://www.etsy.com/search?q=wall+mirror+decorative&min=25",
        "https://www.etsy.com/search?q=mid+century+furniture&min=25",
        "https://www.etsy.com/search?q=desk+wood+modern&min=25",
        "https://www.etsy.com/search?q=dresser+modern&min=50",
    ]

    raw = run_apify_actor(
        "rigelbytes/etsy-scraper",
        {
            "startUrls": [{"url": u} for u in urls],
            "maxProducts": 1200,
            "proxyConfiguration": {"useApifyProxy": True, "apifyProxyGroups": ["RESIDENTIAL"]},
        },
        label="etsy",
        timeout_minutes=25,
    )

    products = []
    for item in raw:
        name = item.get("title") or item.get("name") or ""
        price = extract_price(item.get("price") or item.get("currentPrice"))
        image = item.get("image") or item.get("imageUrl") or item.get("mainImage") or ""
        url = item.get("url") or item.get("productUrl") or item.get("link") or ""

        if not name or not price or not image or not url:
            continue

        products.append({
            "name": name.strip()[:500],
            "retailer": "etsy",
            "price": round(price, 2),
            "image_url": image,
            "product_url": url,
            "category": normalize_category(name),
            "in_stock": True,
        })

    return dedupe_by_name(products)


# ---------------------------------------------------------------------------
# Overstock — powerai/overstock-products-search-scraper
# ---------------------------------------------------------------------------

def scrape_overstock() -> list[dict]:
    searches = [
        "https://www.overstock.com/living-room-furniture,/k,/results.html",
        "https://www.overstock.com/bedroom-furniture,/k,/results.html",
        "https://www.overstock.com/dining-room-furniture,/k,/results.html",
        "https://www.overstock.com/rugs,/k,/results.html",
        "https://www.overstock.com/lighting,/k,/results.html",
        "https://www.overstock.com/office-furniture,/k,/results.html",
    ]

    all_products = []
    for url in searches:
        raw = run_apify_actor(
            "powerai/overstock-products-search-scraper",
            {
                "searchUrl": url,
                "maxItems": 200,
                "proxyConfiguration": {"useApifyProxy": True},
            },
            label=f"overstock",
            timeout_minutes=10,
        )

        for item in raw:
            name = item.get("title") or item.get("name") or ""
            price = extract_price(item.get("price") or item.get("currentPrice"))
            image = item.get("image") or item.get("imageUrl") or ""
            purl = item.get("url") or item.get("link") or ""

            if not name or not price or not image or not purl:
                continue
            if price < 25 or price > 5000:
                continue

            all_products.append({
                "name": name.strip()[:500],
                "retailer": "overstock",
                "price": round(price, 2),
                "image_url": image,
                "product_url": purl if purl.startswith("http") else f"https://www.overstock.com{purl}",
                "category": normalize_category(name),
                "in_stock": True,
            })

    return dedupe_by_name(all_products)


# ---------------------------------------------------------------------------
# Generic retailers via apify/cheerio-scraper (lighter, faster than web-scraper)
# These retailers (CB2, Crate & Barrel, West Elm, Pottery Barn, Ruggable, OKL)
# are JS-heavy SPAs, so we use search URLs that return server-rendered content
# ---------------------------------------------------------------------------

def scrape_with_cheerio(retailer: str, urls: list[str], target: int,
                        base_domain: str) -> list[dict]:
    """Use apify/cheerio-scraper for lighter crawling."""
    raw = run_apify_actor(
        "apify/cheerio-scraper",
        {
            "startUrls": [{"url": u} for u in urls],
            "maxRequestsPerCrawl": target * 2,
            "pageFunction": """
async function pageFunction(context) {
    const { $, request, log } = context;
    const results = [];

    // Try multiple selector strategies for product data
    const selectors = [
        '[data-testid*="product"]', '.product-card', '.product-tile',
        '.product-item', '[class*="ProductCard"]', '.grid-item',
        '[class*="product-grid"] > *', '.plp-item', '[data-component="product"]',
        'article[class*="product"]', '[class*="Item"]',
    ];

    const productEls = $(selectors.join(', '));
    log.info(`Found ${productEls.length} product elements on ${request.url}`);

    productEls.each((i, el) => {
        const $el = $(el);
        const name = $el.find('h2, h3, [class*="name"], [class*="title"], [class*="Name"], [class*="Title"]').first().text().trim();
        const priceText = $el.find('[class*="price"], [class*="Price"], [data-testid*="price"]').first().text().trim();
        const imgSrc = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || '';
        const link = $el.find('a[href]').first().attr('href') || '';

        if (name && name.length > 3 && priceText) {
            results.push({
                name: name.substring(0, 500),
                price: priceText,
                image_url: imgSrc,
                product_url: link,
                source_url: request.url,
            });
        }
    });

    // Also try JSON-LD structured data
    $('script[type="application/ld+json"]').each((i, el) => {
        try {
            const data = JSON.parse($(el).html());
            const items = Array.isArray(data) ? data : (data['@graph'] || [data]);
            for (const item of items) {
                if (item['@type'] === 'Product' && item.name) {
                    results.push({
                        name: item.name,
                        price: item.offers?.price || item.offers?.lowPrice || '',
                        image_url: item.image || '',
                        product_url: item.url || request.url,
                        source_url: request.url,
                    });
                }
            }
        } catch (e) {}
    });

    return results;
}""",
            "proxyConfiguration": {"useApifyProxy": True},
        },
        label=retailer,
        timeout_minutes=15,
    )

    products = []
    for item in raw:
        name = item.get("name") or ""
        price = extract_price(item.get("price"))
        image = item.get("image_url") or ""
        url = item.get("product_url") or ""

        if not name or not price or not image:
            continue
        if price < 25 or price > 5000:
            continue

        if url and not url.startswith("http"):
            url = f"https://www.{base_domain}{url}"

        products.append({
            "name": name.strip()[:500],
            "retailer": retailer,
            "price": round(price, 2),
            "image_url": image,
            "product_url": url or f"https://www.{base_domain}",
            "category": normalize_category(name),
            "in_stock": True,
        })

    return dedupe_by_name(products[:target])


def scrape_cb2() -> list[dict]:
    return scrape_with_cheerio("cb2", [
        "https://www.cb2.com/furniture/sofas/1",
        "https://www.cb2.com/furniture/chairs/1",
        "https://www.cb2.com/furniture/tables/1",
        "https://www.cb2.com/furniture/bedroom/1",
        "https://www.cb2.com/furniture/office/1",
        "https://www.cb2.com/furniture/storage-and-bookcases/1",
        "https://www.cb2.com/rugs/1",
        "https://www.cb2.com/lighting/1",
    ], target=1500, base_domain="cb2.com")


def scrape_crate_barrel() -> list[dict]:
    return scrape_with_cheerio("crate_barrel", [
        "https://www.crateandbarrel.com/furniture/sofas/1",
        "https://www.crateandbarrel.com/furniture/accent-chairs/1",
        "https://www.crateandbarrel.com/furniture/coffee-tables/1",
        "https://www.crateandbarrel.com/furniture/dining-tables/1",
        "https://www.crateandbarrel.com/furniture/beds/1",
        "https://www.crateandbarrel.com/furniture/dressers/1",
        "https://www.crateandbarrel.com/furniture/desks/1",
        "https://www.crateandbarrel.com/rugs/1",
        "https://www.crateandbarrel.com/lighting/1",
    ], target=1500, base_domain="crateandbarrel.com")


def scrape_west_elm() -> list[dict]:
    return scrape_with_cheerio("west_elm", [
        "https://www.westelm.com/shop/furniture/sofas-sectionals/",
        "https://www.westelm.com/shop/furniture/living-room-chairs/",
        "https://www.westelm.com/shop/furniture/coffee-tables/",
        "https://www.westelm.com/shop/furniture/dining-tables/",
        "https://www.westelm.com/shop/furniture/beds/",
        "https://www.westelm.com/shop/furniture/dressers-nightstands/",
        "https://www.westelm.com/shop/furniture/desks/",
        "https://www.westelm.com/shop/rugs/",
        "https://www.westelm.com/shop/lighting/",
    ], target=1500, base_domain="westelm.com")


def scrape_pottery_barn() -> list[dict]:
    return scrape_with_cheerio("pottery_barn", [
        "https://www.potterybarn.com/shop/furniture/sofas-sectionals/",
        "https://www.potterybarn.com/shop/furniture/accent-chairs/",
        "https://www.potterybarn.com/shop/furniture/coffee-tables/",
        "https://www.potterybarn.com/shop/furniture/dining-tables/",
        "https://www.potterybarn.com/shop/furniture/beds/",
        "https://www.potterybarn.com/shop/furniture/dressers/",
        "https://www.potterybarn.com/shop/furniture/desks/",
        "https://www.potterybarn.com/shop/rugs/",
        "https://www.potterybarn.com/shop/lighting/",
    ], target=1500, base_domain="potterybarn.com")


def scrape_ruggable() -> list[dict]:
    return scrape_with_cheerio("ruggable", [
        "https://ruggable.com/collections/all-rugs",
    ], target=500, base_domain="ruggable.com")


def scrape_one_kings_lane() -> list[dict]:
    return scrape_with_cheerio("one_kings_lane", [
        "https://www.onekingslane.com/furniture/seating/sofas",
        "https://www.onekingslane.com/furniture/seating/accent-chairs",
        "https://www.onekingslane.com/furniture/tables/coffee-tables",
        "https://www.onekingslane.com/furniture/bedroom",
        "https://www.onekingslane.com/rugs",
        "https://www.onekingslane.com/lighting",
    ], target=500, base_domain="onekingslane.com")


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

RETAILER_SCRAPERS = [
    ("amazon", scrape_amazon),
    ("ikea", scrape_ikea),
    ("wayfair", scrape_wayfair),
    ("etsy", scrape_etsy),
    ("overstock", scrape_overstock),
    ("cb2", scrape_cb2),
    ("crate_barrel", scrape_crate_barrel),
    ("west_elm", scrape_west_elm),
    ("pottery_barn", scrape_pottery_barn),
    ("ruggable", scrape_ruggable),
    ("one_kings_lane", scrape_one_kings_lane),
]


def main():
    print(f"[M6] Starting catalog scrape — {len(RETAILER_SCRAPERS)} retailers")
    print(f"[M6] Current products count: {get_product_count()}")

    results = {}
    total_inserted = 0

    for retailer, scraper_fn in RETAILER_SCRAPERS:
        print(f"\n{'='*60}")
        print(f"[M6] Scraping {retailer}...")
        print(f"{'='*60}")

        cache_file = DATA_DIR / f"{retailer}_products.json"
        if cache_file.exists():
            cached = json.loads(cache_file.read_text())
            if cached:  # Only use cache if non-empty
                print(f"[M6] Found cached data for {retailer}: {len(cached)} products")
                products = cached
            else:
                print(f"[M6] Cache empty for {retailer}, re-scraping...")
                try:
                    products = scraper_fn()
                except Exception as e:
                    print(f"[M6] ERROR scraping {retailer}: {e}")
                    products = []
        else:
            try:
                products = scraper_fn()
            except Exception as e:
                print(f"[M6] ERROR scraping {retailer}: {e}")
                products = []

        cache_file.write_text(json.dumps(products, indent=2))
        print(f"[M6] {retailer}: {len(products)} products saved to disk")

        if products:
            inserted = insert_products(products, retailer)
            total_inserted += inserted
        else:
            inserted = 0

        results[retailer] = {"scraped": len(products), "inserted": inserted}
        print(f"[M6] Running total: {get_product_count()} products in DB")

    summary = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "results": results,
        "total_inserted": total_inserted,
        "final_count": get_product_count(),
    }
    (DATA_DIR / "scrape_report.json").write_text(json.dumps(summary, indent=2))

    print(f"\n{'='*60}")
    print(f"[M6] SCRAPE COMPLETE")
    print(f"[M6] Total products in DB: {summary['final_count']}")
    for r, data in results.items():
        print(f"  {r}: {data['scraped']} scraped, {data['inserted']} inserted")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
