/**
 * Marble API client for Cova M7 pipeline.
 * Handles video upload, world generation, and asset retrieval.
 */

const MARBLE_BASE_URL = 'https://api.worldlabs.ai/marble/v1'

export interface MarbleWorld {
  world_id: string
  pano_url: string | null
  spz_urls: {
    '100k': string
    '500k': string
    full_res: string
  }
  thumbnail_url: string | null
  marble_url: string
  caption: string | null
}

export interface MarbleGenerateOptions {
  model: 'Marble 0.1-mini' | 'Marble 0.1-plus'
  displayName?: string
  seed?: number
}

export async function uploadMediaAsset(
  fileBytes: ArrayBuffer,
  fileName: string,
  kind: 'video' | 'image',
  extension: string,
  apiKey: string
): Promise<string> {
  const prepareResp = await fetch(`${MARBLE_BASE_URL}/media-assets:prepare_upload`, {
    method: 'POST',
    headers: {
      'WLT-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file_name: fileName, kind, extension }),
  })

  if (!prepareResp.ok) {
    const error = await prepareResp.text()
    throw new Error(`Marble prepare_upload failed: ${prepareResp.status} ${error}`)
  }

  const prepareData = await prepareResp.json()
  const mediaAssetId = prepareData.media_asset.media_asset_id
  const uploadUrl = prepareData.upload_info.upload_url
  const sizeLimit = prepareData.upload_info.required_headers['x-goog-content-length-range']

  // CRITICAL: Only send x-goog-content-length-range header.
  // Adding Content-Type or other headers breaks the GCS signature.
  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'x-goog-content-length-range': sizeLimit },
    body: fileBytes,
  })

  if (!uploadResp.ok) {
    const error = await uploadResp.text()
    throw new Error(`GCS upload failed: ${uploadResp.status} ${error}`)
  }

  return mediaAssetId
}

export async function generateWorld(
  mediaAssetId: string,
  kind: 'video' | 'image' | 'pano',
  options: MarbleGenerateOptions,
  apiKey: string
): Promise<string> {
  const worldPrompt =
    kind === 'video'
      ? {
          type: 'video',
          video_prompt: { source: 'media_asset', media_asset_id: mediaAssetId },
        }
      : kind === 'pano'
        ? {
            type: 'image',
            image_prompt: { source: 'media_asset', media_asset_id: mediaAssetId, is_pano: true },
          }
        : {
            type: 'image',
            image_prompt: { source: 'media_asset', media_asset_id: mediaAssetId },
          }

  const body: Record<string, unknown> = {
    model: options.model,
    display_name: options.displayName ?? 'Cova Room',
    world_prompt: worldPrompt,
    permission: { public: false },
  }

  if (options.seed !== undefined) {
    body.seed = options.seed
  }

  const resp = await fetch(`${MARBLE_BASE_URL}/worlds:generate`, {
    method: 'POST',
    headers: {
      'WLT-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const error = await resp.text()
    throw new Error(`Marble generate failed: ${resp.status} ${error}`)
  }

  const data = await resp.json()
  return data.operation_id
}

export async function pollOperation(
  operationId: string,
  apiKey: string,
  maxWaitMs: number = 600000,
  pollIntervalMs: number = 10000
): Promise<string> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    const resp = await fetch(`${MARBLE_BASE_URL}/operations/${operationId}`, {
      headers: { 'WLT-Api-Key': apiKey },
    })

    if (!resp.ok) {
      throw new Error(`Poll failed: ${resp.status}`)
    }

    const result = await resp.json()

    if (result.done) {
      if (result.error) {
        throw new Error(
          `Marble generation failed: ${JSON.stringify(result.error)} | ${result.metadata?.progress?.description ?? ''}`
        )
      }
      const worldId = result.metadata?.world_id ?? result.response?.world_id
      if (!worldId) {
        throw new Error('Operation complete but no world_id returned')
      }
      return worldId
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(`Marble operation timed out after ${maxWaitMs / 1000}s`)
}

export async function fetchWorld(
  worldId: string,
  apiKey: string,
  retries: number = 5,
  retryDelayMs: number = 5000
): Promise<MarbleWorld> {
  let lastError: Error | null = null

  for (let i = 0; i < retries; i++) {
    const resp = await fetch(`${MARBLE_BASE_URL}/worlds/${worldId}`, {
      headers: { 'WLT-Api-Key': apiKey },
    })

    if (!resp.ok) {
      lastError = new Error(`Fetch world failed: ${resp.status}`)
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      continue
    }

    const data = await resp.json()
    const panoUrl = data.assets?.imagery?.pano_url ?? null
    const spzUrls = data.assets?.splats?.spz_urls ?? {}

    if (!panoUrl && i < retries - 1) {
      console.log(`[marble] pano_url null, retrying in ${retryDelayMs}ms...`)
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      continue
    }

    return {
      world_id: worldId,
      pano_url: panoUrl,
      spz_urls: {
        '100k': spzUrls['100k'] ?? '',
        '500k': spzUrls['500k'] ?? '',
        full_res: spzUrls['full_res'] ?? '',
      },
      thumbnail_url: data.assets?.thumbnail_url ?? null,
      marble_url: `https://marble.worldlabs.ai/world/${worldId}`,
      caption: data.assets?.caption ?? null,
    }
  }

  throw lastError ?? new Error('Failed to fetch world after retries')
}

export async function processVideoToWorld(
  videoBytes: ArrayBuffer,
  apiKey: string,
  model: 'Marble 0.1-mini' | 'Marble 0.1-plus' = 'Marble 0.1-mini'
): Promise<MarbleWorld> {
  console.log(`[marble] Uploading ${(videoBytes.byteLength / 1e6).toFixed(1)}MB video...`)
  const mediaAssetId = await uploadMediaAsset(videoBytes, 'room.mp4', 'video', 'mp4', apiKey)
  console.log(`[marble] Media asset: ${mediaAssetId}`)

  console.log(`[marble] Generating world with ${model}...`)
  const operationId = await generateWorld(mediaAssetId, 'video', { model }, apiKey)
  console.log(`[marble] Operation: ${operationId}`)

  console.log(`[marble] Polling for completion...`)
  const worldId = await pollOperation(operationId, apiKey)
  console.log(`[marble] World: ${worldId}`)

  console.log(`[marble] Fetching world assets...`)
  const world = await fetchWorld(worldId, apiKey)
  console.log(`[marble] pano_url: ${world.pano_url ? 'obtained' : 'null'}`)

  return world
}

export async function uploadPanoAsset(panoBytes: ArrayBuffer, apiKey: string): Promise<string> {
  return uploadMediaAsset(panoBytes, 'redesigned_room.png', 'image', 'png', apiKey)
}

export async function generateWorldFromPano(
  mediaAssetId: string,
  options: MarbleGenerateOptions,
  apiKey: string
): Promise<string> {
  return generateWorld(mediaAssetId, 'pano', options, apiKey)
}

// Complete pipeline: download redesigned pano → upload to Marble → generate Plus world
// Cost: 1,500 credits ($1.20) with is_pano: true
export async function processRedesignedPanoToWorld(
  redesignedPanoUrl: string,
  apiKey: string
): Promise<MarbleWorld> {
  console.log('[marble] Downloading redesigned panorama...')
  const panoResp = await fetch(redesignedPanoUrl)
  if (!panoResp.ok) {
    throw new Error(`Failed to download redesigned pano: ${panoResp.status}`)
  }
  const panoBuffer = await panoResp.arrayBuffer()
  console.log(`[marble] Downloaded ${(panoBuffer.byteLength / 1e6).toFixed(1)}MB`)

  console.log('[marble] Uploading to Marble as pano asset...')
  const mediaAssetId = await uploadPanoAsset(panoBuffer, apiKey)
  console.log(`[marble] Media asset: ${mediaAssetId}`)

  console.log('[marble] Generating Plus world (is_pano=true)...')
  const operationId = await generateWorldFromPano(
    mediaAssetId,
    { model: 'Marble 0.1-plus', displayName: 'Cova Redesigned Room' },
    apiKey
  )
  console.log(`[marble] Operation: ${operationId}`)

  console.log('[marble] Polling (Plus ~5-6 min)...')
  const worldId = await pollOperation(operationId, apiKey, 600000, 15000)
  console.log(`[marble] World: ${worldId}`)

  const world = await fetchWorld(worldId, apiKey, 8, 10000)
  console.log(`[marble] SPZ full_res: ${world.spz_urls.full_res ? 'obtained' : 'missing'}`)

  return world
}
