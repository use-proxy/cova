/**
 * Claude-powered prompt compiler for FLUX Kontext Pro.
 *
 * Strategy: kept items are framed as ANCHORS (not "preserve the X"),
 * removed items are framed as VACATED ZONES, and the main instruction
 * is change-focused. Every prompt ends with an explicit final anchor
 * constraint. See Rules 1-4 in SYSTEM_PROMPT_TEMPLATE.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { RenderContext, RequestedProduct } from "@/lib/types/area2";
import type { StyleFingerprint } from "@/types/fingerprint";
import {
  getMaterialPalette,
  buildFullFingerprintPhrase,
  sanitizeForbiddenStyleNames,
} from "@/lib/ai/flux";
import type { RoomArchitecture } from "@/lib/ai/room-analyzer";

const anthropic = new Anthropic();

// Map internal anchor style labels → safe "replacement direction" adjective
// used to seed vacated-zone bullets (Rule 2) without leaking forbidden names.
const STYLE_DIRECTION_MAP: Record<string, string> = {
  "warm japandi": "japandi-appropriate",
  "pure minimal white": "minimalist",
  "coastal bright": "coastal",
  "biophilic jungle": "biophilic",
  "dark moody glam": "moody glam",
  "heritage traditional": "heritage traditional",
  "industrial loft": "industrial",
  "maximalist eclectic": "maximalist eclectic",
  "retro mid-century": "mid-century",
};

function deriveReplacementDirection(
  blend: Record<string, number> | null | undefined,
): string {
  if (!blend) return "contemporary";
  const top = Object.entries(blend)
    .sort((a, b) => b[1] - a[1])[0]?.[0]
    ?.toLowerCase();
  if (!top) return "contemporary";
  return STYLE_DIRECTION_MAP[top] ?? "contemporary";
}

function deriveReplacementDirectionFromDimensions(
  dimensions: Record<string, number>,
): string {
  const parts: string[] = [];
  const colorTemp = dimensions.colorTemperature ?? 0.5;
  const density = dimensions.density ?? 0.5;
  const era = dimensions.era ?? 0.5;
  const pattern = dimensions.pattern ?? 0.5;
  const material = dimensions.material ?? 0.5;
  const culturalInfluence = dimensions.culturalInfluence ?? 0.5;

  // Color temperature — mutually exclusive
  if (colorTemp < 0.35) parts.push("cool slate and sage toned");
  else if (colorTemp > 0.65) parts.push("warm amber and terracotta toned");

  // Density
  if (density > 0.7) parts.push("richly layered");
  else if (density < 0.3) parts.push("spare and minimal");

  // Pattern
  if (pattern > 0.7) parts.push("pattern-rich");
  else if (pattern < 0.3) parts.push("pattern-free");

  // Era
  if (era < 0.35) parts.push("heritage and vintage-inflected");
  else if (era > 0.65) parts.push("contemporary clean-lined");

  // Material
  if (material > 0.65) parts.push("natural organic");
  else if (material < 0.35) parts.push("sleek manufactured");

  // Cultural
  if (culturalInfluence > 0.65) parts.push("globally eclectic");

  return parts.length > 0 ? parts.join(", ") : "contemporary";
}

const SYSTEM_PROMPT_TEMPLATE = `You are an elite FLUX Kontext Pro prompt engineer specializing in photorealistic interior design transformations.

FLUX Kontext Pro is an image EDIT model. It receives the user's actual room photo as input_image and edits it in-place. Its default behavior is PRESERVATION — it only changes what the prompt explicitly targets. CRITICAL: Never instruct FLUX to change the camera angle, viewpoint, focal length, or room perspective. The camera is always locked to the original photo exactly.

THE FOUR RULES (mandatory, every time):

RULE 1 — KEPT ITEMS ARE ANCHORS (never "preserve the X").
After the transformation sentence, emit a block titled exactly:
  "Anchoring pieces — treat these as fixed. Do not alter their color, material, form, or position:"
List each kept item as ONE bullet using ALL enriched fields (dominantColor, material, sizeInRoom, styleDescriptors, userNote). Example:
  • The existing cream linen sofa — low-profile silhouette, tufted back, tapered oak legs, large — is the primary anchor. Every new element must complement it.
Never invent descriptors. If only label is known: "• The existing [label] is an anchor — do not alter its color, material, form, or position."
For large kept items (sizeInRoom === "large"), append: "[label] is the PRIMARY ANCHOR and the most important fixed element in this room. Every design decision must harmonize with it."
If floorMaterial is present in roomContext, add a floor anchor bullet: "• The existing [floorMaterial] flooring is a fixed anchor — do not replace it with hardwood, tile, or any other material."
ALWAYS add a wall anchor bullet: "• The existing wall color and wall surfaces are fixed anchors — do not repaint, recolor, add wallpaper, or change wall texture in any zone." If wallColor is provided in roomContext or roomAnalysis, name the specific color.

RULE 2 — REMOVED ITEMS ARE VACATED ZONES (never just "remove the X").
After anchors, emit a block titled exactly:
  "Vacated zones — redesign these areas completely:"
For EACH vacated zone write 2-3 sentences specifying: (a) exact replacement piece with specific material and finish name, (b) spatial relationship to anchors, (c) one layered styling detail. Example:
  • Desk zone: introduce a solid white oak writing desk with hairpin legs — positioned flush against the wall. Style with a ceramic table lamp in warm terracotta, a stack of 3 linen-spined art books, and a trailing pothos in a matte black pot.
  • Office chair zone: replace with a curved bouclé accent chair in warm ivory with a chunky knit throw in oatmeal draped over one arm.

RULE 3 — TRANSFORMATION SENTENCE IS CHANGE-FOCUSED.
Open with what CHANGES. Name every vacated zone explicitly. Never write "redesign while preserving."

RULE 4 — FINAL ANCHOR CONSTRAINT (last sentence always).
"Final constraint: [kept item labels] must appear identical to the input image — same position, color, material, and form. Only the vacated zones are to be redesigned."

OUTPUT CONTRACT (strictly enforced):
- 100-1400 words.
- Section order:
  1. Transformation sentence [Rule 3]
  2. Anchoring pieces block [Rule 1]
  3. Vacated zones block [Rule 2] — for EACH vacated zone write exactly:
     (a) Primary furniture piece — name, exact material with trade name, finish, approximate dimensions
     (b) One secondary accent piece
     (c) Decor cluster — 3+ objects with species/material names (e.g. fiddle leaf fig, hand-thrown stoneware, linen-spined books)
     (d) Spatial relationship to anchors
     Fewer than 4 elements per zone = failure. Be generous. More is more.
  4. Materials line: "New materials: [3-5 specific trade-name materials e.g. rift-sawn white oak, honed travertine, bouclé, brushed brass, jute]"
  5. Decor layering: "Layer with: [specific decorative objects — ceramic vessels, art books, plants with species, textiles, trays]" — always include at least one plant, one textile, one vessel
  6. Structural context — ceiling, fixtures, flooring, natural light. Always include: "Wall color: [wallColor] — fixed, do not alter."
  7. Requested products (if present)
  8. Tech spec / art / sensory (if present)
  9. Budget line (if present)
  10. Style reference directive (if anchorPrompt present)
  11. Rule 4 final constraint
  12. Closer: "Photorealistic interior photograph, same camera angle as the input image. No people, no text."

HARD RULES:
1. Use SPECIFIC material names — "hand-knotted wool kilim" not "rug", "rattan cane-back" not "chair", "smoked oak veneer" not "wood", "aged brass" not "metal", "crinkled linen" not "fabric".
2. Every fingerprint dimension with |value - 0.5| >= 0.15 MUST appear as a concrete material, pattern, or object choice. High density (>0.7) means at least 10 distinct objects in the render. High pattern (>0.7) means visible textile patterns, wallpaper, or printed cushions.
3. MINIMUM DECOR REQUIREMENT: Every render must contain — at minimum — 3 plants (name species: fiddle leaf fig, trailing pothos, snake plant, olive tree, etc.), 2 textile layers (throw + cushions or curtains + rug), 1 vessel cluster (3 objects of graduated height), 1 stack of books, 1 piece of wall art. If the user's density dimension > 0.7, double all of these.
4. NEVER change the floor material. State it explicitly as an anchor in the anchoring pieces block.
5. NEVER use camera model names. NEVER change viewpoint.
6. NEVER use forbidden style names verbatim: warm japandi, pure minimal white, coastal bright, biophilic jungle, dark moody glam, heritage traditional, industrial loft, maximalist eclectic, retro mid-century. Use _replacementDirection instead.
7. Never fabricate kept item descriptors.
8. Return ONLY the prompt. No preamble, no markdown.
9. NEVER include camera brand names (Canon, Sony, Nikon, Leica) or lens specs (35mm f/1.8) — these cause FLUX to reframe the shot.
10. NEVER change the floor material — state it explicitly as a fixed anchor.
11. The bed (or primary large kept item) is the PRIMARY ANCHOR — state this prominently and repeat it in the final constraint.
12. Specify warm 2700K lamp lighting if lightPreference < 0.4, bright diffused daylight if lightPreference > 0.6.
13. NEVER change wall color, wall texture, or ceiling color. These are always fixed anchors regardless of the fingerprint color direction. Color direction applies ONLY to furniture, textiles, and decorative objects.
14. NEVER suggest painting walls or adding wallpaper unless roomConstraints.wallPermanence === "own-anything-goes" AND the user explicitly requested it in chat_context.`;

export async function compilePromptWithClaude(
  context: RenderContext | null,
  roomType: string,
  fingerprint: StyleFingerprint,
  anchorPrompt: string | null = null,
  roomAnalysis: RoomArchitecture | null = null,
  chatContext: Record<string, Array<{ role: string; content: string }>> | null = null,
): Promise<string | null> {
  try {
    const fp = fingerprint;
    const materialPalette = getMaterialPalette(fp.dimensions);
    const fingerprintPhrase = buildFullFingerprintPhrase(fp.dimensions);
    const anchorSystem = anchorPrompt
      ? `\n\nAnchor style reference prompt (high priority): ${anchorPrompt}\nWeight this heavily — it captures the user's confirmed visual preference, but apply it only to the vacated zones, never to the anchoring pieces.`
      : "";

    // Derive replacement direction from real fingerprint dimensions (more accurate than style_blend)
    const replacementDirection = fp.dimensions
      ? deriveReplacementDirectionFromDimensions(fp.dimensions)
      : deriveReplacementDirection(context?.styleBlend ?? context?.style_blend ?? null);

    const keptObjects =
      context?.keepMask?.objects?.filter((o) => o.keep || o.immovable) ?? [];
    const removedObjects =
      context?.keepMask?.objects?.filter((o) => !o.keep && !o.immovable) ?? [];

    const compressedContext = {
      roomType,
      _replacementDirection: replacementDirection,
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
            ceilingDetail: context?.roomContext.ceilingDetail,
            cameraAngle: context?.roomContext.cameraAngle,
            focalLength: context?.roomContext.focalLength,
            naturalLightDirection: context?.roomContext.naturalLightDirection,
            windowCount: context?.roomContext.windowCount,
            architecturalFeatures: context?.roomContext.architecturalFeatures,
            floorMaterial: context?.roomContext.floorMaterial,
            wallColor: context?.roomContext.wallColor,
            hasAccentWall: context?.roomContext.hasAccentWall,
            userNotes: context?.roomContext.userNotes,
          }
        : null,
      keepMask: {
        anchoringPieces: keptObjects.map((o) => ({
          label: o.type,
          dominantColor: o.dominantColor ?? null,
          material: o.material ?? null,
          sizeInRoom: o.sizeInRoom ?? null,
          styleDescriptors: o.styleDescriptors ?? null,
          userNote: o.userNote ?? null,
          immovable: o.immovable,
        })),
        vacatedZones: removedObjects.map((o) => ({
          label: o.type,
          zoneHint: `${o.type} zone`,
          replacementDirection,
        })),
        keptItemLabelList: keptObjects.map((o) => o.type),
      },
      budget: context?.budget
        ? {
            rangeMin: context?.budget.rangeMin,
            rangeMax: context?.budget.rangeMax,
            strategy: context?.budget.strategy,
          }
        : null,
      budgetReconciled: (() => {
        const explicit = context?.budget;
        const tierFromRange = (max: number | undefined): string | null => {
          if (max === undefined || max === null) return null;
          if (max <= 2000) return "budget";
          if (max <= 5000) return "mid";
          if (max <= 10000) return "premium";
          return "luxury";
        };
        if (
          explicit &&
          (explicit.rangeMin !== undefined || explicit.rangeMax !== undefined)
        ) {
          const min = explicit.rangeMin ?? 0;
          const max = explicit.rangeMax;
          const tier = tierFromRange(max ?? undefined);
          const rangeStr =
            max !== undefined && max !== null ? `$${min}–$${max}` : `$${min}+`;
          return tier
            ? `Budget: ${rangeStr} (${tier} tier)`
            : `Budget: ${rangeStr}`;
        }
        return null;
      })(),
      requestedProducts:
        context?.requestedProducts
          ?.filter((p) => p.confirmedByUser)
          ?.slice(0, 4)
          ?.map((p: RequestedProduct & { priority?: string }) => ({
            name: p.scrapedData?.name ?? p.originalInput,
            description: p.fluxDescription,
            placement: p.placementIntent,
            priority: p.priority,
          })) ?? [],
      artBrief:
        context?.artBrief?.hasArtDirection ||
        context?.artBrief?.colorPalette?.length ||
        context?.artBrief?.mood ||
        context?.artBrief?.subjectMatter ||
        context?.artBrief?.artUrl
          ? {
              visualDirection: context?.artBrief?.visualDirection,
              frameStyle: context?.artBrief?.frameStyle,
              galleryWall: context?.artBrief?.galleryWall,
              hasVinylCollection: context?.artBrief?.hasVinylCollection,
              hasBookCollection: context?.artBrief?.hasBookCollection,
            }
          : null,
      techSpec:
        context?.techSpec?.hasTV ||
        context?.techSpec?.hasWorkFromHome ||
        context?.techSpec?.hasGamingSetup ||
        context?.techSpec?.smartLighting ||
        context?.techSpec?.audioSetup
          ? {
              hasTV: context?.techSpec?.hasTV,
              tvSizeInches: context?.techSpec?.tvSizeInches,
              tvMountType: context?.techSpec?.tvMountType,
              tvPlacementWall: context?.techSpec?.tvPlacementWall,
              hasWorkFromHome: context?.techSpec?.hasWorkFromHome,
              wfhSetup: context?.techSpec?.wfhSetup,
            }
          : null,
      roomAnalysis: roomAnalysis
        ? {
            wallColor: roomAnalysis.wallColors ?? null,
            floorType: roomAnalysis.floorType ?? null,
            cameraAngle: roomAnalysis.cameraAngle ?? null,
            focalLength: roomAnalysis.focalLength ?? null,
            fixedElements: roomAnalysis.fixedElements ?? [],
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
            sentimentalObjects:
              context?.identityBrief.sentimentalObjects?.slice(0, 1),
          }
        : null,
    };

    const cameraAngle =
      roomAnalysis?.cameraAngle ??
      context?.roomContext?.cameraAngle ??
      "straight-on view";

    const resolvedSystemPrompt = SYSTEM_PROMPT_TEMPLATE;
    const chatSuffix = chatContext
      ? `\n\nAdditional user preferences from chat (extract any TV, plant, lighting, density, or material mentions and incorporate):\n${JSON.stringify(chatContext, null, 2)}`
      : "";

    const dims = fp.dimensions;
    const dimensionInterpretation = [
      `COLOR DIRECTION (applies to furniture and objects ONLY, never walls): ${dims.colorTemperature < 0.35 ? "COOL — use slate grey, dusty sage, dove white, stone blue for new furniture and objects. NO warm tones." : dims.colorTemperature > 0.65 ? "WARM — use amber, terracotta, warm oak, cream for new furniture and objects. NO cool tones." : "NEUTRAL GREIGE — warm whites and natural tones"}`,
      `LIGHT: ${dims.lightPreference < 0.35 ? "COZY LAMP-LIT — warm pools of 2700K light, no overhead harshness, candles" : dims.lightPreference > 0.65 ? "BRIGHT DAYLIGHT — white surfaces, diffused natural light, sheer curtains" : "MIXED AMBIENT"}`,
      `DENSITY: ${dims.density > 0.75 ? "MAXIMALLY LAYERED — pile on objects, books, plants, textiles. 12+ distinct design elements mandatory" : dims.density < 0.3 ? "MINIMAL — 4-5 elements, breathing room, negative space" : "BALANCED LAYERING"}`,
      `PATTERN: ${dims.pattern > 0.7 ? "PATTERN-RICH — printed cushions, patterned kilim rug, textured wallcovering or tapestry mandatory" : dims.pattern < 0.3 ? "SOLID COLORS ONLY — no prints, no patterns" : "SUBTLE TEXTURE ONLY"}`,
      `ERA: ${dims.era < 0.35 ? "HERITAGE/VINTAGE — aged brass, antique frames, distressed leather, heirloom objects, wabi-sabi imperfection" : dims.era > 0.65 ? "CONTEMPORARY CLEAN — minimal ornament, geometric forms" : "TRANSITIONAL"}`,
      `MATERIAL: ${dims.material > 0.65 ? "NATURAL ORGANIC — rattan, jute, linen, raw terracotta, hand-thrown ceramics, live-edge wood" : dims.material < 0.35 ? "MANUFACTURED — lacquer, powder-coat steel, glass, resin, polished concrete" : "MIX OF NATURAL AND MANUFACTURED"}`,
      `CULTURAL: ${dims.culturalInfluence > 0.6 ? "GLOBALLY ECLECTIC — intentionally mix Moroccan, Japanese wabi-sabi, Scandinavian hygge, or African textile elements" : "WESTERN CONTEMPORARY"}`,
    ].join("\n");

    const userContent = `${dimensionInterpretation}\n\nCompile a FLUX Kontext Pro edit prompt from this design profile. Apply all rules and the full quality formula strictly. Use _replacementDirection="${replacementDirection}" for vacated zone styling. Camera angle: ${cameraAngle}.\n\n${JSON.stringify(compressedContext, null, 2)}${chatSuffix}`;
    const callClaude = async (): Promise<string | null> => {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: userContent }],
        system: resolvedSystemPrompt + anchorSystem,
      });
      const block = response.content[0];
      if (!block || block.type !== "text" || !block.text.trim()) return null;
      return block.text.trim();
    };

    let compiled: string | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const candidate = await callClaude();
      const count = candidate ? candidate.split(/\s+/).length : 0;
      console.warn(`[compiler] attempt ${attempt} word count:`, count);
      if (candidate && count >= 100 && count <= 1400) {
        compiled = candidate;
        break;
      }
    }

    if (!compiled) {
      // Log the last candidate's details for debugging
      const lastCandidate = await callClaude().catch(() => null);
      const lastCount = lastCandidate ? lastCandidate.split(/\s+/).length : 0;
      console.warn(
        `[prompt-compiler] Claude output outside 100-1400 range after 2 attempts, falling back. Last word count: ${lastCount}, preview: ${lastCandidate?.slice(0, 200) ?? "null"}`,
      );
      return null;
    }

    return sanitizeForbiddenStyleNames(compiled);
  } catch (err) {
    console.error("[prompt-compiler] Claude compilation failed:", err);
    return null;
  }
}
