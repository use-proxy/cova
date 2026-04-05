import { createClient } from '@supabase/supabase-js'
import Replicate from 'replicate'
import Bottleneck from 'bottleneck'
import pLimit from 'p-limit'
import * as fs from 'fs'
import * as path from 'path'
import { log } from './logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
const bottleneck = new Bottleneck({ maxConcurrent: 5, minTime: 200 })

const CLIP_MODEL = 'andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a'
const STORAGE_EMBED_FILE = path.join(process.cwd(), 'data', 'processed', 'storage-embeddings.json')

type StorageEmbedRecord = {
  bucket: string
  path: string
  publicUrl: string
  embedding: number[]
  created_at: string
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

function isImageFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase()
  return IMAGE_EXTENSIONS.has(ext)
}

async function getClipEmbedding(imageUrl: string): Promise<number[]> {
  const output = await bottleneck.schedule(() =>
    replicate.run(CLIP_MODEL, { input: { inputs: imageUrl } })
  ) as Array<{ embedding: number[] }> | { embedding: number[] }

  if (Array.isArray(output) && output.length > 0) {
    return output[0]!.embedding
  }
  if (!Array.isArray(output) && (output as { embedding: number[] }).embedding) {
    return (output as { embedding: number[] }).embedding
  }
  throw new Error('Unexpected CLIP output format')
}

async function listAllStorageImages(): Promise<Array<{ bucket: string; filePath: string; publicUrl: string }>> {
  const images: Array<{ bucket: string; filePath: string; publicUrl: string }> = []

  try {
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
    if (bucketsError) {
      log('STORAGE-EMBED', 'WARN', `Failed to list buckets: ${bucketsError.message}`)
      return images
    }

    for (const bucket of buckets ?? []) {
      // Skip product-images bucket — those are handled by embed.ts
      if (bucket.name === 'product-images') continue

      const { data: files, error: filesError } = await supabase.storage.from(bucket.name).list('', {
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' },
      })

      if (filesError) {
        log('STORAGE-EMBED', 'WARN', `Failed to list files in ${bucket.name}: ${filesError.message}`)
        continue
      }

      for (const file of files ?? []) {
        if (!file.name || !isImageFile(file.name)) continue

        const { data: urlData } = supabase.storage.from(bucket.name).getPublicUrl(file.name)
        if (urlData.publicUrl) {
          images.push({
            bucket: bucket.name,
            filePath: file.name,
            publicUrl: urlData.publicUrl,
          })
        }
      }

      log('STORAGE-EMBED', 'INFO', `Bucket ${bucket.name}: found ${files?.length ?? 0} files`)
    }
  } catch (err) {
    log('STORAGE-EMBED', 'WARN', `Storage listing failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  return images
}

export async function runStorageEmbed(): Promise<void> {
  log('STORAGE-EMBED', 'INFO', 'Starting: embedding existing Supabase Storage images')

  // Wait 30 minutes to give Job B (embed.ts) time to process the first 500 products
  log('STORAGE-EMBED', 'INFO', 'Waiting 30 minutes before starting (lower priority than product embedding)')
  await new Promise((r) => setTimeout(r, 30 * 60 * 1000))

  const images = await listAllStorageImages()
  log('STORAGE-EMBED', 'INFO', `Found ${images.length} images across all storage buckets (excluding product-images)`)

  if (images.length === 0) {
    log('STORAGE-EMBED', 'INFO', 'No images to embed — done')
    return
  }

  const existingEmbeds: StorageEmbedRecord[] = []
  const existingUrls = new Set<string>()

  // Load existing embeddings if any
  if (fs.existsSync(STORAGE_EMBED_FILE)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(STORAGE_EMBED_FILE, 'utf-8')) as StorageEmbedRecord[]
      existingEmbeds.push(...loaded)
      for (const r of loaded) existingUrls.add(r.publicUrl)
      log('STORAGE-EMBED', 'INFO', `Loaded ${existingEmbeds.length} existing storage embeddings`)
    } catch {
      // ignore
    }
  }

  const toProcess = images.filter((img) => !existingUrls.has(img.publicUrl))
  log('STORAGE-EMBED', 'INFO', `${toProcess.length} images need embedding`)

  if (toProcess.length === 0) {
    log('STORAGE-EMBED', 'INFO', 'All images already embedded — done')
    return
  }

  const limit = pLimit(5)
  const results: StorageEmbedRecord[] = [...existingEmbeds]
  let processed = 0

  await Promise.allSettled(
    toProcess.map((img) =>
      limit(async () => {
        try {
          const embedding = await getClipEmbedding(img.publicUrl)

          const record: StorageEmbedRecord = {
            bucket: img.bucket,
            path: img.filePath,
            publicUrl: img.publicUrl,
            embedding,
            created_at: new Date().toISOString(),
          }

          results.push(record)
          processed++

          // Save every 20 embeddings
          if (processed % 20 === 0) {
            fs.writeFileSync(STORAGE_EMBED_FILE, JSON.stringify(results, null, 2))
            log('STORAGE-EMBED', 'INFO', `Progress: ${processed}/${toProcess.length} storage images embedded`)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          log('STORAGE-EMBED', 'WARN', `Failed to embed ${img.publicUrl}: ${msg}`)
        }
      })
    )
  )

  // Final save
  fs.writeFileSync(STORAGE_EMBED_FILE, JSON.stringify(results, null, 2))
  log('STORAGE-EMBED', 'SUCCESS', `Complete: ${processed} storage images embedded → ${STORAGE_EMBED_FILE}`)
}
