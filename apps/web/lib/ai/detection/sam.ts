/**
 * SAM2 — per-object segmentation masks keyed by label.
 *
 * Uses the grounded_sam model to produce a combined mask; we then
 * return a label → base64 PNG map. If SAM2 fails the orchestrator
 * continues without masks — non-fatal.
 */

import Replicate from 'replicate'
import type { GroundingHit } from './grounding'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

const GROUNDED_SAM_MODEL =
  'schananas/grounded_sam:be7cbde9fdf0eecdc8b20ffec9dd0d1cfeace0832d4d0b58a071d993182e1be0'

type SamOutput = string | string[] | { url?: () => URL }

async function extractUrl(output: SamOutput): Promise<string | null> {
  if (typeof output === 'string' && output.startsWith('http')) return output
  if (Array.isArray(output) && output.length > 0) {
    const first = output[0]
    const asStr = String(first)
    if (asStr.startsWith('http')) return asStr
  }
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const asStr = String(output)
    if (asStr.startsWith('http')) return asStr
    if (typeof (output as { url?: () => URL }).url === 'function') {
      return (output as { url: () => URL }).url().href
    }
  }
  return null
}

async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`SAM mask fetch failed: ${res.status}`)
  const buffer = await res.arrayBuffer()
  return Buffer.from(buffer).toString('base64')
}

/**
 * Returns a label → base64 PNG map.
 *
 * Note: grounded_sam returns ONE combined mask for all objects, not
 * per-object masks. We populate the same base64 string against every
 * unique label as a reasonable first approximation — Screen C can
 * still use individual bounding boxes for selection, and the combined
 * mask is what inpainting actually needs.
 */
export async function runSAM2(
  imageUrl: string,
  hits: GroundingHit[]
): Promise<Record<string, string>> {
  if (hits.length === 0) return {}

  const uniqueLabels = Array.from(
    new Set(hits.map((h) => h.label.toLowerCase()))
  )
  const maskPrompt = uniqueLabels.join(', ')

  const output = (await replicate.run(GROUNDED_SAM_MODEL, {
    input: {
      image: imageUrl,
      mask_prompt: maskPrompt,
      negative_mask_prompt: 'wall, floor, ceiling, window, door',
      adjustment_factor: 1.0,
    },
  })) as SamOutput

  const url = await extractUrl(output)
  if (!url) return {}

  const base64 = await urlToBase64(url)
  const map: Record<string, string> = {}
  for (const label of uniqueLabels) {
    map[label] = base64
  }
  return map
}
