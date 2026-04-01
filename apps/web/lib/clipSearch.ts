/**
 * CLIP text embedding and product similarity search.
 * Uses existing Modal CLIP endpoint and Supabase pgvector RPC.
 */

export interface ProductMatch {
  id: string
  name: string
  price: number
  category: string
  retailer: string
  affiliate_url: string
  image_url: string
  similarity: number
  style_tags: string[]
}

export interface FurnitureDetection {
  label: string
  description: string
  category: string
  azimuth_degrees: number
  search_query: string
}

export async function embedText(text: string, clipEmbedUrl: string): Promise<number[]> {
  const resp = await fetch(clipEmbedUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!resp.ok) {
    throw new Error(`CLIP embed failed: ${resp.status}`)
  }
  const data = await resp.json()
  return data.embedding
}

export async function searchProductsByEmbedding(
  embedding: number[],
  category: string | null,
  supabaseUrl: string,
  supabaseKey: string,
  matchCount: number = 3
): Promise<ProductMatch[]> {
  const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/search_products_by_embedding`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query_embedding: embedding,
      match_count: matchCount,
      match_threshold: 0.0,
    }),
  })

  if (!resp.ok) {
    const error = await resp.text()
    throw new Error(`Product search failed: ${resp.status} ${error}`)
  }

  const results: ProductMatch[] = await resp.json()

  // Filter by category client-side if the RPC doesn't support it
  if (category) {
    return results.filter((r) => r.category === category).slice(0, matchCount)
  }
  return results.slice(0, matchCount)
}

export async function findMatchingProducts(
  searchQuery: string,
  category: string | null,
  clipEmbedUrl: string,
  supabaseUrl: string,
  supabaseKey: string,
  matchCount: number = 3
): Promise<ProductMatch[]> {
  const embedding = await embedText(searchQuery, clipEmbedUrl)
  return searchProductsByEmbedding(embedding, category, supabaseUrl, supabaseKey, matchCount)
}
