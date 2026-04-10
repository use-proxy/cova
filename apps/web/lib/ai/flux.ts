import Replicate from "replicate";
import type { StyleFingerprint } from "@/types/fingerprint";
import type { RoomAnalysis } from "@/lib/store/room";
import {
  buildPreservationInstructions,
  type RoomArchitecture,
} from "./room-analyzer";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// ── Model constants ───────────────────────────────────────────────────────────
// FLUX Kontext Pro is an image-edit model: it takes `input_image` (singular)
// and preserves the composition, camera angle, and architecture of the input
// while modifying the scene according to the prompt. This is exactly what
// Cova promises: "Your room, redesigned". Verified 2026-04-08 with Daksh's
// actual bedroom (blue walls, ceiling fan, DAKSH letters) — output preserved
// all architecture and only swapped the rug/decor. DO NOT swap this model
// without re-running the live architecture-preservation test.
//
// FLUX Schnell is a text-to-image model used for the fast preview during
// render loading. It does NOT support input_image and is not expected to
// preserve architecture — it just shows a plausible style while Kontext
// Pro runs.
const KONTEXT_MODEL = "black-forest-labs/flux-kontext-pro";
const SCHNELL_MODEL = "black-forest-labs/flux-schnell";
// Multi-image Kontext takes two input images (input_image_1 = style reference,
// input_image_2 = user's room photo). Verified 2026-04-08 end-to-end: the
// output adopts the interior-design style of image 1 while preserving the
// layout, architecture and camera angle of image 2. This is the highest-impact
// upgrade for style accuracy over the single-image Kontext endpoint.
const MULTI_KONTEXT_MODEL = "flux-kontext-apps/multi-image-kontext-pro";

// FLUX Depth Pro — preserves room geometry via integrated depth conditioning.
// Accepts control_image (room photo) and internally extracts depth.
// Use when original photo is available. $0.050/run on Replicate.
const DEPTH_MODEL = "black-forest-labs/flux-depth-pro";

// Clarity Upscaler — 2x upscaling with AI detail enhancement. $0.012/run.
const UPSCALER_MODEL = "philz1337x/clarity-upscaler";

// ── Descriptor table — authoritative, do not modify ───────────────────────────

type DimKey = keyof StyleFingerprint["dimensions"];

// All dimension values are in the [0, 1] range with 0.5 as the neutral midpoint.
// `lo` describes values approaching 0; `hi` describes values approaching 1.
// Concise (<8 word) descriptors for all 12 dims. Trimmed 2026-04-08 so the
// quiz validation-render path can emit a <80-word total prompt.
const DESCRIPTORS: Record<DimKey, { lo: string; hi: string }> = {
  colorTemperature: {
    lo: "cool slate and stone tones",
    hi: "warm amber and honey tones",
  },
  colorSaturation: {
    lo: "muted desaturated palette",
    hi: "bold saturated colors",
  },
  density: {
    lo: "minimal sparse furnishing",
    hi: "richly layered maximalist",
  },
  formality: {
    lo: "casual relaxed atmosphere",
    hi: "formal structured arrangement",
  },
  era: {
    lo: "contemporary cutting-edge aesthetic",
    hi: "heritage vintage character",
  },
  material: {
    lo: "sleek manufactured surfaces",
    hi: "natural organic materials",
  },
  texture: {
    lo: "smooth polished surfaces",
    hi: "tactile layered textures",
  },
  pattern: {
    lo: "solid plain surfaces",
    hi: "pattern-rich decorative",
  },
  lineQuality: {
    lo: "sharp geometric angular lines",
    hi: "soft organic curved forms",
  },
  lightPreference: {
    lo: "cozy intimate lamp-lit",
    hi: "bright airy natural daylight",
  },
  nature: {
    lo: "urban minimal greenery",
    hi: "biophilic plant-filled",
  },
  culturalInfluence: {
    lo: "clean Western contemporary",
    hi: "globally eclectic influences",
  },
};

// Strong band: a dimension is "directional" when it deviates from 0.5 by more
// than NEUTRAL_BAND (i.e. v < 0.35 or v > 0.65). Values inside the neutral
// band produce no descriptor text.
const NEUTRAL_MIDPOINT = 0.5;
const NEUTRAL_BAND = 0.15;

const BUDGET_MODIFIERS: Record<string, string> = {
  budget: "affordable accessible pieces, high-street furniture",
  mid: "quality mid-range furniture, well-made everyday pieces",
  premium: "premium materials, considered investment pieces",
  luxury: "designer furniture, investment pieces, bespoke details",
};

// ── buildFluxPrompt ───────────────────────────────────────────────────────────
//
// Kontext Pro is an edit-instruction model, not a scene-description model.
// Live-tested 2026-04-08 against Daksh's actual bedroom (IMG_2093): a
// transformation-first structure produced a 9/10 coastal redesign that
// preserved the ceiling fan, DAKSH letters, photo string, window blinds,
// bed frame, wall color and carpet, while swapping in rattan chairs,
// nightstand with lamp, coastal art, jute rug and fresh bedding.
//
// The winning structure:
//
//   1. Transformation intent — "Interior design makeover: this {room} needs
//      a {style} redesign." Signals the before/after frame up front so
//      Kontext actually redesigns instead of applying a color filter.
//   2. REPLACE section — explicit before → after swaps ("messy bedding →
//      crisp white duvet"). This is the single most important part of the
//      prompt and must be present for actual transformation.
//   3. ADD section — new decor items ("woven jute rug, coastal art…").
//   4. PRESERVE section — architectural elements from Gemini analysis.
//      Leads with the literal string "PRESERVE exactly:".
//   5. Kept items — user's explicit keep-selections from step-5.
//   6. Budget modifier.
//   7. Quality closer — "photorealistic, professionally staged".
//
// PRESERVE was moved out of the opening position because live testing
// showed that leading with preservation produced color-filter outputs,
// not true redesigns. Kontext needs the transformation framing first.

export interface BuildFluxPromptParams {
  fingerprint: StyleFingerprint;
  roomType: string;
  budgetTier: "budget" | "mid" | "premium" | "luxury";
  inclusions: string[];
  constraints: string[];
  keptItemLabels: string[];
  roomAnalysis: RoomAnalysis | null;
  // Precise, Gemini-derived preservation instructions describing the actual
  // walls, ceiling, floor, windows, camera angle and fixed elements of the
  // user's room. When present, this is used instead of the generic fallback.
  preservationInstructions?: string;
  // Quiz preview mode (validation renders): drop the preservation/kept-items
  // tail and the lived-in realism cue so the total prompt stays under
  // ~80 words for a clean text-to-image FLUX 1.1 Pro render.
  quizPreviewMode?: boolean;
}

// Material palette derived from fingerprint dimensions. Stating materials up
// front gives Kontext a concrete target to latch onto (research finding: the
// model responds better to material names than abstract style adjectives).
// Keep tight — at most 3 comma-separated items so the full prompt stays
// inside Kontext's 80-word sweet spot.
//
// Three-tier system (BUG-1 fix, 2026-04-08):
//   material=0.60, nature=0.60, colorTemp=0.55 → should NOT produce marble/chrome
//   material=0.85, nature=0.80, colorTemp=0.65 → warm natural high tier
//   material=0.20, nature=0.20, colorTemp=0.40 → manufactured tier
function getMaterialPalette(d: StyleFingerprint["dimensions"]): string {
  const isNatural = d.material >= 0.55 || d.nature >= 0.55;
  const isManufactured = d.material < 0.4 && d.nature < 0.4;
  const isWarm = d.colorTemperature >= 0.55;
  const isCool = d.colorTemperature < 0.45;
  const isHighNatural = d.material >= 0.75 || d.nature >= 0.75;

  let items: string[];

  if (isNatural) {
    if (isHighNatural) {
      // High natural tier — warm vs cool cross-reference
      items = isWarm
        ? ["honey oak", "warm terracotta", "aged brass"]
        : isCool
          ? ["whitewashed oak", "cool stone", "sea glass"]
          : ["rattan", "raw linen", "terracotta"];
    } else {
      // Mid natural tier (material/nature in 0.55–0.74)
      items = isWarm
        ? ["light oak", "linen", "wicker"]
        : isCool
          ? ["pale linen", "cool stone", "cotton canvas"]
          : ["light oak", "linen", "stone"];
    }
  } else if (isManufactured) {
    // Manufactured tier
    items =
      d.material <= 0.25
        ? ["polished marble", "lacquered steel", "tempered glass"]
        : ["matte concrete", "brushed nickel", "ceramic tile"];
  } else {
    // Transitional tier (material/nature in 0.40–0.54)
    items = isWarm
      ? ["wood and metal accents", "warm stone", "brushed brass"]
      : ["stone and glass surfaces", "mixed materials", "matte concrete"];
  }

  // Era overlay (preserved from prior logic, manufactured context only)
  if (d.era > 0.7 && !isNatural) items[2] = "heirloom textiles";
  if (d.colorTemperature > 0.7 && !isNatural && !isHighNatural)
    items.unshift("warm oak");

  // BUG-2 fix (2026-04-08): texture tier override — style-aware, not generic.
  // High texture (>= 0.70) replaces the last palette slot with a material that
  // matches the tactile character of the room's color/mood context.
  // Trace: texture=0.85, colorSaturation=0.90, lightPreference=0.25 → "plush velvet"
  if (d.texture >= 0.7) {
    const textureMaterial =
      d.colorSaturation >= 0.65 && d.lightPreference <= 0.45
        ? "plush velvet" // dramatic/moody — velvet is the dark glam texture
        : d.colorSaturation >= 0.65
          ? "bouclé upholstery" // bold/bright — bouclé reads as expressive, not rustic
          : d.colorSaturation < 0.4
            ? "chunky knit throws" // muted/neutral — natural fiber reads as cozy
            : "textured woven wool"; // mid saturation default
    items[items.length - 1] = textureMaterial;
  } else if (d.texture < 0.4) {
    // Low texture: replace last slot with sleek surface material
    items[items.length - 1] =
      d.lightPreference > 0.6 ? "smooth linen" : "sleek upholstery";
  }

  const deduped = Array.from(new Set(items)).slice(0, 3);
  if (deduped.length === 0) return "";
  return "Materials: " + deduped.join(", ");
}

function getLightingInstruction(d: StyleFingerprint["dimensions"]): string {
  if (d.lightPreference > 0.7)
    return "Bright natural daylight, airy atmosphere";
  if (d.lightPreference < 0.3) return "Warm intimate lamp light, cozy shadows";
  return "Balanced natural ambient light";
}

// Select the top-K dominant descriptors (by distance from the neutral midpoint).
function dominantDescriptors(
  d: StyleFingerprint["dimensions"],
  k: number,
): string[] {
  const entries = (Object.keys(DESCRIPTORS) as DimKey[])
    .map((key) => ({ key, v: d[key], dev: d[key] - NEUTRAL_MIDPOINT }))
    .filter((e) => Math.abs(e.dev) > NEUTRAL_BAND)
    .sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev))
    .slice(0, k);
  return entries.map((e) =>
    e.dev > 0 ? DESCRIPTORS[e.key].hi : DESCRIPTORS[e.key].lo,
  );
}

// Forbidden style names must never appear in user-facing strings (CLAUDE.md rule 8).
// Strip them from any user-provided text before including in prompts.
const FORBIDDEN_STYLE_NAMES = ["japandi", "bohemian", "coastal", "mid-century modern", "minimalist"];

// Replacement map: forbidden label → descriptive phrase that FLUX understands better anyway.
const STYLE_NAME_REPLACEMENTS: Record<string, string> = {
  "japandi": "calm warm naturalism with clean lines",
  "minimalist": "deliberately uncluttered with intentional negative space",
  "bohemian": "eclectic layered with rich textural depth",
  "coastal": "breezy light-filled with natural weathered materials",
  "mid-century modern": "warm retro curves with teak and brass accents",
};

/** Replace forbidden style labels with descriptive phrases in the final prompt. */
export function sanitizeForbiddenStyleNames(prompt: string): string {
  let sanitized = prompt;
  for (const [name, replacement] of Object.entries(STYLE_NAME_REPLACEMENTS)) {
    sanitized = sanitized.replace(new RegExp(name, "gi"), replacement);
  }
  return sanitized;
}

function sanitizeUserText(text: string): string {
  let result = text;
  for (const name of FORBIDDEN_STYLE_NAMES) {
    result = result.replace(new RegExp(name, "gi"), "").replace(/\s{2,}/g, " ").trim();
  }
  // Strip HTML tags — user text goes to image models, not browsers,
  // but keeping tags adds noise and could confuse the model.
  result = result.replace(/<[^>]*>/g, "").trim();
  return result;
}

export function buildFluxPrompt(params: BuildFluxPromptParams): string {
  const {
    fingerprint,
    roomType,
    budgetTier,
    inclusions: rawInclusions,
    keptItemLabels: rawKeptItemLabels,
    preservationInstructions,
    quizPreviewMode,
  } = params;
  // Sanitize all user-provided text inputs
  const inclusions = rawInclusions.map(sanitizeUserText).filter(Boolean);
  const keptItemLabels = rawKeptItemLabels.map(sanitizeUserText).filter(Boolean);
  const d = fingerprint.dimensions;
  const roomTypeStr = roomType.replace(/_/g, " ");

  // Research findings incorporated here (2026-04-08):
  //   • Declare material palette before abstract style words.
  //   • Lead with transformation intent.
  //   • State lighting explicitly (derived from luminosity dimension).
  //   • Include one "lived-in" realism cue.
  //   • End with camera/lens language — Kontext uses the closer as a strong
  //     rendering style hint.
  //   • Target <80 words; trim descriptors to top-4 dominant dimensions.

  // Per-part word budget accounting — the goal is ≤80 words for the
  // "core" prompt (intent + descriptors + REPLACE/ADD + lighting + camera),
  // and the Gemini preservation line + kept items are appended on top since
  // they're hard constraints the model must honor regardless of length.
  const buildAt = (
    descriptorCount: number,
  ): { prompt: string; coreWords: number } => {
    const core: string[] = [];

    // 1. Transformation intent (lean)
    core.push(`Redesign this ${roomTypeStr}`);

    // 2. Material palette (concrete names beat abstract style words)
    const palette = getMaterialPalette(d);
    if (palette) core.push(palette);

    // 3. Top-N dominant style descriptors
    const descriptors = dominantDescriptors(d, descriptorCount);
    if (descriptors.length > 0) core.push(descriptors.join(", "));

    if (!quizPreviewMode) {
      // 4. REPLACE clause (tight)
      core.push("Replace all furniture, bedding, rugs, art and decor");

      // 5. ADD clause — user's inclusion list
      if (inclusions.length > 0) {
        core.push("Add: " + inclusions.slice(0, 3).join(", "));
      }

      // 6. Lived-in realism cue (single short phrase)
      core.push(
        "One lived-in detail: a book on a nightstand or throw on an armrest",
      );
    }

    // 7. Lighting (derived from luminosity)
    core.push(getLightingInstruction(d));

    // 8. Budget tier (skipped in quiz preview — generic target)
    if (!quizPreviewMode) {
      core.push(BUDGET_MODIFIERS[budgetTier] ?? BUDGET_MODIFIERS.mid);
    }

    // 9. Camera closer — strong rendering hint (final position)
    core.push(
      quizPreviewMode
        ? "photorealistic interior photography"
        : "Shot on Canon R5 24mm f/8, soft window light with warm 2700K lamps, photorealistic, Architectural Digest",
    );

    const coreStr = core.join(". ");
    const coreWords = coreStr.split(/\s+/).length;

    // Append preserve clauses as hard constraints — excluded from the 80-word
    // core budget because Gemini output is variable-length and non-negotiable.
    // Quiz preview mode skips the tail entirely — it's a text-to-image style
    // probe, not an edit of a real room photo.
    const tail: string[] = [];
    if (!quizPreviewMode) {
      if (preservationInstructions && preservationInstructions.trim()) {
        tail.push(preservationInstructions.trim());
      } else {
        tail.push(
          "PRESERVE exactly: wall color, ceiling, floor, windows, wall decor, camera angle, room layout",
        );
      }
      if (keptItemLabels.length > 0) {
        tail.push("Keep unchanged: " + keptItemLabels.join(", "));
      }
    }

    const prompt = tail.length > 0 ? [coreStr, ...tail].join(". ") : coreStr;
    return { prompt, coreWords };
  };

  // Try with 4 descriptors, fall back to fewer if core exceeds 80-word budget.
  let result = buildAt(4);
  if (result.coreWords > 80) result = buildAt(3);
  if (result.coreWords > 80) result = buildAt(2);
  if (result.coreWords > 80) result = buildAt(1);
  if (result.coreWords > 80) result = buildAt(0);

  // 350-word absolute cap — Kontext Pro's real limit is ~512 tokens (≈380
  // words for English). We target 350 to leave a safe buffer for tokenization
  // overhead. If the combined prompt exceeds this, truncate silently (never
  // throw): a truncated prompt still produces a render, while an error
  // produces nothing. The tail (Gemini preservation + kept items) is what
  // typically blows past budget, so we truncate it word-by-word from the end
  // while preserving the core transformation prompt in full.
  const MAX_WORDS = 350;
  const totalWords = result.prompt.split(/\s+/).filter(Boolean).length;
  if (totalWords > MAX_WORDS) {
    const words = result.prompt.split(/\s+/).filter(Boolean);
    const truncated = words.slice(0, MAX_WORDS).join(" ");
    console.warn(
      `[buildFluxPrompt] Prompt was ${totalWords} words, truncated to ${MAX_WORDS} ` +
        `(preservation detail trimmed; core transformation preserved).`,
    );
    return sanitizeForbiddenStyleNames(truncated);
  }

  return sanitizeForbiddenStyleNames(result.prompt);
}

// ── submitSchnellRender — text-to-image preview, no input_image ───────────────
// Schnell doesn't support input_image. Keep it as text-to-image for the fast
// preview shown during render loading — it just needs to look like a
// plausible redesign, not preserve architecture.

export async function submitSchnellRender(prompt: string): Promise<string> {
  const prediction = await replicate.predictions.create({
    model: SCHNELL_MODEL,
    input: {
      prompt,
      num_outputs: 1,
      aspect_ratio: "4:3",
      output_format: "png",
    },
  });
  return prediction.id;
}

// Multi-image Kontext Pro — accepts a style reference image + the user's room
// photo and produces a redesign that adopts the style of image 1 while
// preserving the layout of image 2. Field names verified from the endpoint
// schema on 2026-04-08: input_image_1 and input_image_2 (not image_1/image_2).
export async function submitMultiImageRender(
  photoUrl: string,
  styleReferenceUrl: string,
  prompt: string,
): Promise<string> {
  const prediction = await replicate.predictions.create({
    model: MULTI_KONTEXT_MODEL,
    input: {
      input_image_1: styleReferenceUrl, // image 1 drives style
      input_image_2: photoUrl, // image 2 = room to transform
      prompt,
      output_format: "png",
      safety_tolerance: 2,
    },
  });
  return prediction.id;
}

// ── submitRender — Kontext Pro edit on the user's actual room photo ──────────
// Takes the original room photo as `input_image` so the model preserves the
// composition and architecture. Returns prediction_id immediately — the
// status route polls until the render completes.

export async function submitRender(
  photoUrl: string,
  _referenceImageUrls: string[],
  prompt: string,
): Promise<string> {
  const prediction = await replicate.predictions.create({
    model: KONTEXT_MODEL,
    input: {
      input_image: photoUrl,
      prompt,
      output_format: "png",
      safety_tolerance: 2,
    },
  });
  return prediction.id;
}

// ── submitDepthRender — FLUX Depth Pro, geometry-preserving redesign ─────────
// FLUX Depth Pro accepts the room photo as control_image and internally
// extracts depth — no pre-computed depth map needed.
// guidance=30 is the sweet spot for interior redesign (tested range: 20-40).
// Below 15 = too creative, above 50 = too rigid for redesign use case.
export async function submitDepthRender(
  photoUrl: string,
  prompt: string,
  guidance: number = 30,
  steps: number = 28,
): Promise<string> {
  const prediction = await replicate.predictions.create({
    model: DEPTH_MODEL,
    input: {
      control_image: photoUrl,
      prompt,
      guidance,
      steps,
      output_format: "png",
      safety_tolerance: 2,
    },
  });
  return prediction.id;
}

// ── submitUpscale — Clarity Upscaler, returns prediction id ──────────────────
export async function submitUpscale(
  imageUrl: string,
  prompt: string = "interior design, photorealistic, high quality",
): Promise<string> {
  // Clarity Upscaler at 2x — adds AI-hallucinated texture detail.
  // Non-fatal: caller should catch and fall back to original URL.
  const prediction = await replicate.predictions.create({
    model: UPSCALER_MODEL,
    input: {
      image: imageUrl,
      scale_factor: 2,
      prompt,
      num_inference_steps: 18,
      guidance_scale: 4,
      creativity: 0.35,
      resemblance: 0.6,
      output_format: "png",
    },
  });
  return prediction.id;
}

// ── runUpscale — synchronous wrapper, falls back to original URL ──────────────
export async function runUpscale(imageUrl: string): Promise<string> {
  try {
    const predId = await submitUpscale(imageUrl);
    let p = await replicate.predictions.get(predId);
    const deadline = Date.now() + 60_000;
    while (
      p.status !== "succeeded" &&
      p.status !== "failed" &&
      Date.now() < deadline
    ) {
      await new Promise((r) => setTimeout(r, 3000));
      p = await replicate.predictions.get(predId);
    }
    if (p.status !== "succeeded") return imageUrl; // fall back
    const out = p.output;
    if (typeof out === "string") return out;
    if (Array.isArray(out) && out.length > 0) return String(out[0]);
    return imageUrl;
  } catch {
    return imageUrl; // non-fatal fallback
  }
}

// ── submitArchitectureCorrection — Kontext Pro pass 2 ────────────────────────
// Pass 1 redesigns style; pass 2 takes that output and corrects any
// architectural drift (wall color, window position, ceiling fan, decor text
// on walls, etc.) so the final render unambiguously looks like the same
// physical room. Called automatically by the render status route when pass 1
// completes — returns a new prediction id to poll.

export async function submitArchitectureCorrection(
  pass1OutputUrl: string,
  _originalPhotoUrl: string,
  arch: RoomArchitecture,
): Promise<string> {
  const fixed =
    arch.fixedElements.length > 0
      ? ` Do not change: ${arch.fixedElements.join(", ")}.`
      : "";

  const correctionPrompt =
    `This is a redesigned version of a room. Correct any architectural ` +
    `differences so it looks like the original physical room. ` +
    buildPreservationInstructions(arch) +
    ` The furniture style and decor are correct — only fix the architecture ` +
    `if walls, floor, ceiling, windows, or camera angle changed.` +
    fixed +
    ` If architecture is already correct, keep the image exactly as is.`;

  const prediction = await replicate.predictions.create({
    model: KONTEXT_MODEL,
    input: {
      input_image: pass1OutputUrl,
      prompt: correctionPrompt,
      output_format: "png",
      safety_tolerance: 2,
    },
  });
  return prediction.id;
}

// ── submitFillRender — FLUX Fill Pro inpainting ───────────────────────────────
// Used for furniture swaps where a bbox mask is provided.
// white pixels in the mask = regions to inpaint; black = preserve.
export async function submitFillRender(
  imageUrl: string,
  maskUrl: string,
  prompt: string,
  steps: number = 28,
  guidance: number = 30,
): Promise<string> {
  const prediction = await replicate.predictions.create({
    model: "black-forest-labs/flux-fill-pro",
    input: {
      image: imageUrl,
      mask: maskUrl,
      prompt,
      steps,
      guidance,
      output_format: "png",
      safety_tolerance: 2,
    },
  });
  return prediction.id;
}

// ── runFluxRender — synchronous variant used by the refine route ─────────────

export async function runFluxRender(
  photoUrl: string,
  _depthMapUrl: string,
  prompt: string,
  _negativePrompt: string,
  _styleStrength: number = 0.85,
): Promise<string> {
  const prediction = await replicate.predictions.create({
    model: KONTEXT_MODEL,
    input: {
      input_image: photoUrl,
      prompt,
      output_format: "png",
      safety_tolerance: 2,
    },
  });

  let p = prediction;
  while (
    p.status !== "succeeded" &&
    p.status !== "failed" &&
    p.status !== "canceled"
  ) {
    await new Promise((r) => setTimeout(r, 3000));
    p = await replicate.predictions.get(p.id);
  }

  if (p.status !== "succeeded") {
    throw new Error(`Kontext render failed: ${p.error ?? p.status}`);
  }

  const output = p.output;
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0) return String(output[0]);

  throw new Error("Unexpected output format from Kontext render");
}

// ── buildFluxPromptFromContext ────────────────────────────────────────────────
//
// Area 2 — consumes the unified RenderContext (screens A/B/C + tabbed chat +
// Area 1 fingerprint) and produces a single photorealistic edit prompt for
// FLUX Kontext Pro.
//
// 14-section priority order:
//   1.  Transformation intent (fingerprint descriptors)
//   2.  Material palette (fingerprint-derived)
//   3.  Spatial envelope
//   4.  Lighting
//   5.  Materials (floor/walls)
//   6.  Screen B constraints
//   7.  Replace clause + kept objects
//   8.  Requested products
//   9.  Art direction
//   10. Tech
//   11. Sensory (trim first if over cap)
//   12. Identity + mood (trim second)
//   13. Budget quality (trim third)
//   14. Camera + quality closer (always kept)
//
// Hard cap: 2400 chars. If over, trim sections 11→13 proportionally,
// keeping 1-10 + 14 always.
import type { RenderContext } from "@/lib/types/area2";

export function buildFluxPromptFromContext(context: RenderContext): string {
  const {
    roomContext: rc,
    roomConstraints: cons,
    keepMask,
    budget,
    requestedProducts,
    artBrief,
    techSpec,
    sensoryProfile,
    identityBrief,
    fingerprint,
  } = context;

  const core: string[] = [];
  const trimmable: string[] = [];

  // ─── SECTION 1 — TRANSFORMATION INTENT ────────────────────────────────
  {
    const roomType = cons?.primaryFunction?.[0] ?? "room";
    const shapeStr = rc?.roomShape ? `${rc.roomShape} ` : "";
    let s1 = `Interior design makeover: redesign this ${shapeStr}${roomType}.`;
    if (fingerprint) {
      const descriptorCount = fingerprint.confidence > 0.4 ? 3 : 2;
      const descriptors = dominantDescriptors(
        fingerprint.dimensions,
        descriptorCount,
      );
      if (descriptors.length > 0) {
        const stylePrefix =
          fingerprint.confidence > 0.7 ? "Style:" : "Style leaning toward:";
        s1 += ` ${stylePrefix} ${descriptors.join(", ")}.`;
      }
    }
    core.push(s1);
  }

  // ─── SECTION 2 — MATERIAL PALETTE ─────────────────────────────────────
  if (fingerprint) {
    const palette = getMaterialPalette(fingerprint.dimensions);
    if (palette) core.push(palette + ".");
  }

  // ─── SECTION 3 — SPATIAL ENVELOPE ─────────────────────────────────────
  if (rc) {
    const ceilDetail = rc.ceilingDetail ? ` with ${rc.ceilingDetail}` : "";
    let s3 = `${rc.ceilingHeight} ceiling${ceilDetail}. ${rc.roomShape} room, ${rc.estimatedDimensions}.`;
    if (cons?.physicalConstraints?.length > 0) {
      s3 += ` Fixed elements: ${cons.physicalConstraints.join(", ")}.`;
    }
    core.push(s3);
  }

  // ─── SECTION 4 — LIGHTING ──────────────────────────────────────────────
  if (rc) {
    const lightMap: Record<string, string> = {
      morning: "Soft morning light, cool blue tones, eastern windows",
      afternoon: "Warm afternoon light, long shadows, golden quality",
      evening: "Golden evening light, warm amber atmosphere",
      "always-dim": "Soft interior ambient lighting, no strong natural light",
    };
    const lightBase =
      lightMap[cons?.bestLightTime ?? ""] ?? "Natural ambient light";
    const s4 = `${lightBase}. ${rc.naturalLightQuality} quality, ${rc.windowCount} ${rc.windowSize} windows from ${rc.naturalLightDirection}.`;
    core.push(s4);
  }

  // ─── SECTION 5 — MATERIALS ─────────────────────────────────────────────
  if (rc) {
    let s5 = `${rc.floorMaterial} flooring in ${rc.floorColor}.`;
    if (cons?.wallPermanence === "renting-no-paint") {
      s5 += ` Walls remain ${rc.wallColor} — no painting permitted.`;
    } else {
      const accentPart =
        rc.hasAccentWall && rc.accentWallColor
          ? `, accent wall in ${rc.accentWallColor}`
          : "";
      s5 += ` Walls in ${rc.wallColor}${accentPart}, ${rc.wallTexture} finish.`;
    }
    if (rc.architecturalFeatures?.length > 0) {
      s5 += ` Featuring ${rc.architecturalFeatures.slice(0, 3).join(", ")}.`;
    }
    core.push(s5);
  }

  // ─── SECTION 6 — SCREEN B CONSTRAINTS ─────────────────────────────────
  if (cons) {
    const constraints: string[] = [];
    if (cons.hasPetsOrKids) {
      constraints.push(
        "Performance fabrics only — no velvet, silk, or fragile materials. Rounded furniture corners preferred.",
      );
    }
    if (cons.storagePriority === "high") {
      constraints.push(
        "Prioritize storage — shelving, ottomans with storage, console cabinets.",
      );
    }
    if (cons.whoUsesRoom?.includes("family-kids")) {
      constraints.push("Family-friendly layout with clear pathways.");
    }
    if (cons.offScreenPieces) {
      constraints.push(`Must accommodate: ${cons.offScreenPieces}.`);
    }
    const delta = cons.styleDirectionDelta;
    if (delta) {
      // FIX 1: Threshold lowered from 1/-1 to 0.5/-0.5 to catch fractional slider values
      if (delta.coziness >= 0.5)
        constraints.push("Shift warmer and cozier than current.");
      else if (delta.coziness <= -0.5)
        constraints.push("Shift more minimal and spare than current.");
      if (delta.colorBoldness >= 0.5)
        constraints.push("Push color palette bolder than current.");
      else if (delta.colorBoldness <= -0.5)
        constraints.push("Keep palette more neutral than current.");
      if (delta.traditionality >= 0.5)
        constraints.push("More traditional character than current.");
      else if (delta.traditionality <= -0.5)
        constraints.push("More contemporary than current.");
    }
    if (constraints.length > 0) core.push(constraints.join(" "));
  }

  // ─── SECTION 7 — REPLACE CLAUSE ────────────────────────────────────────
  {
    let s7 = "Replace all furniture, rugs, art and decor.";
    const keptObjects =
      keepMask?.objects?.filter((o) => o.keep || o.immovable) ?? [];
    if (keptObjects.length > 0) {
      const objectDescs = keptObjects
        .map((o) => {
          const bits = [
            `${o.type} in ${o.material ?? "unknown material"} (${o.dominantColor ?? "unknown color"})`,
          ];
          if (o.userNote) bits.push(`— ${o.userNote}`);
          if (o.immovable) bits.push("— position unchanged");
          return bits.join(" ");
        })
        .join(", ");
      s7 += ` Preserve from original room: ${objectDescs}.`;
    }
    core.push(s7);
  }

  // ─── SECTION 8 — REQUESTED PRODUCTS ───────────────────────────────────
  if (requestedProducts?.length > 0) {
    const confirmed = requestedProducts
      .filter((p) => p.confirmedByUser)
      .slice(0, 3);
    if (confirmed.length > 0) {
      const productParts = confirmed.map((p) => {
        if (p.placementIntent === "specific" && p.placementHint) {
          return `${p.fluxDescription}, placed ${p.placementHint}.`;
        }
        return `Include: ${p.fluxDescription}.`;
      });
      core.push(productParts.join(" "));
    }
  }

  // ─── SECTION 9 — ART DIRECTION ─────────────────────────────────────────
  if (artBrief?.hasArtDirection) {
    const artParts: string[] = [];
    artParts.push(
      `Wall art: ${artBrief.visualDirection}. ${artBrief.frameStyle} frame.`,
    );
    if (artBrief.galleryWall) artParts.push("Gallery wall arrangement.");
    if (artBrief.hasVinylCollection)
      artParts.push("Vinyl record shelf visible.");
    if (artBrief.hasBookCollection)
      artParts.push("Book collection on shelving.");
    core.push(artParts.join(" "));
  }

  // ─── SECTION 10 — TECH ─────────────────────────────────────────────────
  if (techSpec) {
    const techParts: string[] = [];
    if (techSpec.hasTV) {
      const size = techSpec.tvSizeInches ?? 55;
      const mountDesc =
        techSpec.tvMountType === "wall-mounted"
          ? "wall-mounted"
          : techSpec.tvMountType === "frame-tv"
            ? "frame TV displayed as artwork"
            : "on console";
      const wallPart =
        techSpec.tvPlacementWall && techSpec.tvPlacementWall !== "ai-decides"
          ? ` on ${techSpec.tvPlacementWall} wall`
          : "";
      techParts.push(`${size}" TV ${mountDesc}${wallPart}.`);
    } else {
      techParts.push("No television.");
    }
    if (techSpec.audioSetup && techSpec.audioSetup !== "none") {
      techParts.push(`${techSpec.audioSetup} audio setup.`);
    }
    if (techSpec.smartLighting && techSpec.lightingType) {
      techParts.push(`${techSpec.lightingType} lighting.`);
    }
    if (techSpec.hasWorkFromHome) {
      techParts.push(
        `Dedicated workspace: ${techSpec.wfhSetup ?? "desk and chair"}.`,
      );
    }
    if (techParts.length > 0) core.push(techParts.join(" "));
  }

  // ─── SECTION 11 — SENSORY (trimmable) ─────────────────────────────────
  if (sensoryProfile) {
    const sensoryParts: string[] = [];

    const cushionMap: Record<number, string> = {
      1: "Minimal soft furnishings — one folded throw, no excess cushions.",
      2: "A throw blanket and two cushions.",
      3: "Several cushions, draped throw blanket.",
      4: "Layered cushions and multiple throw blankets.",
      5: "Maximalist soft furnishings — cushions and blankets throughout.",
    };
    const cushion = cushionMap[sensoryProfile.throwCushionDensity];
    if (cushion) sensoryParts.push(cushion);

    // FIX 2: medium-few now uses plantSpecies when available
    const plantMap: Record<string, string> = {
      none: "",
      "small-few": sensoryProfile.plantSpecies?.length
        ? `A few small ${sensoryProfile.plantSpecies.slice(0, 2).join(" and ")} plants.`
        : "A few small potted plants.",
      "medium-few": sensoryProfile.plantSpecies?.length
        ? `Several ${sensoryProfile.plantSpecies.slice(0, 2).join(" and ")} plants at focal points.`
        : "Several medium plants at focal points.",
      "large-statement": sensoryProfile.plantSpecies?.[0]
        ? `Large statement ${sensoryProfile.plantSpecies[0]} floor plant.`
        : "Large statement floor plant.",
      "full-biophilic": sensoryProfile.plantSpecies?.length
        ? `Full biophilic treatment — ${sensoryProfile.plantSpecies.slice(0, 3).join(", ")} and more throughout.`
        : "Full biophilic treatment — abundant plants throughout.",
    };
    const plant = plantMap[sensoryProfile.plantPresence];
    if (plant) sensoryParts.push(plant);

    if (sensoryProfile.hasRug && sensoryProfile.rugStyle) {
      sensoryParts.push(
        `${sensoryProfile.rugSize ?? "area"} rug, ${sensoryProfile.rugStyle}${
          sensoryProfile.rugColor ? `, ${sensoryProfile.rugColor}` : ""
        }.`,
      );
    }

    if (sensoryProfile.windowTreatments !== "none") {
      sensoryParts.push(
        `${sensoryProfile.windowTreatments}${
          sensoryProfile.windowTreatmentColor
            ? ` in ${sensoryProfile.windowTreatmentColor}`
            : ""
        }.`,
      );
    }

    if (sensoryParts.length > 0) trimmable.push(sensoryParts.join(" "));
  }

  // ─── SECTION 12 — IDENTITY + MOOD (trimmable) ─────────────────────────
  if (identityBrief) {
    const identityParts: string[] = [];

    if (identityBrief.culturalReference) {
      const intensity = identityBrief.culturalReferenceIntensity ?? "subtle";
      identityParts.push(
        `${intensity} ${identityBrief.culturalReference} cultural influence.`,
      );
    }

    if (identityBrief.fandoms?.length) {
      const fandomMap: Record<string, string> = {
        "star wars":
          "industrial metals, dramatic chiaroscuro lighting, monochrome with blue accents",
        "studio ghibli":
          "organic curves, abundant plants, warm wood, whimsical soft art",
        jazz: "warm amber tones, vinyl shelf, rich wood, low ambient lighting",
        photography: "curated gallery wall, black frames, neutral backdrop",
      };
      const fandom = (identityBrief.fandoms[0] ?? "").toLowerCase();
      const descriptor =
        fandomMap[fandom] ??
        "personal character expressed through curated objects";
      identityParts.push(`${descriptor}.`);
    }

    if (identityBrief.sentimentalObjects?.length) {
      identityParts.push(
        `${identityBrief.sentimentalObjects[0]!.description} featured prominently as a focal point.`,
      );
    }

    if (identityBrief.moodKeywords?.length) {
      identityParts.push(
        `Overall atmosphere: ${identityBrief.moodKeywords.join(", ")}.`,
      );
    }

    if (identityBrief.moodTarget) {
      identityParts.push(`The room should feel: ${identityBrief.moodTarget}.`);
    }

    if (sensoryProfile?.overallDensity) {
      const densityMap: Record<string, string> = {
        minimal: "Sparse composition — every object intentional.",
        balanced: "Comfortable density, curated.",
        maximalist: "Abundant objects, rich layering.",
      };
      const d = densityMap[sensoryProfile.overallDensity];
      if (d) identityParts.push(d);
    }

    if (identityParts.length > 0) trimmable.push(identityParts.join(" "));
  }

  // ─── SECTION 13 — BUDGET QUALITY (trimmable) ──────────────────────────
  if (budget) {
    let budgetDesc: string;
    if (budget.rangeMax < 2000) {
      budgetDesc = "Affordable accessible pieces, high-street furniture.";
    } else if (budget.rangeMax < 5000) {
      budgetDesc = "Quality mid-range furniture, well-made everyday pieces.";
    } else if (budget.rangeMax < 15000) {
      budgetDesc = "Premium materials, considered investment pieces.";
    } else {
      budgetDesc = "Designer furniture, investment pieces, bespoke details.";
    }
    trimmable.push(budgetDesc);
  }

  // ─── SECTION 14 — CAMERA + QUALITY CLOSER (always kept) ───────────────
  const cameraMap: Record<string, string> = {
    "eye-level": "Shot at eye level",
    "slightly-elevated": "Shot from slightly elevated angle",
    "corner-wide": "Wide angle shot from corner of room",
    "straight-on": "Straight-on shot facing primary wall",
  };
  const cameraAngle = rc?.cameraAngle ?? "eye-level";
  const focalLength = rc?.focalLength ?? "standard";
  const closer = `${cameraMap[cameraAngle] ?? "Shot at eye level"}, ${focalLength} lens. Photorealistic, Architectural Digest quality, professionally staged.`;

  // ─── ASSEMBLY WITH 2400-CHAR CAP ───────────────────────────────────────
  const fullSections = [...core, ...trimmable, closer];
  const fullPrompt = fullSections.filter(Boolean).join(" ");

  if (fullPrompt.length <= 2400) return fullPrompt;

  let trimmed = [...core, closer].filter(Boolean).join(" ");
  for (const section of trimmable) {
    const candidate =
      trimmed.slice(0, -closer.length).trim() + " " + section + " " + closer;
    if (candidate.length <= 2400) trimmed = candidate;
  }

  return trimmed;
}
// ── Re-export RoomPhysicalContext for backward compat ────────────────────────

export type RoomPhysicalContext = {
  roomLength?: number | null;
  roomWidth?: number | null;
  ceilingHeight?: number | null;
  naturalLight?: string | null;
  floorType?: string | null;
  wallFinish?: string | null;
  fixedElements?: string[];
  wallLayout?: {
    top: Array<{ type: string; position: number }>;
    bottom: Array<{ type: string; position: number }>;
    left: Array<{ type: string; position: number }>;
    right: Array<{ type: string; position: number }>;
  } | null;
};
