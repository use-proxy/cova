import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StyleFingerprint } from "@/types/fingerprint";

interface MatchedProductSummary {
  id: string;
  name: string;
  retailer: string;
  price: number;
  affiliate_url: string;
  image_url: string;
  match_score: number;
  match_label: "Perfect Match" | "Very Similar" | "Inspired By";
  is_sale?: boolean;
  rating?: number | null;
  rating_count?: number | null;
}

interface CoherenceRequestBody {
  productsByItem: Record<string, MatchedProductSummary[]>;
  styleName: string;
  fingerprint: StyleFingerprint;
  roomType: string;
  keptItemLabels: string[];
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as CoherenceRequestBody;

    // Need at least 2 items to evaluate coherence
    const itemIds = Object.keys(body.productsByItem);
    if (itemIds.length < 2) {
      return NextResponse.json({
        productsByItem: body.productsByItem,
        coherenceScore: 8,
        wasAdjusted: false,
        adjustmentReason: null,
      });
    }

    // Build summary of top recommendation per item
    const topRecommendations = itemIds
      .filter((id) => (body.productsByItem[id]?.length ?? 0) > 0)
      .map((id) => ({
        itemId: id,
        name: body.productsByItem[id]![0]!.name,
        retailer: body.productsByItem[id]![0]!.retailer,
        alternativesAvailable: (body.productsByItem[id]?.length ?? 0) > 1,
      }));

    const anthropic = new Anthropic();

    const keptContext =
      body.keptItemLabels.length > 0
        ? `\nExisting furniture the user is keeping: ${body.keptItemLabels.join(", ")}.
New recommendations must complement these pieces.`
        : "";

    const coherencePrompt = `You are an expert interior designer evaluating product selection coherence.

Style: ${body.styleName || "Modern"}
Room: ${body.roomType}${keptContext}

Top product recommendation per detected item:
${topRecommendations.map((r) => `- ${r.itemId}: "${r.name}" from ${r.retailer}`).join("\n")}

Evaluate whether these products together form a coherent, designed room — not a random collection.
Consider: do they share a consistent style direction, material palette, and era?
Do they complement any existing furniture being kept?

Return ONLY valid JSON, no other text:
{
  "coherenceScore": <integer 0-10>,
  "isCoherent": <boolean, true if score >= 7>,
  "outlierItemId": <string id of the one item that least fits, or null if coherent>,
  "outlierReason": <one sentence explanation, or null>,
  "suggestion": <one sentence on what style the replacement should be, or null>
}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: coherencePrompt }],
    });

    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "{}";

    let coherenceResult: {
      coherenceScore: number;
      isCoherent: boolean;
      outlierItemId: string | null;
      outlierReason: string | null;
      suggestion: string | null;
    };

    try {
      coherenceResult = JSON.parse(
        responseText.replace(/```json|```/g, "").trim(),
      );
    } catch {
      // Parse failed — assume coherent, return unchanged
      return NextResponse.json({
        productsByItem: body.productsByItem,
        coherenceScore: 7,
        wasAdjusted: false,
        adjustmentReason: null,
      });
    }

    // If coherent or no outlier identified, return unchanged
    if (coherenceResult.isCoherent || !coherenceResult.outlierItemId) {
      return NextResponse.json({
        productsByItem: body.productsByItem,
        coherenceScore: coherenceResult.coherenceScore,
        wasAdjusted: false,
        adjustmentReason: null,
      });
    }

    // Swap outlier: promote second recommendation, demote first
    const outlierItemId = coherenceResult.outlierItemId;
    const alternatives = body.productsByItem[outlierItemId];
    let adjustedProductsByItem = { ...body.productsByItem };
    let wasAdjusted = false;

    if (alternatives && alternatives.length > 1) {
      adjustedProductsByItem = {
        ...body.productsByItem,
        [outlierItemId]: [
          alternatives[1]!,
          ...alternatives.slice(2),
          alternatives[0]!,
        ],
      };
      wasAdjusted = true;
    }

    return NextResponse.json({
      productsByItem: adjustedProductsByItem,
      coherenceScore: coherenceResult.coherenceScore,
      wasAdjusted,
      adjustmentReason: coherenceResult.outlierReason,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
