/**
 * POST /api/render/empty-room
 *
 * Cache-aware empty-room render. Routes users to V2 (existing prod) or V3
 * (Gemini) per the feature flag in lib/features.ts. This route only handles
 * the V3 path; V2 continues to be invoked from its existing call-site
 * (apps/web/app/api/render/route.ts pipeline) — do not touch V2.
 *
 * Cache: SHA-256 of (image_url || preprocessing_params_canonical || pipeline_version).
 * Miss → call Modal V3, store result, charge BASE_RENDER_TOKEN_COST.
 * Hit  → return cached URL, charge 0.
 */

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getRenderPipelineVersion } from "@/lib/features";
import { RENDER_CONFIG } from "@/lib/render-config";
import {
  getTokenBalance,
  chargeTokens,
  InsufficientTokensError,
} from "@/lib/tokens";
import { callEmptyRoomV3 } from "@/lib/render/empty-room-v3";
import { normalizeInputImage } from "@/lib/render/normalize-input-image";

interface EmptyRoomRequestBody {
  image_url: string;
  render_id: string; // used for cost-log attribution
  /**
   * Optional canonical preprocessing descriptor. Anything that affects the
   * output pixels (resize target, color corrections, crop) MUST be included
   * here so cache keys are stable across equivalent inputs.
   */
  preprocessing_params?: Record<string, unknown>;
}

function hashInput(
  imageUrl: string,
  params: Record<string, unknown> | undefined,
  pipelineVersion: string,
): string {
  // Canonicalize params: sort keys, JSON-stringify.
  const canonical = params
    ? JSON.stringify(params, Object.keys(params).sort())
    : "";
  const h = crypto.createHash("sha256");
  h.update(imageUrl);
  h.update("|");
  h.update(canonical);
  h.update("|");
  h.update(pipelineVersion);
  return h.digest("hex");
}

export async function POST(request: Request) {
  try {
    const userClient = await createServerSupabaseClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as EmptyRoomRequestBody;
    const { image_url, render_id, preprocessing_params } = body ?? {};
    if (!image_url || !render_id) {
      return NextResponse.json(
        { error: "image_url and render_id are required" },
        { status: 400 },
      );
    }

    const pipelineVersion = getRenderPipelineVersion(user.id);
    if (pipelineVersion !== "v3") {
      // V2 path is handled by the existing render pipeline at /api/render.
      // Return 409 so the caller knows to route to V2 — do not attempt to
      // proxy V2 through this new file.
      return NextResponse.json(
        {
          error: "This route serves V3 only; user is routed to V2",
          code: "pipeline_mismatch",
          pipeline_version: "v2",
        },
        { status: 409 },
      );
    }

    const admin = createAdminSupabaseClient();
    const inputHash = hashInput(image_url, preprocessing_params, RENDER_CONFIG.CACHE_PIPELINE_VERSION);

    // 1. Cache lookup
    const { data: cached } = await admin
      .from("empty_room_cache")
      .select(
        "empty_room_url, quality_warning, residual_items, pipeline_path, expires_at",
      )
      .eq("input_hash", inputHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached) {
      const cachedRow = cached as {
        empty_room_url: string;
        quality_warning: boolean;
        residual_items: string[];
        pipeline_path: string;
      };

      await admin.from("render_cost_log").insert({
        render_id,
        user_id: user.id,
        pipeline_version: RENDER_CONFIG.CACHE_PIPELINE_VERSION,
        is_retry: false,
        retry_type: null,
        cost_usd: 0,
        tokens_charged: 0,
        cache_hit: true,
      });

      return NextResponse.json({
        empty_room_url: cachedRow.empty_room_url,
        quality_warning: cachedRow.quality_warning,
        residual_items: cachedRow.residual_items ?? [],
        pipeline_path: cachedRow.pipeline_path,
        cache_hit: true,
        tokens_charged: 0,
      });
    }

    // 2. Miss — charge base tokens pre-flight
    const balance = await getTokenBalance(user.id);
    if (balance < RENDER_CONFIG.BASE_RENDER_TOKEN_COST) {
      return NextResponse.json(
        {
          error: "Insufficient tokens",
          code: "insufficient_tokens",
          balance,
          required: RENDER_CONFIG.BASE_RENDER_TOKEN_COST,
        },
        { status: 402 },
      );
    }

    // 3. Normalize input (resize ≤1536 px, JPEG q=85, re-upload to fal CDN).
    //    Claude Vision rejects base64 payloads over 5 MB, so phone photos
    //    must be shrunk before Modal calls the audit / pre-pass / router.
    let modalImageUrl: string;
    try {
      const normalized = await normalizeInputImage(image_url);
      modalImageUrl = normalized.url;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown";
      return NextResponse.json(
        { error: `input normalization failed: ${message}` },
        { status: 502 },
      );
    }

    // 4. Call Modal V3 with the normalized URL
    let v3;
    try {
      v3 = await callEmptyRoomV3({ imageUrl: modalImageUrl, skipCache: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown";
      return NextResponse.json(
        { error: `V3 pipeline failed: ${message}` },
        { status: 502 },
      );
    }

    // 4. Charge tokens post-success
    try {
      await chargeTokens(
        user.id,
        RENDER_CONFIG.BASE_RENDER_TOKEN_COST,
        `empty_room_render:${render_id}`,
      );
    } catch (err) {
      if (err instanceof InsufficientTokensError) {
        // Raced — should be rare given pre-flight check.
        return NextResponse.json(
          {
            error: "Insufficient tokens",
            code: "insufficient_tokens",
            balance: err.balance,
            required: err.required,
          },
          { status: 402 },
        );
      }
      throw err;
    }

    // 5. Store in cache (ignore conflicts — another concurrent call may have written)
    await admin.from("empty_room_cache").upsert(
      {
        input_hash: inputHash,
        empty_room_url: v3.empty_room_url,
        quality_warning: v3.quality_warning,
        residual_items: v3.residual_items ?? [],
        pipeline_path: v3.pipeline_path,
        pipeline_version: RENDER_CONFIG.CACHE_PIPELINE_VERSION,
        cost_usd: v3.cost_usd,
      },
      { onConflict: "input_hash" },
    );

    // 6. Cost log
    await admin.from("render_cost_log").insert({
      render_id,
      user_id: user.id,
      pipeline_version: RENDER_CONFIG.CACHE_PIPELINE_VERSION,
      is_retry: false,
      retry_type: null,
      cost_usd: v3.cost_usd,
      tokens_charged: RENDER_CONFIG.BASE_RENDER_TOKEN_COST,
      cache_hit: false,
    });

    return NextResponse.json({
      empty_room_url: v3.empty_room_url,
      quality_warning: v3.quality_warning,
      residual_items: v3.residual_items,
      pipeline_path: v3.pipeline_path,
      cache_hit: false,
      tokens_charged: RENDER_CONFIG.BASE_RENDER_TOKEN_COST,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
