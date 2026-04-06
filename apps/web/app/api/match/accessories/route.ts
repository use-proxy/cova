import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { searchProducts, buildSearchQuery } from '@/lib/ai/serper'

interface AccessoriesRequestBody {
  styleName: string
  fingerprint: number[]
  roomType: string
  budgetRange: [number, number] | null
  primaryItemLabels: string[]   // items already matched e.g. ["sofa", "coffee table"]
  keptItemLabels: string[]      // kept furniture for context
}

// Accessory budget is 10% of total, split across 3-4 items
const ACCESSORY_BUDGET_RATIO = 0.10
const ACCESSORY_COUNT = 3

// Map fingerprint dimensions to accessory style terms
// Only dimensions with strong signal (>0.65 or <0.35) contribute
function getFingerprintAccessoryTerms(fingerprint: number[]): string {
  const terms: string[] = []

  // Index 2: Temperature
  if ((fingerprint[2] ?? 0.5) > 0.65) terms.push('warm tones brass terracotta')
  if ((fingerprint[2] ?? 0.5) < 0.35) terms.push('cool grey silver minimal')

  // Index 5: Texture
  if ((fingerprint[5] ?? 0.5) > 0.65) terms.push('textured woven natural fiber')
  if ((fingerprint[5] ?? 0.5) < 0.35) terms.push('smooth polished clean')

  // Index 7: Nature
  if ((fingerprint[7] ?? 0.5) > 0.65) terms.push('natural organic botanical')
  if ((fingerprint[7] ?? 0.5) < 0.35) terms.push('urban industrial geometric')

  // Index 4: Era
  if ((fingerprint[4] ?? 0.5) > 0.65) terms.push('vintage antique heritage')
  if ((fingerprint[4] ?? 0.5) < 0.35) terms.push('contemporary modern current')

  // Index 8: Saturation
  if ((fingerprint[8] ?? 0.5) > 0.65) terms.push('refined elegant')
  if ((fingerprint[8] ?? 0.5) < 0.35) terms.push('casual relaxed cozy')

  return terms.join(' ')
}

const ACCESSORY_CATEGORIES: Record<string, string[]> = {
  living_room: ['throw pillow set', 'decorative vase', 'area rug runner', 'wall art print', 'candle set', 'throw blanket'],
  bedroom: ['bedside lamp', 'decorative cushion', 'wall art', 'plant pot', 'mirror'],
  home_office: ['desk lamp', 'plant', 'wall art', 'desk organizer', 'decorative bookend'],
  dining_room: ['table centerpiece', 'pendant light', 'decorative bowl', 'candle holder'],
  bathroom: ['bath mat', 'soap dispenser set', 'plant', 'mirror', 'towel set'],
  studio: ['floor lamp', 'plant', 'wall art', 'decorative tray'],
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as AccessoriesRequestBody

    const fingerprintTerms = getFingerprintAccessoryTerms(body.fingerprint)

    // Compute accessory budget per item
    const totalBudget = body.budgetRange
      ? (body.budgetRange[0] + body.budgetRange[1]) / 2
      : 1000
    const accessoryBudgetPerItem = Math.round(
      (totalBudget * ACCESSORY_BUDGET_RATIO) / ACCESSORY_COUNT
    )
    const accessoryBudgetRange: [number, number] = [
      Math.round(accessoryBudgetPerItem * 0.5),
      Math.round(accessoryBudgetPerItem * 1.5),
    ]

    // Get accessory categories for this room type
    const roomTypeKey = body.roomType.toLowerCase().replace(/\s+/g, '_')
    const categories =
      ACCESSORY_CATEGORIES[roomTypeKey] ?? ACCESSORY_CATEGORIES['living_room']!

    // Pick 3 accessory categories not already covered by primary items
    const primaryLabelsLower = body.primaryItemLabels.map(l => l.toLowerCase())
    const availableCategories = categories.filter(cat =>
      !primaryLabelsLower.some(label => cat.includes(label))
    )
    const selectedCategories = availableCategories.slice(0, ACCESSORY_COUNT)

    // Context from kept items
    const keptContext = body.keptItemLabels.length > 0
      ? `complementing ${body.keptItemLabels.join(' and ')}`
      : ''

    // Search Serper for each accessory category in parallel
    const accessoryResults = await Promise.allSettled(
      selectedCategories.map(async (category) => {
        const query = buildSearchQuery(
          `${category} ${body.styleName ?? ''} ${fingerprintTerms} ${keptContext}`.trim(),
          accessoryBudgetRange,
          false, // accessories are not tech items
        )
        const result = await searchProducts(query, 5)
        return {
          category,
          product: result.products[0] ?? null, // top result only
        }
      })
    )

    // Build accessory product list
    const accessories = accessoryResults
      .filter(r => r.status === 'fulfilled' && r.value.product !== null)
      .map(r => {
        if (r.status !== 'fulfilled' || !r.value.product) return null
        const p = r.value.product
        return {
          id: crypto.randomUUID(),
          name: p.title,
          retailer: p.retailer,
          price: p.price,
          affiliate_url: p.productUrl,
          image_url: p.imageUrl,
          match_score: 0.75,
          match_label: 'Inspired By' as const,
          category: r.value.category,
          is_sale: p.isSale,
          rating: p.rating,
          rating_count: p.ratingCount,
        }
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)

    return NextResponse.json({ accessories })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
