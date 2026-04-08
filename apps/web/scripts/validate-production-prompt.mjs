// Validate that the production buildFluxPrompt structure works on IMG_2093.
// Builds a prompt that mirrors what the render API would emit for a coastal
// bedroom, runs it through Kontext Pro, and saves the output for review.

import Replicate from 'replicate'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const r = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

const ROTATED_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/room-uploads/IMG_2093_rotated.jpeg`

// Simulate a Gemini preservation instruction that matches what
// analyzeRoomArchitecture() would produce for Daksh's bedroom.
const preservationInstructions =
  `PRESERVE EXACTLY WITHOUT ANY CHANGES: light sky blue painted walls, ` +
  `beige carpet floor, white ceiling with a white 5-blade ceiling fan with center light, ` +
  `one window on the left wall with white cellular blinds, camera angle (eye-level ` +
  `view looking toward the corner where the bed meets two walls), room layout and ` +
  `proportions, natural daylight from the window, DAKSH wooden letters mounted on ` +
  `the wall above the bed, string of hanging photos on the wall, white bed frame ` +
  `with built-in storage drawers. This must look like the same physical room.`

// Mirror of buildFluxPrompt() for a coastal bedroom with warm/organic dims.
const prompt = [
  'Interior design makeover: this bedroom needs a complete redesign',
  'REPLACE all existing furniture, bedding, soft furnishings, rugs, artwork, lamps and decor with new pieces in this style',
  'bright airy space, flooded with natural light, warm amber tones, honey wood, terracotta, organic curves, soft rounded forms, tactile richness, chunky knits, rough linen, natural stone, woven rattan, abundant natural materials, wood grain, stone, live plants, rattan, linen',
  'ADD: rattan accent chair, jute rug, coastal wall art, table lamp',
  'Remove all clutter, personal items, backpacks, cords, laundry and mess so the room looks professionally staged',
  preservationInstructions,
  'quality mid-range furniture, well-made everyday pieces',
  'Result: the same physical room, transformed into a beautifully staged space. Photorealistic interior design photography, professional staging, same lighting as the original photo',
].join('. ')

console.log('Prompt length:', prompt.split(/\s+/).length, 'words')
console.log('Running production-structure render on Daksh bedroom...')

const pred = await r.predictions.create({
  model: 'black-forest-labs/flux-kontext-pro',
  input: {
    input_image: ROTATED_URL,
    prompt,
    output_format: 'jpg',
    output_quality: 92,
    safety_tolerance: 2,
  },
})
console.log('Prediction ID:', pred.id)

let p = pred
const start = Date.now()
while (p.status !== 'succeeded' && p.status !== 'failed' && p.status !== 'canceled') {
  if (Date.now() - start > 180000) throw new Error('Timeout')
  await new Promise((res) => setTimeout(res, 4000))
  p = await r.predictions.get(pred.id)
  console.log(p.status, Math.round((Date.now() - start) / 1000) + 's')
}
if (p.status !== 'succeeded') throw new Error('Failed: ' + JSON.stringify(p.error))

const url = Array.isArray(p.output) ? p.output[0] : p.output
console.log('URL:', url)
const img = Buffer.from(await (await fetch(url)).arrayBuffer())
mkdirSync(join(__dirname, 'render-tests'), { recursive: true })
const out = join(__dirname, 'render-tests', 'production-structure.jpg')
writeFileSync(out, img)
console.log('Saved to', out)
