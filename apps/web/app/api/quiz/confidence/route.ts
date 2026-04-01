import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

interface Swipe {
  card_id: string
  direction: "left" | "right"
  style_tags?: string[]
  timestamp: number
}

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

  const { session_id, swipes } = (await request.json()) as { session_id: string; swipes: Swipe[] }
  const n = swipes.length

  if (n < 8) {
    return NextResponse.json({ confidence: n * 10, complete: false })
  }

  const likedSwipes = swipes.filter((s) => s.direction === "right")
  const tagCounts: Record<string, number> = {}

  likedSwipes.forEach((swipe) => {
    swipe.style_tags?.forEach((tag) => {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
    })
  })

  const total = Object.values(tagCounts).reduce((a, b) => a + b, 0)
  if (total === 0) return NextResponse.json({ confidence: n * 4, complete: false })

  const entropy = Object.values(tagCounts).reduce((sum, count) => {
    const p = count / total
    return sum - p * Math.log2(p)
  }, 0)

  const maxEntropy = Math.log2(Object.keys(tagCounts).length || 1)
  const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0
  const confidence = Math.round((1 - normalizedEntropy) * 60 + 40)

  const complete = confidence >= 85 || n >= 25

  if (complete) {
    const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)
    const styleFingerprint = {
      primary: sortedTags[0]?.[0] ?? "modern",
      secondary: sortedTags[1]?.[0] ?? null,
      tertiary: sortedTags[2]?.[0] ?? null,
      tag_scores: tagCounts,
      total_swipes: n,
      like_rate: likedSwipes.length / n,
    }

    await supabase
      .from("style_sessions")
      .update({
        style_fingerprint: styleFingerprint,
        confidence,
        completed: true,
        swipes,
      })
      .eq("id", session_id)

    return NextResponse.json({ confidence: 100, complete: true, style_fingerprint: styleFingerprint })
  }

  return NextResponse.json({ confidence, complete: false })
}
