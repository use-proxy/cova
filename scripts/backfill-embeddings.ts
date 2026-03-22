import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { embedBatch } from './seed-products/processors/embed.js'

config({ path: path.join(path.dirname(process.argv[1]!), '..', '.env.local') })

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BATCH_SIZE = 15
const SCRIPTS_DIR = path.dirname(process.argv[1]!)
const PROGRESS_FILE = path.join(SCRIPTS_DIR, 'backfill-progress.json')

// ── Progress / Resume ─────────────────────────────────────────────────────────

interface ProgressFile {
  processedIds: string[]
}

function loadProgress(): Set<string> {
  if (fs.existsSync(PROGRESS_FILE)) {
    const raw = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')) as ProgressFile
    console.log(`Resuming: ${raw.processedIds.length} products already embedded`)
    return new Set(raw.processedIds)
  }
  return new Set()
}

function saveProgress(done: Set<string>): void {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ processedIds: [...done] }, null, 2))
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Load progress
  const done = loadProgress()

  // Fetch all products missing embeddings (paginate to bypass 1000-row default cap)
  const PAGE = 1000
  const products: { id: string; image_url: string | null; name: string }[] = []
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .from('products')
      .select('id, image_url, name')
      .is('clip_embedding', null)
      .order('id')
      .range(from, from + PAGE - 1)

    if (error) {
      console.error('Failed to fetch products:', error.message)
      process.exit(1)
    }
    products.push(...page)
    if (page.length < PAGE) break
  }
  console.log(`Total products missing embeddings: ${products.length}`)

  // Skip already-processed and those with no image URL
  // image_url may be a comma-separated gallery — extract the first clean URL
  const pending = products
    .filter((p) => !done.has(p.id) && p.image_url !== null)
    .map((p) => ({
      ...p,
      image_url: p.image_url!.split(',').map((u) => u.trim()).find((u) => u.startsWith('http')) ?? null,
    }))
    .filter((p) => p.image_url !== null)
  const skippedNoUrl = products.filter((p) => !done.has(p.id) && !p.image_url?.split(',').some((u) => u.trim().startsWith('http'))).length
  const total = pending.length

  console.log(`Products to embed: ${total}`)
  if (skippedNoUrl > 0) console.log(`Skipped (no image_url): ${skippedNoUrl}`)
  console.log()

  if (total === 0) {
    console.log('Nothing to do.')
    printVerificationSQL()
    return
  }

  let successCount = 0
  let failCount = 0
  let batchNum = 0

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE)
    batchNum++

    const urls = batch.map((p) => p.image_url as string)

    let embeddings: number[][]
    try {
      embeddings = await embedBatch(urls)
    } catch (err) {
      console.error(
        `Batch ${batchNum} embed failed: ${err instanceof Error ? err.message : err}`,
      )
      failCount += batch.length
      // Save progress before continuing so we don't lose work already done
      saveProgress(done)
      continue
    }

    // Update each product in DB
    // VECTOR(768) columns require the embedding as a bracketed string "[x,y,...]"
    // so PostgREST can cast it correctly — passing a raw JS array fails silently.
    const updateResults = await Promise.all(
      batch.map((product, j) =>
        supabase
          .from('products')
          .update({ clip_embedding: `[${embeddings[j].join(',')}]` })
          .eq('id', product.id),
      ),
    )

    for (let j = 0; j < batch.length; j++) {
      const { error } = updateResults[j]
      if (error) {
        console.error(
          `Update failed id=${batch[j].id}:`,
          JSON.stringify({ message: error.message, code: error.code, details: error.details, hint: error.hint }),
        )
        failCount++
      } else {
        done.add(batch[j].id)
        successCount++
      }
    }

    // Save progress after every batch
    saveProgress(done)

    const totalBatches = Math.ceil(total / BATCH_SIZE)
    console.log(
      `Batch ${batchNum}/${totalBatches}: ${batch.length} embeddings done, total: ${successCount}/${total} (${failCount} failed)`,
    )
  }

  console.log(`\nDone. ${successCount}/${total} embeddings written successfully.`)
  if (failCount > 0) {
    console.log(`${failCount} failures logged above. Re-run to retry failed products.`)
  }

  printVerificationSQL()
}

// ── Verification SQL ──────────────────────────────────────────────────────────

function printVerificationSQL(): void {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION SQL — run in Supabase Dashboard > SQL Editor
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. Total active products
SELECT COUNT(*) AS total FROM products WHERE active = true;

-- 2. Count by retailer
SELECT retailer, COUNT(*) AS count
FROM products WHERE active = true
GROUP BY retailer ORDER BY count DESC;

-- 3. Count by category
SELECT category, COUNT(*) AS count
FROM products WHERE active = true
GROUP BY category ORDER BY count DESC;

-- 4. Price tier distribution with avg/min/max price
SELECT
  price_tier,
  COUNT(*) AS count,
  ROUND(AVG(price), 2) AS avg_price,
  MIN(price) AS min_price,
  MAX(price) AS max_price
FROM products WHERE active = true
GROUP BY price_tier ORDER BY count DESC;

-- 5. Style tag distribution (unnested)
SELECT tag, COUNT(*) AS count
FROM products, unnest(style_tags) AS tag
WHERE active = true
GROUP BY tag ORDER BY count DESC;

-- 6. Room type distribution (unnested)
SELECT room, COUNT(*) AS count
FROM products, unnest(room_types) AS room
WHERE active = true
GROUP BY room ORDER BY count DESC;

-- 7. Embedding coverage
SELECT
  COUNT(*) FILTER (WHERE clip_embedding IS NOT NULL) AS with_embedding,
  COUNT(*) FILTER (WHERE clip_embedding IS NULL)     AS missing_embedding,
  COUNT(*) AS total
FROM products WHERE active = true;

-- 8. Price tier by retailer (coverage matrix)
SELECT retailer, price_tier, COUNT(*) AS count
FROM products WHERE active = true
GROUP BY retailer, price_tier
ORDER BY retailer, price_tier;

-- 9. Budget coverage check (critical for user renders)
SELECT
  price_tier,
  COUNT(*) AS count,
  CASE
    WHEN price_tier = 'budget'  AND COUNT(*) >= 1000 THEN '✓ OK'
    WHEN price_tier = 'mid'     AND COUNT(*) >= 2000 THEN '✓ OK'
    WHEN price_tier = 'premium' AND COUNT(*) >= 1500 THEN '✓ OK'
    WHEN price_tier = 'luxury'  AND COUNT(*) >= 500  THEN '✓ OK'
    ELSE '✗ BELOW TARGET'
  END AS status
FROM products WHERE active = true
GROUP BY price_tier;

-- 10. Spot-check 5 random products with embeddings
SELECT
  name, retailer, price, price_tier, category,
  style_tags, room_types,
  LEFT(image_url, 70)     AS image_preview,
  LEFT(affiliate_url, 70) AS url_preview,
  array_length(clip_embedding::text::text[], 1) AS embed_dim
FROM products
WHERE active = true AND clip_embedding IS NOT NULL
ORDER BY RANDOM() LIMIT 5;
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
}

main()
