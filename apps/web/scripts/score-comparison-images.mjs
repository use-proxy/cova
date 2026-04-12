/**
 * score-comparison-images.mjs
 *
 * Scores all comparison images in Supabase storage (quiz-images/comparisons/)
 * using Claude Vision (claude-haiku-4-5-20251001) on all 12 style dimensions,
 * then updates quiz_comparison_pairs with real vision-derived vectors.
 *
 * Run:
 *   cd apps/web && node --env-file=.env.local scripts/score-comparison-images.mjs
 *
 * Resumable: progress is saved to scripts/vision-scores-progress.json after each batch.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Constants ─────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

if (!BASE || !ANON || !SERVICE || !ANTHROPIC_KEY) {
  console.error('Missing required env vars. Need: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY')
  process.exit(1)
}

const DIMENSIONS = [
  'colorSaturation', 'colorTemperature', 'culturalInfluence',
  'density', 'era', 'formality', 'lightPreference', 'lineQuality',
  'material', 'nature', 'pattern', 'texture',
]
const LEVELS = ['high', 'low']
const ROOM_TYPES = ['bathroom', 'bedroom', 'dining-room', 'home-office', 'kitchen', 'living-room']
const VARIANTS = ['r1', 'r2', 'r3', 'r4', 'r5']
// Rate limits: 50 req/min, 50K tokens/min (~1800 tokens/image → ~27 images/min)
// Safe target: 20 req/min → 1 image every 3s → batch of 5 every 15s
const BATCH_SIZE = 5
const BATCH_DELAY_MS = 15000
const MAX_RETRIES = 4

const PROGRESS_FILE = resolve(__dirname, 'vision-scores-progress.json')
const RESULTS_FILE  = resolve(__dirname, 'vision-scores.json')
const SUMMARY_FILE  = resolve(__dirname, 'vision-scores-summary.json')

// ─── Clients ────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })
const supabase  = createClient(BASE, SERVICE)

// ─── System prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an interior design dimension scorer.
Score this room image on exactly 12 dimensions, each from 0.0 to 1.0.

Respond with ONLY a JSON object, no other text:
{
  "colorTemperature": 0,
  "colorSaturation": 0,
  "density": 0,
  "formality": 0,
  "era": 0,
  "material": 0,
  "texture": 0,
  "pattern": 0,
  "lineQuality": 0,
  "lightPreference": 0,
  "nature": 0,
  "culturalInfluence": 0
}

Dimension guide:
  colorTemperature:   warm amber tones (1.0) vs cool grey/blue tones (0.0)
  colorSaturation:    bold saturated colors (1.0) vs muted neutrals (0.0)
  density:            densely layered/cluttered (1.0) vs spare minimal (0.0)
  formality:          formal elegant (1.0) vs casual relaxed (0.0)
  era:                traditional heritage (1.0) vs ultra-modern (0.0)
  material:           natural organic (wood/stone/linen) (1.0) vs manufactured synthetic (0.0)
  texture:            tactile rough rich surfaces (1.0) vs sleek smooth surfaces (0.0)
  pattern:            pattern-rich surfaces (1.0) vs pattern-free surfaces (0.0)
  lineQuality:        organic curved forms (1.0) vs geometric angular forms (0.0)
  lightPreference:    bright airy sun-filled (1.0) vs dark moody dim (0.0)
  nature:             plants/biophilic elements abundant (1.0) vs urban no plants (0.0)
  culturalInfluence:  global eclectic multicultural (1.0) vs minimal western (0.0)`

// ─── Score one image (with retry + backoff) ──────────────────────────────────

async function scoreImage(imageUrl, attempt = 0) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { type: 'text', text: 'Score this room on all 12 dimensions as specified.' },
        ],
      }],
    })

    const text = response.content[0].text.trim()
    // Strip any markdown code fences if model adds them
    const cleaned = text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    return JSON.parse(cleaned)
  } catch (err) {
    const is429 = err?.status === 429 || String(err?.message).includes('429') || String(err?.message).includes('rate_limit')
    if (is429 && attempt < MAX_RETRIES) {
      // Exponential backoff: 30s, 60s, 120s, 240s
      const waitMs = 30000 * Math.pow(2, attempt)
      console.log(`\n  Rate limited — waiting ${waitMs / 1000}s before retry ${attempt + 1}/${MAX_RETRIES}...`)
      await sleep(waitMs)
      return scoreImage(imageUrl, attempt + 1)
    }
    throw err
  }
}

// ─── List images from storage ─────────────────────────────────────────────────

async function listDimensionImages(dimension) {
  const response = await fetch(`${BASE}/storage/v1/object/list/quiz-images`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON}`,
      'apikey': ANON,
    },
    body: JSON.stringify({ prefix: `comparisons/${dimension}/`, limit: 200 }),
  })

  if (!response.ok) {
    console.warn(`  Storage list failed for ${dimension}: ${response.status}`)
    return []
  }

  const files = await response.json()
  if (!Array.isArray(files)) return []
  return files.map(f => f.name).filter(Boolean)
}

// ─── Build expected image key ────────────────────────────────────────────────

function imageKey(dimension, level, room, variant) {
  return `${dimension}-${level}-${room}-${variant}`
}

function imageUrl(dimension, filename) {
  return `${BASE}/storage/v1/object/public/quiz-images/comparisons/${dimension}/${filename}`
}

// ─── Average vectors ─────────────────────────────────────────────────────────

function avgVectors(vectors) {
  if (vectors.length === 0) return null
  const result = {}
  for (const dim of DIMENSIONS) {
    const vals = vectors.map(v => v[dim]).filter(x => typeof x === 'number' && !isNaN(x))
    result[dim] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0.5
  }
  return result
}

function maxAbsDiff(v1, v2) {
  let max = 0
  for (const dim of DIMENSIONS) {
    const diff = Math.abs((v1[dim] ?? 0.5) - (v2[dim] ?? 0.5))
    if (diff > max) max = diff
  }
  return max
}

// ─── Sleep helper ────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== score-comparison-images.mjs ===\n')

  // Load existing progress
  let progress = {}
  if (existsSync(PROGRESS_FILE)) {
    try {
      progress = JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'))
      console.log(`Resuming from progress file — ${Object.keys(progress).length} images already scored\n`)
    } catch (e) {
      console.warn('Could not read progress file, starting fresh\n')
    }
  }

  // ── Step 1: discover all images ────────────────────────────────────────────
  console.log('Step 1: Discovering images in storage...')

  const allImages = [] // { key, url, dimension, level, room, variant }
  let totalExpected = 0

  for (const dim of DIMENSIONS) {
    const files = await listDimensionImages(dim)
    console.log(`  ${dim}: found ${files.length} files`)

    for (const filename of files) {
      // Expected format: {dimension}-{level}-{room}-r{N}.webp
      const base = filename.replace(/\.webp$/i, '')
      // Split off variant suffix r1..r5
      const variantMatch = base.match(/-r(\d+)$/)
      if (!variantMatch) continue
      const variant = `r${variantMatch[1]}`
      const withoutVariant = base.slice(0, base.length - variant.length - 1) // remove -r{N}
      // withoutVariant = {dimension}-{level}-{room}
      // Find which level
      let level = null, room = null
      for (const lv of LEVELS) {
        const prefix = `${dim}-${lv}-`
        if (withoutVariant.startsWith(prefix)) {
          level = lv
          room = withoutVariant.slice(prefix.length)
          break
        }
      }
      if (!level || !room) continue

      const key = imageKey(dim, level, room, variant)
      allImages.push({ key, url: imageUrl(dim, filename), dimension: dim, level, room, variant })
      totalExpected++
    }
  }

  console.log(`\nTotal images discovered: ${allImages.length} (expected ~720)\n`)

  // ── Step 2: score images with Claude Vision ────────────────────────────────
  console.log('Step 2: Scoring images with Claude Vision (claude-haiku-4-5-20251001)...')
  console.log(`  Batch size: ${BATCH_SIZE}, delay between batches: ${BATCH_DELAY_MS}ms\n`)

  const toScore = allImages.filter(img => !progress[img.key])
  console.log(`  ${allImages.length - toScore.length} already scored, ${toScore.length} remaining\n`)

  let scored = 0
  let failed = 0
  const failures = []

  for (let i = 0; i < toScore.length; i += BATCH_SIZE) {
    const batch = toScore.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(img => scoreImage(img.url).then(scores => ({ img, scores })))
    )

    for (let ri = 0; ri < results.length; ri++) {
      const result = results[ri]
      if (result.status === 'fulfilled') {
        const { img, scores } = result.value
        progress[img.key] = scores
        scored++
      } else {
        const failedImg = batch[ri]
        failures.push({ key: failedImg?.key ?? 'unknown', error: result.reason?.message ?? String(result.reason) })
        failed++
        console.warn(`\n  FAIL [${failedImg?.key ?? 'unknown'}]: ${result.reason?.message ?? result.reason}`)
      }
    }

    // Save progress after every batch
    writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))

    const total = allImages.length - toScore.length + i + batch.length
    const pct = Math.round((total / allImages.length) * 100)
    process.stdout.write(`\r  Progress: ${total}/${allImages.length} (${pct}%) — scored: ${scored}, failed: ${failed}   `)

    if (i + BATCH_SIZE < toScore.length) {
      await sleep(BATCH_DELAY_MS)
    }
  }

  console.log('\n')

  // Merge all into final scores
  const allScores = { ...progress }

  // ── Step 3: average per dimension/level/room, then per dimension/level ─────
  console.log('Step 3: Computing averages...')

  // Per dimension/level/room
  const byDimLevelRoom = {}
  for (const img of allImages) {
    const scores = allScores[img.key]
    if (!scores) continue
    const k = `${img.dimension}/${img.level}/${img.room}`
    if (!byDimLevelRoom[k]) byDimLevelRoom[k] = []
    byDimLevelRoom[k].push(scores)
  }

  const avgByDimLevelRoom = {}
  for (const [k, vecs] of Object.entries(byDimLevelRoom)) {
    avgByDimLevelRoom[k] = avgVectors(vecs)
  }

  // Per dimension/level (across rooms) — and check if room-specific needed
  const vectorsByDimLevel = {}
  const summary = {}

  for (const dim of DIMENSIONS) {
    summary[dim] = {}
    for (const level of LEVELS) {
      const roomVecs = ROOM_TYPES.map(room => avgByDimLevelRoom[`${dim}/${level}/${room}`]).filter(Boolean)
      if (roomVecs.length === 0) {
        console.warn(`  No data for ${dim}/${level}`)
        continue
      }

      // Check max diff across room types
      const globalAvg = avgVectors(roomVecs)
      let maxDiff = 0
      const roomMaxDiffs = {}
      for (const room of ROOM_TYPES) {
        const rv = avgByDimLevelRoom[`${dim}/${level}/${room}`]
        if (!rv) continue
        const diff = maxAbsDiff(globalAvg, rv)
        roomMaxDiffs[room] = diff
        if (diff > maxDiff) maxDiff = diff
      }

      if (maxDiff > 0.15) {
        console.log(`  ${dim}/${level}: room-specific vectors differ (max diff=${maxDiff.toFixed(3)}) — keeping room-specific`)
        vectorsByDimLevel[`${dim}/${level}`] = { roomSpecific: true, byRoom: {} }
        for (const room of ROOM_TYPES) {
          const rv = avgByDimLevelRoom[`${dim}/${level}/${room}`]
          vectorsByDimLevel[`${dim}/${level}`].byRoom[room] = rv ?? globalAvg
        }
        vectorsByDimLevel[`${dim}/${level}`].global = globalAvg
      } else {
        vectorsByDimLevel[`${dim}/${level}`] = { roomSpecific: false, global: globalAvg }
      }

      summary[dim][`${level}_avg`] = globalAvg
    }

    // Separation
    const hiAvg = summary[dim]['high_avg']
    const loAvg = summary[dim]['low_avg']
    if (hiAvg && loAvg) {
      summary[dim]['high_low_separation'] = Math.abs((hiAvg[dim] ?? 0.5) - (loAvg[dim] ?? 0.5))
    }
  }

  // ── Step 4: update DB ──────────────────────────────────────────────────────
  console.log('\nStep 4: Updating quiz_comparison_pairs in DB...')

  // Detect convention: is image_a LOW or HIGH?
  const { data: sample } = await supabase
    .from('quiz_comparison_pairs')
    .select('id, dimension, image_a_vector, image_b_vector')
    .limit(1)

  let aIsLow = true
  if (sample && sample.length > 0) {
    const s = sample[0]
    const dim = s.dimension
    const aVal = s.image_a_vector?.[dim]
    const bVal = s.image_b_vector?.[dim]
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      aIsLow = aVal < bVal
    }
  }
  console.log(`  Convention: image_a = ${aIsLow ? 'LOW' : 'HIGH'}`)

  const { data: pairs, error: pairsErr } = await supabase
    .from('quiz_comparison_pairs')
    .select('id, dimension')

  if (pairsErr) {
    console.error('Failed to fetch pairs:', pairsErr.message)
    process.exit(1)
  }

  console.log(`  Updating ${pairs.length} pairs...`)

  let updated = 0, skipped = 0
  for (const pair of pairs) {
    const dim = pair.dimension

    const hiKey = `${dim}/high`
    const loKey = `${dim}/low`

    const hiEntry = vectorsByDimLevel[hiKey]
    const loEntry = vectorsByDimLevel[loKey]

    if (!hiEntry || !loEntry) {
      console.warn(`  Skipping ${pair.id} (${dim}) — no vector data`)
      skipped++
      continue
    }

    // Use global average (room_type column does not exist on quiz_comparison_pairs)
    const hiVec = hiEntry.global
    const loVec = loEntry.global

    const image_a_vector = aIsLow ? loVec : hiVec
    const image_b_vector = aIsLow ? hiVec : loVec

    const { error } = await supabase
      .from('quiz_comparison_pairs')
      .update({ image_a_vector, image_b_vector })
      .eq('id', pair.id)

    if (error) {
      console.error(`  Failed pair ${pair.id}: ${error.message}`)
    } else {
      updated++
    }
  }

  console.log(`  Done. Updated: ${updated}, Skipped: ${skipped}`)

  // Verify 5 pairs
  console.log('\n  Verification (5 pairs):')
  const { data: verify } = await supabase
    .from('quiz_comparison_pairs')
    .select('id, dimension, image_a_vector, image_b_vector')
    .limit(5)

  for (const r of (verify ?? [])) {
    const dim = r.dimension
    const aVal = r.image_a_vector?.[dim]
    const bVal = r.image_b_vector?.[dim]
    const secondaryKeys = DIMENSIONS.filter(k => k !== dim)
    const allHalf = secondaryKeys.every(k => r.image_a_vector?.[k] === 0.5)
    console.log(`  [${r.id.slice(0, 8)}] ${dim}: a[${dim}]=${aVal?.toFixed(3)}, b[${dim}]=${bVal?.toFixed(3)} | secondary all 0.5? ${allHalf} (should be false)`)
  }

  // ── Step 5: save files ──────────────────────────────────────────────────────
  console.log('\nStep 5: Saving results...')

  writeFileSync(RESULTS_FILE, JSON.stringify(allScores, null, 2))
  console.log(`  Wrote ${RESULTS_FILE}`)

  writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2))
  console.log(`  Wrote ${SUMMARY_FILE}`)

  // ── Final report ────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════')
  console.log('REPORT')
  console.log('══════════════════════════════════════════')
  console.log(`Total images discovered: ${allImages.length}`)
  console.log(`Total images scored:     ${Object.keys(allScores).length}`)
  console.log(`Newly scored this run:   ${scored}`)
  console.log(`Failed this run:         ${failed}`)

  if (failures.length > 0) {
    console.log('\nFailed images:')
    for (const f of failures) console.log(`  ${f.key}: ${f.error}`)
  }

  console.log('\nDimension separation (high_avg - low_avg on primary dim):')
  console.log('  Dim'.padEnd(25) + 'Separation  Status')
  console.log('  ' + '─'.repeat(45))
  for (const dim of DIMENSIONS) {
    const sep = summary[dim]?.high_low_separation
    if (sep == null) {
      console.log(`  ${dim.padEnd(23)} N/A`)
      continue
    }
    const status = sep >= 0.4 ? '✓ GOOD' : sep >= 0.3 ? '⚠ MARGINAL' : '✗ WEAK'
    console.log(`  ${dim.padEnd(23)} ${sep.toFixed(3)}       ${status}`)
  }

  const weakDims = DIMENSIONS.filter(d => {
    const sep = summary[d]?.high_low_separation
    return sep != null && sep < 0.3
  })
  if (weakDims.length > 0) {
    console.log(`\n⚠ Weakly differentiated dimensions (separation < 0.3): ${weakDims.join(', ')}`)
    console.log('  These image sets may not discriminate well in the quiz algorithm.')
  }

  console.log('\nDB update: updated=' + updated + ', skipped=' + skipped)
  console.log('\nDone.')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
