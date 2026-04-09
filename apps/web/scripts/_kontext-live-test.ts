/**
 * Live Kontext Pro test with IMG_2093.jpeg — Daksh's actual room.
 * Spawns one prediction, polls to completion, prints the output URL.
 */
import * as dotenv from 'dotenv'
import Replicate from 'replicate'
dotenv.config({ path: '.env.local' })

const PHOTO =
  'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-uploads/IMG_2093.jpeg'

const PROMPT =
  'Keep the exact same room layout, camera angle, walls, ceiling, floor, ' +
  'windows, doors, and all architectural elements unchanged. ' +
  'Redesign the furniture and decor with a coastal bedroom style: ' +
  'rattan furniture, woven rug, neutral bedding, coastal artwork, ' +
  'warm natural light, organic textures. ' +
  'Photorealistic interior design photography, professional staging, high quality.'

async function main() {
  const r = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! })

  console.log('Testing Kontext Pro with:', PHOTO)
  console.log('Prompt (first 200 chars):', PROMPT.slice(0, 200))
  console.log()

  const pred = await r.predictions.create({
    model: 'black-forest-labs/flux-kontext-pro',
    input: {
      input_image: PHOTO,
      prompt: PROMPT,
      output_format: 'jpg',
      output_quality: 90,
      safety_tolerance: 2,
    },
  })
  console.log('prediction_id:', pred.id, 'initial status:', pred.status)

  const start = Date.now()
  let p = pred
  while (p.status !== 'succeeded' && p.status !== 'failed' && p.status !== 'canceled') {
    if (Date.now() - start > 180_000) {
      console.error('TIMEOUT at 180s, id:', pred.id)
      process.exit(2)
    }
    await new Promise((res) => setTimeout(res, 4000))
    p = await r.predictions.get(pred.id)
    console.log(`  [${Math.round((Date.now() - start) / 1000)}s] status=${p.status}`)
  }

  if (p.status !== 'succeeded') {
    console.error('FAILED:', p.error ?? p.status)
    process.exit(1)
  }

  const output = p.output
  let url = ''
  if (typeof output === 'string') url = output
  else if (Array.isArray(output) && output.length > 0) url = String(output[0])
  else if (output && typeof (output as { url?: () => { href: string } }).url === 'function') {
    url = (output as { url: () => { href: string } }).url().href
  }

  console.log()
  console.log('=== SUCCESS ===')
  console.log('OUTPUT URL:', url)
  console.log('elapsed:', Math.round((Date.now() - start) / 1000) + 's')

  // HEAD check
  const headRes = await fetch(url, { method: 'HEAD' })
  console.log('HEAD:', headRes.status, headRes.headers.get('content-length'))
}
main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
