import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT      = path.join(__dirname, '../../..')

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY
const WEBHOOK_URL    = process.env.REDESIGN_PIPELINE_WEBHOOK_URL
const PHOTO_BUCKET   = 'room-photos'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE env vars')
  process.exit(1)
}
if (!WEBHOOK_URL) {
  console.error('Missing REDESIGN_PIPELINE_WEBHOOK_URL')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

// Load derived context
const ctx = JSON.parse(readFileSync('/tmp/derived_context.json','utf8'))
console.log(`\n[TEST] Style: ${ctx.style_blend.primaryStyle}`)
console.log(`[TEST] Top dims: ${Object.keys(ctx.style_blend.weights).slice(0,3).join(', ')}`)
console.log(`[TEST] Density: ${ctx.sensoryProfile.density}`)
console.log(`[TEST] Plants: ${ctx.sensoryProfile.plantPresence}`)

// Upload reference-input.png
const inputPath = path.join(ROOT, 'test-assets/reference-input.png')
if (!existsSync(inputPath)) {
  console.error('Missing: test-assets/reference-input.png')
  process.exit(1)
}

const imgBuffer   = readFileSync(inputPath)
const testFileName = `pipeline-test/${Date.now()}-input.png`

const { error: uploadErr } = await admin.storage
  .from(PHOTO_BUCKET)
  .upload(testFileName, imgBuffer, { contentType: 'image/png', upsert: true })

if (uploadErr) {
  console.error('[ERROR] Upload failed:', uploadErr.message)
  process.exit(1)
}

const { data: { publicUrl: testPhotoUrl } } = admin.storage
  .from(PHOTO_BUCKET)
  .getPublicUrl(testFileName)

console.log(`[TEST] Input image uploaded: ${testPhotoUrl.substring(0,80)}...`)

// Find a real user
const { data: users } = await admin
  .from('users')
  .select('id')
  .order('created_at', { ascending: false })
  .limit(1)

if (!users?.length) {
  console.error('[ERROR] No users found.')
  process.exit(1)
}
const testUserId = users[0].id
console.log(`[TEST] User: ${testUserId}`)

// Write fingerprint to user
await admin.from('users').update({
  style_fingerprint: { dimensions: ctx.fingerprint },
  style_blend: ctx.style_blend,
}).eq('id', testUserId)
console.log('[TEST] Fingerprint written')

// Build render_context
const renderContext = {
  roomType:         ctx.roomType,
  primaryFunction:  [ctx.roomType.replace('_',' ')],
  ceilingDetail:    { heightFt: ctx.constraints.ceilingHeightFt,
                      label: `Standard ${ctx.constraints.ceilingHeightFt}ft` },
  physicalConstraints: {
    floorMaterial:        ctx.constraints.floorMaterial,
    keepExistingFlooring: ctx.constraints.keepExistingFlooring,
    brightestTime:        ctx.constraints.brightestTime,
    windowCount:          ctx.constraints.windowCount,
    protectedAreas:       ctx.constraints.protectedAreas,
    fixtures:             ctx.constraints.fixtures,
  },
  specialNotes:     ctx.specialNotes,
  keepMask:         ctx.keepMask,
  budget:           ctx.budget,
  sensoryProfile:   ctx.sensoryProfile,
  identityBrief:    ctx.identityBrief,
  artBrief:         ctx.artBrief,
  techSpec:         {},
  requestedProducts: ctx.requestedProducts,
  styleFingerprint: ctx.fingerprint,
  styleBlend:       ctx.style_blend,
  fingerprint:      { dimensions: ctx.fingerprint },
}

// Create test room
const { data: room, error: roomErr } = await admin.from('rooms').insert({
  user_id:            testUserId,
  room_type:          ctx.roomType,
  original_photo_url: testPhotoUrl,
  original_image_url: testPhotoUrl,
  redesign_status:    'pending',
  render_context:     renderContext,
  style_blend:        ctx.style_blend,
}).select('id').single()

if (roomErr || !room) {
  console.error('[ERROR] Room creation failed:', roomErr?.message)
  process.exit(1)
}

const testRoomId = room.id
console.log(`[TEST] Test room created: ${testRoomId}`)

// Build a compiled prompt using the special notes and fingerprint
// This simulates what compilePromptWithClaude() would produce
const fp = ctx.fingerprint
const sn = ctx.specialNotes
const compiledPrompt = `Interior design photograph of a ${ctx.roomType.replace('_',' ')}. ` +
  `${sn}. ` +
  `Bright sun-filled interior with natural light streaming through ${ctx.constraints.windowCount} windows illuminating the entire space. ` +
  `Light neutral walls with warm honey-toned palette — aged brass, warm oak, warm linen, terracotta accents. ` +
  `Natural materials throughout: rattan, jute weaves, handwoven linen, live-edge wood surfaces, hand-thrown ceramics. ` +
  `Include 3 specific plants: large fiddle leaf fig, trailing pothos on shelf, monstera deliciosa in corner. ` +
  `Eclectic gallery wall with 5+ pieces: framed botanical print, woven macrame wall hanging, ceramic wall plate, sculptural wooden piece, vintage botanical illustration. ` +
  `Rich variety of textures and materials. High visual contrast between light walls and darker decorative objects. ` +
  `Layered textiles: patterned area rug, woven throw blanket, mixed print cushions. ` +
  `Vessel cluster: 3 ceramic objects in graduated heights on coffee table. ` +
  `Stack of hardcover books with cloth spines. Styled tray with candles in terracotta holders. ` +
  `${ctx.constraints.floorMaterial} floor — preserve exactly, do not replace. ` +
  `Anchor constraint: do not alter the existing ${ctx.constraints.floorMaterial.toLowerCase()} flooring or wall structure. ` +
  `Final constraint: all newly placed furniture must complement the warm neutral palette. ` +
  `Photorealistic interior design magazine photography. Professional staging. Ultra-sharp detail. No people. No text.`

console.log(`\n[TEST] Compiled prompt (${compiledPrompt.split(/\s+/).length} words):`)
console.log(compiledPrompt.substring(0, 300) + '...')

// Fire Modal webhook directly
console.log('\n[TEST] Firing Modal webhook directly...')
const res = await fetch(WEBHOOK_URL, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    room_id: testRoomId,
    user_id: testUserId,
    compiled_prompt: compiledPrompt,
    anchor_prompt: null,
    style_reference_url: null,
    chat_context: null,
  }),
})

if (!res.ok) {
  const txt = await res.text()
  console.error(`[ERROR] Modal webhook ${res.status}: ${txt.substring(0,300)}`)
  await admin.from('rooms').delete().eq('id', testRoomId)
  await admin.storage.from(PHOTO_BUCKET).remove([testFileName])
  process.exit(1)
}

const webhookResult = await res.json()
console.log(`[TEST] Webhook response: ${JSON.stringify(webhookResult)}`)

// Poll for completion
const timeout  = 6 * 60 * 1000
const start    = Date.now()
let renderUrl  = null

while (Date.now() - start < timeout) {
  await new Promise(r => setTimeout(r, 6000))
  const { data: r } = await admin.from('rooms')
    .select('redesign_status, redesign_pano_url')
    .eq('id', testRoomId).single()

  const elapsed = Math.round((Date.now()-start)/1000)
  process.stdout.write(`\r[TEST] ${elapsed}s -- ${r?.redesign_status || '?'}      `)

  if (r?.redesign_status === 'complete' && r?.redesign_pano_url) {
    renderUrl = r.redesign_pano_url
    console.log(`\n[TEST] Complete at ${elapsed}s`)
    break
  }
  if (r?.redesign_status === 'failed') {
    // Fetch full room for error details
    const { data: failedRoom } = await admin.from('rooms')
      .select('redesign_status, render_context, redesign_pano_url')
      .eq('id', testRoomId).single()
    console.log('\n[ERROR] Pipeline failed')
    console.log('[ERROR] Room details:', JSON.stringify(failedRoom, null, 2).substring(0, 1000))
    // Don't delete — leave for inspection
    console.log(`[ERROR] Room ID for inspection: ${testRoomId}`)
    process.exit(1)
  }
}

if (!renderUrl) {
  console.log('\n[ERROR] Timeout')
  await admin.from('rooms').delete().eq('id', testRoomId)
  await admin.storage.from(PHOTO_BUCKET).remove([testFileName])
  process.exit(1)
}

// Download render
console.log(`\n[TEST] Downloading render...`)
const imgRes = await fetch(renderUrl)
if (!imgRes.ok) {
  console.error(`[ERROR] Download failed: ${imgRes.status}`)
  process.exit(1)
}
const buf = Buffer.from(await imgRes.arrayBuffer())
writeFileSync('/tmp/cova_render.png', buf)
console.log('[TEST] Render saved: /tmp/cova_render.png')

// Save state
writeFileSync('/tmp/test_state.json', JSON.stringify({
  testRoomId, testFileName, PHOTO_BUCKET,
  renderUrl, fluxPrompt: compiledPrompt,
}))

// Cleanup
await admin.from('rooms').delete().eq('id', testRoomId)
await admin.storage.from(PHOTO_BUCKET).remove([testFileName])
console.log('[TEST] Cleaned up test room and photo')
console.log('\n[TEST] Ready for comparison.')
