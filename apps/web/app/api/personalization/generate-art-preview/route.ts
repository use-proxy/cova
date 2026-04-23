import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const maxDuration = 60;

interface GenerateBody {
  description?: string;
  style_context?: string;
  layout?: "single" | "pair" | "triptych" | "gallery" | "salon";
}

interface FalImageResponse {
  images?: Array<{ url?: string } | string>;
}

async function callSchnell(
  prompt: string,
  seed: number,
): Promise<string | null> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        image_size: { width: 512, height: 682 },
        num_inference_steps: 4,
        num_images: 1,
        seed,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as FalImageResponse;
    const first = data.images?.[0];
    if (!first) return null;
    if (typeof first === "string") return first;
    return first.url ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as GenerateBody;
  if (!body.description?.trim()) {
    return NextResponse.json(
      { error: "description required" },
      { status: 400 },
    );
  }
  const styleContext = body.style_context?.trim() ?? "";
  const basePrompt = `${body.description.trim()}, ${styleContext}, fine art print, gallery quality, portrait orientation, framed`;

  const seeds = [17, 42, 101, 7];
  const results = await Promise.all(seeds.map((s) => callSchnell(basePrompt, s)));

  const previews = results
    .map((url, idx) => {
      if (!url) return null;
      return {
        id: `art-preview-${idx}-${seeds[idx]}`,
        url,
        approved: false,
      };
    })
    .filter((p): p is { id: string; url: string; approved: boolean } =>
      p !== null,
    );

  if (previews.length === 0) {
    return NextResponse.json(
      { error: "All preview generations failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({ previews });
}
