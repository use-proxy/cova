#!/usr/bin/env node
// Live test of two-pass Kontext Pro render pipeline.
// Fetches a real room photo → runs Gemini analysis → Kontext pass 1 (style)
// → Kontext pass 2 (architecture correction). Logs all three URLs.

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Replicate from 'replicate'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const gemini = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
const KONTEXT = 'black-forest-labs/flux-kontext-pro'

async function analyze(imageUrl) {
  const resp = await fetch(imageUrl)
  const buffer = await resp.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const mimeType = resp.headers.get('content-type') ?? 'image/jpeg'
  const prompt = `Analyze this room photo and describe its permanent architectural features in precise detail. Return ONLY a JSON object.
{
  "wallColors": "exact color and finish of walls",
  "floorType": "floor material and color",
  "ceiling": "ceiling description including any fixtures like fans or lights",
  "windows": "number, position and size of windows with any coverings",
  "cameraAngle": "describe the camera position and viewing angle",
  "roomDimensions": "estimated room size and shape",
  "fixedElements": ["list", "of", "permanent", "architectural", "elements"],
  "lightingCondition": "natural/artificial light description"
}
Be extremely specific and precise. This description will be used to ensure these elements are preserved exactly in a redesigned version.`
  const result = await gemini.generateContent([
    { inlineData: { mimeType, data: base64 } },
    prompt,
  ])
  const text = result.response.text().trim().replace(/```json|```/g, '').trim()
  return JSON.parse(text)
}

function buildPreservation(arch) {
  const fixed = arch.fixedElements.length ? `, ${arch.fixedElements.join(', ')}` : ''
  return `PRESERVE EXACTLY WITHOUT ANY CHANGES: ${arch.wallColors}, ${arch.floorType}, ${arch.ceiling}, ${arch.windows}, camera angle (${arch.cameraAngle}), room layout and proportions, ${arch.lightingCondition}${fixed}. This must look like the same physical room.`
}

async function poll(id, label) {
  for (let i = 0; i < 60; i++) {
    const p = await replicate.predictions.get(id)
    process.stdout.write(`  ${label} [${i}] ${p.status}\r`)
    if (p.status === 'succeeded') {
      console.log(`\n  ${label} succeeded`)
      return Array.isArray(p.output) ? p.output[0] : p.output
    }
    if (p.status === 'failed' || p.status === 'canceled') {
      throw new Error(`${label} failed: ${p.error}`)
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error(`${label} timed out`)
}

async function main() {
  const { data } = await sb
    .from('rooms')
    .select('id,original_photo_url')
    .not('original_photo_url', 'is', null)
    .limit(1)
  const room = data[0]
  console.log('Room:', room.id)
  console.log('Photo:', room.original_photo_url)

  console.log('\n1/4 Gemini arch analysis…')
  const arch = await analyze(room.original_photo_url)
  console.log(JSON.stringify(arch, null, 2))
  const preservation = buildPreservation(arch)

  console.log('\n2/4 Kontext Pass 1 (style redesign)…')
  const prompt1 =
    preservation +
    '. Redesign the furniture, bedding, soft furnishings, and decor of this bedroom with the following style. ' +
    'bright airy space flooded with natural light, warm amber tones honey wood, ' +
    'abundant natural materials wood grain stone live plants linen, ' +
    'quality mid-range furniture. Photorealistic interior design photography, ' +
    'professional staging, same lighting as original photo, high quality render'
  const pred1 = await replicate.predictions.create({
    model: KONTEXT,
    input: {
      input_image: room.original_photo_url,
      prompt: prompt1,
      output_format: 'jpg',
      output_quality: 90,
      safety_tolerance: 2,
    },
  })
  console.log('  pass1 id:', pred1.id)
  const pass1Url = await poll(pred1.id, 'pass1')
  console.log('  pass1 URL:', pass1Url)

  console.log('\n3/4 Kontext Pass 2 (architecture correction)…')
  const fixed = arch.fixedElements.length ? ` Do not change: ${arch.fixedElements.join(', ')}.` : ''
  const prompt2 =
    `This is a redesigned version of a room. Correct any architectural differences so it looks like the original physical room. ` +
    preservation +
    ` The furniture style and decor are correct — only fix the architecture if walls, floor, ceiling, windows, or camera angle changed.` +
    fixed +
    ` If architecture is already correct, keep the image exactly as is.`
  const pred2 = await replicate.predictions.create({
    model: KONTEXT,
    input: {
      input_image: pass1Url,
      prompt: prompt2,
      output_format: 'jpg',
      output_quality: 92,
      safety_tolerance: 2,
    },
  })
  console.log('  pass2 id:', pred2.id)
  const pass2Url = await poll(pred2.id, 'pass2')
  console.log('  pass2 URL:', pass2Url)

  console.log('\n4/4 SUMMARY')
  console.log('  Original :', room.original_photo_url)
  console.log('  Pass 1   :', pass1Url)
  console.log('  Pass 2   :', pass2Url)
}

main().catch((e) => {
  console.error('FAIL:', e)
  process.exit(1)
})
