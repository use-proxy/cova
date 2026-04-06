import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { embedImage } from '@/lib/ai/clip'
import { cropAndUploadRenderRegion } from '@/lib/ai/renderCrop'
import { searchProducts, buildSearchQuery, isTechItem, type SerperProduct } from '@/lib/ai/serper'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

const anthropic = new Anthropic()

// ── Types ─────────────────────────────────────────────────────────────────────

interface MatchRequestBody {
  render_url: string
  item_id: string
  item_label: string
  item_bbox: [number, number, number, number]  // [x,y,w,h] fractions
  item_keep: boolean | null
  fingerprint_vector: number[]
  budget_range: [number, number] | null
  room_type: string
  room_id: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0)
    magA += (a[i] ?? 0) * (a[i] ?? 0)
    magB += (b[i] ?? 0) * (b[i] ?? 0)
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB)
  return mag === 0 ? 0 : dot / mag
}

function computeBudgetScore(price: number, range: [number, number]): number {
  const [min, max] = range
  const mid = (min + max) / 2
  if (price < min) return 0.70 + 0.30 * (price / min)   // under budget: 70-100%
  if (price > max) return Math.max(0, 1 - (price - max) / max)  // over: falls to 0
  // Within range: peaks at midpoint
  const distFromMid = Math.abs(price - mid) / (max - min)
  return 1 - 0.3 * distFromMid
}

function getMatchLabel(score: number): 'Perfect Match' | 'Very Similar' | 'Inspired By' {
  if (score >= 0.85) return 'Perfect Match'
  if (score >= 0.75) return 'Very Similar'
  return 'Inspired By'
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = checkRateLimit(user.id, 'match')
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retry_after: rateLimit.retryAfterSeconds },
        { status: 429 }
      )
    }

    const body = (await request.json()) as MatchRequestBody
    const {
      render_url,
      item_id,
      item_label,
      item_bbox,
      item_keep,
      budget_range,
      room_type,
      room_id,
    } = body

    if (!render_url || !item_id || !item_label || !item_bbox || !room_id || !room_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Hard reject kept items — no replacement needed
    if (item_keep === true) {
      return NextResponse.json(
        { error: 'Item is marked as kept — no replacement needed' },
        { status: 400 }
      )
    }

    // Step 1: Crop the render to the item bbox
    const cropUrl = await cropAndUploadRenderRegion(
      render_url,
      { x: item_bbox[0], y: item_bbox[1], w: item_bbox[2], h: item_bbox[3] },
      room_id,
      item_id,
    )

    // Step 2: Claude Vision — describe the cropped item for search
    let itemDescription = item_label
    try {
      const visionResponse = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: cropUrl },
            },
            {
              type: 'text',
              text: `Describe this ${item_label} for product matching.
Focus only on essential visual attributes that would help find a real product:
- Material (e.g. "solid walnut wood", "bouclé fabric", "brushed brass")
- Color (e.g. "warm camel", "charcoal grey", "natural oak")
- Form (e.g. "low-profile with tapered legs", "rounded arms", "arc silhouette")
- Scale indicator (e.g. "3-seater", "large", "accent")
Do NOT describe lighting, shadows, or room context.
Return a single search-optimized phrase under 15 words.
Example: "low-profile walnut coffee table tapered hairpin legs mid-century"`,
            },
          ],
        }],
      })
      const first = visionResponse.content[0]
      if (first.type === 'text' && first.text.trim()) {
        itemDescription = first.text.trim()
      }
    } catch (err) {
      console.warn('[match] Claude Vision failed, using item label:', err)
    }

    // Step 3: Serper Shopping — two queries in parallel
    const isTech = isTechItem(item_label)
    const specificQuery = buildSearchQuery(itemDescription, budget_range, isTech)
    const broaderQuery = buildSearchQuery(item_label, budget_range, isTech)

    const [specificResults, broaderResults] = await Promise.allSettled([
      searchProducts(specificQuery, 10),
      searchProducts(broaderQuery, 10),
    ])

    // Combine and deduplicate by productUrl
    const allProductsMap = new Map<string, SerperProduct>()
    if (specificResults.status === 'fulfilled') {
      specificResults.value.products.forEach((p) => allProductsMap.set(p.productUrl, p))
    }
    if (broaderResults.status === 'fulfilled') {
      broaderResults.value.products.forEach((p) => {
        if (!allProductsMap.has(p.productUrl)) allProductsMap.set(p.productUrl, p)
      })
    }
    const candidates = Array.from(allProductsMap.values())

    // If Serper returned nothing (no API key, rate limited, etc.) — empty response
    if (candidates.length === 0) {
      return NextResponse.json({
        products: [],
        item_description: itemDescription,
        queries_used: [specificQuery, broaderQuery],
      })
    }

    // Step 4: CLIP embed the crop
    let cropEmbedding: number[] = []
    try {
      cropEmbedding = await embedImage(cropUrl)
    } catch (err) {
      console.warn('[match] Crop CLIP embed failed:', err)
    }

    // Step 5: CLIP embed product images and re-rank by visual similarity
    const CLIP_THRESHOLD = 0.70
    const BATCH_SIZE = 10

    type ScoredProduct = SerperProduct & {
      visualScore: number
      budgetScore: number
      finalScore: number
    }
    const candidatesWithScores: ScoredProduct[] = []

    const candidateSlice = candidates.slice(0, 20)  // cap at 20 CLIP calls

    for (let i = 0; i < candidateSlice.length; i += BATCH_SIZE) {
      const batch = candidateSlice.slice(i, i + BATCH_SIZE)
      const embedResults = await Promise.allSettled(
        batch.map((product) => embedImage(product.imageUrl))
      )

      batch.forEach((product, idx) => {
        const embResult = embedResults[idx]
        if (!embResult || embResult.status !== 'fulfilled') return

        const productEmbedding = embResult.value

        // If crop embedding failed, skip visual filtering
        const visualScore =
          cropEmbedding.length > 0
            ? cosineSimilarity(cropEmbedding, productEmbedding)
            : 0.75  // neutral score when crop embed unavailable

        // Hard filter — skip visually dissimilar products
        if (cropEmbedding.length > 0 && visualScore < CLIP_THRESHOLD) return

        const budgetScore = budget_range
          ? computeBudgetScore(product.price, budget_range)
          : 0.75

        const qualityScore = product.rating ? product.rating / 5 : 0.70

        // Final score: 60% visual, 30% budget, 10% quality
        const finalScore =
          0.60 * visualScore +
          0.30 * budgetScore +
          0.10 * qualityScore

        candidatesWithScores.push({ ...product, visualScore, budgetScore, finalScore })
      })
    }

    // Sort by finalScore descending, take top 5
    const topProducts = candidatesWithScores
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 5)

    // If CLIP filtering eliminated everything, fall back to top budget-scored candidates
    const finalProducts = topProducts.length > 0
      ? topProducts
      : candidates
          .slice(0, 5)
          .map((p) => ({
            ...p,
            visualScore: 0.70,
            budgetScore: budget_range ? computeBudgetScore(p.price, budget_range) : 0.75,
            finalScore: 0.70,
          }))

    return NextResponse.json({
      products: finalProducts.map((p) => ({
        id: crypto.randomUUID(),
        name: p.title,
        retailer: p.retailer,
        price: p.price,
        affiliate_url: p.productUrl,
        image_url: p.imageUrl,
        match_score: p.finalScore,
        match_label: getMatchLabel(p.visualScore),
        is_sale: p.isSale,
        rating: p.rating,
        rating_count: p.ratingCount,
      })),
      item_description: itemDescription,
      queries_used: [specificQuery, broaderQuery],
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
