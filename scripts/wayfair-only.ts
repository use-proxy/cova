import dotenv from "dotenv";
import { ApifyClient } from "apify-client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

dotenv.config({ path: "apps/web/.env.local" });

let _apify: ApifyClient | null = null;
let _supabase: SupabaseClient | null = null;

function getApify(): ApifyClient {
  if (!_apify) {
    const token = process.env.APIFY_API_TOKEN ?? process.env.APIFY_TOKEN ?? "";
    if (!token) throw new Error("Missing APIFY_API_TOKEN or APIFY_TOKEN env var");
    _apify = new ApifyClient({ token });
  }
  return _apify;
}

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL env var");
    if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const CATEGORIES = [
  {
    url: "https://www.wayfair.com/furniture/cat/sofas-c413892.html",
    category: "sofa",
  },
  {
    url: "https://www.wayfair.com/furniture/cat/sectional-sofas-c413893.html",
    category: "sectional",
  },
  {
    url: "https://www.wayfair.com/furniture/cat/accent-chairs-c1780251.html",
    category: "accent_chair",
  },
  {
    url: "https://www.wayfair.com/furniture/cat/beds-c1840413.html",
    category: "bed_frame",
  },
  {
    url: "https://www.wayfair.com/furniture/cat/dining-tables-c215323.html",
    category: "dining_table",
  },
  {
    url: "https://www.wayfair.com/furniture/cat/coffee-tables-c45825.html",
    category: "coffee_table",
  },
  {
    url: "https://www.wayfair.com/furniture/cat/floor-lamps-c215291.html",
    category: "floor_lamp",
  },
  {
    url: "https://www.wayfair.com/rugs/cat/area-rugs-c215288.html",
    category: "rug",
  },
  {
    url: "https://www.wayfair.com/furniture/cat/dressers-c215330.html",
    category: "dresser",
  },
  {
    url: "https://www.wayfair.com/furniture/cat/desks-c45974.html",
    category: "desk",
  },
  {
    url: "https://www.wayfair.com/outdoor/cat/outdoor-sofas-c215361.html",
    category: "outdoor_sofa",
  },
  {
    url: "https://www.wayfair.com/outdoor/cat/outdoor-dining-sets-c215360.html",
    category: "outdoor_dining_table",
  },
  {
    url: "https://www.wayfair.com/lighting/cat/pendant-lights-c215293.html",
    category: "pendant_light",
  },
  {
    url: "https://www.wayfair.com/furniture/cat/nightstands-c215329.html",
    category: "nightstand",
  },
  {
    url: "https://www.wayfair.com/furniture/cat/bookcases-c45971.html",
    category: "bookshelf",
  },
];

const ROOM_TYPE_MAP: Record<string, string[]> = {
  sofa: ["living_room", "studio"],
  sectional: ["living_room", "studio"],
  accent_chair: ["living_room", "bedroom", "studio"],
  bed_frame: ["bedroom"],
  dining_table: ["dining_room"],
  coffee_table: ["living_room", "studio"],
  floor_lamp: ["living_room", "bedroom", "home_office", "studio"],
  rug: ["living_room", "bedroom", "dining_room", "studio"],
  dresser: ["bedroom"],
  desk: ["home_office", "studio", "dorm"],
  outdoor_sofa: ["outdoor"],
  outdoor_dining_table: ["outdoor"],
  pendant_light: ["living_room", "dining_room", "kitchen"],
  nightstand: ["bedroom"],
  bookshelf: ["home_office", "living_room", "studio"],
};

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scrapeCategory(
  categoryUrl: string,
  category: string,
): Promise<number> {
  console.log(`\nScraping: ${category} — ${categoryUrl}`);

  const apify = getApify();
  const run = await apify.actor("123webdata/wayfair-scraper").call({
    categoryUrls: [categoryUrl],
    usePagination: true,
    maxResultsPerScrape: 500,
  });

  const finishedRun = await apify.run(run.id).waitForFinish({ waitSecs: 300 });

  if (finishedRun.status !== "SUCCEEDED") {
    console.log(`Failed: ${finishedRun.status}`);
    return 0;
  }

  const { items } = await apify
    .dataset(finishedRun.defaultDatasetId)
    .listItems();

  if (!items || items.length === 0) {
    console.log("Empty dataset");
    return 0;
  }

  console.log(`Got ${items.length} raw items`);

  const products = [];
  for (const item of items) {
    const i = item as Record<string, unknown>;
    const name = String(i.name ?? i.title ?? "").trim();
    const priceRaw = i.price ?? i.salePrice;
    const price =
      typeof priceRaw === "number"
        ? priceRaw
        : parseFloat(String(priceRaw ?? "0").replace(/[^0-9.]/g, ""));
    const image_url = String(i.imageUrl ?? i.image ?? i.thumbnailUrl ?? "");
    const product_url = String(i.url ?? i.productUrl ?? "");

    if (!name || name.length < 3) continue;
    if (!price || price <= 0 || price > 50000) continue;
    if (!image_url.startsWith("http")) continue;
    if (!product_url.startsWith("http")) continue;

    products.push({
      name,
      price: Math.round(price * 100), // store as cents
      retailer: "wayfair",
      category,
      room_types: ROOM_TYPE_MAP[category] ?? ["living_room"],
      style_tags: [],
      affiliate_url: product_url,
      product_url,
      image_url,
      supabase_image_url: image_url,
      clip_embedding_data: null,
      in_stock: true,
      commission_rate: 0.07,
      created_at: new Date().toISOString(),
    });
  }

  if (products.length === 0) {
    console.log("No valid products after filtering");
    return 0;
  }

  // Insert in batches of 100
  const supabase = getSupabase();
  let inserted = 0;
  for (let i = 0; i < products.length; i += 100) {
    const batch = products.slice(i, i + 100);
    const { error } = await supabase
      .from("products")
      .upsert(batch, { onConflict: "product_url", ignoreDuplicates: true });
    if (error) console.error("Insert error:", error.message);
    else inserted += batch.length;
  }

  console.log(`Inserted ${inserted} products`);
  return inserted;
}

async function main() {
  console.log("Wayfair scraper — serial mode, 60s between categories");
  console.log(`Categories to scrape: ${CATEGORIES.length}`);

  let total = 0;

  for (let i = 0; i < CATEGORIES.length; i++) {
    const { url, category } = CATEGORIES[i];
    console.log(`\n[${i + 1}/${CATEGORIES.length}]`);

    const count = await scrapeCategory(url, category);
    total += count;

    console.log(`Running total: ${total}`);

    if (i < CATEGORIES.length - 1) {
      console.log("Waiting 60 seconds before next category...");
      await sleep(60000);
    }
  }

  console.log(`\nDone. Total inserted: ${total}`);
}

main().catch(console.error);
