import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get("session_id")

  if (!sessionId) {
    return NextResponse.json({ render_url: null }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from("render_sessions")
    .select("render_url")
    .eq("id", sessionId)
    .single()

  if (error || !data) {
    return NextResponse.json({ render_url: null })
  }

  return NextResponse.json({ render_url: data.render_url ?? null })
}
