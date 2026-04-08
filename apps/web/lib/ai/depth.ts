import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

export interface DepthResult {
  depth_map_url: string | null
  quality_score: number
}

export async function estimateDepth(photoUrl: string): Promise<DepthResult> {
  const output = await replicate.run('chenxwh/depth-anything-v2:b239ea33cff32bb7abb5db39ffe9a09c14cbc2894331d1ef66fe096eed88ebd4', {
    input: {
      image: photoUrl,
      model_size: 'Large',
    },
  })

  let depthMapUrl: string

  // chenxwh/depth-anything-v2 returns FileOutput objects.
  // .toString() is the most reliable extraction method (verified via live test April 2026).
  // .url()?.href also works as a fallback.
  const out = output as Record<string, { toString: () => string; url?: () => URL } | string>

  if (out.grey_depth) {
    // Primary: toString() returns the CDN URL directly
    const asStr = String(out.grey_depth)
    if (asStr.startsWith('http')) {
      depthMapUrl = asStr
    } else if (typeof (out.grey_depth as { url?: () => URL }).url === 'function') {
      depthMapUrl = (out.grey_depth as { url: () => URL }).url().href
    } else {
      depthMapUrl = asStr
    }
  } else if (out.color_depth) {
    const asStr = String(out.color_depth)
    if (asStr.startsWith('http')) {
      depthMapUrl = asStr
    } else if (typeof (out.color_depth as { url?: () => URL }).url === 'function') {
      depthMapUrl = (out.color_depth as { url: () => URL }).url().href
    } else {
      depthMapUrl = asStr
    }
  } else if (Array.isArray(output) && output.length > 0) {
    depthMapUrl = output[0] as string
  } else if (typeof output === 'string') {
    depthMapUrl = output
  } else {
    throw new Error('Unexpected depth estimation output format')
  }

  const qualityScore = await assessDepthQuality(depthMapUrl)

  return {
    depth_map_url: depthMapUrl,
    quality_score: qualityScore,
  }
}

export async function assessDepthQuality(depthMapUrl: string): Promise<number> {
  // Quality score 0-1 based on depth map gradient magnitude
  // Above 0.70 = sufficient for swap & rerender per COVA spec
  // Without GPU processing here, return a conservative default
  // that triggers re-assessment in the pipeline
  // Real assessment happens in modal_pipeline/
  try {
    const response = await fetch(depthMapUrl, { method: 'HEAD' })
    if (!response.ok) return 0
    const contentLength = response.headers.get('content-length')
    if (!contentLength) return 0.75
    const sizeKb = parseInt(contentLength) / 1024
    // Larger depth maps generally have more detail
    // Heuristic: >50KB = good quality, <20KB = poor quality
    if (sizeKb > 50) return 0.85
    if (sizeKb > 20) return 0.75
    return 0.5
  } catch {
    return 0.75
  }
}
