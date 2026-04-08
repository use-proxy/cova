import Replicate from 'replicate'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

// Clarity Upscaler (philz1337x/clarity-upscaler) post-processes a finished
// Kontext render to add photorealistic fabric textures, wood grain, and
// material sheen that Kontext's 1MP output can't capture. The Replicate SDK
// cannot resolve this model by slug (404 from r.run / model-slug predictions),
// so we pin the version hash directly. Refresh the hash if Replicate deprecates
// this one — the latest_version.id is visible from r.models.get(...).
//
// Verified 2026-04-08 end-to-end: ~17s on an A100, output URL:
//   https://replicate.delivery/yhqm/.../1337-61f96952-3322-11f1-9a9c-eac990bbba18.png
const CLARITY_VERSION = 'dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e'

export async function upscaleRender(
  renderUrl: string,
  styleContext: string = 'interior design',
): Promise<string> {
  try {
    const prediction = await replicate.predictions.create({
      version: CLARITY_VERSION,
      input: {
        image: renderUrl,
        prompt:
          'professional interior design photography, Architectural Digest, ' +
          'natural window light, realistic fabric textures, warm ambient lighting, ' +
          `photorealistic materials, high detail, ${styleContext}`,
        negative_prompt:
          '3d render, CGI, artificial lighting, flat textures, plastic look, ' +
          'blurry, cartoon, illustration, oversaturated',
        scale_factor: 2,
        creativity: 0.25,
        resemblance: 0.85,
        dynamic: 6,
        num_inference_steps: 18,
        output_format: 'png',
      },
    })

    // Poll until complete (Clarity runs ~15-25s)
    let p = prediction
    const start = Date.now()
    while (p.status !== 'succeeded' && p.status !== 'failed' && p.status !== 'canceled') {
      if (Date.now() - start > 120_000) {
        console.error('[upscaler] Timed out, falling back to original render')
        return renderUrl
      }
      await new Promise((r) => setTimeout(r, 2500))
      p = await replicate.predictions.get(p.id)
    }

    if (p.status !== 'succeeded') {
      console.error('[upscaler] Clarity Upscaler failed (non-fatal):', p.error)
      return renderUrl
    }

    const output = p.output
    const upscaledUrl = Array.isArray(output)
      ? String(output[output.length - 1])
      : String(output)

    if (!upscaledUrl || !upscaledUrl.startsWith('http')) {
      console.error('[upscaler] No valid upscaled URL, falling back')
      return renderUrl
    }
    return upscaledUrl
  } catch (err) {
    console.error('[upscaler] Clarity Upscaler failed (non-fatal):', err)
    return renderUrl
  }
}
