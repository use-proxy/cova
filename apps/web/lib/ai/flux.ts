import Replicate from "replicate";
import type { StyleFingerprint } from "@/types/fingerprint";
import type { RoomAnalysis } from "@/lib/store/room";
import type { DetectedObject, RequestedProduct } from "@/lib/types/area2";
import {
  buildPreservationInstructions,
  type RoomArchitecture,
} from "./room-analyzer";
import { expandForPrompt } from "./style-match";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// ── Model constants ───────────────────────────────────────────────────────────
// FLUX Kontext Pro is an image-edit model: it takes `input_image` (singular)
// and preserves the composition, camera angle, and architecture of the input
// while modifying the scene according to the prompt. This is exactly what
// Cova promises: "Your room, redesigned". Verified 2026-04-08 with a live
// room photo — output preserved all architecture and only swapped furniture/decor.
// DO NOT swap this model without re-running the live architecture-preservation test.
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
const NEUTRAL_BAND = 0.1;

const BUDGET_MODIFIERS: Record<string, string> = {
  budget: "affordable accessible pieces, high-street furniture",
  mid: "quality mid-range furniture, well-made everyday pieces",
  premium: "premium materials, considered investment pieces",
  luxury: "designer furniture, investment pieces, bespoke details",
};

// ── buildFluxPrompt ───────────────────────────────────────────────────────────
//
// Kontext Pro is an edit-instruction model, not a scene-description model.
// Live-tested 2026-04-08: a transformation-first structure produced a 9/10
// coastal redesign that preserved all structural elements (ceiling fixtures,
// wall-mounted decorations, window treatments, wall color and carpet)
// while swapping in new furniture and decor.
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
  anchorPrompt?: string | null;
  // Deterministic trait tags derived from fingerprint dimensions (e.g. "Warm
  // Tones", "Biophilic Warmth"). Added as explicit style direction in the
  // prompt to reinforce the strongest dimension signals.
  styleTags?: string[];
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
export function getMaterialPalette(d: StyleFingerprint["dimensions"]): string {
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
  if (d.lightPreference >= 0.6)
    return "Maximize natural daylight — open, luminous, airy atmosphere throughout";
  if (d.lightPreference <= 0.35)
    return "Transform to intimate lamp-lit warmth — pools of warm incandescent light, cozy shadows, no harsh overhead";
  return "Balance natural and ambient light with soft diffused fill";
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

// ── Full fingerprint → prompt mapping ───────────────────────────────────────
// Maps each of the 12 dimensions to a specific prompt phrase when its value
// deviates from the neutral midpoint. Mid-scores (0.4-0.6) contribute
// nothing — only strong directional signals are emitted. Output is capped
// at ~120 characters to stay inside the total prompt budget.
//
// This reduces the lossiness of the prior dominantDescriptors() approach
// which only kept the top 3-4 dimensions and dropped the rest.

const FINGERPRINT_PHRASE_MAP: Record<DimKey, { high: string; low: string }> = {
  colorTemperature: {
    high: "warm amber undertones, honey oak, terracotta accents",
    low: "cool grey undertones, slate, bleached wood",
  },
  colorSaturation: {
    high: "rich saturated jewel tones, bold color statements",
    low: "muted dusty palette, desaturated earth tones",
  },
  density: {
    high: "richly furnished, layered accessories, curated collection",
    low: "deliberate negative space, restrained furnishing, breathing room",
  },
  formality: {
    high: "structured symmetry, formal arrangement, architectural poise",
    low: "relaxed asymmetric layout, casual grouping, lived-in comfort",
  },
  era: {
    high: "heritage patina, vintage character, time-worn richness",
    low: "contemporary clean lines, modern restraint, cutting-edge silhouettes",
  },
  material: {
    high: "natural organic materials, raw wood, handcrafted textures",
    low: "sleek manufactured surfaces, lacquer, polished metal",
  },
  texture: {
    high: "rich layered textures, bouclé, woven linen, aged leather",
    low: "smooth polished surfaces, lacquered finishes, glass",
  },
  pattern: {
    high: "pattern-rich surfaces, decorative motifs, textile layering",
    low: "solid planes, quiet surfaces, minimal ornament",
  },
  lineQuality: {
    high: "soft organic curves, rounded silhouettes, flowing forms",
    low: "sharp geometric angles, crisp edges, rectilinear precision",
  },
  lightPreference: {
    high: "bright airy daylight, large windows, luminous atmosphere",
    low: "cozy intimate lamp pools, dim warm shadows, candlelit mood",
  },
  nature: {
    high: "biophilic layering, abundant greenery, living plants throughout",
    low: "urban restraint, minimal greenery, refined interior",
  },
  culturalInfluence: {
    high: "globally eclectic references, curated world influences, layered heritage",
    low: "clean Western contemporary, refined Euro-American sensibility",
  },
};

/**
 * Build a comprehensive prompt section from ALL 12 fingerprint dimensions.
 * Each dimension contributes a phrase when it's strongly directional
 * (outside the neutral band). Mid-scores emit nothing.
 *
 * Returns a single comma-separated string capped at 120 characters.
 * Returns empty string when no dimensions are directional.
 */
export function buildFullFingerprintPhrase(
  d: StyleFingerprint["dimensions"],
): string {
  const entriesWithDev = (Object.keys(FINGERPRINT_PHRASE_MAP) as DimKey[])
    .map((key) => ({ key, dev: Math.abs(d[key] - NEUTRAL_MIDPOINT) }))
    .filter((e) => e.dev > NEUTRAL_BAND)
    .sort((a, b) => b.dev - a.dev);

  if (entriesWithDev.length === 0) return "";

  const orderedPhrases = entriesWithDev.map((e) => {
    const v = d[e.key];
    return v > NEUTRAL_MIDPOINT
      ? FINGERPRINT_PHRASE_MAP[e.key].high
      : FINGERPRINT_PHRASE_MAP[e.key].low;
  });

  let joined = orderedPhrases.join(", ");
  // Cap at 120 chars — drop phrases from the end if over budget
  while (joined.length > 120 && orderedPhrases.length > 1) {
    orderedPhrases.pop();
    joined = orderedPhrases.join(", ");
  }
  // Final hard cap in case a single phrase is too long
  if (joined.length > 120) joined = joined.slice(0, 117) + "...";
  return joined;
}

// Internal anchor style names must never appear verbatim in FLUX prompts.
// Replace with descriptive phrases the model handles better anyway.
const FORBIDDEN_STYLE_NAMES = [
  // Compound anchor names (longest match first to avoid partial clobber)
  "warm japandi",
  "pure minimal white",
  "coastal bright",
  "biophilic jungle",
  "dark moody glam",
  "heritage traditional",
  "industrial loft",
  "maximalist eclectic",
  "retro mid-century",
  // Bare style words forbidden by CLAUDE.md Rule 8 — stripped from user text
  "mid-century modern",
  "mid-century",
  "minimalist",
  "japandi",
  "bohemian",
  "coastal",
];

const STYLE_NAME_REPLACEMENTS: Record<string, string> = {
  // Compound anchor names first so they take priority over bare-word matches
  "warm japandi": "calm warm naturalism with clean lines",
  "pure minimal white": "purposeful bright simplicity",
  "coastal bright": "relaxed sun-drenched natural lightness",
  "biophilic jungle": "lush nature-immersed organic abundance",
  "dark moody glam": "rich dramatic atmosphere with luxe finishes",
  "heritage traditional": "timeless layered craftsmanship",
  "industrial loft": "raw urban materiality with exposed structure",
  "maximalist eclectic": "boldly layered pattern-rich eclecticism",
  "retro mid-century": "warm retro modernism with sculptural furniture",
  // Bare forbidden style words (Rule 8) — replaced with descriptive phrases
  "mid-century modern": "warm retro modernism with teak and brass accents",
  "mid-century": "retro modernism with sculptural furniture",
  "minimalist": "purposeful negative space with refined restraint",
  "japandi": "calm warm naturalism with clean lines",
  "bohemian": "layered textural depth with collected character",
  "coastal": "relaxed weathered materials with natural lightness",
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
    result = result
      .replace(new RegExp(name, "gi"), "")
      .replace(/\s{2,}/g, " ")
      .trim();
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
    constraints: rawConstraints,
    keptItemLabels: rawKeptItemLabels,
    quizPreviewMode,
    anchorPrompt: rawAnchorPrompt,
    styleTags,
  } = params;
  const anchorPrompt = rawAnchorPrompt ? sanitizeUserText(rawAnchorPrompt) : "";
  const anchorBlock = anchorPrompt ? `${anchorPrompt}. ` : "";
  // Sanitize all user-provided text inputs
  const inclusions = rawInclusions.map(sanitizeUserText).filter(Boolean);
  const constraints = (rawConstraints ?? [])
    .map(sanitizeUserText)
    .filter(Boolean);
  const keptItemLabels = rawKeptItemLabels
    .map(sanitizeUserText)
    .filter(Boolean);
  // V2 fingerprints store merged dims in non-semantic DB slots — expand to
  // semantically correct 12-dim values for prompt generation.
  const d = expandForPrompt(fingerprint) as StyleFingerprint["dimensions"];
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

    // 1b. Style tag direction — deterministic signals from fingerprint dims
    if (!quizPreviewMode && styleTags && styleTags.length > 0) {
      core.push(`Style influences: ${styleTags.join(', ')}`);
    }

    // 2. Material palette (concrete names beat abstract style words)
    const palette = getMaterialPalette(d);
    if (palette) core.push(palette);

    // 3. Top-N dominant style descriptors
    const descriptors = dominantDescriptors(d, descriptorCount);
    const activeDims = (Object.keys(DESCRIPTORS) as DimKey[]).filter(
      (k) => Math.abs((d[k] ?? 0.5) - 0.5) > NEUTRAL_BAND,
    );
    if (activeDims.length === 0) {
      // All dims near neutral — fall back to top 2 by absolute deviation
      const top2 = (Object.keys(DESCRIPTORS) as DimKey[])
        .map((k) => ({ k, dev: Math.abs((d[k] ?? 0.5) - 0.5) }))
        .sort((a, b) => b.dev - a.dev)
        .slice(0, 2);
      for (const { k, dev } of top2) {
        const entry = DESCRIPTORS[k];
        if (entry) descriptors.push(dev > 0 ? entry.hi : entry.lo);
      }
    }
    if (descriptors.length > 0) {
      core.push(anchorBlock + descriptors.join(", "));
    } else if (anchorBlock) {
      core.push(anchorBlock.trim().replace(/\.$/, ""));
    }

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
      // Minimal architecture anchor — Kontext Pro sees the room, this is just
      // a light reminder. Full Gemini PRESERVE goes to pass 2 only.
      tail.push(
        "Preserve all walls, floor, ceiling, windows, and camera angle exactly.",
      );

      // Wire constraints — user-specified rejections are high signal
      if (constraints.length > 0) {
        tail.push("Avoid: " + constraints.slice(0, 3).join(", ") + ".");
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

// ── submitRender — LEGACY Replicate Kontext Pro path ─────────────────────────
// LEGACY - do not add new calls here. Phase 4b uses fal.ai Kontext Pro via Modal.
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
  originalPhotoUrl: string,
  arch: RoomArchitecture,
): Promise<string> {
  const fixed =
    arch.fixedElements.length > 0
      ? ` Do not change: ${arch.fixedElements.join(", ")}.`
      : "";

  const correctionPrompt =
    `Architectural correction pass. Image 1 is the original room. Image 2 is a redesigned version. ` +
    `Make Image 2 match Image 1's architecture exactly. ` +
    buildPreservationInstructions(arch) +
    ` The furniture style and decor in Image 2 are correct — only fix architecture if ` +
    `walls, floor, ceiling, windows, or camera angle drifted from Image 1.` +
    fixed +
    ` If architecture already matches, keep Image 2 exactly as is.`;

  const prediction = await replicate.predictions.create({
    model: MULTI_KONTEXT_MODEL,
    input: {
      input_image_1: originalPhotoUrl,
      input_image_2: pass1OutputUrl,
      prompt: correctionPrompt,
      output_format: "png",
      safety_tolerance: 2,
    },
  });
  return prediction.id;
}

// ── submitFillRender — LEGACY Replicate path, do not add new calls here ───────
// LEGACY - do not add new calls here. Phase 4b uses fal.ai Fill Pro via Modal.
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

// ── buildAnchorFallbackPrompt ────────────────────────────────────────────────
//
// Anchor-strategy fallback used by the redesign route when the Claude prompt
// compiler returns null. Unlike the generic buildFluxPrompt, this always
// frames kept items as ANCHORS (never "preserve the X"), removed items as
// VACATED ZONES with a style-direction replacement, and ends with a Rule-4
// final constraint. Target: 200-300 words.
//
// Must stay in lockstep with the Claude system prompt in prompt-compiler.ts.

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

export interface AnchorFallbackParams {
  fingerprint: StyleFingerprint;
  roomType: string;
  context: RenderContext | null;
  styleBlend: Record<string, number> | null;
  anchorPrompt?: string | null;
  cameraAngle?: string;
  focalLength?: string;
}

export function buildAnchorFallbackPrompt(
  params: AnchorFallbackParams,
): string {
  const {
    roomType,
    context,
    styleBlend,
    anchorPrompt: rawAnchor,
    cameraAngle: rawCamera,
    focalLength: rawFocal,
  } = params;
  const fp = params.fingerprint?.dimensions;
  const fingerprintClause = fp
    ? [
        fp.colorTemperature > 0.7
          ? "warm amber color palette"
          : fp.colorTemperature < 0.3
            ? "cool slate color palette"
            : "",
        fp.material > 0.6
          ? "natural organic materials"
          : fp.material < 0.4
            ? "sleek manufactured materials"
            : "",
        fp.lightPreference > 0.6
          ? "bright daylight lighting"
          : fp.lightPreference < 0.4
            ? "cozy warm lighting"
            : "",
        fp.density > 0.6
          ? "richly layered atmosphere"
          : fp.density < 0.4
            ? "sparse minimal atmosphere"
            : "",
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  const direction = deriveReplacementDirection(styleBlend);
  const kept = (context?.keepMask?.objects ?? []).filter(
    (o) => o.keep || o.immovable,
  );
  const removed = (context?.keepMask?.objects ?? []).filter(
    (o) => !o.keep && !o.immovable,
  );

  const describeKept = (o: DetectedObject): string => {
    const bits: string[] = [];
    const label = sanitizeUserText(o.type ?? "item");
    const color = o.dominantColor ? sanitizeUserText(o.dominantColor) : null;
    const material = o.material ? sanitizeUserText(o.material) : null;
    const size = o.sizeInRoom ? String(o.sizeInRoom) : null;
    const descriptors: string[] = Array.isArray(o.styleDescriptors)
      ? o.styleDescriptors
          .map((s: string) => sanitizeUserText(s))
          .filter(Boolean)
      : [];
    const note = o.userNote ? sanitizeUserText(o.userNote) : null;

    const enriched: string[] = [];
    if (color) enriched.push(color);
    if (material) enriched.push(material);
    if (descriptors.length) enriched.push(descriptors.slice(0, 3).join(", "));
    if (size) enriched.push(size);

    if (enriched.length === 0) {
      bits.push(
        `• The existing ${label} is an anchor — do not alter its color, material, form, or position.`,
      );
    } else {
      bits.push(
        `• The existing ${color ? color + " " : ""}${label}${material ? " in " + material : ""}${descriptors.length ? " — " + descriptors.slice(0, 3).join(", ") : ""}${size ? ` (${size})` : ""}${note ? ` (${note})` : ""} is a fixed anchor. Do not alter its color, material, form, or position.`,
      );
    }
    return bits.join(" ");
  };

  const keptLabels = kept.map((o) => sanitizeUserText(o.type));
  const removedLabels = removed.map((o) => sanitizeUserText(o.type));

  const transformationLine =
    removedLabels.length > 0
      ? `Transform the ${removedLabels.map((l) => `${l} zone`).join(", ")} into a ${direction} ${roomType}. Introduce new pieces that work with the anchoring ${keptLabels.length > 0 ? keptLabels.join(" and ") : "architecture"}.`
      : `Transform this ${roomType} into a ${direction} space, working around the anchoring ${keptLabels.join(" and ") || "architecture"}.`;

  const anchorsBlock =
    kept.length > 0
      ? [
          "Anchoring pieces — treat these as fixed. Do not alter their color, material, form, or position:",
          ...kept.map(describeKept),
        ].join("\n")
      : "";

  const vacatedBlock =
    removed.length > 0
      ? [
          "Vacated zones — redesign these areas completely:",
          ...removed.map(
            (o) =>
              `• ${sanitizeUserText(o.type)} zone: introduce a ${direction} replacement that harmonizes with the anchors.`,
          ),
        ].join("\n")
      : "";

  // Structural context
  const rc = context?.roomContext;
  const cons = context?.roomConstraints;
  const structural: string[] = [];
  if (rc?.ceilingHeight) {
    const detail = rc.ceilingDetail ? ` with ${rc.ceilingDetail}` : "";
    structural.push(`Ceiling: ${rc.ceilingHeight}${detail}.`);
  }
  if (cons?.physicalConstraints && cons.physicalConstraints.length > 0) {
    structural.push(
      `Structural fixtures: ${cons.physicalConstraints.join(", ")}.`,
    );
  }
  if (rc?.floorMaterial) {
    const keepFloor = (cons?.physicalConstraints ?? [])
      .join(" ")
      .toLowerCase()
      .includes("replace existing flooring")
      ? "Replace"
      : "Keep";
    structural.push(`Existing flooring: ${rc.floorMaterial}. ${keepFloor} it.`);
  }
  if (cons?.bestLightTime && rc?.windowCount) {
    structural.push(
      `Natural light: brightest in the ${cons.bestLightTime}. ${rc.windowCount} windows.`,
    );
  }

  // Requested products
  const requested = (context?.requestedProducts ?? [])
    .filter((p: RequestedProduct) => p.confirmedByUser)
    .slice(0, 4);
  const requestedLine =
    requested.length > 0
      ? `Specific products requested: ${requested
          .map((p: RequestedProduct) =>
            sanitizeUserText(
              `${p.scrapedData?.name ?? p.originalInput} — ${p.fluxDescription ?? ""}`,
            ),
          )
          .join("; ")}.`
      : "";

  // Materials palette
  const materialsLine = fp
    ? `New materials: ${getMaterialPalette(expandForPrompt(params.fingerprint) as StyleFingerprint["dimensions"]) || "natural materials"}.`
    : "";

  // Decor layering (Rule 5) — plants by species when nature dimension is high
  const densityVal = fp?.density ?? 0.5;
  const natureVal = fp?.nature ?? 0.5;
  const plantNames = natureVal > 0.7
    ? "fiddle leaf fig, trailing pothos, snake plant, monstera"
    : natureVal > 0.5
      ? "fiddle leaf fig, trailing pothos"
      : "a potted plant";
  const minDecor = densityVal > 0.7 ? 10 : 8;
  const decorLine = `Layer with: ${plantNames}, ceramic vessels, art books, chunky knit throw, jute rug. Minimum ${minDecor} decorative objects.`;

  // User notes
  const notesLine = rc?.userNotes
    ? `Special requirements: "${sanitizeUserText(rc.userNotes)}".`
    : "";

  // Style reference directive
  const anchorPrompt = rawAnchor ? sanitizeUserText(rawAnchor) : "";
  const styleRefLine = anchorPrompt
    ? `Apply the aesthetic from the reference image to the vacated zones only — not to the anchoring pieces. Reference direction: ${anchorPrompt}.`
    : "";

  // Budget
  const budget = context?.budget;
  let budgetLine = "";
  if (
    budget &&
    (budget.rangeMin !== undefined || budget.rangeMax !== undefined)
  ) {
    const min = budget.rangeMin ?? 0;
    const max = budget.rangeMax;
    const tier =
      max === undefined || max === null
        ? "mid"
        : max <= 2000
          ? "budget"
          : max <= 5000
            ? "mid"
            : max <= 10000
              ? "premium"
              : "luxury";
    const rangeStr =
      max !== undefined && max !== null ? `$${min}–$${max}` : `$${min}+`;
    budgetLine = `Budget: ${rangeStr} (${tier} tier).`;
  }

  // Final constraint (Rule 4)
  const finalConstraint =
    keptLabels.length > 0
      ? `Final constraint: ${keptLabels.join(", ")} must appear identical to the input image — same position, color, material, and form. Only the vacated zones are to be redesigned.`
      : `Final constraint: the walls, floor, ceiling, windows, doors, and camera angle must appear identical to the input image. Only the furniture and decor in the vacated zones are to be redesigned.`;

  const cameraAngle =
    rawCamera ?? context?.roomContext?.cameraAngle ?? "straight-on view";
  const focalLength = rawFocal ?? context?.roomContext?.focalLength ?? "24mm";

  const closer = `Photorealistic interior photograph, ${cameraAngle}, ${focalLength}, f/8. No people, no text.`;

  const sections = [
    transformationLine,
    fingerprintClause,
    anchorsBlock,
    vacatedBlock,
    materialsLine,
    decorLine,
    structural.join(" "),
    requestedLine,
    notesLine,
    styleRefLine,
    budgetLine,
    finalConstraint,
    closer,
  ].filter(Boolean);

  const prompt = sections.join("\n\n");

  // Target 200-300 words. If over, trim structural/requested lines
  // gently while keeping anchors, vacated zones, final constraint, and closer.
  const wordCount = prompt.split(/\s+/).filter(Boolean).length;
  if (wordCount > 400) {
    const trimmed = [
      transformationLine,
      fingerprintClause,
      anchorsBlock,
      vacatedBlock,
      decorLine,
      budgetLine,
      finalConstraint,
      closer,
    ]
      .filter(Boolean)
      .join("\n\n");
    return sanitizeForbiddenStyleNames(trimmed);
  }
  return sanitizeForbiddenStyleNames(prompt);
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
// Hard cap: 2800 chars. If over, trim sections 11→13 proportionally,
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
      const expandedDims = expandForPrompt(fingerprint) as StyleFingerprint["dimensions"];
      const descriptors = dominantDescriptors(
        expandedDims,
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

  // ─── SECTION 1b — FULL FINGERPRINT PHRASE (all 12 dimensions) ────────
  // Ensures dimensions beyond the top-3 still contribute to the prompt.
  if (fingerprint) {
    const expDims = expandForPrompt(fingerprint) as StyleFingerprint["dimensions"];
    const fullPhrase = buildFullFingerprintPhrase(expDims);
    if (fullPhrase) core.push(fullPhrase + ".");
  }

  // ─── SECTION 2 — MATERIAL PALETTE ─────────────────────────────────────
  if (fingerprint) {
    const expDims2 = expandForPrompt(fingerprint) as StyleFingerprint["dimensions"];
    const palette = getMaterialPalette(expDims2);
    if (palette) core.push(palette + ".");
  }

  // ─── SECTION 3 — SPATIAL ENVELOPE (structural, not additive) ─────────
  // Ceiling height is a HIGH-impact constraint — it drives vertical scale
  // and the scale of wall-hung elements. Treat it as a structural directive.
  if (rc) {
    const ceilDetail = rc.ceilingDetail ? ` with ${rc.ceilingDetail}` : "";
    let s3 = `${rc.ceilingHeight} ceiling${ceilDetail}. ${rc.roomShape} room, ${rc.estimatedDimensions}.`;

    // Parse ceiling height to number (handle strings like "10ft", "8 ft", "2.4m")
    const ceilStr = rc.ceilingHeight?.toString() ?? "";
    const ceilMatch = ceilStr.match(/([\d.]+)/);
    const ceilFt = ceilMatch ? parseFloat(ceilMatch[1]!) : 9;
    // Rough metric conversion — if value < 5 assume meters
    const ceilFtNormalized = ceilFt < 5 ? ceilFt * 3.28 : ceilFt;

    if (ceilFtNormalized >= 10) {
      s3 +=
        " Grand vertical space — artwork scaled to full wall height, tall bookcases or statement pendant lighting, vertical emphasis throughout.";
    } else if (ceilFtNormalized <= 8) {
      s3 +=
        " Intimate human-scale proportions — horizontal emphasis, low-profile furniture, no tall vertical elements.";
    }

    if (cons?.physicalConstraints?.length > 0) {
      // Fixtures are HIGH impact if they include fireplace/built-ins/brick
      const fixtures = cons.physicalConstraints.join(" ").toLowerCase();
      const hasFireplace = fixtures.includes("fireplace");
      const hasBuiltIns =
        fixtures.includes("built-in") || fixtures.includes("built in");
      const hasExposedBrick = fixtures.includes("brick");

      s3 += ` Fixed elements: ${cons.physicalConstraints.join(", ")}.`;

      if (hasFireplace) {
        s3 +=
          " Fireplace MUST be visible and lit in the render — render a fire or glowing embers.";
      }
      if (hasBuiltIns) {
        s3 +=
          " Built-in shelving MUST be preserved and styled — populate with books, art, and objects.";
      }
      if (hasExposedBrick) {
        s3 += " Exposed brick texture MUST be preserved exactly.";
      }
    }
    core.push(s3);
  }

  // ─── SECTION 4 — LIGHTING (structural, drives entire scene mood) ─────
  // Best light time drives color temperature AND shadow direction AND mood.
  // Treat it as a non-negotiable structural directive, not additive.
  if (rc) {
    const lightMap: Record<string, string> = {
      morning:
        "LIGHTING DIRECTIVE: Warm 5600K eastern morning light, energizing golden hour quality, long horizontal shadows raking east-to-west across floor and furniture, supplemented by 2700K ambient. Direction: from east.",
      afternoon:
        "LIGHTING DIRECTIVE: Productive 3200K western afternoon light, magic hour quality, diffuse warm amber fill, medium shadows, complementary 2700K accent lighting. Direction: from west.",
      evening:
        "LIGHTING DIRECTIVE: Intimate 2200K evening scene, dramatic pools of warm incandescent light, deep shadows between lit zones, no daylight visible. Mood: candlelit, lamp-lit.",
      "always-dim":
        "LIGHTING DIRECTIVE: Soft 2700K ambient interior lighting only, no directional light source shown, layered pools of warm light from lamps, no harsh overhead. Mood: cocooned.",
    };
    const lightBase =
      lightMap[cons?.bestLightTime ?? ""] ??
      "Natural ambient light, balanced exposure, soft fill.";
    const s4 = `${lightBase} ${rc.windowCount} ${rc.windowSize} windows from ${rc.naturalLightDirection}.`;
    core.push(s4);
  }

  // ─── SECTION 5 — MATERIALS (flooring is a hard preservation constraint) ─
  if (rc) {
    const floorLower = (rc.floorMaterial ?? "").toLowerCase();
    const isHardwood =
      floorLower.includes("hardwood") || floorLower.includes("wood");
    const keepFlooring =
      cons?.wallPermanence !== "renting-no-paint" ? true : true; // default keep
    let floorDesc: string;
    if (isHardwood && keepFlooring) {
      floorDesc = `PRESERVE existing ${rc.floorMaterial} flooring exactly — do not replace or cover the ${rc.floorColor} hardwood, natural patina retained`;
    } else if (isHardwood) {
      floorDesc = `${rc.floorMaterial} floors preserved, ${rc.floorColor} tone with natural patina`;
    } else {
      floorDesc = `${rc.floorMaterial} flooring in ${rc.floorColor}`;
    }
    let s5 = `${floorDesc}.`;
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
      1: "One throw draped casually over sofa arm, deliberate negative space.",
      2: "Two throws — one folded on sofa, one on accent chair — two cushions in varying sizes.",
      3: "Three throws artfully arranged across seating, several cushions in varying textures.",
      4: "Generous layering — throws on sofa, chair, and ottoman, multiple cushions in varying sizes and textures.",
      5: "Abundantly layered — every seating surface has throws and cushions, maximum textile warmth and visual richness.",
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
    "eye-level": "Shot from 5 feet height at eye level",
    "slightly-elevated": "Shot from slightly elevated angle",
    "corner-wide": "Wide angle shot from corner of room",
    "straight-on": "Straight-on shot facing primary wall",
  };
  const focalMap: Record<string, string> = {
    "wide-angle": "Carl Zeiss 21mm f/2.8 lens",
    standard: "24mm f/8 lens",
    "slight-telephoto": "35mm f/4 lens",
  };
  const cameraAngle = rc?.cameraAngle ?? "eye-level";
  const focalLength = rc?.focalLength ?? "standard";
  const closer = `Photorealistic interior photograph, ${cameraMap[cameraAngle] ?? "Shot at eye level"}, ${focalMap[focalLength] ?? "24mm f/8 lens"}, f/8, perfect exposure. No people, no text. Architectural Digest quality.`;

  // ─── ASSEMBLY WITH 2400-CHAR CAP ───────────────────────────────────────
  const fullSections = [...core, ...trimmable, closer];
  const fullPrompt = fullSections.filter(Boolean).join(" ");

  // Kontext Pro's real token limit is ~512 tokens ≈ 380 words ≈ 2800 chars,
  // but Section 1b (full fingerprint phrase) + strengthened sections 3/4/5
  // expand core beyond the previous 2400-char budget. Lift to 3200 to keep
  // identity/sensory sections from being trimmed in normal cases.
  const CHAR_CAP = 3200;

  if (fullPrompt.length <= CHAR_CAP) return fullPrompt;

  // Over budget — include as many trimmable sections as possible, in order
  const coreStr = core.filter(Boolean).join(" ");
  let assembled = coreStr;
  for (const section of trimmable) {
    const candidate = assembled + " " + section + " " + closer;
    if (candidate.length <= CHAR_CAP) {
      assembled = assembled + " " + section;
    }
  }
  assembled = assembled + " " + closer;

  return assembled;
}
// ── Phase 4b: fal.ai direct endpoints ────────────────────────────────────────
// These are used by Modal pipeline (generation.py) directly via fal-client.
// TypeScript wrappers provided here for potential direct-call paths from
// the web app (e.g., test routes, quick previews).

/**
 * Submit a Kontext Pro render via fal.ai (Route B: style transfer, no mask).
 * Endpoint: fal-ai/flux-pro/kontext
 * Returns: { requestId: string } for polling via fal.ai queue API.
 */
export async function submitFalKontextRender(params: {
  imageUrl: string;
  prompt: string;
  seed?: number;
}): Promise<{ requestId: string }> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) throw new Error("FAL_KEY not configured");

  const resp = await fetch("https://queue.fal.run/fal-ai/flux-pro/kontext", {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: params.imageUrl,
      prompt: params.prompt,
      num_inference_steps: 30,
      guidance_scale: 5.5,
      seed: params.seed ?? Math.floor(Math.random() * 999999),
      output_format: "jpeg",
      safety_tolerance: "5",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`fal.ai Kontext submit failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as { request_id: string };
  return { requestId: data.request_id };
}

/**
 * Submit a Fill Pro render via fal.ai (Route A: inpainting with mask).
 * Endpoint: fal-ai/flux-pro/v1/fill
 * Returns: { requestId: string } for polling via fal.ai queue API.
 */
export async function submitFalFillRender(params: {
  imageUrl: string;
  maskUrl: string;
  prompt: string;
  seed?: number;
}): Promise<{ requestId: string }> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) throw new Error("FAL_KEY not configured");

  const resp = await fetch("https://queue.fal.run/fal-ai/flux-pro/v1/fill", {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: params.imageUrl,
      mask_url: params.maskUrl,
      prompt: params.prompt,
      num_inference_steps: 30,
      guidance_scale: 30,
      seed: params.seed ?? Math.floor(Math.random() * 999999),
      output_format: "jpeg",
      safety_tolerance: "5",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`fal.ai Fill Pro submit failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as { request_id: string };
  return { requestId: data.request_id };
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
