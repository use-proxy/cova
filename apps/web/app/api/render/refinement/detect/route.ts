import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const maxDuration = 30;

interface DetectBody {
  render_url?: string;
  tap_x?: number;
  tap_y?: number;
  render_width?: number;
  render_height?: number;
}

interface Sam3PointResp {
  masks?: Array<{
    url?: string;
    bbox?: [number, number, number, number];
    confidence?: number;
  }>;
  image?: { url?: string };
}

async function callSam3Point(
  imageUrl: string,
  pixelX: number,
  pixelY: number,
): Promise<Sam3PointResp | null> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://fal.run/fal-ai/sam-3/image", {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        point_prompts: [{ x: pixelX, y: pixelY, label: 1 }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Sam3PointResp;
  } catch {
    return null;
  }
}

async function claudeVisionLabel(
  imageUrl: string,
  tapX: number,
  tapY: number,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const imgFetch = await fetch(imageUrl);
    if (!imgFetch.ok) return null;
    const buf = Buffer.from(await imgFetch.arrayBuffer());
    const b64 = buf.toString("base64");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 40,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: b64,
                },
              },
              {
                type: "text",
                text: `The user tapped at normalized position (${tapX.toFixed(3)}, ${tapY.toFixed(3)}). What interior design object is at that location? 1-4 words only.`,
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      content?: Array<{ text?: string }>;
    };
    const text = data.content
      ?.map((c) => c.text ?? "")
      .join(" ")
      .trim();
    return text ? text.slice(0, 60) : null;
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

  const body = (await request.json()) as DetectBody;
  if (
    !body.render_url ||
    typeof body.tap_x !== "number" ||
    typeof body.tap_y !== "number" ||
    typeof body.render_width !== "number" ||
    typeof body.render_height !== "number"
  ) {
    return NextResponse.json(
      {
        error:
          "Required: render_url, tap_x (0-1), tap_y (0-1), render_width, render_height",
      },
      { status: 400 },
    );
  }
  const pixelX = Math.round(body.tap_x * body.render_width);
  const pixelY = Math.round(body.tap_y * body.render_height);

  const [samResp, label] = await Promise.all([
    callSam3Point(body.render_url, pixelX, pixelY),
    claudeVisionLabel(body.render_url, body.tap_x, body.tap_y),
  ]);

  const mask = samResp?.masks?.[0];
  if (!mask?.url) {
    return NextResponse.json(
      { error: "No object detected at tap location" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    object_label: label ?? "object",
    mask_url: mask.url,
    bbox: mask.bbox ?? null,
    confidence: mask.confidence ?? null,
    tap_pixel: { x: pixelX, y: pixelY },
  });
}
