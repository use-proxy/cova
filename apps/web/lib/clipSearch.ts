// DORMANT — Curated product catalog infrastructure
// Not used by active v9 product matching (Serper + Google Lens + client-side CLIP).
// Preserved for possible future use (preferred-supplier feature, fallback path, or v2 catalog matching).
// Last reviewed: 2026-04-19
// Active v9 path lives in apps/web/app/api/match/route.ts

/**
 * CLIP text embedding and product similarity search.
 * Uses existing Modal CLIP endpoint and Supabase pgvector RPC.
 */

export interface ProductMatch {
  id: string;
  name: string;
  price: number;
  category: string;
  retailer: string;
  affiliate_url: string;
  image_url: string;
  similarity: number;
  style_tags: string[];
}

export interface FurnitureDetection {
  label: string;
  description: string;
  category: string;
  azimuth_degrees: number;
  search_query: string;
}

const CATEGORY_GROUPS: Record<string, string[]> = {
  coffee_table: ["coffee_table", "dining_table", "side_table", "nightstand"],
  dining_table: ["coffee_table", "dining_table", "side_table", "nightstand"],
  side_table: ["coffee_table", "dining_table", "side_table", "nightstand"],
  nightstand: ["coffee_table", "dining_table", "side_table", "nightstand"],
  accent_chair: ["accent_chair", "dining_chair", "office_chair"],
  dining_chair: ["accent_chair", "dining_chair", "office_chair"],
  office_chair: ["accent_chair", "dining_chair", "office_chair"],
  floor_lamp: ["floor_lamp", "table_lamp", "ceiling_light"],
  table_lamp: ["floor_lamp", "table_lamp", "ceiling_light"],
  ceiling_light: ["floor_lamp", "table_lamp", "ceiling_light"],
  storage: ["storage", "bookshelf", "wardrobe", "dresser", "media_unit"],
  bookshelf: ["storage", "bookshelf", "wardrobe", "dresser", "media_unit"],
  wardrobe: ["storage", "bookshelf", "wardrobe", "dresser", "media_unit"],
  dresser: ["storage", "bookshelf", "wardrobe", "dresser", "media_unit"],
  media_unit: ["storage", "bookshelf", "wardrobe", "dresser", "media_unit"],
};

export async function embedText(
  text: string,
  clipEmbedUrl: string,
): Promise<number[]> {
  const resp = await fetch(clipEmbedUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) {
    throw new Error(`CLIP embed failed: ${resp.status}`);
  }
  const data = await resp.json();
  return data.embedding;
}

export async function searchProductsByEmbedding(
  embedding: number[],
  category: string | null,
  supabaseUrl: string,
  supabaseKey: string,
  matchCount: number = 3,
): Promise<ProductMatch[]> {
  const fetchCount = category ? matchCount * 5 : matchCount;
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/rpc/search_products_by_embedding`,
    {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_count: fetchCount,
        match_threshold: 0.0,
      }),
    },
  );

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Product search failed: ${resp.status} ${error}`);
  }

  const results: ProductMatch[] = await resp.json();

  if (!category) {
    return results.slice(0, matchCount);
  }

  // Try exact category match first
  const exact = results.filter((r) => r.category === category);
  if (exact.length >= matchCount) {
    return exact.slice(0, matchCount);
  }

  // Fall back to category group
  const group = CATEGORY_GROUPS[category] ?? [category];
  const grouped = results.filter((r) => group.includes(r.category));
  if (grouped.length > 0) {
    return grouped.slice(0, matchCount);
  }

  // Last resort: return best by similarity regardless of category
  return (exact.length > 0 ? exact : results).slice(0, matchCount);
}

async function searchProductsByFusionEmbedding(
  embedding: number[],
  category: string | null,
  supabaseUrl: string,
  supabaseKey: string,
  matchCount: number = 3,
): Promise<ProductMatch[]> {
  const fetchCount = category ? matchCount * 5 : matchCount;
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/rpc/search_products_by_fusion_embedding`,
    {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_count: fetchCount,
        match_threshold: 0.0,
      }),
    },
  );

  if (!resp.ok) {
    return []; // Fusion not available, caller will fallback
  }

  const results: ProductMatch[] = await resp.json();
  if (results.length === 0) return [];

  if (!category) return results.slice(0, matchCount);

  const exact = results.filter((r) => r.category === category);
  if (exact.length >= matchCount) return exact.slice(0, matchCount);

  const group = CATEGORY_GROUPS[category] ?? [category];
  const grouped = results.filter((r) => group.includes(r.category));
  return (
    grouped.length > 0 ? grouped : exact.length > 0 ? exact : results
  ).slice(0, matchCount);
}

export async function findMatchingProducts(
  searchQuery: string,
  category: string | null,
  clipEmbedUrl: string,
  supabaseUrl: string,
  supabaseKey: string,
  matchCount: number = 3,
): Promise<ProductMatch[]> {
  const embedding = await embedText(searchQuery, clipEmbedUrl);

  // Try fusion embeddings first (higher quality when available)
  const fusionResults = await searchProductsByFusionEmbedding(
    embedding,
    category,
    supabaseUrl,
    supabaseKey,
    matchCount,
  );
  if (fusionResults.length >= matchCount) {
    return fusionResults;
  }

  // Fallback to image-only embeddings
  return searchProductsByEmbedding(
    embedding,
    category,
    supabaseUrl,
    supabaseKey,
    matchCount,
  );
}
