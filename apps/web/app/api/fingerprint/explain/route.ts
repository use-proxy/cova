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

  // Build a readable summary of the dimensions
  const summary = Object.entries(dimensions)
    .map(([key, value]) => `${key}: ${value.toFixed(2)}`)
    .join(", ");

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: `Given this interior design style fingerprint with scores 0-1: ${summary}

Write exactly 2-3 sentences explaining in plain English what this means for how the person's room will look. Focus on materials, colors, and mood. No jargon. Do not use any specific style names like Japandi, Bohemian, Coastal, Mid-Century Modern, or Minimalist — describe the feel and materials instead.`,
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
