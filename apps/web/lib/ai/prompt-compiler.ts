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

const SYSTEM_PROMPT_TEMPLATE = `You are a FLUX Kontext Pro prompt engineer specializing in interior design transformations.

FLUX Kontext Pro is an image EDIT model. It receives the user's actual room photo as input_image and edits it according to your prompt. Its default behavior is PRESERVATION — it only changes what the prompt explicitly targets. The failure mode is over-editing caused by vague prompts that fail to frame kept items as anchors. Your job is to prevent that.

THE FOUR RULES (apply in order, every time):

RULE 1 — KEPT ITEMS ARE ANCHORS (never "preserve the X").
After the transformation sentence, emit a block titled exactly:
  "Anchoring pieces — treat these as fixed. Do not alter their color, material, form, or position:"
List each kept item as ONE bullet that uses EVERY available enriched field for that item (label, dominantColor, material, sizeInRoom, styleDescriptors, userNote). Build sentences like:
  • The existing cream linen sofa — low-profile silhouette, tufted back, tapered oak legs, large — is the primary anchor. Every new element must complement it.
If an enriched field is null for a given item, omit that field silently. If only the label is present, fall back to: "• The existing [label] is an anchor — do not alter its color, material, form, or position." Never invent descriptors.

RULE 2 — REMOVED ITEMS ARE VACATED ZONES (never just "remove the X").
After anchors, emit a block titled exactly:
  "Vacated zones — redesign these areas completely:"
For each removed item, name the zone and give a specific replacement direction derived from the provided _replacementDirection field:
  • Coffee table zone (center of seating area): introduce a low japandi-appropriate replacement.
  • Floor lamp zone: redesign this corner's lighting entirely with a warm intimate lamp-lit mood.
  • Accent chair zone: introduce japandi-appropriate seating here.

RULE 3 — TRANSFORMATION INSTRUCTION IS CHANGE-FOCUSED.
The opening sentence names what CHANGES, not what stays. Example:
  "Transform the coffee table zone, floor lamp zone, and accent chair zone into a japandi-appropriate living room. Introduce new pieces that work with the anchoring sofa and rug."
Never write "Redesign while preserving the X."

RULE 4 — FINAL ANCHOR REMINDER (last sentence, always).
End with exactly:
  "Final constraint: [comma-separated list of kept item labels] must appear identical to the input image — same position, color, material, and form. Only the vacated zones are to be redesigned."

OUTPUT CONTRACT (strictly enforced):
- 100-400 words.
- Section order:
  1. Transformation sentence [Rule 3].
  2. Anchoring pieces block [Rule 1].
  3. Vacated zones block [Rule 2].
  4. Structural context — ceiling height (parsed from roomContext.ceilingDetail), architectural fixtures from architecturalFeatures + roomConstraints.physicalConstraints, flooring keep/replace from floorMaterial + the "keep existing flooring"/"replace existing flooring" entry, natural light time + window count.
  5. Requested products — one line per confirmedByUser requestedProduct.
  6. Protected areas and special requirements (only if present).
  7. Style reference directive: "Apply the aesthetic from the reference image to the vacated zones only — not to the anchoring pieces."
  8. Art direction / tech spec / sensory profile lines, only if those objects are present.
  9. Budget line — exact "Budget: $X–$Y (tier tier)" string from budgetReconciled.
  10. Rule 4 final constraint sentence.
  11. Closer: "Photorealistic interior photograph, __CAMERA_ANGLE__, __FOCAL_LENGTH__, f/8. No people, no text."

HARD RULES:
1. Every style adjective must be traceable to a fingerprint dimension value, a keepMask enriched field, or an explicit user input. Zero filler, zero invented descriptors.
2. Fingerprint dimensions with |value - 0.5| < 0.15 contribute NOTHING.
3. Dimensions with |value - 0.5| >= 0.15 MUST appear.
4. Use specific material names — never abstract words like "modern", "cozy", "stylish".
5. Never use internal anchor labels verbatim: warm japandi, pure minimal white, coastal bright, biophilic jungle, dark moody glam, heritage traditional, industrial loft, maximalist eclectic, retro mid-century. Use the provided _replacementDirection field instead.
6. If a data field is null or an object is absent, omit that line entirely. Never fabricate.
7. Return ONLY the prompt. No preamble, no explanation, no markdown, no quotes.`;

export async function compilePromptWithClaude(
  context: RenderContext | null,
  roomType: string,
  fingerprint: StyleFingerprint,
  anchorPrompt: string | null = null,
  roomAnalysis: RoomArchitecture | null = null,
): Promise<string | null> {
  try {
    const fp = fingerprint;
    const materialPalette = getMaterialPalette(fp.dimensions);
    const fingerprintPhrase = buildFullFingerprintPhrase(fp.dimensions);
    const anchorSystem = anchorPrompt
      ? `\n\nAnchor style reference prompt (high priority): ${anchorPrompt}\nWeight this heavily — it captures the user's confirmed visual preference, but apply it only to the vacated zones, never to the anchoring pieces.`
      : "";

    const replacementDirection = deriveReplacementDirection(
      context?.styleBlend ?? context?.style_blend ?? null,
    );

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
    const focalLength =
      roomAnalysis?.focalLength ?? context?.roomContext?.focalLength ?? "24mm";

    const resolvedSystemPrompt = SYSTEM_PROMPT_TEMPLATE.replace(
      "__CAMERA_ANGLE__",
      String(cameraAngle),
    ).replace("__FOCAL_LENGTH__", String(focalLength));

    const userContent = `Compile a FLUX Kontext Pro edit prompt from this design profile. Apply Rules 1-4 strictly. Use _replacementDirection="${replacementDirection}" wherever a style direction is needed in vacated zone bullets.\n\n${JSON.stringify(
      compressedContext,
      null,
      2,
    )}`;

    const callClaude = async (): Promise<string | null> => {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 700,
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
      if (candidate && count >= 100 && count <= 400) {
        compiled = candidate;
        break;
      }
    }

    if (!compiled) {
      console.warn(
        `[prompt-compiler] Claude output outside 100-400 range after 2 attempts, falling back`,
      );
      return null;
    }

    return sanitizeForbiddenStyleNames(compiled);
  } catch (err) {
    console.error("[prompt-compiler] Claude compilation failed:", err);
    return null;
  }
}
