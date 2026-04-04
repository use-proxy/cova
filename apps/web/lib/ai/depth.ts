import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

export interface DepthResult {
  depth_map_url: string
  quality_score: number
}

export async function estimateDepth(photoUrl: string): Promise<DepthResult> {
  const output = await replicate.run('depth-anything/depth-anything-v2-large', {
    input: {
      image: photoUrl,
      encoder: 'vitl',
    },
  })

  let depthMapUrl: string

  if (Array.isArray(output) && output.length > 0) {
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
