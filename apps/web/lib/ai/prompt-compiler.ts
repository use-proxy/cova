/**
 * Claude-powered prompt compiler for FLUX Kontext Pro.
 *
 * Architecture (v2 — skeleton + synthesizer):
 *
 * Part A — Fixed skeleton: TypeScript-assembled geometry/preservation
 * directives (~60 tokens). Never modified by Claude.
 *
 * Part B — Claude synthesizer: style + material + lighting +
 * personalization (~380-420 tokens). All step-7d fields wired in.
 *
 * Combined target: ~480 tokens total, within FLUX Kontext Pro's 512-token
 * prompt limit. The synthesizer uses claude-sonnet-4-5 specifically.
 *
 * Target output quality: Architectural Digest editorial photography —
 * rooms look idealized and slightly enhanced, every surface specific,
 * lighting dramatic and purposeful.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { RenderContext, RequestedProduct } from "@/lib/types/area2";
import type { StyleFingerprint } from "@/types/fingerprint";
import { sanitizeForbiddenStyleNames } from "@/lib/ai/flux";
import type { RoomArchitecture } from "@/lib/ai/room-analyzer";

const anthropic = new Anthropic();

// ── Token estimation ──────────────────────────────────────────────────────────
// More accurate for descriptive English prose.
// Accounts for punctuation tokens and subword splits.
function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).length;
  const chars = text.length;
  // Words tend to tokenize at ~1.3 tokens/word for descriptive prose
  // with compound adjectives and punctuation overhead.
  return Math.ceil((words * 1.3 + chars * 0.05) / 2);
}

const MAX_DYNAMIC_TOKENS = 380;
const COMPRESSION_TARGET = 360;

// ── Style anchor derivation ───────────────────────────────────────────────────
// Maps internal style blend keys → human-readable anchor labels used in the
// Claude synthesizer's reference quality examples.
const ANCHOR_DISPLAY_NAMES: Record<string, string> = {
  "warm japandi": "Warm & Grounded",
  "pure minimal white": "Pure & Calm",
  "coastal bright": "Light & Airy",
  "biophilic jungle": "Nature & Abundance",
  "dark moody glam": "Bold & Dramatic",
  "heritage traditional": "Classic & Layered",
  "industrial loft": "Raw & Urban",
  "maximalist eclectic": "Bold & Eclectic",
  "retro mid-century": "Vintage Modern",
};

function deriveStyleAnchor(
  fingerprint: StyleFingerprint,
  styleBlend: Record<string, number> | null | undefined,
): string {
  // Try style blend primary key first (most accurate)
  if (styleBlend) {
    const top = Object.entries(styleBlend)
      .filter(([, v]) => typeof v === "number")
      .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0]
      ?.toLowerCase();
    if (top && ANCHOR_DISPLAY_NAMES[top]) return ANCHOR_DISPLAY_NAMES[top]!;
  }
  // Derive from fingerprint dimensions as fallback
  const d = fingerprint.dimensions;
  const dense = (d.density ?? 0.5) > 0.7;
  const natural = (d.material ?? 0.5) > 0.65;
  const warm = (d.colorTemperature ?? 0.5) > 0.65;
  const minimal =
    (d.density ?? 0.5) < 0.3 && (d.colorTemperature ?? 0.5) < 0.4;
  if (dense && natural) return "Bold & Eclectic";
  if (warm && natural) return "Warm & Grounded";
  if (minimal) return "Pure & Calm";
  return "Balanced Contemporary";
}

// ── Claude synthesizer system prompt ─────────────────────────────────────────
// This system prompt drives the style/material/lighting/personalization segment.
// The forbidden word list mirrors CLAUDE.md Hard Rule #8 plus common style labels
// that must never appear in user-facing renders.
const CLAUDE_SYNTHESIZER_SYSTEM = `You are a world-class interior design prompt engineer for FLUX Kontext Pro, a state-of-the-art AI image editing model. Your output will be injected directly into a FLUX prompt that transforms a real room photo into a professional interior design render. The target aesthetic is: Architectural Digest editorial photography. Rooms should look idealized and slightly enhanced compared to reality — perfectly styled, dramatically lit, every surface rich and specific — like a magazine photoshoot of the room at its absolute best. This enhanced quality is intentional.

Your output must cover, in this order:

STYLE MOOD — the emotional atmosphere and color temperature of the space. Be evocative and specific.

MATERIAL PALETTE — name every material specifically. Never say "wood" — say "warm teak with visible grain" or "whitewashed oak." Never say "fabric" — say "bouclé," "linen," "cashmere," "velvet." Never say "stone" — say "honed Carrara marble" or "raw concrete." Derive materials from the style anchor and fingerprint naturalism/texture dimensions.

LIGHTING — name the light source, its quality, and its color temperature. Examples: "warm Edison pendant casting amber pools," "raked afternoon sunlight through sheer linen curtains," "soft north-facing diffused daylight, no harsh shadows." Derive from fingerprint warmth and contrast dimensions.

DECORATION DENSITY AND OBJECTS — derive from the fingerprint density dimension:
- High density (>0.7): name 8-10 specific decorative objects placed intentionally throughout the space
- Medium density (0.4-0.7): name 4-6 specific objects
- Low density (<0.4): name 2-3 objects maximum, each described with precision, negative space emphasized
Objects should feel styled and intentional, not random. Think: how would an AD photographer style this room?

BUDGET QUALITY TIER — translate the user's budget into material quality signals:
- Under $500: accessible but thoughtfully styled, IKEA and Target-level pieces elevated with good lighting and styling
- $500-2000: mid-market quality, West Elm and CB2 aesthetic, investment pieces mixed with accessible items
- Over $2000: designer quality, named brands implied, bespoke details, luxury materials throughout

PERSONALIZATION — incorporate every user input from their 7d tabs. Nothing is dropped. If a field is empty or null, skip it silently. If a field has content, translate it into design language. Examples:
- Art preference "abstract" → "large-scale abstract canvas in [palette-appropriate colors], floating above [furniture]"
- Tech "smart home" → "integrated smart lighting, concealed cable management, minimalist tech presence"
- Sensory "calm, low stimulation" → "muted palette, soft diffused light, no pattern mixing, quiet materiality"
- Identity "avid reader" → "curated book collection on floating shelves, reading nook with task lighting"
- Gaming setup → "discrete gaming station with cable management, accent RGB lighting blended into the room palette"

QUALITY CLOSER — end with exactly: "ultra-detailed, 8K resolution, global illumination, PBR materials, physically accurate shadows and reflections, professional interior staging, slightly idealized and enhanced beyond reality"

Hard rules:
- Output ONLY the prompt text. No explanation, no preamble, no JSON, no section headers. Just the prompt segment.
- Use comma-separated phrases, not full sentences. This is more token-efficient and how diffusion models read prompts.
- Never use these forbidden words: Japandi, Bohemian, Coastal, Minimalist, Mid-Century Modern, Maximalist, Scandinavian, Industrial, Art Deco. Describe the aesthetic with material and sensory language instead.
- Target 380-420 tokens in your output. Count carefully. The skeleton prepended to your output uses ~60 tokens. Stay under 420 to leave margin.
- Every fingerprint dimension above 0.5 must influence the output in some visible way.
- Every non-empty 7d field must appear in the output.
- Never mention camera brands, lens specs, or camera angles — the skeleton handles geometry.
- Never change wall color, wall texture, or floor material — these are fixed anchors in the skeleton.`;

// ── Main compiler ─────────────────────────────────────────────────────────────

export async function compilePromptWithClaude(
  context: RenderContext | null,
  roomType: string,
  fingerprint: StyleFingerprint,
  anchorPrompt: string | null = null,
  _roomAnalysis: RoomArchitecture | null = null,
  chatContext: Record<string, Array<{ role: string; content: string }>> | null = null,
): Promise<string | null> {
  try {
    // ── PART A — Fixed skeleton (~60 tokens) ──────────────────────────────
    // Assembled entirely in TypeScript. Never modified by Claude.
    // Contains: photographic framing, geometry preservation, keep/remove directives.
    const keepItems =
      context?.keepMask?.objects
        ?.filter((o) => o.keep || o.immovable)
        .map((o) => o.type) ?? [];
    const removeItems =
      context?.keepMask?.objects
        ?.filter((o) => !o.keep && !o.immovable)
        .map((o) => o.type) ?? [];

    const skeleton = [
      `Interior design photography, Sony A7R V 24mm f/2.8 lens, architectural perspective, ${roomType}.`,
      `Keep exact room geometry, window positions, ceiling height, floor material, walls, and camera angle from the original photo.`,
      keepItems.length > 0
        ? `Keep exactly as-is: ${keepItems.join(", ")}.`
        : "",
      removeItems.length > 0
        ? `Remove: ${removeItems.join(", ")}. Replace with style-appropriate alternatives.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    // ── PART B — Claude synthesizer ───────────────────────────────────────
    // Build userContext with ALL step-7d fields wired in.
    // Previously-dropped fields (art.colorPalette, tech.gamingSetup, sensory.hasCandles,
    // identity.interests, budget.strategy, etc.) are now included.
    const styleAnchor = deriveStyleAnchor(
      fingerprint,
      context?.styleBlend ?? context?.style_blend,
    );

    const userContext = {
      roomType,
      styleAnchor,
      fingerprint: {
        dimensions: fingerprint.dimensions,
        confidence: fingerprint.confidence,
      },
      keepItems,
      removeItems,
      budget: context?.budget
        ? {
            min: context.budget.rangeMin,
            max: context.budget.rangeMax,
            strategy: context.budget.strategy,
            splurgeCategory: context.budget.splurgeCategory ?? null,
            tier: context.budget.tier ?? null,
          }
        : null,
      // ALL Art tab fields — previously: colorPalette, mood, abstractionLevel,
      // subjectMatter, placement, includesPersonalPhotos were dropped
      art: context?.artBrief
        ? {
            hasArtDirection: context.artBrief.hasArtDirection,
            visualDirection: context.artBrief.visualDirection || null,
            colorPalette: context.artBrief.colorPalette?.length
              ? context.artBrief.colorPalette
              : null,
            mood: context.artBrief.mood || null,
            abstractionLevel: context.artBrief.abstractionLevel || null,
            subjectMatter: context.artBrief.subjectMatter || null,
            frameStyle: context.artBrief.frameStyle || null,
            placement: context.artBrief.placement || null,
            galleryWall: context.artBrief.galleryWall,
            hasVinylCollection: context.artBrief.hasVinylCollection,
            hasBookCollection: context.artBrief.hasBookCollection,
            includesPersonalPhotos:
              context.artBrief.includesPersonalPhotos || null,
          }
        : null,
      // ALL Tech tab fields — previously: hasGamingSetup, gamingSetup, otherTech were dropped
      tech: context?.techSpec
        ? {
            hasTV: context.techSpec.hasTV,
            tvSizeInches: context.techSpec.tvSizeInches ?? null,
            tvMountType: context.techSpec.tvMountType ?? null,
            tvPlacementWall: context.techSpec.tvPlacementWall ?? null,
            audioSetup: context.techSpec.audioSetup ?? null,
            smartLighting: context.techSpec.smartLighting,
            lightingType: context.techSpec.lightingType ?? null,
            hasWorkFromHome: context.techSpec.hasWorkFromHome,
            wfhSetup: context.techSpec.wfhSetup ?? null,
            hasGamingSetup: context.techSpec.hasGamingSetup,
            gamingSetup: context.techSpec.gamingSetup ?? null,
            otherTech: context.techSpec.otherTech ?? null,
          }
        : null,
      // ALL Sensory tab fields — previously: throwStyle, hasCandles, candleStyle,
      // hasDiffuser were dropped
      sensory: context?.sensoryProfile
        ? {
            throwCushionDensity: context.sensoryProfile.throwCushionDensity,
            throwStyle: context.sensoryProfile.throwStyle ?? null,
            plantPresence: context.sensoryProfile.plantPresence,
            plantSpecies: context.sensoryProfile.plantSpecies?.length
              ? context.sensoryProfile.plantSpecies
              : null,
            hasCandles: context.sensoryProfile.hasCandles,
            candleStyle: context.sensoryProfile.candleStyle ?? null,
            hasRug: context.sensoryProfile.hasRug,
            rugSize: context.sensoryProfile.rugSize ?? null,
            rugStyle: context.sensoryProfile.rugStyle ?? null,
            rugColor: context.sensoryProfile.rugColor ?? null,
            windowTreatments: context.sensoryProfile.windowTreatments,
            windowTreatmentColor:
              context.sensoryProfile.windowTreatmentColor ?? null,
            hasDiffuser: context.sensoryProfile.hasDiffuser,
            overallDensity: context.sensoryProfile.overallDensity,
          }
        : null,
      // ALL Identity tab fields — previously: fandomTreatment, interests,
      // personalityTags were dropped
      identity: context?.identityBrief
        ? {
            culturalReference:
              context.identityBrief.culturalReference ?? null,
            culturalReferenceIntensity:
              context.identityBrief.culturalReferenceIntensity ?? null,
            fandoms: context.identityBrief.fandoms?.length
              ? context.identityBrief.fandoms
              : null,
            fandomTreatment: context.identityBrief.fandomTreatment ?? null,
            interests: context.identityBrief.interests?.length
              ? context.identityBrief.interests
              : null,
            sentimentalObjects:
              context.identityBrief.sentimentalObjects?.length
                ? context.identityBrief.sentimentalObjects
                : null,
            moodTarget: context.identityBrief.moodTarget || null,
            moodKeywords: context.identityBrief.moodKeywords?.length
              ? context.identityBrief.moodKeywords
              : null,
            personalityTags: context.identityBrief.personalityTags?.length
              ? context.identityBrief.personalityTags
              : null,
          }
        : null,
      products:
        context?.requestedProducts
          ?.filter((p) => p.confirmedByUser)
          .slice(0, 4)
          .map((p: RequestedProduct) => ({
            name: p.scrapedData?.name ?? p.originalInput,
            description: p.fluxDescription,
            placement: p.placementIntent,
            placementHint: p.placementHint ?? null,
          })) ?? [],
      roomConstraints: context?.roomConstraints
        ? {
            wallPermanence: context.roomConstraints.wallPermanence,
            physicalConstraints:
              context.roomConstraints.physicalConstraints ?? [],
            bestLightTime: context.roomConstraints.bestLightTime,
            roomSize: context.roomConstraints.roomSize,
            whoUsesRoom: context.roomConstraints.whoUsesRoom ?? [],
            primaryFunction: context.roomConstraints.primaryFunction ?? [],
            hasPetsOrKids: context.roomConstraints.hasPetsOrKids,
            storagePriority: context.roomConstraints.storagePriority,
            offScreenPieces: context.roomConstraints.offScreenPieces || null,
            styleDirectionDelta:
              context.roomConstraints.styleDirectionDelta ?? null,
          }
        : null,
    };

    // Inner callClaude helper — returns the text content or null on failure
    const callClaude = async (
      system: string,
      userMessage: string,
    ): Promise<string | null> => {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 700,
        system,
        messages: [{ role: "user", content: userMessage }],
      });
      const block = response.content[0];
      if (!block || block.type !== "text" || !block.text.trim()) return null;
      return block.text.trim();
    };

    // Reference quality examples for the synthesizer.
    // Uses anchorPrompt (fetched style reference) when available;
    // otherwise provides curated examples to calibrate quality level.
    const referenceSection = anchorPrompt
      ? `Style reference anchor (incorporate this visual direction, apply to vacated zones only): ${anchorPrompt}`
      : `Reference quality target — choose the closest match to the user's styleAnchor and produce a prompt at that quality level:

Dark moody office: navy walls with deep shadow pooling, warm brass desk lamp catching light precisely, tufted green leather chair, Persian rug, stacked books, editorial photoshoot quality, every object placed with intent
Warm naturalistic bedroom: platform bed in white oak, single washi paper pendant, cherry blossom branch in ceramic vase, sheer linen curtains diffusing warm afternoon light, serenity through absence, 2-3 objects maximum
Biophilic bathroom: cascading live tropical plants from ceiling and walls, wabi-sabi concrete surfaces, round teak-framed mirror, freestanding stone resin tub, diffused overhead light through plant canopy
Raw urban office: exposed brick with visible mortar detail, concrete floor with matte sheen, matte black steel shelving, warm Edison bulb against cool daylight from factory windows, sparse but deliberate — 4-5 purposeful objects
Victorian bedroom: carved mahogany four-poster bed, Persian rug with visible weave, candelabra wall sconces casting warm amber light, oil painting above fireplace, rich layered textiles, every surface textured and specific
Coastal kitchen: brilliant white shiplap, powder blue cabinetry, brass farmhouse fixtures, marble counters, abundant potted herbs and greenery, crisp overexposed natural light, open shelving with styled dishware`;

    // Optional chat context injection
    const chatSuffix =
      chatContext && Object.keys(chatContext).length > 0
        ? `\n\nAdditional user preferences from chat (extract any TV, plant, lighting, density, or material mentions and incorporate):\n${JSON.stringify(chatContext, null, 2)}`
        : "";

    const userMessage = `Here is the complete user context for this render. Produce the FLUX prompt segment now.

User context:
${JSON.stringify(userContext, null, 2)}

${referenceSection}${chatSuffix}

Produce the prompt segment now. No preamble.`;

    // First synthesis pass
    let claudeOutput = await callClaude(CLAUDE_SYNTHESIZER_SYSTEM, userMessage);
    if (!claudeOutput) {
      console.warn("[prompt-compiler] Claude synthesizer returned empty output");
      return null;
    }

    // Iterative refinement loop — max 2 passes if over token budget
    let refinementPasses = 0;
    while (
      estimateTokens(claudeOutput) > MAX_DYNAMIC_TOKENS &&
      refinementPasses < 2
    ) {
      refinementPasses++;
      console.warn(
        `[prompt-compiler] Refinement pass ${refinementPasses} — estimated ${estimateTokens(claudeOutput)} tokens, target ${MAX_DYNAMIC_TOKENS}`,
      );

      const compressionSystem = `You are a token-reduction engine for FLUX diffusion prompts.
Rules — no exceptions:
1. Output ONLY comma-separated noun phrases and adjective pairs. Zero full sentences. Zero bridging words like 'with', 'featuring', 'showcasing', 'creating', 'providing', 'offering'.
2. Every comma-separated item must be 4 words or fewer.
   BAD: 'teak platform bed with pronounced grain patterns hand-rubbed oil finish luminous depth'
   GOOD: 'teak platform bed, pronounced grain, hand-rubbed oil finish, luminous depth'
3. Remove ALL of these word categories:
   - Present participles ending in -ing used as filler (casting, transitioning, accentuating, prioritizing)
   - Abstract nouns: atmosphere, methodology, precision, refinement, character, behavior, development
   - Redundant qualifiers: 'slightly', 'deeply', 'truly', 'carefully', 'intentional'
4. Preserve every named object, every named material, every named color, every piece of user personalization. Nothing that encodes user intent is removable.
5. Target: ${COMPRESSION_TARGET} tokens. Count words × 1.3 to estimate. Stop adding content when you hit target.`;

      const compressed = await callClaude(
        compressionSystem,
        `Rewrite this FLUX prompt segment to ${COMPRESSION_TARGET} tokens using only comma-separated phrases of 4 words or fewer. Preserve every named object and material. Remove all filler language.

Current segment:
${claudeOutput}

Output only the rewritten prompt. No explanation.`,
      );

      if (compressed) {
        claudeOutput = compressed;
      } else {
        break;
      }
    }

    // Log warning if still over after refinement — a slightly long prompt
    // is better than a truncated one; FLUX handles slight overages gracefully
    if (estimateTokens(claudeOutput) > MAX_DYNAMIC_TOKENS) {
      console.warn(
        `[prompt-compiler] Prompt still ~${estimateTokens(claudeOutput)} tokens after ${refinementPasses} refinement pass(es). Proceeding — slight overage acceptable.`,
      );
    }

    // Assemble final prompt: skeleton (Part A) + synthesizer output (Part B)
    const finalPrompt = `${skeleton} ${claudeOutput}`;

    // Development mode: log the full assembled prompt for inspection
    if (process.env.NODE_ENV !== "production") {
      const skelTokens = estimateTokens(skeleton);
      const dynTokens = estimateTokens(claudeOutput);
      const totalTokens = estimateTokens(finalPrompt);
      console.log("[prompt-compiler] ── FULL ASSEMBLED PROMPT ──");
      console.log(finalPrompt);
      console.log(
        `[prompt-compiler] Token estimate — skeleton: ${skelTokens} | dynamic: ${dynTokens} | total: ${totalTokens}`,
      );
    }

    return sanitizeForbiddenStyleNames(finalPrompt);
  } catch (err) {
    console.error("[prompt-compiler] Claude compilation failed:", err);
    return null;
  }
}
