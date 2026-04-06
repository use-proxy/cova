import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

export interface Detection {
  type: string
  label: string
  bbox: [number, number, number, number]  // [x, y, w, h] normalized 0-1
  confidence: number
  showToUser: boolean
  mask_url?: string
}

// Fetch image dimensions without downloading the full file (Range request)
async function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-65535' } })
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // JPEG: look for SOF0 (0xC0) or SOF2 (0xC2) markers
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      for (let i = 2; i < bytes.length - 8; i++) {
        if (bytes[i] === 0xff && (bytes[i + 1] === 0xc0 || bytes[i + 1] === 0xc2)) {
          const height = ((bytes[i + 5] ?? 0) << 8) | (bytes[i + 6] ?? 0)
          const width = ((bytes[i + 7] ?? 0) << 8) | (bytes[i + 8] ?? 0)
          if (width > 0 && height > 0) return { width, height }
        }
      }
    }

    // PNG: dimensions at bytes 16-23
    if (bytes[0] === 0x89 && bytes[1] === 0x50) {
      const width =
        ((bytes[16] ?? 0) << 24) | ((bytes[17] ?? 0) << 16) |
        ((bytes[18] ?? 0) << 8) | (bytes[19] ?? 0)
      const height =
        ((bytes[20] ?? 0) << 24) | ((bytes[21] ?? 0) << 16) |
        ((bytes[22] ?? 0) << 8) | (bytes[23] ?? 0)
      if (width > 0 && height > 0) return { width, height }
    }
  } catch {
    // fall through to default
  }
  // Default: iPhone portrait (3024×4032) — covers most real room photos
  return { width: 3024, height: 4032 }
}

// Convert pixel bbox [x1, y1, x2, y2] to fractional [x, y, w, h] (0–1)
function normalizeBbox(
  pixelBbox: number[],
  imageWidth: number,
  imageHeight: number,
): [number, number, number, number] {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = pixelBbox
  return [
    Math.max(0, Math.min(1, x1 / imageWidth)),
    Math.max(0, Math.min(1, y1 / imageHeight)),
    Math.max(0, Math.min(1, (x2 - x1) / imageWidth)),
    Math.max(0, Math.min(1, (y2 - y1) / imageHeight)),
  ]
}

// Comprehensive furniture prompt — covers everything visible in a room
const FURNITURE_PROMPT = [
  'sofa', 'couch', 'chair', 'armchair', 'accent chair',
  'bed', 'desk', 'table', 'coffee table', 'dining table', 'side table',
  'bookshelf', 'bookcase', 'wardrobe', 'dresser', 'nightstand',
  'lamp', 'floor lamp', 'table lamp', 'ceiling light', 'pendant light',
  'rug', 'curtain', 'curtains', 'blind', 'blinds', 'window treatment',
  'tv', 'television', 'monitor',
  'plant', 'artwork', 'painting', 'picture frame', 'wall art', 'wall decoration',
  'mirror', 'cabinet', 'shelf', 'ottoman', 'bench',
  'throw pillow', 'pillow', 'blanket', 'vase',
].join(' . ')

// Architecture elements that affect room redesign
const ARCHITECTURE_PROMPT = [
  'wall', 'floor', 'ceiling', 'window', 'door', 'fireplace',
  'exposed brick', 'built-in shelves', 'column', 'arch', 'baseboard',
  'crown molding', 'wainscoting',
].join(' . ')

// SAM mask prompt — comma-separated for schananas/grounded_sam
const SAM_FURNITURE_PROMPT =
  'sofa, couch, chair, armchair, accent chair, bed, desk, table, coffee table, dining table, ' +
  'side table, bookshelf, bookcase, wardrobe, dresser, nightstand, lamp, floor lamp, table lamp, ' +
  'ceiling light, pendant light, rug, curtain, curtains, blind, blinds, window treatment, ' +
  'tv, television, monitor, plant, artwork, painting, picture frame, wall art, wall decoration, ' +
  'mirror, cabinet, shelf, ottoman, bench, throw pillow, pillow, blanket, vase'

async function getGroundedSamMaskUrl(photoUrl: string): Promise<string | undefined> {
  try {
    const output = await replicate.run(
      'schananas/grounded_sam:ee871c19efb1941f55f66a3d7d960428c8a5afcb77449547fe8e5a3ab9ebc21c',
      {
        input: {
          image: photoUrl,
          mask_prompt: SAM_FURNITURE_PROMPT,
          negative_mask_prompt: 'wall, floor, ceiling, window, door, baseboard, crown molding',
          adjustment_factor: 0,
        },
      }
    )
    // Output is an array of 4 file URLs; index [2] is the primary segmentation mask
    const extractUrl = (item: unknown): string | undefined => {
      if (typeof item === 'string') return item
      if (item && typeof (item as { url?: () => { href: string } }).url === 'function') {
        return (item as { url(): { href: string } }).url().href
      }
      return undefined
    }

    const results: string[] = []
    if (Array.isArray(output)) {
      for (const item of output) {
        const url = extractUrl(item)
        if (url) results.push(url)
      }
    } else if (output && typeof (output as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
      for await (const item of output as AsyncIterable<unknown>) {
        const url = extractUrl(item)
        if (url) results.push(url)
      }
    } else {
      const url = extractUrl(output)
      if (url) results.push(url)
    }

    const maskUrl = results[2] ?? results[results.length - 1]
    return maskUrl || undefined
  } catch (err) {
    console.error('[detect] grounded_sam mask call failed (non-fatal):', err)
    return undefined
  }
}

export async function detectFurniture(photoUrl: string): Promise<Detection[]> {
  try {
    const [output, { width: imgW, height: imgH }] = await Promise.all([
      replicate.run(
        'adirik/grounding-dino:efd10a8ddc57ea28773327e881ce95e20cc1d734c589f7dd01d2036921ed78aa',
        {
          input: {
            image: photoUrl,
            query: FURNITURE_PROMPT,
            box_threshold: 0.28,
            text_threshold: 0.22,
          },
        }
      ) as Promise<{
        detections?: Array<{ label: string; confidence: number; bbox: number[] }>
      }>,
      getImageDimensions(photoUrl),
    ])

    if (!output.detections) return []

    const detections = output.detections
      .filter((d) => d.confidence >= 0.35)
      .map((d) => ({
        type: 'furniture',
        label: d.label,
        bbox: normalizeBbox(d.bbox, imgW, imgH),
        confidence: d.confidence,
        showToUser: d.confidence >= 0.60,
      }))

    // Fire SAM call only if we have detections — it's slow (~71s) and expensive ($0.068)
    if (detections.length === 0) return detections

    const maskUrl = await getGroundedSamMaskUrl(photoUrl)

    // Attach the same combined mask URL to every item (shared mask for all furniture)
    if (!maskUrl) return detections
    return detections.map((d) => ({ ...d, mask_url: maskUrl }))
  } catch (err) {
    console.error('[detect] Furniture detection failed:', err)
    return []
  }
}

export async function detectArchitecture(photoUrl: string): Promise<Detection[]> {
  try {
    const [output, { width: imgW, height: imgH }] = await Promise.all([
      replicate.run(
        'adirik/grounding-dino:efd10a8ddc57ea28773327e881ce95e20cc1d734c589f7dd01d2036921ed78aa',
        {
          input: {
            image: photoUrl,
            query: ARCHITECTURE_PROMPT,
            box_threshold: 0.28,
            text_threshold: 0.22,
          },
        }
      ) as Promise<{
        detections?: Array<{ label: string; confidence: number; bbox: number[] }>
      }>,
      getImageDimensions(photoUrl),
    ])

    if (!output.detections) return []

    return output.detections
      .filter((d) => d.confidence >= 0.35)
      .map((d) => ({
        type: 'architecture',
        label: d.label,
        bbox: normalizeBbox(d.bbox, imgW, imgH),
        confidence: d.confidence,
        showToUser: d.confidence >= 0.60,
      }))
  } catch {
    return []
  }
}
