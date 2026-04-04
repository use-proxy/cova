import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const roomId = searchParams.get('roomId')

  if (!roomId) {
    return NextResponse.json({ error: 'roomId required' }, { status: 400 })
  }

  // Called by Modal when Plus finishes — uses service role key directly
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  await fetch(`${supabaseUrl}/rest/v1/rooms?id=eq.${roomId}`, {
    method: 'PATCH',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plus_upgrade_ready: true,
      plus_completed_at: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(15000),
  })

  return NextResponse.json({ success: true, roomId })
}
