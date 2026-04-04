import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'
import {
  embedImage,
  cosineSimilarity,
  fingerprintToStyleTags,
  computeFingerprintAlignment,
  computeBudgetFit,
} from '@/lib/ai/clip'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import type { Tables } from '@/types/supabase'

const anthropic = new Anthropic()

interface MatchRequestBody {
  render_crop_url: string
  fingerprint_vector: number[]
  budget_range: [number, number]
  room_type: string
}

interface RankedProduct {
  id: string
  name: string
  price: number
  retailer: string
  affiliate_url: string
  image_url: string
  match_score: number
  match_label: 'Perfect Match' | 'Very Similar' | 'Inspired By'
  style_tags: string[]
}

interface ClaudeVisionQuery {
  description: string
  style_tags: string[]
  material: string
  color: string
  dimensions_estimate: string
}

async function buildClaudeVisionQuery(imageUrl: string): Promise<ClaudeVisionQuery> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'url',
                url: imageUrl,
              },
            },
            {
              type: 'text',
              text: `Describe this furniture piece for product matching. Be specific and concise.
                Return only valid JSON with these fields:
                {
                  "description": "one sentence description",
                  "style_tags": ["tag1", "tag2", "tag3"],
                  "material": "primary material",
                  "color": "primary color",
                  "dimensions_estimate": "approximate size"
                }
                No markdown, no explanation, just the JSON.`,
            },
          ],
        },
      ],
    })

    const text =
      message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'

    return JSON.parse(text) as ClaudeVisionQuery
  } catch {
    return {
      description: 'furniture piece',
      style_tags: [],
      material: 'unknown',
      color: 'unknown',
      dimensions_estimate: 'unknown',
    }
  }
}

function getMatchLabel(score: number): 'Perfect Match' | 'Very Similar' | 'Inspired By' {
  if (score >= 0.85) return 'Perfect Match'
  if (score >= 0.7) return 'Very Similar'
  return 'Inspired By'
}

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
    const { render_crop_url, fingerprint_vector, budget_range, room_type } = body

    if (!render_crop_url || !fingerprint_vector || !budget_range) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Layer 1: Claude Vision query construction
    const visionQuery = await buildClaudeVisionQuery(render_crop_url)

    // Layer 2: CLIP embedding + pgvector search
    let queryEmbedding: number[]
    try {
      queryEmbedding = await embedImage(render_crop_url)
    } catch {
      queryEmbedding = []
    }

    const admin = createAdminSupabaseClient()

    // Fetch candidate products filtered by room type and budget
    const { data: candidates } = await admin
      .from('products')
      .select('*')
      .eq('active', true)
      .contains('room_types', [room_type])
      .gte('price', budget_range[0] * 0.5)
      .lte('price', budget_range[1] * 1.5)
      .limit(50)

    let productList = candidates ?? []

    if (productList.length === 0) {
      // Fallback: fetch without room type filter
      const { data: fallbackCandidates } = await admin
        .from('products')
        .select('*')
        .eq('active', true)
        .gte('price', budget_range[0] * 0.5)
        .lte('price', budget_range[1] * 1.5)
        .limit(50)

      productList = fallbackCandidates ?? []
    }

    const fingerprintTags = fingerprintToStyleTags(fingerprint_vector)

    // Layer 3: Unified ranking with exact COVA formula
    // Score = 0.35*visual_sim + 0.30*fingerprint_align +
    //         0.20*budget_fit + 0.10*behavioral + 0.05*affiliate_weight
    const ranked: RankedProduct[] = productList
      .map((product: Tables<'products'>) => {
        // Visual similarity via CLIP cosine
        let visualSim = 0.5
        if (queryEmbedding.length > 0 && product.clip_embedding) {
          try {
            visualSim = cosineSimilarity(queryEmbedding, product.clip_embedding)
          } catch {
            visualSim = 0.5
          }
        }

        // Fingerprint alignment
        const fingerprintAlign = computeFingerprintAlignment(
          product.style_tags ?? [],
          fingerprintTags
        )

        // Budget fit
        const budgetFit = computeBudgetFit(product.price ?? 0, budget_range)

        // Behavioral (0 until data accumulates)
        const behavioral = 0

        // Affiliate weight — based on price tier (proxy for margin/commission)
        const tierWeights: Record<string, number> = { budget: 0.3, mid: 0.6, premium: 0.9 }
        const affiliateWeight = product.price_tier ? (tierWeights[product.price_tier] ?? 0.5) : 0.5

        // Exact COVA scoring formula
        const score =
          0.35 * visualSim +
          0.3 * fingerprintAlign +
          0.2 * budgetFit +
          0.1 * behavioral +
          0.05 * affiliateWeight

        return {
          id: product.id,
          name: product.name,
          price: product.price ?? 0,
          retailer: product.retailer ?? '',
          affiliate_url: product.affiliate_url ?? product.affiliate_url_base ?? '',
          image_url: product.image_url ?? '',
          match_score: score,
          match_label: getMatchLabel(score),
          style_tags: product.style_tags ?? [],
        }
      })
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 8)

    return NextResponse.json({
      products: ranked,
      query_description: visionQuery.description,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
