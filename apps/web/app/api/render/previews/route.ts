import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildFluxPrompt, submitSchnellRender } from "@/lib/ai/flux";
import type { RenderContext } from "@/lib/types/area2";
import type { StyleFingerprint } from "@/types/fingerprint";

type DimKey = keyof StyleFingerprint["dimensions"];

interface PreviewVariant {
  dimKey: DimKey;
  nudge: number;
  label: string;
}

const VARIANTS: PreviewVariant[] = [
  { dimKey: "colorTemperature", nudge: 0.15, label: "Warmer Tones" },
  { dimKey: "nature", nudge: 0.15, label: "More Organic" },
  { dimKey: "density", nudge: 0.15, label: "Richer & Fuller" },
];

function clamp(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function nudgeFingerprint(
  fp: StyleFingerprint,
  dimKey: DimKey,
  nudge: number,
): StyleFingerprint {
  return {
    ...fp,
    dimensions: {
      ...fp.dimensions,
      [dimKey]: clamp(fp.dimensions[dimKey] + nudge),
    },
  };
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { room_id?: string };
    const { room_id } = body;
    if (!room_id) {
      return NextResponse.json({ error: "room_id required" }, { status: 400 });
    }

    // Load the room's assembled render context
    const { data: row } = await supabase
      .from("rooms")
      .select("render_context")
      .eq("id", room_id)
      .eq("user_id", user.id)
      .single();

    const ctx = (row?.render_context ?? null) as RenderContext | null;
    if (!ctx) {
      return NextResponse.json(
        { error: "No render context found" },
        { status: 404 },
      );
    }

    const baseFingerprint = ctx.fingerprint;
    if (!baseFingerprint) {
      return NextResponse.json(
        { error: "No style fingerprint in context" },
        { status: 422 },
      );
    }

    // Build and submit 3 Schnell preview renders in parallel
    const results = await Promise.all(
      VARIANTS.map(async ({ dimKey, nudge, label }) => {
        const nudgedFp = nudgeFingerprint(baseFingerprint, dimKey, nudge);
        const rangeMax = ctx.budget?.rangeMax ?? 5000;
        const budgetTier =
          rangeMax < 2000
            ? "budget"
            : rangeMax < 8000
              ? "mid"
              : rangeMax < 20000
                ? "premium"
                : "luxury";
        const prompt = buildFluxPrompt({
          fingerprint: nudgedFp,
          roomType: "living room",
          budgetTier: budgetTier as "budget" | "mid" | "premium" | "luxury",
          inclusions: [],
          constraints: [],
          keptItemLabels: [],
          roomAnalysis: null,
          quizPreviewMode: true,
        });
        const prediction_id = await submitSchnellRender(prompt);
        return {
          prediction_id,
          label,
          prompt_variant: { dimKey: dimKey as string, nudge },
        };
      }),
    );

    return NextResponse.json({ previews: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
