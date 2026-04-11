/**
 * Pipeline 3 — Furniture Detection + SERP Matching
 *
 * 1. Calls Modal webhook to detect furniture via Claude Vision (detection only)
 * 2. For each detected item, fires Serper Shopping API search
 * 3. Filters results by budget range
 * 4. Writes results to room_products table + rooms.matched_products JSONB
 *
 * Input:  { room_id: string, fixed_furniture?: array, budget_range?: [number, number] }
 * Output: { status, room_id, furniture_count, products_matched, items }
 */

export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { searchProducts, type SerperProduct } from '@/lib/ai/serper'

interface FurnitureMatchBody {
  room_id?: string
  fixed_furniture?: unknown[]
  budget_range?: [number, number]
  style_descriptor?: string
}

interface DetectedItem {
  label: string
  description: string
  category: string
  azimuth_degrees: number
  elevation_degrees: number
  search_query: string
  hotspot_x?: number
  hotspot_y?: number
}

interface SerpMatchedProduct {
  title: string
  price: number | null
  retailer: string
  productUrl: string
  thumbnailUrl: string
  itemLabel: string
  isSale: boolean
  rating: number | null
  ratingCount: number | null
  matchScore: number
}

export async function POST(request: Request) {
  const serviceKey = request.headers.get('x-service-key')
  const isServiceCall =
    !!serviceKey && serviceKey === process.env.SUPABASE_SERVICE_ROLE_KEY

  const supabase = isServiceCall
    ? createAdminSupabaseClient()
    : await createServerSupabaseClient()

  let user: { id: string } | null = null
  if (!isServiceCall) {
    const {
      data: { user: authedUser },
    } = await supabase.auth.getUser()
    if (!authedUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    user = authedUser
  }

  const body = (await request.json()) as FurnitureMatchBody
  const { room_id, fixed_furniture, budget_range, style_descriptor } = body

  if (!room_id) {
    return NextResponse.json({ error: 'room_id is required' }, { status: 400 })
  }

  const webhookUrl = process.env.FURNITURE_MATCHING_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json(
      { error: 'FURNITURE_MATCHING_WEBHOOK_URL not configured' },
      { status: 503 }
    )
  }

  try {
    // Resolve user_id for the Modal webhook payload.
    // Service-key calls have no authed user, so look it up from the room.
    let userId: string | null = user?.id ?? null
    if (!userId) {
      const { data: roomRow } = await supabase
        .from('rooms')
        .select('user_id')
        .eq('id', room_id)
        .single()
      userId = (roomRow as { user_id?: string } | null)?.user_id ?? null
    }

    // ── Step 1: Call Modal for furniture detection ──────────────────────
    const detectionResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id,
        user_id: userId,
        fixed_furniture: fixed_furniture ?? [],
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!detectionResponse.ok) {
      const text = await detectionResponse.text().catch(() => detectionResponse.statusText)
      console.error('[furniture-match] Detection webhook error:', detectionResponse.status, text)
      return NextResponse.json(
        { error: 'Furniture detection failed', detail: text },
        { status: 502 }
      )
    }

    const detectionResult = (await detectionResponse.json()) as {
      status: string
      furniture_items?: DetectedItem[]
      furniture_count?: number
      detection_source?: string
      error?: string
    }

    if (detectionResult.status === 'error') {
      console.error('[furniture-match] Detection error:', detectionResult.error)
      return NextResponse.json(
        { error: detectionResult.error ?? 'Furniture detection failed' },
        { status: 500 }
      )
    }

    const furnitureItems = detectionResult.furniture_items ?? []
    if (furnitureItems.length === 0) {
      return NextResponse.json({
        status: 'complete',
        room_id,
        furniture_count: 0,
        products_matched: 0,
        items: [],
      })
    }

    // ── Step 2: SERP search per item ───────────────────────────────────
    await supabase
      .from('rooms')
      .update({ redesign_status: 'matching_products' })
      .eq('id', room_id)

    const allMatchedProducts: SerpMatchedProduct[] = []
    const roomProductRecords: Record<string, unknown>[] = []

    for (const item of furnitureItems) {
      const styleTag = style_descriptor ?? ''
      const searchQuery = item.search_query || `${item.label} ${styleTag} buy`

      let products: SerperProduct[] = []
      try {
        const result = await searchProducts(searchQuery, 10)
        products = result.products
      } catch (err) {
        console.warn(`[furniture-match] Serper search failed for "${item.label}":`, err)
        continue
      }

      // Filter by budget range if provided
      if (budget_range && budget_range.length === 2) {
        const [minBudget, maxBudget] = budget_range
        // Per-item budget: approximate by dividing total by furniture count
        const perItemMax = maxBudget / Math.max(furnitureItems.length, 1) * 2 // allow 2x per-item average
        const perItemMin = minBudget / Math.max(furnitureItems.length, 1) * 0.3
        products = products.filter(
          (p) => p.price >= perItemMin && p.price <= perItemMax
        )
      }

      // Take top 5 per item
      const topProducts = products.slice(0, 5)

      for (let rank = 0; rank < topProducts.length; rank++) {
        const p = topProducts[rank]!
        const matchScore = 1.0 - rank * 0.1 // simple rank-based score

        allMatchedProducts.push({
          title: p.title,
          price: p.price,
          retailer: p.retailer,
          productUrl: p.productUrl,
          thumbnailUrl: p.imageUrl,
          itemLabel: item.label,
          isSale: p.isSale,
          rating: p.rating,
          ratingCount: p.ratingCount,
          matchScore,
        })

        roomProductRecords.push({
          room_id,
          product_id: null, // SERP results — not in products table
          furniture_label: item.label,
          furniture_description: item.description,
          similarity_score: matchScore,
          rank: rank + 1,
          azimuth_degrees: item.azimuth_degrees,
          elevation_degrees: item.elevation_degrees ?? -25,
          hotspot_x: item.hotspot_x ?? null,
          hotspot_y: item.hotspot_y ?? null,
          is_unlocked: false,
          serp_title: p.title,
          serp_price: p.price,
          serp_retailer: p.retailer,
          serp_product_url: p.productUrl,
          serp_image_url: p.imageUrl,
          match_score: matchScore,
          match_label: rank === 0 ? 'Top Match' : rank <= 2 ? 'Close Match' : 'Inspired By',
          is_sale: p.isSale,
        })
      }
    }

    // ── Step 3: Write to Supabase ──────────────────────────────────────

    // Clear existing room_products for this room
    await supabase
      .from('room_products')
      .delete()
      .eq('room_id', room_id)

    // Insert new SERP-matched products
    if (roomProductRecords.length > 0) {
      const { error: insertError } = await supabase
        .from('room_products')
        .insert(roomProductRecords)

      if (insertError) {
        console.error('[furniture-match] Insert error:', insertError)
      }
    }

    // Write matched_products JSONB to rooms table
    await supabase
      .from('rooms')
      .update({
        matched_products: allMatchedProducts,
        furniture_matches_count: roomProductRecords.length,
        redesign_status: 'complete',
      })
      .eq('id', room_id)

    return NextResponse.json({
      status: 'complete',
      room_id,
      furniture_count: furnitureItems.length,
      products_matched: roomProductRecords.length,
      detection_source: detectionResult.detection_source ?? 'unknown',
      items: furnitureItems.map((item) => ({
        label: item.label,
        category: item.category,
        products: allMatchedProducts
          .filter((p) => p.itemLabel === item.label)
          .slice(0, 5),
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[furniture-match] Unexpected error:', message)

    // Write error status
    await supabase
      .from('rooms')
      .update({ redesign_status: 'error' })
      .eq('id', room_id)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
