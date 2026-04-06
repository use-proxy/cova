import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { cropAndUploadRenderRegion } from '@/lib/ai/renderCrop'
import { searchProducts, buildSearchQuery, isTechItem, type SerperProduct } from '@/lib/ai/serper'
import { getItemBudgetTarget } from '@/lib/ai/budget'
import { extractDimensionsFromText, getDimensionsForCategory, scoreFit, type FitScore } from '@/lib/ai/fit'
import Anthropic from '@anthropic-ai/sdk'
import Replicate from 'replicate'
import { NextResponse } from 'next/server'

const anthropic = new Anthropic()
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

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
  primary_wall_usable_inches?: number
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
      primary_wall_usable_inches,
    } = body

    // Per-item budget target (designer allocation ratios by room type)
    const itemBudgetRange: [number, number] | null = budget_range
      ? getItemBudgetTarget(item_label, room_type, budget_range)
      : null

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
        // Cap at 12 words to keep Serper queries focused
        itemDescription = first.text.trim().split(/\s+/).slice(0, 12).join(' ')
      }
    } catch (err) {
      console.warn('[match] Claude Vision failed, using item label:', err)
    }

    // Step 3: Serper Shopping — two queries in parallel (use per-item budget range)
    const isTech = isTechItem(item_label)
    const specificQuery = buildSearchQuery(itemDescription, itemBudgetRange, isTech)
    const broaderQuery = buildSearchQuery(item_label, itemBudgetRange, isTech)

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
    // Also deduplicate by normalized title (catches same product at different URLs)
    const seenTitles = new Set<string>()
    const candidates = Array.from(allProductsMap.values()).filter((p) => {
      const normalized = p.title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .slice(0, 6)
        .join(' ')
      if (seenTitles.has(normalized)) return false
      seenTitles.add(normalized)
      return true
    })

    // If Serper returned nothing (no API key, rate limited, etc.) — empty response
    if (candidates.length === 0) {
      return NextResponse.json({
        products: [],
        item_description: itemDescription,
        queries_used: [specificQuery, broaderQuery],
      })
    }

    // Step 4+5: Single batched CLIP call — crop at index 0, candidates at 1-N
    // andreasjansson/clip-features accepts newline-separated URLs in one call
    const allUrls = [
      cropUrl,
      ...candidates.slice(0, 20).map((p) => p.imageUrl),
    ].join('\n')

    let allEmbeddings: Array<{ input: string; embedding: number[] }> = []

    try {
      const batchOutput = await replicate.run(
        'andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a',
        { input: { inputs: allUrls } }
      ) as Array<{ input: string; embedding: number[] }>

      allEmbeddings = batchOutput
    } catch (err) {
      console.error('[match] CLIP batch embedding failed:', err)
      // Fallback: return top 5 Serper results ranked by budget fit alone
      const fallbackProducts = candidates.slice(0, 5).map((p) => ({
        id: crypto.randomUUID(),
        name: p.title,
        retailer: p.retailer,
        price: p.price,
        affiliate_url: p.productUrl,
        image_url: p.imageUrl,
        match_score: 0.70,
        match_label: 'Inspired By' as const,
        fit_label: 'Dimensions Unconfirmed' as const,
        fit_reason: 'Room dimensions not provided',
        is_sale: p.isSale,
        rating: p.rating,
        rating_count: p.ratingCount,
      }))
      return NextResponse.json({
        products: fallbackProducts,
        item_description: itemDescription,
        queries_used: [specificQuery, broaderQuery],
      })
    }

    // Index 0 = crop embedding; indices 1-N = candidate product embeddings
    const cropEmbedding = allEmbeddings[0]?.embedding
    if (!cropEmbedding) {
      return NextResponse.json({
        products: [],
        item_description: itemDescription,
        queries_used: [specificQuery, broaderQuery],
      })
    }

    const CLIP_THRESHOLD = 0.65

    const candidatesWithScores: Array<SerperProduct & {
      visualScore: number
      budgetScore: number
      fitResult: FitScore
      finalScore: number
    }> = []

    candidates.slice(0, 20).forEach((product, idx) => {
      const embeddingResult = allEmbeddings[idx + 1]  // offset by 1 (crop is index 0)
      if (!embeddingResult?.embedding) return

      const visualScore = cosineSimilarity(cropEmbedding, embeddingResult.embedding)

      // Hard filter: skip if visual similarity below 0.70
      if (visualScore < CLIP_THRESHOLD) return

      const budgetScore = itemBudgetRange
        ? computeBudgetScore(product.price, itemBudgetRange)
        : 0.75

      // Fit scoring — extract dimensions from product title, fall back to category defaults
      let fitResult: FitScore
      if (primary_wall_usable_inches) {
        const dims = extractDimensionsFromText(product.title) ?? getDimensionsForCategory(item_label)
        fitResult = scoreFit(item_label, dims, primary_wall_usable_inches)
      } else {
        fitResult = {
          label: 'Dimensions Unconfirmed',
          score: 0.60,
          passes: true,
          reason: 'Room dimensions not provided',
        }
      }

      // Hard reject products that physically don't fit
      if (!fitResult.passes) return

      const qualityScore = product.rating ? product.rating / 5 : 0.70
      const finalScore =
        0.55 * visualScore +
        0.25 * budgetScore +
        0.10 * fitResult.score +
        0.10 * qualityScore

      candidatesWithScores.push({ ...product, visualScore, budgetScore, fitResult, finalScore })
    })

    // Sort by finalScore descending, take top 5
    const topProducts = candidatesWithScores
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 5)

    const unconfirmedFit: FitScore = {
      label: 'Dimensions Unconfirmed',
      score: 0.60,
      passes: true,
      reason: 'Room dimensions not provided',
    }

    // If CLIP filtering eliminated everything, fall back to top budget-scored candidates
    const finalProducts = topProducts.length > 0
      ? topProducts
      : candidates
          .slice(0, 5)
          .map((p) => ({
            ...p,
            visualScore: 0.70,
            budgetScore: itemBudgetRange ? computeBudgetScore(p.price, itemBudgetRange) : 0.75,
            fitResult: unconfirmedFit,
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
        fit_label: p.fitResult.label,
        fit_reason: p.fitResult.reason,
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
