/**
 * Claude-powered prompt compiler for FLUX Kontext Pro.
 *
 * Takes the full RenderContext JSON and compresses it into an optimized
 * edit prompt. Claude is used here as a coherence layer — it synthesizes
 * across all 10 data sources while respecting a rigid output contract.
 *
 * Every style term Claude emits must be traceable to a dimension value or
 * user preference in the context?. This prevents hallucination of style
 * directions the user didn't choose.
 *
 * Design principle: Claude does NOT describe the existing room. The model
 * sees it via input_image. Claude only describes the desired delta.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { RenderContext } from '@/lib/types/area2'
import type { StyleFingerprint } from '@/types/fingerprint'
import {
  getMaterialPalette,
  buildFullFingerprintPhrase,
  sanitizeForbiddenStyleNames,
} from '@/lib/ai/flux'

const anthropic = new Anthropic()

const SYSTEM_PROMPT = `You are a FLUX Kontext Pro prompt engineer specializing in interior design transformations.

FLUX Kontext Pro is an image EDIT model. It receives the user's actual room photo as input_image and edits it according to your prompt. The model already sees the room at pixel level — walls, floor, ceiling, windows, camera angle, lighting.

YOUR JOB: Write a prompt describing ONLY the desired transformation delta. Never describe the existing room. Never say "preserve" — that is handled separately in a post-processing pass.

OUTPUT CONTRACT (strictly enforced):
- Exactly 200-240 words
- Lead with: "Redesign this [roomType]."
- Second line: "Materials: [3 specific materials from the fingerprint]."
- Then: transformation intent in 2-3 sentences using specific dimension vocabulary
- Then: explicit REPLACE instruction (what categories of items to swap)
- Then: ADD instructions (specific items user requested)
- Then: lighting directive as a transformation (not description of existing)
- Then: constraints (what NOT to do, pets/kids/renting restrictions)
- Then: sensory layer (plants, rugs, textiles, density)
- Then: identity layer (cultural reference, mood, fandoms) if present
- Then: budget quality signal
- End with: "Photorealistic interior photograph, [camera angle from context], [focal length from context], f/8. No people, no text."

RULES:
1. Every style adjective must be traceable to a dimension value in the fingerprint
2. Dimensions with |value - 0.5| < 0.15 contribute NOTHING — skip them
3. Dimensions with |value - 0.5| >= 0.15 MUST appear in the prompt
4. Use SPECIFIC material names, never abstract words like "modern" or "cozy"
5. Lighting instruction = transformation directive, not room description
6. If no sensory/identity data, skip those sections — do not invent
7. Never use these style names: japandi, bohemian, coastal, mid-century modern, minimalist
8. Return ONLY the prompt. No preamble, no explanation, no quotes, no markdown.`

export async function compilePromptWithClaude(
  context: RenderContext | null,
  roomType: string,
  fingerprint: StyleFingerprint,
  anchorPrompt: string | null = null,
): Promise<string | null> {
  try {
    const fp = fingerprint
    const materialPalette = getMaterialPalette(fp.dimensions)
    const fingerprintPhrase = buildFullFingerprintPhrase(fp.dimensions)
    const anchorSystem = anchorPrompt
      ? `\n\nAnchor style reference prompt (high priority): ${anchorPrompt}\nWeight this heavily — it captures the user's confirmed visual preference.`
      : ''

    const compressedContext = {
      roomType,
      fingerprint: {
        dimensions: fp.dimensions,
        confidence: fp.confidence,
        _materialPalette: materialPalette,
        _fingerprintPhrase: fingerprintPhrase,
      },
      roomConstraints: context?.roomConstraints
        ? {
            primaryFunction: context?.roomConstraints.primaryFunction,
            hasPetsOrKids: context?.roomConstraints.hasPetsOrKids,
            storagePriority: context?.roomConstraints.storagePriority,
            wallPermanence: context?.roomConstraints.wallPermanence,
            bestLightTime: context?.roomConstraints.bestLightTime,
            styleDirectionDelta: context?.roomConstraints.styleDirectionDelta,
            offScreenPieces: context?.roomConstraints.offScreenPieces,
            physicalConstraints: context?.roomConstraints.physicalConstraints,
            whoUsesRoom: context?.roomConstraints.whoUsesRoom,
          }
        : null,
      roomContext: context?.roomContext
        ? {
            ceilingHeight: context?.roomContext.ceilingHeight,
            cameraAngle: context?.roomContext.cameraAngle,
            focalLength: context?.roomContext.focalLength,
            naturalLightDirection: context?.roomContext.naturalLightDirection,
            windowCount: context?.roomContext.windowCount,
            architecturalFeatures: context?.roomContext.architecturalFeatures,
          }
        : null,
      keepMask: {
        objects:
          context?.keepMask?.objects
            ?.filter((o) => o.keep || o.immovable)
            ?.map((o) => ({
              type: o.type,
              material: o.material,
              dominantColor: o.dominantColor,
              userNote: o.userNote,
              immovable: o.immovable,
            })) ?? [],
      },
      budget: context?.budget
        ? {
            rangeMin: context?.budget.rangeMin,
            rangeMax: context?.budget.rangeMax,
            strategy: context?.budget.strategy,
          }
        : null,
      budgetReconciled: (() => {
        const explicit = context?.budget
        const tierFromRange = (max: number | undefined): string | null => {
          if (max === undefined || max === null) return null
          if (max <= 2000) return 'budget'
          if (max <= 5000) return 'mid'
          if (max <= 10000) return 'premium'
          return 'luxury'
        }
        if (explicit && (explicit.rangeMin !== undefined || explicit.rangeMax !== undefined)) {
          const min = explicit.rangeMin ?? 0
          const max = explicit.rangeMax
          const tier = tierFromRange(max ?? undefined)
          const rangeStr = max !== undefined && max !== null
            ? `$${min}–$${max}`
            : `$${min}+`
          return tier ? `Budget: ${rangeStr} (${tier} tier)` : `Budget: ${rangeStr}`
        }
        return null
      })(),
      requestedProducts:
        context?.requestedProducts
          ?.filter((p) => p.confirmedByUser)
          ?.slice(0, 4)
          ?.map((p) => ({
            fluxDescription: p.fluxDescription,
            placementIntent: p.placementIntent,
            placementHint: p.placementHint,
          })) ?? [],
      artBrief: context?.artBrief?.hasArtDirection
        ? {
            visualDirection: context?.artBrief.visualDirection,
            frameStyle: context?.artBrief.frameStyle,
            galleryWall: context?.artBrief.galleryWall,
            hasVinylCollection: context?.artBrief.hasVinylCollection,
            hasBookCollection: context?.artBrief.hasBookCollection,
          }
        : null,
      techSpec: context?.techSpec?.hasTV
        ? {
            hasTV: context?.techSpec.hasTV,
            tvSizeInches: context?.techSpec.tvSizeInches,
            tvMountType: context?.techSpec.tvMountType,
            tvPlacementWall: context?.techSpec.tvPlacementWall,
            hasWorkFromHome: context?.techSpec.hasWorkFromHome,
            wfhSetup: context?.techSpec.wfhSetup,
          }
        : null,
      sensoryProfile: context?.sensoryProfile
        ? {
            throwCushionDensity: context?.sensoryProfile.throwCushionDensity,
            plantPresence: context?.sensoryProfile.plantPresence,
            plantSpecies: context?.sensoryProfile.plantSpecies,
            hasRug: context?.sensoryProfile.hasRug,
            rugStyle: context?.sensoryProfile.rugStyle,
            rugSize: context?.sensoryProfile.rugSize,
            rugColor: context?.sensoryProfile.rugColor,
            windowTreatments: context?.sensoryProfile.windowTreatments,
            windowTreatmentColor: context?.sensoryProfile.windowTreatmentColor,
            overallDensity: context?.sensoryProfile.overallDensity,
          }
        : null,
      identityBrief: context?.identityBrief
        ? {
            culturalReference: context?.identityBrief.culturalReference,
            culturalReferenceIntensity:
              context?.identityBrief.culturalReferenceIntensity,
            fandoms: context?.identityBrief.fandoms?.slice(0, 2),
            moodKeywords: context?.identityBrief.moodKeywords?.slice(0, 3),
            moodTarget: context?.identityBrief.moodTarget,
            sentimentalObjects: context?.identityBrief.sentimentalObjects?.slice(0, 1),
          }
        : null,
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `Compile a FLUX Kontext Pro edit prompt from this design profile:\n\n${JSON.stringify(
            compressedContext,
            null,
            2,
          )}`,
        },
      ],
      system: SYSTEM_PROMPT + anchorSystem,
    })

    const text = response.content[0]
    if (!text || text.type !== 'text' || !text.text.trim()) return null

    const compiled = text.text.trim()

    const wordCount = compiled.split(/\s+/).length
    if (wordCount < 100 || wordCount > 300) {
      console.warn(
        `[prompt-compiler] Claude output ${wordCount} words — outside 100-300 range, falling back`,
      )
      return null
    }

    return sanitizeForbiddenStyleNames(compiled)
  } catch (err) {
    console.error('[prompt-compiler] Claude compilation failed:', err)
    return null
  }
}
