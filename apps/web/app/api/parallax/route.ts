import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// TODO: Deploy modal_functions/depthflow_render.py to Modal, then replace
// this stub with a real call to the deployed function URL.
//
// The Modal function generates a parallax MP4 from a render image + depth map.
// Until deployed, this returns { video_url: null } — the step-7 UI handles
// null gracefully by skipping the video phase and showing the before/after
// comparison directly.

export async function POST(req: NextRequest) {
  // Auth check — protected route
  const supabase = await createServerSupabaseClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Validate request body
  let body: { render_url?: string; depth_map_url?: string; room_id?: string }
  try {
    body = (await req.json()) as {
      render_url?: string
      depth_map_url?: string
      room_id?: string
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { render_url, depth_map_url, room_id } = body
  if (!render_url || !depth_map_url || !room_id) {
    return NextResponse.json(
      { error: 'render_url, depth_map_url, and room_id are required' },
      { status: 400 }
    )
  }

  // Stub: Modal depthflow_render function not yet deployed.
  // When ready, call the Modal HTTP endpoint with render_url + depth_map_url,
  // then store the resulting video in room-videos/{room_id}/parallax.mp4
  // and return { video_url: <public_url> }.
  return NextResponse.json({ video_url: null })
}
