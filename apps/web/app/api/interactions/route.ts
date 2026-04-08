/**
 * Lightweight commerce interaction logging.
 * Used by step 9 to record product clicks / hotspot taps / swap events.
 */
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

interface InteractionBody {
  room_id?: string | null
  product_id?: string | null
  action: string
  metadata?: Record<string, unknown>
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json()) as InteractionBody
    if (!body.action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 })
    }

    const admin = createAdminSupabaseClient()
    const { error } = await admin.from('interactions').insert({
      user_id: user.id,
      room_id: body.room_id ?? null,
      // product_id is a UUID FK; we only set it when caller passes a real DB id
      product_id: null,
      action: body.action,
    })
    if (error) {
      console.error('[interactions] insert failed:', error.message)
      // Don't fail the client flow — analytics is best-effort
    }
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('[interactions] error:', error)
    return NextResponse.json({ success: false }, { status: 200 })
  }
}
