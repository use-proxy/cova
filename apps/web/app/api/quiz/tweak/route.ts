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
import { softmaxStyleMatch } from "@/lib/ai/style-match";
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
  };

  if (!body.fingerprint || !body.tweakText?.trim()) {
    return NextResponse.json(
      { error: "fingerprint and tweakText are required" },
      { status: 400 },
    );
  }

  const { fingerprint, tweakText } = body;

  // ── Step 1: ask Claude for dimension adjustments ──────────────────────────
  let adjustments: Partial<Record<DimensionKey, number>> = {};
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
  const styleName = toDisplayName(primaryStyle.name);

  // ── Step 4: generate description + tags ───────────────────────────────────
  const dimSummary = DIMENSION_KEYS.map(
    (k) => `${k}: ${(newDims[k] ?? 0.5).toFixed(2)}`,
  ).join(", ");

  let styleDescription =
    "Your style has evolved with a fresh perspective, blending new nuances into a cohesive aesthetic.";
  let styleTags: string[] = ["Evolved Taste", "Personal Touch", "Refined Balance"];

  try {
    const descRes = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `Interior design style fingerprint (dimensions 0-1): ${dimSummary}

Write exactly 2-3 sentences describing this style in evocative, sensory language — materials, light, mood, palette. No jargon. Do not name any specific style (no Japandi, Bohemian, Coastal, Mid-Century, Minimalist, Industrial, Scandinavian, or any other style label). Start directly with the description.

Then on a new line write exactly 3 short descriptive trait tags (2-3 words each), comma-separated. No bullet points, no labels.`,
        },
      ],
    });

    const rawDesc =
      descRes.content[0]?.type === "text" ? descRes.content[0].text.trim() : "";

    if (rawDesc) {
      const lines = rawDesc.split("\n").filter((l) => l.trim());
      const lastLine = lines[lines.length - 1] ?? "";
      // Last line should be the comma-separated tags
      const tagCandidates = lastLine.split(",").map((t) => t.trim()).filter(Boolean);
      if (tagCandidates.length >= 2 && lastLine.includes(",")) {
        styleTags = tagCandidates.slice(0, 3);
        styleDescription = lines.slice(0, -1).join(" ").trim() || rawDesc;
      } else {
        styleDescription = rawDesc;
      }
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
