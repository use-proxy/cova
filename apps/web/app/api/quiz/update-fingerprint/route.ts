import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { softmaxStyleMatch } from "@/lib/ai/style-match";
import { toDisplayName } from "@/lib/ai/anchor-display";

// ── /api/quiz/update-fingerprint ─────────────────────────────────────────────
// Progressive fingerprint update from rating signals (thumbs up/down on a render).
// Moves the user's stored fingerprint toward (up) or away from (down) the
// rendered style's V2 vector with an alpha that decays as more interactions
// accumulate. Recomputes style_blend after each update so downstream renders
// reflect the new preferences immediately.

interface UpdateRequest {
  user_id: string;
  rating: "up" | "down";
  render_style_vector: number[]; // 6-dim V2 vector
}

// V2 dim slot order in legacy 12-dim storage:
// 0 warmth        → colorTemperature
// 1 visual_complex→ colorSaturation
// 2 organicness   → formality
// 3 density       → density
// 4 traditionalism→ era
// 5 character     → material
const V2_SLOT_KEYS = [
  "colorTemperature",
  "colorSaturation",
  "formality",
  "density",
  "era",
  "material",
] as const;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function extractV2(dimensions: Record<string, number>): number[] {
  return V2_SLOT_KEYS.map((k) => dimensions[k] ?? 0.5);
}

export async function POST(request: Request) {
  try {
    // Auth check: verify the caller is the user they claim to be
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as UpdateRequest;
    const { user_id, rating, render_style_vector } = body;

    // Ensure the authenticated user matches the requested user_id
    if (user_id !== user.id) {
      return NextResponse.json(
        { error: "Forbidden: user_id does not match authenticated user" },
        { status: 403 },
      );
    }

    if (!user_id || (rating !== "up" && rating !== "down")) {
      return NextResponse.json(
        { error: "user_id and rating ('up'|'down') required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(render_style_vector) || render_style_vector.length !== 6) {
      return NextResponse.json(
        { error: "render_style_vector must be a 6-element array" },
        { status: 400 },
      );
    }

    const admin = createAdminSupabaseClient();

    // 1. Fetch the most recent stored fingerprint for this user
    const { data: latest, error: fetchErr } = await (admin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("style_fingerprints") as any)
      .select("id, dimensions, covariance, confidence")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) {
      console.error("[update-fingerprint] fetch error:", fetchErr);
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!latest) {
      return NextResponse.json(
        { error: "no fingerprint found for user" },
        { status: 404 },
      );
    }

    // 2. Read interactions count from users
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: userRow } = await (admin.from("users") as any)
      .select("interactions_count")
      .eq("id", user_id)
      .maybeSingle();
    const interactionsCount = (userRow?.interactions_count as number | null) ?? 0;

    // 3. Decay alpha
    const alpha = Math.max(0.10, 0.25 * Math.pow(0.95, interactionsCount));

    // 4. Update v2 dims
    const currentV2 = extractV2(latest.dimensions as Record<string, number>);
    const newV2 = currentV2.map((oldDim, i) => {
      const renderDim = render_style_vector[i] ?? 0.5;
      if (rating === "up") {
        return clamp01((1 - alpha) * oldDim + alpha * renderDim);
      }
      // down — push away from render vector
      return clamp01(oldDim + alpha * (oldDim - renderDim));
    });

    // 5. Write back to style_fingerprints (preserve other dim slots if any)
    const newDimensions: Record<string, number> = {
      ...(latest.dimensions as Record<string, number>),
    };
    for (let i = 0; i < V2_SLOT_KEYS.length; i++) {
      newDimensions[V2_SLOT_KEYS[i]!] = newV2[i]!;
    }

    const { error: updateErr } = await (admin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("style_fingerprints") as any)
      .update({ dimensions: newDimensions })
      .eq("id", latest.id);
    if (updateErr) {
      console.error("[update-fingerprint] update error:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // 6. Recompute style_blend
    const matchResult = softmaxStyleMatch(newV2, "v2");
    const newStyleBlend: Record<string, number> = {};
    for (const m of matchResult.matches) {
      if (m.weight > 0.05) {
        newStyleBlend[toDisplayName(m.style.name)] = Math.round(m.weight * 100) / 100;
      }
    }
    const primaryStyleName = matchResult.isNeutral
      ? null
      : toDisplayName(matchResult.primaryStyle.name);
    const secondaryStyleName =
      matchResult.isNeutral || !matchResult.secondaryStyle
        ? null
        : toDisplayName(matchResult.secondaryStyle.name);
    const primaryWeight = matchResult.matches[0]?.weight ?? 0;
    const secondaryWeight = matchResult.matches[1]?.weight ?? 0;

    // 7. Update users.style_blend + interactions_count
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: userUpdErr } = await (admin.from("users") as any)
      .update({
        style_blend: newStyleBlend,
        interactions_count: interactionsCount + 1,
        primary_style: primaryStyleName,
        secondary_style: secondaryStyleName,
        primary_weight: primaryWeight,
        secondary_weight: secondaryWeight,
      })
      .eq("id", user_id);
    if (userUpdErr) {
      console.error("[update-fingerprint] users update error:", userUpdErr);
    }

    return NextResponse.json({
      success: true,
      new_fingerprint: newDimensions,
      new_style_blend: newStyleBlend,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[update-fingerprint] unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
