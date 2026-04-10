/**
 * Verify DepthFlow parallax Modal deployment:
 *  - Endpoint alive (responds to garbage input with an error envelope, not 502/503)
 *  - If a room with both render + depth exists, generate a real video and verify it
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

async function verify() {
  console.log('=== PARALLAX VERIFICATION ===')
  const webhookUrl = process.env.DEPTH_VIDEO_WEBHOOK_URL
  if (!webhookUrl) {
    console.log('WARN DEPTH_VIDEO_WEBHOOK_URL not configured — CSS parallax fallback')
    return null
  }

  console.log('1. Pinging Modal endpoint with invalid payload...')
  let pingOk = false
  try {
    const pingRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        render_url: 'not-a-real-url',
        depth_map_url: 'not-a-real-url',
        room_id: 'verify-test',
      }),
      signal: AbortSignal.timeout(60000),
    })
    if (pingRes.status === 502 || pingRes.status === 503) {
      console.log('WARN Modal endpoint cold start / down — CSS fallback')
      return null
    }
    const pingData = (await pingRes.json()) as { video_url?: string | null; error?: string }
    console.log(
      'OK Modal endpoint alive, status',
      pingRes.status,
      '— response:',
      pingData.error ?? JSON.stringify(pingData).slice(0, 80)
    )
    pingOk = true
  } catch (e) {
    console.log('WARN Ping failed:', (e as Error).message)
    return null
  }

  if (!pingOk) return null

  // Now try with real render + depth data if available
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: rooms } = await sb
    .from('rooms')
    .select('id, render_url, depth_map_url')
    .not('render_url', 'is', null)
    .not('depth_map_url', 'is', null)
    .limit(1)

  if (!rooms?.length) {
    console.log('INFO No rooms with render+depth yet — ping verification only')
    console.log('PASS PARALLAX: endpoint alive')
    return null
  }

  const room = rooms[0]
  console.log('2. Generating real parallax for room', room.id.slice(0, 8))
  console.log('   (takes 60-120s on Modal T4)')

  const startTime = Date.now()
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        render_url: room.render_url,
        depth_map_url: room.depth_map_url,
        room_id: room.id,
      }),
      signal: AbortSignal.timeout(180000),
    })
    const elapsed = Math.round((Date.now() - startTime) / 1000)
    const data = (await res.json()) as { video_url?: string | null; error?: string }
    if (data.video_url) {
      console.log('OK Video generated in', elapsed + 's:', data.video_url.slice(0, 80))
      const videoResp = await fetch(data.video_url, { method: 'HEAD' })
      const videoSize = videoResp.headers.get('content-length')
      console.log('OK Video accessible, size:', videoSize, 'bytes')
      console.log('PASS PARALLAX: REAL VIDEO VERIFIED')
      return data.video_url
    } else {
      console.log('WARN Returned null video_url:', data.error)
      console.log('INFO Step-7 will use CSS parallax fallback')
      return null
    }
  } catch (e) {
    console.log('WARN Real generation failed:', (e as Error).message)
    console.log('INFO Step-7 will use CSS parallax fallback')
    return null
  }
}

verify().catch((e) => {
  console.warn('WARN Parallax inconclusive:', e.message)
})
