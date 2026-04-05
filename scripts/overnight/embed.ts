import * as dotenv from 'dotenv'
dotenv.config({ path: '../.env.local' })
dotenv.config({ path: '../apps/web/.env.local' })

import { createClient } from '@supabase/supabase-js'
import Replicate from 'replicate'
import Bottleneck from 'bottleneck'
import pLimit from 'p-limit'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { NormalizedProduct, RunState } from './types'
import { log, incrementStat } from './logger'
import { saveState, markEmbedded, markFailed, isAlreadyEmbedded } from './state'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

// Rate limiter: max 10 Replicate calls/sec across all concurrent ops
const bottleneck = new Bottleneck({ maxConcurrent: 8, minTime: 100 })

const PROCESSED_DIR = path.join(process.cwd(), 'data', 'processed')
const FAILED_DIR = path.join(process.cwd(), 'data', 'failed')

// CLIP model — exact hash from lib/ai/clip.ts
const CLIP_MODEL = 'andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a'

interface FailedProduct {
  product: NormalizedProduct
  error: string
  stage: 'image_download' | 'image_upload' | 'clip' | 'db_insert'
  timestamp: string
}

function ensureDirs(): void {
  for (const dir of [FAILED_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }
}

function saveFailedProduct(product: NormalizedProduct, error: string, stage: FailedProduct['stage']): void {
  const failFile = path.join(FAILED_DIR, `${product.retailer}-failed.json`)
  let existing: FailedProduct[] = []

  if (fs.existsSync(failFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(failFile, 'utf-8')) as FailedProduct[]
    } catch {
      existing = []
    }
  }

  existing.push({ product, error, stage, timestamp: new Date().toISOString() })
  fs.writeFileSync(failFile, JSON.stringify(existing, null, 2))
}

async function downloadImage(imageUrl: string): Promise<{ data: Buffer; contentType: string }> {
  const response = await axios.get<Buffer>(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    maxRedirects: 5,
  })

  const contentType = String(response.headers['content-type'] ?? 'image/jpeg')
  return { data: Buffer.from(response.data), contentType }
}

async function uploadToStorage(
  imageData: Buffer,
  contentType: string,
  retailer: string,
  productId: string
): Promise<string> {
  // Determine extension
  const ext = contentType.includes('png') ? 'png' : 'jpg'
  const storagePath = `${retailer}/${productId}.${ext}`

  const { error } = await supabase.storage
    .from('product-images')
    .upload(storagePath, imageData, {
      contentType,
      upsert: true,
    })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(storagePath)
  return urlData.publicUrl
}

async function getClipEmbedding(imageUrl: string): Promise<number[]> {
  const output = await bottleneck.schedule(() =>
    replicate.run(CLIP_MODEL, { input: { inputs: imageUrl } })
  ) as Array<{ embedding: number[] }> | { embedding: number[] }

  let embedding: number[]

  if (Array.isArray(output) && output.length > 0) {
    embedding = output[0]!.embedding
  } else if (!Array.isArray(output) && (output as { embedding: number[] }).embedding) {
    embedding = (output as { embedding: number[] }).embedding
  } else {
    throw new Error('Unexpected CLIP output format')
  }

  if (!Array.isArray(embedding) || embedding.length !== 768) {
    throw new Error(`Invalid CLIP embedding: expected 768 dims, got ${Array.isArray(embedding) ? embedding.length : 'non-array'}`)
  }

  return embedding
}

async function getPriceTier(price: number): Promise<'budget' | 'mid' | 'premium'> {
  if (price < 100) return 'budget'
  if (price < 500) return 'mid'
  return 'premium'
}

async function processProduct(product: NormalizedProduct, state: RunState): Promise<boolean> {
  if (isAlreadyEmbedded(product.id, state)) return true

  let supabaseImageUrl = product.image_url
  let uploadFailed = false

  // Step 1: Download + upload image to Supabase Storage
  try {
    let imageData: Buffer
    let contentType: string

    try {
      const result = await downloadImage(product.image_url)
      imageData = result.data
      contentType = result.contentType
    } catch {
      // Retry with different UA
      await new Promise((r) => setTimeout(r, 5000))
      try {
        const response = await axios.get<Buffer>(product.image_url, {
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
          maxRedirects: 5,
        })
        imageData = Buffer.from(response.data)
        contentType = String(response.headers['content-type'] ?? 'image/jpeg')
      } catch (retryErr) {
        throw retryErr
      }
    }

    // Validate content type
    if (!contentType.includes('image')) {
      throw new Error(`Not an image: ${contentType}`)
    }

    // Resize if >5MB using sharp
    if (imageData.length > 5 * 1024 * 1024) {
      try {
        const sharp = (await import('sharp')).default
        imageData = await sharp(imageData)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer()
        contentType = 'image/jpeg'
      } catch {
        // sharp failed — use original, it might still work for CLIP
      }
    }

    supabaseImageUrl = await uploadToStorage(imageData, contentType, product.retailer, product.id)
  } catch (uploadErr) {
    const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr)
    log('EMBED', 'WARN', `Image upload failed for ${product.name} (${product.retailer}): ${msg} — using original URL for CLIP`)
    uploadFailed = true
    // Continue with original URL for CLIP embedding
  }

  // Step 2: CLIP embedding
  let embedding: number[]
  try {
    embedding = await getClipEmbedding(supabaseImageUrl)
  } catch {
    // Retry once after 10s
    await new Promise((r) => setTimeout(r, 10000))
    try {
      embedding = await getClipEmbedding(supabaseImageUrl)
    } catch (clipErr) {
      const msg = clipErr instanceof Error ? clipErr.message : String(clipErr)
      log('EMBED', 'ERROR', `CLIP failed for ${product.name}: ${msg}`)
      saveFailedProduct(product, msg, 'clip')
      markFailed(product.product_url, state)
      incrementStat('failed')
      return false
    }
  }

  // Step 3: DB insert
  const dbRecord = {
    external_id: product.product_url.slice(0, 500),
    name: product.name,
    retailer: product.retailer,
    price: Math.round(product.price * 100), // store as cents
    currency: 'USD',
    category: product.category,
    image_url: uploadFailed ? product.image_url : supabaseImageUrl,
    affiliate_url_base: product.product_url,
    affiliate_url: product.affiliate_url !== product.product_url ? product.affiliate_url : null,
    clip_embedding: embedding,
    style_tags: product.style_tags,
    room_types: product.room_types,
    price_tier: await getPriceTier(product.price),
    in_stock: true,
    active: true,
  }

  try {
    const { error } = await supabase
      .from('products')
      .insert(dbRecord)
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        // Unique constraint — already exists, that's fine
        log('EMBED', 'INFO', `Duplicate skipped (already in DB): ${product.name}`)
        markEmbedded(product.id, state)
        return true
      }
      throw error
    }
  } catch (dbErr) {
    // Retry once after 3s
    await new Promise((r) => setTimeout(r, 3000))
    try {
      await supabase.from('products').insert(dbRecord)
    } catch (retryErr) {
      const msg = retryErr instanceof Error ? retryErr.message : String(retryErr)
      log('EMBED', 'ERROR', `DB insert failed for ${product.name}: ${msg}`)
      saveFailedProduct(product, msg, 'db_insert')
      markFailed(product.product_url, state)
      incrementStat('failed')
      return false
    }
  }

  markEmbedded(product.id, state)
  return true
}

async function processBatchFile(batchFile: string, state: RunState): Promise<void> {
  const batchKey = path.basename(batchFile)

  log('EMBED', 'INFO', `Processing batch: ${batchKey}`)

  let products: NormalizedProduct[]
  try {
    products = JSON.parse(fs.readFileSync(batchFile, 'utf-8')) as NormalizedProduct[]
  } catch (err) {
    log('EMBED', 'ERROR', `Failed to parse batch file ${batchKey}: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  if (!Array.isArray(products) || products.length === 0) {
    log('EMBED', 'WARN', `Empty or invalid batch: ${batchKey}`)
    return
  }

  log('EMBED', 'INFO', `Batch ${batchKey}: ${products.length} products to embed`)

  const limit = pLimit(8)
  let processed = 0
  let succeeded = 0

  await Promise.allSettled(
    products.map((product) =>
      limit(async () => {
        const ok = await processProduct(product, state)
        processed++
        if (ok) succeeded++

        // Progress log every 25 products
        if (processed % 25 === 0) {
          const stats = state
          log('EMBED', 'INFO', `Embedded ${processed}/${products.length} in ${batchKey} | Latest: ${product.name} (${product.retailer}) | Failed: ${stats.total_failed}`)
          incrementStat('embedded', 0) // just to trigger summary tracking
        }

        // Save state every 50 products
        if (processed % 50 === 0) {
          saveState(state)
        }
      })
    )
  )

  saveState(state)
  log('EMBED', 'SUCCESS', `Batch complete: ${succeeded}/${products.length} embedded from ${batchKey}`)
}

async function retryFailed(state: RunState): Promise<void> {
  if (!fs.existsSync(FAILED_DIR)) return

  const failFiles = fs.readdirSync(FAILED_DIR).filter((f) => f.endsWith('.json'))
  if (failFiles.length === 0) return

  log('EMBED', 'INFO', `Retrying failed products from ${failFiles.length} files`)

  for (const failFile of failFiles) {
    const filePath = path.join(FAILED_DIR, failFile)
    let entries: FailedProduct[] = []

    try {
      entries = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as FailedProduct[]
    } catch {
      continue
    }

    const limit = pLimit(4)
    let retried = 0
    let succeeded = 0

    await Promise.allSettled(
      entries.map((entry) =>
        limit(async () => {
          const ok = await processProduct(entry.product, state)
          retried++
          if (ok) succeeded++
        })
      )
    )

    log('EMBED', 'INFO', `Retry pass for ${failFile}: ${succeeded}/${retried} succeeded`)
  }
}

export async function runEmbedding(state: RunState): Promise<void> {
  ensureDirs()
  log('EMBED', 'INFO', 'Embedding job starting — watching data/processed/ for batches')

  const processedFiles = new Set<string>()

  // Process any existing files first
  async function processNewFiles(): Promise<void> {
    if (!fs.existsSync(PROCESSED_DIR)) return

    const files = fs.readdirSync(PROCESSED_DIR).filter((f) => f.endsWith('.json'))
    for (const file of files) {
      if (!processedFiles.has(file)) {
        processedFiles.add(file)
        await processBatchFile(path.join(PROCESSED_DIR, file), state)
      }
    }
  }

  // Poll every 30s for new files
  let running = true

  const poll = async (): Promise<void> => {
    while (running) {
      await processNewFiles()
      await new Promise((r) => setTimeout(r, 30000))
    }
  }

  // Also use fs.watch for immediate notification
  let watcher: fs.FSWatcher | null = null
  if (fs.existsSync(PROCESSED_DIR)) {
    try {
      watcher = fs.watch(PROCESSED_DIR, async (_event, filename) => {
        if (filename?.endsWith('.json') && !processedFiles.has(filename)) {
          // Small delay to ensure file is fully written
          await new Promise((r) => setTimeout(r, 2000))
          await processNewFiles()
        }
      })
    } catch {
      // fs.watch unavailable on some systems — polling fallback is active
    }
  }

  // Wait for scraping job signal — poll for ~4 hours max then finalize
  await poll()

  if (watcher) {
    try { watcher.close() } catch { /* ignore */ }
  }

  // Final retry pass
  await retryFailed(state)

  log('EMBED', 'SUCCESS', 'Embedding job complete')

  // Signal done
  running = false
}

// Export a version that runs for a fixed duration then stops
export async function runEmbeddingWithTimeout(state: RunState, durationMs: number): Promise<void> {
  ensureDirs()
  log('EMBED', 'INFO', 'Embedding job starting')

  const processedFiles = new Set<string>()

  async function processNewFiles(): Promise<void> {
    if (!fs.existsSync(PROCESSED_DIR)) return

    const files = fs.readdirSync(PROCESSED_DIR).filter((f) => f.endsWith('.json'))
    for (const file of files) {
      if (!processedFiles.has(file)) {
        processedFiles.add(file)
        await processBatchFile(path.join(PROCESSED_DIR, file), state)
      }
    }
  }

  const deadline = Date.now() + durationMs

  while (Date.now() < deadline) {
    await processNewFiles()
    await new Promise((r) => setTimeout(r, 30000))
  }

  // Final retry pass
  await retryFailed(state)
  log('EMBED', 'SUCCESS', 'Embedding job complete')
}
