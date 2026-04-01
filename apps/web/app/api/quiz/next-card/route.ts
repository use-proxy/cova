import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { swipes, count = 1 } = await request.json()
  const shownIds = (swipes ?? []).map((s: { card_id: string }) => s.card_id)

  // Try to get cards from room_cards table
  let query = supabase.from("room_cards").select("id, image_url, style_tags")

  if (shownIds.length > 0) {
    query = query.not("id", "in", `(${shownIds.join(",")})`)
  }

  const { data: cards, error } = await query.limit(count)

  if (error || !cards?.length) {
    // Fallback: generate placeholder cards with random picsum images
    const placeholders = Array.from({ length: count }, (_, i) => ({
      id: `placeholder-${Date.now()}-${i}`,
      image_url: `https://picsum.photos/400/500?random=${Date.now() + i}`,
      style_tags: [["modern", "minimalist", "scandinavian", "industrial", "bohemian", "coastal", "mid-century", "traditional"][Math.floor(Math.random() * 8)]],
    }))
    return NextResponse.json({ cards: placeholders })
  }

  return NextResponse.json({ cards })
}
