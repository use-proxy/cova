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

  const { roomId, videoPath } = await request.json()

  const webhookUrl = process.env.MODAL_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json(
      { error: 'Pipeline not configured — MODAL_WEBHOOK_URL not set' },
      { status: 503 }
    )
  }

  // Update room status and video_url
  await supabase
    .from('rooms')
    .update({ status: 'processing', video_url: videoPath })
    .eq('id', roomId)

  // Call Modal webhook (non-blocking — Modal runs async)
  const jobId = `modal_${Date.now()}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_path: videoPath,
        room_id: roomId,
        user_id: user.id,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const body = await res.text()
      console.error('Modal webhook error:', res.status, body)
      await supabase.from('rooms').update({ status: 'error' }).eq('id', roomId)
      return NextResponse.json(
        { error: 'Pipeline failed to start', details: body },
        { status: 500 }
      )
    }

    // Store job ID
    await supabase
      .from('rooms')
      .update({ modal_job_id: jobId })
      .eq('id', roomId)

    return NextResponse.json({ success: true, jobId })
  } catch (err: unknown) {
    clearTimeout(timeout)

    // AbortError means timeout — Modal cold start, treat as submitted
    if (err instanceof Error && err.name === 'AbortError') {
      console.log('Modal webhook timed out (cold start) — treating as submitted')
      await supabase
        .from('rooms')
        .update({ modal_job_id: jobId })
        .eq('id', roomId)
      return NextResponse.json({ success: true, jobId, coldStart: true })
    }

    console.error('Modal webhook call failed:', err)
    await supabase.from('rooms').update({ status: 'error' }).eq('id', roomId)
    return NextResponse.json(
      { error: 'Failed to reach pipeline' },
      { status: 500 }
    )
  }
}
