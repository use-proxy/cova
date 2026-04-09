import { GoogleGenerativeAI } from '@google/generative-ai'

// ── Gemini room analyzer ──────────────────────────────────────────────────────
// Before every render, Gemini 2.5 Flash extracts a precise description of the
// room's permanent architectural elements. That description is injected into
// the FLUX Kontext Pro prompt so the redesign preserves the actual walls,
// ceiling, floor, windows, camera angle and any fixed decor the user has.
//
// This is the core of Cova's "your room, redesigned" promise — the model must
// be told explicitly what to keep, because Kontext is an edit model that
// weights the opening of the prompt most heavily.

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

export interface RoomArchitecture {
  wallColors: string
  floorType: string
  ceiling: string
  windows: string
  cameraAngle: string
  roomDimensions: string
  fixedElements: string[]
  lightingCondition: string
}

export async function analyzeRoomArchitecture(
  imageUrl: string,
): Promise<RoomArchitecture> {
  try {
    const resp = await fetch(imageUrl)
    if (!resp.ok) throw new Error('Image fetch failed: ' + resp.status)
    const buffer = await resp.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mimeType = resp.headers.get('content-type') ?? 'image/jpeg'

    const prompt = `Analyze this room photo and describe its permanent architectural features in precise detail. Return ONLY a JSON object.

{
  "wallColors": "exact color and finish of walls",
  "floorType": "floor material and color",
  "ceiling": "ceiling description including any fixtures like fans or lights",
  "windows": "number, position and size of windows with any coverings",
  "cameraAngle": "describe the camera position and viewing angle",
  "roomDimensions": "estimated room size and shape",
  "fixedElements": ["list", "of", "permanent", "architectural", "elements"],
  "lightingCondition": "natural/artificial light description"
}

Be extremely specific and precise. This description will be used to ensure these elements are preserved exactly in a redesigned version.`

    const result = await model.generateContent([
      { inlineData: { mimeType, data: base64 } },
      prompt,
    ])

    const text = result.response.text().trim()
    const cleaned = text.replace(/```json|```/g, '').trim()
    return JSON.parse(cleaned) as RoomArchitecture
  } catch (err) {
    console.error('[room-analyzer] Analysis failed:', err)
    // Safe fallback — render still works, just with a generic preservation hint
    return {
      wallColors: 'existing wall colors',
      floorType: 'existing floor',
      ceiling: 'existing ceiling',
      windows: 'existing windows',
      cameraAngle: 'existing camera angle',
      roomDimensions: 'existing room dimensions',
      fixedElements: [],
      lightingCondition: 'existing lighting',
    }
  }
}

export function buildPreservationInstructions(
  arch: RoomArchitecture,
): string {
  const fixed =
    arch.fixedElements.length > 0
      ? `, ${arch.fixedElements.join(', ')}`
      : ''

  return (
    `PRESERVE EXACTLY WITHOUT ANY CHANGES: ` +
    `${arch.wallColors}, ${arch.floorType}, ${arch.ceiling}, ` +
    `${arch.windows}, camera angle (${arch.cameraAngle}), ` +
    `room layout and proportions, ${arch.lightingCondition}${fixed}. ` +
    `This must look like the same physical room.`
  )
}
