/**
 * POST /api/generate-art
 *
 * Fires 4 FLUX Schnell requests in parallel with prompt variations
 * around a single visual direction. Returns an array of 4 image URLs
 * for inline display on Screen D's art tab.
 *
 * Auth: requires an authenticated Supabase session (same as /api/design-chat).
 * We do NOT block the response on FLUX — Replicate returns the URLs in the
 * predict output directly when calling .run().
 */

import { NextResponse } from "next/server";
import Replicate from "replicate";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const MODEL = "black-forest-labs/flux-schnell";

interface Body {
  visualDirection: string;
  roomId: string;
}

// Four prompt variants — keep the direction, vary composition/color emphasis.
function buildVariants(base: string): string[] {
  return [
    `${base}, centered composition, balanced, fine detail, gallery-quality wall art`,
    `${base}, asymmetric composition, dynamic negative space, fine detail, gallery-quality wall art`,
    `${base}, emphasis on warmth and saturation, fine detail, gallery-quality wall art`,
    `${base}, emphasis on cool tones and contrast, fine detail, gallery-quality wall art`,
  ];
}

async function fluxOne(prompt: string): Promise<string | null> {
  try {
    const output = (await replicate.run(MODEL, {
      input: {
        prompt,
        num_outputs: 1,
        aspect_ratio: "4:5",
        output_format: "png",
        output_quality: 90,
      },
    })) as unknown;

    // replicate.run returns either a URL string, string[], or ReadableStream[].
    if (typeof output === "string") return output;
    if (Array.isArray(output)) {
      const first = output[0];
      if (typeof first === "string") return first;
      if (first && typeof (first as { url?: unknown }).url === "function") {
        const urlFn = (first as { url: () => URL | string }).url;
        const maybeUrl = urlFn();
        return typeof maybeUrl === "string"
          ? maybeUrl
          : (maybeUrl as URL).toString();
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("roomId");
  if (!roomId) return NextResponse.json({ status: "error" });

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("rooms")
    .select("personalization")
    .eq("id", roomId)
    .eq("user_id", user.id)
    .single();

  const urls =
    ((data?.personalization as Record<string, unknown> | null)
      ?.artGeneratedUrls as string[]) ?? [];
  return NextResponse.json({
    status: urls.length > 0 ? "complete" : "pending",
    urls,
  });
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { visualDirection, roomId } = (await req.json()) as Body;
  if (!visualDirection || !roomId) {
    return NextResponse.json(
      { error: "visualDirection and roomId required" },
      { status: 400 },
    );
  }

  const prompts = buildVariants(visualDirection);
  const results = await Promise.all(prompts.map(fluxOne));
  const urls = results.filter((u): u is string => typeof u === "string");

  // Persist URLs so the GET (status) handler can return them.
  if (urls.length > 0) {
    const { data: roomData } = await supabase
      .from("rooms")
      .select("personalization")
      .eq("id", roomId)
      .eq("user_id", user.id)
      .single();
    const existing = (roomData?.personalization ?? {}) as Record<
      string,
      unknown
    >;
    await supabase
      .from("rooms")
      .update({
        personalization: {
          ...existing,
          artGeneratedUrls: urls,
        },
      })
      .eq("id", roomId)
      .eq("user_id", user.id);
  }

  return NextResponse.json({
    urls,
    roomId,
    visualDirection,
    count: urls.length,
  });
}
