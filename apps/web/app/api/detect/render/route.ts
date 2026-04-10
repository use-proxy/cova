/**
 * POST /api/detect/render
 *
 * Runs Claude Vision on a rendered room image to detect furniture items
 * and return bounding boxes as percentages of image dimensions.
 * Writes results to rooms.render_detection_result.
 *
 * Input: { roomId: string }
 * Output: { items: Array<{ label, boundingBox: { x, y, width, height }, confidence }> }
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface DetectedItem {
  label: string
  boundingBox: { x: number; y: number; width: number; height: number }
  confidence: number
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { roomId } = (await request.json()) as { roomId?: string }
  if (!roomId) {
    return NextResponse.json({ error: 'roomId required' }, { status: 400 })
  }

  // Fetch the rendered image URL
  const { data: room } = await supabase
    .from('rooms')
    .select('redesign_pano_url, perspective_render_url')
    .eq('id', roomId)
    .eq('user_id', user.id)
    .single()

  const renderUrl = room?.perspective_render_url ?? room?.redesign_pano_url
  if (!renderUrl) {
    return NextResponse.json({ error: 'No render URL found' }, { status: 404 })
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: renderUrl },
            },
            {
              type: 'text',
              text: `Analyze this interior room photograph and identify every visible furniture item and decor piece.

For each item, return:
- label: simple descriptive name (e.g. "sofa", "coffee table", "floor lamp", "area rug")
- boundingBox: { x, y, width, height } where all values are percentages of image dimensions (0-100)
  - x: left edge percentage from left side of image
  - y: top edge percentage from top of image
  - width: width as percentage of image width
  - height: height as percentage of image height
- confidence: your confidence that this is a real, identifiable furniture item (0.0-1.0)

Return ONLY a JSON object in this exact format:
{ "items": [{ "label": "sofa", "boundingBox": { "x": 10.5, "y": 45.0, "width": 35.0, "height": 25.0 }, "confidence": 0.95 }] }

Be precise with bounding boxes — they should tightly contain each item. Do not include architectural elements (walls, windows, doors, ceiling). Focus on furniture and decor only.`,
            },
          ],
        },
      ],
    })

    const text =
      response.content[0]?.type === 'text' ? response.content[0].text : '{}'
    let parsed: { items: DetectedItem[] }
    try {
      const clean = text.replace(/```json|```/g, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      parsed = { items: [] }
    }

    // Validate and clamp bounding boxes
    const validatedItems = (parsed.items ?? [])
      .filter(
        (item) =>
          item.label &&
          item.boundingBox &&
          typeof item.boundingBox.x === 'number' &&
          typeof item.boundingBox.y === 'number' &&
          typeof item.boundingBox.width === 'number' &&
          typeof item.boundingBox.height === 'number'
      )
      .map((item) => ({
        label: item.label,
        boundingBox: {
          x: Math.max(0, Math.min(100, item.boundingBox.x)),
          y: Math.max(0, Math.min(100, item.boundingBox.y)),
          width: Math.max(1, Math.min(100, item.boundingBox.width)),
          height: Math.max(1, Math.min(100, item.boundingBox.height)),
        },
        confidence: Math.max(0, Math.min(1, item.confidence ?? 0.5)),
      }))

    // Write to Supabase
    await supabase
      .from('rooms')
      .update({ render_detection_result: { items: validatedItems } })
      .eq('id', roomId)

    return NextResponse.json({ items: validatedItems })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[detect/render] Claude Vision failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
