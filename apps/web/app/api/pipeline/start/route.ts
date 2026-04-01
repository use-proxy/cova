import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore in route handlers
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { roomId } = await request.json()
  if (!roomId) {
    return NextResponse.json({ error: 'roomId required' }, { status: 400 })
  }

  // Update room status
  await supabase
    .from('rooms')
    .update({ status: 'processing', redesign_status: 'queued' })
    .eq('id', roomId)

  // Trigger Stage 1: Marble Mini (video → pano)
  // Each stage's webhook updates redesign_status in Supabase.
  // The processing page polls for status changes.
  // Stage transitions are triggered by a background orchestrator.
  const marbleWebhook = process.env.MARBLE_PIPELINE_WEBHOOK_URL
  if (marbleWebhook) {
    triggerWebhook(marbleWebhook, roomId, user.id)
  }

  // Background orchestrator: polls DB and triggers subsequent stages
  orchestratePipeline(roomId, user.id).catch((err) =>
    console.error('[pipeline] Orchestrator error:', err)
  )

  return NextResponse.json({ success: true, roomId })
}

function triggerWebhook(url: string, roomId: string, userId: string) {
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: roomId, user_id: userId }),
  }).catch((err) => console.error(`[pipeline] Webhook failed: ${err}`))
}

async function waitForStatus(
  roomId: string,
  targetStatuses: string[],
  timeoutMs: number = 900000
): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/rooms?id=eq.${roomId}&select=redesign_status`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    )
    const data = await resp.json()
    const status = data[0]?.redesign_status
    if (targetStatuses.includes(status)) return status
    if (status === 'error') throw new Error('Pipeline error')
    await new Promise((r) => setTimeout(r, 5000))
  }
  throw new Error(`Timeout waiting for: ${targetStatuses.join(', ')}`)
}

async function orchestratePipeline(roomId: string, userId: string) {
  try {
    // Stage 1 already triggered above. Wait for it.
    await waitForStatus(roomId, ['pano_ready', 'reconstruction_complete'])

    // Stage 2: FLUX Kontext redesign
    const redesignUrl = process.env.REDESIGN_PIPELINE_WEBHOOK_URL
    if (redesignUrl) {
      triggerWebhook(redesignUrl, roomId, userId)
    }
    await waitForStatus(roomId, ['kontext_complete'])

    // Stage 3: Marble Plus 3D lift
    const plusUrl = process.env.MARBLE_PLUS_WEBHOOK_URL
    if (plusUrl) {
      triggerWebhook(plusUrl, roomId, userId)
    }
    await waitForStatus(roomId, ['marble_plus_complete'])

    // Stage 4: Furniture matching
    const matchUrl = process.env.FURNITURE_MATCHING_WEBHOOK_URL
    if (matchUrl) {
      triggerWebhook(matchUrl, roomId, userId)
    }
    await waitForStatus(roomId, ['complete'])
  } catch (err) {
    console.error('[pipeline] Stage failed:', err)
    // Error status is set by individual stage webhooks
  }
}
