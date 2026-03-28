#!/usr/bin/env ts-node
/**
 * expand-quiz-cards.ts
 *
 * Part A: Audit existing quiz_cards — verify image URLs, style_weights, phase, room_type
 * Part B: Add ~500 new cards via Unsplash API (300 pure + 200 blend)
 * Part C: Report final count
 *
 * Usage:
 *   npx ts-node scripts/expand-quiz-cards.ts
 *
 * Required env vars (from .env.local in repo root):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   UNSPLASH_ACCESS_KEY  (optional — Part B skipped if missing)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------

// Absolute path so it works when compiled JS runs from /tmp/
const envPath = '/Users/daksh/Desktop/cova/.env.local'
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'public' },
})

const LOG_FILE = '/Users/daksh/Desktop/cova/SCRAPING_LOG.md'

const STYLES = ['coastal', 'japandi', 'bohemian', 'mid_century', 'minimalist'] as const
type Style = typeof STYLES[number]
type RoomType = 'living_room' | 'bedroom' | 'dining_room' | 'home_office'
type Phase = 'pure' | 'blend'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StyleWeights {
  coastal: number
  japandi: number
  bohemian: number
  mid_century: number
  minimalist: number
}

interface QuizCard {
  id: string
  image_url: string | null
  style_weights: StyleWeights | null
  phase: Phase | null
  room_type: RoomType | null
  discriminability_score: number | null
}

interface UnsplashPhoto {
  id: string
  width: number
  height: number
  urls: {
    regular: string
    small: string
    thumb: string
  }
  user: {
    name: string
    username: string
  }
  alt_description: string | null
}

interface UnsplashSearchResponse {
  total: number
  total_pages: number
  results: UnsplashPhoto[]
}

interface NewQuizCard {
  image_url: string
  style_weights: StyleWeights
  phase: Phase
  room_type: RoomType
  discriminability_score: number
  metadata: {
    unsplash_id: string
    photographer_name: string
    photographer_username: string
    search_query: string
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg: string): void {
  const entry = `[${new Date().toISOString()}] ${msg}`
  console.log(entry)
  fs.appendFileSync(LOG_FILE, entry + '\n')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Part A — Audit existing cards
// ---------------------------------------------------------------------------

async function auditExistingCards(): Promise<void> {
  log('=== PART A: Auditing existing quiz cards ===')

  const { data: cards, error } = await supabase
    .from('swipe_cards')
    .select('id, image_url, style_weights, phase, room_type, discriminability_score')

  if (error) {
    log(`ERROR fetching quiz_cards: ${error.message}`)
    return
  }

  if (!cards || cards.length === 0) {
    log('No quiz cards found in database')
    return
  }

  const typedCards = cards as QuizCard[]
  let validCount = 0
  let brokenUrlCount = 0
  let missingWeightsCount = 0
  let missingPhaseCount = 0
  let missingRoomTypeCount = 0
  let badWeightsSumCount = 0
  const brokenIds: string[] = []

  for (const card of typedCards) {
    let isValid = true

    // Check image_url accessibility
    if (!card.image_url) {
      brokenUrlCount++
      brokenIds.push(card.id)
      isValid = false
    } else {
      try {
        const resp = await fetch(card.image_url, { method: 'HEAD' })
        if (!resp.ok) {
          log(`  Broken URL (${resp.status}): card ${card.id} → ${card.image_url}`)
          brokenUrlCount++
          brokenIds.push(card.id)
          isValid = false
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        log(`  URL unreachable: card ${card.id} → ${errMsg}`)
        brokenUrlCount++
        brokenIds.push(card.id)
        isValid = false
      }
    }

    // Check style_weights
    if (!card.style_weights) {
      missingWeightsCount++
      isValid = false
    } else {
      const weights = card.style_weights as StyleWeights
      const sum = STYLES.reduce((acc, s) => acc + (weights[s] || 0), 0)
      if (Math.abs(sum - 1.0) > 0.05) {
        badWeightsSumCount++
        log(`  Bad weights sum (${sum.toFixed(3)}): card ${card.id}`)
        isValid = false
      }
    }

    // Check phase
    if (!card.phase) {
      missingPhaseCount++
      isValid = false
    }

    // Check room_type
    if (!card.room_type) {
      missingRoomTypeCount++
      isValid = false
    }

    if (isValid) validCount++
  }

  // Delete cards with broken URLs
  if (brokenIds.length > 0) {
    log(`Deleting ${brokenIds.length} cards with broken image URLs...`)
    const { error: delError } = await supabase
      .from('swipe_cards')
      .delete()
      .in('id', brokenIds)

    if (delError) {
      log(`ERROR deleting broken cards: ${delError.message}`)
    } else {
      log(`Deleted ${brokenIds.length} broken cards`)
    }
  }

  const invalidCount = typedCards.length - validCount
  log(
    `Audited ${typedCards.length} cards: ${validCount} valid, ${invalidCount} invalid ` +
    `(broken URL: ${brokenUrlCount}, missing weights: ${missingWeightsCount}, ` +
    `bad weights sum: ${badWeightsSumCount}, missing phase: ${missingPhaseCount}, ` +
    `missing room_type: ${missingRoomTypeCount})`
  )
}

// ---------------------------------------------------------------------------
// Part B — Add new cards via Unsplash
// ---------------------------------------------------------------------------

// Pure style search queries: 3 queries per style, ~20 results each = ~60 per style = 300 pure
const PURE_QUERIES: Array<{ style: Style; query: string; roomType: RoomType }> = [
  // Coastal
  { style: 'coastal', query: 'coastal living room interior', roomType: 'living_room' },
  { style: 'coastal', query: 'beach house bedroom', roomType: 'bedroom' },
  { style: 'coastal', query: 'nautical interior design dining', roomType: 'dining_room' },
  // Japandi
  { style: 'japandi', query: 'japandi interior design', roomType: 'living_room' },
  { style: 'japandi', query: 'minimalist japanese interior bedroom', roomType: 'bedroom' },
  { style: 'japandi', query: 'scandinavian zen room', roomType: 'home_office' },
  // Bohemian
  { style: 'bohemian', query: 'bohemian living room', roomType: 'living_room' },
  { style: 'bohemian', query: 'boho bedroom interior', roomType: 'bedroom' },
  { style: 'bohemian', query: 'eclectic colorful room', roomType: 'dining_room' },
  // Mid-century
  { style: 'mid_century', query: 'mid century modern interior', roomType: 'living_room' },
  { style: 'mid_century', query: 'retro modern living room', roomType: 'living_room' },
  { style: 'mid_century', query: 'vintage modern bedroom', roomType: 'bedroom' },
  // Minimalist
  { style: 'minimalist', query: 'minimalist white interior', roomType: 'living_room' },
  { style: 'minimalist', query: 'clean modern room', roomType: 'home_office' },
  { style: 'minimalist', query: 'minimal scandinavian interior', roomType: 'bedroom' },
]

// Blend search queries: ~10 queries, ~20 results each = ~200 blend
const BLEND_QUERIES: Array<{
  styles: [Style, Style]
  weights: [number, number]
  query: string
  roomType: RoomType
}> = [
  { styles: ['coastal', 'japandi'], weights: [0.55, 0.35], query: 'coastal japandi interior', roomType: 'living_room' },
  { styles: ['coastal', 'minimalist'], weights: [0.50, 0.40], query: 'coastal minimalist room', roomType: 'bedroom' },
  { styles: ['bohemian', 'mid_century'], weights: [0.55, 0.35], query: 'bohemian modern room', roomType: 'living_room' },
  { styles: ['minimalist', 'japandi'], weights: [0.50, 0.40], query: 'minimalist warm interior', roomType: 'home_office' },
  { styles: ['mid_century', 'minimalist'], weights: [0.45, 0.45], query: 'mid century minimalist interior', roomType: 'living_room' },
  { styles: ['bohemian', 'coastal'], weights: [0.50, 0.40], query: 'bohemian coastal bedroom', roomType: 'bedroom' },
  { styles: ['japandi', 'mid_century'], weights: [0.50, 0.40], query: 'japanese mid century modern', roomType: 'dining_room' },
  { styles: ['coastal', 'bohemian'], weights: [0.45, 0.45], query: 'beach boho living room', roomType: 'living_room' },
  { styles: ['minimalist', 'bohemian'], weights: [0.55, 0.35], query: 'minimal boho bedroom', roomType: 'bedroom' },
  { styles: ['mid_century', 'coastal'], weights: [0.50, 0.40], query: 'retro coastal dining room', roomType: 'dining_room' },
]

function makePureWeights(dominant: Style): StyleWeights {
  const weights: StyleWeights = {
    coastal: 0.03,
    japandi: 0.03,
    bohemian: 0.03,
    mid_century: 0.03,
    minimalist: 0.03,
  }
  // Distribute remaining 0.85 to dominant, keep others varied slightly
  weights[dominant] = 0.85
  // Adjust non-dominant to sum to 0.15
  const nonDominant = STYLES.filter(s => s !== dominant)
  const baseShare = 0.15 / nonDominant.length
  for (const s of nonDominant) {
    // Add slight randomness: ±0.01
    weights[s] = Math.max(0.01, baseShare + (Math.random() * 0.02 - 0.01))
  }
  // Normalize to 1.0
  const sum = STYLES.reduce((acc, s) => acc + weights[s], 0)
  for (const s of STYLES) {
    weights[s] = parseFloat((weights[s] / sum).toFixed(4))
  }
  // Fix rounding
  const finalSum = STYLES.reduce((acc, s) => acc + weights[s], 0)
  weights[dominant] += parseFloat((1.0 - finalSum).toFixed(4))
  return weights
}

function makeBlendWeights(
  style1: Style,
  style2: Style,
  weight1: number,
  weight2: number
): StyleWeights {
  const weights: StyleWeights = {
    coastal: 0.02,
    japandi: 0.02,
    bohemian: 0.02,
    mid_century: 0.02,
    minimalist: 0.02,
  }
  weights[style1] = weight1
  weights[style2] = weight2
  // Distribute remainder among non-blend styles
  const blendStyles = new Set([style1, style2])
  const others = STYLES.filter(s => !blendStyles.has(s))
  const remainder = 1.0 - weight1 - weight2
  const share = remainder / others.length
  for (const s of others) {
    weights[s] = Math.max(0.01, share + (Math.random() * 0.02 - 0.01))
  }
  // Normalize
  const sum = STYLES.reduce((acc, s) => acc + weights[s], 0)
  for (const s of STYLES) {
    weights[s] = parseFloat((weights[s] / sum).toFixed(4))
  }
  const finalSum = STYLES.reduce((acc, s) => acc + weights[s], 0)
  weights[style1] += parseFloat((1.0 - finalSum).toFixed(4))
  return weights
}

async function searchUnsplash(
  query: string,
  page: number = 1,
  perPage: number = 30
): Promise<UnsplashPhoto[]> {
  const url = new URL('https://api.unsplash.com/search/photos')
  url.searchParams.set('query', query)
  url.searchParams.set('orientation', 'landscape')
  url.searchParams.set('per_page', String(perPage))
  url.searchParams.set('page', String(page))

  const resp = await fetch(url.toString(), {
    headers: {
      'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`,
    },
  })

  if (!resp.ok) {
    const body = await resp.text()
    log(`  Unsplash API error (${resp.status}): ${body}`)
    return []
  }

  const data = (await resp.json()) as UnsplashSearchResponse
  return data.results
}

function filterPhoto(photo: UnsplashPhoto): boolean {
  // Minimum 1080px wide
  if (photo.width < 1080) return false
  // Landscape only
  if (photo.width <= photo.height) return false
  return true
}

async function addCardsViaUnsplash(): Promise<void> {
  log('=== PART B: Adding new quiz cards via Unsplash ===')

  if (!UNSPLASH_ACCESS_KEY) {
    log('SKIPPED: UNSPLASH_ACCESS_KEY not set')
    return
  }

  let pureAdded = 0
  let blendAdded = 0
  const styleCountMap: Partial<Record<Style, number>> = {}
  const seenUnsplashIds = new Set<string>()

  // --- Pure style cards ---
  log('--- Pure style cards ---')
  for (const entry of PURE_QUERIES) {
    log(`  Searching: "${entry.query}" (${entry.style}, ${entry.roomType})`)
    let photos: UnsplashPhoto[] = []

    // Fetch up to 2 pages (60 results max) to get ~20 usable
    for (let page = 1; page <= 2; page++) {
      const batch = await searchUnsplash(entry.query, page, 30)
      photos = photos.concat(batch)
      // Rate limit: 2s between requests
      await sleep(2000)
    }

    const filtered = photos.filter(p => filterPhoto(p) && !seenUnsplashIds.has(p.id))
    const toInsert: NewQuizCard[] = []

    for (const photo of filtered.slice(0, 20)) {
      seenUnsplashIds.add(photo.id)
      toInsert.push({
        image_url: photo.urls.regular,
        style_weights: makePureWeights(entry.style),
        phase: 'pure',
        room_type: entry.roomType,
        discriminability_score: 0.5,
        metadata: {
          unsplash_id: photo.id,
          photographer_name: photo.user.name,
          photographer_username: photo.user.username,
          search_query: entry.query,
        },
      })
    }

    if (toInsert.length > 0) {
      // Map to swipe_cards schema: room_type, style, image_url, style_weights, active, phase, discriminability_score
      const dbRows = toInsert.map(c => ({
        image_url: c.image_url,
        style_weights: c.style_weights,
        phase: c.phase,
        room_type: c.room_type,
        discriminability_score: c.discriminability_score,
        style: entry.style,
        active: true,
      }))
      const { error: insertError } = await supabase
        .from('swipe_cards')
        .insert(dbRows)

      if (insertError) {
        log(`  ERROR inserting pure cards for "${entry.query}": ${insertError.message}`)
      } else {
        pureAdded += toInsert.length
        styleCountMap[entry.style] = (styleCountMap[entry.style] || 0) + toInsert.length
        log(`  Inserted ${toInsert.length} pure ${entry.style} cards`)
      }
    } else {
      log(`  No usable photos found for "${entry.query}"`)
    }
  }

  // --- Blend cards ---
  log('--- Blend cards ---')
  for (const entry of BLEND_QUERIES) {
    log(`  Searching: "${entry.query}" (${entry.styles.join('+')} blend)`)
    let photos: UnsplashPhoto[] = []

    for (let page = 1; page <= 2; page++) {
      const batch = await searchUnsplash(entry.query, page, 30)
      photos = photos.concat(batch)
      await sleep(2000)
    }

    const filtered = photos.filter(p => filterPhoto(p) && !seenUnsplashIds.has(p.id))
    const toInsert: NewQuizCard[] = []

    for (const photo of filtered.slice(0, 20)) {
      seenUnsplashIds.add(photo.id)
      toInsert.push({
        image_url: photo.urls.regular,
        style_weights: makeBlendWeights(entry.styles[0], entry.styles[1], entry.weights[0], entry.weights[1]),
        phase: 'blend',
        room_type: entry.roomType,
        discriminability_score: 0.5,
        metadata: {
          unsplash_id: photo.id,
          photographer_name: photo.user.name,
          photographer_username: photo.user.username,
          search_query: entry.query,
        },
      })
    }

    if (toInsert.length > 0) {
      const dbRows = toInsert.map(c => ({
        image_url: c.image_url,
        style_weights: c.style_weights,
        phase: c.phase,
        room_type: c.room_type,
        discriminability_score: c.discriminability_score,
        style: entry.styles[0],
        active: true,
      }))
      const { error: insertError } = await supabase
        .from('swipe_cards')
        .insert(dbRows)

      if (insertError) {
        log(`  ERROR inserting blend cards for "${entry.query}": ${insertError.message}`)
      } else {
        blendAdded += toInsert.length
        log(`  Inserted ${toInsert.length} blend cards (${entry.styles.join('+')} )`)
      }
    } else {
      log(`  No usable photos found for "${entry.query}"`)
    }
  }

  const styleBreakdown = STYLES.map(s => `${s}: ${styleCountMap[s] || 0}`).join(', ')
  log(`Added ${pureAdded} pure cards (${styleBreakdown}) + ${blendAdded} blend cards = ${pureAdded + blendAdded} total new cards`)
}

// ---------------------------------------------------------------------------
// Part C — Final count
// ---------------------------------------------------------------------------

async function reportFinalCount(): Promise<void> {
  log('=== PART C: Final count ===')

  const { count, error } = await supabase
    .from('swipe_cards')
    .select('id', { count: 'exact', head: true })

  if (error) {
    log(`ERROR counting quiz_cards: ${error.message}`)
    return
  }

  const total = count ?? 0
  log(`Total swipe cards: ${total} (target: 923)`)

  // Update SCRAPING_LOG.md quiz card count
  try {
    let logContent = fs.readFileSync(LOG_FILE, 'utf-8')
    logContent = logContent.replace(
      /## Quiz Card Count\nCurrent: [\d,]+/,
      `## Quiz Card Count\nCurrent: ${total.toLocaleString()}`
    )
    fs.writeFileSync(LOG_FILE, logContent, 'utf-8')
    log('Updated SCRAPING_LOG.md with new swipe card count')
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    log(`Warning: could not update SCRAPING_LOG.md: ${errMsg}`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log('')
  log('========================================')
  log('  expand-quiz-cards.ts — starting')
  log('========================================')

  try {
    await auditExistingCards()
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    log(`Part A failed: ${errMsg}`)
  }

  try {
    await addCardsViaUnsplash()
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    log(`Part B failed: ${errMsg}`)
  }

  try {
    await reportFinalCount()
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    log(`Part C failed: ${errMsg}`)
  }

  log('========================================')
  log('  expand-quiz-cards.ts — complete')
  log('========================================')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
