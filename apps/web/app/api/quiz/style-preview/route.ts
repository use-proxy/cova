/**
 * POST /api/quiz/style-preview
 *
 * Builds a style-blend prompt from the user's fingerprint + chosen blend and
 * submits a FLUX Kontext render against a neutral base room image. Returns
 * the prediction id immediately — the client polls /api/render/status
 * (showcase_mode=true) for the result.
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { submitRender, sanitizeForbiddenStyleNames } from "@/lib/ai/flux";
import { STYLE_DNA_BLOCKS } from "@/lib/ai/design-director";
import { STYLE_ANCHOR_TO_TRIGGER } from "@/lib/ai/lora-registry";
import type { StyleFingerprint } from "@/types/fingerprint";

export const maxDuration = 30;

const BASE_ROOM_URLS: Record<string, string> = {
  bedroom:
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/bedroom-stock-1.jpg",
  living_room:
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/living-room-stock-1.jpg",
  home_office:
    "https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/room-photos/home-office-stock.jpg",
};

interface PreviewBody {
  fingerprint?: StyleFingerprint;
  room_type?: string;
  style_blend?: Record<string, number>;
}

const KONTEXT_STYLE_DESCRIPTORS: Record<string, string> = {
  cvwmn: 'warm japandi aesthetic with white oak furniture and natural wood grain, cream and sand linen textiles, terracotta clay accents, brushed brass hardware, warm amber lighting, sheer linen curtains, woven jute rug, minimal clutter, organic forms, muted earthy palette of warm whites and honeys',
  cvscn: 'pure scandinavian minimalism with pale ash wood, white walls, natural wool textiles, muted stone grey accents, cool even daylight, simple clean-lined furniture, no ornamentation, negative space dominant, monochrome palette of whites greys and natural tones',
  cvind: 'urban industrial loft with exposed concrete walls, blackened steel frames, worn cognac leather, Edison filament bulbs, dark matte finishes, raw unfinished surfaces, pipe shelving, factory windows, palette of charcoal black warm grey and aged copper',
  cvlux: 'refined contemporary luxury with honed marble surfaces, aged unlacquered brass fixtures, silk and cashmere textiles, statement pendant lighting, deep jewel tone accents, rich layered materials, tailored upholstery, curated art, palette of ivory champagne and deep navy',
  cvcst: 'coastal bright interior with whitewashed oak, bleached linen, sea glass blues and sandy neutrals, rattan and wicker accents, abundant natural light, woven textiles, organic coastal forms, palette of white cream soft blue and warm sand',
  cvmax: 'maximalist eclectic interior with bold patterned textiles, jewel toned velvet, gallery wall of mixed art frames, global collected objects, layered rugs, abundant plants, rich colors of emerald teal burnt orange and cobalt blue, every surface curated',
  cvboh: 'bohemian layered interior with woven macrame wall hanging, embroidered cushions, jute and kilim rugs layered, terracotta pots with trailing plants, warm amber lantern light, natural raw materials, rich earthy palette of rust ochre olive and cream',
  cvmcm: 'retro mid-century modern with walnut tapered leg furniture, avocado and ochre palette, sunburst clock, organic curved forms, bold geometric patterns, teak credenza, statement arc floor lamp, warm incandescent lighting, period-authentic palette',
  cvdco: 'contemporary architectural interior with clean geometric forms, invisible hardware, floating shelves, architectural concrete or plaster, precise lines, restrained material palette of white grey and warm wood, curated single statement piece',
};

function resolveDNA(displayName: string): string | null {
  const fullTrigger = STYLE_ANCHOR_TO_TRIGGER[displayName];
  if (!fullTrigger) return null;
  const shortTrigger = fullTrigger.split(" ")[0];
  if (!shortTrigger) return null;
  return KONTEXT_STYLE_DESCRIPTORS[shortTrigger] ?? STYLE_DNA_BLOCKS[shortTrigger] ?? null;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PreviewBody;
  try {
    body = (await request.json()) as PreviewBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { room_type, style_blend } = body;
  if (!style_blend || Object.keys(style_blend).length === 0) {
    return NextResponse.json(
      { error: "style_blend is required" },
      { status: 400 },
    );
  }

  // Step 1: pick base room image URL
  const baseRoomUrl =
    BASE_ROOM_URLS[room_type ?? ""] ?? BASE_ROOM_URLS.living_room!;

  // Step 2: build style prompt from blend (top 2 styles)
  const sortedStyles = Object.entries(style_blend)
    .filter(([, w]) => typeof w === "number" && w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  const primary = sortedStyles[0];
  if (!primary) {
    return NextResponse.json(
      { error: "style_blend has no positive weights" },
      { status: 400 },
    );
  }

  const fallbackDNA =
    "Photorealistic interior with balanced natural materials, soft diffused light, and warm neutral palette.";
  const primaryDesc = resolveDNA(primary[0]) ?? fallbackDNA;
  const primaryWeight = primary[1];

  const secondary = sortedStyles[1];
  const secondaryDesc = secondary ? resolveDNA(secondary[0]) : null;
  const secondaryWeight = secondary?.[1] ?? 0;

  let prompt: string;
  if (secondary && secondaryWeight > 0.15 && secondaryDesc) {
    prompt = `Completely redesign and redecorate this room.
Replace all furniture, soft furnishings, colors, materials, and decorative elements.
Primary aesthetic (${Math.round(primaryWeight * 100)}%): ${primaryDesc}
Secondary influence (${Math.round(secondaryWeight * 100)}%): ${secondaryDesc}
Blend these aesthetics proportionally based on the percentages shown.
Preserve the exact room architecture: same walls, windows, ceiling height, and floor plan.
Result must look like a professional interior design magazine photograph.`;
  } else {
    prompt = `Completely redesign and redecorate this room.
Replace all furniture, soft furnishings, colors, materials, and decorative elements.
Style: ${primaryDesc}
Preserve the exact room architecture: same walls, windows, ceiling height, and floor plan.
Result must look like a professional interior design magazine photograph.`;
  }

  // Forbidden-name defense (CLAUDE.md Rule 8): scrub any bare forbidden
  // tokens from KONTEXT_STYLE_DESCRIPTORS / STYLE_DNA_BLOCKS fallback before
  // the prompt reaches fal.ai.
  prompt = sanitizeForbiddenStyleNames(prompt);

  // Step 3: submit render — return prediction id immediately, do not await output
  try {
    const predictionId = await submitRender(baseRoomUrl, [], prompt);
    return NextResponse.json({ prediction_id: predictionId });
  } catch (err) {
    console.error("[quiz/style-preview] submitRender failed:", err);
    return NextResponse.json(
      { error: "Failed to submit preview render" },
      { status: 500 },
    );
  }
}
