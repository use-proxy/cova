/**
 * POST /api/quiz/tweak
 *
 * Interprets free-text style adjustments, applies them to the user's
 * fingerprint, runs softmaxStyleMatch, and returns a canonical style name.
 *
 * Input:  { fingerprint: StyleFingerprint, tweakText: string }
 * Output: { updatedFingerprint, styleName, styleDescription, styleTags }
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import type { StyleFingerprint } from "@/types/fingerprint";
import { softmaxStyleMatch, STYLES } from "@/lib/ai/style-match";
import { toDisplayName } from "@/lib/ai/anchor-display";

export const maxDuration = 45;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DIMENSION_KEYS = [
  "colorTemperature",
  "colorSaturation",
  "density",
  "formality",
  "era",
  "material",
  "texture",
  "pattern",
  "lineQuality",
  "lightPreference",
  "nature",
  "culturalInfluence",
] as const;

type DimensionKey = (typeof DIMENSION_KEYS)[number];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Weighted cosine similarity between an adjusted fingerprint vector and a
// style center vector (both in [0,1]). Mirrors the logic in softmaxStyleMatch.
function cosineSim(fp: number[], styleCenter: number[]): number {
  const NEUTRAL = 0.5;
  const W = [1.5, 1.2, 1.1, 0.9, 1.0, 1.3, 0.9, 1.0, 0.9, 1.4, 1.2, 0.8];
  const fpc = fp.map((v) => v - NEUTRAL);
  const sc = styleCenter.map((v) => v - NEUTRAL);
  let dot = 0, fn = 0, sn = 0;
  for (let i = 0; i < fpc.length; i++) {
    const w = W[i] ?? 1.0;
    dot += (fpc[i] ?? 0) * (sc[i] ?? 0) * w;
    fn += (fpc[i] ?? 0) ** 2 * w;
    sn += (sc[i] ?? 0) ** 2 * w;
  }
  return fn === 0 || sn === 0 ? 0 : dot / (Math.sqrt(fn) * Math.sqrt(sn));
}

// Maps user-facing display names back to internal STYLES array names.
const DISPLAY_TO_INTERNAL: Record<string, string> = {
  "Japandi": "Warm Japandi",
  "Dark & Moody": "Dark Moody Glam",
  "Coastal Light": "Coastal Bright",
  "Urban Industrial": "Industrial Loft",
  "Maximalist Eclectic": "Maximalist Eclectic",
  "Classic Traditional": "Heritage Traditional",
  "Minimalist": "Pure Minimal White",
  "Biophilic": "Biophilic Jungle",
  "Mid-Century Modern": "Retro Mid-Century",
};

function deriveTraitTags(
  dimensions: Record<string, number>
): string[] {
  const DIM_TAGS: Record<string, [string, string]> = {
    colorTemperature:  ['Cool Tones',        'Warm Tones'],
    colorSaturation:   ['Muted Palette',     'Bold Color'],
    density:           ['Clean & Spare',     'Richly Layered'],
    formality:         ['Casual & Relaxed',  'Formal & Structured'],
    era:               ['Ultra-Modern',      'Heritage Craft'],
    material:          ['Manufactured',      'Natural & Organic'],
    texture:           ['Sleek Surfaces',    'Tactile Rich'],
    pattern:           ['Pattern-Free',      'Pattern-Rich'],
    lineQuality:       ['Geometric Lines',   'Organic Forms'],
    lightPreference:   ['Dark Drama',        'Sun-Drenched'],
    nature:            ['Urban Edge',        'Biophilic Warmth'],
    culturalInfluence: ['Western Modern',    'Globally Eclectic'],
  }

  // Collect all dimensions with strong signal (>0.65 or <0.35)
  const strong = Object.entries(dimensions)
    .map(([key, value]) => ({
      key,
      value,
      deviation: Math.abs(value - 0.5),
      tag: value >= 0.65
        ? DIM_TAGS[key]?.[1]
        : value <= 0.35
        ? DIM_TAGS[key]?.[0]
        : null
    }))
    .filter(d => d.tag !== null)
    .sort((a, b) => b.deviation - a.deviation)

  // Return top 4 tags
  return strong.slice(0, 4).map(d => d.tag as string)
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    fingerprint?: StyleFingerprint;
    tweakText?: string;
    originalStyleName?: string;
  };

  if (!body.fingerprint || !body.tweakText?.trim()) {
    return NextResponse.json(
      { error: "fingerprint and tweakText are required" },
      { status: 400 },
    );
  }

  const { fingerprint, tweakText, originalStyleName } = body;

  // ── Step 1: ask Claude for dimension adjustments ──────────────────────────
  const adjustments: Partial<Record<DimensionKey, number>> = {};
  try {
    const adjustRes = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: `You are an interior design style interpreter.
The user wants to subtly adjust their style.
Given their request, output ONLY a JSON object of dimension adjustments.

IMPORTANT RULES:
- Use small adjustments: -0.15 to +0.15 for vague requests like 'less X' or 'more Y'
- Use medium adjustments: -0.25 to +0.25 for clear requests like 'much darker' or 'very minimal'
- Use large adjustments: -0.35 to +0.35 ONLY for extreme requests like 'completely different' or 'totally transform'
- Never use the maximum -0.4/+0.4 unless the user explicitly asks for a complete transformation
- Only include dimensions that should change
- No other text, just the JSON object

Dimensions (0=low, 1=high):
colorTemperature: warm amber(1) vs cool grey(0)
colorSaturation: bold saturated(1) vs muted neutral(0)
density: densely layered(1) vs spare minimal(0)
formality: formal elegant(1) vs casual relaxed(0)
era: traditional heritage(1) vs ultra modern(0)
material: natural organic(1) vs manufactured(0)
texture: tactile rough(1) vs sleek smooth(0)
pattern: patterned(1) vs plain(0)
lineQuality: organic curved(1) vs geometric(0)
lightPreference: bright airy(1) vs dark moody(0)
nature: plants biophilic(1) vs urban no plants(0)
culturalInfluence: global eclectic(1) vs minimal(0)`,
      messages: [{ role: "user", content: tweakText }],
    });

    const rawText =
      adjustRes.content[0]?.type === "text" ? adjustRes.content[0].text.trim() : "{}";

    // Strip any accidental markdown fences
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;

    for (const key of DIMENSION_KEYS) {
      const val = parsed[key];
      if (typeof val === "number" && isFinite(val)) {
        adjustments[key] = Math.max(-0.4, Math.min(0.4, val));
      }
    }
  } catch (err) {
    console.warn("[quiz/tweak] Claude adjustment call failed:", err);
    // Fall through with empty adjustments — will still return current best match
  }

  // ── Step 2: apply adjustments, clamp to [0, 1] ───────────────────────────
  const oldDims = fingerprint.dimensions;
  const newDims = { ...oldDims };
  for (const key of DIMENSION_KEYS) {
    const delta = adjustments[key] ?? 0;
    newDims[key] = clamp01((oldDims[key] ?? 0.5) + delta);
  }

  const updatedFingerprint: StyleFingerprint = {
    ...fingerprint,
    dimensions: newDims,
  };

  // ── Step 3: softmax match → canonical style name ──────────────────────────
  const fpVector = DIMENSION_KEYS.map((k) => newDims[k] ?? 0.5);
  const { primaryStyle } = softmaxStyleMatch(fpVector);
  const newStyleName = toDisplayName(primaryStyle.name);

  // ── Step 3b: style name stability — keep original name for small tweaks ───
  // For hybrids like "Biophilic · Japandi", check similarity to ALL component
  // styles. Keep the original name if the fingerprint is still close to ANY of
  // the original styles (cosine sim >= 0.25).
  let styleName = newStyleName;
  if (originalStyleName) {
    // Parse all style names from hybrid (e.g. "Biophilic · Japandi" → ["Biophilic", "Japandi"])
    const originalStyleParts = originalStyleName
      .split(" · ")
      .map((s) => s.trim());

    // Find style centers for all parts
    const originalStyleDefs = originalStyleParts
      .map((displayName) => {
        const internalName = DISPLAY_TO_INTERNAL[displayName];
        return internalName
          ? STYLES.find((s) => s.name === internalName)
          : undefined;
      })
      .filter(Boolean);

    if (originalStyleDefs.length > 0) {
      // Keep name if fingerprint is still similar to ANY of the original styles
      const maxSim = Math.max(
        ...originalStyleDefs.map((styleDef) =>
          cosineSim(fpVector, styleDef!.center)
        )
      );
      if (maxSim >= 0.25) {
        // Still close enough to at least one original style — preserve the name
        styleName = originalStyleName;
      }
      // else: fingerprint moved significantly from all original styles, use the new match
    }
  }

  // ── Step 4: generate description; derive tags deterministically ─────────────
  const dimSummary = DIMENSION_KEYS.map(
    (k) => `${k}: ${(newDims[k] ?? 0.5).toFixed(2)}`,
  ).join(", ");

  let styleDescription =
    "Your style has evolved with a fresh perspective, blending new nuances into a cohesive aesthetic.";
  // Tags derived deterministically from adjusted dimensions — no second Claude call
  const styleTags: string[] = deriveTraitTags(newDims as Record<string, number>);

  try {
    const descRes = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: `Interior design style fingerprint (dimensions 0-1): ${dimSummary}

Write exactly 2-3 sentences describing this style in evocative, sensory language — materials, light, mood, palette. No jargon. Do not name any specific style (no Japandi, Bohemian, Coastal, Mid-Century, Minimalist, Industrial, Scandinavian, or any other style label). Start directly with the description.`,
        },
      ],
    });

    const rawDesc =
      descRes.content[0]?.type === "text" ? descRes.content[0].text.trim() : "";

    if (rawDesc) {
      styleDescription = rawDesc;
    }
  } catch (err) {
    console.warn("[quiz/tweak] Claude description call failed:", err);
  }

  return NextResponse.json({
    updatedFingerprint,
    styleName,
    styleDescription,
    styleTags,
  });
}
