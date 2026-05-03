/**
 * Client helper for calling the cova-empty-room-v3 Modal endpoint.
 *
 * Kept out of the API route file so both the /api/render/empty-room route
 * and the /api/render/retry route can share a single typed call-site.
 */
import { TIMEOUTS } from "@/lib/config/timeouts";

export interface EmptyRoomV3Response {
  empty_room_url: string;
  quality_warning: boolean;
  residual_items: string[];
  pipeline_path: "standard" | "anti_hallucination";
  cost_usd: number;
  cache_hit: boolean;
  occlusion_reason?: string;
  retry_used?: boolean;
  score_before_retry?: number | null;
  score_final?: number;
}

export interface EmptyRoomV3Params {
  imageUrl: string;
  seed?: number;
  skipCache?: boolean;
}

export async function callEmptyRoomV3(
  params: EmptyRoomV3Params,
): Promise<EmptyRoomV3Response> {
  const base = process.env.COVA_EMPTY_ROOM_V3_URL;
  if (!base) {
    throw new Error("COVA_EMPTY_ROOM_V3_URL is not configured");
  }

  const res = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: params.imageUrl,
      seed: params.seed,
      skip_cache: params.skipCache ?? false,
    }),
    // Gemini + audits can take ~45s; allow headroom.
    signal: AbortSignal.timeout(TIMEOUTS.MODAL_APP),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`empty-room-v3 http ${res.status}: ${text.slice(0, 200)}`);
  }

  const body = (await res.json()) as EmptyRoomV3Response & { error?: string };
  if (body.error) {
    throw new Error(`empty-room-v3: ${body.error}`);
  }
  return body;
}
