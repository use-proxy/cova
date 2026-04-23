import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const maxDuration = 90;

interface LightingBody {
  empty_room_url?: string;
  style?: string;
}

interface LightingPresetConfig {
  name: "bright_natural" | "warm_cozy" | "dramatic_moody";
  prompt: string;
  latent: "Left" | "Right";
  lowres: number;
  highres: number;
}

const PRESETS: LightingPresetConfig[] = [
  {
    name: "bright_natural",
    prompt: "bright natural daylight, soft diffused, airy and crisp",
    latent: "Left",
    lowres: 0.88,
    highres: 0.45,
  },
  {
    name: "warm_cozy",
    prompt: "warm interior evening lighting, amber glow, lamp pools, cozy",
    latent: "Right",
    lowres: 0.88,
    highres: 0.45,
  },
  {
    name: "dramatic_moody",
    prompt: "dramatic single-source lighting, strong chiaroscuro, moody",
    latent: "Left",
    lowres: 0.9,
    highres: 0.5,
  },
];

interface FalResp {
  images?: Array<{ url?: string } | string>;
}

async function callIcLight(
  imageUrl: string,
  preset: LightingPresetConfig,
): Promise<string | null> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://fal.run/fal-ai/iclight-v2", {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        prompt: preset.prompt,
        initial_latent: preset.latent,
        lowres_denoise: preset.lowres,
        highres_denoise: preset.highres,
        guidance_scale: 5,
        num_inference_steps: 28,
        num_images: 1,
        output_format: "jpeg",
      }),
      signal: AbortSignal.timeout(75_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as FalResp;
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

  const body = (await request.json()) as LightingBody;
  if (!body.empty_room_url) {
    return NextResponse.json(
      { error: "empty_room_url required" },
      { status: 400 },
    );
  }

  const results = await Promise.all(
    PRESETS.map((p) => callIcLight(body.empty_room_url!, p)),
  );

  const previews = PRESETS.map((p, idx) => ({
    name: p.name,
    url: results[idx],
  })).filter(
    (p): p is { name: LightingPresetConfig["name"]; url: string } =>
      typeof p.url === "string",
  );

  if (previews.length === 0) {
    return NextResponse.json(
      { error: "All lighting previews failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({ previews });
}
