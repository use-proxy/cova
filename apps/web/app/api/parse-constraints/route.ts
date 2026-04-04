import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

const anthropic = new Anthropic()

interface ParseConstraintsBody {
  text: string
  room_type?: string
}

interface ParsedConstraints {
  constraints: string[]
  inclusions: string[]
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = checkRateLimit(user.id, 'parse-constraints')
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retry_after: rateLimit.retryAfterSeconds },
        { status: 429 }
      )
    }

    const body = (await request.json()) as ParseConstraintsBody
    const { text, room_type } = body

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    const systemPrompt = `You are an interior design assistant. Parse user input into structured constraints and inclusions.
Constraints = things to AVOID or REMOVE (e.g. "no dark colors", "remove the old couch").
Inclusions = things to ADD or KEEP (e.g. "add plants", "keep the rug").
Return ONLY valid JSON. No markdown, no explanation.`

    const userPrompt = `Parse this interior design request for a ${room_type ?? 'room'}:
"${text}"

Return JSON: { "constraints": string[], "inclusions": string[] }`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const responseText =
      message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'

    let parsed: ParsedConstraints
    try {
      parsed = JSON.parse(responseText) as ParsedConstraints
    } catch {
      parsed = { constraints: [], inclusions: [] }
    }

    return NextResponse.json({
      constraints: parsed.constraints ?? [],
      inclusions: parsed.inclusions ?? [],
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
