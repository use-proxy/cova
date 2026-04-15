/**
 * POST /api/fingerprint/explain
 *
 * Generates a plain-English explanation of what a style fingerprint means
 * for the user's room render. Uses Claude Haiku for speed and cost.
 *
 * Input: { dimensions: Record<string, number> }
 * Output: { explanation: string }
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { dimensions } = (await request.json()) as {
    dimensions?: Record<string, number>;
  };

  if (!dimensions || typeof dimensions !== "object") {
    return NextResponse.json({ error: "dimensions required" }, { status: 400 });
  }

  // Build a human-readable V2 summary instead of raw key names
  // V2 slot order in dimensions object: colorTemperature=warmth, colorSaturation=complexity,
  // formality=organicness, density=density, era=traditionalism, material=character
  const v2Labels: Array<[string, string, string]> = [
    ["colorTemperature", "cool tones",        "warm tones"],
    ["colorSaturation",  "visually simple",   "bold and complex"],
    ["formality",        "manufactured feel", "natural and organic"],
    ["density",          "clean and sparse",  "richly layered"],
    ["era",              "ultra-modern",      "heritage and traditional"],
    ["material",         "sleek and generic", "crafted and distinctive"],
  ];
  const summary = v2Labels
    .map(([key, lo, hi]) => {
      const val = dimensions[key] ?? 0.5;
      if (val < 0.35) return lo;
      if (val > 0.65) return hi;
      return null;
    })
    .filter(Boolean)
    .join(", ") || "balanced across all dimensions";

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: `This person's interior design style is: ${summary}.

Write exactly 2-3 sentences describing how their room will look and feel. Be specific about materials, colors, and atmosphere. Do not name any design styles. Do not start with a header or preamble — begin directly with the description.`,
        },
      ],
    });

    const explanation =
      response.content[0]?.type === "text"
        ? response.content[0].text.trim()
        : "";

    return NextResponse.json({ explanation });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[fingerprint/explain] Claude failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
