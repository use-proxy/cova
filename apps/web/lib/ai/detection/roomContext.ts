/**
 * Claude Vision → RoomContext extraction.
 *
 * Produces the structured room-context object that Screen A presents
 * to the user for confirmation.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { RoomContext } from '@/lib/types/area2'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ROOM_CONTEXT_SYSTEM = `You are an expert interior design analyst with a precise eye for architectural detail, materials, and spatial relationships. You are analyzing a room photo to extract structured data that will be used to generate a photorealistic AI redesign. Accuracy and specificity are critical — "light oak hardwood" is correct, "wood floor" is useless. Return ONLY valid JSON. No markdown fences, no explanation, no preamble.`

const ROOM_CONTEXT_SCHEMA = `{
  "roomShape": "rectangular|l-shaped|open-plan|irregular",
  "estimatedDimensions": "approximately WxLft",
  "ceilingHeight": "low|standard-8ft|high|vaulted|coffered",
  "ceilingDetail": "description of ceiling detail",
  "naturalLightDirection": "left|right|front|back|overhead|multiple|minimal",
  "naturalLightQuality": "strong-direct|soft-diffused|minimal|none",
  "windowCount": 0,
  "windowSize": "small-single|medium|large|floor-to-ceiling|multiple-mixed",
  "floorMaterial": "specific material e.g. light oak hardwood",
  "floorColor": "specific color e.g. warm honey",
  "wallColor": "specific color e.g. warm greige — never just beige",
  "hasAccentWall": false,
  "accentWallColor": null,
  "wallTexture": "smooth-matte|smooth-glossy|textured|wallpapered|exposed-brick|paneled",
  "cameraAngle": "eye-level|slightly-elevated|corner-wide|straight-on",
  "focalLength": "wide-angle|standard|slight-telephoto",
  "architecturalFeatures": ["array of specific features present"],
  "dominantColors": ["3-4 descriptive color strings"],
  "colorTemperature": "warm|cool|neutral",
  "existingStyleFingerprint": "one sentence e.g. Current feel: warm transitional with eclectic accents",
  "surfaceTextures": "description of texture variation in the room",
  "aiConfidence": 0.0
}`

export function generateFallbackRoomContext(): RoomContext {
  return {
    roomShape: 'rectangular',
    estimatedDimensions: 'unknown',
    ceilingHeight: 'standard-8ft',
    ceilingDetail: '',
    naturalLightDirection: 'multiple',
    naturalLightQuality: 'soft-diffused',
    windowCount: 1,
    windowSize: 'medium',
    floorMaterial: 'unknown',
    floorColor: 'unknown',
    wallColor: 'unknown',
    hasAccentWall: false,
    wallTexture: 'smooth-matte',
    cameraAngle: 'eye-level',
    focalLength: 'wide-angle',
    architecturalFeatures: [],
    dominantColors: [],
    colorTemperature: 'neutral',
    existingStyleFingerprint: 'Unknown',
    surfaceTextures: '',
    userNotes: '',
    aiConfidence: 0,
  }
}

export async function runRoomContextVision(
  imageUrl: string
): Promise<RoomContext | null> {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: ROOM_CONTEXT_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: imageUrl },
            },
            {
              type: 'text',
              text: `Analyze this room photo and return a JSON object matching exactly this schema:\n${ROOM_CONTEXT_SCHEMA}\n\nBe specific about materials and colors. Never use generic terms. Set aiConfidence to your overall confidence 0-1.`,
            },
          ],
        },
      ],
    })

    const first = response.content[0]
    const text = first && first.type === 'text' ? first.text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean) as Partial<RoomContext>

    // Merge with fallback to guarantee a full RoomContext shape even if
    // Claude drops fields.
    return {
      ...generateFallbackRoomContext(),
      ...parsed,
      userNotes: '',
    }
  } catch (e) {
    console.error(
      '[roomContext] Vision failed:',
      e instanceof Error ? e.message : String(e)
    )
    return null
  }
}
